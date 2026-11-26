import maplibregl from "maplibre-gl";
import { h } from "../dom";
import type { Release, ScenarioId } from "../data";
import { SCENARIO_IDS } from "../data";
import { nf, people, t } from "../i18n";
import type { FeatureKind, Props } from "../map";

const num = (v: number | string | undefined): number => Number(v ?? 0);

/** Depth class index 0 (dry) to 4 (very high), from the release's own class edges. */
function depthWord(release: Release, d: number): string {
  const cls = release.catalog.depth_classes;
  let i = 0;
  cls.forEach((c, k) => { if (d >= c.min) i = k + 1; });
  return t(`cls${Math.min(i, 4)}`);
}

const row = (label: string, value: string): HTMLElement => h("tr", {}, h("th", { scope: "row" }, label), h("td", {}, value));
const head = (title: string): HTMLElement => h("h4", {}, title);
const note = (text: string): HTMLElement => h("p", { class: "pop-note" }, text);
const shortName = (id: ScenarioId): string => `${id.toUpperCase()} ${t(`sc_${id}`)}`;

function content(kind: FeatureKind, p: Props, release: Release): HTMLElement {
  if (kind === "building") {
    return h("div", { class: "pop" },
      head(t("bld_title")),
      h("table", {}, row(t("bld_height"), `${nf(num(p.h), 1)} m`), row(t("bld_area"), `${nf(num(p.a))} m²`)),
      h("p", { class: "pop-label" }, t("bld_depth")),
      h("table", {}, ...SCENARIO_IDS.map((id) => {
        const d = num(p[`d_${id}`]);
        return row(shortName(id), `${nf(d, 2)} m · ${depthWord(release, d)}`);
      })),
      note(t("bld_note")));
  }
  if (kind === "hex") {
    return h("div", { class: "pop" },
      head(t("hex_title", { near: String(p.near ?? "") })),
      h("table", {}, row(t("hex_buildings"), nf(num(p.buildings))), row(t("hex_people"), `${t("about")} ${people(num(p.people))}`)),
      h("p", { class: "pop-label" }, t("hex_flooded")),
      h("table", {}, ...SCENARIO_IDS.map((id) => row(shortName(id), `${nf(num(p[`n_${id}`]))} / ${t("about")} ${people(num(p[`p_${id}`]))}`))),
      h("p", {}, t("hex_rank", { rank: nf(num(p.rank_s2)) })),
      note(t("hex_note")));
  }
  if (kind === "zone") {
    const z = release.zones.find((x) => x.name === p.name);
    return h("div", { class: "pop" },
      head(t("zone_title", { name: String(p.name) })),
      h("table", {}, row(t("zone_people"), `${t("about")} ${people(num(p.people))}`)),
      h("p", { class: "pop-label" }, t("hex_flooded")),
      h("table", {}, ...SCENARIO_IDS.map((id) => row(shortName(id), z ? `${nf(z.buildings05[id])} / ${t("about")} ${people(z.people05[id])}` : ""))),
      note(t("zone_note")));
  }
  return h("div", { class: "pop" },
    head(String(p.name || t("bridge_title"))),
    h("table", {}, ...(p.river ? [row(t("bridge_river"), String(p.river))] : []),
      ...(p.road_name || p.road_ref ? [row(t("bridge_road"), [p.road_ref, p.road_name].filter(Boolean).join(" · "))] : [])),
    note(t("bridge_note")));
}

let open: maplibregl.Popup | null = null;
export function showPopup(map: maplibregl.Map, kind: FeatureKind, p: Props, at: maplibregl.LngLat, release: Release): void {
  open?.remove();
  open = new maplibregl.Popup({ maxWidth: "300px", closeButton: true, focusAfterOpen: true, className: "flat-popup" })
    .setLngLat(at).setDOMContent(content(kind, p, release)).addTo(map);
}
