/* ============================================================
   engine/cmd-text.js — text filters: find findstr sort more
   They read files, or the output of the previous command (|)
   ============================================================ */
(() => {
  const { def, lib, COMMANDS } = Shell;
  const { out, err, note, msg, tokenize, P, R, full, expand, showUsage, ask } = lib;

  function fileLines(sh, raw, lines) {
    const e = expand(sh, raw);
    if (!e.items.length) return null;
    return e.items.filter((it) => it.node.type === "file").map((it) => ({ name: it.node.name, path: VFS.fmt(e.drive, it.parts), lines: VFS.linesOf(it.node) || [] }));
  }

  /* ---------------- FIND ---------------- */
  def("find", [], {
    summary: "Searches for a text string in a file or files.",
    usage: "Searches for a text string in a file or files.\n\nFIND [/V] [/C] [/N] [/I] \"string\" [[drive:][path]filename[ ...]]\n\n  /V         Displays all lines NOT containing the specified string.\n  /C         Displays only the count of lines containing the string.\n  /N         Displays line numbers with the displayed lines.\n  /I         Ignores the case of characters when searching for the string.\n  \"string\"   Specifies the text string to find.\n  [drive:][path]filename\n             Specifies a file or files to search.\n\nIf a path is not specified, FIND searches the text typed at the prompt\nor piped from another command.",
  }, (sh, rest, lines, rec, io) => {
    const toks = tokenize(rest);
    const sw = [], files = [];
    let str = null;
    for (const t of toks) {
      if (!t.q && /^\/[vcni]$/i.test(t.v)) { sw.push(t.v.toLowerCase()); continue; }
      if (!t.q && t.v === "/?") { showUsage(lines, COMMANDS.find); return true; }
      if (!t.q && t.v.startsWith("/")) { err(lines, `FIND: Invalid switch`); return 2; }
      if (str === null) {
        if (!t.q) { err(lines, "FIND: Parameter format not correct"); note(lines, msg("find_quotes")); return 2; }
        str = t.v; continue;
      }
      files.push(t.v);
    }
    rec.args = [str].concat(files); rec.switches = sw;
    if (str === null) { err(lines, "FIND: Parameter format not correct"); note(lines, msg("find_quotes")); return 2; }
    const V = sw.includes("/v"), Cc = sw.includes("/c"), N = sw.includes("/n"), I = sw.includes("/i");
    // Like real FIND, an empty string matches no line, so `find /v /c ""` counts every line.
    const has = (l) => str !== "" && (I ? l.toLowerCase().includes(str.toLowerCase()) : l.includes(str));
    let matched = 0;
    const doLines = (arr, header) => {
      const res = [];
      arr.forEach((l, k) => { if (has(l) !== V) res.push(N ? `[${k + 1}]${l}` : l); });
      matched += res.length;
      if (Cc) { out(lines, header ? `${header}: ${res.length}` : String(res.length)); return; }
      if (header) out(lines, header);
      res.forEach((l) => out(lines, l));
    };
    if (files.length) {
      let ok = true;
      files.forEach((f) => {
        const fl = fileLines(sh, f, lines);
        if (!fl || !fl.length) { err(lines, `File not found - ${f.toUpperCase()}`); ok = false; return; }
        fl.forEach((x) => { if (!Cc) out(lines, ""); doLines(x.lines, `---------- ${x.name.toUpperCase()}`); });
      });
      if (!ok && !matched) return 1;
    } else {
      if (!io.stdin) { note(lines, msg("find_no_input")); return 1; }
      doLines(io.stdin.splice(0), null);
    }
    rec.matched = matched;
    return matched ? 0 : 1;
  });

  /* ---------------- FINDSTR ---------------- */
  function findstrRegex(p, I) {
    // findstr regular expressions: . * ^ $ [class] \< \> and \x escapes
    let s = "";
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === "\\") {
        const n = p[i + 1];
        if (n === "<" || n === ">") { s += "\\b"; i++; continue; }
        if (n) { s += "\\" + n; i++; continue; }
        s += "\\\\"; continue;
      }
      if (c === "[") { const e = p.indexOf("]", i + 1); if (e > i) { s += p.slice(i, e + 1); i = e; continue; } }
      if (".*^$".includes(c)) { s += c; continue; }
      s += c.replace(/[+?(){}|\]]/g, "\\$&");
    }
    try { return new RegExp(s, I ? "i" : ""); } catch (e) { return new RegExp(s.replace(/[[\]]/g, "\\$&"), I ? "i" : ""); }
  }

  def("findstr", [], {
    summary: "Searches for strings in files (supports several words and patterns).",
    usage: "Searches for strings in files.\n\nFINDSTR [/B] [/E] [/L] [/R] [/S] [/I] [/X] [/V] [/N] [/M] [/C:string] strings [[drive:][path]filename[ ...]]\n\n  /B         Matches pattern if at the beginning of a line.\n  /E         Matches pattern if at the end of a line.\n  /L         Uses search strings literally.\n  /R         Uses search strings as regular expressions.\n  /S         Searches for matching files in the current directory and all\n             subdirectories.\n  /I         Specifies that the search is not to be case-sensitive.\n  /X         Prints lines that match exactly.\n  /V         Prints only lines that do not contain a match.\n  /N         Prints the line number before each line that matches.\n  /M         Prints only the filename if a file contains a match.\n  /C:string  Uses specified string as a literal search string.\n  strings    Text to be searched for.\n\nUse spaces to separate multiple search strings unless the argument is prefixed\nwith /C.  For example, 'FINDSTR \"hello there\" x.y' searches for \"hello\" or\n\"there\" in file x.y.  'FINDSTR /C:\"hello there\" x.y' searches for\n\"hello there\" in file x.y.\n\nRegular expression quick reference:\n  .        Wildcard: any character\n  *        Repeat: zero or more occurrences of previous character or class\n  ^        Line position: beginning of line\n  $        Line position: end of line\n  [class]  Character class: any one character in set\n  \\<xyz    Word position: beginning of word\n  xyz\\>    Word position: end of word",
  }, (sh, rest, lines, rec, io) => {
    const toks = tokenize(rest);
    const sw = new Set(), patterns = [], files = [];
    let gotStrings = false, cLiteral = false;
    for (const t of toks) {
      const v = t.v;
      if (/^\/c:/i.test(v)) { patterns.push(v.slice(3)); gotStrings = true; cLiteral = true; continue; }
      if (!t.q && v === "/?") { showUsage(lines, COMMANDS.findstr); return true; }
      if (!t.q && /^\/[a-z]+$/i.test(v)) { v.slice(1).toLowerCase().split("").forEach((c) => sw.add(c)); continue; }
      if (!gotStrings) { v.split(/\s+/).filter(Boolean).forEach((x) => patterns.push(x)); gotStrings = true; continue; }
      files.push(v);
    }
    rec.args = patterns.concat(files); rec.switches = Array.from(sw).map((c) => "/" + c);
    if (!patterns.length) { err(lines, "FINDSTR: Bad command line"); note(lines, msg("syntax", { cmd: "findstr" })); return 2; }
    const I = sw.has("i"), V = sw.has("v"), N = sw.has("n"), M = sw.has("m"), Bb = sw.has("b"), E = sw.has("e"), X = sw.has("x"), S = sw.has("s");
    const literal = sw.has("l") || (cLiteral && !sw.has("r"));
    const tests = patterns.map((pt) => {
      if (literal) {
        const q = I ? pt.toLowerCase() : pt;
        return (l) => {
          const s = I ? l.toLowerCase() : l;
          if (X) return s === q;
          if (Bb) return s.startsWith(q);
          if (E) return s.endsWith(q);
          return s.includes(q);
        };
      }
      let src = pt;
      if (X) src = "^" + src + "$"; else { if (Bb) src = "^" + src; if (E) src = src + "$"; }
      const re = findstrRegex(src, I);
      return (l) => re.test(l);
    });
    const hit = (l) => tests.some((t) => t(l)) !== V;
    let matched = 0;
    if (files.length) {
      const targets = [];
      files.forEach((f) => {
        if (S) {
          const p = P(sh, f);
          const pattern = p.parts[p.parts.length - 1] || "*";
          const dirParts = p.parts.slice(0, -1);
          const base = VFS.resolve(sh.fs, p.drive, dirParts);
          if (!base.node) return;
          const re = VFS.wildcardToRegex(pattern);
          const relBase = /[\\:]/.test(f) ? null : base.canonical.length;
          const visit = (node, parts) => {
            VFS.sortedChildren(node).forEach((c) => {
              if (c.type === "file" && re.test(c.name) && !c.binary) targets.push({ name: relBase != null ? parts.slice(relBase).concat(c.name).join("\\") : VFS.fmt(p.drive, parts.concat(c.name)), lines: VFS.linesOf(c) || [] });
              if (c.type === "dir" && !(c.attrs && c.attrs.h)) visit(c, parts.concat(c.name));
            });
          };
          visit(base.node, base.canonical);
        } else {
          const fl = fileLines(sh, f, lines);
          if (!fl || !fl.length) { err(lines, `FINDSTR: Cannot open ${f}`); return; }
          fl.forEach((x) => targets.push({ name: /[*?]/.test(f) || files.length > 1 ? x.name : null, lines: x.lines }));
        }
      });
      const showName = S || targets.length > 1 || targets.some((t) => t.name);
      targets.forEach((tg) => {
        let fileHit = false;
        tg.lines.forEach((l, k) => {
          if (!hit(l)) return;
          matched++;
          if (M) { if (!fileHit) out(lines, tg.name || ""); fileHit = true; return; }
          out(lines, (showName && tg.name ? tg.name + ":" : "") + (N ? (k + 1) + ":" : "") + l);
        });
      });
    } else {
      if (!io.stdin) { note(lines, msg("find_no_input")); return 1; }
      io.stdin.splice(0).forEach((l, k) => { if (hit(l)) { matched++; out(lines, (N ? (k + 1) + ":" : "") + l); } });
    }
    rec.matched = matched;
    return matched ? 0 : 1;
  });

  /* ---------------- SORT ---------------- */
  def("sort", [], {
    summary: "Sorts input.",
    usage: "SORT [/R] [[drive1:][path1]filename1] [/O [drive2:][path2]filename2]\n\n  /R         Reverses the sort order; that is, sorts Z to A,\n             then 9 to 0.\n  [drive1:][path1]filename1\n             Specifies the file to be sorted.  If not specified, the\n             standard input is sorted.\n  /O [drive2:][path2]filename2\n             Specifies the file where the sorted input is to be stored.",
  }, (sh, rest, lines, rec, io) => {
    const toks = tokenize(rest);
    let Rv = false, outFile = null, file = null;
    for (let i = 0; i < toks.length; i++) {
      const v = toks[i].v.toLowerCase();
      if (v === "/?") { showUsage(lines, COMMANDS.sort); return true; }
      if (v === "/r") { Rv = true; continue; }
      if (v === "/o") { outFile = toks[++i] ? toks[i].v : null; continue; }
      if (v.startsWith("/")) continue;
      file = toks[i].v;
    }
    rec.args = file ? [file] : []; rec.switches = Rv ? ["/r"] : [];
    let data;
    if (file) {
      const n = R(sh, P(sh, file)).node;
      if (!n || n.type !== "file") { err(lines, "The system cannot find the file specified."); return 1; }
      data = VFS.linesOf(n) || [];
    } else {
      if (!io.stdin) { note(lines, msg("sort_no_input")); return 1; }
      data = io.stdin.splice(0);
    }
    const sorted = data.slice().sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    if (Rv) sorted.reverse();
    if (outFile) {
      const p = P(sh, outFile);
      const dir = VFS.resolve(sh.fs, p.drive, p.parts.slice(0, -1)).node;
      if (!dir) { err(lines, "The system cannot find the path specified."); return 1; }
      VFS.writeFile(dir, p.parts[p.parts.length - 1], sorted.join("\n") + (sorted.length ? "\n" : ""), false);
      return true;
    }
    sorted.forEach((l) => out(lines, l));
    return true;
  });

  /* ---------------- MORE ---------------- */
  def("more", [], {
    summary: "Displays output one screen at a time.",
    usage: "Displays output one screen at a time.\n\nMORE [drive:][path]filename\ncommand-name | MORE\n\nIf extended features are enabled, the following commands\nare accepted at the -- More -- prompt:\n\n    <space>   Display next page\n    <ret>     Display next line\n    Q         Quit",
  }, function* (sh, rest, lines, rec, io) {
    const toks = tokenize(rest);
    if (toks.length && toks[0].v === "/?") { showUsage(lines, COMMANDS.more); return true; }
    let data;
    if (toks.length) {
      data = [];
      for (const t of toks) {
        const n = R(sh, P(sh, t.v)).node;
        if (!n || n.type !== "file") { err(lines, `Cannot access file ${full(P(sh, t.v))}`); return 1; }
        data = data.concat(VFS.linesOf(n) || []);
      }
    } else {
      if (!io.stdin) { note(lines, msg("more_no_input")); return 1; }
      data = io.stdin.splice(0);
    }
    rec.args = toks.map((t) => t.v);
    const PAGE = 20;
    const toScreen = !io.stdout || io.stdout.kind === "screen";
    if (!toScreen || data.length <= PAGE) { data.forEach((l) => out(lines, l)); return true; }
    let i = 0;
    while (i < data.length) {
      const step = i === 0 ? PAGE : PAGE;
      data.slice(i, i + step).forEach((l) => out(lines, l));
      i += step;
      if (i >= data.length) break;
      const pct = Math.round((i / data.length) * 100);
      const a = yield* ask(`-- More (${pct}%) -- `, "key", { noStdin: true });
      if (/^q/i.test(a)) break;
      if (a === "" || a === "\n") { out(lines, data[i]); i++; }
    }
    return true;
  });
})();
