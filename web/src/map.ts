import maplibregl, { type ExpressionSpecification, type LayerSpecification, type MapGeoJSONFeature } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAP_STYLE } from "./config";
import type { Release, ScenarioId } from "./data";
import { ElevationSampler } from "./elevation";
import type { Lang } from "./i18n";
import { LAYERS } from "./layers";
import type { AppState, View } from "./state";

export type FeatureKind = "building" | "bridge" | "hex" | "zone";
export type Props = Record<string, number | string>;

export interface MapApi {
  map: maplibregl.Map;
  apply(st: AppState): void;
  set3D(on: boolean, st: AppState): void;
  view(): View;
  elevationAt(lng: number, lat: number): Promise<number | null>;
  onFeature(cb: (kind: FeatureKind, props: Props, at: maplibregl.LngLat) => void): void;
  onCursor(cb: (at: maplibregl.LngLat | null) => void): void;
  onMoveEnd(cb: () => void): void;
  ready: Promise<void>;
  localize(t: (k: string) => string): void;
}

interface Options { release: Release; state: AppState; lang: Lang; reduceMotion: boolean; flatStart: boolean }

const CLICKABLE: [FeatureKind, string][] = [["bridge", "bridges"], ["building", "buildings-3d"], ["building", "buildings-flat"], ["hex", "hex-fill"], ["zone", "zones-fill"]];

export function createMap(o: Options): MapApi {
  const { release } = o;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  const url = (f: string): string => `${release.base}/pmtiles/${f}`;
  const pm = (f: string): string => `pmtiles://${url(f)}`;
  // One PMTiles object serves both the map and the elevation readout, so the header and directory are fetched once.
  const terrainPm = new PMTiles(url("terrain.pmtiles"));
  protocol.add(terrainPm);
  const sampler = new ElevationSampler(terrainPm);

  const [w, s, e, n] = release.catalog.bounds_4326;
  const margin = 0.06;
  const v = o.state.view;
  const map = new maplibregl.Map({
    container: "map",
    style: BASEMAP_STYLE,
    center: v ? [v.x, v.y] : [(w + e) / 2 + 0.02, (s + n) / 2 - 0.02],
    zoom: v?.z ?? 12.3,
    pitch: v?.p ?? (o.state.threeD ? 55 : 0),
    bearing: v?.b ?? (o.state.threeD ? -20 : 0),
    maxPitch: 75,
    maxBounds: [[w - margin, s - margin], [e + margin, n + margin]],
    attributionControl: false, // credits live in the collar bar and the limits dialog
    fadeDuration: o.reduceMotion ? 0 : 200,
    canvasContextAttributes: { antialias: false },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");
  map.getCanvas().setAttribute("aria-hidden", "true"); // the text summary stands in for the picture
  map.keyboard.enable();
  if (new URLSearchParams(location.search).has("debug")) (window as unknown as { __map: maplibregl.Map }).__map = map;
  map.on("error", (ev) => console.error("map error:", (ev as { sourceId?: string }).sourceId ?? "", ev.error?.message ?? ev.error));

  let featureCb: Parameters<MapApi["onFeature"]>[0] = () => {};
  let cursorCb: Parameters<MapApi["onCursor"]>[0] = () => {};
  let moveCb: () => void = () => {};
  let last: AppState = o.state;
  let loaded = false;

  const depthStep = (id: ScenarioId): ExpressionSpecification => {
    const d: ExpressionSpecification = ["coalesce", ["get", `d_${id}`], 0];
    const steps: (string | number)[] = ["#c3cbd6"];
    for (const c of release.catalog.depth_classes) steps.push(c.min, c.colour);
    return ["step", d, ...steps] as unknown as ExpressionSpecification;
  };

  const ready = new Promise<void>((resolve) => {
    map.once("load", () => {
      const style = map.getStyle().layers;
      const firstSymbol = style.find((l) => l.type === "symbol")?.id;
      const firstLine = style.find((l) => l.type === "line")?.id;
      for (const l of style) if (l.id.startsWith("building")) map.setLayoutProperty(l.id, "visibility", "none");

      const dem = { type: "raster-dem", url: pm("terrain.pmtiles"), encoding: "terrarium", tileSize: 256 } as const;
      map.addSource("terrain", dem);
      map.addSource("terrain-shade", dem); // separate from the 3D source: avoids a MapLibre rendering warning
      map.addSource("canopy", { type: "raster", url: pm("canopy.pmtiles"), tileSize: 256 });
      for (const id of ["s1", "s2", "s3"]) map.addSource(`flood_${id}`, { type: "raster", url: pm(`depth_${id}.pmtiles`), tileSize: 256 });
      for (const id of ["buildings", "hex", "zones", "trees", "context"]) map.addSource(id, { type: "vector", url: pm(`${id}.pmtiles`) });

      map.addLayer({ id: "hillshade", type: "hillshade", source: "terrain-shade",
        paint: { "hillshade-shadow-color": "#46576a", "hillshade-highlight-color": "#ffffff", "hillshade-exaggeration": 0.3 } }, firstLine);
      const add = (spec: LayerSpecification): void => { map.addLayer(spec, firstSymbol); };
      add({ id: "canopy", type: "raster", source: "canopy", paint: { "raster-resampling": "nearest" } });
      for (const id of ["s1", "s2", "s3"]) add({ id: `flood_${id}`, type: "raster", source: `flood_${id}`, paint: { "raster-resampling": "nearest" } });
      add({ id: "rivers", type: "line", source: "context", "source-layer": "rivers",
        paint: { "line-color": "#3866a6", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 15, 2] } });
      add({ id: "zones-fill", type: "fill", source: "zones", "source-layer": "zones", paint: { "fill-color": "#22416a", "fill-opacity": 0.03 } });
      add({ id: "zones-line", type: "line", source: "zones", "source-layer": "zones",
        paint: { "line-color": "#22416a", "line-width": 1.2, "line-dasharray": [3, 2] } });
      add({ id: "hex-fill", type: "fill", source: "hex", "source-layer": "hex", filter: [">", ["coalesce", ["get", "p_s2"], 0], 0],
        paint: { "fill-color": ["step", ["coalesce", ["get", "priority"], 0], "#efe3d3", 0.5, "#e6c08a", 0.8, "#dc9a4c", 0.95, "#b4462f"] } });
      add({ id: "hex-line", type: "line", source: "hex", "source-layer": "hex", filter: [">", ["coalesce", ["get", "p_s2"], 0], 0],
        paint: { "line-color": "#7a2f1f", "line-width": 0.5, "line-opacity": 0.45 } });
      add({ id: "buildings-flat", type: "fill", source: "buildings", "source-layer": "buildings", minzoom: 13,
        paint: { "fill-color": depthStep(last.scenario) } });
      add({ id: "buildings-3d", type: "fill-extrusion", source: "buildings", "source-layer": "buildings", minzoom: 15,
        paint: { "fill-extrusion-height": ["coalesce", ["get", "h"], 3], "fill-extrusion-base": 0, "fill-extrusion-color": depthStep(last.scenario) } });
      add({ id: "trees", type: "circle", source: "trees", "source-layer": "trees", minzoom: 15,
        paint: {
          "circle-pitch-alignment": "map",
          "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 15, ["max", 1, ["*", ["coalesce", ["get", "d"], 4], 0.105]], 19, ["max", 2, ["*", ["coalesce", ["get", "d"], 4], 1.68]]],
          "circle-color": ["step", ["coalesce", ["get", "h"], 0], "#a9c09a", 5, "#6f9a68", 10, "#3e6b4b", 20, "#27492f"],
        } });
      add({ id: "bridges", type: "circle", source: "context", "source-layer": "bridges",
        paint: { "circle-radius": 6, "circle-color": "#071426", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });

      loaded = true;
      api.apply(last);
      map.on("click", (ev) => {
        for (const [kind, layer] of CLICKABLE) {
          if (!map.getLayer(layer) || map.getLayoutProperty(layer, "visibility") === "none") continue;
          const f: MapGeoJSONFeature | undefined = map.queryRenderedFeatures(ev.point, { layers: [layer] })[0];
          if (f) { featureCb(kind, (f.properties ?? {}) as Props, ev.lngLat); return; }
        }
      });
      for (const [, layer] of CLICKABLE) {
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
      map.once("idle", () => resolve());
    });
  });

  map.on("mousemove", (ev) => cursorCb(ev.lngLat));
  map.getCanvas().addEventListener("mouseleave", () => cursorCb(null));
  map.on("moveend", () => moveCb());

  const api: MapApi = {
    map,
    ready,
    apply(st) {
      last = st;
      if (!loaded) return;
      const vis = (on: boolean): "visible" | "none" => (on ? "visible" : "none");
      const set = (id: string, on: boolean): void => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis(on)); };
      for (const sid of ["s1", "s2", "s3"]) set(`flood_${sid}`, st.layers.flood.on && st.scenario === sid);
      set("buildings-flat", st.layers.buildings.on);
      set("buildings-3d", st.layers.buildings.on && st.threeD);
      map.setLayerZoomRange("buildings-flat", 13, st.threeD ? 15 : 24);
      set("hex-fill", st.layers.priority.on); set("hex-line", st.layers.priority.on);
      set("zones-fill", st.layers.zones.on); set("zones-line", st.layers.zones.on);
      set("canopy", st.layers.canopy.on); set("trees", st.layers.trees.on);
      set("rivers", st.layers.rivers.on); set("bridges", st.layers.bridges.on);
      set("hillshade", st.layers.terrain.on);
      for (const l of LAYERS) {
        for (const t of l.opacity) {
          if (!map.getLayer(t.layer)) continue;
          map.setPaintProperty(t.layer, t.prop, st.layers[l.id].opacity * (t.scale ?? 1));
        }
      }
      map.setPaintProperty("buildings-flat", "fill-color", depthStep(st.scenario));
      map.setPaintProperty("buildings-3d", "fill-extrusion-color", depthStep(st.scenario));
      const want = st.threeD ? { source: "terrain", exaggeration: 1.3 } : null;
      if (st.threeD && !map.getTerrain()) map.setTerrain(want);
      if (!st.threeD && map.getTerrain()) map.setTerrain(null);
    },
    set3D(on, st) {
      api.apply({ ...st, threeD: on });
      map.easeTo({ pitch: on ? 55 : 0, bearing: on ? -20 : 0, duration: o.reduceMotion ? 0 : 700 });
    },
    view() {
      const c = map.getCenter();
      return { z: map.getZoom(), x: c.lng, y: c.lat, b: map.getBearing(), p: map.getPitch() };
    },
    elevationAt: (lng, lat) => sampler.at(lng, lat),
    onFeature: (cb) => { featureCb = cb; },
    onCursor: (cb) => { cursorCb = cb; },
    onMoveEnd: (cb) => { moveCb = cb; },
    localize(t) {
      const set = (sel: string, key: string): void => {
        const b = document.querySelector<HTMLElement>(sel);
        if (b) { b.setAttribute("aria-label", t(key)); b.title = t(key); }
      };
      set(".maplibregl-ctrl-zoom-in", "zoom_in");
      set(".maplibregl-ctrl-zoom-out", "zoom_out");
      set(".maplibregl-ctrl-compass", "reset_north");
    },
  };
  return api;
}
