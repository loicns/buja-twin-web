import { $, h } from "../dom";
import { CODE_URL, FEEDBACK_URL } from "../config";
import type { Release } from "../data";
import { nf, t } from "../i18n";
import { BASEMAP_CREDIT, LAYERS } from "../layers";

/** The always-reachable limits dialog: caveats, what observed/modelled/assumed mean, quality evidence, credits. */
export function renderLimits(release: Release): void {
  const v = release.validation;
  const cop = v.sfincs_vs_copernicus_s4, gfm = v.sfincs_rain100_vs_gfm_2024, sur = v.surrogate;
  const sec = (title: string, ...kids: (Node | string)[]): Node[] => [h("h3", {}, title), ...kids.map((k) => (typeof k === "string" ? h("p", {}, k) : k))];
  const credits = [...new Set([BASEMAP_CREDIT, ...LAYERS.map((l) => l.credit)])];
  $("limits-body").replaceChildren(
    h("div", { class: "warnbox" }, h("strong", {}, t("d_caveat_title") + ". "), t("d_caveat")),
    ...sec(t("d_states_title"), t("d_states")),
    ...sec(t("d_what_title"), t("d_what")),
    ...sec(t("d_evidence_title"), h("ul", {},
      h("li", {}, t("d_ev_cop", { csi: nf(cop.csi, 2), hit: nf(cop.hit_rate, 2), far: nf(cop.far, 2), model: nf(cop.model_km2), ref: nf(cop.copernicus_km2) })),
      h("li", {}, t("d_ev_gfm", { obs: nf(gfm.observed_km2, 2), model: nf(gfm.model_km2, 1) })),
      h("li", {}, t("d_ev_sur", { s0: nf(sur.csi_unseen_storms[0], 2), s1: nf(sur.csi_unseen_storms[1], 2), c0: nf(sur.csi_unseen_catchment[0], 2), c1: nf(sur.csi_unseen_catchment[1], 2) }))),
      t("d_s1_note")),
    ...sec(t("d_datum_title"), t("d_datum")),
    ...sec(t("d_lake_title"), t("d_lake")),
    ...sec(t("d_people_title"), t("d_people")),
    ...sec(t("d_veg_title"), t("d_veg", { n: nf(release.catalog.vegetation.trees) })),
    ...sec(t("d_lic_title"), h("ul", {}, ...["basemap", "terrain", "buildings", "veg", "pop", "flood", "rivers"].map((k) => h("li", {}, t(`d_lic_${k}`)))),
      h("p", { class: "mono-small" }, credits.join(" · "))),
    h("p", { class: "mono-small" }, t("d_version", { v: release.catalog.version }), " · ",
      h("a", { href: CODE_URL, target: "_blank", rel: "noopener" }, t("d_code")),
      FEEDBACK_URL ? " · " : "", FEEDBACK_URL ? h("a", { href: FEEDBACK_URL, target: "_blank", rel: "noopener" }, t("feedback")) : ""));
}
