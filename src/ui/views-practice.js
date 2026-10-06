/* ============================================================
   ui/views-practice.js — practice tasks, the shared task runner
   (also used by Challenges) and the Batch editor
   ============================================================ */

/* A script editor bound to a shell and a terminal */
function BatchEditor({ sh, term, file = "script.bat", starter = "", persist = null, showArgs = true, args = "", onRun, fixedName = false }) {
  const nameIn = h("input", { type: "text", value: file, "aria-label": T("batch_name"), spellcheck: "false", autocapitalize: "off", readonly: fixedName ? "" : null });
  const ta = h("textarea", { spellcheck: "false", autocapitalize: "off", autocorrect: "off", "aria-label": T("batch_code"), wrap: "off" });
  ta.value = starter;
  const gutter = h("div", { class: "gutter", "aria-hidden": "true" });
  const syncGutter = () => {
    const n = ta.value.split("\n").length;
    gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n");
    gutter.style.height = ta.offsetHeight ? ta.offsetHeight + "px" : "";
  };
  ta.addEventListener("input", () => { syncGutter(); if (persist) persist(nameIn.value, ta.value); });
  ta.addEventListener("scroll", () => { gutter.scrollTop = ta.scrollTop; });
  gutter.style.overflow = "hidden";
  const argsIn = showArgs ? h("input", { class: "args", type: "text", placeholder: T("batch_args"), value: args, "aria-label": T("batch_args"), spellcheck: "false", autocapitalize: "off", dir: "ltr" }) : null;

  function fileName() {
    let n = nameIn.value.trim() || "script.bat";
    if (!/\.(bat|cmd)$/i.test(n)) n += ".bat";
    n = n.replace(/[<>:"\/\\|?*]/g, "_");
    nameIn.value = n;
    return n;
  }
  function save() {
    const n = fileName();
    const p = VFS.parse("C:\\Users\\Student\\Desktop", "C", sh.cwd);
    const dir = VFS.resolve(sh.fs, p.drive, p.parts).node;
    if (!dir) return null;
    VFS.writeFile(dir, n, ta.value.replace(/\r/g, "") + (ta.value.endsWith("\n") ? "" : "\n"), false);
    if (persist) persist(n, ta.value);
    return n;
  }
  function run() {
    const n = save();
    if (!n) return;
    const a = argsIn ? argsIn.value.trim() : "";
    const here = Shell.cwdPath(term.sh).toLowerCase() === "c:\\users\\student\\desktop";
    const target = here ? n : `"C:\\Users\\Student\\Desktop\\${n}"`;
    if (onRun) onRun(n);
    term.run((target + " " + a).trim());
    term.focus();
  }
  const runBtn = h("button", { class: "btn primary", onClick: run }, icon("play"), T("batch_run"));
  const el = h("div", { class: "stack-sm" },
    h("div", { class: "editor" },
      h("div", { class: "editor-bar" }, h("span", { style: { color: "var(--term-green)" } }, "📄"), nameIn),
      h("div", { class: "editor-wrap" }, gutter, ta)),
    h("div", { class: "editor-actions" }, runBtn, argsIn, h("button", { class: "btn small ghost", onClick: () => { save(); toast(T("batch_saved")); } }, icon("save"), T("batch_save"))));
  setTimeout(syncGutter, 0);
  return { el, run, save, setCode(c) { ta.value = c; syncGutter(); }, getCode: () => ta.value, nameIn, ta };
}

/* Runs a task (practice or challenge): terminal or batch editor + checks.
   Hints are progressive and on demand (hint 1 = idea, hint 2 = structure).
   After the first wrong attempt the learner sees the correct answer, why it is
   correct and a breakdown of every part, then can try again themselves. */
function TaskRunner(spec, { onSolved, solvedBefore }) {
  const sh = Checker.shellFor(spec);
  const st = { attempt: [], output: "", fails: 0, solved: false };
  const fb = h("div", { "aria-live": "polite" });
  const answerLines = [].concat(spec.answer || []);
  const hints = spec.hints || [];

  // ---- progressive hints ----
  const hintsEl = h("div", { class: "hint-box" });
  let hintIdx = 0;
  const hintLabel = h("span", null, T("hint_btn"));
  const hintBtn = hints.length ? h("button", { class: "btn small ghost", onClick: () => showHint() }, icon("tip"), hintLabel) : null;
  function showHint() {
    if (hintIdx >= hints.length) return;
    hintsEl.appendChild(h("div", { class: "hint-item pop" }, h("b", null, T("hint_label", { n: fa(hintIdx + 1) }) + ": "), fmt(hints[hintIdx])));
    hintIdx++;
    if (hintIdx >= hints.length) hintBtn.remove(); else hintLabel.textContent = T("hint_more");
  }

  function showFb(kind, content) {
    fb.innerHTML = "";
    fb.appendChild(h("div", { class: "feedback " + kind + (kind === "no" ? " shake" : " pop") }, content));
  }
  function tryAgain() {
    showFb("mid", h("div", null, T("fb_try_again_note")));
    if (editor) editor.ta.focus(); else term.focus();
  }
  // the correct answer, why it is correct, and what each part does
  function solution() {
    const script = !!spec.batch;
    return h("div", { class: "solution" },
      h("div", { class: "stack-xs" }, h("h3", null, script ? T("fb_script") : T("fb_answer")), h("div", { class: "answer-code" }, answerLines.join("\n"))),
      spec.explain ? h("div", { class: "stack-xs" }, h("h3", null, T("fb_why")), h("div", { class: "small" }, fmt(spec.explain))) : null,
      !script && answerLines.length ? h("div", { class: "stack-sm" }, h("h3", null, T("fb_parts")),
        answerLines.slice(0, 4).map((l) => CommandBreakdown(l, answerLines.length === 1 ? spec.parts : null))) : null,
      h("div", { class: "btn-row" }, h("button", { class: "btn primary", onClick: tryAgain }, icon("reset"), T("fb_try_again"))));
  }
  function check(res) {
    st.attempt.push(...res.recs);
    st.output += "\n" + (res.output || "");
    if (st.solved) return;
    const extra = { output: st.output, lastOutput: res.output || "" };
    if (Checker.evaluate(spec.checks, sh, st.attempt, extra)) {
      st.solved = true;
      showFb("ok", h("div", { class: "stack-sm" },
        h("div", { class: "fh" }, T("correct")),
        spec.success ? h("div", null, fmt(spec.success)) : null,
        spec.explain ? h("div", { class: "small" }, fmt(spec.explain)) : null,
        onSolved ? onSolved() : null));
      return;
    }
    const failed = res.recs.filter((r) => !r.ok && r.name && r.name !== "batch");
    if (!spec.batch) failed.forEach((r) => Store.cmdError(r.name));
    if (res.cancelled) return;
    // a correct step of a multi-step task is not a mistake
    if (spec.multi && !spec.batch && !failed.length && !res.recs.some((r) => r.syntaxError)) {
      showFb("mid", h("div", { class: "fh" }, T("keep_going")));
      return;
    }
    st.fails++;
    showFb("no", h("div", { class: "stack-sm" },
      h("div", { class: "fh" }, T("not_yet")),
      answerLines.length ? h("div", null, T("fb_wrong")) : null,
      answerLines.length ? solution() : null));
  }

  const term = InteractiveTerminal({ sh, preload: spec.preload, onCommand: check, title: spec.mode === "winre" ? "Administrator: X:\\windows\\system32\\cmd.exe" : undefined, cls: spec.batch ? "short" : "" });
  let editor = null;
  if (spec.batch) {
    editor = BatchEditor({ sh, term, file: spec.batch.file || "script.bat", starter: spec.batch.starter || "", showArgs: spec.batch.args !== false && spec.batch.args !== undefined, args: typeof spec.batch.args === "string" ? spec.batch.args : "", fixedName: true });
  }
  const resetBtn = h("button", { class: "btn small ghost", onClick: () => App.render() }, icon("reset"), T("restart"));
  const el = h("div", { class: "stack" },
    h("div", { class: "card stack-sm" },
      h("p", { class: "task" }, fmt(spec.task)),
      spec.admin ? h("div", { class: "small muted" }, "🛡 " + T("admin_task")) : null,
      spec.mode === "winre" ? h("div", { class: "small muted" }, "🧰 " + T("winre_task")) : null,
      solvedBefore ? h("div", { class: "small", style: { color: "var(--green)" } }, "✓ " + T("solved_before")) : null,
      hintsEl,
      hintBtn ? h("div", null, hintBtn) : null),
    editor ? h("div", { class: "split side" }, editor.el, term.el) : term.el,
    fb);
  setTimeout(() => (editor ? editor.ta.focus() : term.focus()), 60);
  return { el, resetBtn, term };
}

/* ---------------- PRACTICE LIST ---------------- */
function PracticeView() {
  const tasks = Content.tasks();
  const next = tasks.find((t) => !Store.practiceDone(t.id));
  const doneAll = tasks.filter((t) => Store.practiceDone(t.id)).length;
  const curCh = next ? Content.lesson(next.lesson).chapter : null;
  const groups = Content.chapters().map((ch) => {
    const ls = Content.chapterLessons(ch.id).filter((l) => l.full);
    if (!ls.length) return null;
    const ts = tasks.filter((t) => ls.some((l) => l.n === t.lesson));
    const d = ts.filter((t) => Store.practiceDone(t.id)).length;
    const det = h("details", { class: "group" },
      h("summary", null, icon("chev", "chev"), h("div", { class: "grow" }, h("div", { class: "ln" }, T("w_chapter") + " " + ch.id), h("h3", null, ch.title)), h("span", { class: "pct small muted" }, `${d}/${ts.length}`)),
      ts.map((t) => h("button", { class: "task-row", onClick: () => App.go("task-" + t.id) },
        h("span", { class: "st" + (Store.practiceDone(t.id) ? " done" : "") }, Store.practiceDone(t.id) ? "✓" : ""),
        h("div", { class: "grow small" }, h("div", { class: "ln" }, T("w_lesson") + " " + t.lesson + (t.batch ? " · .bat" : "")), fmt(t.task)))));
    if (ch.id === curCh) det.open = true;
    return det;
  });
  return h("div", { class: "stack view" },
    h("div", { class: "row between" }, h("h1", null, T("practice_title")), h("span", { class: "pct muted" }, `${doneAll}/${tasks.length}`)),
    next ? h("div", { class: "card stack-sm" },
      h("div", { class: "eyebrow" }, "NEXT · LESSON " + next.lesson),
      h("p", { class: "task" }, fmt(next.task)),
      h("button", { class: "btn primary block", onClick: () => App.go("task-" + next.id) }, T("practice_next")))
      : h("div", { class: "card" }, T("practice_all_done")),
    h("div", { class: "grid2" },
      h("button", { class: "card tap tile", onClick: () => App.go("challenges") }, h("span", { class: "ti-ico" }, icon("trophy")), h("span", { class: "tt" }, T("t_challenges")), h("span", { class: "muted small" }, T("card_ch_desc"))),
      h("button", { class: "card tap tile", onClick: () => App.go("batch") }, h("span", { class: "ti-ico" }, icon("code")), h("span", { class: "tt" }, T("t_batch")), h("span", { class: "muted small" }, T("card_batch_desc")))),
    groups);
}

/* ---------------- PRACTICE TASK ---------------- */
function TaskView(id) {
  const task = Content.task(id);
  if (!task) return NotFound();
  const lessonTasks = Content.tasks().filter((t) => t.lesson === task.lesson);
  const idx = lessonTasks.findIndex((t) => t.id === id);
  const all = Content.tasks();
  const nextTarget = () => all.slice(all.findIndex((t) => t.id === id) + 1).find((t) => !Store.practiceDone(t.id)) || null;
  const runner = TaskRunner(task, {
    solvedBefore: Store.practiceDone(id),
    onSolved: () => {
      Store.markPractice(task.id);
      const nt = nextTarget();
      const sameLesson = nt && nt.lesson === task.lesson;
      return h("div", { class: "btn-row" },
        sameLesson ? h("button", { class: "btn primary", onClick: () => App.go("task-" + nt.id) }, T("next_task")) : null,
        !sameLesson ? h("button", { class: "btn primary", onClick: () => App.go("quiz-L" + task.lesson) }, T("btn_quiz")) : null,
        h("button", { class: "btn", onClick: () => App.go("lesson" + task.lesson) }, T("back_to_lesson")));
    },
  });
  return h("div", { class: "stack view" },
    backBtn(T("lesson_n", { n: fa(task.lesson) }), "lesson" + task.lesson),
    h("div", { class: "row between" },
      h("div", { class: "eyebrow" }, `${T("w_practice")} · ${T("w_lesson")} ${task.lesson} · ${idx + 1}/${lessonTasks.length}`),
      runner.resetBtn),
    runner.el);
}

/* ---------------- BATCH EDITOR PAGE ---------------- */
const BATCH_TEMPLATES = [
  { name: "hello.bat", code: "@echo off\r\nrem My first batch file\r\necho Hello %USERNAME%!\r\necho Today is %date%\r\npause\r\n" },
  { name: "ask.bat", code: "@echo off\r\nset /p name=What is your name? \r\nif \"%name%\"==\"\" (\r\n  echo You did not type a name.\r\n) else (\r\n  echo Nice to meet you, %name%!\r\n)\r\n" },
  { name: "menu.bat", code: "@echo off\r\n:menu\r\necho.\r\necho 1. Show the date\r\necho 2. List my documents\r\necho 3. Quit\r\nchoice /c 123 /m \"Choose\"\r\nif errorlevel 3 goto end\r\nif errorlevel 2 goto docs\r\nif errorlevel 1 goto showdate\r\n:showdate\r\necho Today is %date%\r\ngoto menu\r\n:docs\r\ndir /b \"%USERPROFILE%\\Documents\"\r\ngoto menu\r\n:end\r\necho Bye!\r\n" },
  { name: "backup.bat", code: "@echo off\r\nset src=%USERPROFILE%\\Documents\r\nset dest=D:\\Backup\\Documents\r\nif not exist \"%dest%\" mkdir \"%dest%\"\r\nxcopy \"%src%\" \"%dest%\" /s /y /q\r\nif %errorlevel% equ 0 (\r\n  echo Backup finished.\r\n) else (\r\n  echo Backup FAILED with code %errorlevel%.\r\n)\r\n" },
  { name: "count.bat", code: "@echo off\r\nsetlocal enabledelayedexpansion\r\nset count=0\r\nfor %%f in (\"%USERPROFILE%\\Pictures\\*.jpg\") do (\r\n  set /a count+=1\r\n  echo !count!. %%~nxf\r\n)\r\necho Pictures found: %count%\r\nendlocal\r\n" },
];
function BatchView() {
  if (!App.state.batchSh) App.state.batchSh = Checker.shellFor({ batch: true });
  const sh = App.state.batchSh;
  const scripts = Store.scripts();
  const lastName = App.state.batchFile || Object.keys(scripts)[0] || "hello.bat";
  const code = scripts[lastName] != null ? scripts[lastName] : (BATCH_TEMPLATES.find((t) => t.name === lastName) || BATCH_TEMPLATES[0]).code.replace(/\r/g, "");
  const term = InteractiveTerminal({ sh, title: "Command Prompt", cls: "short" });
  const ed = BatchEditor({ sh, term, file: lastName, starter: code, showArgs: true, persist: (n, c) => { App.state.batchFile = n; Store.saveScript(n, c); } });
  const pick = h("select", { class: "btn small", "aria-label": T("batch_templates"), onChange: (e) => {
    const v = e.target.value;
    if (!v) return;
    const tpl = BATCH_TEMPLATES.find((t) => t.name === v);
    const saved = Store.scripts()[v];
    ed.nameIn.value = v; App.state.batchFile = v;
    ed.setCode(saved != null ? saved : tpl ? tpl.code.replace(/\r/g, "") : "");
    e.target.value = "";
  } },
    h("option", { value: "" }, T("batch_templates")),
    BATCH_TEMPLATES.map((t) => h("option", { value: t.name }, t.name)),
    Object.keys(scripts).filter((n) => !BATCH_TEMPLATES.some((t) => t.name === n)).map((n) => h("option", { value: n }, n)));
  const resetBtn = h("button", { class: "btn small ghost", onClick: async () => {
    if (!(await confirmDialog({ text: T("sim_reset_confirm"), yes: T("sim_reset"), no: T("cancel") }))) return;
    App.state.batchSh = Checker.shellFor({ batch: true });
    App.render();
  } }, icon("reset"), T("sim_reset"));
  return h("div", { class: "stack view" },
    h("div", { class: "row between wrap" },
      h("div", { class: "stack-xs" }, h("h1", { class: "mono", style: { direction: "ltr", textAlign: "var(--start)" } }, T("t_batch")), h("div", { class: "muted small" }, T("batch_intro"))),
      h("div", { class: "row" }, pick, resetBtn)),
    h("div", { class: "split side" }, ed.el, term.el),
    h("div", { class: "callout info" }, icon("info"), h("div", { class: "small" }, fmt(T("batch_help")))));
}
