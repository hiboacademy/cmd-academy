/* ============================================================
   ui/views-learn.js — course overview and lesson pages
   ============================================================ */
function LearnView() {
  const lvId = App.state.learnLevel || (Store.currentLesson() ? Store.currentLesson().level : 1);
  App.state.learnLevel = lvId;
  const lv = Content.level(lvId);
  const seg = h("div", { class: "seg mono", role: "group", "aria-label": "Level" },
    Content.levels().map((x) => h("button", {
      "aria-pressed": x.id === lvId ? "true" : "false",
      onClick: () => { App.state.learnLevel = x.id; App.render(); },
    }, "LEVEL " + x.id)));

  const lessons = Content.levelLessons(lvId);
  const done = lessons.filter((l) => Store.lessonDone(l)).length;

  const chapters = lv.chapters.map((ch) => {
    const ls = Content.chapterLessons(ch.id);
    const d = ls.filter((l) => Store.lessonDone(l)).length;
    const cq = Content.quiz("C" + ch.id);
    const best = Store.quizBest("C" + ch.id);
    return h("section", { class: "card chapter" },
      h("div", { class: "chapter-head stack-sm" },
        h("div", { class: "row between" },
          h("div", { class: "eyebrow" }, "Chapter " + ch.id),
          h("div", { class: "pct small muted" }, `${d}/${ls.length}`)),
        h("h2", null, ch.title),
        h("div", { class: "bar" }, h("i", { style: { width: pct(d, ls.length) + "%" } }))),
      ls.map((l) => LessonRow(l)),
      cq ? h("div", { class: "chapter-foot" },
        h("button", { class: "btn small", onClick: () => App.go("quiz-C" + ch.id) }, icon("quiz"), T("chapter_quiz") + (best ? ` · ${best.best}/${best.total}` : ""))) : null);
  });
  const lvBest = Store.quizBest("V" + lvId);

  return h("div", { class: "stack view" },
    seg,
    h("div", { class: "level-head stack-sm" },
      h("div", { class: "eyebrow" }, "LEVEL " + lv.id),
      h("div", { class: "row between wrap" },
        h("div", { class: "code" }, lv.code),
        h("div", { class: "muted small" }, `${lv.title} · ${fa(done)} از ${fa(lessons.length)} درس`))),
    chapters,
    Content.quiz("V" + lvId) ? h("button", { class: "btn block", onClick: () => App.go("quiz-V" + lvId) }, icon("trophy"), T("level_quiz", { n: lvId }) + (lvBest ? ` · ${lvBest.best}/${lvBest.total}` : "")) : null);
}

function LessonRow(l) {
  const st = Store.lessonStatus(l);
  const mark = st === "done" ? "✓" : "";
  const label = { done: T("st_done"), current: T("st_current"), started: T("st_started"), open: T("st_open"), soon: T("coming_soon") }[st];
  return h("button", { class: "lesson-row", disabled: st === "soon", onClick: () => App.go("lesson" + l.n), "aria-label": `Lesson ${l.n}: ${l.t.replace(/`/g, "")} — ${label}` },
    h("span", { class: "st " + st, "aria-hidden": "true" }, mark),
    h("div", { class: "grow" },
      h("div", { class: "ln" }, "Lesson " + l.n),
      h("div", { class: "lt" }, fmt(l.t))),
    l.c ? h("span", { class: "chip" + (l.danger ? " danger" : "") }, l.c) : null,
    st === "soon" ? h("span", { class: "tag" }, T("coming_soon")) : null);
}

function LessonView(n) {
  const l = Content.lesson(n);
  if (!l || !l.full) return NotFound();
  Store.markSeen(n);
  const f = l.full;
  const parts = Store.lessonParts(l);
  const next = Content.nextLesson(n), prev = Content.prevLesson(n);

  const fact = (k, v) => v ? h("div", { class: "fact" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v)) : null;
  const analogy = (label, text) => text ? h("details", { class: "analogy" },
    h("summary", null, h("span", null, label), icon("down")), h("div", null, fmt(text))) : null;

  const examples = (f.examples || []).length ? sectionCard(T("s_examples"), h("div", { class: "examples" },
    f.examples.map((e, i) => h("div", { class: "ex-row" },
      h("div", { class: "ex-main" }, h("div", { class: "ex-cmd" }, e.c), h("div", { class: "small" }, fmt(e.d))),
      h("div", { class: "ex-tools" },
        e.noTry ? null : h("button", { class: "icon-btn plain", "aria-label": T("try_it"), title: T("try_it"), onClick: () => tryInSim(e.c) }, icon("play")),
        starButton("ex", `${n}:${i}`, T("fav_example"))))))) : null;

  const mistakes = (f.mistakes || []).length ? sectionCard(T("s_mistakes"), h("ul", { class: "mistakes" }, f.mistakes.map((m) => h("li", null, h("span", null, fmt(m)))))) : null;

  return h("article", { class: "stack view" },
    h("div", { class: "row between" }, backBtn(T("nav_learn"), "learn"), starButton("lesson", n, T("fav_lesson"))),
    h("div", { class: "stack-sm" },
      h("div", { class: "row wrap" }, h("div", { class: "eyebrow" }, `LESSON ${pad2(l.n)} · CHAPTER ${l.chapter}`), levelTag(f.difficulty || l.level)),
      h("h1", null, fmt(l.t))),
    h("div", null,
      h("div", { class: "term-hero" + (f.term.length > 14 ? " long" : "") }, f.term),
      f.fullForm ? h("div", { class: "full-form" }, f.fullForm) : null),
    f.objective ? h("div", { class: "objective" }, icon("target"), h("div", null, h("b", null, T("s_objective") + ": "), fmt(f.objective))) : null,
    h("p", { class: "lead" }, fmt(f.summary)),
    f.terminal ? StaticTerminal(f.terminal) : null,
    h("div", { class: "card facts" },
      fact(T("s_meaning"), fmt(f.meaning)),
      fact(T("s_usage"), fmt(f.usage)),
      f.syntax ? fact(T("s_syntax"), h("div", { class: "syntax" }, f.syntax)) : null),
    examples,
    f.warning ? h("div", { class: "callout danger", role: "note" }, icon("warn"), h("div", null, h("b", null, T("s_warning") + ": "), fmt(f.warning))) : null,
    f.tip ? h("div", { class: "callout tip" }, icon("tip"), h("div", null, h("b", null, T("s_tip") + ": "), fmt(f.tip))) : null,
    mistakes,
    analogy(T("s_daily"), f.daily),
    analogy(T("s_restaurant"), f.restaurant),
    f.recap ? h("div", { class: "recap" }, h("b", null, T("s_recap") + ": "), fmt(f.recap)) : null,
    h("div", { class: "card stack-sm" },
      h("div", { class: "req" + (parts.practiceDone === parts.practiceTotal ? " ok" : "") },
        h("span", { class: "dot" }, parts.practiceDone === parts.practiceTotal ? "✓" : ""),
        `${T("req_practice")} ${fa(parts.practiceDone)}/${fa(parts.practiceTotal)}`),
      h("div", { class: "req" + (parts.quizOk ? " ok" : "") },
        h("span", { class: "dot" }, parts.quizOk ? "✓" : ""),
        T("req_quiz") + (parts.quiz ? ` · ${fa(parts.quiz.best)}/${fa(parts.quiz.total)}` : "")),
      h("div", { class: "btn-row", style: { marginTop: "6px" } },
        h("button", { class: "btn primary", onClick: () => {
          const t = f.practice.find((p) => !Store.practiceDone(p.id)) || f.practice[0];
          App.go("task-" + t.id);
        } }, T("btn_practice")),
        h("button", { class: "btn", onClick: () => App.go("quiz-L" + l.n) }, T("btn_quiz")))),
    h("nav", { class: "pager", "aria-label": T("lesson_nav") },
      prev ? h("button", { class: "btn ghost", onClick: () => App.go("lesson" + prev.n) }, h("span", null, `→ ${fa(prev.n)}. ${prev.t.replace(/`/g, "")}`)) : h("span"),
      next ? h("button", { class: "btn ghost", disabled: !next.full, onClick: () => App.go("lesson" + next.n) }, h("span", null, `${fa(next.n)}. ${next.t.replace(/`/g, "")} ←`)) : h("span")),
  );
}
