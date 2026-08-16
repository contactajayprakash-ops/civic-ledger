import Link from "next/link";
import { notFound } from "next/navigation";
import { computeStats, headlineMatters, loadCity } from "@/lib/store";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/types";
import { formatMoney } from "@/lib/heuristics";
import { fmtDate } from "@/lib/format";
import { MatterRow, SectionHead, StatTile } from "@/components/bits";
import { CategoryBars } from "@/components/charts";

export default async function CityOverview({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const snap = loadCity(city);
  if (!snap) notFound();
  const stats = computeStats(snap);
  const meetings = [...snap.meetings].reverse();
  const latest = meetings.find((m) => m.matterIds.length > 0);
  const headline = headlineMatters(snap, 8);
  const catData = CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c], count: stats.byCategory[c], money: stats.moneyByCategory[c] }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 border-y border-rule">
        <StatTile label="meetings" value={stats.meetings.toString()} sub={`${snap.city.bodies.join(", ")}`} />
        <StatTile label="decisions" value={stats.matters.toLocaleString()} sub={`${stats.passed} passed · ${stats.failed} failed`} />
        <StatTile label="authorized" value={formatMoney(stats.dollarsAuthorized, { compact: true })} sub="headline amounts, items that passed" />
        <StatTile label="contested votes" value={stats.contestedVotes.toString()} sub="roll calls with at least one no" accent={stats.contestedVotes > 0} />
        <StatTile label="council members" value={snap.members.length.toString()} sub="with recorded votes" />
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.5fr_1fr]">
        <div>
          {latest && (
            <section className="mb-12">
              <SectionHead
                kicker={`Latest meeting · ${fmtDate(latest.date, { weekday: true })}`}
                title={latest.body}
                action={
                  <Link href={`/${city}/meetings/${latest.id}`} className="text-sm underline underline-offset-2 whitespace-nowrap">
                    All {latest.matterIds.length} items →
                  </Link>
                }
              />
              {latest.digest ? (
                <p className="text-[1.0625rem] leading-relaxed text-ink">{latest.digest}</p>
              ) : (
                <p className="text-[0.9375rem] text-muted">
                  {latest.matterIds.length} items were taken up. A written recap appears here once explanations are generated for this
                  city.
                </p>
              )}
            </section>
          )}

          <section>
            <SectionHead
              kicker="Worth knowing"
              title="The decisions that mattered most"
              action={
                <Link href={`/${city}/decisions`} className="text-sm underline underline-offset-2 whitespace-nowrap">
                  All decisions →
                </Link>
              }
            />
            <ul>
              {headline.map((m) => (
                <MatterRow key={m.id} m={m} city={city} />
              ))}
            </ul>
            <p className="mt-3 text-[0.75rem] text-muted">
              Ranked by dollar amount, contested roll calls and failed votes. Proclamations are pushed down.
            </p>
          </section>
        </div>

        <aside className="space-y-12">
          <section>
            <SectionHead kicker="By topic" title="What council spent its time on" />
            <CategoryBars data={catData} citySlug={city} />
          </section>

          <section>
            <SectionHead kicker="Calendar" title="Meetings in this window" />
            <ul className="divide-y divide-rule">
              {meetings.slice(0, 12).map((m) => (
                <li key={m.id}>
                  <Link href={`/${city}/meetings/${m.id}`} className="flex items-baseline justify-between py-2.5 hover:bg-paper-2/70 -mx-2 px-2 rounded-md">
                    <span className="text-[0.9375rem]">
                      <span className="font-mono text-[0.75rem] text-muted mr-2 tnum">{fmtDate(m.date, { year: false })}</span>
                      {m.body}
                    </span>
                    <span className="font-mono text-xs text-muted tnum">{m.matterIds.length} items</span>
                  </Link>
                </li>
              ))}
            </ul>
            {meetings.length > 12 && <p className="mt-2 text-xs text-muted">{meetings.length - 12} earlier meetings not shown.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
