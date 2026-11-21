"use client";

/**
 * Interactive barangay map on MapLibre + OpenFreeMap (no API key). Purok
 * boundaries, pins, hotspot clusters and noise points are our own layers, so
 * they still render if basemap tiles are unavailable offline.
 */
import { Map as MLMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BOUNDS, CENTER, PUROKS, circleRing, type LatLon } from "@/lib/geo";
import type { Urgency } from "@/lib/domain";

// The bundler can't resolve MapLibre's worker next to its chunk, so serve it from /public
// (copied on install by the `postinstall` script).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export interface MapPin extends LatLon {
  id: string;
  tone?: Urgency | "brand" | "muted";
  label?: string;
  selected?: boolean;
}

export interface MapCluster {
  id: string;
  center: LatLon;
  radiusKm: number;
  count: number;
  label: string;
}

export interface BarangayMapProps {
  pins?: MapPin[];
  clusters?: MapCluster[];
  noise?: LatLon[];
  focus?: (LatLon & { zoom?: number }) | null;
  onPick?: (p: LatLon) => void;
  onSelect?: (id: string) => void;
  showPurokLabels?: boolean;
  interactive?: boolean;
  className?: string;
  label: string;
}

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const FALLBACK_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: "background", type: "background" as const, paint: { "background-color": "#f1efe9" } }],
};

const TONE: Record<NonNullable<MapPin["tone"]>, string> = {
  high: "#c2381f",
  medium: "#995800",
  normal: "#375a80",
  brand: "#0b5d4b",
  muted: "#6b707b",
};

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const ring = (pts: LatLon[]) => pts.map((p) => [p.lon, p.lat]);

/** Warm the neutral Positron basemap so it sits on our canvas instead of fighting it. */
function tintBasemap(map: MLMap) {
  const paint: [string, "background-color" | "fill-color", string][] = [
    ["background", "background-color", "#f3f1ec"],
    ["water", "fill-color", "#cfe1e6"],
    ["park", "fill-color", "#dfe9d6"],
    ["landcover_wood", "fill-color", "#dfe9d6"],
    ["landuse_residential", "fill-color", "#efece5"],
    ["building", "fill-color", "#e6e2d8"],
  ];
  for (const [layer, prop, value] of paint) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop, value);
  }
}

function pinElement(pin: MapPin, onSelect?: (id: string) => void) {
  const color = TONE[pin.tone ?? "brand"];
  const el = document.createElement(onSelect ? "button" : "div");
  el.className = "tugon-pin";
  if (onSelect) {
    el.setAttribute("type", "button");
    el.setAttribute("aria-label", pin.label ?? "Case location");
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect(pin.id);
    });
  }
  el.style.cssText = `width:${pin.selected ? 34 : 26}px;height:${pin.selected ? 42 : 32}px;cursor:${onSelect ? "pointer" : "default"};background:none;border:0;padding:0;filter:drop-shadow(0 3px 4px rgb(18 24 32 / .28));transition:transform .15s;`;
  el.innerHTML = `<svg viewBox="0 0 26 32" width="100%" height="100%"><path d="M13 31C13 31 1.5 19.6 1.5 11.8A11.5 11.5 0 0 1 24.5 11.8C24.5 19.6 13 31 13 31Z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="13" cy="11.8" r="4.2" fill="#fff"/></svg>`;
  if (pin.label) el.title = pin.label;
  return el;
}

export default function BarangayMapImpl({
  pins = [],
  clusters = [],
  noise = [],
  focus,
  onPick,
  onSelect,
  showPurokLabels = true,
  interactive = true,
  className,
  label,
}: BarangayMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const pickRef = useRef(onPick);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    if (!container.current) return;
    const pad = 0.006;
    const map = new MLMap({
      container: container.current,
      style: STYLE_URL,
      center: [CENTER.lon, CENTER.lat],
      zoom: 14.1,
      minZoom: 13,
      maxZoom: 18.5,
      maxBounds: [
        [BOUNDS.lonMin - pad, BOUNDS.latMin - pad],
        [BOUNDS.lonMax + pad, BOUNDS.latMax + pad],
      ],
      attributionControl: { compact: true },
      interactive,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: false,
    });
    map.touchZoomRotate.disableRotation();
    if (interactive) map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    // Basemap unreachable (offline or blocked): after a grace period, keep our own
    // layers on a plain canvas. Transient tile errors after load are ignored.
    let loaded = false;
    const fallback = setTimeout(
      () => {
        if (!loaded) map.setStyle(FALLBACK_STYLE);
      },
      navigator.onLine ? 8000 : 0,
    );
    map.on("error", () => {});

    map.on("style.load", () => {
      loaded = true;
      clearTimeout(fallback);
      tintBasemap(map);
      map.addSource("puroks", {
        type: "geojson",
        data: fc(PUROKS.map((p) => ({ type: "Feature", properties: { id: p.id }, geometry: { type: "Polygon", coordinates: [ring([...p.ring, p.ring[0]])] } }))),
      });
      map.addLayer({ id: "purok-fill", type: "fill", source: "puroks", paint: { "fill-color": "#0b5d4b", "fill-opacity": 0.035 } });
      map.addLayer({
        id: "purok-line",
        type: "line",
        source: "puroks",
        paint: { "line-color": "#0b5d4b", "line-opacity": 0.45, "line-width": 1.4, "line-dasharray": [2, 2.5] },
      });
      map.addSource("clusters", { type: "geojson", data: fc([]) });
      map.addLayer({ id: "cluster-fill", type: "fill", source: "clusters", paint: { "fill-color": "#c2381f", "fill-opacity": 0.1 } });
      map.addLayer({
        id: "cluster-line",
        type: "line",
        source: "clusters",
        paint: { "line-color": "#c2381f", "line-width": 1.8, "line-dasharray": [3, 2] },
      });
      map.addSource("noise", { type: "geojson", data: fc([]) });
      map.addLayer({
        id: "noise",
        type: "circle",
        source: "noise",
        paint: { "circle-radius": 4, "circle-color": "#6b707b", "circle-opacity": 0.6, "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 },
      });
      setReady(true);
    });

    map.on("click", (e) => pickRef.current?.({ lat: +e.lngLat.lat.toFixed(6), lon: +e.lngLat.lng.toFixed(6) }));

    return () => {
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      clearTimeout(fallback);
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [interactive]);

  // Clusters and noise are data layers; pins and labels are DOM markers for crisp styling and focus.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("clusters") as GeoJSONSource | undefined)?.setData(
      fc(clusters.map((c) => ({ type: "Feature", properties: { id: c.id }, geometry: { type: "Polygon", coordinates: [ring(circleRing(c.center, c.radiusKm))] } }))),
    );
    (map.getSource("noise") as GeoJSONSource | undefined)?.setData(
      fc(noise.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lon, p.lat] } }))),
    );

    markers.current.forEach((m) => m.remove());
    const next: Marker[] = [];
    if (showPurokLabels) {
      for (const p of PUROKS) {
        const el = document.createElement("div");
        el.className = "pointer-events-none select-none font-mono text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[#0b5d4b]/70";
        el.textContent = p.name;
        next.push(new Marker({ element: el }).setLngLat([p.label.lon, p.label.lat]).addTo(map));
      }
    }
    for (const c of clusters) {
      const el = document.createElement("div");
      el.className = "grid size-8 place-items-center rounded-full bg-[#121820] font-mono text-[12px] font-semibold text-white shadow-md ring-2 ring-white";
      el.textContent = String(c.count);
      el.title = c.label;
      next.push(new Marker({ element: el }).setLngLat([c.center.lon, c.center.lat]).addTo(map));
    }
    for (const pin of [...pins].sort((a, b) => Number(!!a.selected) - Number(!!b.selected))) {
      next.push(new Marker({ element: pinElement(pin, onSelect), anchor: "bottom" }).setLngLat([pin.lon, pin.lat]).addTo(map));
    }
    markers.current = next;
  }, [ready, pins, clusters, noise, showPurokLabels, onSelect]);

  // Keyed on the coordinates, not the object, so callers can pass a fresh literal each render.
  const focusLat = focus?.lat;
  const focusLon = focus?.lon;
  const focusZoom = focus?.zoom;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || focusLat == null || focusLon == null) return;
    map.easeTo({ center: [focusLon, focusLat], zoom: focusZoom ?? Math.max(map.getZoom(), 15.6), duration: 600 });
  }, [ready, focusLat, focusLon, focusZoom]);

  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = onPick ? "crosshair" : "";
  }, [onPick, ready]);

  return (
    <div
      ref={container}
      role="region"
      aria-label={label}
      className={cn("relative overflow-hidden rounded-2xl bg-[#efede8]", className)}
    />
  );
}
