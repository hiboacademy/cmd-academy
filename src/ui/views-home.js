/* ============================================================
   ui/views-home.js — Home dashboard
   ============================================================ */
function HomeView() {
  const all = Content.all();
  const done = all.filter((l) => Store.lessonDone(l)).length;
  const cur = Store.currentLesson();
  const curLevel = cur ? Content.level(cur.level) : Content.level(3);
  const lvLessons = Content.levelLessons(curLevel.id);
  const lvDone = lvLessons.filter((l) => Store.lessonDone(l)).length;
  const acc = Store.accuracy();
  const streak = Store.streak();
  const chDone = Content.challenges().filter((c) => Store.challengeDone(c.id)).length;

  const mini = StaticTerminal([
    { o: "Microsoft Windows [Version 10.0.22631.4317]" },
    { o: "" },
    { p: "C:\\Users\\Student>", c: "" },
  ], { cls: "mini-term" });
  mini.addEventListener("click", () => App.go("sim"));
  mini.setAttribute("role", "button");
  mini.setAttribute("tabindex", "0");
  mini.setAttribute("aria-label", T("tap_to_open"));
  mini.addEventListener("keydown", (e) => { if (e.key === "Enter") App.go("sim"); });

  const feature = (route, ic, title, desc) => h("button", { class: "card tap feature", onClick: () => App.go(route) },
    h("div", { class: "ico" }, icon(ic)),
    h("div", { class: "grow" }, h("div", { class: "t" }, title), h("div", { class: "muted small" }, desc)),
    icon("chev", "chev"));
  const tile = (route, ic, title, desc) => h("button", { class: "card tap tile", onClick: () => App.go(route) },
    h("span", { class: "ti-ico" }, icon(ic)), h("span", { class: "tt" }, title), desc ? h("span", { class: "muted small" }, desc) : null);

  // recently learned commands
  const recent = Store.recentLessons().map((n) => Content.lesson(n)).filter(Boolean);
  const recentCmds = [];
  recent.forEach((l) => { const c = l.c || (l.full && l.full.term && /^[a-z]/.test(l.full.term) ? l.full.term.split(" ")[0] : null); if (c && !recentCmds.includes(c)) recentCmds.push(c); });

  // suggested practice: weakest command, else the current chapter
  const weak = Store.weakCommands(1)[0];
  let suggest = null;
  if (weak) {
    const lessonN = Content.shellIndex()[weak.cmd];
    if (lessonN && Content.lesson(lessonN) && Content.lesson(lessonN).full) suggest = { text: T("suggest_weak", { cmd: weak.cmd }), route: "lesson" + lessonN };
  }
  if (!suggest && cur) suggest = { text: T("suggest_chapter", { ch: cur.chapterTitle }), route: "practice" };

  return h("div", { class: "stack view" },
    h("div", { class: "home-top" },
      h("div", { class: "brand-title" }, T("app_name")),
      h("button", { class: "icon-btn", "aria-label": T("nav_search"), title: T("nav_search"), onClick: () => App.go("search") }, icon("search")),
      h("button", { class: "icon-btn", "aria-label": T("nav_settings"), title: T("nav_settings"), onClick: () => App.go("settings") }, icon("settings"))),
    h("p", { class: "hero-line" }, T("tagline")),
    mini,
    h("div", { class: "card stack-sm" },
      h("div", { class: "row between" },
        h("div", { class: "eyebrow", style: { color: "var(--fg)" } }, `Level ${curLevel.id} — ${curLevel.code}`),
        h("div", { class: "pct" }, pct(lvDone, lvLessons.length) + "%")),
      h("div", { class: "row wrap", style: { alignItems: "baseline" } },
        h("span", { class: "big-num" }, `${done} / ${all.length}`),
        h("span", { class: "muted mono small", style: { direction: "ltr" } }, T("lessons")),
        h("span", { class: "muted small" }, `· Level ${curLevel.id}: ${lvDone}/${lvLessons.length}`)),
      h("div", { class: "bar" }, h("i", { style: { width: Math.max(pct(done, all.length), 1) + "%" } })),
      cur ? h("button", { class: "btn primary block", style: { marginTop: "8px" }, onClick: () => App.go("lesson" + cur.n) },
        `${T("continue")}: درس ${fa(cur.n)} · ${cur.t}`.replace(/`/g, "")) : h("p", { class: "muted" }, T("course_done"))),
    h("div", { class: "stats" },
      h("div", { class: "card stat" }, h("div", { class: "n" }, acc.pct == null ? "—" : acc.pct + "%"), h("div", { class: "l" }, T("stat_accuracy"))),
      h("div", { class: "card stat" }, h("div", { class: "n" }, String(streak)), h("div", { class: "l" }, T("stat_streak"))),
      h("div", { class: "card stat" }, h("div", { class: "n" }, `${chDone}/${Content.challenges().length}`), h("div", { class: "l" }, T("stat_challenges")))),
    recentCmds.length || suggest ? h("div", { class: "card stack-sm" },
      recentCmds.length ? h("div", { class: "stack-xs" }, h("div", { class: "muted small" }, T("recent_learned")),
        h("div", { class: "chips" }, recentCmds.slice(0, 6).map((c) => h("button", { class: "chip", onClick: () => App.go(Content.command(c) ? "cmd-" + Content.command(c).name : "learn") }, c)))) : null,
      suggest ? h("div", { class: "row between wrap" }, h("div", { class: "small" }, h("span", { class: "muted" }, T("suggested") + ": "), fmt(suggest.text)),
        h("button", { class: "btn small", onClick: () => App.go(suggest.route) }, T("go"))) : null) : null,
    h("div", { class: "cards3" },
      feature("learn", "learn", T("card_learn_title"), T("card_learn_desc")),
      feature("practice", "practice", T("card_practice_title"), T("card_practice_desc")),
      feature("sim", "sim", T("card_sim_title"), T("card_sim_desc"))),
    h("div", { class: "grid2 more" },
      tile("commands", "library", "Command Library", T("card_lib_desc")),
      tile("challenges", "trophy", "Challenges", T("card_ch_desc")),
      tile("batch", "code", "Batch Editor", T("card_batch_desc")),
      tile("quiz", "quiz", "Quiz", T("card_quiz_desc")),
      tile("favorites", "star", T("nav_favorites"), null),
      tile("progress", "progress", "Progress", null)),
  );
}
