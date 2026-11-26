import { h } from "../dom";
import { FEEDBACK_URL, CODE_URL } from "../config";
import { SCENARIO_IDS, type ClassDef, type Release, type ScenarioId } from "../data";
import { nf, people, t } from "../i18n";
import { GROUPS, LAYER_BY_ID, type Basis, type LayerId } from "../layers";
import type { AppState } from "../state";

export interface PanelHandlers {
  scenario(id: ScenarioId): void;
  layer(id: LayerId, on: boolean): void;
  opacity(id: LayerId, v: number): void;
  view3D(on: boolean): void;
}
export interface Panel { refresh(st: AppState): void }

/** Filled, half-filled and empty squares: the kind of data never relies on colour alone. */
function tag(basis: Basis): HTMLElement {
  const fill = { observed: "100%", modelled: "50%", assumed: "0" }[basis];
  const sq = h("span", { class: "sq", "aria-hidden": "true" }, h("span", { class: "sq-fill", style: `width:${fill}` }));
  return h("span", { class: "tag", "data-basis": basis, title: t(`st_${basis}`) }, sq, t(`st_${basis}`));
}

const range = (c: ClassDef): string =>
  c.max === null ? t("range_over", { a: nf(c.min, 1) }) : t("range_to", { a: nf(c.min, 1), b: nf(c.max, 1) });
const swatch = (colour: string, label: string): HTMLElement => {
  const sw = h("span", { class: "sw", "aria-hidden": "true" });
  sw.style.background = colour;
  return h("li", {}, sw, label);
};

export function buildPanel(root: HTMLElement, release: Release, st0: AppState, hd: PanelHandlers, extra: HTMLElement[]): Panel {
  const depth = release.catalog.depth_classes;
  const veg = release.catalog.vegetation;

  // --- scenario --------------------------------------------------------------------------------
  const radios = SCENARIO_IDS.map((id) => {
    const b = h("button", { type: "button", role: "radio", class: "seg", "data-id": id },
      h("span", { class: "seg-id" }, id.toUpperCase()), h("span", { class: "seg-name" }, t(`sc_${id}`)), h("span", { class: "seg-note" }, t(`sc_${id}_note`)));
    b.addEventListener("click", () => hd.scenario(id));
    b.addEventListener("keydown", (e) => {
      const i = SCENARIO_IDS.indexOf(id);
      const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!next) return;
      e.preventDefault();
      const to = SCENARIO_IDS[(i + next + SCENARIO_IDS.length) % SCENARIO_IDS.length];
      hd.scenario(to);
      radios.find((r) => r.dataset.id === to)?.focus();
    });
    return b;
  });
  const group = h("div", { class: "segs", role: "radiogroup", "aria-label": t("scenarios_aria") }, ...radios);
  const detail = h("p", { class: "mono-line" });
  const stats = h("dl", { class: "stats" });
  const compare = h("table", { class: "cmp" });

  // --- layers ----------------------------------------------------------------------------------
  const rows = new Map<LayerId, { li: HTMLElement; box: HTMLInputElement; range: HTMLInputElement; out: HTMLOutputElement; op: HTMLElement }>();
  const layerGroups = GROUPS.map((g) => h("div", { class: "lgroup" },
    h("h3", { class: "label" }, t(`grp_${g.id}`)),
    h("ul", { class: "layers" }, ...g.layers.map((id) => {
      const def = LAYER_BY_ID[id];
      const name = t(`layer_${id}`);
      const box = h("input", { type: "checkbox", id: `lyr-${id}`, "aria-label": t("layer_on", { name }) });
      box.addEventListener("change", () => hd.layer(id, box.checked));
      const slider = h("input", { type: "range", min: "0", max: "100", step: "5", id: `op-${id}`, "aria-label": t("opacity_aria", { name }) });
      const out = h("output", { for: `op-${id}` });
      slider.addEventListener("input", () => { out.value = `${slider.value}%`; hd.opacity(id, Number(slider.value) / 100); });
      const op = h("div", { class: "opacity" }, h("span", {}, t("opacity")), slider, out);
      const li = h("li", { class: "layer" },
        h("div", { class: "layer-head" }, h("label", { for: `lyr-${id}`, class: "layer-name" }, box, name), tag(def.basis)),
        h("p", { class: "layer-src" }, t(`layer_${id}_src`) + (def.fromZoom ? ` · ${t("from_zoom", { z: def.fromZoom })}` : "")),
        op);
      rows.set(id, { li, box, range: slider, out, op });
      return li;
    }))));

  const view = ["3d", "2d"].map((k) => {
    const b = h("button", { type: "button", role: "radio", class: "seg seg-small", "data-view": k }, t(`view_${k}`));
    b.addEventListener("click", () => hd.view3D(k === "3d"));
    return b;
  });
  const viewNote = h("p", { class: "note" });

  const legend = h("div", { class: "legend", "aria-label": t("legend_title_aria") });
  const bars = h("ul", { class: "bars" });

  const foot = h("div", { class: "foot" },
    h("a", { href: CODE_URL, target: "_blank", rel: "noopener" }, t("d_code")),
    FEEDBACK_URL ? h("a", { href: FEEDBACK_URL, target: "_blank", rel: "noopener" }, t("feedback")) : null);

  root.replaceChildren(
    h("p", { class: "caveat" }, t("caveat")),
    h("section", {}, h("h2", { class: "label" }, t("sec_scenario")), group, detail, stats, compare),
    h("section", {}, h("h2", { class: "label" }, t("sec_layers")), ...layerGroups,
      h("div", { class: "lgroup" }, h("h3", { class: "label" }, t("sec_view")), h("div", { class: "segs segs-2", role: "radiogroup", "aria-label": t("sec_view") }, ...view), viewNote)),
    h("section", {}, h("h2", { class: "label" }, t("sec_legend")), legend),
    h("section", {}, h("h2", { class: "label" }, t("sec_neigh")), h("p", { class: "note" }, t("neigh_title")), bars, h("p", { class: "note" }, t("neigh_note"))),
    ...extra, foot);

  function refresh(st: AppState): void {
    const sc = release.catalog.scenarios.find((s) => s.id === st.scenario)!;
    const ex = release.summary[st.scenario];
    for (const r of radios) r.setAttribute("aria-checked", String(r.dataset.id === st.scenario)), (r.tabIndex = r.dataset.id === st.scenario ? 0 : -1);
    detail.textContent = t("sc_detail", { rain: nf(sc.rain_mm, 1), h: nf(sc.storm_hours), lake: nf(sc.lake_stage_m_egm2008, 2) });
    const stat = (label: string, value: string): Node[] => [h("dt", {}, label), h("dd", {}, value)];
    stats.replaceChildren(
      ...stat(t("stat_wet"), `${nf(sc.stats.wet_km2_gt_0p5m, 1)} ${t("km2")}`),
      ...stat(t("stat_buildings"), `${t("about")} ${nf(Math.round(ex.buildings_ge_0p5m / 100) * 100)}`),
      ...stat(t("stat_people"), `${t("about")} ${people(ex.people_ge_0p5m)}`));
    compare.replaceChildren(
      h("thead", {}, h("tr", {}, h("th", {}, t("col_scenario")), h("th", {}, t("col_buildings")), h("th", {}, t("col_people")))),
      h("tbody", {}, ...SCENARIO_IDS.map((id) => h("tr", id === st.scenario ? { class: "on" } : {},
        h("th", { scope: "row" }, id.toUpperCase()), h("td", {}, nf(Math.round(release.summary[id].buildings_ge_0p5m / 100) * 100)),
        h("td", {}, people(release.summary[id].people_ge_0p5m))))));

    for (const [id, r] of rows) {
      r.box.checked = st.layers[id].on;
      r.range.value = String(Math.round(st.layers[id].opacity * 100));
      r.out.value = `${r.range.value}%`;
      r.op.hidden = !st.layers[id].on;
    }
    for (const b of view) {
      const on3 = b.dataset.view === "3d";
      b.setAttribute("aria-checked", String(on3 === st.threeD));
      b.tabIndex = on3 === st.threeD ? 0 : -1;
    }
    viewNote.textContent = st.threeD ? t("view_note_3d") : t("view_note_2d");

    // legend: visible layers only
    const L = st.layers;
    const blocks: HTMLElement[] = [];
    const block = (title: string, basis: Basis, ...kids: (Node | null)[]): void => {
      blocks.push(h("div", { class: "lg" }, h("div", { class: "lg-head" }, h("span", { class: "lg-title" }, title), tag(basis)), ...kids));
    };
    const depthList = (): HTMLElement => h("ul", { class: "sws" }, ...depth.map((c) => swatch(c.colour, range(c))));
    if (L.flood.on) block(`${t("lg_flood")} · ${st.scenario.toUpperCase()}`, "modelled", depthList());
    if (L.buildings.on) block(t("lg_buildings"), "modelled", h("ul", { class: "sws" }, swatch("#c3cbd6", t("lg_dry")), ...depth.map((c) => swatch(c.colour, range(c)))));
    if (L.canopy.on) block(t("lg_canopy"), "modelled", h("ul", { class: "sws" }, ...veg.canopy_classes.map((c) => swatch(c.colour, c.max === null ? t("canopy_over", { a: nf(c.min) }) : t("range_canopy", { a: nf(c.min), b: nf(c.max) })))));
    if (L.trees.on) block(t("lg_trees"), "modelled", h("p", { class: "note" }, t("trees_hint")));
    if (L.priority.on) block(t("lg_priority"), "assumed", h("div", { class: "ramp", "aria-hidden": "true" }), h("div", { class: "ramp-labels" }, h("span", {}, t("lg_low")), h("span", {}, t("lg_high"))), h("p", { class: "note" }, t("lg_priority_note")));
    if (L.zones.on) block(t("lg_zones"), "assumed", h("ul", { class: "sws" }, h("li", {}, h("span", { class: "dash", "aria-hidden": "true" }), t("lg_zones"))));
    if (L.rivers.on) block(t("lg_rivers"), "modelled", h("ul", { class: "sws" }, h("li", {}, h("span", { class: "line", "aria-hidden": "true" }), t("lg_rivers"))));
    if (L.bridges.on) block(t("lg_bridges"), "observed", h("ul", { class: "sws" }, h("li", {}, h("span", { class: "dot", "aria-hidden": "true" }), t("lg_bridges"))));
    legend.replaceChildren(...(blocks.length ? blocks : [h("p", { class: "note" }, t("legend_empty"))]));

    const top = [...release.zones].sort((a, b) => b.people05[st.scenario] - a.people05[st.scenario]).slice(0, 8);
    const max = Math.max(...top.map((z) => z.people05[st.scenario]), 1);
    bars.replaceChildren(...top.map((z) => {
      const fill = h("span", { class: "bar-fill" });
      fill.style.width = `${(z.people05[st.scenario] / max) * 100}%`;
      return h("li", {}, h("span", { class: "bar-name", title: z.name }, z.name), h("span", { class: "bar-track", "aria-hidden": "true" }, fill), h("span", { class: "bar-val" }, people(z.people05[st.scenario])));
    }));
  }
  refresh(st0);
  return { refresh };
}
