// Build or refresh a city snapshot.
//
//   npm run ingest -- --city pittsburgh --from 2026-05-01 --to 2026-08-16
//   npm run ingest -- --city madison --no-llm          # structure only
//   npm run ingest -- --list                            # known cities
//
// Snapshots are written to data/cities/<slug>.json and committed, so the
// deployed site never needs to talk to Legistar or a model at request time.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { pullLegistar } from "../src/lib/adapters/legistar";
import { enrichMatters, writeMeetingDigest } from "../src/lib/enrich";
import { llmConfig } from "../src/lib/llm";
import { computeMembers } from "../src/lib/store";
import { CITY_REGISTRY } from "../src/lib/cities";
import type { CitySnapshot, Matter } from "../src/lib/types";
import { mapLimit } from "../src/lib/util";
import { findPlaceText, geocode } from "../src/lib/geocode";

function arg(name: string, def?: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "true";
  return def;
}

async function main() {
  if (arg("list")) {
    for (const c of CITY_REGISTRY) console.log(`${c.slug.padEnd(14)} ${c.name}, ${c.state}  (${c.source.kind}${c.source.client ? ":" + c.source.client : ""})`);
    return;
  }
  const slug = arg("city");
  if (!slug) throw new Error("--city <slug> is required (see --list)");
  const city = CITY_REGISTRY.find((c) => c.slug === slug);
  if (!city) throw new Error(`Unknown city ${slug}. Add it to src/lib/cities.ts`);
  if (city.source.kind !== "legistar" || !city.source.client) throw new Error("Only Legistar cities can be ingested by this script; web sources run through /live");

  const to = arg("to", new Date().toISOString().slice(0, 10))!;
  const fromDefault = new Date(Date.parse(to) - 1000 * 60 * 60 * 24 * 90).toISOString().slice(0, 10);
  const from = arg("from", fromDefault)!;
  const useLlm = arg("no-llm") !== "true" && Boolean(llmConfig());
  const bodies = arg("bodies") ? new RegExp(arg("bodies")!, "i") : city.bodiesPattern || /council/i;
  const outDir = path.join(process.cwd(), "data", "cities");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${slug}.json`);

  console.log(`▸ ${city.name}, ${city.state}  ${from} → ${to}  bodies=${bodies}  llm=${useLlm ? llmConfig()!.model : "off"}`);
  const t0 = Date.now();
  const pulled = await pullLegistar({
    client: city.source.client,
    from,
    to,
    bodies,
    onProgress: (m) => console.log("  " + m),
  });
  console.log(`▸ ${pulled.meetings.length} meetings, ${pulled.matters.length} items in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Reuse plain-language summaries from a previous run when the title and
  // outcome haven't changed, so refreshes only pay for new items.
  let previous: CitySnapshot | null = null;
  if (fs.existsSync(outFile)) previous = JSON.parse(fs.readFileSync(outFile, "utf8"));
  const prevById = new Map((previous?.matters || []).map((m) => [m.id, m]));

  let matters: Matter[] = pulled.matters.map((m) => {
    const p = prevById.get(m.id);
    if (p && p.enrichment === "llm" && p.title === m.title) {
      return { ...m, plain: p.plain, whoItAffects: p.whoItAffects, category: p.category, tags: p.tags, money: p.money || m.money, location: p.location || m.location, enrichment: "llm" as const };
    }
    return m;
  });

  if (useLlm) {
    const todo = matters.filter((m) => m.enrichment !== "llm");
    console.log(`▸ Explaining ${todo.length} items in plain language (${matters.length - todo.length} reused)`);
    const enriched = await enrichMatters(todo, `${city.name}, ${city.state}`, {
      concurrency: llmConfig()!.concurrency,
      onProgress: (d, t, m) => {
        if (d % 10 === 0 || d === t) console.log(`  ${d}/${t}  ${m.file}  ${m.enrichment === "llm" ? "✓" : "· heuristic"}`);
      },
    });
    const byId = new Map(enriched.map((m) => [m.id, m]));
    matters = matters.map((m) => byId.get(m.id) || m);
  }

  // Put items on the map: model-found locations first, then addresses and
  // named places spotted in the title or text.
  if (arg("no-geocode") !== "true") {
    let placed = 0;
    let tried = 0;
    for (const m of matters) {
      const prev = prevById.get(m.id);
      if (prev?.location?.lat && prev.location.lng && (!m.location || prev.location.text === m.location.text)) {
        m.location = prev.location;
        placed++;
        continue;
      }
      const text = m.location?.text || findPlaceText(m.title, m.textExcerpt);
      if (!text || /^(city ?wide|citywide|various|n\/a|none|multiple)/i.test(text)) continue;
      tried++;
      const hit = await geocode(text, { city: city.name, state: city.state, lat: city.lat, lng: city.lng });
      if (hit) {
        m.location = { text, ...hit };
        placed++;
      } else if (m.location) {
        m.location = { text };
      }
    }
    console.log(`▸ Placed ${placed} items on the map (${tried} lookups)`);
  }

  const meetings = pulled.meetings;
  if (useLlm) {
    const prevMeet = new Map((previous?.meetings || []).map((m) => [m.id, m]));
    const need = meetings.filter((m) => !prevMeet.get(m.id)?.digest && m.matterIds.length > 0);
    console.log(`▸ Writing recaps for ${need.length} meetings`);
    await mapLimit(meetings, llmConfig()!.concurrency, async (m) => {
      const prev = prevMeet.get(m.id);
      if (prev?.digest && prev.matterIds.length === m.matterIds.length) {
        m.digest = prev.digest;
        return;
      }
      try {
        m.digest = await writeMeetingDigest(m, matters, city.name);
      } catch (e) {
        console.log(`  recap failed for ${m.date}: ${(e as Error).message}`);
      }
    });
  }

  const snapshot: CitySnapshot = {
    city: {
      ...city,
      bodiesPattern: undefined,
      bodies: pulled.bodies,
      window: { from, to },
      generatedAt: new Date().toISOString(),
      llmModel: useLlm ? llmConfig()!.model : undefined,
    } as CitySnapshot["city"],
    meetings,
    matters,
    members: computeMembers(matters),
  };
  delete (snapshot.city as unknown as Record<string, unknown>).bodiesPattern;
  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 1));
  const llmCount = matters.filter((m) => m.enrichment === "llm").length;
  console.log(`▸ Wrote ${outFile}  (${matters.length} items, ${llmCount} explained by model, ${meetings.length} meetings) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
