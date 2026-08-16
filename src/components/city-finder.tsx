"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface CityOpt {
  slug: string;
  name: string;
  state: string;
  matters: number;
}

export function CityFinder({ cities }: { cities: CityOpt[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cities.slice(0, 6);
    return cities.filter((c) => `${c.name} ${c.state}`.toLowerCase().includes(s)).slice(0, 6);
  }, [q, cities]);

  function go(slug?: string) {
    const target = slug || hits[0]?.slug;
    if (target) router.push(`/${target}`);
    else router.push(`/live?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="relative max-w-md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="flex gap-2"
      >
        <input
          className="input"
          placeholder="Search a city, e.g. Pittsburgh"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          aria-label="Search for a city"
        />
        <button className="btn btn-seal shrink-0" type="submit">
          Open
        </button>
      </form>
      {open && (
        <ul className="absolute z-20 mt-1 w-full card shadow-lift overflow-hidden">
          {hits.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                onMouseDown={() => go(c.slug)}
                className="w-full text-left px-3 py-2 hover:bg-paper-2 flex items-baseline justify-between"
              >
                <span>
                  {c.name} <span className="text-muted">{c.state}</span>
                </span>
                <span className="font-mono text-xs text-muted">{c.matters} items</span>
              </button>
            </li>
          ))}
          {hits.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">
              Not tracked yet — press Open to read an agenda link for “{q}”.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
