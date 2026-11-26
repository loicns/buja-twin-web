import { $ } from "../dom";
import type { Release } from "../data";
import { nf, people, t } from "../i18n";
import type { AppState } from "../state";

/** A plain-text description of the map for screen readers; refreshed when the scenario changes. */
export function renderSummary(release: Release, st: AppState): void {
  const sc = release.catalog.scenarios.find((s) => s.id === st.scenario)!;
  const ex = release.summary[st.scenario];
  const top = [...release.zones].sort((a, b) => b.people05[st.scenario] - a.people05[st.scenario]).slice(0, 3).map((z) => z.name).join(", ");
  $("summary").textContent = t("summary", {
    scenario: `${t(`sc_${st.scenario}`)}, ${t(`sc_${st.scenario}_note`)}`,
    detail: t("sc_detail", { rain: nf(sc.rain_mm, 1), h: nf(sc.storm_hours), lake: nf(sc.lake_stage_m_egm2008, 2) }),
    km: nf(sc.stats.wet_km2_gt_0p5m, 1),
    b: nf(Math.round(ex.buildings_ge_0p5m / 100) * 100),
    p: people(ex.people_ge_0p5m),
    top,
  });
}
