import maplibregl, { type ExpressionSpecification, type FilterSpecification, type LayerSpecification, type MapGeoJSONFeature, type SourceSpecification } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAP_STYLE } from "./config";
import type { Release, ScenarioId, Zone } from "./data";
import { ElevationSampler } from "./elevation";
import { LAYERS } from "./layers";
import type { AppState, View } from "./state";

export type FeatureKind = "building" | "bridge" | "hex" | "zone";
export type Props = Record<string, number | string>;

export interface MapApi {
  map: maplibregl.Map;
  /** Adds the data release once it has loaded; the basemap starts before it, so the two load in parallel. */
  attach(release: Release): void;
  apply(st: AppState): void;
  set3D(on: boolean, st: AppState): void;
  /** The on-map 3D / 2D switch was used. */
  onToggle3D(cb: (on: boolean) => void): void;
  view(): View;
  elevationAt(lng: number, lat: number): Promise<number | null>;
  onFeature(cb: (kind: FeatureKind, props: Props, at: maplibregl.LngLat) => void): void;
  onCursor(cb: (at: maplibregl.LngLat | null) => void): void;
  onMoveEnd(cb: () => void): void;
  /** Frames a neighbourhood and outlines it, whatever layers are on. */
  focusZone(z: Zone): void;
  clearFocus(): void;
  /** Back to the whole city. */
  home(): void;
  /** Space taken by overlays at the bottom (the mobile sheet), so framing centres on the visible map. */
  setBottomPadding(px: number): void;
  /** Resolves when the visible flood tiles have drawn. */
  ready: Promise<void>;
  localize(t: (k: string) => string): void;
}

interface Options { state: AppState; reduceMotion: boolean; t: (k: string) => string }

/** The opening view: the whole city, slightly south-east of the domain centre (the lake fills the west). */
const HOME = { center: [29.3779, -3.3646] as [number, number], zoom: 12.3, width: 920 };
/** The opening 3D view: over the centre, looking north-north-west to the most affected areas (Quartier Industriel,
 *  Buterere), close enough for the buildings to stand up (building tiles start at z13, extruded by z13.6). */
const START_3D = { center: [29.3575, -3.3745] as [number, number], zoom: 14.1, pitch: 60, bearing: -22 };
const BUILDINGS_3D_ZOOM = 13.7;
const start3DZoom = (): number => {
  const w = document.getElementById("map")?.clientWidth || HOME.width;
  return Math.min(14.6, Math.max(BUILDINGS_3D_ZOOM, START_3D.zoom + Math.log2(w / HOME.width)));
};
/** Same framing on any screen: 12.3 fits the city on a ~920 px map; a phone gets about 11. */
const homeZoom = (): number => {
  const w = document.getElementById("map")?.clientWidth || HOME.width;
  return Math.min(12.6, Math.max(10.8, HOME.zoom + Math.log2(w / HOME.width)));
};
const FADE_MS = 300;
const DRY = "#cfccc4"; // warm grey: reads as "not flooded", not as the lightest depth class
const CLICKABLE: [FeatureKind, string][] = [["bridge", "bridges"], ["building", "buildings-3d"], ["building", "buildings-flat"], ["hex", "hex-fill"], ["zone", "zones-fill"]];
const SIDS: ScenarioId[] = ["s1", "s2", "s3"];

export function createMap(o: Options): MapApi {
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  const v = o.state.view;
  const map = new maplibregl.Map({
    container: "map",
    style: BASEMAP_STYLE,
    center: v ? [v.x, v.y] : o.state.threeD ? START_3D.center : HOME.center,
    zoom: v?.z ?? (o.state.threeD ? start3DZoom() : homeZoom()),
    pitch: v?.p ?? (o.state.threeD ? START_3D.pitch : 0),
    bearing: v?.b ?? (o.state.threeD ? START_3D.bearing : 0),
    maxPitch: 75,
    attributionControl: false, // credits live in the collar bar and the limits dialog
    fadeDuration: o.reduceMotion ? 0 : 200,
    canvasContextAttributes: { antialias: false },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
  map.addControl(new HomeControl(() => api.home(), o.t), "top-left");
  const viewCtl = new ViewControl((on) => toggleCb(on), o.t, o.state.threeD);
  map.addControl(viewCtl, "top-right");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");
  map.getCanvas().setAttribute("aria-describedby", "summary"); // the text summary describes the picture
  map.keyboard.enable();
  if (new URLSearchParams(location.search).has("debug")) (window as unknown as { __map: maplibregl.Map }).__map = map;
  map.on("error", (ev) => console.error("map error:", (ev as { sourceId?: string }).sourceId ?? "", ev.error?.message ?? ev.error));

  let featureCb: Parameters<MapApi["onFeature"]>[0] = () => {};
  let cursorCb: Parameters<MapApi["onCursor"]>[0] = () => {};
  let moveCb: () => void = () => {};
  let toggleCb: (on: boolean) => void = () => {};
  let last: AppState = o.state;
  let release: Release | null = null;
  let sampler: ElevationSampler | null = null;
  let styleReady = false;
  let firstSymbol: string | undefined;
  let firstLine: string | undefined;
  let focus: Zone | null = null;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => { resolveReady = r; });
  const fadeTimers = new Map<string, number>();
  const pendingOut = new Set<string>();

  const depthStep = (id: ScenarioId): ExpressionSpecification => {
    const d: ExpressionSpecification = ["coalesce", ["get", `d_${id}`], 0];
    const steps: (string | number)[] = [DRY];
    for (const c of release!.catalog.depth_classes) steps.push(c.min, c.colour);
    return ["step", d, ...steps] as unknown as ExpressionSpecification;
  };
  const focusFilter = (): FilterSpecification => (focus
    ? (focus.id !== null ? ["==", ["get", "id"], focus.id] : ["==", ["get", "name"], focus.name])
    : ["==", ["get", "id"], -1]) as FilterSpecification;

  // ---- sources and layers, created on first use: hidden layers cost nothing, not even the archive header ------------
  const url = (f: string): string => `${release!.base}/pmtiles/${f}`;
  const pm = (f: string): string => `pmtiles://${url(f)}`;
  const SOURCES: Record<string, () => SourceSpecification> = {
    "terrain": () => ({ type: "raster-dem", url: pm("terrain.pmtiles"), encoding: "terrarium", tileSize: 256 }),
    // a separate source for the hillshade avoids a MapLibre rendering warning; the 3D source asks for other zooms anyway
    "terrain-shade": () => ({ type: "raster-dem", url: pm("terrain.pmtiles"), encoding: "terrarium", tileSize: 256 }),
    "canopy": () => ({ type: "raster", url: pm("canopy.pmtiles"), tileSize: 256 }),
    "flood_s1": () => ({ type: "raster", url: pm("depth_s1.pmtiles"), tileSize: 256 }),
    "flood_s2": () => ({ type: "raster", url: pm("depth_s2.pmtiles"), tileSize: 256 }),
    "flood_s3": () => ({ type: "raster", url: pm("depth_s3.pmtiles"), tileSize: 256 }),
    "buildings": () => ({ type: "vector", url: pm("buildings.pmtiles") }),
    "hex": () => ({ type: "vector", url: pm("hex.pmtiles") }),
    "zones": () => ({ type: "vector", url: pm("zones.pmtiles") }),
    "trees": () => ({ type: "vector", url: pm("trees.pmtiles") }),
    "context": () => ({ type: "vector", url: pm("context.pmtiles") }),
  };
  const fade = { duration: o.reduceMotion ? 0 : FADE_MS, delay: 0 };
  const casing = (id: string, source: string, sourceLayer: string, width: ExpressionSpecification | number, opacity = 0.8): LayerSpecification =>
    ({ id, type: "line", source, "source-layer": sourceLayer, paint: { "line-color": "#ffffff", "line-width": width, "line-opacity": opacity } });
  /** Draw order, bottom to top. Each factory runs when its layer is first needed. */
  const ORDER: [string, () => LayerSpecification][] = [
    ["hillshade", () => ({ id: "hillshade", type: "hillshade", source: "terrain-shade",
      paint: { "hillshade-shadow-color": "#46576a", "hillshade-highlight-color": "#ffffff", "hillshade-exaggeration": 0.3 } })],
    ["canopy", () => ({ id: "canopy", type: "raster", source: "canopy", paint: { "raster-resampling": "nearest" } })],
    ...SIDS.map((s): [string, () => LayerSpecification] => [`flood_${s}`, () => ({ id: `flood_${s}`, type: "raster", source: `flood_${s}`,
      paint: { "raster-resampling": "nearest", "raster-opacity-transition": fade } })]),
    // rivers sit on the water: a white casing keeps them readable over the deepest class, which shares their blue
    ["rivers-casing", () => casing("rivers-casing", "context", "rivers", ["interpolate", ["linear"], ["zoom"], 10, 1.6, 15, 3.6], 0.7)],
    ["rivers", () => ({ id: "rivers", type: "line", source: "context", "source-layer": "rivers",
      paint: { "line-color": "#3866a6", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 15, 2] } })],
    ["zones-fill", () => ({ id: "zones-fill", type: "fill", source: "zones", "source-layer": "zones", paint: { "fill-color": "#22416a", "fill-opacity": 0.03 } })],
    ["zones-casing", () => casing("zones-casing", "zones", "zones", 2.6)],
    ["zones-line", () => ({ id: "zones-line", type: "line", source: "zones", "source-layer": "zones",
      paint: { "line-color": "#22416a", "line-width": 1.2, "line-dasharray": [3, 2] } })],
    ["hex-fill", () => ({ id: "hex-fill", type: "fill", source: "hex", "source-layer": "hex", filter: [">", ["coalesce", ["get", "p_s2"], 0], 0],
      paint: { "fill-color": ["step", ["coalesce", ["get", "priority"], 0], "#f3d9b5", 0.5, "#e6ab62", 0.8, "#c8693a", 0.95, "#8f2f1f"] } })],
    ["hex-line", () => ({ id: "hex-line", type: "line", source: "hex", "source-layer": "hex", filter: [">", ["coalesce", ["get", "p_s2"], 0], 0],
      paint: { "line-color": "#7a2f1f", "line-width": 0.5, "line-opacity": 0.45 } })],
    ["buildings-flat", () => ({ id: "buildings-flat", type: "fill", source: "buildings", "source-layer": "buildings", minzoom: 13,
      paint: { "fill-color": depthStep(last.scenario), "fill-outline-color": "rgba(15,27,43,0.18)" } })],
    // extruded as soon as building tiles exist (z13); they grow in over the first half zoom so the switch is not abrupt
    ["buildings-3d", () => ({ id: "buildings-3d", type: "fill-extrusion", source: "buildings", "source-layer": "buildings", minzoom: 13,
      paint: { "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 13.6, ["coalesce", ["get", "h"], 3]], "fill-extrusion-base": 0, "fill-extrusion-color": depthStep(last.scenario) } })],
    ["trees", () => ({ id: "trees", type: "circle", source: "trees", "source-layer": "trees", minzoom: 15,
      paint: {
        "circle-pitch-alignment": "map",
        "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 15, ["max", 1, ["*", ["coalesce", ["get", "d"], 4], 0.105]], 19, ["max", 2, ["*", ["coalesce", ["get", "d"], 4], 1.68]]],
        "circle-color": ["step", ["coalesce", ["get", "h"], 0], "#a9c09a", 5, "#6f9a68", 10, "#3e6b4b", 20, "#27492f"],
      } })],
    ["zone-focus-casing", () => ({ ...casing("zone-focus-casing", "zones", "zones", 6, 0.95), filter: focusFilter() } as LayerSpecification)],
    ["zone-focus", () => ({ id: "zone-focus", type: "line", source: "zones", "source-layer": "zones", filter: focusFilter(),
      paint: { "line-color": "#071426", "line-width": 2.5 } })],
    ["bridges", () => ({ id: "bridges", type: "circle", source: "context", "source-layer": "bridges",
      paint: { "circle-radius": 6, "circle-color": "#071426", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } })],
  ];
  const ORDER_IDS = ORDER.map(([id]) => id);

  const ensureSource = (id: string): void => { if (!map.getSource(id)) map.addSource(id, SOURCES[id]()); };
  const ensure = (id: string): void => {
    if (map.getLayer(id)) return;
    const spec = ORDER.find(([k]) => k === id)![1]();
    ensureSource((spec as { source: string }).source);
    const i = ORDER_IDS.indexOf(id);
    const above = ORDER_IDS.slice(i + 1).find((k) => map.getLayer(k));
    map.addLayer(spec, above ?? (id === "hillshade" ? firstLine : firstSymbol));
  };
  const visible = (id: string): boolean => !!map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none";
  const show = (id: string, on: boolean): void => {
    if (on) { ensure(id); map.setLayoutProperty(id, "visibility", "visible"); }
    else if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  };

  /**
   * Whether a source has drawn: tiles arrived, then none for a moment. Not isSourceLoaded(), areTilesLoaded() or
   * "idle": with 3D terrain a few edge tiles can stay "loading" for good, and the basemap's ne2_shaded source may never
   * report loaded, so those can stay false while the map looks complete.
   */
  const lastTile = new Map<string, number>();
  map.on("sourcedata", (e) => { if (e.sourceId && (e as { tile?: unknown }).tile) lastTile.set(e.sourceId, performance.now()); });
  const drawn = (id: string): boolean => { const at = lastTile.get(id); return at !== undefined && performance.now() - at > 400; };

  /** Cross-fade: the old scenario stays until the new one's tiles are in, then fades out. No blank flash on a switch. */
  let settleBy = 0;
  let settleStart = 0;
  const settleFloods = (): void => {
    if (!pendingOut.size) return;
    const cur = `flood_${last.scenario}`;
    if (!settleStart) settleStart = performance.now();
    const waited = performance.now() - settleStart;
    if (last.layers.flood.on && map.getSource(cur) && !drawn(cur) && waited < 3000) { // never two scenarios for long
      window.clearTimeout(settleBy);
      settleBy = window.setTimeout(settleFloods, 150);
      return;
    }
    settleStart = 0;
    window.clearTimeout(settleBy);
    for (const id of pendingOut) {
      map.setPaintProperty(id, "raster-opacity", 0);
      window.clearTimeout(fadeTimers.get(id));
      fadeTimers.set(id, window.setTimeout(() => { if (id !== `flood_${last.scenario}` || !last.layers.flood.on) show(id, false); }, fade.duration + 50));
    }
    pendingOut.clear();
  };

  const applyNow = (st: AppState): void => {
    const L = st.layers;
    show("hillshade", L.terrain.on);
    show("canopy", L.canopy.on);
    for (const s of SIDS) {
      const id = `flood_${s}`;
      if (L.flood.on && st.scenario === s) {
        window.clearTimeout(fadeTimers.get(id));
        pendingOut.delete(id);
        show(id, true);
        map.setPaintProperty(id, "raster-opacity", L.flood.opacity);
      } else if (L.flood.on && visible(id)) pendingOut.add(id);
      else { pendingOut.delete(id); show(id, false); }
    }
    show("rivers-casing", L.rivers.on); show("rivers", L.rivers.on);
    for (const id of ["zones-fill", "zones-casing", "zones-line"]) show(id, L.zones.on);
    show("hex-fill", L.priority.on); show("hex-line", L.priority.on);
    show("buildings-flat", L.buildings.on && !st.threeD);
    show("buildings-3d", L.buildings.on && st.threeD);
    show("trees", L.trees.on);
    show("bridges", L.bridges.on);
    for (const l of LAYERS) {
      if (l.id === "flood") continue; // handled above, with the fade
      for (const t of l.opacity) if (map.getLayer(t.layer)) map.setPaintProperty(t.layer, t.prop, L[l.id].opacity * (t.scale ?? 1));
    }
    if (map.getLayer("buildings-flat")) map.setPaintProperty("buildings-flat", "fill-color", depthStep(st.scenario));
    if (map.getLayer("buildings-3d")) map.setPaintProperty("buildings-3d", "fill-extrusion-color", depthStep(st.scenario));
    if (st.threeD && !map.getTerrain()) { ensureSource("terrain"); map.setTerrain({ source: "terrain", exaggeration: 1.3 }); }
    if (!st.threeD && map.getTerrain()) map.setTerrain(null);
    gestures(st.threeD);
    viewCtl.sync(st.threeD);
    settleFloods();
  };

  /** In 2D, tilting and rotating by accident is the commonest touch mistake: switch those gestures off. */
  const gestures = (threeD: boolean): void => {
    if (threeD) { map.dragRotate.enable(); map.touchPitch.enable(); map.touchZoomRotate.enableRotation(); }
    else { map.dragRotate.disable(); map.touchPitch.disable(); map.touchZoomRotate.disableRotation(); }
  };

  const start = (): void => {
    if (!styleReady || !release) return;
    const [w, s, e, n] = release.catalog.bounds_4326;
    const margin = 0.06;
    map.setMaxBounds([[w - margin, s - margin], [e + margin, n + margin]]);
    applyNow(last);
    const t0 = performance.now();
    const check = (): void => {
      if (!last.layers.flood.on || drawn(`flood_${last.scenario}`) || performance.now() - t0 > 20000) {
        performance.mark("bft:flood-ready");
        resolveReady();
      } else window.setTimeout(check, 200);
    };
    check();
  };

  // "style.load", not "load": "load" waits for the basemap's first complete render, which held the flood tiles back by ~10 s.
  map.once("style.load", () => {
    performance.mark("bft:style-load");
    const style = map.getStyle().layers;
    firstSymbol = style.find((l) => l.type === "symbol")?.id;
    firstLine = style.find((l) => l.type === "line")?.id;
    for (const l of style) if (l.id.startsWith("building")) map.setLayoutProperty(l.id, "visibility", "none");
    styleReady = true;
    start();
  });

  map.once("load", () => performance.mark("bft:first-render")); // timing marks: performance.getEntriesByType("mark")
  map.on("click", (ev) => {
    for (const [kind, layer] of CLICKABLE) {
      if (!visible(layer)) continue;
      const f: MapGeoJSONFeature | undefined = map.queryRenderedFeatures(ev.point, { layers: [layer] })[0];
      if (f) { featureCb(kind, (f.properties ?? {}) as Props, ev.lngLat); return; }
    }
  });
  for (const [, layer] of CLICKABLE) {
    map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
  }
  map.on("mousemove", (ev) => cursorCb(ev.lngLat));
  map.getCanvas().addEventListener("mouseleave", () => cursorCb(null));
  map.on("moveend", () => moveCb());

  const api: MapApi = {
    map,
    ready,
    attach(r) {
      performance.mark("bft:release");
      release = r;
      const terrainPm = new PMTiles(url("terrain.pmtiles"));
      protocol.add(terrainPm); // one header fetch serves the map and the elevation readout
      sampler = new ElevationSampler(terrainPm);
      start();
    },
    apply(st) {
      last = st;
      if (styleReady && release) applyNow(st);
    },
    set3D(on, st) {
      api.apply({ ...st, threeD: on });
      viewCtl.sync(on);
      // 3D means houses: from far out, also come close enough for the buildings to stand up
      const zoom = on && map.getZoom() < BUILDINGS_3D_ZOOM ? start3DZoom() : undefined;
      map.easeTo({ pitch: on ? START_3D.pitch : 0, bearing: on ? START_3D.bearing : 0, zoom, duration: o.reduceMotion ? 0 : 900 });
    },
    onToggle3D: (cb) => { toggleCb = cb; },
    view() {
      const c = map.getCenter();
      return { z: map.getZoom(), x: c.lng, y: c.lat, b: map.getBearing(), p: map.getPitch() };
    },
    elevationAt: (lng, lat) => (sampler ? sampler.at(lng, lat) : Promise.resolve(null)),
    onFeature: (cb) => { featureCb = cb; },
    onCursor: (cb) => { cursorCb = cb; },
    onMoveEnd: (cb) => { moveCb = cb; },
    focusZone(z) {
      focus = z;
      if (styleReady && release) {
        show("zone-focus-casing", true); show("zone-focus", true);
        map.setFilter("zone-focus-casing", focusFilter()); map.setFilter("zone-focus", focusFilter());
      }
      if (z.bbox) map.fitBounds([[z.bbox[0], z.bbox[1]], [z.bbox[2], z.bbox[3]]], { padding: 48, maxZoom: 15.2, duration: o.reduceMotion ? 0 : 900 });
    },
    clearFocus() {
      focus = null;
      if (map.getLayer("zone-focus")) { map.setFilter("zone-focus-casing", focusFilter()); map.setFilter("zone-focus", focusFilter()); }
    },
    home() {
      api.clearFocus();
      map.flyTo({ center: HOME.center, zoom: homeZoom(), pitch: last.threeD ? 55 : 0, bearing: last.threeD ? START_3D.bearing : 0, duration: o.reduceMotion ? 0 : 900 });
    },
    setBottomPadding(px) { map.setPadding({ top: 0, left: 0, right: 0, bottom: px }); },
    localize(t) {
      const set = (sel: string, key: string): void => {
        const b = document.querySelector<HTMLElement>(sel);
        if (b) { b.setAttribute("aria-label", t(key)); b.title = t(key); }
      };
      set(".maplibregl-ctrl-zoom-in", "zoom_in");
      set(".maplibregl-ctrl-zoom-out", "zoom_out");
      set(".maplibregl-ctrl-compass", "reset_north");
      set(".ctrl-home", "home");
      viewCtl.localize(t);
      map.getCanvas().setAttribute("aria-label", t("map_label"));
    },
  };
  return api;
}

/** One button under the zoom controls: back to the whole city. */
class HomeControl implements maplibregl.IControl {
  private el?: HTMLElement;
  constructor(private readonly go: () => void, private readonly t: (k: string) => string) {}
  onAdd(): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ctrl-home";
    b.setAttribute("aria-label", this.t("home"));
    b.title = this.t("home");
    b.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 7.5 8 3l5.5 4.5M4 6.5V13h3V9.5h2V13h3V6.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
    b.addEventListener("click", this.go);
    this.el = document.createElement("div");
    this.el.className = "maplibregl-ctrl maplibregl-ctrl-group";
    this.el.append(b);
    return this.el;
  }
  onRemove(): void { this.el?.remove(); }
}

/**
 * The 3D / 2D switch, on the map where people look for it (top right). Two toggle buttons; the pressed one is the
 * current view. Keyboard: Tab to it, Space or Enter.
 */
class ViewControl implements maplibregl.IControl {
  private el?: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];
  constructor(private readonly choose: (on: boolean) => void, private t: (k: string) => string, private on: boolean) {}
  onAdd(): HTMLElement {
    this.el = document.createElement("div");
    this.el.className = "maplibregl-ctrl maplibregl-ctrl-group ctrl-view";
    this.el.setAttribute("role", "group");
    for (const three of [true, false]) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.three = String(three);
      b.addEventListener("click", () => { if (three !== this.on) this.choose(three); });
      this.buttons.push(b);
      this.el.append(b);
    }
    this.localize(this.t);
    this.sync(this.on);
    return this.el;
  }
  sync(on: boolean): void {
    this.on = on;
    for (const b of this.buttons) b.setAttribute("aria-pressed", String((b.dataset.three === "true") === on));
  }
  localize(t: (k: string) => string): void {
    this.t = t;
    this.el?.setAttribute("aria-label", t("view_aria"));
    for (const b of this.buttons) {
      const three = b.dataset.three === "true";
      b.textContent = t(three ? "view_3d" : "view_2d");
      b.title = t(three ? "view_note_3d" : "view_note_2d");
    }
  }
  onRemove(): void { this.el?.remove(); }
}
