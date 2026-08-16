"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OutcomeStamp } from "./bits";
import type { Outcome } from "@/lib/types";
import { fmtDateShort } from "@/lib/format";

interface Source {
  n: number;
  id: string;
  file: string;
  date: string;
  outcome: Outcome;
  text: string;
}
interface Turn {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: string;
}

export function AskPanel({ city, cityName, available, suggestions }: { city: string; cityName: string; available: boolean; suggestions: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ city, question: text, history }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const j = JSON.parse(line) as { sources?: Source[]; delta?: string; error?: string };
          setTurns((t) => {
            const next = [...t];
            const last = { ...next[next.length - 1] };
            if (j.sources) last.sources = j.sources;
            if (j.delta) last.content += j.delta;
            if (j.error) last.error = j.error;
            next[next.length - 1] = last;
            return next;
          });
        }
      }
    } catch (e) {
      setTurns((t) => {
        const next = [...t];
        next[next.length - 1] = { ...next[next.length - 1], error: (e as Error).message };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="max-w-3xl">
        <div className="mb-6">
          <p className="eyebrow">Ask the record</p>
          <h2 className="font-display text-3xl mt-1">Questions about what {cityName} decided</h2>
          <p className="mt-2 text-[0.9375rem] text-ink-2 max-w-xl">
            Answers are written from the items in this snapshot and cite them by number. Nothing here is generated from
            general knowledge; if the record doesn&apos;t say, the answer will say so.
          </p>
        </div>

        {!available && (
          <div className="card p-4 mb-6 text-sm">
            A language model isn&apos;t configured on this deployment, so live questions are off. Browsing, search, votes, money and
            the map all still work.
          </div>
        )}

        <div className="space-y-6">
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="bg-ink text-paper rounded-2xl rounded-br-sm px-4 py-2 max-w-[80%] text-[0.9375rem]">{t.content}</p>
              </div>
            ) : (
              <div key={i} className="fade-up">
                <div className="text-[1.0625rem] leading-relaxed">
                  {t.content ? renderWithCitations(t.content, t.sources || [], city) : !t.error ? <span className="cursor-blink">▍</span> : null}
                </div>
                {t.error && <p className="text-sm text-seal mt-2">Something went wrong: {t.error}</p>}
                {t.sources && t.sources.length > 0 && (
                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-xs text-muted list-none flex items-center gap-1.5">
                      <span className="underline underline-offset-2">{t.sources.length} items considered</span>
                      <span className="group-open:rotate-90 transition-transform">›</span>
                    </summary>
                    <ol className="mt-2 space-y-1.5">
                      {t.sources.map((s) => (
                        <li key={s.n} className="text-sm flex gap-2 items-baseline">
                          <span className="font-mono text-xs text-seal w-6 shrink-0">[{s.n}]</span>
                          <Link href={`/${city}/decisions/${s.id}`} className="hover:underline underline-offset-2 leading-snug">
                            {s.text}
                          </Link>
                          <span className="ml-auto shrink-0 flex items-center gap-2 text-xs text-muted">
                            {fmtDateShort(s.date)} <OutcomeStamp outcome={s.outcome} />
                          </span>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
          className={`flex gap-2 ${turns.length ? "mt-8 sticky bottom-4" : ""}`}
        >
          <input className="input shadow-lift" placeholder={`Ask about ${cityName}…`} value={q} onChange={(e) => setQ(e.target.value)} disabled={!available || busy} />
          <button className="btn btn-seal shrink-0" disabled={!available || busy || !q.trim()}>
            {busy ? "Thinking…" : "Ask"}
          </button>
        </form>
      </div>
      <aside className="no-print">
        <p className="eyebrow mb-2">Try one</p>
        <ul className="space-y-1.5">
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => ask(s)} disabled={!available || busy} className="text-left text-sm w-full card px-3 py-2 hover:bg-paper-2 disabled:opacity-50">
                {s}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted leading-relaxed">
          Retrieval is keyword search over the snapshot (titles, plain-language summaries, tags, sponsors, file numbers). The
          model sees at most ten items per question.
        </p>
      </aside>
    </div>
  );
}

// Turns "[3]" and "[1][4]" into links to the cited items.
function renderWithCitations(text: string, sources: Source[], city: string) {
  const parts = text.split(/(\[\d+\](?:\[\d+\])*)/g);
  return parts.map((part, i) => {
    if (/^(\[\d+\])+$/.test(part)) {
      const nums = [...part.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      return (
        <span key={i} className="inline-flex gap-0.5 align-super ml-0.5">
          {nums.map((n) => {
            const s = sources.find((x) => x.n === n);
            return s ? (
              <Link key={n} href={`/${city}/decisions/${s.id}`} className="font-mono text-[0.7rem] text-seal hover:underline" title={s.text}>
                {n}
              </Link>
            ) : (
              <span key={n} className="font-mono text-[0.7rem] text-muted">
                {n}
              </span>
            );
          })}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
