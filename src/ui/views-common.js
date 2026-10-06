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

/* ---------- command breakdown ----------
   Splits a command line into its parts (Command, Argument/Target, Switch,
   Operator) and explains each one. Descriptions come from the Command Library
   of the current language, so this works for every exercise without extra data.
   A task or lesson may give its own `parts: [{t, role, d}]` instead. */
const OPS = ["2>&1", "2>>", "2>", ">>", ">", "<", "||", "&&", "|", "&"];
function splitCommandLine(line) {
  const toks = [];
  let i = 0;
  const s = String(line).replace(/^\s*@/, "");
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    const op = OPS.find((o) => s.startsWith(o, i));
    if (op) { toks.push({ t: op, op: true }); i += op.length; continue; }
    let j = i, q = false;
    while (j < s.length && (q || (!/\s/.test(s[j]) && !OPS.some((o) => s.startsWith(o, j))))) { if (s[j] === '"') q = !q; j++; }
    toks.push({ t: s.slice(i, j) });
    i = j;
  }
  return toks;
}
function describeSwitch(cmd, sw) {
  const c = cmd && Content.command(cmd);
  const low = sw.toLowerCase();
  const hit = c && (c.switches || []).find((x) => String(x.s).toLowerCase().split(/\s*\/\s+|\s+/).some((p) => p && (low === p || low.startsWith(p + ":") || (p.endsWith(":") && low.startsWith(p)))));
  return hit ? hit.d : T("rd_switch");
}
function commandParts(line) {
  const out = [];
  let cmd = null, expectCmd = true, afterRedirect = false;
  splitCommandLine(line).forEach((tk) => {
    if (tk.op) {
      const lib = Content.command(tk.t);
      out.push({ t: tk.t, role: "operator", d: lib ? lib.summary : T("rd_operator") });
      afterRedirect = /[<>]/.test(tk.t) && tk.t !== "2>&1";
      expectCmd = !afterRedirect;
      return;
    }
    if (afterRedirect) { out.push({ t: tk.t, role: "argument", d: T("rd_argument") }); afterRedirect = false; expectCmd = false; return; }
    if (expectCmd) {
      cmd = tk.t.toLowerCase().replace(/\.(exe|bat|cmd)$/, "");
      const lib = Content.command(cmd);
      out.push({ t: tk.t, role: "command", d: lib ? lib.summary : T("rd_command") });
      expectCmd = false;
      return;
    }
    if (/^[/-][a-z?+]/i.test(tk.t) && !/^-?\d/.test(tk.t)) out.push({ t: tk.t, role: "switch", d: describeSwitch(cmd, tk.t) });
    else out.push({ t: tk.t, role: "argument", d: T("rd_argument") });
  });
  return out;
}
/* renders the parts list plus the "Command + Argument + Switch" structure */
function CommandBreakdown(line, parts) {
  const ps = parts && parts.length ? parts : commandParts(line);
  if (!ps.length) return null;
  return h("div", { class: "breakdown" },
    h("div", { class: "bd-rows" }, ps.map((p) => h("div", { class: "bd-row" },
      h("code", { class: "bd-code" }, p.t),
      h("div", { class: "bd-text" }, h("div", { class: "bd-role role-" + p.role }, T("role_" + p.role)), h("div", { class: "small" }, fmt(p.d)))))),
    h("div", { class: "bd-structure" },
      h("div", { class: "bd-sline" }, ps.map((p) => T("role_" + p.role).split(" /")[0]).join(" + ")),
      h("div", { class: "bd-sline code" }, ps.map((p) => p.t).join(" + "))));
}
