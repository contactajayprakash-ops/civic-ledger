import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCity } from "@/lib/store";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/types";
import { fmtDateShort, truncate } from "@/lib/format";
import { CategoryChip, SectionHead, StatTile } from "@/components/bits";

export default async function MemberPage({ params }: { params: Promise<{ city: string; member: string }> }) {
  const { city, member } = await params;
  const name = decodeURIComponent(member);
  const snap = loadCity(city);
  if (!snap) notFound();
  const me = snap.members.find((m) => m.name === name);
  if (!me) notFound();

  const rows = snap.matters.flatMap((m) =>
    m.actions
      .filter((a) => a.votes.some((v) => v.person === name))
      .map((a) => ({ m, a, mine: a.votes.find((v) => v.person === name)!, majority: a.tally && a.tally.yes >= a.tally.no ? "yes" : "no" })),
  );
  const dissents = rows.filter((r) => (r.mine.value === "yes" || r.mine.value === "no") && r.mine.value !== r.majority);
  const noVotes = rows.filter((r) => r.mine.value === "no");
  const sponsored = snap.matters.filter((m) => m.sponsors.some((s) => s.toLowerCase().includes(name.split(" ").pop()!.toLowerCase())));
  const byCat = CATEGORIES.map((c) => [c, sponsored.filter((m) => m.category === c).length] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const total = me.votes.yes + me.votes.no + me.votes.abstain + me.votes.absent;

  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Council member · {snap.city.name}</p>
      <h1 className="font-display text-4xl mt-1">{name}</h1>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-x-6 border-y border-rule">
        <StatTile label="votes cast" value={total.toString()} sub={`${me.votes.yes} yes · ${me.votes.no} no`} />
        <StatTile label="voted no" value={me.votes.no.toString()} sub={total ? `${Math.round((me.votes.no / total) * 100)}% of votes` : ""} />
        <StatTile label="on the losing side" value={dissents.length.toString()} sub="voted against the majority" accent={dissents.length > 0} />
        <StatTile label="sponsored" value={sponsored.length.toString()} sub="items in this window" />
      </div>

      <div className="mt-10 grid gap-12 md:grid-cols-2">
        <section>
          <SectionHead kicker={`${noVotes.length} items`} title="Voted no" />
          {noVotes.length === 0 ? (
            <p className="text-sm text-muted">Voted yes on every roll call in this window.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {noVotes.map(({ m, a }, i) => (
                <li key={i} className="py-3">
                  <Link href={`/${city}/decisions/${m.id}`} className="block hover:underline underline-offset-2">
                    <span className="font-mono text-xs text-muted mr-2 tnum">{fmtDateShort(a.date)}</span>
                    {m.plain || truncate(m.title, 140)}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <CategoryChip category={m.category} small />
                    <span className="font-mono tnum">
                      {a.tally?.yes}–{a.tally?.no}
                    </span>
                    {a.tally && a.tally.yes > a.tally.no && <span className="text-seal">passed anyway</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <SectionHead kicker="Sponsored" title="What they brought forward" />
          {byCat.length > 0 && (
            <ul className="mb-4 flex flex-wrap gap-1.5">
              {byCat.map(([c, n]) => (
                <li key={c} className="chip" data-cat={c}>
                  <span className="dot" />
                  {CATEGORY_LABEL[c]} <span className="opacity-60">{n}</span>
                </li>
              ))}
            </ul>
          )}
          <ul className="divide-y divide-rule">
            {sponsored.slice(0, 20).map((m) => (
              <li key={m.id} className="py-3">
                <Link href={`/${city}/decisions/${m.id}`} className="block hover:underline underline-offset-2">
                  <span className="font-mono text-xs text-muted mr-2">{m.file}</span>
                  {m.plain || truncate(m.title, 140)}
                </Link>
              </li>
            ))}
          </ul>
          {sponsored.length > 20 && <p className="mt-2 text-xs text-muted">{sponsored.length - 20} more not shown.</p>}
        </section>
      </div>
      <p className="mt-8 text-xs text-muted">
        Sponsorship is matched by surname against the legislative record, which can miscount members who share a name.
      </p>
    </div>
  );
}
