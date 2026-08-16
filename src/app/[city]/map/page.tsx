import { notFound } from "next/navigation";
import { loadCity } from "@/lib/store";
import { CityMap } from "@/components/city-map";

export const metadata = { title: "Map" };

export default async function MapPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const snap = loadCity(city);
  if (!snap) notFound();
  const pins = snap.matters
    .filter((m) => m.location?.lat && m.location.lng)
    .map((m) => ({
      id: m.id,
      lat: m.location!.lat!,
      lng: m.location!.lng!,
      where: m.location!.text,
      text: m.plain || m.title.slice(0, 160),
      category: m.category,
      outcome: m.latestOutcome,
      money: m.money?.amount,
      date: m.actions[m.actions.length - 1]?.date || m.decidedOn || "",
      district: m.district,
    }));
  return (
    <CityMap
      city={city}
      cityName={snap.city.name}
      center={[snap.city.lat, snap.city.lng]}
      pins={pins}
      total={snap.matters.length}
    />
  );
}
