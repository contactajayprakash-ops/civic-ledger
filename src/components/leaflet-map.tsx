"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, useMap } from "react-leaflet";
import type { Pin } from "./city-map";
import { formatMoney } from "@/lib/heuristics";
import { CATEGORY_LABEL } from "@/lib/types";

const CAT_COLOR: Record<string, string> = {
  budget: "#a86b0a",
  contracts: "#7a715f",
  housing: "#b3392c",
  zoning: "#6b3f78",
  transportation: "#1f4f7a",
  "public-safety": "#8f2c22",
  parks: "#2f6b3a",
  utilities: "#2b6f7a",
  health: "#b0576b",
  environment: "#4f7d2a",
  governance: "#4a443b",
  ceremonial: "#bfb39a",
  other: "#9c927e",
};

function Recenter({ me, radiusKm }: { me: { lat: number; lng: number } | null; radiusKm: number }) {
  const map = useMap();
  useEffect(() => {
    if (me) map.flyTo([me.lat, me.lng], radiusKm <= 1 ? 15 : radiusKm <= 3 ? 14 : 12, { duration: 0.8 });
  }, [me, radiusKm, map]);
  return null;
}

export function LeafletMap({
  center,
  pins,
  me,
  radiusKm,
  onSelect,
  selected,
  city,
}: {
  center: [number, number];
  pins: Pin[];
  me: { lat: number; lng: number; label: string } | null;
  radiusKm: number;
  onSelect: (id: string | null) => void;
  selected: string | null;
  city: string;
}) {
  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom className="h-[520px] rounded-lg border border-rule overflow-hidden">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <Recenter me={me} radiusKm={radiusKm} />
      {me && radiusKm > 0 && (
        <>
          <Circle center={[me.lat, me.lng]} radius={radiusKm * 1000} pathOptions={{ color: "#16130e", weight: 1, dashArray: "4 4", fillOpacity: 0.04 }} />
          <CircleMarker center={[me.lat, me.lng]} radius={6} pathOptions={{ color: "#16130e", fillColor: "#16130e", fillOpacity: 1 }}>
            <Popup>{me.label}</Popup>
          </CircleMarker>
        </>
      )}
      {pins.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={selected === p.id ? 10 : p.money ? Math.min(12, 5 + Math.log10(p.money + 1)) : 6}
          pathOptions={{ color: "#fbf8f1", weight: 1.5, fillColor: CAT_COLOR[p.category], fillOpacity: selected === p.id ? 1 : 0.85 }}
          eventHandlers={{ click: () => onSelect(p.id), mouseover: () => onSelect(p.id) }}
        >
          <Popup>
            <div style={{ maxWidth: 260 }}>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7a715f", margin: 0 }}>
                {CATEGORY_LABEL[p.category]} · {p.where}
              </p>
              <p style={{ margin: "6px 0", fontSize: 14, lineHeight: 1.35 }}>{p.text}</p>
              <p style={{ margin: 0, fontSize: 12 }}>
                {p.money ? <strong>{formatMoney(p.money, { compact: true })} · </strong> : null}
                <a href={`/${city}/decisions/${p.id}`} style={{ textDecoration: "underline" }}>
                  details
                </a>
              </p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
