import maplibregl from "maplibre-gl";
import { h } from "../dom";
import type { Release, ScenarioId, Zone } from "../data";
import { SCENARIO_IDS } from "../data";
import { nf, people, t } from "../i18n";
import type { FeatureKind, Props } from "../map";

const num = (v: number | string | undefined): number => Number(v ?? 0);

/** Depth class 0 (under 0.1 m) to 5, from the release's own class edges. */
function depthClass(release: Release, d: number): number {
  let i = 0;
  release.catalog.depth_classes.forEach((c, k) => { if (d >= c.min) i = k + 1; });
  return i;
}
const sw = (colour: string): HTMLElement => {
  const s = h("span", { class: "sw", "aria-hidden": "true" });
  s.style.background = colour;
  return s;
};

const row = (label: Node | string, value: string): HTMLElement => h("tr", {}, h("th", { scope: "row" }, label), h("td", {}, value));
const head = (title: string): HTMLElement => h("h4", {}, title);
const note = (text: string): HTMLElement => h("p", { class: "pop-note" }, text);
const code = (id: ScenarioId): string => id.toUpperCase();

/** Per scenario: swatch, code, depth in metres and what it means for a person. */
function depthRows(release: Release, p: Props): HTMLElement[] {
  return SCENARIO_IDS.map((id) => {
    const d = num(p[`d_${id}`]);
    const k = depthClass(release, d);
    const colour = k === 0 ? "var(--depth-dry)" : release.catalog.depth_classes[k - 1].colour;
    return row(h("span", { title: t(`sc_${id}`) }, sw(colour), code(id)), `${nf(d, 1)} m · ${k === 0 ? t("depth_dry") : t(`depth_b${k}`)}`);
  });
}

export function zoneContent(z: Zone | undefined, p: Props): HTMLElement {
  const name = z?.name ?? String(p.name ?? "");
  const rough = z?.roughPct ?? num(p.roughness_test_pct);
  return h("div", { class: "pop" },
    h("p", { class: "pop-kicker" }, t("zone_kicker")),
    head(t("zone_title", { name })),
    h("table", {}, row(t("zone_people"), `${t("approx")} ${people(z ? z.people : num(p.people))}`)),
    h("p", { class: "pop-label" }, t("hex_flooded")),
    h("table", {}, ...SCENARIO_IDS.map((id) => row(h("span", { title: t(`sc_${id}`) }, code(id)),
      z ? `${nf(z.buildings05[id])} / ${t("approx")} ${people(z.people05[id])}` : ""))),
    z?.canopyPct !== null && z?.canopyPct !== undefined
      ? h("table", {}, row(t("zone_canopy"), `${nf(z.canopyPct, 0)} %`), row(t("zone_trees"), t("zone_trees_v", { v: nf(z.treesHa ?? 0, 0) })))
      : null,
    z?.canopyPct !== null && z?.canopyPct !== undefined ? note(t("zone_veg_note")) : null,
    rough >= 10 ? h("p", { class: "pop-warn" }, t("zone_rough", { pct: nf(rough, 0) })) : null,
    note(t("lg_zones")));
}

function content(kind: FeatureKind, p: Props, release: Release): HTMLElement {
  if (kind === "building") {
    return h("div", { class: "pop" },
      head(t("bld_title")),
      h("table", {}, row(t("bld_height"), `${nf(num(p.h), 0)} m`), row(t("bld_area"), `${nf(num(p.a))} m²`)),
      h("p", { class: "pop-label" }, t("bld_depth")),
      h("table", {}, ...depthRows(release, p)),
      note(t("bld_note")));
  }
  if (kind === "hex") {
    return h("div", { class: "pop" },
      head(t("hex_title", { near: String(p.near ?? "") })),
      h("table", {}, row(t("hex_buildings"), nf(num(p.buildings))), row(t("hex_people"), `${t("approx")} ${people(num(p.people))}`)),
      h("p", { class: "pop-label" }, t("hex_flooded")),
      h("table", {}, ...SCENARIO_IDS.map((id) => row(h("span", { title: t(`sc_${id}`) }, code(id)), `${nf(num(p[`n_${id}`]))} / ${t("approx")} ${people(num(p[`p_${id}`]))}`))),
      h("p", {}, t("hex_rank", { rank: nf(num(p.rank_s2)) })),
      note(t("hex_note")));
  }
  if (kind === "zone") {
    const z = p.id !== undefined ? release.zones.find((x) => x.id === num(p.id)) : release.zones.find((x) => x.name === p.name);
    return zoneContent(z, p);
  }
  return h("div", { class: "pop" },
    head(String(p.name || t("bridge_title"))),
    h("table", {}, ...(p.river ? [row(t("bridge_river"), String(p.river))] : []),
      ...(p.road_name || p.road_ref ? [row(t("bridge_road"), [p.road_ref, p.road_name].filter(Boolean).join(" · "))] : [])),
    note(t("bridge_note")));
}

let open: maplibregl.Popup | null = null;
export function closePopup(): void { open?.remove(); open = null; }

/** Shows a popup; Escape closes it and focus goes back where it came from. */
export function showPopup(map: maplibregl.Map, at: maplibregl.LngLatLike, body: HTMLElement, onClose?: () => void): void {
  open?.remove();
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const narrow = matchMedia("(max-width: 860px)").matches;
  const popup = new maplibregl.Popup({ maxWidth: narrow ? "260px" : "300px", closeButton: true, focusAfterOpen: true, className: "flat-popup" })
    .setLngLat(at).setDOMContent(body).addTo(map);
  popup.getElement().addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); popup.remove(); } });
  // keep the whole popup on screen: nudge the map if it spills over an edge (above the mobile sheet too)
  requestAnimationFrame(() => {
    const box = popup.getElement().getBoundingClientRect();
    const view = map.getContainer().getBoundingClientRect();
    const bottom = view.bottom - (map.getPadding().bottom ?? 0) - 12;
    const dy = box.bottom > bottom ? box.bottom - bottom : box.top < view.top + 12 ? box.top - view.top - 12 : 0;
    const dx = box.right > view.right - 12 ? box.right - view.right + 12 : box.left < view.left + 12 ? box.left - view.left - 12 : 0;
    if (dx || dy) map.panBy([dx, dy], { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300 });
  });
  popup.on("close", () => {
    if (open === popup) open = null;
    onClose?.();
    const lost = !document.activeElement || document.activeElement === document.body;
    if (back && document.contains(back) && lost) back.focus();
  });
  open = popup;
}

export function featurePopup(map: maplibregl.Map, kind: FeatureKind, p: Props, at: maplibregl.LngLat, release: Release): void {
  showPopup(map, at, content(kind, p, release));
}
