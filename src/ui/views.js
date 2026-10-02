/* ============================================================
   ui/views.js — screens. Each view returns a DOM node.
   Future: each becomes a React component in src/screens/.
   ============================================================ */
const T = (k, v) => Content.t(k, v);
const pad2 = (n) => String(n).padStart(2, "0");

function backBtn(label, route) {
  return h("button", { class: "back", onClick: () => App.go(route) }, icon("back"), label);
}
function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

/* ---------------- HOME ---------------- */
function HomeView() {
  const lv1 = Content.levelLessons(1);
  const done1 = lv1.filter((l) => Store.lessonDone(l)).length;
  const cur = Store.currentLesson();
  const p = pct(done1, lv1.length);

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

  return h("div", { class: "stack view" },
    h("div", { class: "stack-sm" },
      h("div", { class: "brand-title" }, T("app_name")),
      h("p", { class: "hero-line" }, T("tagline"))),
    mini,
    h("p", { class: "muted small", style: { marginTop: "-8px" } }, T("tap_to_open")),
    h("div", { class: "card stack-sm" },
      h("div", { class: "row between" },
        h("div", { class: "eyebrow", style: { color: "var(--fg)" } }, "Level 1 — Beginner"),
        h("div", { class: "pct" }, p + "%")),
      h("div", { class: "row", style: { alignItems: "baseline" } },
        h("span", { class: "big-num" }, `${done1} / ${lv1.length}`),
        h("span", { class: "muted mono small", style: { direction: "ltr" } }, T("lessons"))),
      h("div", { class: "bar" }, h("i", { style: { width: Math.max(p, 1) + "%" } })),
      cur ? h("button", { class: "btn primary block", style: { marginTop: "8px" }, onClick: () => App.go("lesson" + cur.n) },
        `${T("continue")}: درس ${fa(cur.n)} · ${cur.t}`) : null),
    h("div", { class: "cards3" },
      feature("learn", "learn", T("card_learn_title"), T("card_learn_desc")),
      feature("practice", "practice", T("card_practice_title"), T("card_practice_desc")),
      feature("sim", "sim", T("card_sim_title"), T("card_sim_desc"))),
    h("div", { class: "pair" },
      h("button", { class: "card tap row", onClick: () => App.go("quiz") },
        h("span", { style: { color: "var(--blue)", display: "flex" } }, icon("quiz")),
        h("div", { class: "grow" }, h("div", { class: "mono", style: { fontWeight: 600, direction: "ltr", textAlign: "right" } }, "Quiz"), h("div", { class: "muted small" }, T("card_quiz_desc")))),
      h("button", { class: "card tap row", onClick: () => App.go("progress") },
        h("span", { style: { color: "var(--blue)", display: "flex" } }, icon("progress")),
        h("div", { class: "grow" }, h("div", { class: "mono", style: { fontWeight: 600, direction: "ltr", textAlign: "right" } }, "Progress"), h("div", { class: "muted small" }, T("card_progress_desc"))))),
  );
}

/* ---------------- LEARN ---------------- */
function LearnView() {
  const lvId = App.state.learnLevel || 1;
  const lv = Content.levels().find((x) => x.id === lvId);
  const seg = h("div", { class: "seg", role: "group" },
    Content.levels().map((x) => h("button", {
      "aria-pressed": x.id === lvId ? "true" : "false",
      onClick: () => { App.state.learnLevel = x.id; App.render(); },
    }, "LEVEL " + x.id)));

  const lessons = Content.levelLessons(lvId);
  const done = lessons.filter((l) => Store.lessonDone(l)).length;

  const chapters = lv.chapters.map((ch) => {
    const ls = Content.chapterLessons(ch.id);
    const d = ls.filter((l) => Store.lessonDone(l)).length;
    return h("section", { class: "card chapter" },
      h("div", { class: "chapter-head stack-sm" },
        h("div", { class: "row between" },
          h("div", { class: "eyebrow" }, "Chapter " + ch.id),
          h("div", { class: "pct small muted" }, `${d}/${ls.length}`)),
        h("h2", null, ch.title),
        h("div", { class: "bar" }, h("i", { style: { width: pct(d, ls.length) + "%" } }))),
      ls.map((l) => LessonRow(l)));
  });

  return h("div", { class: "stack view" },
    seg,
    h("div", { class: "level-head stack-sm" },
      h("div", { class: "eyebrow" }, "LEVEL " + lv.id),
      h("div", { class: "row between wrap" },
        h("div", { class: "code" }, lv.code),
        h("div", { class: "muted small" }, `${lv.title} · ${fa(done)} از ${fa(lessons.length)} درس`))),
    chapters);
}

function LessonRow(l) {
  const st = Store.lessonStatus(l);
  const mark = st === "done" ? "✓" : "";
  return h("button", { class: "lesson-row", disabled: st === "soon", onClick: () => App.go("lesson" + l.n) },
    h("span", { class: "st " + st, "aria-label": st }, mark),
    h("div", { class: "grow" },
      h("div", { class: "ln" }, "Lesson " + l.n),
      h("div", { class: "lt" }, fmt(l.t))),
    l.c ? h("span", { class: "chip" + (l.danger ? " danger" : "") }, l.c) : null,
    st === "soon" ? h("span", { class: "tag" }, T("coming_soon")) : null);
}

/* ---------------- LESSON ---------------- */
function LessonView(n) {
  const l = Content.lesson(n);
  if (!l || !l.full) return NotFound();
  Store.markSeen(n);
  const f = l.full;
  const parts = Store.lessonParts(l);
  const next = Content.nextLesson(n);

  const fact = (k, v) => v ? h("div", { class: "fact" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v)) : null;
  const analogy = (label, text) => text ? h("details", { class: "analogy" },
    h("summary", null, h("span", null, label), icon("down")), h("div", null, fmt(text))) : null;

  return h("article", { class: "stack view" },
    backBtn(T("nav_learn"), "learn"),
    h("div", { class: "stack-sm" },
      h("div", { class: "eyebrow" }, `LESSON ${pad2(l.n)} · CHAPTER ${l.chapter}`),
      h("h1", null, fmt(l.t))),
    h("div", null,
      h("div", { class: "term-hero" + (f.term.length > 14 ? " long" : "") }, f.term),
      f.fullForm ? h("div", { class: "full-form" }, f.fullForm) : null),
    h("p", { class: "lead" }, fmt(f.summary)),
    StaticTerminal(f.terminal),
    h("div", { class: "card facts" },
      fact(T("s_meaning"), fmt(f.meaning)),
      fact(T("s_usage"), fmt(f.usage)),
      f.syntax ? fact(T("s_syntax"), h("div", { class: "syntax" }, f.syntax)) : null),
    f.tip ? h("div", { class: "callout tip" }, icon("tip"), h("div", null, h("b", null, T("s_tip") + ": "), fmt(f.tip))) : null,
    f.warning ? h("div", { class: "callout danger" }, icon("warn"), h("div", null, h("b", null, T("s_warning") + ": "), fmt(f.warning))) : null,
    analogy(T("s_daily"), f.daily),
    analogy(T("s_restaurant"), f.restaurant),
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
    next ? h("button", { class: "btn ghost block", disabled: !next.full, onClick: () => App.go("lesson" + next.n) },
      `${T("btn_next_lesson")}: ${next.t}` + (next.full ? "" : ` (${T("coming_soon")})`)) : null,
  );
}

/* ---------------- PRACTICE LIST ---------------- */
function PracticeView() {
  const tasks = Content.tasks();
  const next = tasks.find((t) => !Store.practiceDone(t.id));
  const groups = Content.available().map((l) => {
    const ts = tasks.filter((t) => t.lesson === l.n);
    return h("section", { class: "card chapter" },
      h("div", { class: "chapter-head row between" },
        h("div", null, h("div", { class: "ln" }, "Lesson " + l.n), h("h3", null, fmt(l.t))),
        h("div", { class: "pct small muted" }, `${ts.filter((t) => Store.practiceDone(t.id)).length}/${ts.length}`)),
      ts.map((t) => h("button", { class: "task-row", onClick: () => App.go("task-" + t.id) },
        h("span", { class: "st" + (Store.practiceDone(t.id) ? " done" : "") }, Store.practiceDone(t.id) ? "✓" : ""),
        h("div", { class: "grow small" }, fmt(t.task)))));
  });
  return h("div", { class: "stack view" },
    h("h1", null, T("practice_title")),
    next ? h("div", { class: "card stack-sm" },
      h("div", { class: "eyebrow" }, "NEXT · LESSON " + next.lesson),
      h("p", { class: "task" }, fmt(next.task)),
      h("button", { class: "btn primary block", onClick: () => App.go("task-" + next.id) }, T("practice_next")))
      : h("div", { class: "card" }, T("practice_all_done")),
    groups);
}

/* ---------------- PRACTICE TASK ---------------- */
function TaskView(id) {
  const task = Content.task(id);
  if (!task) return NotFound();
  const lessonTasks = Content.tasks().filter((t) => t.lesson === task.lesson);
  const idx = lessonTasks.findIndex((t) => t.id === id);
  const st = { sh: Shell.create({ start: task.start }), attempt: [], fails: 0, solved: false, revealed: false };

  const fb = h("div", { "aria-live": "polite" });
  const term = InteractiveTerminal({ sh: st.sh, preload: task.preload, onCommand: onCmd });
  const answerLines = [].concat(task.answer);

  function nextTarget() {
    const after = Content.tasks().slice(Content.tasks().findIndex((t) => t.id === id) + 1).find((t) => !Store.practiceDone(t.id));
    return after || null;
  }
  function onCmd(r) {
    st.attempt.push(r.rec);
    if (st.solved) return;
    if (Checker.evaluate(task.checks, st.sh, st.attempt)) {
      st.solved = true;
      Store.markPractice(task.id);
      const nt = nextTarget();
      const sameLesson = nt && nt.lesson === task.lesson;
      showFb("ok", h("div", { class: "stack-sm" },
        h("div", { class: "fh" }, T("correct")),
        h("div", { class: "btn-row" },
          sameLesson ? h("button", { class: "btn primary", onClick: () => App.go("task-" + nt.id) }, T("next_task")) : null,
          h("button", { class: sameLesson ? "btn" : "btn primary", onClick: () => App.go(sameLesson ? "lesson" + task.lesson : "quiz-L" + task.lesson) },
            sameLesson ? T("back_to_lesson") : T("btn_quiz")),
          !sameLesson ? h("button", { class: "btn", onClick: () => App.go("lesson" + task.lesson) }, T("back_to_lesson")) : null)));
      return;
    }
    if (task.multi && r.rec.ok) { showFb("mid", h("div", { class: "fh" }, T("keep_going"))); return; }
    st.fails++;
    const hint = task.hints[Math.min(st.fails - 1, task.hints.length - 1)];
    showFb("no", h("div", { class: "stack-sm" },
      h("div", { class: "fh" }, T("not_yet")),
      h("div", null, h("b", { class: "mono" }, "Hint: "), fmt(hint)),
      st.fails >= 2 ? answerBox() : null));
  }
  function answerBox() {
    if (st.revealed) return h("div", { class: "answer-code" }, answerLines.join("\n"));
    const b = h("button", { class: "btn small", onClick: () => { st.revealed = true; b.replaceWith(h("div", { class: "answer-code" }, answerLines.join("\n"))); } }, T("show_answer"));
    return b;
  }
  function showFb(kind, content) {
    fb.innerHTML = "";
    const box = h("div", { class: "feedback " + kind + (kind === "no" ? " shake" : " pop") }, content);
    fb.appendChild(box);
  }

  const view = h("div", { class: "stack view" },
    backBtn("درس " + fa(task.lesson), "lesson" + task.lesson),
    h("div", { class: "row between" },
      h("div", { class: "eyebrow" }, `PRACTICE · LESSON ${task.lesson} · ${idx + 1}/${lessonTasks.length}`),
      h("button", { class: "btn small ghost", onClick: () => App.render() }, icon("reset"), T("restart"))),
    h("div", { class: "card" }, h("p", { class: "task" }, fmt(task.task))),
    term.el,
    fb);
  setTimeout(() => term.focus(), 60);
  return view;
}

/* ---------------- SIMULATOR ---------------- */
function SimView() {
  if (!App.state.simSh) App.state.simSh = Shell.create();
  const term = App.state.simTerm || InteractiveTerminal({ sh: App.state.simSh, banner: true, title: T("sim_title") });
  App.state.simTerm = term;
  const resetBtn = h("button", { class: "btn small ghost", onClick: () => {
    App.state.simSh = Shell.create();
    term.reset(App.state.simSh);
    term.note(T("sim_reset_done"));
    term.focus();
  } }, icon("reset"), T("sim_reset"));
  setTimeout(() => term.focus(), 60);
  return h("div", { class: "sim-wrap view" },
    h("div", { class: "row between wrap" },
      h("div", { class: "stack-sm", style: { gap: "2px" } },
        h("h1", { class: "mono", style: { fontSize: "18px", direction: "ltr", textAlign: "right" } }, "CMD Simulator"),
        h("div", { class: "muted small" }, T("sim_badge"))),
      resetBtn),
    term.el,
    h("div", { class: "muted small" }, fmt("امتحان کن: `dir` ، `cd Documents` ، `cd ..` ، `D:` ، `help`")));
}

/* ---------------- QUIZ ---------------- */
function QuizHomeView() {
  const row = (q, label) => {
    const b = Store.quizBest(q.id);
    return h("button", { class: "task-row", onClick: () => App.go("quiz-" + q.id) },
      h("span", { class: "st" + (b && b.best / b.total >= 0.5 ? " done" : "") }, b && b.best / b.total >= 0.5 ? "✓" : ""),
      h("div", { class: "grow" }, h("div", { class: "ln" }, label), h("div", { class: "small" }, fmt(q.title))),
      b ? h("span", { class: "pct small muted" }, `${b.best}/${b.total}`) : null);
  };
  return h("div", { class: "stack view" },
    h("h1", { class: "mono", style: { direction: "ltr", textAlign: "right" } }, "Quiz"),
    h("section", { class: "card chapter" },
      h("div", { class: "chapter-head" }, h("h3", null, T("quiz_chapters"))),
      Content.chapterQuizzes().map((q) => row(q, "Chapter " + q.chapter))),
    h("section", { class: "card chapter" },
      h("div", { class: "chapter-head" }, h("h3", null, T("quiz_lessons"))),
      Content.available().map((l) => row(Content.quiz("L" + l.n), "Lesson " + l.n))));
}

function QuizRunView(id) {
  const quiz = Content.quiz(id);
  if (!quiz) return NotFound();
  let run = App.state.quizRun;
  if (!run || run.id !== id) {
    const qs = id[0] === "C" ? shuffle(quiz.questions).slice(0, 8) : quiz.questions.slice();
    run = App.state.quizRun = {
      id, i: 0, score: 0, answered: false,
      qs: qs.map((q) => {
        if (q.kind === "tf") return { ...q, opts: [{ txt: T("tf_true"), ok: q.answer === true }, { txt: T("tf_false"), ok: q.answer === false }] };
        if (q.kind === "type") return { ...q };
        return { ...q, opts: shuffle(q.options.map((txt, i) => ({ txt, ok: i === q.answer }))) };
      }),
    };
  }
  const backRoute = quiz.lesson ? "lesson" + quiz.lesson : "quiz";
  const head = h("div", { class: "stack-sm" },
    backBtn(quiz.lesson ? "درس " + fa(quiz.lesson) : "Quiz", backRoute),
    h("div", { class: "eyebrow" }, (quiz.lesson ? "MINI QUIZ · LESSON " + quiz.lesson : "CHAPTER QUIZ · " + quiz.chapter)),
    h("h1", null, fmt(quiz.title)));

  if (run.i >= run.qs.length) {
    const total = run.qs.length;
    if (!run.saved) { Store.setQuiz(id, run.score, total); run.saved = true; }
    const pass = run.score / total >= 0.5;
    return h("div", { class: "stack view" }, head,
      h("div", { class: "card stack-sm pop", style: { alignItems: "center", textAlign: "center", padding: "28px 16px" } },
        h("div", { class: "eyebrow" }, T("quiz_result")),
        h("div", { class: "score-big", style: { color: pass ? "var(--green)" : "var(--warn)" } }, `${run.score} / ${total}`),
        h("p", { class: "muted" }, pass ? "عالی! این Quiz را با موفقیت گذراندی." : "کمتر از نصف درست بود. درس را یک بار دیگر مرور کن و دوباره امتحان کن.")),
      h("div", { class: "btn-row" },
        h("button", { class: "btn", onClick: () => { App.state.quizRun = null; App.render(); } }, T("quiz_retry")),
        quiz.lesson ? h("button", { class: "btn primary", onClick: () => { App.state.quizRun = null; App.go(nextAfterQuiz(quiz.lesson)); } },
          Content.nextLesson(quiz.lesson) && Content.nextLesson(quiz.lesson).full ? T("btn_next_lesson") : T("back_to_lesson"))
          : h("button", { class: "btn primary", onClick: () => { App.state.quizRun = null; App.go("quiz"); } }, T("back"))));
  }

  const q = run.qs[run.i];
  const fb = h("div", { "aria-live": "polite" });
  const nextBtn = () => h("button", { class: "btn primary block", onClick: () => { run.i++; run.answered = false; App.render(); } },
    run.i + 1 >= run.qs.length ? T("quiz_finish") : T("quiz_next"));
  const verdict = (ok) => {
    fb.innerHTML = "";
    fb.appendChild(h("div", { class: "stack-sm" },
      h("div", { class: "feedback " + (ok ? "ok pop" : "no shake") },
        h("div", { class: "fh mono", style: { direction: "ltr", textAlign: "right" } }, ok ? T("quiz_correct") : T("quiz_wrong")),
        q.explain ? h("div", null, fmt(q.explain)) : null),
      nextBtn()));
  };

  let answerUI;
  if (q.kind === "type") {
    const inp = h("input", { class: "text-in", type: "text", dir: "ltr", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "done", placeholder: "C:\\> ..." });
    const check = h("button", { class: "btn primary", type: "submit" }, T("quiz_check"));
    answerUI = h("form", { class: "stack-sm", onSubmit: (e) => {
      e.preventDefault();
      if (run.answered || !inp.value.trim()) return;
      run.answered = true;
      const ok = Checker.sameCommand(inp.value, q.accept);
      if (ok) run.score++;
      inp.disabled = true; check.disabled = true;
      inp.style.borderColor = ok ? "var(--green)" : "var(--danger)";
      if (!ok) fb.before(h("div", { class: "answer-code" }, q.show || q.accept[0]));
      verdict(ok);
    } }, inp, check);
    setTimeout(() => inp.focus({ preventScroll: true }), 60);
  } else {
    const buttons = q.opts.map((o) => {
      const b = h("button", { class: "opt" + (q.code_options ? " code" : ""), onClick: () => {
        if (run.answered) return;
        run.answered = true;
        if (o.ok) run.score++;
        buttons.forEach((x, i) => {
          x.disabled = true;
          if (q.opts[i].ok) { x.classList.add("right"); x.querySelector(".mark").textContent = "✓"; }
        });
        if (!o.ok) { b.classList.add("wrong"); b.querySelector(".mark").textContent = "✕"; }
        verdict(o.ok);
      } }, h("span", { class: "mark" }), h("span", { class: "otxt grow" }, q.code_options ? o.txt : fmt(o.txt)));
      return b;
    });
    answerUI = h("div", { class: "opts" }, buttons);
  }

  return h("div", { class: "stack view" }, head,
    h("div", { class: "bar" }, h("i", { style: { width: pct(run.i, run.qs.length) + "%" } })),
    h("div", { class: "card stack" },
      h("div", { class: "row between" },
        h("span", { class: "q-kind" }, T("kind_" + q.kind)),
        h("span", { class: "muted small" }, T("quiz_q_of", { i: fa(run.i + 1), n: fa(run.qs.length) }))),
      h("p", { class: "q-text" }, fmt(q.q)),
      q.code ? h("div", { class: "q-code" }, q.code) : null,
      answerUI),
    fb);
}
function nextAfterQuiz(n) {
  const nx = Content.nextLesson(n);
  return nx && nx.full ? "lesson" + nx.n : "lesson" + n;
}

/* ---------------- PROGRESS ---------------- */
function ProgressView() {
  const all = Content.all();
  const done = all.filter((l) => Store.lessonDone(l)).length;
  const tasks = Content.tasks();
  const pdone = tasks.filter((t) => Store.practiceDone(t.id)).length;
  const quizzes = Content.available().map((l) => Store.quizBest("L" + l.n)).filter(Boolean);
  const qScore = quizzes.length ? Math.round(quizzes.reduce((s, q) => s + q.best / q.total, 0) / quizzes.length * 100) : 0;

  const levelLine = (lv) => {
    const ls = Content.levelLessons(lv.id);
    const d = ls.filter((l) => Store.lessonDone(l)).length;
    const p = pct(d, ls.length);
    const on = Math.round(p / 10);
    return h("div", { class: "lvl-line" },
      h("div", { class: "row between" },
        h("span", { class: "mono", style: { direction: "ltr" } }, `Level ${lv.id}`),
        h("span", { class: "muted small" }, `${lv.title} · ${fa(d)}/${fa(ls.length)}`),
        h("span", { class: "pct" }, p + "%")),
      h("div", { class: "blocks", "aria-hidden": "true" }, Array.from({ length: 10 }, (_, i) => h("i", { class: i < on ? "on" : "" }))));
  };

  const confirmBox = h("div");
  const resetBtn = h("button", { class: "btn ghost small", onClick: () => {
    confirmBox.innerHTML = "";
    confirmBox.appendChild(h("div", { class: "callout warn" }, icon("warn"), h("div", { class: "stack-sm grow" },
      h("div", null, T("reset_confirm")),
      h("div", { class: "btn-row" },
        h("button", { class: "btn small", style: { borderColor: "var(--danger)", color: "var(--danger)" }, onClick: () => { Store.reset(); App.render(); } }, T("yes_reset")),
        h("button", { class: "btn small", onClick: () => { confirmBox.innerHTML = ""; } }, T("cancel"))))));
  } }, T("reset_progress"));

  return h("div", { class: "stack view" },
    h("h1", null, T("progress_title")),
    h("div", { class: "card stack" },
      h("div", { class: "row between" },
        h("div", { class: "eyebrow" }, T("overall")),
        h("div", { class: "pct big-num", style: { fontSize: "22px" } }, pct(done, all.length) + "%")),
      h("div", { class: "bar" }, h("i", { style: { width: pct(done, all.length) + "%" } })),
      Content.levels().map(levelLine)),
    h("div", { class: "stats" },
      h("div", { class: "card stat" }, h("div", { class: "n" }, `${done}/${all.length}`), h("div", { class: "l" }, T("stat_lessons"))),
      h("div", { class: "card stat" }, h("div", { class: "n" }, qScore + "%"), h("div", { class: "l" }, T("stat_quiz"))),
      h("div", { class: "card stat" }, h("div", { class: "n" }, `${pdone}/${tasks.length}`), h("div", { class: "l" }, T("stat_practice")))),
    h("p", { class: "muted small" }, Store.isPersistent() ? T("saved_local") : T("storage_off")),
    h("div", null, resetBtn),
    confirmBox);
}

function NotFound() {
  return h("div", { class: "stack view" }, h("p", { class: "muted" }, "این صفحه پیدا نشد."), h("button", { class: "btn", onClick: () => App.go("") }, T("nav_home")));
}
