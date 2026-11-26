import { $, h } from "../dom";
import { getLang, t } from "../i18n";
import type { AppState } from "../state";

interface Msg { role: "user" | "model"; text: string }
export interface ChatContext { state: () => AppState; view: () => { z: number; x: number; y: number }; selected: () => Record<string, number | string> | null }

/** Minimal, safe rendering of the model's answer: paragraphs, "- " bullets and **bold**. No HTML is ever inserted. */
function renderAnswer(text: string): HTMLElement {
  const box = h("div", { class: "msg-body" });
  const inline = (s: string): Node[] => s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p) => (p.startsWith("**") && p.endsWith("**") ? h("strong", {}, p.slice(2, -2)) : document.createTextNode(p)));
  let list: HTMLElement | null = null;
  for (const line of text.split("\n")) {
    const m = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (m) { if (!list) { list = h("ul", {}); box.append(list); } list.append(h("li", {}, ...inline(m[1]))); continue; }
    list = null;
    if (line.trim()) box.append(h("p", {}, ...inline(line)));
  }
  return box;
}

export function initChat(ctx: ChatContext): { rebuild(): void } {
  const history: Msg[] = [];
  const panel = $("chat");
  const log = $("chat-log");
  let busy = false;

  const add = (who: "user" | "model" | "sys", content: string | HTMLElement): HTMLElement => {
    const el = h("div", { class: `msg msg-${who}` }, who === "sys" ? null : h("div", { class: "msg-who" }, who === "user" ? t("chat_you") : t("chat_ai")),
      typeof content === "string" ? h("div", { class: "msg-body" }, h("p", {}, content)) : content);
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  async function send(text: string): Promise<void> {
    text = text.trim();
    if (!text || busy) return;
    if (text.length > 600) { add("sys", t("chat_too_long")); return; }
    busy = true;
    ($("chat-send") as HTMLButtonElement).disabled = true;
    history.push({ role: "user", text });
    add("user", text);
    const wait = add("sys", t("chat_thinking"));
    try {
      const st = ctx.state();
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lang: getLang(),
          messages: history.slice(-8).map((m) => ({ role: m.role, content: m.text })),
          view: {
            scenario: st.scenario, layers: Object.entries(st.layers).filter(([, v]) => v.on).map(([k]) => k),
            map: ctx.view(), selected: ctx.selected(),
          },
        }),
      });
      wait.remove();
      if (r.status === 503) { add("sys", t("chat_not_configured")); history.pop(); return; }
      if (r.status === 429) { add("sys", t("chat_busy")); history.pop(); return; }
      if (!r.ok) throw new Error(String(r.status));
      const { answer } = (await r.json()) as { answer: string };
      history.push({ role: "model", text: answer });
      add("model", renderAnswer(answer));
    } catch (err) {
      console.error(err);
      wait.remove();
      add("sys", t("chat_error"));
      history.pop();
    } finally {
      busy = false;
      ($("chat-send") as HTMLButtonElement).disabled = false;
    }
  }

  function rebuild(): void {
    log.replaceChildren();
    $("chat-title").textContent = t("chat_title");
    $("chat-note").textContent = t("chat_note");
    ($("chat-input") as HTMLTextAreaElement).placeholder = t("chat_placeholder");
    $("chat-send").textContent = t("chat_send");
    $("chat-clear").textContent = t("chat_clear");
    $("chat-close").setAttribute("aria-label", t("chat_close"));
    add("sys", t("chat_hello"));
    $("chat-chips").replaceChildren(...["chat_s1", "chat_s2", "chat_s3", "chat_s4"].map((k) => {
      const b = h("button", { type: "button", class: "chip" }, t(k));
      b.addEventListener("click", () => void send(t(k)));
      return b;
    }));
    history.length = 0;
  }

  const form = $("chat-form") as HTMLFormElement;
  const input = $("chat-input") as HTMLTextAreaElement;
  form.addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; input.value = ""; void send(v); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  $("chat-clear").addEventListener("click", rebuild);
  $("chat-close").addEventListener("click", () => { panel.hidden = true; $("ask").setAttribute("aria-expanded", "false"); $("ask").focus(); });
  $("ask").addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    $("ask").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) input.focus();
  });
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") $("chat-close").click(); });
  rebuild();
  return { rebuild };
}
