type Attr = string | number | boolean | undefined;
type Kid = Node | string | null | false | undefined;

/** Tiny DOM builder. Text always goes through text nodes, never innerHTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, Attr> = {},
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== false && kid !== undefined) el.append(kid);
  return el;
}

export const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el as T;
};

export const svgEl = (markup: string): SVGElement => {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGElement;
};
