// For cities that don't publish structured data, we read the agenda or
// minutes document itself (HTML or PDF) and have the model pull out each
// decision. This is slower and less certain than Legistar, and the UI says so.

import { z } from "zod";
import { chat, parseJson } from "../llm";
import { CATEGORIES, type Category, type Matter, type Meeting } from "../types";
import { classify, extractMoney } from "../heuristics";
import { hash, slugify } from "../util";
import type { FetchedDoc } from "../firecrawl";

const Extracted = z.object({
  meeting_body: z.string().max(80).nullable().optional(),
  meeting_date: z.string().max(20).nullable().optional(),
  items: z
    .array(
      z.object({
        title: z.string().min(4).max(240),
        plain: z.string().min(10).max(600),
        outcome: z.enum(["passed", "failed", "referred", "held", "withdrawn", "introduced", "discussed", "unknown"]),
        vote: z.string().max(60).nullable().optional(),
        category: z.enum(CATEGORIES as [Category, ...Category[]]),
        money_amount: z.number().nullable().optional(),
        money_kind: z.enum(["spend", "receive", "transfer", "budget", "unknown"]).nullable().optional(),
        who_it_affects: z.string().max(200).nullable().optional(),
        location: z.string().max(140).nullable().optional(),
        quote: z.string().max(400).nullable().optional(),
      }),
    )
    .max(40),
});

const SYSTEM = `You read city council agendas and minutes and list what was decided.
Only report items that are real actions or agenda business (ordinances, resolutions, contracts, appointments, hearings, budget items).
Skip roll call, pledge, approval of minutes, adjournment, public comment headers.
Never invent votes or dollar amounts. Respond with JSON only.`;

export function chunkText(text: string, size = 9000, overlap = 400): string[] {
  const clean = text.replace(/\n{3,}/g, "\n\n");
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + size);
    // prefer to cut at a paragraph boundary
    const nl = clean.lastIndexOf("\n\n", end);
    if (nl > i + size * 0.6) end = nl;
    chunks.push(clean.slice(i, end));
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return chunks;
}

export interface WebExtractResult {
  meeting: Meeting;
  matters: Matter[];
  chunks: number;
}

export async function extractFromDocument(
  doc: FetchedDoc,
  opts: {
    citySlug: string;
    cityName: string;
    onChunk?: (i: number, total: number, found: number) => void;
    onMatter?: (m: Matter) => void;
    signal?: AbortSignal;
    maxChunks?: number;
  },
): Promise<WebExtractResult> {
  const chunks = chunkText(doc.markdown).slice(0, opts.maxChunks ?? 12);
  const meetingId = `${opts.citySlug}-web-${hash(doc.url)}`;
  let body = "City Council";
  let date = "";
  const matters: Matter[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    const raw = await chat(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Document: ${doc.title}\nURL: ${doc.url}\nCity: ${opts.cityName}\nPart ${i + 1} of ${chunks.length}.\n\n${chunks[i]}\n\nReturn JSON: {"meeting_body": string|null, "meeting_date": "YYYY-MM-DD"|null, "items": [{"title","plain","outcome","vote","category","money_amount","money_kind","who_it_affects","location","quote"}]}.\n- "plain": 1–2 sentences in plain English.\n- "outcome": passed|failed|referred|held|withdrawn|introduced|discussed|unknown (what happened at THIS meeting).\n- "vote": like "7-2" or "unanimous" or null.\n- "category": one of ${CATEGORIES.join(", ")}.\n- "quote": the exact sentence from the document that supports the outcome, or null.`,
        },
      ],
      { json: true, maxTokens: 2200, temperature: 0.1, signal: opts.signal },
    );
    const parsed = Extracted.safeParse(parseJson(raw));
    if (!parsed.success) {
      opts.onChunk?.(i + 1, chunks.length, matters.length);
      continue;
    }
    if (parsed.data.meeting_body && body === "City Council") body = parsed.data.meeting_body;
    if (parsed.data.meeting_date && !date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.data.meeting_date)) date = parsed.data.meeting_date;
    for (const it of parsed.data.items) {
      const key = slugify(it.title).slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      const tally = parseVote(it.vote || "");
      const heuristicMoney = extractMoney(it.title, it.plain);
      const m: Matter = {
        id: `${meetingId}-${hash(key)}`,
        file: `${date || "undated"} · item ${matters.length + 1}`,
        type: guessType(it.title),
        title: it.title.trim(),
        plain: it.plain.trim(),
        whoItAffects: it.who_it_affects || undefined,
        category: it.category === "other" ? classify(it.title, undefined, it.plain) : it.category,
        tags: [],
        money:
          it.money_amount && it.money_amount > 0
            ? { amount: it.money_amount, kind: it.money_kind || "unknown" }
            : heuristicMoney || undefined,
        location: it.location ? { text: it.location } : undefined,
        sponsors: [],
        status: it.outcome,
        latestOutcome: it.outcome,
        decidedOn: date || undefined,
        actions: [
          {
            meetingId,
            date: date || "",
            body,
            action: it.vote ? `${labelOutcome(it.outcome)} (${it.vote})` : labelOutcome(it.outcome),
            outcome: it.outcome,
            votes: [],
            tally: tally || undefined,
          },
        ],
        sourceUrl: doc.url,
        textExcerpt: it.quote || undefined,
        enrichment: "llm",
      };
      matters.push(m);
      opts.onMatter?.(m);
    }
    opts.onChunk?.(i + 1, chunks.length, matters.length);
  }

  // Backfill the date on actions once we know it.
  for (const m of matters) {
    for (const a of m.actions) if (!a.date) a.date = date;
    if (!m.decidedOn) m.decidedOn = date || undefined;
    m.file = m.file.replace("undated", date || "undated");
  }

  const meeting: Meeting = {
    id: meetingId,
    body,
    date,
    sourceUrl: doc.url,
    matterIds: matters.map((m) => m.id),
    status: "Extracted",
  };
  return { meeting, matters, chunks: chunks.length };
}

function parseVote(v: string) {
  const m = v.match(/(\d+)\s*[-–to]+\s*(\d+)/);
  if (m) return { yes: Number(m[1]), no: Number(m[2]), abstain: 0, absent: 0 };
  return null;
}

function guessType(title: string) {
  const t = title.toLowerCase();
  if (t.startsWith("ordinance") || /\bordinance\b/.test(t)) return "Ordinance";
  if (t.startsWith("resolution") || /\bresolution\b/.test(t)) return "Resolution";
  if (/appoint/.test(t)) return "Appointment";
  if (/hearing/.test(t)) return "Public Hearing";
  if (/contract|agreement/.test(t)) return "Contract";
  return "Item";
}

function labelOutcome(o: string) {
  return { passed: "Approved", failed: "Failed", referred: "Referred", held: "Held", withdrawn: "Withdrawn", introduced: "Introduced", discussed: "Discussed", unknown: "Considered" }[o] || o;
}
