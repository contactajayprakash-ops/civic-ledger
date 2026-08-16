// Turns legalese into something a neighbor would actually read.
// Each matter goes to the model once; the answer is validated with zod so a
// flaky response never breaks a snapshot.

import { z } from "zod";
import { chat, parseJson, llmAvailable } from "./llm";
import { CATEGORIES, type Category, type Matter, type Meeting } from "./types";
import { formatMoney } from "./heuristics";
import { mapLimit } from "./util";

const MatterEnrichment = z.object({
  plain: z.string().min(10).max(700),
  who_it_affects: z.string().min(3).max(300),
  category: z.enum(CATEGORIES as [Category, ...Category[]]),
  tags: z.array(z.string().min(2).max(30)).max(6).default([]),
  money: z
    .object({
      amount: z.number().nonnegative(),
      kind: z.enum(["spend", "receive", "transfer", "budget", "unknown"]),
      recipient: z.string().max(120).optional().nullable(),
      note: z.string().max(160).optional().nullable(),
    })
    .nullable()
    .optional(),
  location: z.string().max(140).nullable().optional(),
});

const SYSTEM = `You explain local government decisions to residents who have never read an ordinance.
Write the way a good local reporter would: plain, concrete, specific. Name the who, what, where and how much.
Do not pad. Never write sentences like "No money is involved" or "No details are given" — just leave those things out.
Never invent facts: if the text does not say something, leave it out.
Respond with JSON only.`;

function matterPrompt(m: Matter, cityName: string) {
  const votes = m.actions
    .map((a) => `${a.date} ${a.body}: ${a.action}${a.tally ? ` (yes ${a.tally.yes}, no ${a.tally.no})` : ""}`)
    .join("\n");
  return `City: ${cityName}
File: ${m.file} (${m.type}) — status: ${m.status}
Sponsors: ${m.sponsors.join(", ") || "none listed"}
Actions taken:
${votes || "none"}

Official title:
${m.title}

Legislative text (may be truncated):
${(m.textExcerpt || "(no text available)").slice(0, 1600)}

Return JSON with these keys:
- "plain": 1–3 sentences a resident would understand: what this does, for whom, where, and how much money if any. Lead with the concrete action ("Pittsburgh will pay…", "Renters on the North Side…"), not "This resolution".
- "who_it_affects": one short phrase (e.g. "renters in District 3", "everyone who drives on Penn Ave", "city employees").
- "category": one of ${CATEGORIES.join(", ")}.
- "tags": up to 5 short lowercase tags that are specific to this item: neighborhoods, streets, programs, agencies, vendors. Never the city name or "city council".
- "money": null if no dollar figure, otherwise {"amount": number in USD, "kind": "spend"|"receive"|"transfer"|"budget"|"unknown", "recipient": who gets it or null, "note": <=15 words or null}. Use the headline figure.
- "location": a specific street address, intersection, park, or neighborhood named in the text, or null.`;
}

export async function enrichMatter(m: Matter, cityName: string): Promise<Matter> {
  const raw = await chat(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: matterPrompt(m, cityName) },
    ],
    { json: true, maxTokens: 600, temperature: 0.1 },
  );
  const parsed = MatterEnrichment.safeParse(parseJson(raw));
  if (!parsed.success) {
    return { ...m, enrichment: "heuristic" };
  }
  const e = parsed.data;
  const money =
    e.money && e.money.amount > 0
      ? {
          amount: e.money.amount,
          kind: e.money.kind,
          recipient: e.money.recipient || undefined,
          note: e.money.note || undefined,
        }
      : m.money; // keep the regex figure if the model found none
  return {
    ...m,
    plain: e.plain.trim(),
    whoItAffects: e.who_it_affects.trim(),
    category: e.category === "other" && m.category !== "other" ? m.category : e.category,
    tags: [...new Set(e.tags.map((t) => t.toLowerCase().trim()))],
    money,
    location: e.location ? { text: e.location } : m.location,
    enrichment: "llm",
  };
}

export async function enrichMatters(
  matters: Matter[],
  cityName: string,
  opts: { concurrency?: number; onProgress?: (done: number, total: number, m: Matter) => void } = {},
): Promise<Matter[]> {
  if (!llmAvailable()) return matters;
  let done = 0;
  return mapLimit(matters, opts.concurrency ?? 2, async (m) => {
    let out = m;
    try {
      out = await enrichMatter(m, cityName);
    } catch {
      out = { ...m, enrichment: "heuristic" };
    }
    done++;
    opts.onProgress?.(done, matters.length, out);
    return out;
  });
}

// One-paragraph recap of a meeting, built from the plain summaries.
export async function writeMeetingDigest(meeting: Meeting, matters: Matter[], cityName: string): Promise<string | undefined> {
  if (!llmAvailable()) return undefined;
  const items = matters
    .filter((m) => meeting.matterIds.includes(m.id))
    .filter((m) => m.category !== "ceremonial")
    .slice(0, 40)
    .map((m) => {
      const act = m.actions.find((a) => a.meetingId === meeting.id);
      const tally = act?.tally ? ` (${act.tally.yes}-${act.tally.no})` : "";
      const money = m.money ? ` [${formatMoney(m.money.amount)}]` : "";
      return `- ${act?.action || ""}${tally}${money}: ${m.plain || m.title}`;
    })
    .join("\n");
  if (!items.trim()) return undefined;
  const raw = await chat(
    [
      { role: "system", content: SYSTEM.replace("Respond with JSON only.", "Respond with plain text only.") },
      {
        role: "user",
        content: `Write a 3–5 sentence recap of the ${meeting.body} meeting in ${cityName} on ${meeting.date} for a neighborhood newsletter. Lead with the most consequential decision (money, housing, safety, or a contested vote). Mention dollar amounts. Do not list everything. No headline, no bullet points.\n\nItems:\n${items}`,
      },
    ],
    { maxTokens: 350, temperature: 0.3 },
  );
  return raw.trim() || undefined;
}
