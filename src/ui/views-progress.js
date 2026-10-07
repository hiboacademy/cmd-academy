/* ============================================================
   ui/views-progress.js — Progress and Settings
   ============================================================ */
function ProgressView() {
  const all = Content.all();
  const done = all.filter((l) => Store.lessonDone(l)).length;
  const tasks = Content.tasks();
  const pdone = tasks.filter((t) => Store.practiceDone(t.id)).length;
  const acc = Store.accuracy();
  const chAll = Content.challenges();
  const chDone = chAll.filter((c) => Store.challengeDone(c.id)).length;
  const mist = Store.mistakes().length;
  const weak = Store.weakCommands(5);
  const cur = Store.currentLesson();

  const levelLine = (lv) => {
    const ls = Content.levelLessons(lv.id);
    const d = ls.filter((l) => Store.lessonDone(l)).length;
    const p = pct(d, ls.length);
    const on = Math.round(p / 10);
    return h("div", { class: "lvl-line" },
      h("div", { class: "row between" },
        h("span", { class: "mono", style: { direction: "ltr" } }, `${T("w_level")} ${lv.id}`),
        h("span", { class: "muted small grow", style: { textAlign: "center" } }, `${lv.title} · ${fa(d)}/${fa(ls.length)}`),
        h("span", { class: "pct" }, p + "%")),
      h("div", { class: "blocks", role: "img", "aria-label": `${T("w_level")} ${lv.id}: ${p}%` }, Array.from({ length: 10 }, (_, i) => h("i", { class: i < on ? "on" : "" }))));
  };

  return h("div", { class: "stack view" },
    h("h1", null, T("progress_title")),
    h("div", { class: "card stack" },
      h("div", { class: "row between" },
        h("div", { class: "eyebrow" }, T("overall")),
        h("div", { class: "pct big-num", style: { fontSize: "1.375rem" } }, pct(done, all.length) + "%")),
      h("div", { class: "bar" }, h("i", { style: { width: pct(done, all.length) + "%" } })),
      Content.levels().map(levelLine),
      cur ? h("div", { class: "small muted" }, T("current_level", { lv: cur.level, n: fa(cur.n), t: cur.t.replace(/`/g, "") })) : null),
    h("div", { class: "stats four" },
      h("div", { class: "card stat" }, h("div", { class: "n" }, `${done}/${all.length}`), h("div", { class: "l" }, T("stat_lessons"))),
      h("div", { class: "card stat" }, h("div", { class: "n" }, acc.pct == null ? "—" : acc.pct + "%"), h("div", { class: "l" }, T("stat_quiz"))),
      h("div", { class: "card stat" }, h("div", { class: "n" }, `${pdone}/${tasks.length}`), h("div", { class: "l" }, T("stat_practice"))),
      h("div", { class: "card stat" }, h("div", { class: "n" }, `${chDone}/${chAll.length}`), h("div", { class: "l" }, T("stat_challenges"))),
      h("div", { class: "card stat" }, h("div", { class: "n" }, String(Store.streak())), h("div", { class: "l" }, T("stat_streak"))),
      h("div", { class: "card stat" }, h("div", { class: "n" }, String(acc.right + acc.wrong)), h("div", { class: "l" }, T("stat_answers")))),
    sectionCard(T("weak_title"), weak.length
      ? h("div", null, weak.map((w) => {
        const n = Content.shellIndex()[w.cmd];
        return h("div", { class: "weak" }, h("span", { class: "cmd-name" }, w.cmd), h("span", { class: "grow small muted" }, T("weak_count", { n: fa(w.count) })),
          n && Content.lesson(n) && Content.lesson(n).full ? h("button", { class: "btn small", onClick: () => App.go("lesson" + n) }, T("review_lesson", { n: fa(n) })) : null);
      }))
      : h("p", { class: "muted small" }, T("weak_none"))),
    mist ? h("button", { class: "btn block", onClick: () => App.go("quiz-R") }, icon("review"), T("review_desc", { n: fa(mist) })) : null,
    h("p", { class: "muted small" }, Store.isPersistent() ? T("saved_local") : T("storage_off")));
}

function SettingsView() {
  const s = Store.settings();
  const segOf = (key, opts, onPick, ltr) => h("div", { class: "seg", role: "group", dir: ltr ? "ltr" : null }, opts.map(([v, label]) =>
    h("button", { "aria-pressed": String(s[key]) === String(v) ? "true" : "false", onClick: () => { Store.setSetting(key, v); onPick && onPick(v); App.render(); } }, label)));
  const sw = "serviceWorker" in navigator;
  const ctrl = sw && navigator.serviceWorker.controller;
  const isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const offline = isApp ? { on: true, t: T("offline_app") } : ctrl ? { on: true, t: T("offline_ready") } : { on: false, t: T("offline_no") };
  const meta = Content.meta();
  return h("div", { class: "stack view" },
    h("h1", null, T("nav_settings")),
    h("section", { class: "card" },
      h("div", { class: "set-row" }, h("div", { class: "lab" }, T("set_theme")), segOf("theme", [["dark", T("theme_dark")], ["light", T("theme_light")], ["system", T("theme_system")]], applySettings)),
      h("div", { class: "set-row" }, h("div", { class: "lab" }, T("set_font")), segOf("font", [[0.9, "A−"], [1, "A"], [1.12, "A+"], [1.25, "A++"]], applySettings, true)),
      h("div", { class: "set-row" }, h("div", { class: "lab" }, T("set_lang")), h("div", { class: "seg", role: "group", "aria-label": T("set_lang") },
        [["en", "English"], ["de", "Deutsch"], ["fa", "فارسی"]].map(([code, name]) =>
          h("button", { "aria-pressed": LANG === code ? "true" : "false", lang: code, dir: code === "fa" ? "rtl" : "ltr", onClick: () => {
            if (LANG === code) return;
            Store.setSetting("lang", code);
            location.reload();   // reload so every text, lesson and the simulator switch language together
          } }, name))))),
    h("section", { class: "card" },
      h("div", { class: "set-row" },
        h("div", { class: "lab" }, T("set_sim")),
        h("p", { class: "small muted" }, T("set_sim_desc")),
        h("button", { class: "btn small", style: { alignSelf: "flex-start" }, onClick: async () => {
          if (!(await confirmDialog({ text: T("sim_reset_confirm"), yes: T("sim_reset"), no: T("cancel") }))) return;
          App.state.simSh = null; App.state.simTerm = null; App.state.batchSh = null;
          toast(T("sim_reset_done"));
        } }, icon("reset"), T("sim_reset"))),
      h("div", { class: "set-row" },
        h("div", { class: "lab" }, T("reset_progress")),
        h("p", { class: "small muted" }, T("reset_desc")),
        h("button", { class: "btn small danger", style: { alignSelf: "flex-start" }, onClick: async () => {
          if (!(await confirmDialog({ text: T("reset_confirm"), yes: T("yes_reset"), no: T("cancel") }))) return;
          Store.reset(); toast(T("reset_done")); App.render();
        } }, T("reset_progress")))),
    h("section", { class: "card" },
      h("div", { class: "set-row" }, h("div", { class: "lab" }, T("set_offline")), h("div", { class: "small" }, h("span", { class: "status-dot " + (offline.on ? "on" : "off") }), offline.t)),
      h("div", { class: "set-row" }, h("div", { class: "lab" }, T("set_storage")), h("div", { class: "small" }, Store.isPersistent() ? T("saved_local") : T("storage_off"))),
      h("div", { class: "set-row" }, h("div", { class: "lab" }, T("set_version")), h("div", { class: "small mono", style: { direction: "ltr", textAlign: "var(--start)" } }, `CMD Academy ${meta.version || "1.0.0"} · build ${meta.build || "dev"}`)),
      h("div", { class: "set-row" }, h("div", { class: "lab" }, T("set_about")), h("p", { class: "small muted" }, T("about_text")))));
}

function applySettings() {
  const s = Store.settings();
  const root = document.documentElement;
  root.setAttribute("data-ui", s.theme || "dark");
  root.style.fontSize = 16 * (Number(s.font) || 1) + "px";
  const dark = s.theme === "dark" || (s.theme === "system" && !(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0b0d0e" : "#f3f5f6");
  // Android app: status/navigation bar icons follow the theme (DARK = light icons).
  const bars = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SystemBars;
  if (bars && bars.setStyle) bars.setStyle({ style: dark ? "DARK" : "LIGHT" }).catch(() => {});
}
