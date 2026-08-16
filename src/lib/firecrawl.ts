// Fetching documents from the open web. Firecrawl does the heavy lifting
// (JS rendering, PDF parsing, boilerplate removal) when a key is set; a
// plain fetch + HTML/PDF-to-text fallback keeps things working without one.

export interface FetchedDoc {
  url: string;
  title: string;
  markdown: string;
  via: "firecrawl" | "fetch";
  contentType?: string;
}

const FIRECRAWL = "https://api.firecrawl.dev/v2";

export function firecrawlAvailable() {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}

export async function scrapeUrl(url: string, opts: { signal?: AbortSignal } = {}): Promise<FetchedDoc> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (key) {
    const res = await fetch(`${FIRECRAWL}/scrape`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: opts.signal,
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        parsers: [{ type: "pdf" }],
        timeout: 60000,
        maxAge: 172800000,
      }),
    });
    if (res.ok) {
      const j = (await res.json()) as {
        success: boolean;
        data?: { markdown?: string; metadata?: { title?: string | string[]; contentType?: string } };
      };
      if (j.success && j.data?.markdown) {
        const t = j.data.metadata?.title;
        return {
          url,
          title: (Array.isArray(t) ? t[0] : t) || url,
          markdown: j.data.markdown,
          via: "firecrawl",
          contentType: j.data.metadata?.contentType,
        };
      }
    }
    // fall through to the plain fetch on any Firecrawl failure
  }
  return plainFetch(url, opts.signal);
}

export interface SearchHit {
  url: string;
  title: string;
  description?: string;
}

export async function searchWeb(query: string, limit = 8): Promise<SearchHit[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  const res = await fetch(`${FIRECRAWL}/search`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, limit, sources: [{ type: "web" }] }),
  });
  if (!res.ok) return [];
  const j = (await res.json()) as { data?: { web?: SearchHit[] } };
  return j.data?.web || [];
}

async function plainFetch(url: string, signal?: AbortSignal): Promise<FetchedDoc> {
  const res = await fetch(url, {
    signal,
    headers: { "user-agent": "CivicLedger/1.0 (+https://github.com/contactajayprakash-ops/civic-ledger)" },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} for ${url}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
    const buf = Buffer.from(await res.arrayBuffer());
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buf);
    return { url, title: parsed.info?.Title || url.split("/").pop() || url, markdown: parsed.text, via: "fetch", contentType: ct };
  }
  const html = await res.text();
  return { url, title: htmlTitle(html) || url, markdown: htmlToText(html), via: "fetch", contentType: ct };
}

function htmlTitle(html: string) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1]).trim() : "";
}

// Deliberately simple: strip scripts/styles/nav, turn block tags into
// newlines, collapse whitespace. Good enough for agenda pages.
export function htmlToText(html: string) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/table)[^>]*>/gi, "\n");
  s = s.replace(/<(li)[^>]*>/gi, "- ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decode(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
    .join("\n")
    .trim();
}

function decode(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
