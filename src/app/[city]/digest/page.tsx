import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCity } from "@/lib/store";
import type { Matter, Meeting } from "@/lib/types";
import { formatMoney } from "@/lib/heuristics";
import { fmtDate, truncate } from "@/lib/format";
import { CategoryChip, OutcomeStamp, SectionHead } from "@/components/bits";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "This week" };

// The newsletter view: one section per meeting, newest first, each with its
// recap and the handful of items a resident would want to know about.
export default async function DigestPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const snap = loadCity(city);
  if (!snap) notFound();
  const byId = new Map(snap.matters.map((m) => [m.id, m]));
  const meetings = [...snap.meetings].reverse().filter((m) => m.matterIds.length > 0).slice(0, 6);

  return (
    <div className="max-w-3xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow">Digest · {snap.city.name}</p>
          <h2 className="font-display text-3xl mt-1">The last {meetings.length} meetings, in brief</h2>
          <p className="mt-2 text-[0.9375rem] text-ink-2">
            Printable. Subscribe to the{" "}
            <a href={`/${city}/feed.xml`} className="underline underline-offset-2">
              RSS feed
            </a>{" "}
            to get each meeting&apos;s recap in your reader.
          </p>
        </div>
        <PrintButton />
      </div>

      {meetings.map((meeting) => {
        const items = meeting.matterIds.map((i) => byId.get(i)).filter((m): m is Matter => Boolean(m));
        const picks = pickHighlights(items, meeting, 6);
        const money = items.reduce((n, m) => {
          const a = m.actions.find((x) => x.meetingId === meeting.id);
          return n + (m.money && a?.outcome === "passed" && m.money.kind !== "receive" ? m.money.amount : 0);
        }, 0);
        return (
          <section key={meeting.id} className="mt-12 break-inside-avoid">
            <SectionHead
              kicker={`${meeting.body} · ${items.length} items · ${formatMoney(money, { compact: true })} authorized`}
              title={fmtDate(meeting.date, { weekday: true })}
              action={
                <Link href={`/${city}/meetings/${meeting.id}`} className="text-sm underline underline-offset-2 whitespace-nowrap no-print">
                  Full meeting →
                </Link>
              }
            />
            {meeting.digest && <p className="text-[1.0625rem] leading-relaxed">{meeting.digest}</p>}
            <ul className="mt-4 space-y-3">
              {picks.map((m) => {
                const a = m.actions.find((x) => x.meetingId === meeting.id);
                return (
                  <li key={m.id} className="flex gap-3">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-seal shrink-0" />
                    <div>
                      <Link href={`/${city}/decisions/${m.id}`} className="hover:underline underline-offset-2 leading-snug">
                        {m.plain || truncate(m.title, 160)}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <CategoryChip category={m.category} small />
                        {a && <OutcomeStamp outcome={a.outcome} />}
                        {a?.tally && (
                          <span className={`font-mono tnum ${a.tally.no > 0 ? "text-seal" : "text-muted"}`}>
                            {a.tally.yes}–{a.tally.no}
                          </span>
                        )}
                        {m.money && <span className="font-mono">{formatMoney(m.money.amount, { compact: true })}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function pickHighlights(items: Matter[], meeting: Meeting, n: number) {
  const score = (m: Matter) => {
    const a = m.actions.find((x) => x.meetingId === meeting.id);
    let s = 0;
    if (m.category === "ceremonial") s -= 50;
    if (/^Report of the Committee/i.test(m.title)) s -= 40;
    if (m.money) s += Math.log10(m.money.amount + 1) * 2;
    if (a?.tally && a.tally.no > 0) s += 10 + a.tally.no;
    if (a?.outcome === "failed") s += 12;
    if (a?.outcome === "passed") s += 3;
    if (["housing", "public-safety", "zoning", "transportation", "health"].includes(m.category)) s += 2;
    return s;
  };
  return [...items].sort((x, y) => score(y) - score(x)).slice(0, n);
}
