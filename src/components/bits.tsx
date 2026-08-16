import Link from "next/link";
import type { Category, Matter, Outcome } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { formatMoney } from "@/lib/heuristics";
import { OUTCOME_COLOR, OUTCOME_LABEL, fmtDateShort, truncate } from "@/lib/format";

export function CategoryChip({ category, on, small }: { category: Category; on?: boolean; small?: boolean }) {
  return (
    <span className={`chip ${small ? "text-[0.625rem] px-1.5" : ""}`} data-cat={category} data-on={on ? "true" : undefined}>
      <span className="dot" />
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function OutcomeStamp({ outcome }: { outcome: Outcome }) {
  return <span className={`stamp ${OUTCOME_COLOR[outcome]}`}>{OUTCOME_LABEL[outcome]}</span>;
}

export function MoneyTag({ amount, kind, compact = true }: { amount: number; kind?: string; compact?: boolean }) {
  const label = kind === "receive" ? "in" : kind === "transfer" ? "moved" : kind === "budget" ? "budgeted" : "";
  return (
    <span className="font-mono text-[0.8125rem] text-ink inline-flex items-baseline gap-1">
      <span className="font-medium">{formatMoney(amount, { compact })}</span>
      {label && <span className="text-muted text-[0.6875rem]">{label}</span>}
    </span>
  );
}

export function VoteTally({ tally }: { tally: { yes: number; no: number; abstain: number; absent: number } }) {
  const contested = tally.no > 0;
  return (
    <span className={`font-mono text-[0.75rem] tnum ${contested ? "text-seal" : "text-muted"}`} title="yes–no">
      {tally.yes}–{tally.no}
      {tally.abstain ? <span className="text-muted"> ·{tally.abstain} abst</span> : null}
    </span>
  );
}

// The standard row for a decision anywhere in the app.
export function MatterRow({ m, city, showDate = true, dense = false }: { m: Matter; city: string; showDate?: boolean; dense?: boolean }) {
  const last = m.actions[m.actions.length - 1];
  const contested = m.actions.some((a) => a.tally && a.tally.no > 0);
  return (
    <li className="group border-b border-rule last:border-b-0">
      <Link href={`/${city}/decisions/${m.id}`} className={`block ${dense ? "py-3" : "py-4"} -mx-2 px-2 rounded-md hover:bg-paper-2/70 transition-colors`}>
        <div className="flex items-start gap-3">
          {showDate && (
            <div className="w-14 shrink-0 pt-0.5">
              <div className="font-mono text-[0.75rem] text-muted tnum">{fmtDateShort(last?.date || m.decidedOn || "")}</div>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-ink leading-snug ${dense ? "text-[0.9375rem]" : "text-base"}`}>
              {m.plain ? m.plain : truncate(m.title, 200)}
            </p>
            {m.plain && !dense && <p className="mt-1 text-[0.8125rem] text-muted leading-snug">{truncate(m.title, 140)}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <CategoryChip category={m.category} small />
              {m.money && <MoneyTag amount={m.money.amount} kind={m.money.kind} />}
              {last?.tally && <VoteTally tally={last.tally} />}
              {contested && <span className="eyebrow !text-seal">contested</span>}
              {m.district && <span className="eyebrow">Dist. {m.district}</span>}
              <span className="eyebrow ml-auto hidden sm:inline">{m.file}</span>
            </div>
          </div>
          <div className="shrink-0 pt-0.5">
            <OutcomeStamp outcome={m.latestOutcome} />
          </div>
        </div>
      </Link>
    </li>
  );
}

export function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="py-4 pr-6 border-r border-rule last:border-r-0 last:pr-0">
      <p className="eyebrow">{label}</p>
      <p className={`mt-1 font-display text-3xl sm:text-[2.25rem] leading-none tnum ${accent ? "text-seal" : "text-ink"}`}>{value}</p>
      {sub && <p className="mt-1.5 text-[0.8125rem] text-muted">{sub}</p>}
    </div>
  );
}

export function SectionHead({ title, kicker, action }: { title: string; kicker?: string; action?: React.ReactNode }) {
  return (
    <div className="rule-double pt-3 mb-4 flex items-end justify-between gap-4">
      <div>
        {kicker && <p className="eyebrow">{kicker}</p>}
        <h2 className="font-display text-2xl leading-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="card p-8 text-center text-muted text-sm">{children}</div>;
}
