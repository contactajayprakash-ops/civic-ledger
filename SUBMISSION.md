# Civic Ledger — Devpost submission

**Elevator pitch (≤200 chars):**
Civic Ledger — what your city council decided, in plain language. Every vote, every dollar, every meeting, pulled from the public record and explained, with links back to the source.

---

## Inspiration

I went looking for what my city council actually voted on last month and ended up eleven pages deep in a PDF titled "Resolution further amending Resolution No. 858 of 2014, effective January 1, 2015, as amended, entitled…" That one sentence moved $21 million. A single Pittsburgh council meeting carries about forty items like it, and the local reporters who used to translate this stuff for everyone else mostly don't exist anymore. So the decisions that set your rent, your bus route and your water bill are technically public and practically invisible. That gap felt like something software should close.

## What it does

Civic Ledger reads a city council's official record and rewrites it so anyone can use it. For Pittsburgh it currently covers 14 meetings and 345 decisions from the last three months — about $156M in authorizations. Each item gets a one-to-three sentence plain-language summary, who it affects, a topic, and the headline dollar figure, while the votes, dates and file numbers stay locked to the record.

On top of that one dataset it gives you six ways in: an overview that ranks the decisions that mattered most (dollars, contested votes, failures — not agenda order); a filterable browser over every item; a money view with a week-by-week spending timeline; a votes view with a per-member scorecard and every non-unanimous roll call; a map of items that name a street, park or intersection, with "what was decided near me"; and Ask, a retrieval-grounded chat that answers questions from the snapshot and cites item numbers you can click. There's also a printable weekly digest and a per-city RSS feed.

If your city isn't tracked, you paste a link to any agenda or minutes page — HTML or PDF — and it reads it on the spot. Cities on Legistar (a few hundred in the US) can be added permanently with one registry line and one command.

## How I built it

The design decision everything else hangs on: all the expensive work happens at build time. An ingest CLI pulls the record, has the model explain each item once, geocodes locations, and writes a plain JSON snapshot per city. The deployed site just reads those snapshots — no database, and the only per-request AI is the opt-in Ask and live-reader features. That's why it runs on a free tier and why a refresh only pays for items that changed.

Two data paths feed it. For Legistar cities I read the public API directly — meetings, agenda items, roll-call votes by member, sponsors, and the full legislative text; nothing is scraped. For everyone else, Firecrawl turns any agenda URL or PDF into clean markdown, and the model extracts the decisions chunk by chunk, keeping the exact sentence that supports each outcome.

The model layer is a small OpenAI-compatible client (Featherless-style open-weight models; provider-agnostic by env var) with schema-validated JSON output, streaming, reasoning-tag stripping, and automatic failover across a model list when a free tier's daily quota runs out — which happens, and the app has to survive it. The site is Next.js 16 with Tailwind v4, MiniSearch for in-process search, and Leaflet over OpenStreetMap for the map. The look is deliberate: paper, ink, and one seal-red accent, like a printed public record instead of a SaaS dashboard.

## Challenges I ran into

Free-tier LLM quotas shaped the architecture more than I expected. Halfway through enriching 345 items the daily token budget vanished, so I built quota-aware failover: sticky "this model is spent" tracking, per-minute waits parsed out of the provider's error text, and a snapshot format that reuses every summary already written so a rerun never repeats work. A reasoning model also leaked its `<think>` scratchpad into a meeting recap once — now every response and stream is scrubbed before it can reach a page.

The data itself fights you too. Legistar publishes Draft and Final records of the same sitting (they have to be merged), the same matter gets voted twice in one meeting under different action names, and dollar amounts appear as words — "two hundred seventy dollars" — so the extractor includes a words-to-number parser, with the model confirming the headline figure when it's available.

## Accomplishments that I'm proud of

The before/after is real: "Resolution authorizing, pursuant to Ch. 210…" becomes "Highmark Health will give Pittsburgh $20 million over five years to buy medical equipment for first responders." And the receipts survive the rewrite — every item page shows the roll call by name, the source excerpt, and a link to the original file. I also like that the whole thing found the handful of contested votes in Pittsburgh's summer automatically: 98% of roll calls were unanimous, and the interesting 2% surface themselves.

## What I learned

Grounding is a design problem, not just a prompt problem. The moment I split the data into "things the model may write" (summaries, topics, who-it-affects) and "things it may never touch" (votes, dates, amounts, file numbers), both the code and the trust story got simpler. I also learned an unreasonable amount about municipal record-keeping, including that a city can vote 0–9 against its own resolution.

## What's next

More cities — the registry approach makes each Legistar city one line plus one command, so a scheduled weekly refresh across a few dozen cities is the obvious next step. Then email subscriptions for the digest, ward-level pages so "near me" becomes "my district," and using the sponsor/vote data over longer windows to show how each member's record develops. The live reader should also learn meeting portals (Granicus, CivicClerk, PrimeGov) so "paste any agenda" becomes "type any city."

---

**Scope, honestly:** Pittsburgh is the fully-loaded demo city (structured votes, text, geocoding). The "read any agenda" path works on arbitrary cities but extracts only what the document states — it won't invent roll calls a PDF doesn't contain, and it reads a bounded slice of very long packets within the serverless time limit. Dollar totals are an index of council activity (headline amounts of items that passed), not an audited budget; the About page spells out every limit.

**Built with:** Next.js 16 · TypeScript · Tailwind v4 · Firecrawl (scrape + search) · open-weight LLMs via an OpenAI-compatible client (Llama 3.3 70B / Gemini; Featherless-ready) · MiniSearch · Leaflet/OpenStreetMap · Nominatim · Vercel (live) + render.yaml for Render.
