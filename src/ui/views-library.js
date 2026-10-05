/* ============================================================
   ui/views-library.js — Command Library, Search and Favorites
   ============================================================ */
function dangerChip(c) {
  if (c.danger === "danger") return h("span", { class: "chip danger" }, "⚠ " + T("danger_high"));
  if (c.danger === "caution") return h("span", { class: "chip caution" }, T("danger_caution"));
  return null;
}
function cmdRow(c) {
  return h("button", { class: "cmd-row", onClick: () => App.go("cmd-" + c.name) },
    h("span", { class: "cmd-name" }, c.name),
    h("div", { class: "grow small" }, fmt(c.summary)),
    dangerChip(c));
}

function LibraryView() {
  const cat = App.state.libCat || "all";
  const q = App.state.libQ || "";
  const list = h("section", { class: "card tight" });
  const input = h("input", { class: "search-in", type: "search", placeholder: T("lib_search"), value: q, "aria-label": T("lib_search"), dir: "auto" });
  const draw = () => {
    const nq = Content.normFa(input.value);
    App.state.libQ = input.value;
    const items = Content.commandList().filter((c) => (cat === "all" || c.category === cat) &&
      (!nq || Content.normFa([c.name, (c.aliases || []).join(" "), c.summary, c.full, (c.keywords || []).join(" ")].join(" ")).includes(nq)));
    list.innerHTML = "";
    if (!items.length) list.appendChild(h("p", { class: "muted", style: { padding: "16px" } }, T("no_results")));
    items.forEach((c) => list.appendChild(cmdRow(c)));
  };
  input.addEventListener("input", draw);
  const cats = h("div", { class: "cat-row", role: "group", "aria-label": T("lib_categories") },
    [{ id: "all", title: T("all") }].concat(Content.categories()).map((c) =>
      h("button", { "aria-pressed": cat === c.id ? "true" : "false", onClick: () => { App.state.libCat = c.id; App.render(); } }, c.title)));
  draw();
  return h("div", { class: "stack view" },
    h("div", { class: "row between" }, h("h1", { class: "mono", style: { direction: "ltr", textAlign: "right" } }, "Command Library"), h("span", { class: "pct muted" }, String(Content.commandList().length))),
    input, cats, list);
}

function CommandView(name) {
  const c = Content.command(name);
  if (!c) return NotFound();
  const cat = Content.categories().find((x) => x.id === c.category);
  const sw = (c.switches || []).length ? sectionCard(T("s_switches"), h("table", { class: "sw-table" },
    h("tbody", null, c.switches.map((s) => h("tr", null, h("td", null, s.s), h("td", null, fmt(s.d))))))) : null;
  const ex = (c.examples || []).length ? sectionCard(T("s_examples"), h("div", { class: "examples" },
    c.examples.map((e, i) => h("div", { class: "ex-row" },
      h("div", { class: "ex-main" }, h("div", { class: "ex-cmd" }, e.c), h("div", { class: "small" }, fmt(e.d))),
      h("div", { class: "ex-tools" },
        e.noTry ? null : h("button", { class: "icon-btn plain", "aria-label": T("try_it"), title: T("try_it"), onClick: () => tryInSim(e.c, e.at, e.mode) }, icon("play")),
        starButton("ex", `${c.name}#${i}`, T("fav_example"))))))) : null;
  return h("article", { class: "stack view" },
    h("div", { class: "row between" }, backBtn("Command Library", "commands"), starButton("cmd", c.name, T("fav_command"))),
    h("div", { class: "stack-xs" },
      h("div", { class: "row wrap" }, h("span", { class: "eyebrow" }, (cat ? cat.title : c.category)), levelTag(c.level || 1), dangerChip(c)),
      h("div", { class: "term-hero" }, c.name),
      c.full ? h("div", { class: "full-form" }, c.full) : null,
      (c.aliases || []).length ? h("div", { class: "small muted" }, T("aliases") + ": ", c.aliases.map((a) => h("code", { class: "ic" }, a))) : null),
    h("p", { class: "lead" }, fmt(c.summary)),
    c.details ? h("p", null, fmt(c.details)) : null,
    c.syntax ? sectionCard(T("s_syntax"), h("div", { class: "syntax" }, c.syntax)) : null,
    sw, ex,
    c.warning ? h("div", { class: "callout danger", role: "note" }, icon("warn"), h("div", null, h("b", null, T("s_warning") + ": "), fmt(c.warning))) : null,
    (c.related || []).length ? sectionCard(T("s_related"), h("div", { class: "chips" }, c.related.map((r) => {
      const rc = Content.command(r);
      return rc ? h("button", { class: "chip", onClick: () => App.go("cmd-" + rc.name) }, r) : h("span", { class: "chip" }, r);
    }))) : null,
    (c.lessons || []).length ? sectionCard(T("s_lessons"), h("div", { class: "stack-xs" }, c.lessons.map((n) => {
      const l = Content.lesson(n);
      return h("button", { class: "task-row", onClick: () => App.go("lesson" + n), disabled: !l.full }, h("span", { class: "ln" }, "Lesson " + n), h("span", { class: "grow small" }, fmt(l.t)));
    }))) : null,
    c.engine !== false ? h("button", { class: "btn block", onClick: () => tryInSim(c.name + " /?") }, icon("sim"), T("open_help_in_sim", { cmd: c.name })) : null);
}

/* ---------------- SEARCH ---------------- */
function SearchView() {
  const input = h("input", { class: "search-in", type: "search", placeholder: T("search_ph"), value: App.state.searchQ || "", "aria-label": T("nav_search"), dir: "auto", enterkeyhint: "search" });
  const results = h("div", { class: "stack", "aria-live": "polite" });
  const groups = [
    ["cmd", T("res_commands")], ["lesson", T("res_lessons")], ["ex", T("res_examples")], ["challenge", T("res_challenges")], ["quiz", T("res_quiz")],
  ];
  const open = (r) => {
    if (r.kind === "cmd") App.go("cmd-" + r.id);
    else if (r.kind === "lesson") App.go("lesson" + r.id);
    else if (r.kind === "ex") App.go(r.lesson ? "lesson" + r.lesson : "cmd-" + r.cmd);
    else if (r.kind === "challenge") App.go("challenge-" + r.id);
    else if (r.kind === "quiz") App.go("quiz-L" + r.lesson);
  };
  const draw = () => {
    App.state.searchQ = input.value;
    results.innerHTML = "";
    const q = input.value.trim();
    if (!q) { results.appendChild(h("div", { class: "stack-sm" }, h("p", { class: "muted" }, T("search_hint")), h("div", { class: "chips" }, ["copy", "wildcard", "ping", "پوشه", "set /p", "for", "IP", "errorlevel"].map((s) => h("button", { class: "chip", onClick: () => { input.value = s; draw(); } }, s))))); return; }
    const res = Content.search(q);
    if (!res.length) { results.appendChild(h("p", { class: "muted" }, T("no_results"))); return; }
    groups.forEach(([kind, label]) => {
      const items = res.filter((r) => r.kind === kind).slice(0, kind === "quiz" ? 5 : 8);
      if (!items.length) return;
      results.appendChild(h("section", { class: "result-group" }, h("h3", null, label + ` (${res.filter((r) => r.kind === kind).length})`),
        h("div", { class: "card tight" }, items.map((r) => h("button", { class: "task-row", onClick: () => open(r) },
          h("div", { class: "grow" },
            h("div", { class: kind === "cmd" || kind === "ex" ? "mono" : "", style: kind === "cmd" || kind === "ex" ? { direction: "ltr", textAlign: "left", color: "var(--green)" } : {} }, kind === "lesson" || kind === "quiz" || kind === "challenge" ? fmt(r.title) : r.title),
            h("div", { class: "small muted" }, fmt(String(r.sub || "").slice(0, 140)))))))));
    });
  };
  input.addEventListener("input", draw);
  draw();
  setTimeout(() => input.focus(), 60);
  return h("div", { class: "stack view" }, h("h1", null, T("nav_search")), input, results);
}

/* ---------------- FAVORITES ---------------- */
function FavoritesView() {
  const f = Store.favs();
  const cmds = f.cmd.map((n) => Content.command(n)).filter(Boolean);
  const lessons = f.lesson.map((n) => Content.lesson(+n)).filter((l) => l && l.full);
  const exs = f.ex.map((id) => ({ id, e: Content.example(id) })).filter((x) => x.e);
  const empty = !cmds.length && !lessons.length && !exs.length;
  return h("div", { class: "stack view" },
    h("h1", null, T("nav_favorites")),
    empty ? h("div", { class: "card stack-sm" }, h("p", null, T("fav_empty")), h("div", { class: "row" }, h("span", { class: "star", style: { display: "flex" } }, icon("star")), h("span", { class: "muted small" }, T("fav_how")))) : null,
    cmds.length ? h("section", { class: "stack-sm" }, h("h2", null, T("res_commands")), h("div", { class: "card tight" }, cmds.map(cmdRow))) : null,
    lessons.length ? h("section", { class: "stack-sm" }, h("h2", null, T("res_lessons")), h("div", { class: "card tight" }, lessons.map((l) => LessonRow(l)))) : null,
    exs.length ? h("section", { class: "stack-sm" }, h("h2", null, T("res_examples")), h("div", { class: "card" }, h("div", { class: "examples" }, exs.map(({ id, e }) => h("div", { class: "ex-row" },
      h("div", { class: "ex-main" }, h("div", { class: "ex-cmd" }, e.c), h("div", { class: "small" }, fmt(e.d)),
        h("button", { class: "linkish small", style: { alignSelf: "flex-start" }, onClick: () => App.go(e.lesson ? "lesson" + e.lesson : "cmd-" + e.cmd) }, e.lesson ? T("from_lesson", { n: fa(e.lesson) }) : e.cmd)),
      h("div", { class: "ex-tools" }, e.noTry ? null : h("button", { class: "icon-btn plain", "aria-label": T("try_it"), onClick: () => tryInSim(e.c, e.at, e.mode) }, icon("play")), starButton("ex", id, T("fav_example")))))))) : null);
}
