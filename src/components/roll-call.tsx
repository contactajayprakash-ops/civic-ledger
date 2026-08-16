import type { Vote } from "@/lib/types";

const STYLE: Record<Vote["value"], string> = {
  yes: "bg-green text-paper border-green",
  no: "bg-seal text-paper border-seal",
  abstain: "bg-paper-3 text-ink-2 border-rule-2",
  absent: "bg-transparent text-muted border-rule-2 border-dashed",
  other: "bg-transparent text-muted border-rule-2",
};

export function RollCall({ votes }: { votes: Vote[] }) {
  const sorted = [...votes].sort((a, b) => order(a.value) - order(b.value) || a.person.localeCompare(b.person));
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {sorted.map((v) => (
        <li key={v.person} className={`text-[0.75rem] px-2 py-0.5 rounded border ${STYLE[v.value]}`} title={v.raw}>
          {v.person}
          <span className="opacity-70 ml-1 font-mono">{v.value === "yes" ? "Y" : v.value === "no" ? "N" : v.value === "abstain" ? "A" : v.value === "absent" ? "—" : "?"}</span>
        </li>
      ))}
    </ul>
  );
}

function order(v: Vote["value"]) {
  return { no: 0, yes: 1, abstain: 2, absent: 3, other: 4 }[v];
}
