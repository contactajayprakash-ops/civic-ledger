import { loadCity, listCitySlugs } from "@/lib/store";
import { formatMoney } from "@/lib/heuristics";
import { fmtDate } from "@/lib/format";
import type { Matter } from "@/lib/types";

export function generateStaticParams() {
  return listCitySlugs().map((city) => ({ city }));
}

// One RSS entry per meeting: the recap plus a short list of the items that
// mattered. Works in any feed reader, no account needed.
export async function GET(_req: Request, ctx: { params: Promise<{ city: string }> }) {
  const { city } = await ctx.params;
  const snap = loadCity(city);
  if (!snap) return new Response("Not found", { status: 404 });
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://civic-ledger.vercel.app";
  const byId = new Map(snap.matters.map((m) => [m.id, m]));
  const items = [...snap.meetings]
    .reverse()
    .filter((m) => m.matterIds.length > 0)
    .slice(0, 20)
    .map((meeting) => {
      const matters = meeting.matterIds.map((i) => byId.get(i)).filter((m): m is Matter => Boolean(m));
      const top = matters
        .filter((m) => m.category !== "ceremonial")
        .sort((a, b) => (b.money?.amount || 0) - (a.money?.amount || 0))
        .slice(0, 6);
      const body = [
        meeting.digest ? `<p>${esc(meeting.digest)}</p>` : "",
        "<ul>",
        ...top.map((m) => `<li><a href="${base}/${city}/decisions/${m.id}">${esc(m.plain || m.title.slice(0, 160))}</a>${m.money ? ` — ${formatMoney(m.money.amount)}` : ""}</li>`),
        "</ul>",
        `<p><a href="${base}/${city}/meetings/${meeting.id}">All ${matters.length} items</a></p>`,
      ].join("");
      return `<item>
  <title>${esc(`${meeting.body}, ${fmtDate(meeting.date, { weekday: true })}`)}</title>
  <link>${base}/${city}/meetings/${meeting.id}</link>
  <guid isPermaLink="true">${base}/${city}/meetings/${meeting.id}</guid>
  <pubDate>${new Date(meeting.date + "T18:00:00Z").toUTCString()}</pubDate>
  <description><![CDATA[${body}]]></description>
</item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Civic Ledger · ${esc(snap.city.name)}, ${esc(snap.city.state)}</title>
  <link>${base}/${city}</link>
  <description>What ${esc(snap.city.name)} City Council decided, in plain language.</description>
  <language>en-us</language>
${items}
</channel>
</rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
