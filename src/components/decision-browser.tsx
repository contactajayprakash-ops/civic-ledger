"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Category, Money, Outcome } from "@/lib/types";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/types";
import { OUTCOME_LABEL, fmtDateShort, truncate } from "@/lib/format";
import { CategoryChip, MoneyTag, OutcomeStamp, VoteTally } from "./bits";

export interface DecisionItem {
  id: string;
  file: string;
  type: string;
  title: string;
  plain?: string;
  category: Category;
  tags: string[];
  money?: Money;
  district?: string;
  latestOutcome: Outcome;
  date: string;
  tally?: { yes: number; no: number; abstain: number; absent: number };
  contested: boolean;
  sponsors: string[];
  body: string;
}

type Sort = "newest" | "money" | "contested";

export function DecisionBrowser({
  city,
  items,
  initial,
  bodies,
}: {
  city: string;
  items: DecisionItem[];
  initial: { cat?: string; q?: string; outcome?: string; only?: string };
  bodies: string[];
}) {
  const [q, setQ] = useState(initial.q || "");
  const [cats, setCats] = useState<Set<Category>>(new Set(initial.cat ? [initial.cat as Category] : []));
  const [outcome, setOutcome] = useState<Outcome | "all">((initial.outcome as Outcome) || "all");
  const [onlyMoney, setOnlyMoney] = useState(initial.only === "money");
  const [onlyContested, setOnlyContested] = useState(initial.only === "contested");
  const [hideCeremonial, setHideCeremonial] = useState(true);
  const [sort, setSort] = useState<Sort>("newest");
  const [shown, setShown] = useState(60);

  const counts = useMemo(() => {
    const c = Object.fromEntries(CATEGORIES.map((k) => [k, 0])) as Record<Category, number>;
    for (const it of items) c[it.category]++;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let list = items.filter((it) => {
      if (cats.size && !cats.has(it.category)) return false;
      if (hideCeremonial && it.category === "ceremonial" && !cats.has("ceremonial")) return false;
      if (outcome !== "all" && it.latestOutcome !== outcome) return false;
      if (onlyMoney && !it.money) return false;
      if (onlyContested && !it.contested) return false;
      if (terms.length) {
        const hay = `${it.title} ${it.plain || ""} ${it.tags.join(" ")} ${it.file} ${it.sponsors.join(" ")} ${it.district || ""}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    if (sort === "newest") list = list.sort((a, b) => b.date.localeCompare(a.date));
    if (sort === "money") list = list.sort((a, b) => (b.money?.amount || 0) - (a.money?.amount || 0));
    if (sort === "contested") list = list.sort((a, b) => (b.tally?.no || 0) - (a.tally?.no || 0) || b.date.localeCompare(a.date));
    return list;
  }, [items, q, cats, outcome, onlyMoney, onlyContested, hideCeremonial, sort]);

  function toggleCat(c: Category) {
    const next = new Set(cats);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setCats(next);
    setShown(60);
  }

  const total = filtered.reduce((n, it) => n + (it.money && it.latestOutcome === "passed" && it.money.kind !== "receive" ? it.money.amount : 0), 0);

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-6 lg:sticky lg:top-20 self-start no-print">
        <div>
          <label className="eyebrow block mb-1.5" htmlFor="q">
            Search
          </label>
          <input
            id="q"
            className="input"
            placeholder="street, program, vendor, sponsor…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(60);
            }}
          />
        </div>
        <div>
          <p className="eyebrow mb-2">Topic</p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.filter((c) => counts[c] > 0).map((c) => (
              <button key={c} type="button" onClick={() => toggleCat(c)} className="chip cursor-pointer" data-cat={c} data-on={cats.has(c) ? "true" : undefined}>
                <span className="dot" />
                {CATEGORY_LABEL[c]}
                <span className="opacity-60 tnum">{counts[c]}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow mb-2">Outcome</p>
          <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome | "all")}>
            <option value="all">Any outcome</option>
            {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 text-sm">
          <Check label="Only items with a dollar figure" checked={onlyMoney} onChange={setOnlyMoney} />
          <Check label="Only contested roll calls" checked={onlyContested} onChange={setOnlyContested} />
          <Check label="Hide proclamations" checked={hideCeremonial} onChange={setHideCeremonial} />
        </div>
        <div>
          <p className="eyebrow mb-2">Sort</p>
          <div className="flex gap-1">
            {(["newest", "money", "contested"] as Sort[]).map((s) => (
              <button key={s} type="button" onClick={() => setSort(s)} className="chip cursor-pointer" data-on={sort === s ? "true" : undefined}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">
          {bodies.join(", ")}. Click any row for the roll call, official text and source link.
        </p>
      </aside>

      <section>
        <div className="flex items-baseline justify-between border-b border-ink pb-2 mb-1">
          <p className="text-sm">
            <span className="font-mono tnum">{filtered.length}</span> of {items.length} items
            {total > 0 && (
              <span className="text-muted">
                {" "}
                · <span className="font-mono tnum">${Math.round(total).toLocaleString()}</span> authorized in this view
              </span>
            )}
          </p>
          {(cats.size > 0 || q || outcome !== "all" || onlyMoney || onlyContested) && (
            <button
              type="button"
              className="text-sm underline underline-offset-2 text-muted hover:text-ink"
              onClick={() => {
                setQ("");
                setCats(new Set());
                setOutcome("all");
                setOnlyMoney(false);
                setOnlyContested(false);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        <ul>
          {filtered.slice(0, shown).map((it) => (
            <li key={it.id} className="border-b border-rule last:border-b-0">
              <Link href={`/${city}/decisions/${it.id}`} className="block py-4 -mx-2 px-2 rounded-md hover:bg-paper-2/70 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-14 shrink-0 pt-0.5 font-mono text-[0.75rem] text-muted tnum">{fmtDateShort(it.date)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink leading-snug">{it.plain || truncate(it.title, 200)}</p>
                    {it.plain && <p className="mt-1 text-[0.8125rem] text-muted leading-snug">{truncate(it.title, 140)}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <CategoryChip category={it.category} small />
                      {it.money && <MoneyTag amount={it.money.amount} kind={it.money.kind} />}
                      {it.tally && <VoteTally tally={it.tally} />}
                      {it.contested && <span className="eyebrow !text-seal">contested</span>}
                      {it.district && <span className="eyebrow">Dist. {it.district}</span>}
                      <span className="eyebrow ml-auto hidden sm:inline">{it.file}</span>
                    </div>
                  </div>
                  <div className="shrink-0 pt-0.5">
                    <OutcomeStamp outcome={it.latestOutcome} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {filtered.length > shown && (
          <div className="py-6 text-center">
            <button type="button" className="btn btn-ghost" onClick={() => setShown(shown + 60)}>
              Show {Math.min(60, filtered.length - shown)} more
            </button>
          </div>
        )}
        {filtered.length === 0 && <p className="py-12 text-center text-muted text-sm">Nothing matches those filters.</p>}
      </section>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#b3392c]" />
      {label}
    </label>
  );
}
