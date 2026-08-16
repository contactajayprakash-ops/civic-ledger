import Link from "next/link";
import { loadAllCities, computeStats, headlineMatters } from "@/lib/store";
import { formatMoney } from "@/lib/heuristics";
import { fmtDate, truncate } from "@/lib/format";
import { CategoryChip, OutcomeStamp, SectionHead } from "@/components/bits";
import { CityFinder } from "@/components/city-finder";

export const dynamic = "force-static";

export default function Home() {
  const cities = loadAllCities();
  const totals = cities.reduce(
    (acc, c) => {
      const s = computeStats(c);
      acc.meetings += s.meetings;
      acc.matters += s.matters;
      acc.dollars += s.dollarsAuthorized;
      acc.votes += c.matters.reduce((n, m) => n + m.actions.filter((a) => a.votes.length).length, 0);
      return acc;
    },
    { meetings: 0, matters: 0, dollars: 0, votes: 0 },
  );
  // A few fresh, consequential items across all cities for the front page.
  const fresh = cities
    .flatMap((c) => headlineMatters(c, 3).map((m) => ({ m, c })))
    .sort((a, b) => (b.m.decidedOn || "").localeCompare(a.m.decidedOn || ""))
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="pt-14 pb-10 grid gap-10 lg:grid-cols-[1.2fr_1fr] items-end">
        <div>
          <p className="eyebrow mb-4">The public record, readable</p>
          <h1 className="font-display text-[2.6rem] sm:text-6xl leading-[1.02] tracking-tight">
            What did your city council decide <span className="italic font-light">last week?</span>
          </h1>
          <p className="mt-6 text-lg text-ink-2 max-w-xl leading-relaxed">
            Council agendas and minutes are public, but they are long, legal, and scattered across PDFs. Civic Ledger
            reads every meeting, every roll-call vote and every dollar, explains each item in plain language, and links
            back to the source document.
          </p>
          <div className="mt-8">
            <CityFinder
              cities={cities.map((c) => ({ slug: c.city.slug, name: c.city.name, state: c.city.state, matters: c.matters.length }))}
            />
          </div>
        </div>
        <div className="card p-6 sm:p-7 shadow-lift">
          <p className="eyebrow">Tracked so far</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-5">
            <Stat label="cities" value={cities.length.toString()} />
            <Stat label="council meetings" value={totals.meetings.toLocaleString()} />
            <Stat label="decisions explained" value={totals.matters.toLocaleString()} />
            <Stat label="authorized, last 90 days" value={formatMoney(totals.dollars, { compact: true })} />
          </dl>
          <p className="mt-5 text-[0.8125rem] text-muted leading-snug">
            Counts cover the trailing 90 days for each city. Dollar figures are the headline amounts named in items
            that passed, excluding money the city received.
          </p>
        </div>
      </section>

      <section id="cities" className="mt-8">
        <SectionHead kicker="Cities" title="Pick a city" />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((c) => {
            const s = computeStats(c);
            const latest = c.meetings[c.meetings.length - 1];
            return (
              <li key={c.city.slug}>
                <Link href={`/${c.city.slug}`} className="card block p-5 h-full hover:shadow-lift hover:-translate-y-0.5 transition-all">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-2xl leading-none">
                      {c.city.name}
                      <span className="text-muted text-base font-sans ml-2">{c.city.state}</span>
                    </h3>
                    <span className="eyebrow">{c.city.source.kind === "legistar" ? "Legistar" : "web"}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-[0.8125rem]">
                    <div>
                      <dt className="eyebrow">meetings</dt>
                      <dd className="font-mono tnum mt-0.5">{s.meetings}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">decisions</dt>
                      <dd className="font-mono tnum mt-0.5">{s.matters}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">authorized</dt>
                      <dd className="font-mono tnum mt-0.5">{formatMoney(s.dollarsAuthorized, { compact: true })}</dd>
                    </div>
                  </dl>
                  {latest && (
                    <p className="mt-4 text-[0.8125rem] text-muted">
                      Latest: {latest.body}, {fmtDate(latest.date)}
                      {s.contestedVotes ? ` · ${s.contestedVotes} contested vote${s.contestedVotes === 1 ? "" : "s"}` : ""}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
          <li>
            <Link href="/live" className="card block p-5 h-full border-dashed hover:shadow-lift hover:-translate-y-0.5 transition-all">
              <h3 className="font-display text-2xl leading-none">Your city isn&apos;t here?</h3>
              <p className="mt-3 text-[0.9375rem] text-ink-2">
                Paste a link to any council agenda or minutes page and Civic Ledger reads it on the spot. Cities that
                use Legistar can be added permanently in one command.
              </p>
              <p className="mt-4 text-sm underline underline-offset-2">Read any agenda →</p>
            </Link>
          </li>
        </ul>
      </section>

      {fresh.length > 0 && (
        <section className="mt-16">
          <SectionHead kicker="Recently decided" title="Across tracked cities" />
          <ul className="grid gap-4 md:grid-cols-2">
            {fresh.map(({ m, c }) => (
              <li key={m.id} className="card p-5">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/${c.city.slug}`} className="eyebrow hover:text-ink">
                    {c.city.name}, {c.city.state} · {fmtDate(m.decidedOn || m.actions[m.actions.length - 1]?.date || "")}
                  </Link>
                  <OutcomeStamp outcome={m.latestOutcome} />
                </div>
                <Link href={`/${c.city.slug}/decisions/${m.id}`} className="block mt-3 text-[1.0625rem] leading-snug hover:underline underline-offset-2">
                  {m.plain || truncate(m.title, 180)}
                </Link>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <CategoryChip category={m.category} small />
                  {m.money && <span className="font-mono text-[0.8125rem]">{formatMoney(m.money.amount, { compact: true })}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-16 grid gap-8 md:grid-cols-3">
        <Step
          n="1"
          title="Read the record"
          body="For the ~300 cities on Legistar we read meetings, agenda items, roll-call votes and full legislative text from the public API. For everyone else, Firecrawl turns agenda pages and PDFs into clean text."
        />
        <Step
          n="2"
          title="Explain each item"
          body="An open-weight language model rewrites each ordinance and resolution in one to three plain sentences, names who it affects and the headline dollar figure, and files it under a topic. It cannot invent votes or amounts; those come from the record."
        />
        <Step
          n="3"
          title="Show your work"
          body="Every summary keeps a link to the original file, the official title, and the exact roll call. Weekly recaps and an RSS feed mean you can follow a city without ever opening a PDF."
        />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="font-display text-3xl tnum mt-1 leading-none">{value}</dd>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="border-t border-ink pt-4">
      <p className="font-mono text-sm text-seal">{n}</p>
      <h3 className="font-display text-xl mt-1">{title}</h3>
      <p className="mt-2 text-[0.9375rem] text-ink-2 leading-relaxed">{body}</p>
    </div>
  );
}
