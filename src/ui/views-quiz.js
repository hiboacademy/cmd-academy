/* ============================================================
   ui/views-quiz.js — lesson, chapter, level and review quizzes
   Question kinds: mcq, tf, type, fix, predict, order, sim (a task in a
   live sandbox, checked by its result)
   ============================================================ */
function QuizHomeView() {
  const row = (q, label) => {
    const b = Store.quizBest(q.id);
    const ok = b && b.best / b.total >= 0.5;
    return h("button", { class: "task-row", onClick: () => App.go("quiz-" + q.id) },
      h("span", { class: "st" + (ok ? " done" : "") }, ok ? "✓" : ""),
      h("div", { class: "grow" }, h("div", { class: "ln" }, label), h("div", { class: "small" }, fmt(q.title))),
      b ? h("span", { class: "pct small muted" }, `${b.best}/${b.total}`) : null);
  };
  const mist = Store.mistakes().length;
  const lessonGroups = Content.chapters().map((ch) => {
    const ls = Content.chapterLessons(ch.id).filter((l) => l.full);
    if (!ls.length) return null;
    return h("details", { class: "group" },
      h("summary", null, icon("chev", "chev"), h("div", { class: "grow" }, h("div", { class: "ln" }, "Chapter " + ch.id), h("h3", null, ch.title))),
      ls.map((l) => row(Content.quiz("L" + l.n), "Lesson " + l.n)));
  });
  return h("div", { class: "stack view" },
    h("h1", { class: "mono", style: { direction: "ltr", textAlign: "right" } }, "Quiz"),
    mist ? h("button", { class: "card tap row", onClick: () => App.go("quiz-R") },
      h("span", { style: { color: "var(--warn)", display: "flex" } }, icon("review")),
      h("div", { class: "grow" }, h("div", { style: { fontWeight: 600 } }, T("review_title")), h("div", { class: "muted small" }, T("review_desc", { n: fa(mist) }))),
      icon("chev", "chev")) : null,
    h("section", { class: "card chapter" },
      h("div", { class: "chapter-head" }, h("h3", null, T("quiz_levels"))),
      Content.levels().map((lv) => Content.quiz("V" + lv.id)).filter(Boolean).map((q) => row(q, "Level " + q.level))),
    h("section", { class: "card chapter" },
      h("div", { class: "chapter-head" }, h("h3", null, T("quiz_chapters"))),
      Content.chapterQuizzes().map((q) => row(q, "Chapter " + q.chapter))),
    h("h2", null, T("quiz_lessons")),
    lessonGroups);
}

function prepareQuestion(q) {
  if (q.kind === "tf") return { ...q, opts: [{ txt: T("tf_true"), ok: q.answer === true }, { txt: T("tf_false"), ok: q.answer === false }] };
  if (q.kind === "type" || q.kind === "sim") return { ...q };
  if (q.kind === "order") return { ...q, pool: shuffle(q.items.map((txt, i) => ({ txt, i }))) };
  return { ...q, opts: shuffle(q.options.map((txt, i) => ({ txt, ok: i === q.answer }))) };
}

function QuizRunView(id) {
  const quiz = Content.quiz(id);
  if (!quiz) return NotFound();
  let run = App.state.quizRun;
  if (!run || run.id !== id) {
    let qs = quiz.pick && quiz.questions.length > quiz.pick ? shuffle(quiz.questions).slice(0, quiz.pick) : quiz.kind === "lesson" ? quiz.questions.slice() : shuffle(quiz.questions);
    run = App.state.quizRun = { id, i: 0, score: 0, answered: false, qs: qs.map(prepareQuestion) };
  }
  const backRoute = quiz.lesson ? "lesson" + quiz.lesson : "quiz";
  const eyebrow = { lesson: "MINI QUIZ · LESSON " + quiz.lesson, chapter: "CHAPTER QUIZ · " + quiz.chapter, level: "LEVEL QUIZ · " + quiz.level, review: "REVIEW" }[quiz.kind];
  const head = h("div", { class: "stack-sm" },
    backBtn(quiz.lesson ? "درس " + fa(quiz.lesson) : "Quiz", backRoute),
    h("div", { class: "eyebrow" }, eyebrow),
    h("h1", null, fmt(quiz.title)));

  if (!run.qs.length) {
    return h("div", { class: "stack view" }, head, h("div", { class: "card" }, T(quiz.kind === "review" ? "review_empty" : "quiz_empty")));
  }

  if (run.i >= run.qs.length) {
    const total = run.qs.length;
    if (!run.saved && quiz.kind !== "review") { Store.setQuiz(id, run.score, total); run.saved = true; }
    const pass = run.score / total >= 0.5;
    const nx = quiz.lesson ? Content.nextLesson(quiz.lesson) : null;
    return h("div", { class: "stack view" }, head,
      h("div", { class: "card stack-sm pop", style: { alignItems: "center", textAlign: "center", padding: "28px 16px" } },
        h("div", { class: "eyebrow" }, T("quiz_result")),
        h("div", { class: "score-big", style: { color: pass ? "var(--green)" : "var(--warn)" } }, `${run.score} / ${total}`),
        h("p", { class: "muted" }, pass ? T("quiz_pass") : T("quiz_fail"))),
      h("div", { class: "btn-row" },
        h("button", { class: "btn", onClick: () => { App.state.quizRun = null; App.render(); } }, T("quiz_retry")),
        quiz.lesson
          ? h("button", { class: "btn primary", onClick: () => { App.state.quizRun = null; App.go(nx && nx.full && pass ? "lesson" + nx.n : "lesson" + quiz.lesson); } }, nx && nx.full && pass ? T("btn_next_lesson") : T("back_to_lesson"))
          : h("button", { class: "btn primary", onClick: () => { App.state.quizRun = null; App.go("quiz"); } }, T("back"))));
  }

  const q = run.qs[run.i];
  const fb = h("div", { "aria-live": "polite" });
  const nextBtn = () => h("button", { class: "btn primary block", onClick: () => { run.i++; run.answered = false; App.render(); } },
    run.i + 1 >= run.qs.length ? T("quiz_finish") : T("quiz_next"));
  const verdict = (ok) => {
    Store.answer(q.id, ok, q.lesson);
    if (ok) run.score++;
    fb.innerHTML = "";
    fb.appendChild(h("div", { class: "stack-sm" },
      h("div", { class: "feedback " + (ok ? "ok pop" : "no shake") },
        h("div", { class: "fh mono", style: { direction: "ltr", textAlign: "right" } }, ok ? T("quiz_correct") : T("quiz_wrong")),
        q.explain ? h("div", null, fmt(q.explain)) : null,
        !ok && quiz.kind !== "lesson" && q.lesson ? h("button", { class: "linkish small", onClick: () => App.go("lesson" + q.lesson) }, T("review_lesson", { n: fa(q.lesson) })) : null),
      nextBtn()));
    const nb = fb.querySelector(".btn.primary");
    if (nb) setTimeout(() => nb.focus({ preventScroll: true }), 30);
  };

  let answerUI;
  if (q.kind === "sim") {
    // Simulator task: solved when the sandbox reaches the required state.
    const sh = Checker.shellFor(q);
    const st = { recs: [], output: "" };
    const show = [].concat(q.answer || []).join("\n");
    const giveUp = h("button", { class: "btn small ghost", onClick: () => {
      if (run.answered) return;
      run.answered = true; giveUp.disabled = true;
      if (show) fb.before(h("div", { class: "answer-code" }, show));
      verdict(false);
    } }, T("quiz_give_up"));
    const term = InteractiveTerminal({ sh, cls: "short", onCommand: (res) => {
      if (run.answered) return;
      st.recs.push(...res.recs);
      st.output += "\n" + (res.output || "");
      if (Checker.evaluate(q.checks, sh, st.recs, { output: st.output, lastOutput: res.output || "" })) {
        run.answered = true; giveUp.disabled = true;
        verdict(true);
      }
    } });
    answerUI = h("div", { class: "stack-sm" }, term.el, h("div", { class: "row between" }, h("span", { class: "muted small" }, T("quiz_sim_hint")), giveUp));
    setTimeout(() => term.focus(), 60);
  } else if (q.kind === "type") {
    const inp = h("input", { class: "text-in", type: "text", dir: "ltr", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "done", placeholder: "C:\\> ...", "aria-label": T("type_here") });
    const check = h("button", { class: "btn primary", type: "submit" }, T("quiz_check"));
    answerUI = h("form", { class: "stack-sm", onSubmit: (e) => {
      e.preventDefault();
      if (run.answered || !inp.value.trim()) return;
      run.answered = true;
      const ok = Checker.sameCommand(inp.value, q.accept);
      inp.disabled = true; check.disabled = true;
      inp.style.borderColor = ok ? "var(--green)" : "var(--danger)";
      if (!ok) fb.before(h("div", { class: "answer-code" }, q.show || q.accept[0]));
      verdict(ok);
    } }, inp, check);
    setTimeout(() => inp.focus({ preventScroll: true }), 60);
  } else if (q.kind === "order") {
    const chosen = [];
    const zone = h("div", { class: "order-zone", "data-empty": T("order_empty") });
    const pool = h("div", { class: "opts" });
    const check = h("button", { class: "btn primary", disabled: true }, T("quiz_check"));
    const draw = () => {
      zone.innerHTML = ""; pool.innerHTML = "";
      chosen.forEach((it, k) => zone.appendChild(h("button", { class: "order-item", disabled: run.answered, onClick: () => { chosen.splice(k, 1); draw(); } }, h("span", { class: "num" }, k + 1 + "."), h("span", { class: "grow" }, it.txt))));
      q.pool.filter((it) => !chosen.includes(it)).forEach((it) => pool.appendChild(h("button", { class: "order-item", disabled: run.answered, onClick: () => { chosen.push(it); draw(); } }, h("span", { class: "num" }, "+"), h("span", { class: "grow" }, it.txt))));
      check.disabled = chosen.length !== q.pool.length || run.answered;
    };
    check.addEventListener("click", () => {
      if (run.answered) return;
      run.answered = true;
      const ok = chosen.every((it, k) => it.i === k);
      draw();
      Array.from(zone.children).forEach((el, k) => el.classList.add(chosen[k].i === k ? "right" : "wrong"));
      if (!ok) fb.before(h("div", { class: "answer-code" }, q.items.map((x, k) => `${k + 1}. ${x}`).join("\n")));
      verdict(ok);
    });
    draw();
    answerUI = h("div", { class: "stack-sm" }, h("div", { class: "muted small" }, T("order_hint")), zone, pool, check);
  } else {
    const buttons = q.opts.map((o) => {
      const b = h("button", { class: "opt" + (q.code_options ? " code" : ""), onClick: () => {
        if (run.answered) return;
        run.answered = true;
        buttons.forEach((x, i) => {
          x.disabled = true;
          if (q.opts[i].ok) { x.classList.add("right"); x.querySelector(".mark").textContent = "✓"; }
        });
        if (!o.ok) { b.classList.add("wrong"); b.querySelector(".mark").textContent = "✕"; }
        verdict(o.ok);
      } }, h("span", { class: "mark" }), h("span", { class: "otxt grow" }, q.code_options ? o.txt : fmt(o.txt)));
      return b;
    });
    answerUI = h("div", { class: "opts", role: "group" }, buttons);
  }

  return h("div", { class: "stack view" }, head,
    h("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(run.qs.length), "aria-valuenow": String(run.i) }, h("i", { style: { width: pct(run.i, run.qs.length) + "%" } })),
    h("div", { class: "card stack" },
      h("div", { class: "row between" },
        h("span", { class: "q-kind" }, T("kind_" + q.kind)),
        h("span", { class: "muted small" }, T("quiz_q_of", { i: fa(run.i + 1), n: fa(run.qs.length) }))),
      h("p", { class: "q-text" }, fmt(q.q)),
      q.code ? h("div", { class: "q-code" }, q.code) : null,
      answerUI),
    fb);
}
