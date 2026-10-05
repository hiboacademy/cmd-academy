/* ============================================================
   engine/checker.js — checks a practice task or challenge against
   the sandbox state and what the learner ran, not against exact
   text. So "md X" and "mkdir X" are both accepted when folder X
   exists afterwards.
   attempt: list of command records (one per simple command)
   extra:   { output: all text printed during the attempt, lastOutput }
   ============================================================ */
const Checker = (() => {
  const norm = (s) => String(s || "").toLowerCase().replace(/\\+$/, "");
  const last = (a) => (a.length ? a[a.length - 1] : null);
  const node = (sh, path) => {
    const p = VFS.parse(path, sh.drive, sh.cwd);
    return VFS.resolve(sh.fs, p.drive, p.parts).node;
  };
  const named = (a, v) => a.filter((r) => r.name === v || (v === "cd" && r.name === "chdir"));
  const textOf = (n) => (n && n.type === "file" && !n.binary ? n.content || "" : null);

  const RULES = {
    cmd: (c, sh, a) => { const l = last(a); return !!l && l.name === c.value; },
    anyCmd: (c, sh, a) => named(a, c.value).some((r) => r.ok || c.evenIfFailed),
    ok: (c, sh, a) => { const l = last(a); return !!l && l.ok; },
    switch: (c, sh, a) => {
      const pool = c.anyRun ? a : [last(a)].filter(Boolean);
      return pool.some((r) => (r.switches || []).includes(c.value.toLowerCase()) && (!c.cmd || r.name === c.cmd));
    },
    argIncludes: (c, sh, a) => {
      const pool = c.cmd ? named(a, c.cmd) : [last(a)].filter(Boolean);
      return pool.some((r) => (r.args || []).join(" ").toLowerCase().includes(c.value.toLowerCase()));
    },
    noArgs: (c, sh, a) => { const l = last(a); return !!l && !(l.args || []).length; },
    cwd: (c, sh) => norm(Shell.cwdPath(sh)) === norm(c.value),
    drive: (c, sh) => sh.drive === c.value.toUpperCase(),
    dirExists: (c, sh) => { const n = node(sh, c.path); return !!n && n.type === "dir"; },
    dirNotExists: (c, sh) => { const n = node(sh, c.path); return !n || n.type !== "dir"; },
    fileExists: (c, sh) => { const n = node(sh, c.path); return !!n && n.type === "file"; },
    fileNotExists: (c, sh) => !node(sh, c.path),
    fileContains: (c, sh) => {
      const t = textOf(node(sh, c.path));
      if (t == null) return false;
      return [].concat(c.value).every((v) => t.toLowerCase().includes(String(v).toLowerCase()));
    },
    fileLines: (c, sh) => { const t = textOf(node(sh, c.path)); return t != null && t.replace(/\n$/, "").split("\n").filter((x) => x.trim()).length === c.value; },
    fileAttr: (c, sh) => { const n = node(sh, c.path); return !!n && !!(n.attrs && n.attrs[c.attr]) === (c.value !== false); },
    countFiles: (c, sh) => {
      const p = VFS.parse(c.path, sh.drive, sh.cwd);
      const pat = p.parts[p.parts.length - 1];
      const dir = VFS.resolve(sh.fs, p.drive, p.parts.slice(0, -1)).node;
      if (!dir) return c.value === 0;
      const re = VFS.wildcardToRegex(pat);
      const n = Object.values(dir.children).filter((x) => x.type === "file" && re.test(x.name)).length;
      return c.op === "min" ? n >= c.value : n === c.value;
    },
    usedCd: (c, sh, a) => a.some((r) => r.name === "cd" && r.ok && r.pathKind === c.value),
    usedOp: (c, sh, a) => a.some((r) => {
      const info = r.line || {};
      const ops = (info.ops || []).concat(r.redirs || [], info.redirs || []);
      return ops.includes(c.value);
    }),
    outputIncludes: (c, sh, a, x) => [].concat(c.value).every((v) => (x.output || "").toLowerCase().includes(String(v).toLowerCase())),
    outputExcludes: (c, sh, a, x) => !(x.output || "").toLowerCase().includes(String(c.value).toLowerCase()),
    lastOutputIncludes: (c, sh, a, x) => (x.lastOutput || "").toLowerCase().includes(String(c.value).toLowerCase()),
    errorlevel: (c, sh) => sh.errorlevel === c.value,
    envEquals: (c, sh) => { const v = Shell.getVar(sh, c.name); return v != null && (c.value == null || String(v).toLowerCase() === String(c.value).toLowerCase()); },
    procGone: (c, sh) => !sh.procs.some((p) => p.name.toLowerCase() === c.value.toLowerCase()),
    serviceState: (c, sh) => { const s = sh.services.find((x) => x.name.toLowerCase() === c.name.toLowerCase()); return !!s && s.state === c.value; },
    netConnected: (c, sh) => sh.net.connected === (c.value !== false),
    driveExists: (c, sh) => !!sh.fs.drives[c.value.toUpperCase()],
    driveLabel: (c, sh) => { const d = sh.fs.drives[c.drive.toUpperCase()]; return !!d && String(d.label).toLowerCase() === String(c.value).toLowerCase(); },
    driveEmpty: (c, sh) => { const d = sh.fs.drives[c.value.toUpperCase()]; return !!d && !Object.keys(d.root.children).length; },
    ranBatch: (c, sh, a) => a.some((r) => r.name === "batch"),
    dpUsed: (c, sh, a) => a.some((r) => (r.dp || []).some((l) => l.startsWith(c.value))),
    any: (c, sh, a, x) => c.of.some((sub) => evaluate([sub], sh, a, x)),
    not: (c, sh, a, x) => !evaluate([c.check], sh, a, x),
  };

  /* Returns true when every check passes. */
  function evaluate(checks, sh, attempt, extra = {}) {
    return checks.every((c) => {
      const f = RULES[c.type];
      return f ? f(c, sh, attempt, extra) : false;
    });
  }

  /* Normalize a typed answer for quiz "write the command" questions. */
  function sameCommand(input, accepted) {
    const n = (s) => String(s).trim().replace(/\s+/g, " ").toLowerCase();
    return accepted.some((a) => n(a) === n(input));
  }

  return { evaluate, sameCommand, RULES };
})();
