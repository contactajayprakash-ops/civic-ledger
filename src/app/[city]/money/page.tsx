import Link from "next/link";
import { notFound } from "next/navigation";
import { computeStats, loadCity } from "@/lib/store";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/types";
import { formatMoney } from "@/lib/heuristics";
import { fmtDateShort, truncate } from "@/lib/format";
import { CategoryChip, OutcomeStamp, SectionHead, StatTile } from "@/components/bits";
import { CategoryBars, MoneyColumns } from "@/components/charts";

export const metadata = { title: "Money" };

export default async function MoneyPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const snap = loadCity(city);
  if (!snap) notFound();
  const stats = computeStats(snap);
  const withMoney = snap.matters.filter((m) => m.money);
  const spent = withMoney.filter((m) => m.latestOutcome === "passed" && m.money!.kind !== "receive");
  const received = withMoney.filter((m) => m.latestOutcome === "passed" && m.money!.kind === "receive");
  const receivedTotal = received.reduce((n, m) => n + m.money!.amount, 0);
  const top = [...spent].sort((a, b) => b.money!.amount - a.money!.amount).slice(0, 25);
  const inflow = [...received].sort((a, b) => b.money!.amount - a.money!.amount).slice(0, 8);

  // Weekly buckets over the window, stacked by category.
  const from = new Date(snap.city.window.from + "T12:00:00");
  const to = new Date(snap.city.window.to + "T12:00:00");
  const weekMs = 7 * 86400000;
  const nWeeks = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / weekMs));
  const buckets = Array.from({ length: nWeeks }, (_, i) => {
    const start = new Date(from.getTime() + i * weekMs);
    return { label: `${start.getMonth() + 1}/${start.getDate()}`, total: 0, parts: new Map<Category, number>() };
  });
  for (const m of spent) {
    const d = m.decidedOn || m.actions[m.actions.length - 1]?.date;
    if (!d) continue;
    const i = Math.min(nWeeks - 1, Math.max(0, Math.floor((new Date(d + "T12:00:00").getTime() - from.getTime()) / weekMs)));
    buckets[i].total += m.money!.amount;
    buckets[i].parts.set(m.category, (buckets[i].parts.get(m.category) || 0) + m.money!.amount);
  }
  const usedCats = CATEGORIES.filter((c) => stats.moneyByCategory[c] > 0);
  const columns = buckets.map((b) => ({ label: b.label, total: b.total, parts: usedCats.map((c) => ({ key: c, value: b.parts.get(c) || 0 })).filter((p) => p.value > 0) }));
  const catData = usedCats
    .map((c) => ({ key: c, label: CATEGORY_LABEL[c], count: stats.byCategory[c], money: stats.moneyByCategory[c] }))
    .sort((a, b) => b.money - a.money);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 border-y border-rule">
        <StatTile label="authorized" value={formatMoney(stats.dollarsAuthorized, { compact: true })} sub={`${spent.length} items that passed`} />
        <StatTile label="received" value={formatMoney(receivedTotal, { compact: true })} sub={`${received.length} grants, gifts & reimbursements`} />
        <StatTile label="largest single item" value={top[0] ? formatMoney(top[0].money!.amount, { compact: true }) : "—"} sub={top[0] ? truncate(top[0].plain || top[0].title, 60) : ""} />
        <StatTile label="items naming a figure" value={withMoney.length.toString()} sub={`of ${snap.matters.length} total`} />
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <section>
            <SectionHead kicker="Week by week" title="Dollars authorized" />
            <MoneyColumns buckets={columns} categories={usedCats} />
          </section>

          <section className="mt-12">
            <SectionHead kicker="Top 25" title="Biggest items that passed" />
            <table className="w-full text-[0.9375rem]">
              <thead>
                <tr className="text-left">
                  <th className="eyebrow font-normal pb-2 pr-3">Amount</th>
                  <th className="eyebrow font-normal pb-2 pr-3">Item</th>
                  <th className="eyebrow font-normal pb-2 hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule border-t border-ink">
                {top.map((m) => (
                  <tr key={m.id} className="align-top hover:bg-paper-2/60">
                    <td className="py-2.5 pr-3 font-mono tnum whitespace-nowrap">{formatMoney(m.money!.amount, { compact: true })}</td>
                    <td className="py-2.5 pr-3">
                      <Link href={`/${city}/decisions/${m.id}`} className="hover:underline underline-offset-2">
                        {m.plain || truncate(m.title, 140)}
                      </Link>
                      <div className="mt-1 flex items-center gap-2">
                        <CategoryChip category={m.category} small />
                        {m.money!.recipient && <span className="text-xs text-muted">→ {m.money!.recipient}</span>}
                      </div>
                    </td>
                    <td className="py-2.5 font-mono text-xs text-muted tnum whitespace-nowrap hidden sm:table-cell">{fmtDateShort(m.decidedOn || m.actions[m.actions.length - 1]?.date || "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="space-y-12">
          <section>
            <SectionHead kicker="Where it went" title="By topic" />
            <CategoryBars data={catData} citySlug={city} metric="money" />
          </section>
          {inflow.length > 0 && (
            <section>
              <SectionHead kicker="Coming in" title="Grants & gifts accepted" />
              <ul className="divide-y divide-rule">
                {inflow.map((m) => (
                  <li key={m.id} className="py-2.5">
                    <Link href={`/${city}/decisions/${m.id}`} className="flex gap-3 hover:underline underline-offset-2">
                      <span className="font-mono tnum text-sm whitespace-nowrap text-green">{formatMoney(m.money!.amount, { compact: true })}</span>
                      <span className="text-sm">{m.plain || truncate(m.title, 110)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-xs text-muted leading-relaxed">
            How to read this: each item&apos;s headline figure is the largest dollar amount named in its title or text, confirmed by
            the language model where available. Amendments that restate a prior total can double count; treat these as an
            index of council activity, not an audited ledger.{" "}
            <Link href="/about" className="underline underline-offset-2">
              More on limits
            </Link>
            .
          </p>
          <div>
            <OutcomeStamp outcome="passed" /> <span className="text-xs text-muted ml-2">only items that passed are counted above</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
