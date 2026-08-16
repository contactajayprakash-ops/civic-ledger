"use client";

import { useEffect, useRef, useState } from "react";
import type { Matter } from "@/lib/types";
import { formatMoney } from "@/lib/heuristics";
import { CategoryChip, OutcomeStamp } from "./bits";

interface Found {
  url: string;
  title: string;
  description?: string;
}
interface DocInfo {
  title: string;
  via: string;
  words: number;
  contentType?: string;
}

export function LiveReader({ initialQuery, initialUrl, canSearch, canRead }: { initialQuery: string; initialUrl: string; canSearch: boolean; canRead: boolean }) {
  const [cityQ, setCityQ] = useState(initialQuery);
  const [found, setFound] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState("");
  const [doc, setDoc] = useState<DocInfo | null>(null);
  const [progress, setProgress] = useState<{ i: number; total: number } | null>(null);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<{ count: number; chunks: number; truncated: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (initialQuery && canSearch) void findCity(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function findCity(q: string) {
    if (!q.trim()) return;
    setSearching(true);
    setFound([]);
    setError("");
    try {
      const res = await fetch(`/api/find?q=${encodeURIComponent(q)}`);
      const j = await res.json();
      if (j.error) setError(j.error);
      setFound(j.results || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function read(target: string) {
    if (!target.trim() || running) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setUrl(target);
    setRunning(true);
    setError("");
    setDoc(null);
    setMatters([]);
    setProgress(null);
    setDone(null);
    setStatus("Starting…");
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target, cityName: cityQ }),
        signal: ac.signal,
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
          const ev = JSON.parse(line);
          if (ev.status) setStatus(ev.status);
          if (ev.doc) setDoc(ev.doc);
          if (ev.chunk) setProgress({ i: ev.chunk.i, total: ev.chunk.total });
          if (ev.matter) setMatters((m) => [...m, ev.matter]);
          if (ev.done) {
            setDone(ev.done);
            setStatus("");
          }
          if (ev.error) setError(ev.error);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const money = matters.reduce((n, m) => n + (m.money && m.latestOutcome === "passed" && m.money.kind !== "receive" ? m.money.amount : 0), 0);

  return (
    <div className="grid gap-10 lg:grid-cols-[380px_1fr]">
      <div className="space-y-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void findCity(cityQ);
          }}
          className="card p-4"
        >
          <label className="eyebrow block mb-1.5" htmlFor="cityq">
            1 · Find a city&apos;s agendas
          </label>
          <div className="flex gap-2">
            <input id="cityq" className="input" placeholder="e.g. Evanston, IL" value={cityQ} onChange={(e) => setCityQ(e.target.value)} disabled={!canSearch} />
            <button className="btn shrink-0" disabled={!canSearch || searching}>
              {searching ? "…" : "Search"}
            </button>
          </div>
          {!canSearch && <p className="mt-2 text-xs text-muted">Search needs a Firecrawl key on this deployment; you can still paste a link below.</p>}
          {found.length > 0 && (
            <ul className="mt-3 divide-y divide-rule">
              {found.map((f) => (
                <li key={f.url} className="py-2">
                  <button type="button" onClick={() => read(f.url)} className="text-left w-full hover:underline underline-offset-2">
                    <span className="text-sm leading-snug block">{f.title || f.url}</span>
                    <span className="text-xs text-muted break-all">{f.url}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void read(url);
          }}
          className="card p-4"
        >
          <label className="eyebrow block mb-1.5" htmlFor="url">
            2 · Or paste an agenda / minutes link
          </label>
          <input id="url" className="input" placeholder="https://…/agenda.pdf" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="mt-2 flex items-center gap-2">
            <button className="btn btn-seal" disabled={!canRead || running || !url.trim()}>
              {running ? "Reading…" : "Read it"}
            </button>
            {running && (
              <button type="button" className="btn btn-ghost" onClick={() => abortRef.current?.abort()}>
                Stop
              </button>
            )}
          </div>
          {!canRead && <p className="mt-2 text-xs text-muted">Reading needs a language-model key on this deployment.</p>}
          <p className="mt-3 text-xs text-muted leading-relaxed">
            Works best on a single meeting&apos;s agenda or minutes. Long packets are read up to about 50,000 characters within the
            request time limit; the ingest CLI has no such cap.
          </p>
        </form>
        <p className="text-xs text-muted leading-relaxed">
          Cities on Legistar can be added permanently with <code className="font-mono">npm run ingest -- --city &lt;slug&gt;</code>, which also
          pulls roll-call votes and full legislative text. See the README.
        </p>
      </div>

      <div>
        {(status || doc || matters.length > 0 || error) && (
          <div className="border-b border-ink pb-3 mb-4">
            {doc && (
              <p className="text-sm">
                <span className="font-medium">{doc.title}</span>
                <span className="text-muted">
                  {" "}
                  · {doc.words.toLocaleString()} words · read via {doc.via === "firecrawl" ? "Firecrawl" : "direct fetch"}
                </span>
              </p>
            )}
            {status && (
              <p className="text-sm text-muted mt-1 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-seal animate-pulse" />
                {status}
                {progress && (
                  <span className="font-mono text-xs">
                    part {progress.i}/{progress.total}
                  </span>
                )}
              </p>
            )}
            {done && (
              <p className="text-sm mt-1">
                Found <span className="font-mono">{done.count}</span> items in {done.chunks} part{done.chunks === 1 ? "" : "s"}
                {money > 0 && (
                  <>
                    {" "}
                    · <span className="font-mono">{formatMoney(money, { compact: true })}</span> approved
                  </>
                )}
                {done.truncated && <span className="text-muted"> · document was longer than the live limit; results are partial</span>}
              </p>
            )}
            {error && <p className="text-sm text-seal mt-1">{error}</p>}
          </div>
        )}
        {matters.length === 0 && !running && !error && (
          <div className="card p-10 text-center text-muted text-sm">
            Results appear here as each item is read.
          </div>
        )}
        <ol className="space-y-3">
          {matters.map((m) => (
            <li key={m.id} className="card p-4 fade-up">
              <div className="flex items-start justify-between gap-3">
                <p className="leading-snug">{m.plain}</p>
                <OutcomeStamp outcome={m.latestOutcome} />
              </div>
              <p className="mt-1 text-[0.8125rem] text-muted leading-snug">{m.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <CategoryChip category={m.category} small />
                {m.money && <span className="font-mono text-sm">{formatMoney(m.money.amount, { compact: true })}</span>}
                {m.actions[0]?.tally && (
                  <span className="font-mono text-xs text-muted">
                    {m.actions[0].tally.yes}–{m.actions[0].tally.no}
                  </span>
                )}
                {m.whoItAffects && <span className="text-xs text-muted">· {m.whoItAffects}</span>}
                {m.location?.text && <span className="text-xs text-muted">· {m.location.text}</span>}
              </div>
              {m.textExcerpt && <p className="mt-2 text-xs text-ink-2 border-l-2 border-rule pl-3 italic">“{m.textExcerpt}”</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
