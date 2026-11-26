import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./style.css";
import { $ } from "./dom";
import { loadRelease, type Release } from "./data";
import { applyStatic, getLang, t, toggleLang } from "./i18n";
import { createMap, type FeatureKind, type Props } from "./map";
import { defaultState, parseUrl, toUrl, type AppState } from "./state";
import { Collar } from "./ui/collar";
import { initChat } from "./ui/chat";
import { renderLimits } from "./ui/limits";
import { buildPanel, type Panel } from "./ui/panel";
import { showPopup } from "./ui/popups";
import { previewSection } from "./ui/preview";
import { renderSummary } from "./ui/summary";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
const hasWebGL2 = (): boolean => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } };
const flatStart = (navigator.hardwareConcurrency ?? 8) < 4 || !hasWebGL2() || !!conn?.saveData || ["slow-2g", "2g", "3g"].includes(conn?.effectiveType ?? "");

async function main(): Promise<void> {
  document.addEventListener("securitypolicyviolation", (e) => console.warn("CSP blocked:", e.effectiveDirective, e.blockedURI));
  applyStatic();
  const loading = $("loading");
  loading.textContent = t("loading_data");

  let st: AppState = parseUrl(location.search, defaultState());
  if (!st.view && flatStart) st = { ...st, threeD: false };
  let release: Release;
  try {
    release = await loadRelease(st.release);
  } catch (err) {
    console.error(err);
    loading.textContent = t("error");
    return;
  }
  loading.textContent = t("loading_map");

  const api = createMap({ release, state: st, lang: getLang(), reduceMotion, flatStart });
  const collar = new Collar(release);
  let selected: Props | null = null;
  let panel: Panel;
  const dialog = $<HTMLDialogElement>("limits");

  const update = (next: AppState): void => {
    st = next;
    api.apply(st);
    panel.refresh(st);
    collar.render(st);
    renderSummary(release, st);
    history.replaceState(null, "", toUrl(st, api.view()));
  };
  const mount = (): void => {
    panel = buildPanel($("panel-body"), release, st, {
      scenario: (id) => update({ ...st, scenario: id }),
      layer: (id, on) => update({ ...st, layers: { ...st.layers, [id]: { ...st.layers[id], on } } }),
      opacity: (id, v) => { st = { ...st, layers: { ...st.layers, [id]: { ...st.layers[id], opacity: v } } }; api.apply(st); },
      view3D: (on) => { st = { ...st, threeD: on }; api.set3D(on, st); panel.refresh(st); history.replaceState(null, "", toUrl(st, api.view())); },
    }, previewSection(api));
    api.localize(t);
    collar.render(st);
    renderSummary(release, st);
    renderLimits(release);
  };
  mount();
  const chat = initChat({ state: () => st, view: () => api.view(), selected: () => selected });

  api.onFeature((kind: FeatureKind, props, at) => { selected = { kind, ...props }; showPopup(api.map, kind, props, at, release); });
  api.onCursor((at) => collar.cursor(at, api.elevationAt));
  let moveTimer = 0;
  api.onMoveEnd(() => { window.clearTimeout(moveTimer); moveTimer = window.setTimeout(() => history.replaceState(null, "", toUrl(st, api.view())), 300); });
  void api.ready.then(() => { loading.hidden = true; });
  if (flatStart && !st.view) setTimeout(() => { loading.hidden = false; loading.textContent = t("no3d"); setTimeout(() => { loading.hidden = true; }, 4500); }, 1500);

  $("lang").addEventListener("click", () => { toggleLang(); mount(); chat.rebuild(); });
  $("limits-btn").addEventListener("click", () => dialog.showModal());
  $("limits-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  const lb = $("layers-btn");
  lb.addEventListener("click", () => {
    const open = $("panel").classList.toggle("open");
    lb.setAttribute("aria-expanded", String(open));
  });
}

void main();
