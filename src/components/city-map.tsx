"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Category, Outcome } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { formatMoney } from "@/lib/heuristics";
import { fmtDateShort } from "@/lib/format";
import { CategoryChip, OutcomeStamp } from "./bits";

export interface Pin {
  id: string;
  lat: number;
  lng: number;
  where: string;
  text: string;
  category: Category;
  outcome: Outcome;
  money?: number;
  date: string;
  district?: string;
}

// Leaflet touches `window` at import time, so the map itself is client-only.
const LeafletMap = dynamic(() => import("./leaflet-map").then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => <div className="h-[520px] card animate-pulse" />,
});

export function CityMap({ city, cityName, center, pins, total }: { city: string; cityName: string; center: [number, number]; pins: Pin[]; total: number }) {
  const [address, setAddress] = useState("");
  const [me, setMe] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [radius, setRadius] = useState(1.5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const near = useMemo(() => {
    if (!me) return null;
    return pins
      .map((p) => ({ p, d: haversineKm(me.lat, me.lng, p.lat, p.lng) }))
      .filter((x) => x.d <= radius)
      .sort((a, b) => a.d - b.d);
  }, [me, pins, radius]);

  async function locate(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/geocode?city=${city}&q=${encodeURIComponent(address)}`);
      const j = await res.json();
      if (!j.lat) throw new Error(j.error || "Couldn't find that address");
      setMe({ lat: j.lat, lng: j.lng, label: j.label || address });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const list = near ? near.map((x) => x.p) : pins;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <LeafletMap center={center} pins={pins} me={me} radiusKm={near ? radius : 0} onSelect={setSelected} selected={selected} city={city} />
        <p className="mt-2 text-xs text-muted">
          {pins.length} of {total} items name a specific place. Pins are the addresses, intersections and parks found in each item&apos;s title
          or text; the rest apply citywide or don&apos;t name a location. Map tiles © OpenStreetMap contributors, CARTO.
        </p>
      </div>
      <aside>
        <form onSubmit={locate} className="card p-4">
          <label className="eyebrow block mb-1.5" htmlFor="addr">
            What was decided near me?
          </label>
          <div className="flex gap-2">
            <input id="addr" className="input" placeholder={`Street address in ${cityName}`} value={address} onChange={(e) => setAddress(e.target.value)} />
            <button className="btn shrink-0" disabled={busy}>
              {busy ? "…" : "Find"}
            </button>
          </div>
          {err && <p className="mt-2 text-xs text-seal">{err}</p>}
          {me && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="text-muted">Within</span>
              {[0.5, 1.5, 3, 8].map((r) => (
                <button key={r} type="button" className="chip cursor-pointer" data-on={radius === r ? "true" : undefined} onClick={() => setRadius(r)}>
                  {r} km
                </button>
              ))}
              <button type="button" className="ml-auto text-xs underline text-muted" onClick={() => setMe(null)}>
                clear
              </button>
            </div>
          )}
        </form>
        <div className="mt-4">
          <p className="eyebrow mb-2">
            {near ? `${list.length} items within ${radius} km of ${me?.label}` : `${list.length} placed items`}
          </p>
          <ul className="divide-y divide-rule max-h-[440px] overflow-auto pr-1">
            {list.slice(0, 80).map((p) => (
              <li key={p.id} className={`py-3 ${selected === p.id ? "bg-paper-2 -mx-2 px-2 rounded" : ""}`} onMouseEnter={() => setSelected(p.id)}>
                <Link href={`/${city}/decisions/${p.id}`} className="block text-sm leading-snug hover:underline underline-offset-2">
                  {p.text}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <CategoryChip category={p.category} small />
                  <OutcomeStamp outcome={p.outcome} />
                  {p.money ? <span className="font-mono text-xs">{formatMoney(p.money, { compact: true })}</span> : null}
                  <span className="text-xs text-muted ml-auto">{p.where} · {fmtDateShort(p.date)}</span>
                </div>
              </li>
            ))}
            {list.length === 0 && <li className="py-6 text-sm text-muted text-center">{near ? "Nothing placed within that distance." : "No items in this snapshot name a specific place yet."}</li>}
          </ul>
        </div>
      </aside>
    </div>
  );
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export { CATEGORY_LABEL };
