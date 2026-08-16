import Link from "next/link";
import { Wordmark } from "./wordmark";

export function SiteHeader() {
  return (
    <nav className="border-b border-rule bg-paper/90 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="Civic Ledger home">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <Link href="/#cities" className="px-3 py-1.5 rounded-md hover:bg-paper-2 text-ink-2">
            Cities
          </Link>
          <Link href="/live" className="px-3 py-1.5 rounded-md hover:bg-paper-2 text-ink-2">
            Read any agenda
          </Link>
          <Link href="/about" className="px-3 py-1.5 rounded-md hover:bg-paper-2 text-ink-2">
            How it works
          </Link>
        </div>
      </div>
    </nav>
  );
}
