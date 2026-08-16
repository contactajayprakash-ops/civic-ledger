// Nominatim (OpenStreetMap) geocoding with a local cache and a polite
// one-request-per-second pace, per their usage policy.

import fs from "node:fs";
import path from "node:path";
import { sleep } from "./util";

const CACHE_FILE = path.join(process.cwd(), "data", "geocache.json");
let cache: Record<string, { lat: number; lng: number } | null> | null = null;

function loadCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    cache = {};
  }
  return cache!;
}
function saveCache() {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 0));
}

let lastCall = 0;

export async function geocode(query: string, near: { city: string; state: string; lat: number; lng: number }): Promise<{ lat: number; lng: number } | null> {
  const c = loadCache();
  const key = `${query}|${near.city},${near.state}`.toLowerCase();
  if (key in c) return c[key];
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const q = /,\s*[A-Z]{2}\b/.test(query) ? query : `${query}, ${near.city}, ${near.state}`;
  // A viewbox roughly 25 km around the city keeps "Main Street" in the right city.
  const d = 0.25;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&bounded=1&viewbox=${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { "user-agent": "CivicLedger/1.0 (civic transparency project; github.com/contactajayprakash-ops/civic-ledger)" } });
    const j = (await res.json()) as { lat: string; lon: string }[];
    const hit = j?.[0] ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) } : null;
    c[key] = hit;
    saveCache();
    return hit;
  } catch {
    return null;
  }
}

// Street addresses and intersections that show up in titles: "6300 Penn Avenue",
// "the intersection of Forbes Avenue and Murray Avenue", "Frick Park".
const STREET = "(?:Street|St\\.?|Avenue|Ave\\.?|Boulevard|Blvd\\.?|Road|Rd\\.?|Drive|Dr\\.?|Way|Lane|Ln\\.?|Place|Pl\\.?|Court|Ct\\.?|Parkway|Pkwy\\.?|Terrace|Highway|Hwy\\.?|Bridge|Trail)";
const ADDRESS = new RegExp(`\\b(\\d{2,5}(?:-\\d{2,5})?\\s+(?:[A-Z][a-z]+\\.?\\s+){1,3}${STREET})\\b`);
const INTERSECTION = new RegExp(`\\b((?:[A-Z][a-z]+\\s+){1,3}${STREET})\\s+(?:and|&|at)\\s+((?:[A-Z][a-z]+\\s+){1,3}${STREET})\\b`);
const PLACE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:Park|Playground|Recreation Center|Library|Pool|Field|Plaza|Square|Cemetery|Bridge))\b/;

export function findPlaceText(title: string, text?: string): string | null {
  const hay = `${title} ${(text || "").slice(0, 1200)}`;
  const a = hay.match(ADDRESS);
  if (a) return a[1];
  const i = hay.match(INTERSECTION);
  if (i) return `${i[1]} and ${i[2]}`;
  const p = hay.match(PLACE);
  if (p) return p[1];
  return null;
}
