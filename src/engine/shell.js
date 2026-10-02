/* ============================================================
   engine/shell.js — Educational CMD interpreter (sandbox only)
   Parses a command line and runs it against the VFS.
   No real system command is ever executed.
   ============================================================ */
const Shell = (() => {
  let MSG = {};               // Persian teaching messages (from content)
  let LESSON_OF = {};         // command -> lesson number (from curriculum)
  const DANGEROUS = ["del", "erase", "rmdir", "rd", "format", "diskpart", "bootrec", "taskkill", "robocopy", "chkdsk"];

  function setMessages(m) { MSG = m || {}; }
  function setLessonIndex(idx) { LESSON_OF = idx || {}; }
  function msg(key, vars = {}) {
    let s = MSG[key] || key;
    Object.keys(vars).forEach((k) => { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  function create(opts = {}) {
    const sh = {
      fs: opts.fs ? VFS.clone(opts.fs) : VFS.createDefault(),
      drive: "C",
      cwd: { C: ["Users", "Student"], D: [], E: [] },
      env: { USERNAME: "Student", COMPUTERNAME: "ACADEMY-PC", USERPROFILE: "C:\\Users\\Student", OS: "Windows_NT" },
      log: [],
    };
    if (opts.start) setLocation(sh, opts.start);
    return sh;
  }

  /* start: "C:\\Users\\Student\\Documents" */
  function setLocation(sh, path) {
    const p = VFS.parse(path, sh.drive, sh.cwd);
    const r = VFS.resolve(sh.fs, p.drive, p.parts);
    if (r.node && r.node.type === "dir") { sh.drive = p.drive; sh.cwd[p.drive] = r.canonical; }
  }

  function cwdPath(sh) { return VFS.fmt(sh.drive, sh.cwd[sh.drive]); }
  function prompt(sh) { return cwdPath(sh) + ">"; }

  /* ---------- tokenizing ---------- */
  function tokenize(str) {
    const out = [];
    let cur = "", inQ = false, quoted = false;
    const push = () => { if (cur.length || quoted) out.push({ v: cur, q: quoted }); cur = ""; quoted = false; };
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === '"') { inQ = !inQ; quoted = true; continue; }
      if (!inQ && (c === " " || c === "\t")) { push(); continue; }
      if (!inQ && c === "/" && cur.length) { push(); }
      cur += c;
    }
    push();
    return out;
  }
  function hasOperator(str) {
    let inQ = false;
    for (const c of str) {
      if (c === '"') inQ = !inQ;
      else if (!inQ && "<>|&".includes(c)) return true;
    }
    return false;
  }
  function expandEnv(sh, str) {
    return str.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (m, name) => {
      const k = Object.keys(sh.env).find((x) => x.toLowerCase() === name.toLowerCase());
      return k ? sh.env[k] : m;
    });
  }

  function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }

  /* ---------- output helpers ---------- */
  const out = (lines, text) => lines.push({ t: "out", text });
  const err = (lines, text) => lines.push({ t: "err", text });
  const note = (lines, text) => lines.push({ t: "note", text });
  const warn = (lines, text) => lines.push({ t: "warn", text });

  function fmtTime(iso) {
    const d = new Date(iso);
    const p2 = (n) => String(n).padStart(2, "0");
    let h = d.getHours(); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${d.getFullYear()}  ${p2(h)}:${p2(d.getMinutes())} ${ap}`;
  }
  const num = (n) => n.toLocaleString("en-US");
  function nowIso() { const d = new Date(); d.setSeconds(0, 0); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

  /* ---------- commands ---------- */
  const COMMANDS = {};
  function def(name, aliases, summary, usage, run) {
    const c = { name, aliases, summary, usage, run };
    COMMANDS[name] = c;
    aliases.forEach((a) => { COMMANDS[a] = c; });
  }
  function showUsage(lines, c) {
    c.usage.split("\n").forEach((l) => out(lines, l));
    note(lines, msg("usage_note"));
  }

  def("dir", [], "Displays a list of files and subdirectories in a directory.",
    "Displays a list of files and subdirectories in a directory.\n\nDIR [drive:][path][filename] [/B] [/W]\n\n  [drive:][path][filename]\n              Specifies drive, directory, and/or files to list.\n  /B          Uses bare format (no heading information or summary).\n  /W          Uses wide list format.",
    (sh, rest, lines, rec) => {
      const toks = tokenize(rest);
      const sw = toks.filter((t) => !t.q && t.v.startsWith("/")).map((t) => t.v.toLowerCase());
      const args = toks.filter((t) => t.q || !t.v.startsWith("/")).map((t) => t.v);
      rec.switches = sw; rec.args = args;
      if (sw.includes("/?")) { showUsage(lines, COMMANDS.dir); return true; }
      const bad = sw.find((s) => !["/w", "/b"].includes(s));
      if (bad) { err(lines, `Invalid switch - "${bad.slice(1)}".`); note(lines, msg("invalid_switch", { cmd: "dir" })); return false; }
      const target = args.join(" ") || ".";
      let p = VFS.parse(target, sh.drive, sh.cwd);
      let pattern = null;
      const last = p.parts[p.parts.length - 1];
      if (last && /[*?]/.test(last)) { pattern = VFS.wildcardToRegex(last); p = { ...p, parts: p.parts.slice(0, -1) }; }
      if (!VFS.getDrive(sh.fs, p.drive)) { err(lines, "The system cannot find the path specified."); note(lines, msg("drive_not_found", { drive: p.drive })); return false; }
      const r = VFS.resolve(sh.fs, p.drive, p.parts);
      let dirNode, dirParts, entries;
      if (!r.node) {
        if (r.parent) { err(lines, "File Not Found"); note(lines, msg("file_not_found")); }
        else { err(lines, "The system cannot find the path specified."); note(lines, msg("path_not_found")); }
        return false;
      }
      if (r.node.type === "file") {
        dirParts = r.canonical.slice(0, -1);
        dirNode = VFS.resolve(sh.fs, p.drive, dirParts).node;
        entries = [r.node];
      } else {
        dirNode = r.node; dirParts = r.canonical;
        entries = VFS.sortedChildren(dirNode);
        if (pattern) entries = entries.filter((e) => pattern.test(e.name));
      }
      rec.target = VFS.fmt(p.drive, dirParts);
      if (pattern && !entries.length) { err(lines, "File Not Found"); note(lines, msg("file_not_found")); return false; }
      const drv = VFS.getDrive(sh.fs, p.drive);
      const isRoot = dirParts.length === 0;
      const showDots = !isRoot && !pattern && r.node.type === "dir";
      const files = entries.filter((e) => e.type === "file");
      const dirs = entries.filter((e) => e.type === "dir");
      if (sw.includes("/b")) { entries.forEach((e) => out(lines, e.name)); return true; }
      out(lines, drv.label ? ` Volume in drive ${p.drive} is ${drv.label}` : ` Volume in drive ${p.drive} has no label.`);
      out(lines, ` Volume Serial Number is ${drv.serial}`);
      out(lines, "");
      out(lines, ` Directory of ${VFS.fmt(p.drive, dirParts)}`);
      out(lines, "");
      const dirCount = dirs.length + (showDots ? 2 : 0);
      if (sw.includes("/w")) {
        const names = (showDots ? ["[.]", "[..]"] : []).concat(entries.map((e) => (e.type === "dir" ? `[${e.name}]` : e.name)));
        const w = Math.max(15, ...names.map((n) => n.length + 2));
        const cols = Math.max(1, Math.floor(64 / w));
        for (let i = 0; i < names.length; i += cols) out(lines, names.slice(i, i + cols).map((n) => n.padEnd(w)).join("").trimEnd());
      } else {
        const t = fmtTime(dirNode.t);
        if (showDots) { out(lines, `${t}    <DIR>          .`); out(lines, `${t}    <DIR>          ..`); }
        entries.forEach((e) => {
          if (e.type === "dir") out(lines, `${fmtTime(e.t)}    <DIR>          ${e.name}`);
          else out(lines, `${fmtTime(e.t)}${num(e.size).padStart(18)} ${e.name}`);
        });
      }
      const bytes = files.reduce((s, f) => s + f.size, 0);
      out(lines, `${String(files.length).padStart(16)} File(s) ${num(bytes).padStart(14)} bytes`);
      out(lines, `${String(dirCount).padStart(16)} Dir(s) ${drv.free.padStart(15)} bytes free`);
      return true;
    });

  def("cd", ["chdir"], "Displays the name of or changes the current directory.",
    "Displays the name of or changes the current directory.\n\nCHDIR [/D] [drive:][path]\nCHDIR [..]\nCD [/D] [drive:][path]\nCD [..]\n\n  ..   Specifies that you want to change to the parent directory.\n\nType CD drive: to display the current directory in the specified drive.\nType CD without parameters to display the current drive and directory.\n\nUse the /D switch to change current drive in addition to changing current\ndirectory for a drive.",
    (sh, rest, lines, rec) => {
      let s = rest.trim();
      rec.switches = [];
      if (s === "/?") { rec.switches = ["/?"]; showUsage(lines, COMMANDS.cd); return true; }
      let changeDrive = false;
      const md = s.match(/^\/d(\s+|$)/i);
      if (md) { changeDrive = true; rec.switches = ["/d"]; s = s.slice(md[0].length).trim(); }
      s = s.replace(/"/g, "").trim();
      rec.args = s ? [s] : [];
      if (!s) { out(lines, cwdPath(sh)); rec.printed = true; return true; }
      const onlyDrive = s.match(/^([a-zA-Z]):$/);
      if (onlyDrive && !changeDrive) {
        const L = onlyDrive[1].toUpperCase();
        if (!VFS.getDrive(sh.fs, L)) { err(lines, "The system cannot find the drive specified."); note(lines, msg("drive_not_found", { drive: L })); return false; }
        out(lines, VFS.fmt(L, sh.cwd[L])); return true;
      }
      const p = VFS.parse(s, sh.drive, sh.cwd);
      rec.pathKind = p.kind;
      if (!VFS.getDrive(sh.fs, p.drive)) { err(lines, "The system cannot find the drive specified."); note(lines, msg("drive_not_found", { drive: p.drive })); return false; }
      const r = VFS.resolve(sh.fs, p.drive, p.parts);
      if (!r.node) { err(lines, "The system cannot find the path specified."); note(lines, msg("path_not_found")); return false; }
      if (r.node.type !== "dir") { err(lines, "The directory name is invalid."); note(lines, msg("dir_name_invalid", { name: r.node.name })); return false; }
      sh.cwd[p.drive] = r.canonical;
      rec.target = VFS.fmt(p.drive, r.canonical);
      if (p.drive !== sh.drive) {
        if (changeDrive) sh.drive = p.drive;
        else note(lines, msg("cd_other_drive", { drive: p.drive, cur: sh.drive }));
      }
      return true;
    });

  def("mkdir", ["md"], "Creates a directory.",
    "Creates a directory.\n\nMKDIR [drive:]path\nMD [drive:]path",
    (sh, rest, lines, rec) => {
      const toks = tokenize(rest);
      rec.args = toks.map((t) => t.v); rec.switches = [];
      if (toks.length === 1 && toks[0].v === "/?") { showUsage(lines, COMMANDS.mkdir); return true; }
      if (!toks.length) { err(lines, "The syntax of the command is incorrect."); note(lines, msg("syntax", { cmd: "mkdir" })); return false; }
      let ok = true;
      toks.forEach((tk) => {
        const raw = tk.v.replace(/\//g, "\\");
        const nameOnly = raw.replace(/^[a-zA-Z]:/, "");
        if (nameOnly.split("\\").some((seg) => VFS.INVALID_NAME.test(seg)) || (tk.v.startsWith("/") && !tk.q)) {
          err(lines, "The filename, directory name, or volume label syntax is incorrect."); note(lines, msg("bad_name")); ok = false; return;
        }
        const p = VFS.parse(raw, sh.drive, sh.cwd);
        if (!VFS.getDrive(sh.fs, p.drive)) { err(lines, "The system cannot find the path specified."); note(lines, msg("drive_not_found", { drive: p.drive })); ok = false; return; }
        const r = VFS.resolve(sh.fs, p.drive, p.parts);
        if (r.node) { err(lines, `A subdirectory or file ${tk.v} already exists.`); note(lines, msg("already_exists")); ok = false; return; }
        if (!VFS.mkdirp(sh.fs, p.drive, p.parts, nowIso())) { err(lines, "The system cannot find the path specified."); ok = false; return; }
        rec.created = (rec.created || []).concat(VFS.fmt(p.drive, p.parts));
      });
      return ok;
    });

  def("type", [], "Displays the contents of a text file.",
    "Displays the contents of a text file or files.\n\nTYPE [drive:][path]filename",
    (sh, rest, lines, rec) => {
      const toks = tokenize(rest);
      rec.args = toks.map((t) => t.v); rec.switches = [];
      if (toks.length === 1 && toks[0].v === "/?") { showUsage(lines, COMMANDS.type); return true; }
      if (!toks.length) { err(lines, "The syntax of the command is incorrect."); note(lines, msg("syntax", { cmd: "type" })); return false; }
      let ok = true;
      toks.forEach((tk) => {
        const p = VFS.parse(tk.v, sh.drive, sh.cwd);
        const r = VFS.resolve(sh.fs, p.drive, p.parts);
        if (!r.node) { err(lines, "The system cannot find the file specified."); note(lines, msg("file_not_found")); ok = false; return; }
        if (r.node.type === "dir") { err(lines, "Access is denied."); note(lines, msg("type_dir", { name: r.node.name })); ok = false; return; }
        if (toks.length > 1) { out(lines, ""); out(lines, tk.v); out(lines, ""); out(lines, ""); }
        if (r.node.binary) { out(lines, "ÿØÿà JFIF  ☺☺ ` `  ÿÛ C ☻☺☺☻☺..."); note(lines, msg("type_binary", { ext: r.node.name.split(".").pop() })); return; }
        r.node.content.replace(/\n$/, "").split("\n").forEach((l) => out(lines, l));
      });
      return ok;
    });

  def("echo", [], "Displays messages, or turns command-echoing on or off.",
    "Displays messages, or turns command-echoing on or off.\n\n  ECHO [ON | OFF]\n  ECHO [message]",
    (sh, rest, lines, rec) => {
      rec.switches = [];
      if (rest.trim() === "/?") { showUsage(lines, COMMANDS.echo); return true; }
      if (/^[.(]/.test(rest)) { out(lines, rest.slice(1)); rec.args = rest.slice(1) ? [rest.slice(1)] : []; return true; }
      const text = rest.replace(/^\s/, "");
      rec.args = text.trim() ? [text] : [];
      if (!text.trim()) { out(lines, "ECHO is on."); return true; }
      if (/^(on|off)$/i.test(text.trim())) { note(lines, msg("echo_onoff")); return true; }
      out(lines, text);
      return true;
    });

  def("cls", [], "Clears the screen.", "Clears the screen.\n\nCLS",
    (sh, rest, lines, rec) => {
      if (rest.trim() === "/?") { showUsage(lines, COMMANDS.cls); return true; }
      rec.clear = true; return true;
    });

  def("ver", [], "Displays the Windows version.", "Displays the Windows version.\n\nVER",
    (sh, rest, lines) => {
      if (rest.trim() === "/?") { showUsage(lines, COMMANDS.ver); return true; }
      out(lines, ""); out(lines, "Microsoft Windows [Version 10.0.22631.4317]"); return true;
    });

  def("help", [], "Provides Help information for Windows commands.",
    "Provides help information for Windows commands.\n\nHELP [command]\n\n    command - displays help information on that command.",
    (sh, rest, lines, rec) => {
      const a = rest.trim().toLowerCase();
      rec.args = a ? [a] : [];
      if (a === "/?") { showUsage(lines, COMMANDS.help); return true; }
      if (a) {
        if (COMMANDS[a]) { showUsage(lines, COMMANDS[a]); return true; }
        out(lines, "This command is not supported by the help utility.  Try \"x /?\".".replace("x", a));
        return false;
      }
      out(lines, "For more information on a specific command, type HELP command-name");
      const seen = new Set();
      Object.values(COMMANDS).forEach((c) => {
        if (seen.has(c.name) || c.hidden) return; seen.add(c.name);
        out(lines, c.name.toUpperCase().padEnd(15) + c.summary);
      });
      note(lines, msg("help_footer"));
      return true;
    });

  def("whoami", [], "Displays the current user name.", "WHOAMI\n\nDisplays user, group and privileges information for the user who is currently logged on.",
    (sh, rest, lines) => { out(lines, "academy-pc\\student"); return true; });
  COMMANDS.whoami.hidden = true;

  def("hostname", [], "Prints the name of the current host.", "Prints the name of the current host.\n\nhostname",
    (sh, rest, lines) => { out(lines, sh.env.COMPUTERNAME); return true; });
  COMMANDS.hostname.hidden = true;

  def("exit", [], "Quits the CMD.EXE program.", "Quits the CMD.EXE program (command interpreter).\n\nEXIT",
    (sh, rest, lines) => { note(lines, msg("exit")); return true; });
  COMMANDS.exit.hidden = true;

  /* ---------- main entry ---------- */
  function run(sh, rawLine) {
    const lines = [];
    const line = rawLine.replace(/\u200c/g, "").trim();
    const rec = { raw: line, name: null, args: [], switches: [], ok: false };
    const done = (ok) => { rec.ok = ok; sh.log.push(rec); return { lines, clear: !!rec.clear, rec }; };
    if (!line) return { lines, clear: false, rec: null };

    if (/^[a-zA-Z]:\\[^>]*>/.test(line)) { note(lines, msg("typed_prompt")); return done(false); }

    // Drive switch: "D:"
    const dm = line.match(/^([a-zA-Z]):\s*$/);
    if (dm) {
      const L = dm[1].toUpperCase();
      rec.name = "drive";
      rec.args = [L + ":"];
      if (!VFS.getDrive(sh.fs, L)) { err(lines, "The system cannot find the drive specified."); note(lines, msg("drive_not_found", { drive: L })); return done(false); }
      sh.drive = L; rec.target = cwdPath(sh); return done(true);
    }
    if (/^[a-zA-Z]$/.test(line) && VFS.getDrive(sh.fs, line.toUpperCase())) {
      err(lines, `'${line}' is not recognized as an internal or external command,`);
      err(lines, "operable program or batch file.");
      note(lines, msg("missing_colon", { drive: line.toUpperCase() }));
      return done(false);
    }

    const expanded = expandEnv(sh, line);
    const m = expanded.match(/^([^\s\\\/."]+)(.*)$/s);
    const firstWord = expanded.split(/\s+/)[0];
    const name = (m ? m[1] : firstWord).toLowerCase();
    let rest = m ? m[2] : "";
    rec.name = name;

    if (/[\u0600-\u06FF]/.test(firstWord)) {
      err(lines, `'${firstWord}' is not recognized as an internal or external command,`);
      err(lines, "operable program or batch file.");
      note(lines, msg("persian_kb"));
      return done(false);
    }

    if (hasOperator(rest)) { note(lines, msg("operators")); return done(false); }

    const c = COMMANDS[name];
    if (c) {
      rec.name = c.name;
      // "dir/w", "cd.." and "cd\" style glued arguments are legal in CMD
      if (rest && !/^\s/.test(rest) && name !== "echo") rest = " " + rest;
      try { return done(!!c.run(sh, rest, lines, rec)); }
      catch (e) { err(lines, "Simulator error: " + e.message); return done(false); }
    }

    if (name === "format" || name === "diskpart" || DANGEROUS.includes(name)) {
      warn(lines, name === "format" ? msg("format_warn") : msg("danger", { cmd: name }));
      if (LESSON_OF[name]) note(lines, msg("later_lesson", { cmd: name, n: LESSON_OF[name] }));
      return done(false);
    }
    if (LESSON_OF[name]) { note(lines, msg("later_lesson", { cmd: name, n: LESSON_OF[name] })); return done(false); }

    err(lines, `'${firstWord}' is not recognized as an internal or external command,`);
    err(lines, "operable program or batch file.");
    const known = Object.keys(COMMANDS).concat(Object.keys(LESSON_OF));
    let best = null, bestD = 3;
    known.forEach((k) => { const d = levenshtein(name, k); if (d < bestD) { bestD = d; best = k; } });
    const here = VFS.resolve(sh.fs, sh.drive, sh.cwd[sh.drive]).node;
    const folder = here && here.children[line.replace(/"/g, "").toLowerCase()];
    if (folder && folder.type === "dir") note(lines, msg("folder_not_command", { name: folder.name }));
    else note(lines, msg("not_recognized") + (best && bestD <= 2 ? " " + msg("suggest", { cmd: best }) : ""));
    return done(false);
  }

  function banner() {
    return [
      { t: "out", text: "Microsoft Windows [Version 10.0.22631.4317]" },
      { t: "out", text: "(c) Microsoft Corporation. All rights reserved." },
      { t: "out", text: "" },
    ];
  }

  return { create, run, prompt, cwdPath, setLocation, setMessages, setLessonIndex, banner, COMMANDS };
})();
