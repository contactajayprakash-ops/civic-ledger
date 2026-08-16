// Cheap, deterministic first-pass labelling. The language model refines these
// when a key is configured; without one, this is what the app runs on.

import type { Category, Money } from "./types";

const RULES: [Category, RegExp][] = [
  ["ceremonial", /\b(proclaim|proclamation|declar(e|ing) .* day|recogni[sz]|commend|honor|congratulat|in memor|condolence|birthday|anniversary)\b/i],
  ["budget", /\b(budget|appropriat|tax(es|ation)?|levy|millage|bond issue|general fund|fiscal year|revenue|surplus|deficit|trust fund|transferring the amount|warrant in favor)\b/i],
  ["housing", /\b(housing|affordable|homeless|shelter|tenant|landlord|rent(al)?|eviction|residential unit|apartment)\b/i],
  ["zoning", /\b(zoning|rezon|land use|variance|subdivision|planning commission|conditional use|setback|parcel|plat|easement|right[- ]of[- ]way|vacat(e|ion) (of )?(street|alley)|historic (district|designation)|comprehensive plan)\b/i],
  ["transportation", /\b(street|road|highway|bridge|sidewalk|bike|bicycle|transit|bus|rail|traffic|parking|paving|pedestrian|crosswalk|intersection|speed (limit|hump))\b/i],
  ["public-safety", /\b(police|fire (department|bureau|station)|firefight|emergency|911|ems|paramedic|public safety|crime|gun|violence|jail|corrections|body camera|surveillance)\b/i],
  ["parks", /\b(park|recreation|playground|trail|pool|athletic|ball ?field|greenway|community center|senior center|library)\b/i],
  ["utilities", /\b(water|sewer|sewage|stormwater|wastewater|utility|utilities|electric|gas line|broadband|solid waste|refuse|recycling|landfill)\b/i],
  ["health", /\b(health|hospital|clinic|mental|opioid|overdose|food (bank|access)|nutrition|childcare|child care|senior services|human services|disabilit)\b/i],
  ["environment", /\b(climate|environment|emission|carbon|solar|renewable|tree|urban forest|green (infrastructure|roof)|air quality|pollution|flood|resilien)\b/i],
  ["contracts", /\b(contract|agreement|amendment to (the )?agreement|purchase|procure|vendor|lease|professional services|grant (award|application|funds)|accept(ance)? of (a )?gift|donation|memorandum of understanding)\b/i],
  ["governance", /\b(ordinance amending (the )?(city )?code|charter|ethics|election|appoint|reappoint|nominat|board of|commission member|salary|compensation|personnel|collective bargaining|union|rules of council|meeting schedule|minutes)\b/i],
];

export function classify(title: string, type?: string, text?: string): Category {
  const t = `${title}\n${type || ""}`;
  // Title carries the most signal; fall back to the first bit of body text.
  for (const [cat, re] of RULES) if (re.test(t)) return cat;
  if (text) for (const [cat, re] of RULES) if (re.test(text.slice(0, 1200))) return cat;
  return "other";
}

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
const SCALE: Record<string, number> = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };

// "two hundred seventy-three thousand five hundred dollars" -> 273500
export function wordsToNumber(phrase: string): number | null {
  const words = phrase.toLowerCase().replace(/-/g, " ").replace(/\band\b/g, " ").split(/\s+/).filter(Boolean);
  let total = 0;
  let current = 0;
  let matched = false;
  for (const w of words) {
    if (w in SMALL) {
      current += SMALL[w];
      matched = true;
    } else if (w === "hundred") {
      current = (current || 1) * 100;
      matched = true;
    } else if (w in SCALE) {
      total += (current || 1) * SCALE[w];
      current = 0;
      matched = true;
    } else if (/^\d+$/.test(w)) {
      current += parseInt(w, 10);
      matched = true;
    } else {
      break;
    }
  }
  if (!matched) return null;
  return total + current;
}

const DOLLAR_FIGURE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?(?:\s?(million|billion|thousand|[mMbBkK])\b)?/g;
const DOLLAR_WORDS =
  /\b((?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|and|-|\s)+))\s+dollars\b/gi;

export function extractMoney(title: string, text?: string): Money | null {
  const haystack = `${title}\n${(text || "").slice(0, 3000)}`;
  const amounts: number[] = [];
  for (const m of haystack.matchAll(DOLLAR_FIGURE)) {
    let n = parseFloat(m[1].replace(/,/g, "") + (m[2] ? "." + m[2] : ""));
    const unit = (m[3] || "").toLowerCase();
    if (unit === "million" || unit === "m") n *= 1e6;
    else if (unit === "billion" || unit === "b") n *= 1e9;
    else if (unit === "thousand" || unit === "k") n *= 1e3;
    if (n >= 100) amounts.push(n);
  }
  for (const m of haystack.matchAll(DOLLAR_WORDS)) {
    const n = wordsToNumber(m[1]);
    if (n && n >= 100) amounts.push(n);
  }
  if (!amounts.length) return null;
  // The headline figure is nearly always the largest one mentioned.
  const amount = Math.max(...amounts);
  const t = title.toLowerCase();
  let kind: Money["kind"] = "unknown";
  if (/transferring|transfer of|reprogram/.test(t)) kind = "transfer";
  else if (/accept|grant (award|of|from)|gift|donation|revenue|reimburse/.test(t)) kind = "receive";
  else if (/budget|appropriat|capital/.test(t)) kind = "budget";
  else if (/agreement|contract|purchase|warrant|payment|not to exceed|expend|cost|fee|lease/.test(t)) kind = "spend";
  return { amount, kind };
}

export function extractDistrict(title: string): string | null {
  const m = title.match(/\((?:Council )?District(?:s)?\s+([0-9]+(?:\s*(?:,|and|&)\s*[0-9]+)*)\)/i);
  if (m) return m[1].replace(/\s+/g, " ");
  const m2 = title.match(/\bDistrict\s+(\d{1,2})\b/);
  return m2 ? m2[1] : null;
}

export function formatMoney(n: number, opts: { compact?: boolean } = {}) {
  if (opts.compact) {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`;
    return `$${Math.round(n)}`;
  }
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
