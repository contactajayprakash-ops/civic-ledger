import { notFound } from "next/navigation";
import { loadCity } from "@/lib/store";
import { DecisionBrowser } from "@/components/decision-browser";

export const metadata = { title: "Decisions" };

export default async function DecisionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ city: string }>;
  searchParams: Promise<{ cat?: string; q?: string; outcome?: string; only?: string }>;
}) {
  const { city } = await params;
  const sp = await searchParams;
  const snap = loadCity(city);
  if (!snap) notFound();
  // Ship only what the browser needs to filter and render rows.
  const items = snap.matters.map((m) => ({
    id: m.id,
    file: m.file,
    type: m.type,
    title: m.title,
    plain: m.plain,
    category: m.category,
    tags: m.tags,
    money: m.money,
    district: m.district,
    latestOutcome: m.latestOutcome,
    date: m.actions[m.actions.length - 1]?.date || m.decidedOn || "",
    tally: m.actions[m.actions.length - 1]?.tally,
    contested: m.actions.some((a) => a.tally && a.tally.no > 0),
    sponsors: m.sponsors,
    body: m.actions[m.actions.length - 1]?.body || "",
  }));
  return (
    <DecisionBrowser
      city={city}
      items={items}
      initial={{ cat: sp.cat, q: sp.q, outcome: sp.outcome, only: sp.only }}
      bodies={snap.city.bodies}
    />
  );
}
