export type LayerId = "flood" | "buildings" | "priority" | "zones" | "canopy" | "trees" | "rivers" | "bridges" | "terrain";
/** How the data came about: observed (mapped by others), modelled (computed by a model), assumed (a rule applied here). */
export type Basis = "observed" | "modelled" | "assumed";
export type GroupId = "hazard" | "exposure" | "vegetation" | "context";

export interface OpacityTarget {
  layer: string;
  prop: string;
  /** Multiplies the slider value, for properties that are not a plain 0-1 opacity. */
  scale?: number;
}
export interface LayerDef {
  id: LayerId;
  group: GroupId;
  basis: Basis;
  defaultOn: boolean;
  defaultOpacity: number;
  /** Shown as a hint under the layer when it only draws from a zoom level. */
  fromZoom?: number;
  opacity: OpacityTarget[];
  /** Short credit for the collar; proper names, so not translated. */
  credit: string;
  /** Has a legend entry. */
  legend: boolean;
}

export const BASEMAP_CREDIT = "© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap";

export const LAYERS: LayerDef[] = [
  { id: "flood", group: "hazard", basis: "modelled", defaultOn: true, defaultOpacity: 0.9, legend: true,
    credit: "Bujumbura Flood Twin (CC BY 4.0)",
    opacity: [{ layer: "flood_s1", prop: "raster-opacity" }, { layer: "flood_s2", prop: "raster-opacity" }, { layer: "flood_s3", prop: "raster-opacity" }] },
  { id: "buildings", group: "hazard", basis: "modelled", defaultOn: true, defaultOpacity: 0.92, legend: true, fromZoom: 13,
    credit: "Google Open Buildings (CC BY 4.0) · © OpenStreetMap contributors",
    opacity: [{ layer: "buildings-flat", prop: "fill-opacity" }, { layer: "buildings-3d", prop: "fill-extrusion-opacity" }] },
  { id: "priority", group: "exposure", basis: "assumed", defaultOn: false, defaultOpacity: 0.7, legend: true,
    credit: "WorldPop, Univ. of Southampton (CC BY 4.0)",
    opacity: [{ layer: "hex-fill", prop: "fill-opacity" }] },
  { id: "zones", group: "exposure", basis: "assumed", defaultOn: false, defaultOpacity: 0.8, legend: true,
    credit: "© OpenStreetMap contributors",
    opacity: [{ layer: "zones-line", prop: "line-opacity" }, { layer: "zones-casing", prop: "line-opacity" }] },
  { id: "canopy", group: "vegetation", basis: "modelled", defaultOn: false, defaultOpacity: 0.9, legend: true,
    credit: "Meta & WRI High Resolution Canopy Height (CC BY 4.0)",
    opacity: [{ layer: "canopy", prop: "raster-opacity" }] },
  { id: "trees", group: "vegetation", basis: "modelled", defaultOn: false, defaultOpacity: 0.75, legend: true, fromZoom: 15,
    credit: "Meta & WRI High Resolution Canopy Height (CC BY 4.0)",
    opacity: [{ layer: "trees", prop: "circle-opacity" }] },
  { id: "terrain", group: "context", basis: "modelled", defaultOn: true, defaultOpacity: 0.5, legend: false,
    credit: "FABDEM, Univ. of Bristol / Fathom (CC BY-NC-SA 4.0)",
    // hillshade has no opacity; its exaggeration is its strength (0 to 0.6 here)
    opacity: [{ layer: "hillshade", prop: "hillshade-exaggeration", scale: 0.6 }] },
  { id: "rivers", group: "context", basis: "modelled", defaultOn: true, defaultOpacity: 0.85, legend: true,
    credit: "HydroRIVERS (Lehner & Grill, 2013) · © OpenStreetMap contributors",
    opacity: [{ layer: "rivers", prop: "line-opacity" }, { layer: "rivers-casing", prop: "line-opacity", scale: 0.8 }] },
  { id: "bridges", group: "context", basis: "observed", defaultOn: true, defaultOpacity: 1, legend: true,
    credit: "© OpenStreetMap contributors",
    opacity: [{ layer: "bridges", prop: "circle-opacity" }, { layer: "bridges", prop: "circle-stroke-opacity" }] },
];

export const GROUPS: { id: GroupId; layers: LayerId[] }[] = [
  { id: "hazard", layers: ["flood", "buildings"] },
  { id: "exposure", layers: ["priority", "zones"] },
  { id: "vegetation", layers: ["canopy", "trees"] },
  { id: "context", layers: ["rivers", "bridges", "terrain"] },
];

export const LAYER_BY_ID = Object.fromEntries(LAYERS.map((l) => [l.id, l])) as Record<LayerId, LayerDef>;
