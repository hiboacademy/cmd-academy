/* ============================================================
   engine/cmd-batch.js — commands used in batch files
   rem goto call shift setlocal endlocal pause choice timeout exit
   (if / for / blocks are handled by the parser in shell.js)
   ============================================================ */
(() => {
  const { def, lib, COMMANDS } = Shell;
  const { out, err, note, warn, msg, tokenize, showUsage, ask } = lib;

  def("rem", [], { summary: "Records comments (remarks) in batch files.", usage: "Records comments (remarks) in a batch file or CONFIG.SYS.\n\nREM [comment]", keep: true }, (sh, rest, lines) => {
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.rem); return true; }
    return true;
  });

  def("goto", [], {
    summary: "Jumps to a labeled line in a batch program.",
    usage: "Directs cmd.exe to a labeled line in a batch program.\n\nGOTO label\n\n  label   Specifies a text string used in the batch program as a label.\n\nYou type a label on a line by itself, beginning with a colon.\n\nGOTO :EOF transfers control to the end of the current batch script file.",
    keep: true,
  }, (sh, rest, lines, rec, io, ctx) => {
    const label = rest.trim().replace(/^:/, "").split(/[\s+=,;]/)[0].toLowerCase();
    rec.args = [label];
    if (label === "/?") { showUsage(lines, COMMANDS.goto); return true; }
    if (!ctx.frame) { note(lines, msg("goto_interactive")); return true; }
    if (!label) { err(lines, "No batch label specified to GOTO command."); ctx.frame.exit = true; return false; }
    ctx.frame.jump = label;
    return true;
  });

  def("call", [], {
    summary: "Calls one batch program from another, or a :label like a function.",
    usage: "Calls one batch program from another.\n\nCALL [drive:][path]filename [batch-parameters]\nCALL :label arguments\n\nA new batch file context is created with the specified arguments and\ncontrol is passed to the statement after the label specified.  You must\n\"exit\" twice by reaching the end of the batch script file twice.  The\nfirst time the end is reached, control will return to just after the CALL\nstatement.  The second time will exit the batch script.  Type GOTO /?\nfor a description of the GOTO :EOF extension that will allow you to\n\"return\" from a batch script.",
    keep: true,
  }, function* (sh, rest, lines, rec, io, ctx) {
    const s = rest.trim();
    if (s === "/?") { showUsage(lines, COMMANDS.call); return true; }
    if (!s) return true;
    if (s.startsWith(":")) {
      const fr = ctx.frame;
      if (!fr) { err(lines, "Invalid attempt to call batch label outside of batch script."); return 1; }
      const parts = lib.parseBatchArgs(s);
      const label = parts[0].slice(1).toLowerCase();
      const idx = fr.labels[label];
      if (idx == null) { err(lines, `The system cannot find the batch label specified - ${label}`); return 1; }
      const sub = { path: fr.path, args: [":" + label].concat(parts.slice(1)), lines: fr.lines, labels: fr.labels, pc: idx + 1, jump: null, exit: false, locals: 0, parent: fr, isSub: true };
      ctx.frame = sub;
      const prevFor = ctx.forVars;
      ctx.forVars = {};
      try { yield* lib.runFrame(ctx, sub, io); }
      finally {
        while (sub.locals > 0) { lib.endLocal(sh); sub.locals--; }
        ctx.frame = fr; ctx.forVars = prevFor;
      }
      return sh.errorlevel;
    }
    // call another batch file, or just run the command (with a second % expansion)
    const first = (s.match(/^"[^"]*"|^[^\s]+/) || [""])[0];
    const clean = first.replace(/"/g, "");
    let f = lib.fileCommand(sh, clean);
    if (!f && !/\./.test(clean)) f = lib.fileCommand(sh, clean + ".bat") || lib.fileCommand(sh, clean + ".cmd");
    if (f && f.kind === "batch") {
      return yield* lib.runBatch(ctx, f, lib.parseBatchArgs(s.slice(first.length)), io);
    }
    const node = lib.parseStmt(s.replace(/%([^%\s]+)%/g, (m, n) => { const v = lib.getVar(sh, n); return v == null ? (ctx.frame ? "" : m) : v; }));
    return yield* lib.exec(node, ctx, io);
  });

  def("shift", [], { summary: "Shifts the position of replaceable parameters in batch files.", usage: "Changes the position of replaceable parameters in a batch file.\n\nSHIFT [/n]\n\nAfter SHIFT, %2 becomes %1, %3 becomes %2, and so on.", keep: true }, (sh, rest, lines, rec, io, ctx) => {
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.shift); return true; }
    if (!ctx.frame) { note(lines, msg("batch_only", { cmd: "shift" })); return true; }
    const m = rest.trim().match(/^\/(\d)$/);
    const n = m ? +m[1] : 0;
    ctx.frame.args.splice(n, 1);
    return true;
  });

  def("setlocal", [], {
    summary: "Begins localization of environment changes in a batch file.",
    usage: "Begins localization of environment changes in a batch file.  Environment\nchanges made after SETLOCAL has been issued are local to the batch file.\nENDLOCAL must be issued to restore the previous settings.\n\nSETLOCAL [ENABLEDELAYEDEXPANSION | DISABLEDELAYEDEXPANSION]\n\n  ENABLEDELAYEDEXPANSION / DISABLEDELAYEDEXPANSION\n      enable or disable delayed environment variable expansion (!var!).",
    keep: true,
  }, (sh, rest, lines, rec, io, ctx) => {
    const a = rest.trim().toLowerCase();
    if (a === "/?") { showUsage(lines, COMMANDS.setlocal); return true; }
    if (!ctx.frame) { note(lines, msg("batch_only", { cmd: "setlocal" })); return true; }
    sh.localStack.push({ env: Object.assign({}, sh.env), delayed: sh.delayed });
    ctx.frame.locals++;
    if (/enabledelayedexpansion/.test(a)) sh.delayed = true;
    if (/disabledelayedexpansion/.test(a)) sh.delayed = false;
    rec.args = a ? [a] : [];
    return true;
  });
  def("endlocal", [], { summary: "Ends localization of environment changes in a batch file.", usage: "Ends localization of environment changes in a batch file.\n\nENDLOCAL", keep: true }, (sh, rest, lines, rec, io, ctx) => {
    if (!ctx.frame) { note(lines, msg("batch_only", { cmd: "endlocal" })); return true; }
    if (ctx.frame.locals > 0) { lib.endLocal(sh); ctx.frame.locals--; }
    return true;
  });

  def("pause", [], { summary: "Suspends processing of a batch file and displays a message.", usage: "Suspends processing of a batch program and displays the message\n    Press any key to continue . . .\n\nPAUSE", keep: true }, function* (sh, rest, lines, rec, io) {
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.pause); return true; }
    // "pause >nul" waits without showing the message
    const hidden = io.stdout && io.stdout.kind && io.stdout.kind !== "screen";
    yield* ask(hidden ? "" : "Press any key to continue . . . ", "key");
    return true;
  });

  def("choice", [], {
    summary: "Asks the user to pick one key from a list (sets ERRORLEVEL).",
    usage: "CHOICE [/C choices] [/N] [/CS] [/T timeout /D choice] [/M text]\n\nDescription:\n    This tool allows users to select one item from a list\n    of choices and returns the index of the selected choice.\n\n   /C    choices       Specifies the list of choices to be created.\n                       Default list is \"YN\".\n   /N                  Hides the list of choices in the prompt.\n   /CS                 Enables case-sensitive choices to be selected.\n   /T    timeout       The number of seconds to pause before a default\n                       choice is made.\n   /D    choice        Specifies the default choice after nnnn seconds.\n   /M    text          Specifies the message to be displayed before\n                       the prompt.\n\n   ERRORLEVEL is set to the index of the key that was selected from\n   the set of choices. The first choice listed returns a value of 1,\n   the second a value of 2, and so on.\n\nExamples:\n   CHOICE /C YNC /M \"Press Y for Yes, N for No or C for Cancel.\"\n   CHOICE /C ab /M \"Select a for option 1 and b for option 2.\"",
  }, function* (sh, rest, lines, rec) {
    const toks = tokenize(rest);
    let choices = "YN", hide = false, cs = false, t = null, d = null, m = "";
    for (let i = 0; i < toks.length; i++) {
      const v = toks[i].v, lv = v.toLowerCase();
      if (lv === "/?") { showUsage(lines, COMMANDS.choice); return true; }
      if (lv === "/c") choices = (toks[++i] || { v: "YN" }).v;
      else if (/^\/c:?./.test(lv) && lv !== "/cs") choices = v.replace(/^\/c:?/i, "");
      else if (lv === "/n") hide = true;
      else if (lv === "/cs") cs = true;
      else if (lv === "/t") t = parseInt((toks[++i] || { v: "0" }).v, 10);
      else if (lv === "/d") d = (toks[++i] || { v: "" }).v;
      else if (lv === "/m") m = (toks[++i] || { v: "" }).v;
      else { err(lines, `ERROR: Invalid argument/option - '${v}'.`); out(lines, 'Type "CHOICE /?" for usage.'); return 255; }
    }
    rec.args = [choices];
    if (t != null && !d) { err(lines, "ERROR: Invalid syntax. /D is mandatory when /T is specified."); return 255; }
    const list = choices.split("");
    const promptText = (m ? m + " " : "") + (hide ? "" : `[${list.map((c) => (cs ? c : c.toUpperCase())).join(",")}]?`);
    for (let guard = 0; guard < 50; guard++) {
      let a = yield* ask(promptText, "key", t != null ? { timeout: t * 1000, def: d } : {});
      if (!a && d) a = d;
      const ch = a.slice(0, 1);
      const idx = list.findIndex((c) => (cs ? c === ch : c.toLowerCase() === ch.toLowerCase()));
      if (idx >= 0) { rec.choice = list[idx]; return idx + 1; }
    }
    return 255;
  });

  def("timeout", [], {
    summary: "Waits for a number of seconds (or until a key is pressed).",
    usage: "TIMEOUT [/T] timeout [/NOBREAK]\n\nDescription:\n    This utility accepts a timeout parameter to wait for the specified\n    time period (in seconds) or until any key is pressed. It also\n    accepts a parameter to ignore the key press.\n\n    /T        timeout       Specifies the number of seconds to wait.\n                            Valid range is -1 to 99999 seconds.\n\n    /NOBREAK                Ignore key presses and wait specified time.",
  }, function* (sh, rest, lines, rec) {
    const toks = tokenize(rest).map((t) => t.v.toLowerCase());
    if (toks.includes("/?")) { showUsage(lines, COMMANDS.timeout); return true; }
    const nb = toks.includes("/nobreak");
    const nTok = toks.filter((t) => t !== "/t" && t !== "/nobreak")[0];
    const n = parseInt(nTok, 10);
    if (isNaN(n) || n < -1 || n > 99999) { err(lines, "ERROR: Invalid value for timeout (/T) specified. Valid range is -1 to 99999."); return 1; }
    rec.args = [String(n)];
    out(lines, "");
    if (n === -1) { yield* ask("Press any key to continue ...", "key"); return true; }
    const secs = Math.min(n, 10);
    const a = yield { kind: "sleep", ms: secs * 1000, interruptible: !nb, prompt: `Waiting for ${String(n).padStart(2)} seconds, press ${nb ? "CTRL+C to quit" : "a key to continue"} ...`, countdown: n };
    out(lines, `Waiting for ${a && a !== "" && !nb ? String(Math.max(0, n - 1)).padStart(2) : " 0"} seconds, press ${nb ? "CTRL+C to quit" : "a key to continue"} ...`);
    if (n > 10) note(lines, msg("timeout_cap"));
    return true;
  });

  def("exit", [], {
    summary: "Quits the CMD.EXE program or the current batch script.",
    usage: "Quits the CMD.EXE program (command interpreter) or the current batch\nscript.\n\nEXIT [/B] [exitCode]\n\n  /B          specifies to exit the current batch script instead of\n              CMD.EXE.  If executed from outside a batch script, it\n              will quit CMD.EXE\n\n  exitCode    specifies a numeric number.  if /B is specified, sets\n              ERRORLEVEL that number.",
    keep: true,
  }, (sh, rest, lines, rec, io, ctx) => {
    const m = rest.trim().match(/^(\/b)?\s*(-?\d+)?/i);
    const code = m && m[2] != null ? parseInt(m[2], 10) : null;
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.exit); return true; }
    if (ctx.frame) {
      if (code != null) sh.errorlevel = code;
      if (m && m[1]) { ctx.frame.exit = true; return true; }
      // plain EXIT ends every running batch file (and would close the window)
      for (let f = ctx.frame; f; f = f.parent) f.exit = true;
      ctx.aborted = true;
      note(lines, msg("exit_batch"));
      return true;
    }
    if (code != null) sh.errorlevel = code;
    note(lines, msg("exit"));
    return true;
  });
})();
