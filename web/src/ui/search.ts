import { h, svgEl } from "../dom";
import type { Zone } from "../data";
import { t } from "../i18n";

/** Lower case, no accents: "Rohéro" and "rohero" match. */
const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Neighbourhood finder: an editable combobox with a list popup (WAI-ARIA APG pattern). It searches the release's own
 * neighbourhood list, offline: no geocoder, nothing sent anywhere.
 */
export function searchBox(zones: Zone[], pick: (z: Zone) => void): HTMLElement {
  const usable = zones.filter((z) => z.bbox).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const input = h("input", {
    type: "search", id: "zone-search", role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false",
    "aria-controls": "zone-list", autocomplete: "off", spellcheck: "false", placeholder: t("search_placeholder"),
  });
  const list = h("ul", { id: "zone-list", class: "search-list", role: "listbox", "aria-label": t("search_label"), hidden: true });
  const status = h("span", { class: "sr", role: "status" });
  let matches: Zone[] = [];
  let active = -1;

  const close = (): void => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
  const highlight = (i: number): void => {
    active = i;
    list.querySelectorAll("li[role=option]").forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
    if (i >= 0) { input.setAttribute("aria-activedescendant", `zone-opt-${i}`); list.children[i]?.scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  };
  const choose = (z: Zone): void => { input.value = z.name; close(); pick(z); };
  const render = (): void => {
    const q = fold(input.value.trim());
    if (!q) { close(); status.textContent = ""; return; }
    matches = usable.filter((z) => fold(z.name).includes(q))
      .sort((a, b) => Number(!fold(a.name).startsWith(q)) - Number(!fold(b.name).startsWith(q)))
      .slice(0, 8);
    list.replaceChildren(...(matches.length ? matches.map((z, i) => {
      const li = h("li", { id: `zone-opt-${i}`, role: "option", "aria-selected": "false" }, h("span", {}, z.name));
      li.addEventListener("pointerdown", (e) => { e.preventDefault(); choose(z); }); // before blur closes the list
      return li;
    }) : [h("li", { class: "empty", "aria-disabled": "true" }, t("search_none"))]));
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    status.textContent = t("search_count", { n: matches.length });
    highlight(matches.length ? 0 : -1);
  };

  input.addEventListener("input", render);
  input.addEventListener("focus", () => { if (input.value.trim()) render(); });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) { render(); return; }
      if (!matches.length) return;
      highlight((active + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      if (!list.hidden && active >= 0) { e.preventDefault(); choose(matches[active]); }
    } else if (e.key === "Escape") {
      if (!list.hidden) { e.preventDefault(); e.stopPropagation(); close(); } else input.value = "";
    }
  });

  if (!usable.length) return h("div"); // releases before v20261127 have no neighbourhood boxes to fly to
  return h("div", { class: "search" },
    h("label", { for: "zone-search", class: "label" }, t("search_label")),
    h("div", { style: "position:relative" },
      svgEl('<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.4"/></svg>'),
      input, list),
    status);
}
