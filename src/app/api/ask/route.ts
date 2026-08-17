import { loadCity } from "@/lib/store";
import { searchMatters } from "@/lib/search";
import { chatStream, stripThinkingStream, llmAvailable, type ChatMessage } from "@/lib/llm";
import { formatMoney } from "@/lib/heuristics";
import { fmtDate } from "@/lib/format";
import type { Matter } from "@/lib/types";

export const maxDuration = 60;

// Answers a resident's question from the city's record. Retrieval is
// keyword search over the snapshot; the model may only use what it is given
// and must cite item numbers, which the client turns into links.
export async function POST(req: Request) {
  const { city, question, history = [] } = (await req.json()) as { city: string; question: string; history?: ChatMessage[] };
  const snap = loadCity(city);
  if (!snap) return new Response("Unknown city", { status: 404 });
  if (!llmAvailable()) return new Response("No language model configured", { status: 503 });
  const q = (question || "").trim().slice(0, 500);
  if (!q) return new Response("Empty question", { status: 400 });

  // Widen the net with words from the previous turn so follow-ups work.
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content || "";
  let hits = searchMatters(snap, q, 14);
  if (hits.length < 4 && lastUser) hits = [...hits, ...searchMatters(snap, `${q} ${lastUser}`, 8).filter((m) => !hits.includes(m))].slice(0, 14);
  // Proclamations drown out real business unless the question is about them.
  if (!/proclamat|ceremon|honor|commend|recogni/i.test(q)) {
    const substantive = hits.filter((m) => m.category !== "ceremonial");
    if (substantive.length >= 2) hits = substantive;
  }
  hits = hits.slice(0, 10);
  if (hits.length === 0) {
    // Fall back to the most consequential recent items so the model can at
    // least explain what it does have.
    hits = [...snap.matters].filter((m) => m.category !== "ceremonial").sort((a, b) => (b.decidedOn || "").localeCompare(a.decidedOn || "")).slice(0, 8);
  }

  const sources = hits.map((m, i) => ({
    n: i + 1,
    id: m.id,
    file: m.file,
    date: m.decidedOn || m.actions[m.actions.length - 1]?.date || "",
    outcome: m.latestOutcome,
    text: m.plain || m.title.slice(0, 200),
  }));

  const context = hits.map((m, i) => describe(m, i + 1)).join("\n\n");
  const system = `You are Civic Ledger, answering questions about what the ${snap.city.name} ${snap.city.bodies[0] || "City Council"} has done between ${fmtDate(snap.city.window.from)} and ${fmtDate(snap.city.window.to)}.
Answer only from the numbered items below. Cite items inline like [1] or [2][5] after the sentence they support. If the items don't answer the question, say what you do have and suggest a better search term — do not guess.
Write plainly, in 2–6 sentences, for a resident. Give dollar amounts and vote tallies when they are in the items. No headings, no bullet lists.

ITEMS:
${context}`;

  const messages: ChatMessage[] = [{ role: "system", content: system }, ...history.slice(-6), { role: "user", content: q }];
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ sources }) + "\n"));
      try {
        for await (const delta of stripThinkingStream(chatStream(messages, { maxTokens: 500, temperature: 0.2 }))) {
          controller.enqueue(encoder.encode(JSON.stringify({ delta }) + "\n"));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(JSON.stringify({ error: (e as Error).message }) + "\n"));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

function describe(m: Matter, n: number) {
  const acts = m.actions.map((a) => `${a.date}: ${a.action}${a.tally ? ` (${a.tally.yes}-${a.tally.no})` : ""}`).join("; ");
  const money = m.money ? ` Money: ${formatMoney(m.money.amount)} (${m.money.kind}${m.money.recipient ? ` → ${m.money.recipient}` : ""}).` : "";
  return `[${n}] ${m.file} (${m.type}, ${m.latestOutcome}). ${m.plain || ""} Official title: ${m.title.slice(0, 300)}.${money} Actions: ${acts}. Sponsors: ${m.sponsors.join(", ") || "n/a"}.${m.whoItAffects ? ` Affects: ${m.whoItAffects}.` : ""}`;
}
