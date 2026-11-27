import { $ } from "../dom";
import type { Release } from "../data";
import { nf, people, t } from "../i18n";

const KEY = "bft:intro:v1"; // bump the version only after a major model change, to show the cover again

export interface Intro { fill(release: Release): void; open(): void; isOpen(): boolean }

/**
 * The first-visit cover. Its markup is static in index.html, and public/boot.js decides before first paint whether it
 * shows (first visit with no state in the link, or ?intro=1; never in embeds). This module wires it up and fills the
 * figures once the release has loaded.
 */
export function initIntro(o: { closed(): void; how(): void }): Intro {
  const root = document.documentElement;
  const el = $("intro");
  const close = (): void => {
    if (!root.classList.contains("with-intro")) return;
    root.classList.remove("with-intro");
    try { localStorage.setItem(KEY, new Date().toISOString().slice(0, 10)); } catch { /* storage blocked: the cover shows again next time */ }
    o.closed();
  };
  $("intro-go").addEventListener("click", close);
  $("intro-how").addEventListener("click", o.how);
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  document.querySelector(".skip")?.addEventListener("click", close);
  return {
    fill(release) {
      const s2 = release.summary.s2;
      const sc = release.catalog.scenarios.find((s) => s.id === "s2")!;
      $("fig-people").textContent = `${t("approx")} ${people(s2.people_ge_0p5m)}`;
      $("fig-buildings").textContent = `${t("approx")} ${nf(Math.round(s2.buildings_ge_0p5m / 100) * 100)}`;
      $("fig-land").textContent = `${nf(sc.stats.wet_km2_gt_0p5m, 0)} ${t("km2")}`;
      el.querySelector(".intro-figs")?.setAttribute("aria-busy", "false");
    },
    open() {
      root.classList.add("with-intro");
      $("intro-go").focus();
    },
    isOpen: () => root.classList.contains("with-intro"),
  };
}
