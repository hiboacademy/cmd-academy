/* ============================================================
   engine/shell.js — Educational CMD interpreter (sandbox only)

   A command line is parsed into a small tree
     chain  (& && ||)  →  pipe (|)  →  cmd + redirects (> >> < 2> 2>&1)
     plus  if / for / ( blocks )
   and executed by generator functions. A command that needs
   input (a Y/N question, set /p, pause, choice, timeout) yields
   a request; the terminal answers it and execution resumes.
   No real system command is ever executed.
   ============================================================ */
const Shell = (() => {
  let MSG = {};               // Persian teaching messages (from content)
  let LESSON_OF = {};         // command -> lesson number (from curriculum)
  const COMMANDS = {};
  const MAX_STEPS = 20000;

  function setMessages(m) { MSG = m || {}; }
  function setLessonIndex(idx) { LESSON_OF = idx || {}; }
  function msg(key, vars = {}) {
    let s = MSG[key] || key;
    Object.keys(vars).forEach((k) => { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }
  function lessonOf(name) { return LESSON_OF[name] || null; }

  /* ---------- shell instance ---------- */
  function baseEnv() {
    return {
      ALLUSERSPROFILE: "C:\\ProgramData", APPDATA: "C:\\Users\\Student\\AppData\\Roaming",
      CommonProgramFiles: "C:\\Program Files\\Common Files", COMPUTERNAME: "ACADEMY-PC",
      ComSpec: "C:\\Windows\\system32\\cmd.exe", HOMEDRIVE: "C:", HOMEPATH: "\\Users\\Student",
      LOCALAPPDATA: "C:\\Users\\Student\\AppData\\Local", LOGONSERVER: "\\\\ACADEMY-PC",
      NUMBER_OF_PROCESSORS: "8", OS: "Windows_NT",
      Path: "C:\\Windows\\system32;C:\\Windows;C:\\Windows\\System32\\Wbem;C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\;C:\\Program Files\\CMD Academy",
      PATHEXT: ".COM;.EXE;.BAT;.CMD;.VBS;.JS;.WSF;.WSH;.MSC", PROCESSOR_ARCHITECTURE: "AMD64",
      ProgramData: "C:\\ProgramData", ProgramFiles: "C:\\Program Files", PROMPT: "$P$G",
      PUBLIC: "C:\\Users\\Public", SystemDrive: "C:", SystemRoot: "C:\\Windows",
      TEMP: "C:\\Users\\Student\\AppData\\Local\\Temp", TMP: "C:\\Users\\Student\\AppData\\Local\\Temp",
      USERDOMAIN: "ACADEMY-PC", USERNAME: "Student", USERPROFILE: "C:\\Users\\Student", windir: "C:\\Windows",
    };
  }

  function create(opts = {}) {
    const sh = {
      fs: opts.fs ? VFS.clone(opts.fs) : VFS.createDefault(),
      drive: "C",
      cwd: { C: ["Users", "Student"], D: [], E: [] },
      env: baseEnv(),
      log: [],
      errorlevel: 0,
      admin: !!opts.admin,
      mode: opts.mode || "normal",
      echo: true,
      delayed: false,
      localStack: [],
      dirStack: [],
      procs: SysData.processes(),
      services: SysData.services(),
      net: SysData.network(),
      disks: SysData.disks(),
      title: null,
      color: null,
      pending: null,
      history: [],
    };
    if (sh.mode === "winre") setupWinRE(sh);
    else if (sh.admin) { sh.cwd.C = ["Windows", "System32"]; }
    if (opts.start) setLocation(sh, opts.start);
    if (opts.files) opts.files.forEach((f) => writeAt(sh, f.path, f.content || ""));
    return sh;
  }

  /* Windows Recovery Environment: X: is a small RAM drive. */
  function setupWinRE(sh) {
    sh.admin = true;
    const t = VFS.nowIso();
    sh.fs.drives.X = {
      label: "Boot", serial: "5C21-9E0A", fs: "NTFS", free: 507543552, ram: true,
      root: VFS.D("", t, [VFS.D("Windows", t, [VFS.D("System32", t, ["cmd.exe", "bootrec.exe", "diskpart.exe", "bcdedit.exe", "chkdsk.exe", "sfc.exe", "dism.exe", "notepad.exe"].map((n) => VFS.F(n, t, null, 40960)))]), VFS.D("sources", t, [VFS.F("recovery", t, null, 0)])]),
    };
    sh.cwd.X = ["Windows", "System32"];
    sh.cwd.C = []; sh.cwd.D = []; sh.cwd.E = [];
    sh.drive = "X";
    sh.env.SystemDrive = "X:"; sh.env.SystemRoot = "X:\\windows"; sh.env.windir = "X:\\windows";
    sh.env.USERNAME = "SYSTEM"; sh.env.USERPROFILE = "X:\\windows\\system32\\config\\systemprofile";
    sh.env.Path = "X:\\windows\\system32;X:\\windows;X:\\windows\\System32\\Wbem";
    sh.env.TEMP = sh.env.TMP = "X:\\windows\\TEMP";
  }

  function writeAt(sh, path, content) {
    const p = VFS.parse(path, sh.drive, sh.cwd);
    VFS.mkdirp(sh.fs, p.drive, p.parts.slice(0, -1));
    const dir = VFS.resolve(sh.fs, p.drive, p.parts.slice(0, -1)).node;
    if (dir) VFS.writeFile(dir, p.parts[p.parts.length - 1], content, false);
  }

  function setLocation(sh, path) {
    const p = VFS.parse(path, sh.drive, sh.cwd);
    const r = VFS.resolve(sh.fs, p.drive, p.parts);
    if (r.node && r.node.type === "dir") { sh.drive = p.drive; sh.cwd[p.drive] = r.canonical; }
  }

  function cwdPath(sh) { return VFS.fmt(sh.drive, sh.cwd[sh.drive] || []); }
  function prompt(sh) {
    const p = getVar(sh, "PROMPT", true) || "$P$G";
    return p.replace(/\$(.)/g, (m, c) => {
      switch (c.toUpperCase()) {
        case "P": return cwdPath(sh);
        case "G": return ">";
        case "L": return "<";
        case "N": return sh.drive;
        case "D": return dateStr();
        case "T": return timeStr();
        case "_": return " ";
        case "$": return "$";
        case "S": return " ";
        default: return "";
      }
    });
  }

  /* ---------- variables ---------- */
  function findKey(sh, name) {
    const ln = String(name).toLowerCase();
    return Object.keys(sh.env).find((k) => k.toLowerCase() === ln);
  }
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const p2 = (n) => String(n).padStart(2, "0");
  function dateStr() { const d = new Date(); return `${DAYS[d.getDay()]} ${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${d.getFullYear()}`; }
  function timeStr() { const d = new Date(); return `${String(d.getHours()).padStart(2, " ")}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${p2(Math.floor(d.getMilliseconds() / 10))}`; }
  function getVar(sh, name, noDynamic) {
    const k = findKey(sh, name);
    if (k != null) return sh.env[k];
    if (noDynamic) return null;
    switch (String(name).toUpperCase()) {
      case "CD": return cwdPath(sh);
      case "DATE": return dateStr();
      case "TIME": return timeStr();
      case "RANDOM": return String(Math.floor(Math.random() * 32768));
      case "ERRORLEVEL": return String(sh.errorlevel);
      case "CMDEXTVERSION": return "2";
      case "CMDCMDLINE": return "C:\\Windows\\system32\\cmd.exe";
      default: return null;
    }
  }
  function setVar(sh, name, value) {
    const k = findKey(sh, name);
    if (value === "" || value == null) { if (k != null) delete sh.env[k]; return; }
    sh.env[k != null ? k : name] = value;
  }

  /* %var:~start,len%  and  %var:old=new% */
  function applyVarMod(val, mod) {
    if (!mod) return val;
    const sm = mod.match(/^~\s*(-?\d+)?\s*(?:,\s*(-?\d+))?$/);
    if (sm) {
      let s = sm[1] ? parseInt(sm[1], 10) : 0;
      if (s < 0) s = Math.max(0, val.length + s);
      let out = val.slice(s);
      if (sm[2] != null) {
        const l = parseInt(sm[2], 10);
        out = l >= 0 ? out.slice(0, l) : out.slice(0, Math.max(0, out.length + l));
      }
      return out;
    }
    const eq = mod.indexOf("=");
    if (eq >= 0) {
      let from = mod.slice(0, eq), to = mod.slice(eq + 1);
      if (!from) return val;
      let star = false;
      if (from.startsWith("*")) { star = true; from = from.slice(1); }
      const idx = val.toLowerCase().indexOf(from.toLowerCase());
      if (star) return idx < 0 ? val : to + val.slice(idx + from.length);
      const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      return val.replace(re, () => to);
    }
    return val;
  }

  /* Phase 1: %VAR% expansion. In a batch file also %0-%9, %*, %% -> %
     Undefined vars: empty in batch files, left as-is on the prompt. */
  function expandPercent(text, sh, frame) {
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c !== "%") { out += c; continue; }
      if (frame) {
        if (text[i + 1] === "%") { out += "%"; i++; continue; }
        const am = text.slice(i + 1).match(/^(~[fdpnxsatz]*)?([0-9*])/i);
        if (am && (am[2] !== "*" || !am[1])) {
          if (am[2] === "*") out += frame.args.slice(1).join(" ");
          else out += argMod(sh, frame.args[+am[2]] || "", am[1]);
          i += am[0].length; continue;
        }
      }
      const end = text.indexOf("%", i + 1);
      if (end < 0) { if (!frame) out += c; continue; }
      const body = text.slice(i + 1, end);
      if (!body || /[\n]/.test(body)) { if (!frame) out += c; continue; }
      const colon = body.indexOf(":");
      const name = colon >= 0 ? body.slice(0, colon) : body;
      const mod = colon >= 0 ? body.slice(colon + 1) : null;
      const v = name ? getVar(sh, name) : null;
      if (v == null) {
        if (frame) { i = end; continue; }      // undefined -> empty in batch
        out += "%"; continue;                  // keep literal on the prompt
      }
      out += applyVarMod(v, mod);
      i = end;
    }
    return out;
  }

  /* %~nx1 style modifiers for arguments and for-variables */
  function argMod(sh, val, mods) {
    let v = String(val);
    if (!mods) return v;
    mods = mods.slice(1).toLowerCase();
    v = v.replace(/^"(.*)"$/, "$1");
    if (!mods) return v;
    const p = VFS.parse(v, sh.drive, sh.cwd);
    const full = VFS.fmt(p.drive, p.parts);
    const name = p.parts[p.parts.length - 1] || "";
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    if (mods.includes("f")) return full;
    let r = "";
    if (mods.includes("z")) { const n = VFS.resolve(sh.fs, p.drive, p.parts).node; return n ? String(n.size || 0) : ""; }
    if (mods.includes("t")) { const n = VFS.resolve(sh.fs, p.drive, p.parts).node; return n ? fmtTime(n.t) : ""; }
    if (mods.includes("d")) r += p.drive + ":";
    if (mods.includes("p")) r += "\\" + p.parts.slice(0, -1).join("\\") + (p.parts.length > 1 ? "\\" : "");
    if (mods.includes("n")) r += base;
    if (mods.includes("x")) r += ext;
    return r;
  }

  /* Phase 2 (per command): for-variables and !delayed! expansion */
  function sub(text, ctx) {
    if (text == null) return text;
    let s = text;
    const fv = ctx.forVars;
    if (fv && Object.keys(fv).length) {
      s = s.replace(/%(~[fdpnxsatz]*)?([A-Za-z])/g, (m, mods, v) => (v in fv ? (mods ? argMod(ctx.sh, fv[v], mods) : fv[v]) : m));
    }
    if (ctx.sh.delayed) {
      s = s.replace(/!([^!\n]+)!/g, (m, body) => {
        const colon = body.indexOf(":");
        const name = colon >= 0 ? body.slice(0, colon) : body;
        const v = getVar(ctx.sh, name);
        return v == null ? "" : applyVarMod(v, colon >= 0 ? body.slice(colon + 1) : null);
      });
    }
    return s;
  }

  /* ---------- parser ---------- */
  function SyntaxErr(text) { this.syntax = text; }

  /* scan helper: calls fn(i, ch) for characters outside quotes, tracking paren depth */
  function scan(s, fn) {
    let inQ = false, depth = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (inQ) continue;
      if (c === "^") { i++; continue; }
      if (c === "(") { depth++; continue; }
      if (c === ")") { if (depth > 0) depth--; continue; }
      const r = fn(i, c, depth);
      if (typeof r === "number") i = r;
      else if (r === false) return;
    }
  }

  function parenBalance(s) {
    let inQ = false, d = 0;
    const lines = s.split("\n");
    lines.forEach((line) => {
      const t = line.trim();
      if (/^(rem(\s|$)|::)/i.test(t)) return;
      inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') inQ = !inQ;
        else if (!inQ && c === "^") i++;
        else if (!inQ && c === "(") d++;
        else if (!inQ && c === ")" && d > 0) d--;
      }
    });
    return d;
  }

  const isHelpOf = (s) => /^(if|for)\s*\/\?/i.test(s.trimStart());
  const isKeyword = (s) => /^(if|for)(\s|\/)/i.test(s.trimStart()) && !isHelpOf(s);

  /* split at top level by && || & (chain). An if/for takes the rest of the line. */
  function splitOps(s) {
    const segs = [];
    let start = 0, op = null, stop = false;
    if (isKeyword(s)) return [{ op: null, text: s }];
    scan(s, (i, c, depth) => {
      if (stop || depth > 0) return;
      let len = 0, o = null;
      if (c === "&" && s[i + 1] === "&") { o = "&&"; len = 2; }
      else if (c === "|" && s[i + 1] === "|") { o = "||"; len = 2; }
      else if (c === "&") {
        if (s[i - 1] === ">") return;            // 2>&1
        o = "&"; len = 1;
      }
      if (!o) return;
      segs.push({ op, text: s.slice(start, i) });
      op = o; start = i + len;
      if (isKeyword(s.slice(start))) { stop = true; return false; }
      return i + len - 1;
    });
    segs.push({ op, text: s.slice(start) });
    return segs;
  }

  function splitPipes(s) {
    const parts = [];
    let start = 0;
    if (isKeyword(s)) return [s];
    scan(s, (i, c, depth) => {
      if (depth > 0) return;
      if (c === "|" && s[i + 1] !== "|" && s[i - 1] !== "|") { parts.push(s.slice(start, i)); start = i + 1; }
    });
    parts.push(s.slice(start));
    return parts;
  }

  function matchParen(s) {
    // s starts with "("
    let inQ = false, d = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') inQ = !inQ;
      else if (!inQ && c === "^") i++;
      else if (!inQ && c === "(") d++;
      else if (!inQ && c === ")") { d--; if (d === 0) return { inner: s.slice(1, i), rest: s.slice(i + 1) }; }
    }
    throw new SyntaxErr("missing )");
  }

  function splitLines(inner) {
    const out = [];
    let cur = "", inQ = false, d = 0;
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === '"') inQ = !inQ;
      if (!inQ && c === "(") d++;
      if (!inQ && c === ")" && d > 0) d--;
      if (c === "\n" && d === 0) { out.push(cur); cur = ""; inQ = false; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  /* pull redirections out of a simple command */
  function extractRedirs(t) {
    const redirs = [];
    let out = "", inQ = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '"') { inQ = !inQ; out += c; continue; }
      if (inQ) { out += c; continue; }
      if (c === "^") { out += c + (t[i + 1] || ""); i++; continue; }
      let fd = null, j = i;
      if (/[012]/.test(c) && (t[i + 1] === ">" || t[i + 1] === "<") && (i === 0 || /\s/.test(t[i - 1]))) { fd = +c; j = i + 1; }
      if (t[j] === ">" || t[j] === "<") {
        const dirIn = t[j] === "<";
        if (fd == null) fd = dirIn ? 0 : 1;
        let mode = "w";
        j++;
        if (!dirIn && t[j] === ">") { mode = "a"; j++; }
        if (!dirIn && t[j] === "&" && /[12]/.test(t[j + 1] || "")) {
          redirs.push({ fd, dup: +t[j + 1] }); i = j + 1; continue;
        }
        while (t[j] === " " || t[j] === "\t") j++;
        let target = "";
        if (t[j] === '"') { const e = t.indexOf('"', j + 1); target = t.slice(j + 1, e < 0 ? t.length : e); j = e < 0 ? t.length : e + 1; }
        else { while (j < t.length && !/[\s<>|&]/.test(t[j])) target += t[j++]; }
        if (!target) throw new SyntaxErr("The syntax of the command is incorrect.");
        redirs.push(dirIn ? { fd: 0, target } : { fd, mode, target });
        i = j - 1;
        continue;
      }
      out += c;
    }
    return { text: out, redirs };
  }

  function parseStmt(s) {
    if (s == null) return null;
    s = s.replace(/^[\s@]+/, "");
    if (!s.trim()) return null;
    if (/^rem(\s|$|\/)/i.test(s) || s.startsWith("::")) return { type: "cmd", text: s, redirs: [] };
    if (/^if(\s|\/|$)/i.test(s) && !isHelpOf(s)) return parseIf(s);
    if (/^for(\s|$)/i.test(s) && !isHelpOf(s)) return parseFor(s);
    const segs = splitOps(s);
    if (segs.length === 1) return parsePipeline(segs[0].text);
    return { type: "chain", items: segs.map((g) => ({ op: g.op, node: parsePipeline(g.text) })) };
  }

  function parsePipeline(t) {
    const st = splitPipes(t);
    if (st.length === 1) return parseStage(st[0]);
    st.forEach((x) => { if (!x.trim()) throw new SyntaxErr("| was unexpected at this time."); });
    return { type: "pipe", stages: st.map(parseStage) };
  }

  function parseStage(t) {
    const s = t.replace(/^[\s@]+/, "");
    if (s.startsWith("(")) {
      const { inner, rest } = matchParen(s);
      const body = splitLines(inner).map(parseStmt).filter(Boolean);
      const r = extractRedirs(rest);
      if (r.text.trim()) throw new SyntaxErr(`${r.text.trim().split(/\s+/)[0]} was unexpected at this time.`);
      return { type: "block", body, redirs: r.redirs };
    }
    if (/^(if|for)(\s|\/)/i.test(s) && !isHelpOf(s)) return parseStmt(s);
    const r = extractRedirs(s);
    return { type: "cmd", text: r.text, redirs: r.redirs };
  }

  /* read one operand for if: "quoted..." or word up to space / == */
  function readOperand(s, i) {
    let v = "";
    if (s[i] === '"') {
      const e = s.indexOf('"', i + 1);
      const end = e < 0 ? s.length : e + 1;
      v = s.slice(i, end); i = end;
      while (i < s.length && !/\s/.test(s[i]) && !s.startsWith("==", i)) v += s[i++];
      return { v, i };
    }
    while (i < s.length && !/\s/.test(s[i]) && !s.startsWith("==", i)) v += s[i++];
    return { v, i };
  }
  const skipWs = (s, i) => { while (i < s.length && /[ \t]/.test(s[i])) i++; return i; };
  function word(s, i) { const m = s.slice(i).match(/^[^\s]+/); return m ? m[0] : ""; }

  function parseIf(s) {
    let i = 2, ci = false, not = false;
    i = skipWs(s, i);
    if (/^\/i\b/i.test(s.slice(i))) { ci = true; i = skipWs(s, i + 2); }
    if (/^not\s/i.test(s.slice(i))) { not = true; i = skipWs(s, i + 3); }
    const w = word(s, i).toLowerCase();
    let cond;
    if (w === "exist" || w === "defined" || w === "errorlevel") {
      i = skipWs(s, i + w.length);
      const o = readOperand(s, i);
      if (!o.v) throw new SyntaxErr("The syntax of the command is incorrect.");
      cond = { kind: w, a: o.v }; i = o.i;
    } else {
      const a = readOperand(s, i);
      if (!a.v) throw new SyntaxErr("The syntax of the command is incorrect.");
      i = skipWs(s, a.i);
      let op;
      if (s.startsWith("==", i)) { op = "=="; i += 2; }
      else {
        const ow = word(s, i).toLowerCase();
        if (["equ", "neq", "lss", "leq", "gtr", "geq"].includes(ow)) { op = ow; i += ow.length; }
        else throw new SyntaxErr(`${word(s, i) || "("} was unexpected at this time.`);
      }
      i = skipWs(s, i);
      const b = readOperand(s, i);
      if (!b.v) throw new SyntaxErr("The syntax of the command is incorrect.");
      i = b.i;
      cond = { kind: "cmp", op, a: a.v, b: b.v };
    }
    const rest = s.slice(i).trimStart();
    if (!rest) throw new SyntaxErr("The syntax of the command is incorrect.");
    let thenNode, elseNode = null;
    if (rest.startsWith("(")) {
      const { inner, rest: after } = matchParen(rest);
      thenNode = { type: "block", body: splitLines(inner).map(parseStmt).filter(Boolean), redirs: [] };
      const a2 = after.trimStart();
      if (/^else(\s|\(|$)/i.test(a2)) elseNode = parseStmt(a2.slice(4).trimStart()) || null;
      else if (a2) {
        const r = extractRedirs(a2);
        if (r.text.trim()) throw new SyntaxErr(`${r.text.trim().split(/\s+/)[0]} was unexpected at this time.`);
        thenNode.redirs = r.redirs;
      }
    } else {
      thenNode = parseStmt(rest);
    }
    return { type: "if", ci, not, cond, then: thenNode, else: elseNode };
  }

  function parseFor(s) {
    let i = skipWs(s, 3), mode = "", opts = "", root = null;
    const sw = s.slice(i).match(/^\/([lfdr])\b/i);
    if (sw) {
      mode = sw[1].toLowerCase(); i = skipWs(s, i + 2);
      if (mode === "f" && s[i] === '"') { const e = s.indexOf('"', i + 1); opts = s.slice(i + 1, e); i = skipWs(s, e + 1); }
      if (mode === "r" && s[i] !== "%") { const o = readOperand(s, i); root = o.v.replace(/"/g, ""); i = skipWs(s, o.i); }
    }
    const vm = s.slice(i).match(/^%(%?)([A-Za-z])\b/);
    if (!vm) throw new SyntaxErr(`${word(s, i) || "for"} was unexpected at this time.`);
    if (vm[1]) throw new SyntaxErr(`%%${vm[2]} was unexpected at this time.`);
    const v = vm[2];
    i = skipWs(s, i + vm[0].length);
    if (!/^in\b/i.test(s.slice(i))) throw new SyntaxErr(`${word(s, i) || "in"} was unexpected at this time.`);
    i = skipWs(s, i + 2);
    if (s[i] !== "(") throw new SyntaxErr(`${word(s, i) || "("} was unexpected at this time.`);
    const { inner, rest } = matchParen(s.slice(i));
    const r2 = rest.trimStart();
    if (!/^do(\s|\(|$)/i.test(r2)) throw new SyntaxErr(`${word(r2, 0) || "do"} was unexpected at this time.`);
    const bodyText = r2.slice(2).trimStart();
    const body = parseStmt(bodyText);
    if (!body) throw new SyntaxErr("The syntax of the command is incorrect.");
    return { type: "for", mode, opts, root, v, set: inner.replace(/\n/g, " "), body, bodyText };
  }

  /* what operators a line uses (for practice checks) */
  function lineInfo(node, info = { ops: [], pipe: false, redirs: [], blocks: false }) {
    if (!node) return info;
    switch (node.type) {
      case "chain": node.items.forEach((it) => { if (it.op) info.ops.push(it.op); lineInfo(it.node, info); }); break;
      case "pipe": info.pipe = true; info.ops.push("|"); node.stages.forEach((x) => lineInfo(x, info)); break;
      case "block": info.blocks = true; (node.redirs || []).forEach((r) => info.redirs.push(redirKey(r))); node.body.forEach((x) => lineInfo(x, info)); break;
      case "if": info.ops.push("if"); lineInfo(node.then, info); lineInfo(node.else, info); break;
      case "for": info.ops.push("for"); lineInfo(node.body, info); break;
      case "cmd": node.redirs.forEach((r) => info.redirs.push(redirKey(r))); break;
    }
    return info;
  }
  function redirKey(r) {
    if (r.dup) return `${r.fd}>&${r.dup}`;
    if (r.fd === 0) return "<";
    return (r.fd === 2 ? "2" : "") + (r.mode === "a" ? ">>" : ">");
  }

  /* ---------- tokenizing arguments ---------- */
  function tokenize(str) {
    const out = [];
    let cur = "", inQ = false, quoted = false;
    const push = () => { if (cur.length || quoted) out.push({ v: cur, q: quoted }); cur = ""; quoted = false; };
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === '"') { inQ = !inQ; quoted = true; continue; }
      if (!inQ && (c === " " || c === "\t" || c === "," || c === ";")) { push(); continue; }
      if (!inQ && c === "/" && cur.length && cur[0] === "/") { push(); }
      cur += c;
    }
    push();
    return out;
  }
  /* -> { args:[string], sw:[lowercased switches], raw } */
  function parseArgs(rest) {
    const toks = tokenize(rest);
    const sw = [], args = [];
    toks.forEach((t) => {
      if (!t.q && t.v.startsWith("/") && t.v.length > 1) sw.push(t.v.toLowerCase());
      else if (t.q && t.v.startsWith("/") && /^\/[a-z]:/i.test(t.v)) sw.push(t.v.slice(0, 3).toLowerCase() + t.v.slice(3));
      else args.push(t.v);
    });
    return { args, sw, toks };
  }
  const hasSw = (sw, ...names) => sw.some((s) => names.includes(s) || names.some((n) => n.endsWith("*") && s.startsWith(n.slice(0, -1))));
  function unescape(s) {
    let out = "", inQ = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') inQ = !inQ;
      if (!inQ && c === "^") { out += s[i + 1] || ""; i++; continue; }
      out += c;
    }
    return out;
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
  const out = (lines, text) => { String(text).split("\n").forEach((t) => lines.push({ t: "out", text: t })); };
  const err = (lines, text) => { String(text).split("\n").forEach((t) => lines.push({ t: "err", text: t })); };
  const note = (lines, text) => lines.push({ t: "note", text });
  const warn = (lines, text) => lines.push({ t: "warn", text });

  function fmtTime(iso) {
    const d = new Date(iso);
    let h = d.getHours(); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${d.getFullYear()}  ${p2(h)}:${p2(d.getMinutes())} ${ap}`;
  }
  const num = (n) => Number(n).toLocaleString("en-US");

  /* ---------- path helpers for commands ---------- */
  function P(sh, raw) { return VFS.parse(raw, sh.drive, sh.cwd); }
  function R(sh, p) { return VFS.resolve(sh.fs, p.drive, p.parts); }
  function full(p) { return VFS.fmt(p.drive, p.parts); }
  /* Expand a path that may end in a wildcard into matching nodes.
     -> { dir, dirParts, drive, items:[{node, parts}], pattern, missingDir } */
  function expand(sh, raw, { hidden = false } = {}) {
    const p = P(sh, raw);
    const last = p.parts[p.parts.length - 1];
    if (last && VFS.hasWild(last)) {
      const dp = p.parts.slice(0, -1);
      const r = VFS.resolve(sh.fs, p.drive, dp);
      if (!r.node || r.node.type !== "dir") return { missingDir: true, drive: p.drive, dirParts: dp, items: [] };
      const re = VFS.wildcardToRegex(last);
      const items = VFS.sortedChildren(r.node)
        .filter((n) => re.test(n.name) && (hidden || !(n.attrs && (n.attrs.h || n.attrs.s))))
        .map((n) => ({ node: n, parts: r.canonical.concat(n.name) }));
      return { dir: r.node, dirParts: r.canonical, drive: p.drive, items, pattern: last };
    }
    const r = R(sh, p);
    if (!r.node) {
      const pr = VFS.resolve(sh.fs, p.drive, p.parts.slice(0, -1));
      return { drive: p.drive, dirParts: pr.node ? pr.canonical : p.parts.slice(0, -1), items: [], missingDir: !pr.node || pr.node.type !== "dir", name: last, parentNode: pr.node };
    }
    return { drive: p.drive, dirParts: r.canonical.slice(0, -1), items: [{ node: r.node, parts: r.canonical }], single: true };
  }
  function parentOf(sh, drive, parts) { return VFS.resolve(sh.fs, drive, parts.slice(0, -1)).node; }
  /* true if [drive,parts] is the cwd of any drive or one of its parents */
  /* Windows protects its own folders (TrustedInstaller), even from Administrators. */
  const SYSTEM_DIRS = ["windows", "program files", "program files (x86)", "programdata"];
  function isSystem(sh, drive, parts) {
    return drive === "C" && parts.length > 0 && SYSTEM_DIRS.includes(String(parts[0]).toLowerCase());
  }
  /* Normal users cannot create or change anything inside the Windows folders. */
  const denyWrite = (sh, drive, parts) => !sh.admin && isSystem(sh, drive, parts);
  function inUse(sh, drive, parts) {
    const cw = sh.cwd[drive] || [];
    if (parts.length > cw.length) return false;
    return parts.every((x, i) => (cw[i] || "").toLowerCase() === x.toLowerCase());
  }

  /* ---------- commands registry ---------- */
  /* meta: { summary, usage, keep (does not change errorlevel), hidden, group } */
  function def(name, aliases, meta, run) {
    const c = Object.assign({ name, aliases, run }, meta);
    COMMANDS[name] = c;
    aliases.forEach((a) => { COMMANDS[a] = c; });
    return c;
  }
  function showUsage(lines, c) {
    c.usage.split("\n").forEach((l) => out(lines, l));
    note(lines, msg("usage_note"));
  }
  /* ask the user a question; returns the answer */
  function* ask(prompt, kind = "line", extra = {}) {
    const a = yield Object.assign({ kind, prompt }, extra);
    return a == null ? "" : String(a);
  }

  /* ---------- executor ---------- */
  const SCREEN = { kind: "screen" };

  function flushTo(ctx, lines, io) {
    lines.forEach((l) => {
      if (l.t === "out") emit(ctx, io.stdout, l);
      else if (l.t === "err") emit(ctx, io.stderr === "dup" ? io.stdout : io.stderr, l);
      else ctx.screen.push(l);
    });
    lines.length = 0;
  }
  function emit(ctx, target, l) {
    if (!target || target.kind === "screen") ctx.screen.push(l);
    else if (target.kind === "buf") target.arr.push(l.text);
    else if (target.kind === "file") target.acc.push(l.text);
  }

  function* exec(node, ctx, io) {
    if (!node) return 0;
    if (++ctx.steps > MAX_STEPS) throw { loop: true };
    const fr = ctx.frame;
    switch (node.type) {
      case "cmd": return yield* execCmd(node, ctx, io);
      case "chain": {
        let code = 0, ok = true, ran = false;
        for (const it of node.items) {
          if (ran && it.op === "&&" && !ok) continue;
          if (ran && it.op === "||" && ok) continue;
          code = yield* exec(it.node, ctx, io); ran = true;
          ok = code === 0;
          if (fr && (fr.jump || fr.exit)) break;
          if (ctx.aborted) break;
        }
        return code;
      }
      case "pipe": {
        let buf = null, code = 0;
        for (let k = 0; k < node.stages.length; k++) {
          const last = k === node.stages.length - 1;
          const arr = [];
          const stdout = last ? io.stdout : { kind: "buf", arr };
          code = yield* exec(node.stages[k], ctx, { stdin: k === 0 ? io.stdin : buf, stdout, stderr: io.stderr });
          buf = arr;
          if (ctx.aborted) break;
        }
        return code;
      }
      case "block": {
        const rio = yield* openRedirs(node.redirs || [], ctx, io);
        if (!rio) return 1;
        let code = 0;
        for (const st of node.body) {
          code = yield* exec(st, ctx, rio.io);
          if (fr && (fr.jump || fr.exit)) break;
          if (ctx.aborted) break;
        }
        closeRedirs(ctx, rio);
        return code;
      }
      case "if": {
        let res = evalCond(node, ctx);
        if (res === null) return 1;
        if (node.not) res = !res;
        if (res) return yield* exec(node.then, ctx, io);
        if (node.else) return yield* exec(node.else, ctx, io);
        return 0;
      }
      case "for": return yield* execFor(node, ctx, io);
    }
    return 0;
  }

  function stripQ(s) { return String(s).replace(/^"(.*)"$/, "$1"); }

  function evalCond(node, ctx) {
    const sh = ctx.sh, c = node.cond;
    const a = sub(c.a, ctx);
    if (c.kind === "exist") {
      const e = expand(sh, stripQ(a), { hidden: true });
      return e.items.length > 0;
    }
    if (c.kind === "defined") return getVar(sh, a, true) != null;
    if (c.kind === "errorlevel") {
      const n = parseInt(a, 10);
      if (isNaN(n)) return null;
      return sh.errorlevel >= n;
    }
    const b = sub(c.b, ctx);
    let x = a, y = b;
    if (c.op === "==") return node.ci ? x.toLowerCase() === y.toLowerCase() : x === y;
    const isNum = (v) => /^-?\d+$/.test(v);
    let cmp;
    if (isNum(x) && isNum(y)) cmp = parseInt(x, 10) - parseInt(y, 10);
    else { if (node.ci) { x = x.toLowerCase(); y = y.toLowerCase(); } cmp = x < y ? -1 : x > y ? 1 : 0; }
    return { equ: cmp === 0, neq: cmp !== 0, lss: cmp < 0, leq: cmp <= 0, gtr: cmp > 0, geq: cmp >= 0 }[c.op];
  }

  function* execFor(node, ctx, io) {
    const sh = ctx.sh;
    const set = sub(node.set, ctx);
    let items = [];
    const lines = [];
    if (node.mode === "l") {
      const nums = set.split(/[\s,]+/).filter(Boolean).map((x) => parseInt(x, 10));
      const [start = 0, step = 1, end = 0] = nums;
      if (step === 0) return 0;
      let guard = 0;
      for (let v = start; step > 0 ? v <= end : v >= end; v += step) { items.push(String(v)); if (++guard > 5000) break; }
    } else if (node.mode === "f") {
      items = yield* forFItems(node, set, ctx, io, lines);
      if (items === null) { flushTo(ctx, lines, io); return 1; }
    } else {
      const toks = tokenize(set).map((t) => (t.q ? '"' + t.v + '"' : t.v));
      const roots = [];
      if (node.mode === "r") {
        const rp = P(sh, sub(node.root || ".", ctx));
        const rn = R(sh, rp);
        if (rn.node && rn.node.type === "dir") {
          roots.push(rn.canonical);
          VFS.walk(rn.node, rn.canonical, (n, parts) => { if (n.type === "dir") roots.push(parts); });
        }
      }
      const drv = node.mode === "r" ? P(sh, sub(node.root || ".", ctx)).drive : null;
      const baseList = node.mode === "r" ? roots : [null];
      baseList.forEach((base) => {
        toks.forEach((tk) => {
          const raw = stripQ(tk);
          if (VFS.hasWild(raw)) {
            const path = base ? VFS.fmt(drv, base) + "\\" + raw : raw;
            const e = expand(sh, path);
            e.items.forEach((it) => {
              const isDir = it.node.type === "dir";
              if ((node.mode === "d") === isDir) {
                const cut = raw.lastIndexOf("\\");
                const prefix = cut >= 0 ? raw.slice(0, cut + 1) : /^[a-z]:/i.test(raw) ? raw.slice(0, 2) : "";
                items.push(base ? VFS.fmt(e.drive, it.parts) : prefix + it.node.name);
              }
            });
          } else if (node.mode === "r") {
            items.push(VFS.fmt(drv, base) + "\\" + raw);
          } else if (node.mode !== "d") items.push(tk);
        });
      });
    }
    const had = Object.prototype.hasOwnProperty.call(ctx.forVars, node.v);
    const prev = ctx.forVars[node.v];
    let code = 0;
    const fr = ctx.frame;
    for (const it of items) {
      if (Array.isArray(it)) { it.forEach((val, k) => { ctx.forVars[String.fromCharCode(node.v.charCodeAt(0) + k)] = val; }); }
      else ctx.forVars[node.v] = it;
      // with echo on, cmd.exe shows each command the loop runs (unless it starts with @)
      if (sh.echo && node.bodyText && !node.bodyText.startsWith("@")) {
        ctx.screen.push({ t: "out", text: "" });
        ctx.screen.push({ t: "cmd", p: prompt(sh), c: sub(node.bodyText, ctx).replace(/\n\s*/g, " ").trim() });
      }
      code = yield* exec(node.body, ctx, io);
      if (fr && (fr.jump || fr.exit)) break;
      if (ctx.aborted) break;
    }
    if (had) ctx.forVars[node.v] = prev; else delete ctx.forVars[node.v];
    return code;
  }

  function* forFItems(node, set, ctx, io, lines) {
    const sh = ctx.sh;
    const o = { tokens: [1], star: false, delims: " \t", skip: 0, eol: ";", usebackq: false };
    const os = node.opts || "";
    const tm = os.match(/tokens=([^\s]+)/i);
    if (tm) {
      const spec = tm[1];
      o.star = spec.endsWith("*");
      const list = [];
      spec.replace(/\*$/, "").split(",").filter(Boolean).forEach((p) => {
        const r = p.split("-").map((x) => parseInt(x, 10));
        if (r.length === 2) for (let k = r[0]; k <= r[1]; k++) list.push(k); else list.push(r[0]);
      });
      o.tokens = list.length ? list : [];
    }
    const dm = os.match(/delims=(.*?)(?=\s+(?:tokens|skip|eol|usebackq)=?|$)/i);
    if (dm) o.delims = dm[1];
    const sm = os.match(/skip=(\d+)/i); if (sm) o.skip = +sm[1];
    const em = os.match(/eol=(.)/i); if (em) o.eol = em[1];
    if (/usebackq/i.test(os)) o.usebackq = true;
    const src = set.trim();
    let text = [];
    const isStr = o.usebackq ? /^".*"$/.test(src) : /^".*"$/.test(src);
    const isCmd = o.usebackq ? /^`.*`$/.test(src) : /^'.*'$/.test(src);
    if (isStr && !o.usebackq) text = [src.slice(1, -1)];
    else if (o.usebackq && /^'.*'$/.test(src)) text = [src.slice(1, -1)];
    else if (isCmd) {
      const arr = [];
      const n = parseStmt(src.slice(1, -1));
      yield* exec(n, ctx, { stdin: null, stdout: { kind: "buf", arr }, stderr: io.stderr });
      text = arr;
    } else {
      const files = tokenize(src).map((t) => t.v);
      for (const f of files) {
        const r = R(sh, P(sh, f));
        if (!r.node || r.node.type !== "file") { err(lines, `The system cannot find the file ${f}.`); return null; }
        text = text.concat(VFS.linesOf(r.node) || []);
      }
    }
    const items = [];
    text.slice(o.skip).forEach((line) => {
      if (!line || line.startsWith(o.eol)) return;
      let parts;
      if (!o.delims) parts = [line];
      else {
        const re = new RegExp("[" + o.delims.replace(/[\]\\^-]/g, "\\$&") + "]+");
        parts = line.replace(new RegExp("^[" + o.delims.replace(/[\]\\^-]/g, "\\$&") + "]+"), "").split(re);
      }
      const vals = o.tokens.map((k) => parts[k - 1] || "");
      if (o.star) {
        const maxT = o.tokens.length ? Math.max(...o.tokens) : 0;
        // rest of the line after token maxT
        let idx = 0, count = 0, s = line;
        if (maxT > 0) {
          const re2 = new RegExp("[^" + o.delims.replace(/[\]\\^-]/g, "\\$&") + "]+", "g");
          let m;
          while ((m = re2.exec(s))) { count++; if (count === maxT) { idx = m.index + m[0].length; break; } }
          vals.push(s.slice(idx).replace(new RegExp("^[" + o.delims.replace(/[\]\\^-]/g, "\\$&") + "]+"), ""));
        } else vals.push(s);
      }
      if (!vals.length || vals[0] === "" && o.tokens.length && !o.star) { if (!parts.filter(Boolean).length) return; }
      items.push(vals.length === 1 ? vals[0] : vals);
    });
    return items;
  }

  /* open redirections for a command or block */
  function* openRedirs(redirs, ctx, io) {
    const sh = ctx.sh;
    let stdin = io.stdin, stdout = io.stdout, stderr = io.stderr;
    const files = [];
    const lines = [];
    for (const r0 of redirs) {
      const r = Object.assign({}, r0, { target: r0.target != null ? sub(r0.target, ctx) : null });
      if (r.dup) { if (r.fd === 2) stderr = "dup"; continue; }
      const tl = (r.target || "").toLowerCase();
      if (r.fd === 0) {
        if (tl === "nul") { stdin = []; continue; }
        const n = R(sh, P(sh, r.target)).node;
        if (!n || n.type !== "file") { err(lines, "The system cannot find the file specified."); flushTo(ctx, lines, { stdout: SCREEN, stderr: SCREEN }); return null; }
        stdin = (VFS.linesOf(n) || []).slice();
        continue;
      }
      let target;
      if (tl === "nul") target = { kind: "nul" };
      else if (tl === "con") target = SCREEN;
      else {
        const p = P(sh, r.target);
        const dir = parentOf(sh, p.drive, p.parts);
        const name = p.parts[p.parts.length - 1];
        if (!dir || dir.type !== "dir" || !name) { err(lines, "The system cannot find the path specified."); flushTo(ctx, lines, { stdout: SCREEN, stderr: SCREEN }); return null; }
        if (denyWrite(sh, p.drive, p.parts)) { err(lines, "Access is denied."); note(lines, msg("system_write")); flushTo(ctx, lines, { stdout: SCREEN, stderr: SCREEN }); return null; }
        const ex = dir.children[name.toLowerCase()];
        if (ex && ex.type === "dir") { err(lines, "Access is denied."); flushTo(ctx, lines, { stdout: SCREEN, stderr: SCREEN }); return null; }
        if (ex && ex.attrs && ex.attrs.r) { err(lines, "Access is denied."); flushTo(ctx, lines, { stdout: SCREEN, stderr: SCREEN }); return null; }
        if (r.mode === "w") VFS.writeFile(dir, name, "", false);
        else if (!ex) VFS.writeFile(dir, name, "", false);
        target = { kind: "file", dir, name, acc: [] };
        files.push(target);
      }
      if (r.fd === 1) stdout = target; else stderr = target;
    }
    if (stderr === "dup") stderr = "dup";
    return { io: { stdin, stdout, stderr: stderr === "dup" ? "dup" : stderr }, files };
  }
  function closeRedirs(ctx, rio) {
    rio.files.forEach((f) => {
      if (f.acc.length) VFS.writeFile(f.dir, f.name, f.acc.join("\n") + "\n", true);
    });
  }

  function* execCmd(node, ctx, io) {
    const sh = ctx.sh;
    const text = sub(node.text, ctx);
    const rio = yield* openRedirs(node.redirs, ctx, io);
    if (!rio) { sh.errorlevel = 1; return 1; }
    const cio = rio.io;
    if (cio.stderr === "dup") cio.stderr = cio.stdout;
    const lines = [];
    const rec = { raw: text.trim(), input: ctx.raw, name: null, args: [], switches: [], ok: false, line: ctx.info, redirs: node.redirs.map(redirKey) };
    let code = 0, keep = false;
    try {
      const res = yield* dispatch(ctx, text, cio, lines, rec);
      code = res.code; keep = res.keep;
    } finally {
      flushTo(ctx, lines, cio);
      closeRedirs(ctx, rio);
    }
    if (!keep) sh.errorlevel = code;
    rec.ok = code === 0; rec.code = code;
    if (rec.name) { ctx.recs.push(rec); sh.log.push(rec); }
    return code;
  }

  /* run a command function, answering its questions from piped input if any */
  function* drive(it, ctx, io, lines) {
    let r = it.next();
    while (!r.done) {
      flushTo(ctx, lines, io);
      const req = r.value;
      let ans;
      if (req.kind !== "sleep" && io.stdin && !req.noStdin) {
        ans = io.stdin.length ? io.stdin.shift() : "";
        if (req.kind === "key") ans = ans.slice(0, 1);
        ctx.screen.push({ t: "out", text: (req.prompt || "") + ans });
      } else {
        ans = yield req;
        ctx.steps = 0;
      }
      r = it.next(ans);
    }
    return r.value;
  }
  function codeOf(v) { return v === true || v == null ? 0 : v === false ? 1 : v; }

  const GUI = { notepad: "Notepad", calc: "Calculator", explorer: "File Explorer", mspaint: "Paint", control: "Control Panel", taskmgr: "Task Manager", msconfig: "System Configuration", regedit: "Registry Editor", mmc: "Microsoft Management Console", write: "WordPad", charmap: "Character Map", devmgmt: "Device Manager", "devmgmt.msc": "Device Manager", "services.msc": "Services", "diskmgmt.msc": "Disk Management", ncpa: "Network Connections", "ncpa.cpl": "Network Connections", winver: "About Windows" };
  const DANGEROUS = ["format", "diskpart", "bootrec", "taskkill", "robocopy", "chkdsk", "shutdown", "del", "rd", "rmdir", "erase", "bcdedit", "cipher", "reg"];

  function* dispatch(ctx, text, io, lines, rec) {
    const sh = ctx.sh;
    let t = text.replace(/^[\s@]+/, "").replace(/\s+$/, (m) => (/^(echo|set)\b/i.test(text.trim()) ? m : ""));
    if (!t.trim()) return { code: 0, keep: true };
    if (t.startsWith(":")) return { code: 0, keep: true };   // label or :: comment

    if (/^[a-zA-Z]:\\[^>]*>/.test(t)) { rec.name = "?"; note(lines, msg("typed_prompt")); return { code: 1 }; }

    // Drive switch: "D:"
    const dm = t.match(/^([a-zA-Z]):\s*$/);
    if (dm) {
      const L = dm[1].toUpperCase();
      rec.name = "drive"; rec.args = [L + ":"];
      if (!VFS.getDrive(sh.fs, L)) { err(lines, "The system cannot find the drive specified."); note(lines, msg("drive_not_found", { drive: L, list: driveList(sh) })); return { code: 1 }; }
      sh.drive = L; rec.target = cwdPath(sh); return { code: 0 };
    }

    const firstTok = (t.match(/^"[^"]*"|^[^\s]+/) || [""])[0];
    const firstClean = firstTok.replace(/"/g, "");

    if (/[\u0600-\u06FF]/.test(firstTok)) {
      rec.name = firstTok;
      notRecognized(lines, firstTok);
      note(lines, msg("persian_kb"));
      return { code: 9009 };
    }

    // explicit file: script.bat, .\run.cmd, C:\Windows\System32\ping.exe
    const tokRest = t.slice(firstTok.length);
    if (/\.(bat|cmd|exe|com)$/i.test(firstClean) || /[\\]/.test(firstClean)) {
      const fr = fileCommand(sh, firstClean);
      if (fr) {
        if (fr.kind === "batch") {
          rec.name = "batch"; rec.args = [fr.path];
          const code = yield* runBatch(ctx, fr, parseBatchArgs(tokRest), io);
          return { code, keep: true };
        }
        if (fr.kind === "exe") {
          const base = fr.node.name.replace(/\.(exe|com)$/i, "").toLowerCase();
          if (COMMANDS[base]) { return yield* runCommand(ctx, COMMANDS[base], tokRest, io, lines, rec); }
          rec.name = base;
          return guiApp(lines, base, tokRest, sh);
        }
      } else if (/[\\]/.test(firstClean) || /\.(bat|cmd)$/i.test(firstClean)) {
        rec.name = firstClean;
        notRecognized(lines, firstClean);
        note(lines, msg("file_cmd_missing", { name: firstClean }));
        return { code: 9009 };
      }
    }

    const m = t.match(/^([^\s\\\/.,;=(+"]+)(.*)$/s);
    let name = (m ? m[1] : firstTok).toLowerCase();
    let rest = m ? m[2] : "";
    if (/^\.(exe|com)\b/i.test(rest) && COMMANDS[name]) rest = rest.replace(/^\.(exe|com)/i, "");
    rec.name = name;

    const c = COMMANDS[name];
    if (c) {
      if (rest && !/^\s/.test(rest) && name !== "echo") rest = " " + rest;
      return yield* runCommand(ctx, c, rest, io, lines, rec);
    }

    // a batch file without extension: current folder first, then every folder in PATH
    const fr = findOnPath(sh, firstClean);
    if (fr && fr.kind === "batch") {
      rec.name = "batch"; rec.args = [fr.path];
      const code = yield* runBatch(ctx, fr, parseBatchArgs(tokRest), io);
      return { code, keep: true };
    }

    if (GUI[name] || GUI[firstClean.toLowerCase()]) return guiApp(lines, name, rest, sh);

    if (DANGEROUS.includes(name)) {
      warn(lines, msg("danger", { cmd: name }));
      if (LESSON_OF[name]) note(lines, msg("later_lesson", { cmd: name, n: LESSON_OF[name] }));
      return { code: 1 };
    }

    notRecognized(lines, firstTok);
    const here = VFS.resolve(sh.fs, sh.drive, sh.cwd[sh.drive] || []).node;
    const folder = here && here.children[t.replace(/"/g, "").trim().toLowerCase()];
    if (folder && folder.type === "dir") note(lines, msg("folder_not_command", { name: folder.name }));
    else if (folder && folder.type === "file") note(lines, msg("file_not_command", { name: folder.name }));
    else {
      const known = Object.keys(COMMANDS).filter((k) => !COMMANDS[k].hidden);
      let best = null, bestD = 3;
      known.forEach((k) => { const d = levenshtein(name, k); if (d < bestD) { bestD = d; best = k; } });
      note(lines, msg("not_recognized") + (best && bestD <= 2 ? " " + msg("suggest", { cmd: best }) : ""));
    }
    return { code: 9009 };
  }

  function notRecognized(lines, word) {
    err(lines, `'${word}' is not recognized as an internal or external command,`);
    err(lines, "operable program or batch file.");
  }
  function driveList(sh) { return Object.keys(sh.fs.drives).sort().map((d) => "`" + d + ":`").join(" ، "); }

  function guiApp(lines, name, rest, sh) {
    const label = GUI[name] || name;
    note(lines, msg("gui_app", { app: label }));
    if (name === "notepad" && rest.trim()) {
      const r = R(sh, P(sh, rest.trim()));
      if (r.node && r.node.type === "file" && !r.node.binary) note(lines, msg("notepad_hint", { name: r.node.name }));
    }
    return { code: 0 };
  }

  function* runCommand(ctx, c, rest, io, lines, rec) {
    const sh = ctx.sh;
    rec.name = c.name;
    rest = unescape(rest);
    if (c.admin && !sh.admin && !/\/\?/.test(rest)) {
      const res = c.admin === true ? null : c.admin(rest);
      if (res !== false) {
        err(lines, c.adminError || "Access is denied.");
        note(lines, msg("need_admin", { cmd: c.name }));
        return { code: 5 };
      }
    }
    if (c.winre && sh.mode !== "winre") {
      notRecognized(lines, c.name);
      note(lines, msg("winre_only", { cmd: c.name }));
      return { code: 9009 };
    }
    // default record of arguments and switches; commands may refine them
    { const pa = parseArgs(rest); rec.args = pa.args; rec.switches = pa.sw.concat(pa.args.filter((a) => /^-[a-z?]+$/i.test(a)).map((a) => a.toLowerCase())); }
    let res = c.run(sh, rest, lines, rec, io, ctx);
    if (res && typeof res.next === "function") res = yield* drive(res, ctx, io, lines);
    return { code: codeOf(res), keep: !!c.keep && res !== false };
  }

  function fileCommand(sh, path) {
    const p = P(sh, path);
    const r = R(sh, p);
    if (!r.node || r.node.type !== "file") return null;
    const kind = /\.(bat|cmd)$/i.test(r.node.name) ? "batch" : /\.(exe|com)$/i.test(r.node.name) ? "exe" : null;
    if (!kind) return null;
    return { kind, node: r.node, path: VFS.fmt(p.drive, r.canonical) };
  }
  function findOnPath(sh, name) {
    if (/[\\:]/.test(name)) return null;
    const dirs = [""].concat((getVar(sh, "PATH") || "").split(";").filter(Boolean));
    const names = /\.(bat|cmd)$/i.test(name) ? [name] : [name + ".bat", name + ".cmd"];
    for (const d of dirs) {
      for (const n of names) {
        const f = fileCommand(sh, d ? d.replace(/\\$/, "") + "\\" + n : n);
        if (f && f.kind === "batch") return f;
      }
    }
    return null;
  }
  function parseBatchArgs(rest) {
    const args = [];
    let cur = "", inQ = false, has = false;
    for (const c of rest) {
      if (c === '"') { inQ = !inQ; cur += c; has = true; continue; }
      if (!inQ && /[\s,;=]/.test(c)) { if (has) args.push(cur); cur = ""; has = false; continue; }
      cur += c; has = true;
    }
    if (has) args.push(cur);
    return args;
  }

  /* ---------- batch files ---------- */
  function* runBatch(ctx, file, args, io) {
    const sh = ctx.sh;
    const content = VFS.textOf(file.node) || "";
    const lines = content.split("\n").map((l) => l.replace(/\r$/, ""));
    const labels = {}, labelAt = {};
    lines.forEach((l, i) => {
      const t = l.trim();
      if (t.startsWith(":") && !t.startsWith("::")) {
        const nm = t.slice(1).split(/[\s+=,;:]/)[0].toLowerCase();
        if (nm && !(nm in labels)) labels[nm] = i;
        if (nm) (labelAt[nm] = labelAt[nm] || []).push(i);
      }
    });
    const outer = !ctx.frame;
    const frame = { path: file.path, args: [file.path].concat(args), lines, labels, labelAt, pc: 0, jump: null, exit: false, locals: 0, parent: ctx.frame };
    const prev = ctx.frame;
    ctx.frame = frame;
    ctx.depth = (ctx.depth || 0) + 1;
    if (ctx.depth > 30) { err(ctx.screen, "******  B A T C H   R E C U R S I O N  exceeds STACK limits ******"); ctx.aborted = true; ctx.depth--; ctx.frame = prev; return 1; }
    const prevForVars = ctx.forVars;
    ctx.forVars = {};
    try {
      yield* runFrame(ctx, frame, io);
    } finally {
      while (frame.locals > 0) { endLocal(sh); frame.locals--; }
      ctx.forVars = prevForVars;
      ctx.frame = prev;
      ctx.depth--;
      if (outer) sh.echo = sh.promptEcho !== false;
    }
    return sh.errorlevel;
  }

  function* runFrame(ctx, frame, io) {
    const sh = ctx.sh;
    while (frame.pc < frame.lines.length && !ctx.aborted) {
      let text = frame.lines[frame.pc]; frame.pc++;
      while (/\^$/.test(text) && frame.pc < frame.lines.length) { text = text.slice(0, -1) + frame.lines[frame.pc]; frame.pc++; }
      while (parenBalance(text) > 0 && frame.pc < frame.lines.length) { text += "\n" + frame.lines[frame.pc]; frame.pc++; }
      const tr = text.trim();
      if (!tr || tr.startsWith(":")) continue;
      const quiet = tr.startsWith("@");
      // like cmd.exe, an echoed command line is preceded by an empty line
      if (sh.echo && !quiet) { ctx.screen.push({ t: "out", text: "" }); ctx.screen.push({ t: "cmd", p: prompt(sh), c: tr.replace(/\n\s*/g, " ") }); }
      const expanded = expandPercent(text, sh, frame);
      let node;
      try { node = parseStmt(expanded); }
      catch (e) {
        if (e && e.syntax) { err(ctx.screen, e.syntax === "missing )" ? "( was unexpected at this time." : e.syntax); note(ctx.screen, msg("batch_syntax", { line: frame.pc })); frame.exit = true; ctx.aborted = true; break; }
        throw e;
      }
      if (!node) continue;
      // record which operators (if, for, |, &&...) each script line used
      const outerInfo = ctx.info;
      ctx.info = lineInfo(node);
      try { yield* exec(node, ctx, io); } finally { ctx.info = outerInfo; }
      if (frame.exit) break;
      if (frame.jump) {
        const L = frame.jump; frame.jump = null;
        if (L === "eof") break;
        // like cmd.exe: search down from the next line, then wrap to the top
        const all = (frame.labelAt && frame.labelAt[L]) || [];
        const idx = all.length ? (all.find((k) => k >= frame.pc) ?? all[0]) : frame.labels[L];
        if (idx == null) { err(ctx.screen, `The system cannot find the batch label specified - ${L}`); ctx.aborted = true; break; }
        frame.pc = idx + 1;
      }
    }
  }
  function endLocal(sh) {
    const top = sh.localStack.pop();
    if (top) { sh.env = top.env; sh.delayed = top.delayed; }
  }

  /* ---------- top-level API ---------- */
  function newCtx(sh, raw) {
    return { sh, screen: [], recs: [], frame: null, forVars: {}, steps: 0, raw, clear: false, info: null };
  }

  function* execTop(ctx, input) {
    const sh = ctx.sh;
    const expanded = expandPercent(input, sh, null);
    let node;
    try { node = parseStmt(expanded); }
    catch (e) {
      if (e && e.syntax) {
        ctx.screen.push({ t: "err", text: e.syntax === "missing )" ? "More? (missing ')')" : e.syntax });
        if (e.syntax === "missing )") note(ctx.screen, msg("missing_paren"));
        if (/%%/.test(input)) note(ctx.screen, msg("double_percent"));
        ctx.recs.push({ raw: input, name: "?", args: [], switches: [], ok: false, code: 1, syntaxError: true });
        sh.errorlevel = 1;
        return;
      }
      throw e;
    }
    ctx.info = lineInfo(node);
    yield* exec(node, ctx, { stdin: null, stdout: SCREEN, stderr: SCREEN });
  }

  function step(sh, ctx, gen, val) {
    let r;
    try { r = gen.next(val); }
    catch (e) {
      if (e && e.loop) { ctx.screen.push({ t: "err", text: "^C" }); note(ctx.screen, msg("loop_guard")); }
      else { ctx.screen.push({ t: "err", text: "Simulator error: " + (e && e.message ? e.message : e) }); if (typeof console !== "undefined") console.error(e); }
      r = { done: true };
    }
    const res = { lines: ctx.screen, clear: ctx.clear, recs: ctx.recs, rec: ctx.recs[ctx.recs.length - 1] || null, info: ctx.info };
    if (!r.done) { sh.pending = { gen, ctx, req: r.value }; res.wait = r.value; }
    else { sh.pending = null; res.done = true; }
    return res;
  }

  /* Run one line typed by the learner, or answer a pending question. */
  function run(sh, rawLine) {
    if (sh.pending) {
      const { gen, ctx } = sh.pending;
      ctx.screen = []; ctx.recs = []; ctx.clear = false; ctx.steps = 0;
      return step(sh, ctx, gen, rawLine == null ? "" : String(rawLine));
    }
    const line = String(rawLine || "").replace(/\u200c/g, "").replace(/\s+$/, "");
    if (!line.trim()) return { lines: [], clear: false, rec: null, recs: [], done: true };
    sh.history.push(line);
    const ctx = newCtx(sh, line);
    return step(sh, ctx, execTop(ctx, line));
  }

  /* Ctrl+C: stop whatever is waiting */
  function cancel(sh) {
    if (!sh.pending) return null;
    sh.pending = null;
    sh.echo = sh.promptEcho !== false;
    while (sh.localStack.length) endLocal(sh);
    return { lines: [{ t: "err", text: "^C" }], done: true, recs: [] };
  }

  /* For tests and automatic checks: run a line, answering questions from a list. */
  function runAll(sh, line, answers = [], opts = {}) {
    const all = [];
    const recs = [];
    let r = run(sh, line);
    let guard = 0;
    while (true) {
      if (r.clear) all.length = 0;
      all.push(...r.lines); recs.push(...(r.recs || []));
      if (!r.wait) break;
      if (++guard > 500) { cancel(sh); break; }
      if (r.wait.kind === "sleep") r = run(sh, "");
      else if (answers.length) {
        const a = answers.shift();
        all.push({ t: "out", text: (r.wait.prompt || "") + a, answer: true });
        r = run(sh, a);
      } else if (opts.defaultAnswer != null) {
        all.push({ t: "out", text: (r.wait.prompt || "") + opts.defaultAnswer, answer: true });
        r = run(sh, opts.defaultAnswer);
      }
      else { cancel(sh); all.push({ t: "err", text: "^C" }); break; }
    }
    return { lines: all, recs, text: all.filter((l) => l.t === "out" || l.t === "err" || l.t === "cmd").map((l) => (l.t === "cmd" ? l.p + l.c : l.text)).join("\n") };
  }

  function banner() {
    return [
      { t: "out", text: "Microsoft Windows [Version 10.0.22631.4317]" },
      { t: "out", text: "(c) Microsoft Corporation. All rights reserved." },
      { t: "out", text: "" },
    ];
  }

  /* helpers shared with the command files */
  const lib = {
    out, err, note, warn, msg, tokenize, parseArgs, hasSw, fmtTime, num, P, R, full, expand, parentOf, inUse, isSystem, denyWrite, showUsage, ask,
    getVar, setVar, findKey, cwdPath, prompt, applyVarMod, stripQ, parseStmt, exec, runBatch, fileCommand, parseBatchArgs,
    endLocal, dateStr, timeStr, notRecognized, lessonOf, driveList, codeOf, runFrame, sub, notRecognizedMsg: notRecognized,
  };

  // after ECHO OFF at the prompt, cmd.exe shows no prompt
  const visiblePrompt = (sh) => (sh.promptEcho === false ? "" : prompt(sh));
  return { create, run, runAll, cancel, prompt: visiblePrompt, cwdPath, setLocation, setMessages, setLessonIndex, banner, COMMANDS, def, lib, getVar };
})();
