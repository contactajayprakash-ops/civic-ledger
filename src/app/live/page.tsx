import { LiveReader } from "@/components/live-reader";
import { firecrawlAvailable } from "@/lib/firecrawl";
import { llmAvailable } from "@/lib/llm";

export const metadata = { title: "Read any agenda" };
export const dynamic = "force-dynamic";

export default async function LivePage({ searchParams }: { searchParams: Promise<{ q?: string; url?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-10">
      <p className="eyebrow">Any city, right now</p>
      <h1 className="font-display text-4xl sm:text-5xl leading-none mt-1">Read any agenda</h1>
      <p className="mt-4 text-lg text-ink-2 max-w-2xl">
        Paste a link to a council agenda or minutes page — HTML or PDF — and Civic Ledger reads it on the spot: Firecrawl
        turns the page into clean text, and the model lists what was decided, item by item, with outcomes and dollar figures.
        Or type a city name and we&apos;ll look for its agenda pages.
      </p>
      <div className="mt-8">
        <LiveReader initialQuery={sp.q || ""} initialUrl={sp.url || ""} canSearch={firecrawlAvailable()} canRead={llmAvailable()} />
      </div>
    </div>
  );
}
