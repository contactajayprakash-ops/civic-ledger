import type { Outcome } from "./types";

export function fmtDate(iso: string, opts: { weekday?: boolean; year?: boolean } = {}) {
  if (!iso) return "undated";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  return d.toLocaleDateString("en-US", {
    weekday: opts.weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: opts.year === false ? undefined : "numeric",
  });
}

export function fmtDateShort(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  passed: "Passed",
  failed: "Failed",
  referred: "Referred",
  held: "Held",
  withdrawn: "Withdrawn",
  introduced: "Introduced",
  discussed: "Discussed",
  unknown: "On file",
};

export const OUTCOME_COLOR: Record<Outcome, string> = {
  passed: "text-green",
  failed: "text-seal",
  referred: "text-blue",
  held: "text-amber",
  withdrawn: "text-muted",
  introduced: "text-blue",
  discussed: "text-ink-2",
  unknown: "text-muted",
};

export function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), n - 20)) + "…";
}

// Legislative titles are often one giant sentence. Trim the boilerplate lead-in.
export function tidyTitle(title: string) {
  return title
    .replace(/^\s*(an?\s+)?(resolution|ordinance)\s+(further\s+)?(amending|authorizing|providing|approving|adopting|transferring|establishing|accepting|declaring)\b/i, (m) => m)
    .replace(/\s+/g, " ")
    .trim();
}

export function pluralize(n: number, one: string, many = one + "s") {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
