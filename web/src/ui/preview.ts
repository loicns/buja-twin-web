import { h } from "../dom";
import { API_URL } from "../config";
import { nf, t } from "../i18n";
import type { MapApi } from "../map";

type Corners = [[number, number], [number, number], [number, number], [number, number]];
interface Result { wet_km2_gt_0p5m: number; max_depth_m: number; corners_4326: Corners; warnings: string[] }

/** Surrogate-model sliders. Returns nothing while no API is configured, so the panel simply has no such section. */
export function previewSection(api: MapApi): HTMLElement[] {
  if (!API_URL) return [];
  const { map } = api;
  let on = false, rain = 120, lake = 772.5, timer = 0, seq = 0;

  const msg = h("p", { class: "note", role: "status" });
  const setMsg = (text: string, warn = false): void => { msg.textContent = text; msg.classList.toggle("warn", warn); };
  const rainLabel = h("label", { for: "pv-rain" });
  const lakeLabel = h("label", { for: "pv-lake" });
  const showLabels = (): void => { rainLabel.textContent = t("live_rain", { v: nf(rain) }); lakeLabel.textContent = t("live_lake", { v: nf(lake, 2) }); };
  showLabels();

  const run = async (): Promise<void> => {
    const my = ++seq;
    const q = `rain_mm=${rain}&lake_m=${lake}`;
    setMsg(t("live_busy"));
    const wake = window.setTimeout(() => { if (my === seq) setMsg(t("live_wake")); }, 2500);
    try {
      const r = await fetch(`${API_URL}/predict?${q}`);
      if (!r.ok) throw new Error(String(r.status));
      const p = (await r.json()) as Result;
      if (my !== seq) return;
      const png = `${API_URL}/predict.png?${q}`;
      const src = map.getSource("preview") as maplibregl.ImageSource | undefined;
      if (src) src.updateImage({ url: png, coordinates: p.corners_4326 });
      else {
        map.addSource("preview", { type: "image", url: png, coordinates: p.corners_4326 });
        map.addLayer({ id: "preview", type: "raster", source: "preview", paint: { "raster-opacity": 0.88, "raster-resampling": "nearest" } },
          map.getLayer("buildings-flat") ? "buildings-flat" : undefined); // layers are created on first use
      }
      setMsg(p.warnings.length ? t("live_warn") : t("live_result", { km: nf(p.wet_km2_gt_0p5m, 1), max: nf(p.max_depth_m, 1) }), p.warnings.length > 0);
    } catch (err) {
      console.error(err);
      if (my === seq) setMsg(t("live_error"), true);
    } finally {
      window.clearTimeout(wake);
    }
  };
  const schedule = (): void => { window.clearTimeout(timer); if (on) timer = window.setTimeout(() => void run(), 350); };

  const box = h("input", { type: "checkbox", id: "pv-on" });
  box.addEventListener("change", () => {
    on = box.checked;
    if (on) schedule();
    else { seq++; if (map.getLayer("preview")) map.removeLayer("preview"); if (map.getSource("preview")) map.removeSource("preview"); setMsg(""); }
  });
  const rainIn = h("input", { type: "range", id: "pv-rain", min: "20", max: "200", step: "5", value: String(rain) });
  const lakeIn = h("input", { type: "range", id: "pv-lake", min: "769.5", max: "773.5", step: "0.05", value: String(lake) });
  rainIn.addEventListener("input", () => { rain = Number(rainIn.value); showLabels(); schedule(); });
  lakeIn.addEventListener("input", () => { lake = Number(lakeIn.value); showLabels(); schedule(); });

  return [h("section", {}, h("h2", { class: "label" }, t("sec_preview")), h("p", { class: "note" }, t("live_intro")),
    h("label", { class: "check" }, box, t("live_show")),
    h("div", { class: "slider" }, rainLabel, rainIn), h("div", { class: "slider" }, lakeLabel, lakeIn), msg)];
}
