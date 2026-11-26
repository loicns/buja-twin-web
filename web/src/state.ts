import { LAYERS, LAYER_BY_ID, type LayerId } from "./layers";
import { SCENARIO_IDS, type ScenarioId } from "./data";

export interface View { z: number; x: number; y: number; b: number; p: number }
export interface LayerState { on: boolean; opacity: number }
export interface AppState {
  scenario: ScenarioId;
  layers: Record<LayerId, LayerState>;
  threeD: boolean;
  /** Pinned data release from the link, else the one current.json names. */
  release: string | null;
  view: View | null;
}

export function defaultState(): AppState {
  return {
    scenario: "s2",
    layers: Object.fromEntries(LAYERS.map((l) => [l.id, { on: l.defaultOn, opacity: l.defaultOpacity }])) as Record<LayerId, LayerState>,
    threeD: true,
    release: null,
    view: null,
  };
}

const num = (v: string | null): number | null => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Deep links: /?layers=flood,buildings&s=2&z=14.2&x=29.37&y=-3.36&b=-20&p=55&o=flood:80,canopy:60&release=v20261126b
 * Unknown ids and out-of-range values are ignored, so a stale link still opens.
 */
export function parseUrl(search: string, base: AppState): AppState {
  const q = new URLSearchParams(search);
  const st: AppState = structuredClone(base);

  const s = q.get("s");
  if (s && /^[123]$/.test(s)) st.scenario = `s${s}` as ScenarioId;
  else if (s && (SCENARIO_IDS as string[]).includes(s)) st.scenario = s as ScenarioId;

  const layers = q.get("layers");
  if (layers !== null) {
    const wanted = new Set(layers.split(",").map((x) => x.trim()));
    for (const l of LAYERS) st.layers[l.id].on = wanted.has(l.id);
  }
  for (const part of (q.get("o") ?? "").split(",")) {
    const [id, pct] = part.split(":");
    const v = num(pct ?? null);
    if (id in LAYER_BY_ID && v !== null) st.layers[id as LayerId].opacity = Math.min(1, Math.max(0, v / 100));
  }

  const z = num(q.get("z")), x = num(q.get("x")), y = num(q.get("y"));
  if (z !== null && x !== null && y !== null && z >= 8 && z <= 20 && Math.abs(x) <= 180 && Math.abs(y) <= 85) {
    st.view = { z, x, y, b: num(q.get("b")) ?? 0, p: Math.min(75, Math.max(0, num(q.get("p")) ?? 0)) };
    st.threeD = st.view.p > 0;
  }
  const rel = q.get("release");
  if (rel && /^v\d{8}[a-z]?$/.test(rel)) st.release = rel;
  return st;
}

export function toUrl(st: AppState, view: View): string {
  const q = new URLSearchParams();
  q.set("s", st.scenario.slice(1));
  q.set("layers", LAYERS.filter((l) => st.layers[l.id].on).map((l) => l.id).join(","));
  const op = LAYERS.filter((l) => Math.abs(st.layers[l.id].opacity - l.defaultOpacity) > 0.005)
    .map((l) => `${l.id}:${Math.round(st.layers[l.id].opacity * 100)}`);
  if (op.length) q.set("o", op.join(","));
  q.set("z", view.z.toFixed(2));
  q.set("x", view.x.toFixed(4));
  q.set("y", view.y.toFixed(4));
  if (Math.abs(view.b) > 0.5) q.set("b", view.b.toFixed(0));
  q.set("p", view.p.toFixed(0));
  if (st.release) q.set("release", st.release);
  return `?${q.toString().replace(/%2C/g, ",").replace(/%3A/g, ":")}`;
}
