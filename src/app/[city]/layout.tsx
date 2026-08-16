import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listCitySlugs, loadCity } from "@/lib/store";
import { CityNav } from "@/components/city-nav";
import { fmtDate } from "@/lib/format";

export function generateStaticParams() {
  return listCitySlugs().map((city) => ({ city }));
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city } = await params;
  const snap = loadCity(city);
  if (!snap) return {};
  return {
    title: `${snap.city.name}, ${snap.city.state}`,
    description: `What ${snap.city.name} City Council decided: ${snap.matters.length} items across ${snap.meetings.length} meetings, in plain language.`,
  };
}

export default async function CityLayout({ children, params }: { children: React.ReactNode; params: Promise<{ city: string }> }) {
  const { city } = await params;
  const snap = loadCity(city);
  if (!snap) notFound();
  const c = snap.city;
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <header className="pt-8 pb-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            {c.source.label} · {fmtDate(c.window.from)} – {fmtDate(c.window.to)}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl leading-none mt-1">
            {c.name}
            <span className="text-muted font-sans text-xl ml-3 align-middle">{c.state}</span>
          </h1>
        </div>
        <p className="text-[0.8125rem] text-muted max-w-xs sm:text-right">
          Snapshot built {fmtDate(c.generatedAt.slice(0, 10))}.{" "}
          {c.llmModel ? `Explanations by ${c.llmModel.split("/").pop()}.` : "Plain-language explanations not yet generated for this city."}
        </p>
      </header>
      <CityNav slug={c.slug} />
      <div className="pt-6">{children}</div>
    </div>
  );
}
