import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCity } from "@/lib/store";
import { fmtDateShort, truncate } from "@/lib/format";
import { CategoryChip, SectionHead, StatTile } from "@/components/bits";
import { RollCall } from "@/components/roll-call";

export const metadata = { title: "Votes" };

export default async function VotesPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const snap = loadCity(city);
  if (!snap) notFound();
  const rollCalls = snap.matters.flatMap((m) => m.actions.filter((a) => a.votes.length > 0).map((a) => ({ m, a })));
  const contested = rollCalls.filter(({ a }) => a.tally && a.tally.no > 0).sort((x, y) => (y.a.tally!.no - x.a.tally!.no) || y.a.date.localeCompare(x.a.date));
  const unanimous = rollCalls.length - contested.length;
  const members = snap.members;
  const maxVotes = Math.max(1, ...members.map((mm) => mm.votes.yes + mm.votes.no + mm.votes.abstain + mm.votes.absent));

  // Who votes together: for each pair, share of contested roll calls where they agreed.
  const names = members.map((mm) => mm.name);
  const agree = new Map<string, { same: number; both: number }>();
  for (const { a } of contested) {
    const v = new Map(a.votes.filter((x) => x.value === "yes" || x.value === "no").map((x) => [x.person, x.value]));
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const p = v.get(names[i]);
        const q = v.get(names[j]);
        if (!p || !q) continue;
        const k = `${names[i]}|${names[j]}`;
        const e = agree.get(k) || { same: 0, both: 0 };
        e.both++;
        if (p === q) e.same++;
        agree.set(k, e);
      }
  }
  const pairs = [...agree.entries()]
    .filter(([, e]) => e.both >= 3)
    .map(([k, e]) => ({ k, rate: e.same / e.both, both: e.both }))
    .sort((x, y) => x.rate - y.rate);
  const leastAligned = pairs.slice(0, 3);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 border-y border-rule">
        <StatTile label="roll calls" value={rollCalls.length.toString()} sub="votes recorded by name" />
        <StatTile label="unanimous" value={rollCalls.length ? `${Math.round((unanimous / rollCalls.length) * 100)}%` : "—"} sub={`${unanimous} of ${rollCalls.length}`} />
        <StatTile label="contested" value={contested.length.toString()} sub="at least one no vote" accent={contested.length > 0} />
        <StatTile label="members" value={members.length.toString()} sub="who cast at least one vote" />
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_1.4fr]">
        <section>
          <SectionHead kicker="Scorecard" title="Council members" />
          {members.length === 0 ? (
            <p className="text-sm text-muted">This city&apos;s record doesn&apos;t include roll calls by name.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {members.map((mm) => {
                const total = mm.votes.yes + mm.votes.no + mm.votes.abstain + mm.votes.absent;
                return (
                  <li key={mm.name} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`/${city}/votes/${encodeURIComponent(mm.name)}`} className="font-medium hover:underline underline-offset-2">
                        {mm.name}
                      </Link>
                      <span className="font-mono text-xs text-muted tnum">
                        {mm.dissents} on the losing side · {total} votes
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 flex rounded-sm overflow-hidden bg-paper-3" style={{ width: `${(total / maxVotes) * 100}%` }} title={`${mm.votes.yes} yes, ${mm.votes.no} no, ${mm.votes.abstain} abstain, ${mm.votes.absent} absent`}>
                      <div className="bg-green" style={{ width: `${(mm.votes.yes / total) * 100}%` }} />
                      <div className="bg-seal" style={{ width: `${(mm.votes.no / total) * 100}%` }} />
                      <div className="bg-rule-2" style={{ width: `${(mm.votes.abstain / total) * 100}%` }} />
                      <div className="bg-transparent" style={{ width: `${(mm.votes.absent / total) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">Green = yes, red = no, grey = abstain. Bar length is number of votes cast.</p>

          {leastAligned.length > 0 && (
            <div className="mt-8">
              <p className="eyebrow mb-2">Least often on the same side (contested votes only)</p>
              <ul className="text-sm space-y-1">
                {leastAligned.map((p) => (
                  <li key={p.k} className="flex justify-between gap-3">
                    <span>{p.k.replace("|", " & ")}</span>
                    <span className="font-mono tnum text-muted">
                      {Math.round(p.rate * 100)}% of {p.both}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section>
          <SectionHead kicker="Not unanimous" title="Every contested vote" />
          {contested.length === 0 ? (
            <p className="text-sm text-muted">Every roll call in this window was unanimous.</p>
          ) : (
            <ol className="space-y-6">
              {contested.map(({ m, a }, i) => (
                <li key={`${m.id}-${i}`} className="border-b border-rule pb-5 last:border-b-0">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-muted tnum w-14 shrink-0">{fmtDateShort(a.date)}</span>
                    <div className="min-w-0">
                      <Link href={`/${city}/decisions/${m.id}`} className="text-[1.0625rem] leading-snug hover:underline underline-offset-2">
                        {m.plain || truncate(m.title, 160)}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3">
                        <CategoryChip category={m.category} small />
                        <span className="text-sm">
                          <span className="text-muted">{a.action}</span>{" "}
                          <span className="font-mono tnum">
                            {a.tally!.yes}–{a.tally!.no}
                          </span>
                        </span>
                      </div>
                      <RollCall votes={a.votes} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
