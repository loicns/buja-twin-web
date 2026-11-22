import maplibregl, {
  type ExpressionSpecification,
  type MapGeoJSONFeature,
  type LayerSpecification,
  type MapMouseEvent,
} from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { BASEMAP_STYLE, CODE_URL, FEEDBACK_URL } from "./config";
import { loadRelease, SCENARIO_IDS, type Release, type Scenario, type ScenarioId } from "./data";
import { applyStatic, nf, people, t, toggleLang } from "./i18n";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Tiny DOM builder: text always goes through textContent, never innerHTML. */
function h(tag: string, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const kid of kids) el.append(kid);
  return el;
}

// ---- constants ------------------------------------------------------------------------------
const DEPTH_COLOURS = ["#c6dbef", "#6baed6", "#2171b5", "#08306b"] as const;
const DRY_COLOUR = "#b8bec6";
const depthClass = (d: number): 0 | 1 | 2 | 3 => (d < 0.1 ? 0 : d < 0.5 ? 1 : d < 1.5 ? 2 : 3);
const hasWebGL2 = (): boolean => {
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
};
const lowEnd = (navigator.hardwareConcurrency ?? 8) < 4 || !hasWebGL2();

// ---- state ----------------------------------------------------------------------------------
let release: Release;
let active: ScenarioId = "s2";
let is3d = !lowEnd;
let showPriority = false;
let showZones = false;
let map: maplibregl.Map;

const scenario = (id: ScenarioId): Scenario => release.catalog.scenarios.find((s) => s.id === id)!;
const fmtDepth = (d: number): string => `${nf(d, 2)} m`;

// ---- map ------------------------------------------------------------------------------------
function buildingColour(id: ScenarioId): ExpressionSpecification {
  const d: ExpressionSpecification = ["coalesce", ["get", `d_${id}`], 0];
  return ["step", d, DRY_COLOUR, 0.1, DEPTH_COLOURS[0], 0.5, DEPTH_COLOURS[1], 1.5, DEPTH_COLOURS[2], 3, DEPTH_COLOURS[3]];
}

function initMap(): void {
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  const pm = (f: string): string => `pmtiles://${release.base}/pmtiles/${f}`;
  const [w, s, e, n] = release.catalog.bounds_4326;
  const margin = 0.06;

  map = new maplibregl.Map({
    container: "map",
    style: BASEMAP_STYLE,
    center: [(w + e) / 2 + 0.02, (s + n) / 2 - 0.02],
    zoom: 12.3,
    pitch: is3d ? 55 : 0,
    bearing: is3d ? -20 : 0,
    maxPitch: 75,
    maxBounds: [[w - margin, s - margin], [e + margin, n + margin]],
    attributionControl: { compact: true },
  });
  if (import.meta.env.DEV) (window as unknown as { __map: maplibregl.Map }).__map = map; // for manual testing
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

  map.on("load", () => {
    const layers = map.getStyle().layers;
    const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
    const firstLine = layers.find((l) => l.type === "line")?.id;
    for (const l of layers) if (l.id.startsWith("building")) map.setLayoutProperty(l.id, "visibility", "none");

    const dem = { type: "raster-dem", url: pm("terrain.pmtiles"), encoding: "terrarium", tileSize: 256 } as const;
    map.addSource("terrain", { ...dem, attribution: "FABDEM, Univ. of Bristol / Fathom (CC BY-NC-SA 4.0)" });
    map.addSource("terrain-shade", dem); // a separate source for hillshade keeps 3D terrain rendering clean
    map.addSource("buildings", { type: "vector", url: pm("buildings.pmtiles"),
      attribution: "Google Open Buildings (CC BY 4.0)" });
    map.addSource("hex", { type: "vector", url: pm("hex.pmtiles") });
    map.addSource("zones", { type: "vector", url: pm("zones.pmtiles") });
    for (const id of SCENARIO_IDS) {
      map.addSource(`flood_${id}`, { type: "raster", url: pm(`depth_${id}.pmtiles`), tileSize: 256 });
    }

    map.addLayer({ id: "hillshade", type: "hillshade", source: "terrain-shade",
      paint: { "hillshade-exaggeration": 0.3, "hillshade-shadow-color": "#46576a", "hillshade-highlight-color": "#ffffff" } }, firstLine);
    for (const id of SCENARIO_IDS) {
      map.addLayer({ id: `flood_${id}`, type: "raster", source: `flood_${id}`,
        layout: { visibility: id === active ? "visible" : "none" },
        paint: { "raster-opacity": 0.88, "raster-resampling": "nearest" } }, firstSymbol);
    }
    const hidden = { visibility: "none" } as const;
    const addAbove = (spec: LayerSpecification): void => { map.addLayer(spec, firstSymbol); };
    addAbove({ id: "zones-fill", type: "fill", source: "zones", "source-layer": "zones", layout: hidden,
      paint: { "fill-color": "#16324f", "fill-opacity": 0.04 } });
    addAbove({ id: "zones-line", type: "line", source: "zones", "source-layer": "zones", layout: hidden,
      paint: { "line-color": "#16324f", "line-width": 1.2, "line-dasharray": [3, 2], "line-opacity": 0.7 } });
    addAbove({ id: "hex-fill", type: "fill", source: "hex", "source-layer": "hex", layout: hidden,
      filter: [">", ["coalesce", ["get", "p_s2"], 0], 0],
      paint: { "fill-opacity": 0.55, "fill-color": ["step", ["coalesce", ["get", "priority"], 0],
        "#fee5d9", 0.5, "#fcae91", 0.8, "#fb6a4a", 0.95, "#cb181d"] } });
    addAbove({ id: "hex-line", type: "line", source: "hex", "source-layer": "hex", layout: hidden,
      filter: [">", ["coalesce", ["get", "p_s2"], 0], 0], paint: { "line-color": "#7f2a1e", "line-width": 0.5, "line-opacity": 0.5 } });
    addAbove({ id: "buildings-3d", type: "fill-extrusion", source: "buildings", "source-layer": "buildings", minzoom: 13,
      paint: { "fill-extrusion-height": ["coalesce", ["get", "h"], 3], "fill-extrusion-base": 0,
        "fill-extrusion-color": buildingColour(active), "fill-extrusion-opacity": 0.92 } });

    if (is3d) map.setTerrain({ source: "terrain", exaggeration: 1.3 });
    syncLayers();
    map.on("click", onClick);
    for (const l of ["buildings-3d", "hex-fill", "zones-fill"]) {
      map.on("mouseenter", l, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", l, () => { map.getCanvas().style.cursor = ""; });
    }
  });
}

function syncLayers(): void {
  if (!map.getLayer("hex-fill")) return;
  const vis = (on: boolean): "visible" | "none" => (on ? "visible" : "none");
  map.setLayoutProperty("hex-fill", "visibility", vis(showPriority));
  map.setLayoutProperty("hex-line", "visibility", vis(showPriority));
  map.setLayoutProperty("zones-fill", "visibility", vis(showZones));
  map.setLayoutProperty("zones-line", "visibility", vis(showZones));
}

function set3d(on: boolean): void {
  is3d = on;
  map.setTerrain(on ? { source: "terrain", exaggeration: 1.3 } : null);
  map.easeTo({ pitch: on ? 55 : 0, bearing: on ? -20 : 0, duration: 800 });
  renderPanel();
}

function setScenario(id: ScenarioId): void {
  active = id;
  for (const sid of SCENARIO_IDS) {
    if (map.getLayer(`flood_${sid}`)) map.setLayoutProperty(`flood_${sid}`, "visibility", sid === id ? "visible" : "none");
  }
  if (map.getLayer("buildings-3d")) map.setPaintProperty("buildings-3d", "fill-extrusion-color", buildingColour(id));
  $<HTMLSelectElement>("scenario").value = id;
  const url = new URL(location.href);
  url.searchParams.set("s", id);
  history.replaceState(null, "", url);
  renderPanel();
}

// ---- popups ---------------------------------------------------------------------------------
type Props = Record<string, number | string>;
const num = (v: number | string | undefined): number => Number(v ?? 0);

function buildingPopup(p: Props): HTMLElement {
  const rows = SCENARIO_IDS.map((id) => {
    const d = num(p[`d_${id}`]);
    return h("tr", {}, h("td", {}, t(`short_${id}`)), h("td", {}, fmtDepth(d)), h("td", {}, t(`cls${depthClass(d)}`)));
  });
  return h("div", { class: "popup" },
    h("h4", {}, t("bld_title")),
    h("div", {}, `${t("bld_height")} : ${nf(num(p.h), 1)} m · ${t("bld_area")} : ${nf(num(p.a))} m²`),
    h("div", { class: "note" }, t("bld_depth")),
    h("table", {}, ...rows),
    h("small", {}, t("bld_note")));
}

function hexPopup(p: Props): HTMLElement {
  const rows = SCENARIO_IDS.map((id) =>
    h("tr", {}, h("td", {}, t(`short_${id}`)), h("td", {}, `${nf(num(p[`n_${id}`]))} / ${t("about")} ${people(num(p[`p_${id}`]))}`)));
  return h("div", { class: "popup" },
    h("h4", {}, t("hex_title", { near: String(p.near ?? "") })),
    h("div", {}, `${t("hex_buildings")} : ${nf(num(p.buildings))} · ${t("hex_people")} : ${t("about")} ${people(num(p.people))}`),
    h("div", { class: "note" }, t("hex_flooded")),
    h("table", {}, ...rows),
    h("div", {}, t("hex_rank", { rank: nf(num(p.rank_s2)) })),
    h("small", {}, t("hex_note")));
}

function zonePopup(p: Props): HTMLElement {
  const z = release.zones.find((x) => x.name === p.name);
  const rows = SCENARIO_IDS.map((id) =>
    h("tr", {}, h("td", {}, t(`short_${id}`)),
      h("td", {}, z ? `${nf(z.buildings05[id])} / ${t("about")} ${people(z.people05[id])}` : "")));
  return h("div", { class: "popup" },
    h("h4", {}, t("zone_title", { name: String(p.name) })),
    h("div", {}, `${t("zone_people")} : ${t("about")} ${people(num(p.people))}`),
    h("div", { class: "note" }, t("hex_flooded")),
    h("table", {}, ...rows),
    h("small", {}, t("zone_note")));
}

function onClick(e: MapMouseEvent): void {
  const wanted = ["buildings-3d", ...(showPriority ? ["hex-fill"] : []), ...(showZones ? ["zones-fill"] : [])];
  const hits: MapGeoJSONFeature[] = map.queryRenderedFeatures(e.point, { layers: wanted });
  const f = hits[0];
  if (!f) return;
  const p = (f.properties ?? {}) as Props;
  const content = f.layer.id === "buildings-3d" ? buildingPopup(p) : f.layer.id === "hex-fill" ? hexPopup(p) : zonePopup(p);
  new maplibregl.Popup({ maxWidth: "300px" }).setLngLat(e.lngLat).setDOMContent(content).addTo(map);
}

// ---- panel ----------------------------------------------------------------------------------
function swatch(colour: string, label: string): HTMLElement {
  const sw = h("span", { class: "sw" });
  sw.style.background = colour;
  return h("div", {}, sw, label);
}

function renderPanel(): void {
  const body = $("panel-body");
  const sc = scenario(active);
  const ex = release.summary[active];
  const stat = (label: string, value: string, small = ""): HTMLElement =>
    h("div", { class: "stat" }, h("span", {}, label), h("strong", {}, value, small ? h("small", {}, ` ${small}`) : ""));

  const cmp = h("table", { class: "cmp" },
    h("thead", {}, h("tr", {}, h("th", {}, t("col_scenario")), h("th", {}, t("col_buildings")), h("th", {}, t("col_people")))),
    h("tbody", {}, ...SCENARIO_IDS.map((id) => {
      const tr = h("tr", id === active ? { class: "on" } : {},
        h("td", {}, id.toUpperCase()), h("td", {}, nf(Math.round(release.summary[id].buildings_ge_0p5m / 100) * 100)),
        h("td", {}, people(release.summary[id].people_ge_0p5m)));
      return tr;
    })));

  const top = [...release.zones].sort((a, b) => b.people05[active] - a.people05[active]).slice(0, 8);
  const max = Math.max(...top.map((z) => z.people05[active]), 1);
  const bars = h("ul", { class: "bars" }, ...top.map((z) => {
    const fill = h("span", { class: "fill" });
    fill.style.width = `${(z.people05[active] / max) * 100}%`;
    return h("li", {}, h("span", { class: "name", title: z.name }, z.name), h("span", { class: "track" }, fill),
      h("span", { class: "val" }, people(z.people05[active])));
  }));

  const toggle = (id: string, label: string, checked: boolean, on: (v: boolean) => void): HTMLElement => {
    const input = h("input", { type: "checkbox", id }) as HTMLInputElement;
    input.checked = checked;
    input.addEventListener("change", () => on(input.checked));
    return h("label", { class: "toggle" }, input, label);
  };
  const view = h("button", { class: "btn", type: "button" }, is3d ? t("view2d") : t("view3d"));
  view.addEventListener("click", () => set3d(!is3d));

  const classes = [t("lg0"), t("lg1"), t("lg2"), t("lg3")];
  const foot = h("div", { class: "foot note" },
    h("span", {}, t("lake_note")),
    h("span", {}, t("data_version", { v: release.catalog.version })));
  if (FEEDBACK_URL) foot.append(h("a", { href: FEEDBACK_URL, target: "_blank", rel: "noopener" }, t("feedback")));
  foot.append(h("a", { href: CODE_URL, target: "_blank", rel: "noopener" }, t("code")));

  body.replaceChildren(
    h("div", { class: "banner" }, t("banner")),
    h("div", { class: "scen-name" }, t(`scen_${active}`)),
    h("div", { class: "scen-detail" }, t("scen_detail", { rain: nf(sc.rain_mm, 1), h: nf(sc.storm_hours), lake: nf(sc.lake_stage_m_egm2008, 2) })),
    h("h2", {}, t("stats_title")),
    h("div", { class: "stats" },
      stat(t("stat_wet"), nf(sc.stats.wet_km2_gt_0p5m, 1), t("km2")),
      stat(t("stat_buildings"), `${t("about")} ${nf(Math.round(ex.buildings_ge_0p5m / 100) * 100)}`),
      stat(t("stat_people"), `${t("about")} ${people(ex.people_ge_0p5m)}`)),
    h("h2", {}, t("compare_title")), cmp,
    h("h2", {}, t("bars_title")), bars, h("p", { class: "note" }, t("bars_note")),
    h("h2", {}, t("layers_title")),
    toggle("t-priority", t("layer_priority"), showPriority, (v) => { showPriority = v; syncLayers(); }),
    toggle("t-zones", t("layer_zones"), showZones, (v) => { showZones = v; syncLayers(); }),
    view,
    h("h2", {}, t("legend_title")),
    h("div", { class: "legend" }, ...classes.map((c, i) => swatch(DEPTH_COLOURS[i], c)), swatch(DRY_COLOUR, t("lg_dry"))),
    h("h2", {}, t("lg_prio")),
    h("div", { class: "ramp" }),
    h("div", { class: "ramp-labels" }, h("span", {}, t("lg_prio_low")), h("span", {}, t("lg_prio_high"))),
    foot);

  const sel = $<HTMLSelectElement>("scenario");
  sel.replaceChildren(...SCENARIO_IDS.map((id) => {
    const o = h("option", { value: id }, t(`scen_${id}`)) as HTMLOptionElement;
    o.selected = id === active;
    return o;
  }));
}

// ---- limitations drawer ---------------------------------------------------------------------
function renderDrawer(): void {
  const v = release.validation;
  const cop = v.sfincs_vs_copernicus_s4, gfm = v.sfincs_rain100_vs_gfm_2024, sur = v.surrogate;
  const sec = (title: string, ...kids: (Node | string)[]): Node[] => [h("h3", {}, title), ...kids.map((k) => (typeof k === "string" ? h("p", {}, k) : k))];
  $("drawer-body").replaceChildren(
    h("div", { class: "warn" }, h("strong", {}, t("d_warn_title") + ". "), t("d_warn")),
    ...sec(t("d_what_title"), t("d_what")),
    ...sec(t("d_evidence_title"),
      h("ul", {},
        h("li", {}, t("d_ev_cop", { csi: nf(cop.csi, 2), hit: nf(cop.hit_rate, 2), far: nf(cop.far, 2), model: nf(cop.model_km2), ref: nf(cop.copernicus_km2) })),
        h("li", {}, t("d_ev_gfm", { obs: nf(gfm.observed_km2, 2), model: nf(gfm.model_km2, 1) })),
        h("li", {}, t("d_ev_sur", { s0: nf(sur.csi_unseen_storms[0], 2), s1: nf(sur.csi_unseen_storms[1], 2),
          c0: nf(sur.csi_unseen_catchment[0], 2), c1: nf(sur.csi_unseen_catchment[1], 2) }))),
      t("d_s1_note")),
    ...sec(t("d_datum_title"), t("d_datum")),
    ...sec(t("d_lake_title"), t("d_lake")),
    ...sec(t("d_people_title"), t("d_people")),
    ...sec(t("d_lic_title"), h("ul", {}, ...["terrain", "buildings", "osm", "pop", "flood", "rivers"].map((k) => h("li", {}, t(`d_lic_${k}`))))),
    ...(FEEDBACK_URL ? sec(t("feedback"), h("p", {}, t("d_feedback")), h("a", { href: FEEDBACK_URL, target: "_blank", rel: "noopener" }, t("feedback"))) : []));
}

// ---- boot -----------------------------------------------------------------------------------
function toast(msg: string): void {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4500);
}

async function main(): Promise<void> {
  applyStatic();
  $("panel-body").textContent = t("loading");
  try {
    release = await loadRelease();
  } catch (err) {
    console.error(err);
    $("panel-body").replaceChildren(h("p", { class: "err" }, t("error")));
    return;
  }
  const wanted = new URLSearchParams(location.search).get("s");
  if (SCENARIO_IDS.includes(wanted as ScenarioId)) active = wanted as ScenarioId;

  initMap();
  renderPanel();
  renderDrawer();
  if (lowEnd) toast(t("no3d"));

  $<HTMLSelectElement>("scenario").addEventListener("change", (e) => setScenario((e.target as HTMLSelectElement).value as ScenarioId));
  $("lang").addEventListener("click", () => { toggleLang(); renderPanel(); renderDrawer(); });
  const drawer = $<HTMLDialogElement>("drawer");
  $("info").addEventListener("click", () => drawer.showModal());
  $("drawer-close").addEventListener("click", () => drawer.close());
  drawer.addEventListener("click", (e) => { if (e.target === drawer) drawer.close(); });
  const panel = $("panel");
  const sheet = $("sheet");
  sheet.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("collapsed");
    sheet.setAttribute("aria-expanded", String(!collapsed));
  });
  if (matchMedia("(max-width: 720px)").matches) { panel.classList.add("collapsed"); sheet.setAttribute("aria-expanded", "false"); }
}

void main();
