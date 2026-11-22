import fr from "./i18n/fr.json";
import en from "./i18n/en.json";

export type Lang = "fr" | "en";
const dict: Record<Lang, Record<string, string>> = { fr, en };

function initial(): Lang {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "fr" || saved === "en") return saved;
  } catch { /* storage can be blocked */ }
  return "fr"; // French by default
}
let lang: Lang = initial();

export const getLang = (): Lang => lang;
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const s = dict[lang][key] ?? dict.fr[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}
export function applyStatic(): void {
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n!); });
  document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria!)));
  document.title = t("title");
  const btn = document.getElementById("lang");
  if (btn) btn.textContent = lang === "fr" ? "EN" : "FR";
}
export function toggleLang(): void {
  lang = lang === "fr" ? "en" : "fr";
  try { localStorage.setItem("lang", lang); } catch { /* ignore */ }
  applyStatic();
}
export const nf = (n: number, digits = 0): string =>
  new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
/** Published people counts are approximate: round to 10 below 1,000 and to 100 above. */
export const people = (n: number): string => nf(n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10);
