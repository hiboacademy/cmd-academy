/* ============================================================
   ui/views-sim.js — the free CMD Simulator
   Modes: normal user, Administrator, Recovery Environment
   ============================================================ */
function SimView() {
  const mode = App.state.simMode || "normal";
  if (!App.state.simSh) App.state.simSh = Shell.create({ admin: mode === "admin", mode: mode === "winre" ? "winre" : "normal" });
  const title = mode === "winre" ? "X:\\windows\\system32\\cmd.exe" : "Command Prompt";
  const term = App.state.simTerm || InteractiveTerminal({ sh: App.state.simSh, banner: true, title });
  App.state.simTerm = term;
  const switchMode = async (m) => {
    if (m === mode) return;
    App.state.simMode = m;
    App.state.simSh = Shell.create({ admin: m === "admin", mode: m === "winre" ? "winre" : "normal" });
    App.state.simTerm = InteractiveTerminal({ sh: App.state.simSh, banner: true, title: m === "winre" ? "X:\\windows\\system32\\cmd.exe" : "Command Prompt" });
    App.render();
    App.state.simTerm.note(T("sim_mode_" + m));
  };
  const seg = h("div", { class: "seg", role: "group", "aria-label": T("sim_mode") },
    [["normal", T("sim_normal")], ["admin", "Administrator"], ["winre", "Recovery"]].map(([k, label]) =>
      h("button", { "aria-pressed": mode === k ? "true" : "false", onClick: () => switchMode(k) }, label)));
  const resetBtn = h("button", { class: "btn small ghost", onClick: async () => {
    if (!(await confirmDialog({ text: T("sim_reset_confirm"), yes: T("sim_reset"), no: T("cancel") }))) return;
    App.state.simSh = Shell.create({ admin: mode === "admin", mode: mode === "winre" ? "winre" : "normal" });
    term.reset(App.state.simSh);
    term.note(T("sim_reset_done"));
    term.focus();
  } }, icon("reset"), T("sim_reset"));
  const pending = App.state.simRun;
  App.state.simRun = null;
  setTimeout(() => {
    term.focus();
    if (!pending) return;
    if (pending.modeNote) term.note(T("sim_mode_" + pending.modeNote));
    if (pending.at && !term.busy() && Shell.cwdPath(App.state.simSh).toLowerCase() !== pending.at.toLowerCase()) {
      Shell.setLocation(App.state.simSh, pending.at);
      if (Shell.cwdPath(App.state.simSh).toLowerCase() === pending.at.toLowerCase()) term.note(T("sim_moved", { path: pending.at }));
    }
    term.run(pending.cmd);
  }, 60);
  return h("div", { class: "sim-wrap view" },
    h("div", { class: "row between wrap" },
      h("div", { class: "stack-xs" },
        h("h1", { class: "mono", style: { fontSize: "1.125rem", direction: "ltr", textAlign: "var(--start)" } }, T("t_sim")),
        h("div", { class: "muted small" }, T("sim_badge"))),
      resetBtn),
    seg,
    term.el,
    h("div", { class: "muted small" }, fmt(T("sim_try"))));
}
