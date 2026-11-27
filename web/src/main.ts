import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./style.css";
import { $, h } from "./dom";
import { loadRelease, type Release, type ScenarioId, type Zone } from "./data";
import { applyStatic, people, t, toggleLang } from "./i18n";
import type { FeatureKind, MapApi, Props } from "./map";
import { defaultState, parseUrl, toUrl, type AppState } from "./state";
import { Collar } from "./ui/collar";
import { initChat } from "./ui/chat";
import { initIntro } from "./ui/intro";
import { renderLimits } from "./ui/limits";
import { buildPanel, type Panel } from "./ui/panel";
import { previewSection } from "./ui/preview";
import { announce, renderSummary } from "./ui/summary";

// MapLibre is about 1 MB: it loads in its own chunk, in parallel with the data, while the cover and panel paint.
const lazyMap = import("./map");
const lazyPopups = import("./ui/popups");

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = matchMedia("(max-width: 860px)");
const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
const hasWebGL2 = (): boolean => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } };
const lowEnd = (navigator.hardwareConcurrency ?? 8) < 4 || !hasWebGL2() || !!conn?.saveData || ["slow-2g", "2g", "3g"].includes(conn?.effectiveType ?? "");
/** Phones start in 2D: lighter on data and battery, and no accidental tilting. */
const flatStart = lowEnd || (narrow.matches && matchMedia("(pointer: coarse)").matches);

function toast(text: string): void {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  window.clearTimeout(Number(el.dataset.timer));
  el.dataset.timer = String(window.setTimeout(() => { el.hidden = true; }, 3200));
}

async function main(): Promise<void> {
  document.addEventListener("securitypolicyviolation", (e) => console.warn("CSP blocked:", e.effectiveDirective, e.blockedURI));
  const embed = document.documentElement.classList.contains("embed");
  applyStatic();
  const loading = $("loading");
  loading.textContent = t("loading_data");
  const dialog = $<HTMLDialogElement>("limits");
  const openLimits = (): void => { if (!dialog.open) dialog.showModal(); };

  let st: AppState = parseUrl(location.search, defaultState());
  if (!st.view && flatStart) st = { ...st, threeD: false };

  const intro = initIntro({ closed: () => document.querySelector<HTMLElement>("#zone-search, .seg[aria-checked=true]")?.focus(), how: openLimits });

  // the basemap starts as soon as MapLibre is parsed; the flood layers are added when the release arrives
  const apiP: Promise<MapApi> = lazyMap.then(({ createMap }) => createMap({ state: st, reduceMotion, t }));
  let release: Release;
  try {
    release = await loadRelease(st.release);
  } catch (err) {
    console.error(err);
    const retry = h("button", { type: "button", class: "inline-link" }, t("retry"));
    retry.addEventListener("click", () => location.reload());
    loading.replaceChildren(t("error"), retry);
    return;
  }
  intro.fill(release);
  const api = await apiP;
  const { featurePopup, showPopup, zoneContent, closePopup } = await lazyPopups;
  api.attach(release);
  loading.textContent = t("loading_map");

  const collar = new Collar(release);
  let selected: Props | null = null;
  let panel: Panel;

  const syncUrl = (): void => history.replaceState(null, "", toUrl(st, api.view()));
  const update = (next: AppState): void => {
    const changed = next.scenario !== st.scenario;
    st = next;
    api.apply(st);
    panel.refresh(st);
    collar.render(st);
    renderSummary(release, st);
    syncUrl();
    syncHint();
    if (changed) announce(t("announce_scenario", { name: t(`sc_${st.scenario}`), p: people(release.summary[st.scenario].people_ge_0p5m) }));
  };
  const scenario = (id: ScenarioId): void => update({ ...st, scenario: id });
  // buildings only exist from zoom 13 (and the city overview is 12.3): say so on the map, with a one-click way in
  const hint = h("button", { type: "button", class: "map-hint", hidden: true });
  hint.addEventListener("click", () => api.map.easeTo({ zoom: 14.2, duration: reduceMotion ? 0 : 800 }));
  $("map").append(hint);
  const syncHint = (): void => {
    hint.hidden = !st.layers.buildings.on || api.map.getZoom() >= 13;
    hint.textContent = `${t(st.threeD ? "hint_buildings_3d" : "hint_buildings")} →`;
  };
  const sheetPeek = (): void => {
    const p = $("panel");
    if (narrow.matches && p.dataset.sheet === "open") p.querySelector<HTMLButtonElement>(".sheet-handle")?.click();
  };
  const showZone = (z: Zone): void => {
    api.focusZone(z);
    panel.current(z);
    sheetPeek();
    if (z.at) {
      const at = z.at;
      window.setTimeout(() => showPopup(api.map, at, zoneContent(z, {}), () => panel.current(null)), reduceMotion ? 0 : 950);
    }
    announce(t("announce_zone", { name: z.name }));
  };

  const mount = (): void => {
    panel = buildPanel($("panel-body"), release, st, {
      scenario,
      layer: (id, on) => update({ ...st, layers: { ...st.layers, [id]: { ...st.layers[id], on } } }),
      opacity: (id, v) => { st = { ...st, layers: { ...st.layers, [id]: { ...st.layers[id], opacity: v } } }; api.apply(st); },
      view3D: (on) => { st = { ...st, threeD: on }; api.set3D(on, st); panel.refresh(st); syncUrl(); syncHint(); },
      zone: showZone,
      zoomTo: (z) => api.map.easeTo({ zoom: z, duration: reduceMotion ? 0 : 600 }),
      limits: openLimits,
      intro: () => intro.open(),
    }, previewSection(api));
    panel.zoom(api.map.getZoom());
    api.localize(t);
    collar.render(st);
    renderSummary(release, st);
    renderLimits(release);
    padForSheet();
    syncHint();
  };
  // on phones the sheet's peek strip covers the bottom of the map: frame things above it
  const padForSheet = (): void => {
    const head = document.querySelector<HTMLElement>(".sheet-head");
    api.setBottomPadding(narrow.matches && head ? head.offsetHeight : 0);
  };
  narrow.addEventListener("change", padForSheet);
  mount();
  const chat = initChat({ state: () => st, view: () => api.view(), selected: () => selected });

  api.onFeature((kind: FeatureKind, props, at) => {
    selected = { kind, ...props };
    featurePopup(api.map, kind, props, at, release);
  });
  api.onCursor((at) => collar.cursor(at, api.elevationAt));
  let moveTimer = 0;
  api.onMoveEnd(() => { window.clearTimeout(moveTimer); moveTimer = window.setTimeout(syncUrl, 300); panel.zoom(api.map.getZoom()); syncHint(); });
  void api.ready.then(() => { loading.hidden = true; });
  if (lowEnd && !st.view && !embed) window.setTimeout(() => toast(t("no3d")), 1500);

  // header and footer
  $("lang").addEventListener("click", () => { toggleLang(); mount(); chat.rebuild(); closePopup(); });
  $("status").addEventListener("click", openLimits);
  $("collar-sources").addEventListener("click", openLimits);
  $("limits-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  $("ask").addEventListener("click", () => { if (!$("chat").hidden) sheetPeek(); });
  $("share").addEventListener("click", async () => {
    syncUrl();
    const link = location.href;
    try {
      if (narrow.matches && navigator.share) await navigator.share({ title: document.title, url: link });
      else { await navigator.clipboard.writeText(link); toast(t("share_copied")); }
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") toast(t("share_failed"));
    }
  });

  // 1, 2, 3 switch scenario while focus is on the map or in the panel (never while typing; WCAG 2.1.4)
  $("stage").addEventListener("keydown", (e) => {
    const el = e.target as HTMLElement;
    if (e.altKey || e.ctrlKey || e.metaKey || el.closest("input, textarea, select, [contenteditable], #chat")) return;
    const id = ({ "1": "s1", "2": "s2", "3": "s3" } as Record<string, ScenarioId>)[e.key];
    if (id) { e.preventDefault(); scenario(id); }
  });
}

void main();
