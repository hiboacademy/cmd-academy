/* ============================================================
   engine/checker.js — checks a practice task against the
   sandbox state, not against exact text. So "md X" and
   "mkdir X" are both accepted when the folder X exists.
   ============================================================ */
const Checker = (() => {
  const norm = (s) => String(s || "").toLowerCase().replace(/\\+$/, "");

  function last(attempt) { return attempt.length ? attempt[attempt.length - 1] : null; }

  const RULES = {
    cmd: (c, sh, a) => { const l = last(a); return !!l && l.name === c.value; },
    ok: (c, sh, a) => { const l = last(a); return !!l && l.ok; },
    switch: (c, sh, a) => { const l = last(a); return !!l && (l.switches || []).includes(c.value.toLowerCase()); },
    argIncludes: (c, sh, a) => { const l = last(a); return !!l && (l.args || []).join(" ").toLowerCase().includes(c.value.toLowerCase()); },
    noArgs: (c, sh, a) => { const l = last(a); return !!l && !(l.args || []).length; },
    cwd: (c, sh) => norm(Shell.cwdPath(sh)) === norm(c.value),
    drive: (c, sh) => sh.drive === c.value.toUpperCase(),
    dirExists: (c, sh) => {
      const p = VFS.parse(c.path, sh.drive, sh.cwd);
      const r = VFS.resolve(sh.fs, p.drive, p.parts);
      return !!r.node && r.node.type === "dir";
    },
    usedCd: (c, sh, a) => a.some((r) => r.name === "cd" && r.ok && r.pathKind === c.value),
  };

  /* Returns true when every check passes. */
  function evaluate(checks, sh, attempt) {
    return checks.every((c) => {
      const f = RULES[c.type];
      return f ? f(c, sh, attempt) : false;
    });
  }

  /* Normalize a typed answer for quiz "write the command" questions. */
  function sameCommand(input, accepted) {
    const n = (s) => String(s).trim().replace(/\s+/g, " ").toLowerCase();
    return accepted.some((a) => n(a) === n(input));
  }

  return { evaluate, sameCommand };
})();
