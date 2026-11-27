import { $ } from "../dom";
import type { Release } from "../data";
import { getLang, nf, t } from "../i18n";
import { BASEMAP_CREDIT, LAYERS } from "../layers";
import type { AppState } from "../state";

const hemi = (v: number, pos: string, neg: string): string => `${nf(Math.abs(v), 4)}° ${v >= 0 ? pos : neg}`;

/** The bar under the map: figure caption, live coordinate and elevation readout (mouse only), credits of the visible layers. */
export class Collar {
  private frame = 0;
  private hint = "";
  constructor(private readonly release: Release) {}

  render(st: AppState): void {
    $("collar-caption").replaceChildren(
      Object.assign(document.createElement("span"), { className: "collar-strong", textContent: `${st.scenario.toUpperCase()} ${t(`sc_${st.scenario}`)}` }),
      Object.assign(document.createElement("span"), { className: "collar-sep", textContent: "/" }),
      document.createTextNode(t("collar_caption", { scenario: "" }).replace(/^\s*·\s*/, "")));
    $("collar-sources").title = t("limits_title");
    this.hint = t("collar_hint");
    if (!$("collar-readout").dataset.live) $("collar-readout").textContent = this.hint;
    const credits = new Set<string>([BASEMAP_CREDIT]);
    for (const l of LAYERS) if (st.layers[l.id].on) credits.add(l.credit);
    $("collar-sources").textContent = `${t("collar_sources")}${getLang() === "fr" ? "\u202f:" : ":"} ${[...credits].join(" · ")}`;
    $("collar-version").textContent = t("version_label", { v: this.release.catalog.version });
  }

  /** Called on every pointer move; coalesced to one DOM write per frame. */
  cursor(at: { lng: number; lat: number } | null, elev: (lng: number, lat: number) => Promise<number | null>): void {
    cancelAnimationFrame(this.frame);
    const out = $("collar-readout");
    if (!at) { delete out.dataset.live; out.textContent = this.hint; return; }
    this.frame = requestAnimationFrame(async () => {
      out.dataset.live = "1";
      const base = `${t("collar_cursor")}  ${hemi(at.lat, t("readout_north"), t("readout_south"))}  ${hemi(at.lng, t("readout_east"), t("readout_west"))}`;
      out.textContent = base;
      const z = await elev(at.lng, at.lat);
      if (out.dataset.live && z !== null) out.textContent = `${base}  ·  ${nf(Math.round(z))} m`;
    });
  }
}
