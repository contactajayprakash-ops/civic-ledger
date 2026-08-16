import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-rule">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid gap-8 md:grid-cols-3 text-sm text-ink-2">
        <div>
          <p className="font-display text-lg text-ink">Civic Ledger</p>
          <p className="mt-2 max-w-xs">
            The public record of city council decisions, rewritten so anyone can read it. Every summary links back
            to the original document.
          </p>
        </div>
        <div>
          <p className="eyebrow mb-2">Sources</p>
          <p>
            Meeting records come from each city&apos;s Legistar public API or from agenda pages read with Firecrawl.
            Plain-language explanations are written by an open-weight language model and marked as such.
          </p>
        </div>
        <div>
          <p className="eyebrow mb-2">Project</p>
          <ul className="space-y-1">
            <li>
              <Link className="underline underline-offset-2 hover:text-ink" href="/about">
                How it works & limits
              </Link>
            </li>
            <li>
              <a
                className="underline underline-offset-2 hover:text-ink"
                href="https://github.com/contactajayprakash-ops/civic-ledger"
                target="_blank"
                rel="noreferrer"
              >
                Source code on GitHub
              </a>
            </li>
            <li>Built for Reverie Hacks 2026 · Software Development track</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
