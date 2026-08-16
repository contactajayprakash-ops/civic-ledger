import Link from "next/link";
import { loadAllCities } from "@/lib/store";

export const metadata = { title: "How it works" };

export default function AboutPage() {
  const cities = loadAllCities();
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-10 prose-plain">
      <p className="eyebrow">About</p>
      <h1 className="font-display text-4xl sm:text-5xl leading-none mt-1">How Civic Ledger works, and where it stops</h1>

      <Section title="The problem it's built for">
        <p>
          Almost everything a city council does is public: agendas are posted, minutes are filed, votes are recorded by
          name. Almost nobody reads them. A single Pittsburgh council meeting can carry forty items, each titled with a
          sentence like &ldquo;Resolution further amending Resolution No. 858 of 2014, effective January 1, 2015, as
          amended, entitled…&rdquo;. Local newsrooms that used to translate this have shrunk or closed. The result is that
          decisions about your street, your rent and your taxes are technically transparent and practically invisible.
        </p>
        <p>
          Civic Ledger reads the record for you and rewrites it in the language people actually use, without losing the
          link back to the original.
        </p>
      </Section>

      <Section title="Where the data comes from">
        <p>
          <strong>Legistar cities.</strong> A few hundred US cities and counties publish their meetings through Legistar
          (Granicus), which has a public JSON API. For those cities we read every meeting in the window, every agenda item,
          the action taken, the roll-call vote by member, sponsors, and the full legislative text. Nothing is scraped; it&apos;s
          the same data the city&apos;s own portal shows. Adding one of these cities is a one-line entry and one command.
        </p>
        <p>
          <strong>Everyone else.</strong> On the <Link href="/live" className="underline underline-offset-2">Read any agenda</Link> page,
          Firecrawl turns any agenda or minutes URL, HTML or PDF, into clean text, and the model lists the decisions it
          finds. This is inherently less certain than the structured path, so those items are labelled as extracted, carry
          the sentence they were drawn from, and don&apos;t claim votes the document doesn&apos;t state.
        </p>
      </Section>

      <Section title="What the model does, and doesn't">
        <p>
          An open-weight language model (Llama 3.3 70B or a comparable model, served through Groq today and Featherless AI
          when configured) receives each item&apos;s official title, its actions and votes, and up to about 1,600 characters
          of the legislative text. It returns a one-to-three sentence plain-language summary, who the item affects, a topic,
          tags, the headline dollar figure and any named place. The response is validated against a schema; if the model
          fails, the item falls back to a rule-based topic and the official title, and is marked accordingly.
        </p>
        <p>
          The model never decides how a vote went, what an item&apos;s file number is, or when it happened. Those come from the
          record. Every item page shows the source excerpt and links to the original file so you can check the summary
          against it. The <em>Ask</em> feature answers only from the ten most relevant items retrieved by keyword search and
          cites them by number; it will tell you when the record doesn&apos;t answer the question.
        </p>
      </Section>

      <Section title="Known limits">
        <p>
          Dollar figures are the largest amount named in an item and are best read as an index of activity, not an audited
          budget: an amendment that restates a contract&apos;s total counts again, and multi-year totals count once. Topic labels
          are the model&apos;s judgement (rule-based when the model is off). Map pins depend on the record naming a street
          address, intersection or park; citywide items have no pin. Council-member sponsorship is matched by surname.
          Snapshots cover roughly the trailing 90 days and are refreshed by re-running the ingest command, not continuously.
        </p>
      </Section>

      <Section title="Running it yourself">
        <p>
          The whole site is a Next.js app that reads JSON snapshots committed to the repository, so it deploys to Vercel or
          Render&apos;s free tier with no database. <code className="font-mono text-sm">npm run ingest -- --city pittsburgh</code>{" "}
          rebuilds a city; set <code className="font-mono text-sm">LLM_API_KEY</code> (Featherless, Groq or any OpenAI-compatible
          endpoint) for explanations and <code className="font-mono text-sm">FIRECRAWL_API_KEY</code> for the live reader and city search.
          Details are in the{" "}
          <a className="underline underline-offset-2" href="https://github.com/contactajayprakash-ops/civic-ledger#readme" target="_blank" rel="noreferrer">
            README
          </a>
          .
        </p>
      </Section>

      <Section title="Currently tracked">
        <ul className="list-disc pl-5">
          {cities.map((c) => (
            <li key={c.city.slug}>
              <Link href={`/${c.city.slug}`} className="underline underline-offset-2">
                {c.city.name}, {c.city.state}
              </Link>{" "}
              — {c.meetings.length} meetings, {c.matters.length} items, {c.city.window.from} to {c.city.window.to}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl mb-3 border-t border-ink pt-3">{title}</h2>
      <div className="text-[1.0625rem] leading-relaxed text-ink-2 space-y-3">{children}</div>
    </section>
  );
}
