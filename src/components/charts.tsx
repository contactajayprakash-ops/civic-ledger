import Link from "next/link";
import type { Category } from "@/lib/types";
import { formatMoney } from "@/lib/heuristics";

// Horizontal bars, one per topic. Plain HTML so it renders on the server
// and prints cleanly.
export function CategoryBars({
  data,
  citySlug,
  metric = "count",
}: {
  data: { key: Category; label: string; count: number; money: number }[];
  citySlug: string;
  metric?: "count" | "money";
}) {
  const max = Math.max(1, ...data.map((d) => (metric === "count" ? d.count : d.money)));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => {
        const v = metric === "count" ? d.count : d.money;
        const pct = Math.max(2, (v / max) * 100);
        return (
          <li key={d.key} data-cat={d.key}>
            <Link href={`/${citySlug}/decisions?cat=${d.key}`} className="block group">
              <div className="flex items-baseline justify-between text-[0.8125rem]">
                <span className="text-ink-2 group-hover:text-ink">{d.label}</span>
                <span className="font-mono tnum text-muted">{metric === "count" ? d.count : formatMoney(d.money, { compact: true })}</span>
              </div>
              <div className="mt-1 h-2 rounded-sm bg-paper-3 overflow-hidden">
                <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: "var(--cat)" }} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// Money over time: one column per week or month, stacked by category.
export function MoneyColumns({
  buckets,
  categories,
}: {
  buckets: { label: string; total: number; parts: { key: Category; value: number }[] }[];
  categories: Category[];
}) {
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const H = 160;
  return (
    <div>
      <div className="flex items-end gap-2 h-[190px] border-b border-ink pb-0">
        {buckets.map((b) => (
          <div key={b.label} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
            <span className="font-mono text-[0.6875rem] tnum text-muted mb-1">{b.total ? formatMoney(b.total, { compact: true }) : ""}</span>
            <div className="w-full max-w-[56px] flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: `${(b.total / max) * H}px` }}>
              {b.parts.map((p) => (
                <div key={p.key} data-cat={p.key} style={{ height: `${(p.value / (b.total || 1)) * 100}%`, background: "var(--cat)" }} title={`${p.key}: ${formatMoney(p.value)}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1.5">
        {buckets.map((b) => (
          <div key={b.label} className="flex-1 text-center font-mono text-[0.6875rem] text-muted truncate">
            {b.label}
          </div>
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {categories.map((c) => (
          <li key={c} data-cat={c} className="flex items-center gap-1.5 text-[0.75rem] text-ink-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "var(--cat)" }} />
            {c.replace("-", " ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
