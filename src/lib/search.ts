// Full-text search over a city's record. MiniSearch runs in-process, so
// "Ask" retrieval and the search box work with no external service.

import MiniSearch from "minisearch";
import type { CitySnapshot, Matter } from "./types";
import { CATEGORY_LABEL } from "./types";

interface Doc {
  id: string;
  title: string;
  plain: string;
  text: string;
  tags: string;
  category: string;
  file: string;
  sponsors: string;
}

const indexes = new Map<string, MiniSearch<Doc>>();

export function indexFor(snap: CitySnapshot): MiniSearch<Doc> {
  const key = `${snap.city.slug}:${snap.city.generatedAt}`;
  let idx = indexes.get(key);
  if (idx) return idx;
  idx = new MiniSearch<Doc>({
    fields: ["title", "plain", "text", "tags", "category", "file", "sponsors"],
    storeFields: ["id"],
    searchOptions: {
      boost: { title: 3, plain: 2.5, tags: 2, file: 4 },
      fuzzy: 0.15,
      prefix: true,
      combineWith: "AND",
    },
  });
  idx.addAll(
    snap.matters.map((m) => ({
      id: m.id,
      title: m.title,
      plain: m.plain || "",
      text: (m.textExcerpt || "").slice(0, 2000),
      tags: m.tags.join(" "),
      category: CATEGORY_LABEL[m.category],
      file: m.file,
      sponsors: m.sponsors.join(" "),
    })),
  );
  indexes.set(key, idx);
  return idx;
}

export function searchMatters(snap: CitySnapshot, query: string, limit = 12): Matter[] {
  const q = query.trim();
  if (!q) return [];
  const idx = indexFor(snap);
  let hits = idx.search(q);
  if (hits.length < 3) hits = idx.search(q, { combineWith: "OR" });
  const byId = new Map(snap.matters.map((m) => [m.id, m]));
  return hits
    .slice(0, limit)
    .map((h) => byId.get(h.id as string))
    .filter((m): m is Matter => Boolean(m));
}
