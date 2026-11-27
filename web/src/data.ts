import { DATA_BASE } from "./config";

export type ScenarioId = "s1" | "s2" | "s3";
export const SCENARIO_IDS: ScenarioId[] = ["s1", "s2", "s3"];

export interface Scenario {
  id: ScenarioId;
  run_id: string;
  label: string;
  rain_mm: number;
  rain_T_yr: number | null;
  storm_hours: number;
  lake_stage_m_egm2008: number;
  stats: { wet_km2_gt_0p1m: number; wet_km2_gt_0p5m: number; max_depth_m: number };
}
export interface ClassDef { min: number; max: number | null; colour: string }
export interface Catalog {
  version: string;
  bounds_4326: [number, number, number, number];
  depth_classes: ClassDef[];
  vegetation: { trees: number; canopy_km2_ge_2m: number; canopy_classes: ClassDef[] };
  scenarios: Scenario[];
}
export interface ScenarioExposure {
  buildings_ge_0p1m: number;
  buildings_ge_0p5m: number;
  buildings_ge_1p5m: number;
  people_ge_0p5m: number;
}
export type Summary = Record<ScenarioId, ScenarioExposure> & { buildings_total: number; people_total: number };
export interface Zone {
  /** Stable id from the release (null in releases before v20261127, which keyed zones by name). */
  id: number | null;
  name: string;
  buildings: number;
  people: number;
  buildings05: Record<ScenarioId, number>;
  people05: Record<ScenarioId, number>;
  /** [west, south, east, north] and a label point, for flying to the zone; null in older releases. */
  bbox: [number, number, number, number] | null;
  at: [number, number] | null;
  /** Share of ground under canopy of 2 m or more, and detected trees per hectare (descriptive; not a model input). */
  canopyPct: number | null;
  treesHa: number | null;
  /** Share of the zone inside the synthetic roughness test block of the published runs (see LIMITATIONS.md). */
  roughPct: number | null;
}
export interface Validation {
  sfincs_vs_copernicus_s4: { csi: number; hit_rate: number; far: number; model_km2: number; copernicus_km2: number };
  sfincs_rain100_vs_gfm_2024: { observed_km2: number; model_km2: number; hit_rate: number };
  surrogate: { csi_unseen_storms: [number, number]; csi_unseen_catchment: [number, number] };
}
export interface Release {
  base: string;
  catalog: Catalog;
  summary: Summary;
  zones: Zone[];
  validation: Validation;
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.json()) as T;
}

/** Minimal CSV reader with double-quote support (neighbourhood names may contain commas). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

export async function loadRelease(pin: string | null = null): Promise<Release> {
  // Never hard-code a version: current.json names the live release. A link may pin one (?release=v...).
  const current = pin ?? (await getJson<{ current: string }>(`${DATA_BASE}/current.json`)).current;
  const base = `${DATA_BASE}/${current}`;
  const [catalog, summary, zonesCsv, validation] = await Promise.all([
    getJson<Catalog>(`${base}/catalog.json`),
    getJson<Summary>(`${base}/exposure/exposure_summary.json`),
    fetch(`${base}/exposure/exposure_zones.csv`).then((r) => r.text()),
    getJson<Validation>(`${base}/validation.json`),
  ]);
  const opt = (v: string | undefined): number | null => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const zones: Zone[] = parseCsv(zonesCsv).map((r) => ({
    id: opt(r.id),
    name: r.name,
    buildings: Number(r.buildings),
    people: Number(r.people),
    buildings05: { s1: Number(r.buildings_ge_0p5m_s1), s2: Number(r.buildings_ge_0p5m_s2), s3: Number(r.buildings_ge_0p5m_s3) },
    people05: { s1: Number(r.people_ge_0p5m_s1), s2: Number(r.people_ge_0p5m_s2), s3: Number(r.people_ge_0p5m_s3) },
    bbox: opt(r.minx) === null ? null : [Number(r.minx), Number(r.miny), Number(r.maxx), Number(r.maxy)],
    at: opt(r.lon) === null ? null : [Number(r.lon), Number(r.lat)],
    canopyPct: opt(r.canopy_pct),
    treesHa: opt(r.trees_ha),
    roughPct: opt(r.roughness_test_pct),
  }));
  return { base, catalog, summary, zones, validation };
}
