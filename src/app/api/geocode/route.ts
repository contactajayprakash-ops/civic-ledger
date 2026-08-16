import { NextResponse } from "next/server";
import { cityDef } from "@/lib/cities";
import { loadCity } from "@/lib/store";

// Forward-geocodes a street address inside a tracked city via Nominatim.
// Runs server-side so the browser never talks to OSM directly and the
// user-agent policy is honored in one place.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const slug = url.searchParams.get("city") || "";
  const c = cityDef(slug) || loadCity(slug)?.city;
  if (!q || !c) return NextResponse.json({ error: "Missing address or city" }, { status: 400 });
  const d = 0.3;
  const query = /,\s*[A-Z]{2}\b/i.test(q) ? q : `${q}, ${c.name}, ${c.state}`;
  const nurl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&bounded=1&viewbox=${c.lng - d},${c.lat + d},${c.lng + d},${c.lat - d}&q=${encodeURIComponent(query)}`;
  const res = await fetch(nurl, {
    headers: { "user-agent": "CivicLedger/1.0 (civic transparency project; github.com/contactajayprakash-ops/civic-ledger)" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return NextResponse.json({ error: "Geocoder unavailable" }, { status: 502 });
  const j = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  if (!j?.[0]) return NextResponse.json({ error: `Couldn't find “${q}” in ${c.name}` }, { status: 404 });
  return NextResponse.json({ lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), label: j[0].display_name.split(",").slice(0, 2).join(",") });
}
