/* ============================================================
   ui/views-common.js — helpers shared by all screens
   ============================================================ */
const T = (k, v) => Content.t(k, v);
const pad2 = (n) => String(n).padStart(2, "0");
function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

function backBtn(label, route) {
  return h("button", { class: "back", onClick: () => (route === -1 ? history.back() : App.go(route)) }, icon("back"), label);
}
function NotFound() {
  return h("div", { class: "stack view" },
    h("h1", null, T("not_found")),
    h("button", { class: "btn", onClick: () => App.go("") }, T("nav_home")));
}
function levelTag(level) {
  return h("span", { class: "tag lvl" + level }, T("lvl_" + level));
}
function sectionCard(title, body, extra) {
  return h("section", { class: "card stack-sm" }, h("div", { class: "section-title" }, h("h2", null, title), extra || null), body);
}
/* open a command in the Simulator ("try it") */
function tryInSim(cmd, at, mode) {
  App.state.simRun = { cmd, at };
  // Examples that need Administrator or Recovery open the simulator in that mode.
  if (mode && (App.state.simMode || "normal") !== mode) {
    App.state.simMode = mode;
    App.state.simSh = null;
    App.state.simTerm = null;
    App.state.simRun.modeNote = mode;
  }
  App.go("sim");
}
