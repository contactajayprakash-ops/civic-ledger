"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["", "Overview"],
  ["/decisions", "Decisions"],
  ["/money", "Money"],
  ["/votes", "Votes"],
  ["/map", "Map"],
  ["/digest", "This week"],
  ["/ask", "Ask"],
] as const;

export function CityNav({ slug }: { slug: string }) {
  const path = usePathname();
  return (
    <nav className="border-b border-ink overflow-x-auto no-print" aria-label="City sections">
      <ul className="flex gap-1 -mb-px">
        {TABS.map(([seg, label]) => {
          const href = `/${slug}${seg}`;
          const active = seg === "" ? path === href : path.startsWith(href);
          return (
            <li key={seg}>
              <Link
                href={href}
                className={`block px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active ? "border-seal text-ink font-medium" : "border-transparent text-ink-2 hover:text-ink hover:border-rule-2"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
