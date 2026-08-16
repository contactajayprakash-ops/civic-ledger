// The mark: a small ledger page with a red seal. Drawn inline so it stays
// crisp at any size and needs no asset pipeline.
export function Wordmark({ size = 22, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Seal size={size} />
      {withText && (
        <span className="font-display text-[1.15rem] leading-none tracking-tight">
          Civic <span className="italic font-light">Ledger</span>
        </span>
      )}
    </span>
  );
}

export function Seal({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="2.5" width="15" height="19" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="#fbf8f1" />
      <path d="M6.5 7h9M6.5 10h9M6.5 13h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="16.5" cy="16.5" r="4.6" fill="#b3392c" stroke="#fbf8f1" strokeWidth="1.2" />
      <path d="M14.6 16.6l1.3 1.3 2.4-2.6" stroke="#fbf8f1" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
