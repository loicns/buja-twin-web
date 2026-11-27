import { h } from "../dom";
import { CODE_URL, FEEDBACK_URL } from "../config";
import { SCENARIO_IDS, type ClassDef, type Release, type ScenarioId, type Zone } from "../data";
import { nf, people, t } from "../i18n";
import { GROUPS, LAYER_BY_ID, type Basis, type LayerId } from "../layers";
import type { AppState } from "../state";
import { searchBox } from "./search";

export interface PanelHandlers {
  scenario(id: ScenarioId): void;
  layer(id: LayerId, on: boolean): void;
  opacity(id: LayerId, v: number): void;
  view3D(on: boolean): void;
  zone(z: Zone): void;
  zoomTo(z: number): void;
  limits(): void;
  intro(): void;
}
export interface Panel {
  refresh(st: AppState): void;
  /** Current map zoom, for the "zoom in to see" hints. */
  zoom(z: number): void;
  /** Marks the neighbourhood shown on the map. */
  current(z: Zone | null): void;
}

/** Filled, half-filled and empty squares: the kind of data never relies on colour alone. */
function tag(basis: Basis): HTMLElement {
  const fill = { observed: "100%", modelled: "50%", assumed: "0" }[basis];
  const sq = h("span", { class: "sq", "aria-hidden": "true" }, h("span", { class: "sq-fill", style: `width:${fill}` }));
  return h("span", { class: "tag", "data-basis": basis, title: t(`st_${basis}`) }, sq, t(`st_${basis}`));
}

const dec = (v: number): number => (Number.isInteger(v) ? 0 : 1);
const range = (c: ClassDef): string =>
  c.max === null ? t("range_over", { a: nf(c.min, dec(c.min)) }) : t("range_to", { a: nf(c.min, dec(c.min)), b: nf(c.max, dec(c.max)) });
const swatch = (colour: string, label: string): HTMLElement => {
  const sw = h("span", { class: "sw", "aria-hidden": "true" });
  sw.style.background = colour;
  return h("li", {}, sw, label);
};

/** Arrow keys move the choice inside a radio group (WAI-ARIA radio pattern); the chosen one is the only tab stop. */
function radioKeys(buttons: HTMLElement[], choose: (i: number) => void): void {
  buttons.forEach((b, i) => b.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const to = (i + step + buttons.length) % buttons.length;
    choose(to);
    buttons[to].focus();
  }));
}

export function buildPanel(root: HTMLElement, release: Release, st0: AppState, hd: PanelHandlers, extra: HTMLElement[]): Panel {
  const depth = release.catalog.depth_classes;
  const veg = release.catalog.vegetation;
  const flyable = release.zones.some((z) => z.bbox);

  // --- scenario: the full list in the panel, a compact strip in the mobile sheet ---------------------------------
  const scenarioButtons = (compact: boolean): HTMLElement[] => {
    const list = SCENARIO_IDS.map((id) => {
      const b = h("button", { type: "button", role: "radio", class: "seg", "data-id": id },
        h("span", { class: "seg-id" }, id.toUpperCase()), h("span", { class: "seg-name" }, t(`sc_${id}`)),
        compact ? null : h("span", { class: "seg-note" }, t(`sc_${id}_note`)));
      b.addEventListener("click", () => hd.scenario(id));
      return b;
    });
    radioKeys(list, (i) => hd.scenario(SCENARIO_IDS[i]));
    return list;
  };
  const radios = scenarioButtons(false);
  const sheetRadios = scenarioButtons(true);
  const detail = h("p", { class: "mono-line" });
  const stats = h("dl", { class: "stats" });

  // --- mobile sheet head ----------------------------------------------------------------------------------------
  const handle = h("button", { type: "button", class: "sheet-handle", "aria-expanded": "false", "aria-controls": "panel-main" });
  const sheetFig = h("p", { class: "sheet-fig" });
  const sheetHead = h("div", { class: "sheet-head" }, handle,
    h("div", { class: "sheet-segs", role: "radiogroup", "aria-label": t("scenarios_aria") }, ...sheetRadios), sheetFig);
  const panelEl = root.closest<HTMLElement>(".panel")!;
  const setSheet = (open: boolean): void => {
    panelEl.dataset.sheet = open ? "open" : "peek";
    handle.setAttribute("aria-expanded", String(open));
    handle.textContent = open ? t("sheet_close") : t("sheet_open");
    if (!open) panelEl.scrollTop = 0;
  };
  handle.addEventListener("click", () => setSheet(panelEl.dataset.sheet !== "open"));
  // a short swipe on the head opens or closes it; the button above is the non-drag way (WCAG 2.5.7)
  let y0: number | null = null;
  sheetHead.addEventListener("pointerdown", (e) => { y0 = e.clientY; });
  sheetHead.addEventListener("pointerup", (e) => {
    if (y0 === null) return;
    const dy = e.clientY - y0;
    y0 = null;
    if (Math.abs(dy) > 30) setSheet(dy < 0);
  });
  if (!panelEl.dataset.sheet) setSheet(false);
  else setSheet(panelEl.dataset.sheet === "open");

  // --- depth legend ------------------------------------------------------------------------------------------------
  const depthList = h("ul", { class: "depth" },
    ...depth.map((c, i) => {
      const sw = h("span", { class: "sw", "aria-hidden": "true" });
      sw.style.background = c.colour;
      return h("li", {}, sw, h("span", { class: "rng" }, range(c)), h("span", { class: "body" }, t(`depth_b${i + 1}`)));
    }),
    (() => {
      const sw = h("span", { class: "sw", "aria-hidden": "true" });
      sw.style.background = "var(--depth-dry)";
      return h("li", {}, sw, h("span", { class: "rng" }, `< ${nf(depth[0].min, 1)} m`),h("span", { class: "body" }, t("depth_dry")));
    })());

  // --- most affected neighbourhoods ----------------------------------------------------------------------------------
  const bars = h("ol", { class: "top" });
  let currentZone: Zone | null = null;

  // --- layers, each with its legend and settings right under its switch --------------------------------------------
  const rows = new Map<LayerId, { box: HTMLInputElement; range: HTMLInputElement; out: HTMLOutputElement; extra: HTMLElement; hint: HTMLButtonElement | null }>();
  const legendFor = (id: LayerId): Node[] => {
    if (id === "canopy") return [h("ul", { class: "sws" }, ...veg.canopy_classes.map((c) => swatch(c.colour, c.max === null ? t("canopy_over", { a: nf(c.min) }) : t("range_canopy", { a: nf(c.min), b: nf(c.max) })))),
      h("p", { class: "note" }, t("lg_canopy_note"))];
    if (id === "trees") return [h("p", { class: "note" }, t("lg_trees"))];
    if (id === "priority") return [h("div", { class: "ramp", "aria-hidden": "true" }), h("div", { class: "ramp-labels" }, h("span", {}, t("lg_low")), h("span", {}, t("lg_high"))), h("p", { class: "note" }, t("lg_priority_note"))];
    if (id === "zones") return [h("p", { class: "note" }, t("lg_zones"))];
    return [];
  };
  const layerGroups = GROUPS.map((g) => h("div", { class: "lgroup" },
    h("h3", { class: "label" }, t(`grp_${g.id}`)),
    h("ul", { class: "layers" }, ...g.layers.map((id) => {
      const def = LAYER_BY_ID[id];
      const name = t(`layer_${id}`);
      const box = h("input", { type: "checkbox", id: `lyr-${id}`, "aria-label": t("layer_on", { name }) });
      box.addEventListener("change", () => hd.layer(id, box.checked));
      const slider = h("input", { type: "range", min: "0", max: "100", step: "5", id: `op-${id}`, "aria-label": t("opacity_aria", { name }) });
      const out = h("output", { for: `op-${id}` });
      slider.addEventListener("input", () => { out.value = `${slider.value} %`; hd.opacity(id, Number(slider.value) / 100); });
      const hint = def.fromZoom ? h("button", { type: "button", class: "zoom-hint" }, `${t("zoom_to_see")} →`) : null;
      hint?.addEventListener("click", () => hd.zoomTo(def.fromZoom! + 0.5));
      const extraEl = h("div", { class: "layer-extra" }, hint, ...legendFor(id), h("div", { class: "opacity" }, h("span", {}, t("opacity")), slider, out));
      rows.set(id, { box, range: slider, out, extra: extraEl, hint });
      return h("li", { class: "layer" },
        h("div", { class: "layer-head" }, h("label", { for: `lyr-${id}`, class: "layer-name" }, box, name), tag(def.basis)),
        h("p", { class: "layer-src" }, t(`layer_${id}_src`) + (def.fromZoom ? ` · ${t("from_zoom", { z: def.fromZoom })}` : "")),
        extraEl);
    })),
    g.id === "vegetation" ? h("p", { class: "lg-why" }, h("strong", {}, t("veg_why_title")), t("veg_why")) : null));

  const view = ["3d", "2d"].map((k) => {
    const b = h("button", { type: "button", role: "radio", class: "seg seg-small", "data-view": k }, t(`view_${k}`));
    b.addEventListener("click", () => hd.view3D(k === "3d"));
    return b;
  });
  radioKeys(view, (i) => hd.view3D(i === 0));
  const viewNote = h("p", { class: "note" });

  const fold = (title: string, ...kids: (Node | null)[]): HTMLElement =>
    h("details", { class: "fold" }, h("summary", {}, title), h("div", { class: "fold-body" }, ...kids));
  const link = (label: string, fn: () => void): HTMLButtonElement => {
    const b = h("button", { type: "button", class: "inline-link" }, label);
    b.addEventListener("click", fn);
    return b;
  };

  const main = h("div", { class: "panel-main", id: "panel-main" },
    h("section", { class: "first" }, searchBox(release.zones, (z) => hd.zone(z))),
    h("section", {}, h("h2", { class: "label", id: "sc-label" }, t("sec_scenario")),
      h("div", { class: "segs scenario-segs", role: "radiogroup", "aria-labelledby": "sc-label" }, ...radios), detail, stats),
    h("section", {}, h("h2", { class: "label" }, t("sec_depth")), depthList, h("p", { class: "note" }, t("depth_note"))),
    h("section", {}, h("h2", { class: "label" }, t("sec_top")), bars, h("p", { class: "note" }, flyable ? t("top_note") : t("top_note").split(". ")[0] + ".")),
    fold(t("sec_layers"), ...layerGroups),
    fold(t("sec_view"), h("div", { class: "segs segs-2", role: "radiogroup", "aria-label": t("sec_view") }, ...view), viewNote, ...extra),
    fold(t("sec_about"),
      h("div", { class: "about-links" }, link(t("intro_reopen"), hd.intro), link(t("limits_title"), hd.limits),
        h("a", { href: CODE_URL, target: "_blank", rel: "noopener" }, t("d_code")),
        FEEDBACK_URL ? h("a", { href: FEEDBACK_URL, target: "_blank", rel: "noopener" }, t("feedback")) : null),
      FEEDBACK_URL ? h("p", { class: "note" }, t("about_feedback_hint")) : null,
      h("p", { class: "note" }, t("version_label", { v: release.catalog.version }))));

  root.replaceChildren(sheetHead, main);

  let zoomNow = 0;
  function zoom(z: number): void {
    zoomNow = z;
    for (const [id, r] of rows) if (r.hint) r.hint.hidden = !(LAYER_BY_ID[id].fromZoom && z < LAYER_BY_ID[id].fromZoom!);
  }

  function current(z: Zone | null): void {
    currentZone = z;
    for (const b of bars.querySelectorAll<HTMLElement>("button")) b.setAttribute("aria-current", String(!!z && b.dataset.zone === zoneKey(z)));
  }
  const zoneKey = (z: Zone): string => String(z.id ?? z.name);

  function refresh(st: AppState): void {
    const sc = release.catalog.scenarios.find((s) => s.id === st.scenario)!;
    const ex = release.summary[st.scenario];
    for (const set of [radios, sheetRadios]) for (const r of set) {
      const on = r.dataset.id === st.scenario;
      r.setAttribute("aria-checked", String(on));
      r.tabIndex = on ? 0 : -1;
    }
    detail.textContent = t("sc_detail", { rain: nf(sc.rain_mm, 0), h: nf(sc.storm_hours), lake: nf(sc.lake_stage_m_egm2008, 2) });
    const pp = `${t("approx")} ${people(ex.people_ge_0p5m)}`;
    const stat = (label: string, value: string, lead = false): Node[] => [h("dt", { class: lead ? "lead" : undefined }, label), h("dd", { class: lead ? "lead" : undefined }, value)];
    stats.replaceChildren(
      ...stat(t("stat_people"), pp, true),
      ...stat(t("stat_buildings"), `${t("approx")} ${nf(Math.round(ex.buildings_ge_0p5m / 100) * 100)}`),
      ...stat(t("stat_wet"), `${nf(sc.stats.wet_km2_gt_0p5m, 0)} ${t("km2")}`));
    sheetFig.replaceChildren(h("strong", {}, pp), " ", t("intro_people"));

    for (const [id, r] of rows) {
      r.box.checked = st.layers[id].on;
      r.range.value = String(Math.round(st.layers[id].opacity * 100));
      r.out.value = `${r.range.value} %`;
      r.extra.hidden = !st.layers[id].on;
    }
    zoom(zoomNow);
    for (const b of view) {
      const on3 = b.dataset.view === "3d";
      b.setAttribute("aria-checked", String(on3 === st.threeD));
      b.tabIndex = on3 === st.threeD ? 0 : -1;
    }
    viewNote.textContent = st.threeD ? t("view_note_3d") : t("view_note_2d");

    const top = [...release.zones].sort((a, b) => b.people05[st.scenario] - a.people05[st.scenario]).slice(0, 5);
    const max = Math.max(...top.map((z) => z.people05[st.scenario]), 1);
    bars.replaceChildren(...top.map((z) => {
      const fill = h("span", { class: "bar-fill" });
      fill.style.width = `${(z.people05[st.scenario] / max) * 100}%`;
      const b = h("button", { type: "button", class: "top-btn", "data-zone": zoneKey(z), disabled: !z.bbox, "aria-label": z.bbox ? `${t("top_go", { name: z.name })}, ${t("approx")} ${people(z.people05[st.scenario])}` : undefined },
        h("span", { class: "bar-name", title: z.name }, z.name), h("span", { class: "bar-track", "aria-hidden": "true" }, fill),
        h("span", { class: "bar-val" }, people(z.people05[st.scenario])));
      b.addEventListener("click", () => hd.zone(z));
      return h("li", {}, b);
    }));
    current(currentZone);
  }
  refresh(st0);
  return { refresh, zoom, current };
}
