import { scrapeUrl, firecrawlAvailable } from "@/lib/firecrawl";
import { extractFromDocument } from "@/lib/adapters/web";
import { llmAvailable, llmConfig } from "@/lib/llm";
import { slugify } from "@/lib/util";

export const maxDuration = 60;

// Reads one agenda or minutes document on demand and streams what it finds.
// Output is NDJSON: {status}, {doc}, {chunk}, {matter}, {done} or {error}.
export async function POST(req: Request) {
  const { url, cityName = "" } = (await req.json()) as { url: string; cityName?: string };
  let target: URL;
  try {
    target = new URL(url);
    if (!/^https?:$/.test(target.protocol)) throw new Error("bad protocol");
  } catch {
    return new Response("Please paste a full http(s) link.", { status: 400 });
  }
  if (!llmAvailable()) return new Response("No language model configured on this deployment.", { status: 503 });

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 55000);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        send(controller, { status: firecrawlAvailable() ? "Fetching the document with Firecrawl…" : "Fetching the document…" });
        const doc = await scrapeUrl(target.toString(), { signal: abort.signal });
        const words = doc.markdown.split(/\s+/).length;
        send(controller, { doc: { title: doc.title, via: doc.via, words, contentType: doc.contentType } });
        if (words < 40) {
          send(controller, { error: "That page has almost no readable text. If it's a portal, try the direct link to the agenda or minutes (often a PDF)." });
          controller.close();
          return;
        }
        send(controller, { status: `Reading ${words.toLocaleString()} words with ${llmConfig()?.model.split("/").pop()}…` });
        const cityLabel = cityName || guessCity(doc.title, target.hostname);
        const result = await extractFromDocument(doc, {
          citySlug: slugify(cityLabel || target.hostname),
          cityName: cityLabel || "this city",
          maxChunks: 6,
          signal: abort.signal,
          onChunk: (i, total, found) => send(controller, { chunk: { i, total, found } }),
          onMatter: (m) => send(controller, { matter: m }),
        });
        send(controller, { done: { meeting: result.meeting, count: result.matters.length, chunks: result.chunks, truncated: doc.markdown.length > 6 * 9000 } });
      } catch (e) {
        send(controller, { error: abort.signal.aborted ? "Ran out of time on this deployment (60s). Try a shorter document, or run the ingest CLI locally." : (e as Error).message });
      } finally {
        clearTimeout(timer);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

function guessCity(title: string, host: string) {
  const m = title.match(/(?:City|Town|Village|Borough|County) of ([A-Z][A-Za-z.\- ]+)/);
  if (m) return m[1].trim();
  const h = host.replace(/^www\./, "").split(".")[0];
  return h.length > 3 ? h.replace(/^(cityof|townof)/, "").replace(/[-_]/g, " ") : "";
}
