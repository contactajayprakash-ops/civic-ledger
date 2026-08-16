import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCity, matterById, meetingById } from "@/lib/store";
import { CATEGORY_LABEL } from "@/lib/types";
import { formatMoney } from "@/lib/heuristics";
import { fmtDate, OUTCOME_LABEL, OUTCOME_COLOR } from "@/lib/format";
import { CategoryChip, OutcomeStamp, SectionHead } from "@/components/bits";
import { RollCall } from "@/components/roll-call";
import { ShareRow } from "@/components/share-row";

export async function generateMetadata({ params }: { params: Promise<{ city: string; id: string }> }) {
  const { city, id } = await params;
  const snap = loadCity(city);
  const m = snap ? matterById(snap, id) : null;
  if (!snap || !m) return {};
  return { title: `${m.plain ? m.plain.slice(0, 80) : m.file} · ${snap.city.name}`, description: m.plain || m.title.slice(0, 200) };
}

export default async function DecisionPage({ params }: { params: Promise<{ city: string; id: string }> }) {
  const { city, id } = await params;
  const snap = loadCity(city);
  if (!snap) notFound();
  const m = matterById(snap, id);
  if (!m) notFound();
  const related = snap.matters
    .filter((x) => x.id !== m.id && x.category === m.category && x.category !== "ceremonial")
    .filter((x) => m.tags.some((t) => x.tags.includes(t)) || (m.district && x.district === m.district))
    .slice(0, 5);

  return (
    <article className="max-w-3xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="eyebrow">
          {m.type} {m.file} · {snap.city.name} {m.actions[m.actions.length - 1]?.body}
        </p>
        <OutcomeStamp outcome={m.latestOutcome} />
      </div>
      <h1 className="font-display text-3xl sm:text-4xl leading-tight mt-3">{m.plain || m.title}</h1>
      {m.plain && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-sm text-muted list-none flex items-center gap-2">
            <span className="underline underline-offset-2">Official title</span>
            <span className="group-open:rotate-90 transition-transform">›</span>
          </summary>
          <p className="mt-2 text-[0.9375rem] text-ink-2 leading-relaxed border-l-2 border-rule pl-4">{m.title}</p>
        </details>
      )}

      <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-y border-rule py-4">
        <div>
          <dt className="eyebrow">Topic</dt>
          <dd className="mt-1">
            <CategoryChip category={m.category} />
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Money</dt>
          <dd className="mt-1 font-mono tnum">
            {m.money ? (
              <>
                {formatMoney(m.money.amount)}
                <span className="block text-[0.6875rem] text-muted uppercase tracking-wider">{moneyKind(m.money.kind)}</span>
              </>
            ) : (
              <span className="text-muted">none named</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Who it affects</dt>
          <dd className="mt-1 text-sm">{m.whoItAffects || (m.district ? `Council District ${m.district}` : "—")}</dd>
        </div>
        <div>
          <dt className="eyebrow">Sponsors</dt>
          <dd className="mt-1 text-sm">{m.sponsors.length ? m.sponsors.join(", ") : "—"}</dd>
        </div>
      </dl>
      {(m.money?.recipient || m.money?.note || m.location?.text) && (
        <p className="mt-3 text-sm text-ink-2">
          {m.money?.recipient && (
            <>
              <span className="text-muted">Recipient:</span> {m.money.recipient}.{" "}
            </>
          )}
          {m.money?.note && <>{m.money.note}. </>}
          {m.location?.text && (
            <>
              <span className="text-muted">Where:</span> {m.location.text}.
            </>
          )}
        </p>
      )}
      {m.tags.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1.5">
          {m.tags.map((t) => (
            <Link key={t} href={`/${city}/decisions?q=${encodeURIComponent(t)}`} className="chip hover:bg-paper-2">
              {t}
            </Link>
          ))}
        </p>
      )}

      <section className="mt-10">
        <SectionHead kicker="Record" title="What happened, and who voted how" />
        <ol className="space-y-6">
          {m.actions.map((a, i) => {
            const meeting = meetingById(snap, a.meetingId);
            return (
              <li key={i} className="grid sm:grid-cols-[140px_1fr] gap-2 sm:gap-6">
                <div>
                  <p className="font-mono text-sm tnum">{fmtDate(a.date)}</p>
                  <p className="text-xs text-muted">{a.body}</p>
                  {meeting && (
                    <Link href={`/${city}/meetings/${meeting.id}`} className="text-xs underline underline-offset-2 text-muted hover:text-ink">
                      meeting page
                    </Link>
                  )}
                </div>
                <div>
                  <p className="text-[1.0625rem]">
                    <span className={`font-medium ${OUTCOME_COLOR[a.outcome]}`}>{OUTCOME_LABEL[a.outcome]}</span>
                    <span className="text-muted"> · {a.action || "no action recorded"}</span>
                    {a.tally && (
                      <span className="font-mono tnum text-sm ml-2">
                        {a.tally.yes}–{a.tally.no}
                        {a.tally.abstain ? `, ${a.tally.abstain} abstaining` : ""}
                        {a.tally.absent ? `, ${a.tally.absent} absent` : ""}
                      </span>
                    )}
                  </p>
                  {a.votes.length > 0 && <RollCall votes={a.votes} />}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {m.textExcerpt && (
        <section className="mt-10">
          <SectionHead kicker="Source text" title="From the legislative file" />
          <pre className="whitespace-pre-wrap font-sans text-[0.9375rem] leading-relaxed text-ink-2 bg-paper-2/60 border border-rule rounded-lg p-5 max-h-[420px] overflow-auto">
            {m.textExcerpt}
            {m.textLength && m.textLength > m.textExcerpt.length ? `\n\n[… ${(m.textLength - m.textExcerpt.length).toLocaleString()} more characters in the original]` : ""}
          </pre>
        </section>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="btn">
          Open the original record ↗
        </a>
        <ShareRow title={m.plain || m.title} />
        <span className="text-xs text-muted ml-auto">
          {m.enrichment === "llm"
            ? `Plain-language summary written by ${snap.city.llmModel?.split("/").pop() || "a language model"}; votes, amounts and dates come from the record.`
            : "Summary not yet generated; showing the official title. Votes, amounts and dates come from the record."}
        </span>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <SectionHead kicker={CATEGORY_LABEL[m.category]} title="Related items" />
          <ul className="divide-y divide-rule">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/${city}/decisions/${r.id}`} className="block py-3 hover:underline underline-offset-2">
                  <span className="font-mono text-xs text-muted mr-2">{r.file}</span>
                  {r.plain || r.title.slice(0, 160)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function moneyKind(k: string) {
  return { spend: "city spends", receive: "city receives", transfer: "moved between accounts", budget: "budgeted", unknown: "amount named" }[k] || k;
}
