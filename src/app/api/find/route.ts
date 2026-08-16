import { NextResponse } from "next/server";
import { searchWeb, firecrawlAvailable } from "@/lib/firecrawl";

// Finds likely agenda/minutes pages for a city name using Firecrawl search.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 100);
  if (!q) return NextResponse.json({ error: "Missing city" }, { status: 400 });
  if (!firecrawlAvailable()) return NextResponse.json({ error: "Search isn't configured on this deployment (needs FIRECRAWL_API_KEY)." }, { status: 503 });
  const hits = await searchWeb(`${q} city council meeting agenda minutes 2026`, 8);
  const ranked = hits
    .filter((h) => !/wikipedia|facebook|youtube|twitter|x\.com|linkedin/i.test(h.url))
    .map((h) => ({ ...h, score: score(h.url + " " + h.title) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  return NextResponse.json({ results: ranked });
}

function score(s: string) {
  let n = 0;
  if (/agenda|minutes/i.test(s)) n += 3;
  if (/\.gov\b|\.us\b|legistar|granicus|civicplus|civicweb|iqm2|primegov|municode|boarddocs|novusagenda|escribe/i.test(s)) n += 2;
  if (/\.pdf$/i.test(s)) n += 1;
  if (/2026/.test(s)) n += 1;
  return n;
}
