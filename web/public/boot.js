// Runs before first paint (render-blocking on purpose, a few hundred bytes): decides whether the first-visit cover
// shows and whether this is an embed, so neither flashes. Kept out of the module bundle so it needs nothing else.
(function () {
  var q = new URLSearchParams(location.search), root = document.documentElement, seen = false;
  if (q.has("embed")) { root.classList.add("embed"); return; }
  try { seen = !!localStorage.getItem("bft:intro:v1"); } catch (e) { /* storage blocked: show the cover */ }
  var deep = q.has("s") || q.has("layers") || q.has("z");
  var force = q.get("intro");
  if (force !== "0" && (force === "1" || (!deep && !seen))) root.classList.add("with-intro");
})();
