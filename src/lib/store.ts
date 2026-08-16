// Snapshots live in /data/cities/*.json and are baked into the deployment.
// The ingest CLI writes them; the app only reads. Keeping the read path this
// boring is what lets the site run on a free tier with no database.

import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import type { CitySnapshot, CityStats, Category, Matter, Member } from "./types";
import { CATEGORIES } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "cities");

export const listCitySlugs = cache((): string[] => {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
});

export const loadCity = cache((slug: string): CitySnapshot | null => {
  const file = path.join(DATA_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  const snap = JSON.parse(fs.readFileSync(file, "utf8")) as CitySnapshot;
  if (!snap.members?.length) snap.members = computeMembers(snap.matters);
  return snap;
});

export const loadAllCities = cache((): CitySnapshot[] =>
  listCitySlugs()
    .map((s) => loadCity(s))
    .filter((c): c is CitySnapshot => Boolean(c)),
);

export function computeStats(snap: CitySnapshot): CityStats {
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  const moneyByCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  let passed = 0;
  let failed = 0;
  let dollars = 0;
  let contested = 0;
  for (const m of snap.matters) {
    byCategory[m.category]++;
    if (m.latestOutcome === "passed") passed++;
    if (m.latestOutcome === "failed") failed++;
    if (m.money && m.latestOutcome === "passed" && m.money.kind !== "receive") {
      dollars += m.money.amount;
      moneyByCategory[m.category] += m.money.amount;
    }
    for (const a of m.actions) if (a.tally && a.tally.no > 0) contested++;
  }
  return {
    meetings: snap.meetings.length,
    matters: snap.matters.length,
    passed,
    failed,
    dollarsAuthorized: dollars,
    contestedVotes: contested,
    byCategory,
    moneyByCategory,
  };
}

// Voting records per council member, including how often each one was on
// the losing side of a roll call. Computed from the matters, not stored.
export function computeMembers(matters: Matter[]): Member[] {
  const map = new Map<string, Member>();
  for (const m of matters) {
    for (const a of m.actions) {
      if (!a.votes.length || !a.tally) continue;
      const majority = a.tally.yes >= a.tally.no ? "yes" : "no";
      for (const v of a.votes) {
        const mem = map.get(v.person) || {
          name: v.person,
          votes: { yes: 0, no: 0, abstain: 0, absent: 0 },
          dissents: 0,
        };
        if (v.value === "yes" || v.value === "no" || v.value === "abstain" || v.value === "absent") mem.votes[v.value]++;
        if ((v.value === "yes" || v.value === "no") && v.value !== majority) mem.dissents++;
        map.set(v.person, mem);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.votes.yes + b.votes.no - (a.votes.yes + a.votes.no));
}

export function matterById(snap: CitySnapshot, id: string) {
  return snap.matters.find((m) => m.id === id) || null;
}

export function meetingById(snap: CitySnapshot, id: string) {
  return snap.meetings.find((m) => m.id === id) || null;
}

// The most consequential items, for the overview: money, contested votes,
// then anything that passed that isn't a proclamation.
export function headlineMatters(snap: CitySnapshot, n = 8): Matter[] {
  const score = (m: Matter) => {
    let s = 0;
    if (m.category === "ceremonial") s -= 100;
    if (m.money) s += Math.log10(m.money.amount + 1) * 3;
    for (const a of m.actions) if (a.tally && a.tally.no > 0) s += 8 + a.tally.no;
    if (m.latestOutcome === "failed") s += 12;
    if (m.latestOutcome === "passed") s += 3;
    if (m.enrichment === "llm") s += 1;
    if (["housing", "public-safety", "zoning", "transportation"].includes(m.category)) s += 2;
    return s;
  };
  return [...snap.matters].sort((a, b) => score(b) - score(a)).slice(0, n);
}
