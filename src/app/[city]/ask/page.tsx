import { notFound } from "next/navigation";
import { loadCity } from "@/lib/store";
import { llmAvailable } from "@/lib/llm";
import { AskPanel } from "@/components/ask-panel";

export const metadata = { title: "Ask" };
export const dynamic = "force-dynamic";

export default async function AskPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const snap = loadCity(city);
  if (!snap) notFound();
  // Suggested questions built from what the record actually contains.
  const tags = new Map<string, number>();
  for (const m of snap.matters) for (const t of m.tags) tags.set(t, (tags.get(t) || 0) + 1);
  const topTags = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
  const suggestions = [
    "What was the biggest contract approved this summer?",
    "Which votes were not unanimous, and who voted no?",
    "What did council do about housing?",
    ...topTags.map((t) => `What happened with ${t}?`),
  ].slice(0, 6);
  return <AskPanel city={city} cityName={snap.city.name} available={llmAvailable()} suggestions={suggestions} />;
}
