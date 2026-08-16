import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCity, meetingById } from "@/lib/store";
import { CATEGORIES, CATEGORY_LABEL, type Category, type Matter } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { formatMoney } from "@/lib/heuristics";
import { MatterRow, SectionHead } from "@/components/bits";

export default async function MeetingPage({ params }: { params: Promise<{ city: string; id: string }> }) {
  const { city, id } = await params;
  const snap = loadCity(city);
  if (!snap) notFound();
  const meeting = meetingById(snap, id);
  if (!meeting) notFound();
  const byId = new Map(snap.matters.map((m) => [m.id, m]));
  const items = meeting.matterIds.map((i) => byId.get(i)).filter((m): m is Matter => Boolean(m));
  const idx = snap.meetings.findIndex((m) => m.id === id);
  const prev = snap.meetings[idx - 1];
  const next = snap.meetings[idx + 1];
  const money = items.reduce((n, m) => {
    const a = m.actions.find((x) => x.meetingId === id);
    return n + (m.money && a?.outcome === "passed" && m.money.kind !== "receive" ? m.money.amount : 0);
  }, 0);
  const contested = items.filter((m) => m.actions.some((a) => a.meetingId === id && a.tally && a.tally.no > 0));
  const groups = CATEGORIES.map((c) => [c, items.filter((m) => m.category === c)] as [Category, Matter[]]).filter(([, l]) => l.length);

  return (
    <div className="max-w-4xl">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow">
            {meeting.body} · {meeting.status || ""}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl leading-tight mt-1">{fmtDate(meeting.date, { weekday: true })}</h1>
          {meeting.location && <p className="text-sm text-muted mt-1">{meeting.location}{meeting.time ? ` · ${meeting.time}` : ""}</p>}
        </div>
        <div className="flex gap-2 text-sm">
          {prev && (
            <Link href={`/${city}/meetings/${prev.id}`} className="btn btn-ghost">
              ← {fmtDate(prev.date, { year: false })}
            </Link>
          )}
          {next && (
            <Link href={`/${city}/meetings/${next.id}`} className="btn btn-ghost">
              {fmtDate(next.date, { year: false })} →
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 border-y border-rule py-4">
        <div>
          <p className="eyebrow">Items</p>
          <p className="font-display text-3xl tnum">{items.length}</p>
        </div>
        <div>
          <p className="eyebrow">Authorized</p>
          <p className="font-display text-3xl tnum">{formatMoney(money, { compact: true })}</p>
        </div>
        <div>
          <p className="eyebrow">Contested</p>
          <p className={`font-display text-3xl tnum ${contested.length ? "text-seal" : ""}`}>{contested.length}</p>
        </div>
      </div>

      {meeting.digest && (
        <section className="mt-8">
          <p className="eyebrow mb-2">Recap</p>
          <p className="text-[1.0625rem] leading-relaxed">{meeting.digest}</p>
        </section>
      )}

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        {meeting.agendaUrl && (
          <a className="underline underline-offset-2" href={meeting.agendaUrl} target="_blank" rel="noreferrer">
            Agenda (PDF) ↗
          </a>
        )}
        {meeting.minutesUrl && (
          <a className="underline underline-offset-2" href={meeting.minutesUrl} target="_blank" rel="noreferrer">
            Minutes (PDF) ↗
          </a>
        )}
        <a className="underline underline-offset-2" href={meeting.sourceUrl} target="_blank" rel="noreferrer">
          Meeting record ↗
        </a>
      </div>

      {contested.length > 0 && (
        <section className="mt-10">
          <SectionHead kicker="Not unanimous" title="Contested votes" />
          <ul>
            {contested.map((m) => (
              <MatterRow key={m.id} m={m} city={city} showDate={false} />
            ))}
          </ul>
        </section>
      )}

      {groups.map(([cat, list]) => (
        <section className="mt-10" key={cat}>
          <SectionHead kicker={`${list.length} item${list.length === 1 ? "" : "s"}`} title={CATEGORY_LABEL[cat]} />
          <ul>
            {list.map((m) => (
              <MatterRow key={m.id} m={m} city={city} showDate={false} dense />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
