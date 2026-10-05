/* ============================================================
   engine/cmd-files.js — file operations on the virtual disk
   copy xcopy robocopy move ren del attrib tree fc
   ============================================================ */
(() => {
  const { def, lib, COMMANDS } = Shell;
  const { out, err, note, warn, msg, tokenize, parseArgs, P, R, full, expand, parentOf, inUse, isSystem, denyWrite, showUsage, ask, num, cwdPath } = lib;

  const fmt = VFS.fmt;
  const pad8 = (n) => String(n).padStart(9);

  /* new name for wildcard targets: copy *.txt *.bak, ren report?.txt summary?.txt */
  function mapName(src, pattern) {
    if (!/[*?]/.test(pattern)) return pattern;
    const sd = src.lastIndexOf("."), pd = pattern.lastIndexOf(".");
    const sBase = sd > 0 ? src.slice(0, sd) : src, sExt = sd > 0 ? src.slice(sd + 1) : "";
    const pBase = pd >= 0 ? pattern.slice(0, pd) : pattern, pExt = pd >= 0 ? pattern.slice(pd + 1) : null;
    const part = (s, p) => {
      let r = "";
      for (let i = 0; i < p.length; i++) {
        if (p[i] === "*") { r += s.slice(i); break; }
        if (p[i] === "?") r += s[i] || "";
        else r += p[i];
      }
      return r;
    };
    const b = part(sBase, pBase);
    if (pExt === null) return b;
    const e = part(sExt, pExt);
    return e ? b + "." + e : b;
  }

  /* collect source files: wildcard, single file, or a folder (its files) */
  function sources(sh, raw, { hidden = false, dirsToo = false } = {}) {
    const e = expand(sh, raw, { hidden });
    if (!e.items.length) return { list: [], e };
    if (e.single && e.items[0].node.type === "dir" && !dirsToo) {
      const d = e.items[0];
      const list = VFS.sortedChildren(d.node).filter((n) => n.type === "file" && (hidden || !(n.attrs && n.attrs.h)))
        .map((n) => ({ node: n, parts: d.parts.concat(n.name), drive: e.drive }));
      return { list, e, fromDir: d };
    }
    return { list: e.items.map((it) => ({ ...it, drive: e.drive })), e, wild: !e.single };
  }

  /* ---------------- COPY ---------------- */
  def("copy", [], {
    summary: "Copies one or more files to another location.",
    usage: "Copies one or more files to another location.\n\nCOPY [/Y | /-Y] source [+ source [+ ...]] [destination]\n\n  source       Specifies the file or files to be copied.\n  destination  Specifies the directory and/or filename for the new file(s).\n  /Y           Suppresses prompting to confirm you want to overwrite an\n               existing destination file.\n  /-Y          Causes prompting to confirm you want to overwrite an\n               existing destination file.\n\nTo append files, specify a single file for destination, but multiple files\nfor source (using wildcards or file1+file2+file3 format).",
  }, function* (sh, rest, lines, rec, io, ctx) {
    const { args, sw } = parseArgs(rest.replace(/\s*\+\s*/g, "+"));
    rec.args = args; rec.switches = sw;
    if (sw.includes("/?")) { showUsage(lines, COMMANDS.copy); return true; }
    if (!args.length) { err(lines, "The syntax of the command is incorrect."); note(lines, msg("syntax", { cmd: "copy" })); return false; }
    if (args.length > 2) { err(lines, "The syntax of the command is incorrect."); note(lines, msg("copy_too_many")); return false; }
    let confirm = !ctx.frame;
    if (sw.includes("/y")) confirm = false;
    if (sw.includes("/-y")) confirm = true;
    const srcSpec = args[0], destSpec = args[1] || ".";
    // concatenation a+b
    const srcParts = srcSpec.split("+").filter(Boolean);
    let list = [], wild = false, concat = srcParts.length > 1;
    for (const sp of srcParts) {
      const s = sources(sh, sp);
      if (!s.list.length) {
        if (s.e.missingDir) err(lines, "The system cannot find the path specified.");
        else { err(lines, "The system cannot find the file specified."); note(lines, msg("file_not_found")); }
        out(lines, "        0 file(s) copied.");
        return false;
      }
      if (s.wild || s.fromDir) wild = true;
      list = list.concat(s.list);
    }
    const dp = P(sh, destSpec);
    const dr = R(sh, dp);
    if (denyWrite(sh, dp.drive, dr.node ? dr.canonical : dp.parts)) { err(lines, "Access is denied."); note(lines, msg("system_write")); out(lines, "        0 file(s) copied."); return false; }
    const destIsDir = dr.node && dr.node.type === "dir";
    const destName = dp.parts[dp.parts.length - 1];
    if (!destIsDir && /[*?]/.test(destName || "")) {
      // copy *.txt *.bak
      const dirParts = dp.parts.slice(0, -1);
      const dn = VFS.resolve(sh.fs, dp.drive, dirParts);
      if (!dn.node) { err(lines, "The system cannot find the path specified."); out(lines, "        0 file(s) copied."); return false; }
      let n = 0;
      for (const f of list) {
        const nn = mapName(f.node.name, destName);
        if (wild) out(lines, f.node.name);
        const r = yield* putCopy(sh, dn.node, nn, f.node, confirm, fmt(dp.drive, dn.canonical.concat(nn)));
        if (r === "all") confirm = false;
        if (r) n++;
      }
      out(lines, `${pad8(n)} file(s) copied.`);
      rec.copied = n;
      return n > 0;
    }
    if (destIsDir) {
      let n = 0;
      for (const f of list) {
        if (sameDir(f, dp.drive, dr.canonical)) {
          err(lines, "The file cannot be copied onto itself.");
          note(lines, msg("copy_self"));
          out(lines, "        0 file(s) copied.");
          return false;
        }
        if (wild) out(lines, list.length > 1 && f.drive ? f.node.name : f.node.name);
        const r = yield* putCopy(sh, dr.node, f.node.name, f.node, confirm, fmt(dp.drive, dr.canonical.concat(f.node.name)));
        if (r === "all") confirm = false;
        if (r) n++;
      }
      out(lines, `${pad8(n)} file(s) copied.`);
      rec.copied = n;
      return n > 0;
    }
    // destination is a file name
    const parent = VFS.resolve(sh.fs, dp.drive, dp.parts.slice(0, -1));
    if (!parent.node || parent.node.type !== "dir") { err(lines, "The system cannot find the path specified."); note(lines, msg("dest_missing")); out(lines, "        0 file(s) copied."); return false; }
    if (list.length > 1 || concat) {
      // several sources into one file: CMD joins them
      const text = list.filter((f) => !f.node.binary).map((f) => (f.node.content || "")).join("");
      list.forEach((f) => out(lines, f.node.name));
      const ex = parent.node.children[destName.toLowerCase()];
      if (ex && confirm) {
        const a = yield* ask(`Overwrite ${fmt(dp.drive, parent.canonical.concat(destName))}? (Yes/No/All): `);
        if (/^n/i.test(a.trim())) { out(lines, "        0 file(s) copied."); return true; }
      }
      VFS.writeFile(parent.node, destName, text, false);
      out(lines, "        1 file(s) copied.");
      note(lines, msg("copy_concat", { n: list.length }));
      rec.copied = 1;
      return true;
    }
    const f = list[0];
    if (f.node === parent.node.children[destName.toLowerCase()]) { err(lines, "The file cannot be copied onto itself."); out(lines, "        0 file(s) copied."); return false; }
    const r = yield* putCopy(sh, parent.node, destName, f.node, confirm, fmt(dp.drive, parent.canonical.concat(destName)));
    out(lines, `${pad8(r ? 1 : 0)} file(s) copied.`);
    rec.copied = r ? 1 : 0;
    return true;
  });

  function sameDir(f, drive, parts) {
    const fp = f.parts.slice(0, -1);
    return f.drive === drive && fp.length === parts.length && fp.every((x, i) => x.toLowerCase() === parts[i].toLowerCase());
  }

  /* copy one file node into dir with a name; asks before overwriting */
  function* putCopy(sh, dir, name, node, confirm, shownPath) {
    const ex = dir.children[name.toLowerCase()];
    if (ex && ex.type === "dir") return false;
    let res = true;
    if (ex && confirm) {
      const a = (yield* ask(`Overwrite ${shownPath}? (Yes/No/All): `)).trim();
      if (/^n/i.test(a)) return false;
      if (/^a/i.test(a)) res = "all";
    }
    if (ex && ex.attrs && ex.attrs.r) return false;
    const c = VFS.copyNode(node);
    c.name = ex ? ex.name : name;
    c.t = node.t;
    c.attrs = Object.assign({}, node.attrs, { a: true, r: false });
    dir.children[name.toLowerCase()] = c;
    dir.t = VFS.nowIso();
    return res;
  }

  /* ---------------- XCOPY ---------------- */
  def("xcopy", [], {
    summary: "Copies files and directory trees.",
    usage: "Copies files and directory trees.\n\nXCOPY source [destination] [/S [/E]] [/I] [/Q] [/F] [/L] [/H] [/Y] [/-Y]\n\n  source       Specifies the file(s) to copy.\n  destination  Specifies the location and/or name of new files.\n  /S           Copies directories and subdirectories except empty ones.\n  /E           Copies directories and subdirectories, including empty ones.\n  /I           If destination does not exist and copying more than one file,\n               assumes that destination must be a directory.\n  /Q           Does not display file names while copying.\n  /F           Displays full source and destination file names while copying.\n  /L           Displays files that would be copied.\n  /H           Copies hidden and system files also.\n  /Y           Suppresses prompting to confirm you want to overwrite an\n               existing destination file.",
  }, function* (sh, rest, lines, rec, io, ctx) {
    const { args, sw } = parseArgs(rest);
    rec.args = args; rec.switches = sw;
    if (sw.includes("/?")) { showUsage(lines, COMMANDS.xcopy); return true; }
    if (!args.length) { err(lines, "Invalid number of parameters"); out(lines, "0 File(s) copied"); return 4; }
    const S = sw.includes("/s") || sw.includes("/e"), E = sw.includes("/e"), I = sw.includes("/i"), Q = sw.includes("/q"), L = sw.includes("/l"), H = sw.includes("/h"), F = sw.includes("/f");
    let confirm = !ctx.frame && !sw.includes("/y");
    if (sw.includes("/-y")) confirm = true;
    const sp = P(sh, args[0]);
    const sr = R(sh, sp);
    let baseParts, baseDrive = sp.drive, pattern = null, baseNode;
    if (sr.node && sr.node.type === "dir") { baseParts = sr.canonical; baseNode = sr.node; }
    else {
      const last = sp.parts[sp.parts.length - 1] || "";
      const pr = VFS.resolve(sh.fs, sp.drive, sp.parts.slice(0, -1));
      if (!pr.node || pr.node.type !== "dir") { err(lines, "File not found - " + last); out(lines, "0 File(s) copied"); return 4; }
      baseParts = pr.canonical; baseNode = pr.node; pattern = last;
    }
    const re = pattern ? VFS.wildcardToRegex(pattern) : null;
    const files = []; // {node, rel:[...]}
    const emptyDirs = [];
    const visit = (node, rel) => {
      const kids = VFS.sortedChildren(node);
      let any = false;
      kids.forEach((c) => {
        if (c.type === "file" && (!re || re.test(c.name)) && (H || !(c.attrs && (c.attrs.h || c.attrs.s)))) { files.push({ node: c, rel: rel.concat(c.name) }); any = true; }
      });
      if (S) kids.forEach((c) => { if (c.type === "dir" && (H || !(c.attrs && c.attrs.h))) { const before = files.length; visit(c, rel.concat(c.name)); if (files.length === before && E) emptyDirs.push(rel.concat(c.name)); } });
      return any;
    };
    visit(baseNode, []);
    if (!files.length && !emptyDirs.length) { err(lines, "File not found - " + (pattern || "*.*")); out(lines, "0 File(s) copied"); return 1; }
    const destSpec = args[1] || ".";
    const dp = P(sh, destSpec);
    let dr = R(sh, dp);
    if (denyWrite(sh, dp.drive, dr.node ? dr.canonical : dp.parts)) { err(lines, "Access denied"); note(lines, msg("system_write")); out(lines, "0 File(s) copied"); return 4; }
    let destAsDir = dr.node && dr.node.type === "dir";
    if (!dr.node) {
      const multi = files.length > 1 || (sr.node && sr.node.type === "dir") || pattern && /[*?]/.test(pattern);
      // a trailing backslash says "this is a folder", so xcopy does not ask
      if ((I && multi) || /[\\/]$/.test(destSpec)) destAsDir = true;
      else {
        const a = (yield* ask(`Does ${fmt(dp.drive, dp.parts)} specify a file name\nor directory name on the target\n(F = file, D = directory)? `, "key")).trim();
        destAsDir = /^d/i.test(a);
        if (!/^[df]/i.test(a)) return 4;
      }
      if (destAsDir && !L) { VFS.mkdirp(sh.fs, dp.drive, dp.parts); dr = R(sh, dp); }
    }
    let n = 0;
    if (!destAsDir) {
      // copy a single file to a file name
      const f = files[0];
      const parent = parentOf(sh, dp.drive, dp.parts);
      if (!parent) { err(lines, "Invalid path"); out(lines, "0 File(s) copied"); return 4; }
      if (!Q) out(lines, fmt(baseDrive, baseParts.concat(f.rel)));
      if (!L) { const r = yield* putCopy(sh, parent, dp.parts[dp.parts.length - 1], f.node, confirm, fmt(dp.drive, dp.parts)); if (r) n++; } else n++;
      out(lines, `${n} File(s) ${L ? "" : "copied"}`.trimEnd());
      rec.copied = n;
      return n ? true : 1;
    }
    for (const f of files) {
      const srcShown = fmt(baseDrive, baseParts.concat(f.rel));
      const destParts = dr.canonical ? dr.canonical.concat(f.rel) : dp.parts.concat(f.rel);
      if (!Q) out(lines, F ? `${srcShown} -> ${fmt(dp.drive, destParts)}` : srcShown);
      if (L) { n++; continue; }
      VFS.mkdirp(sh.fs, dp.drive, destParts.slice(0, -1));
      const dir = VFS.resolve(sh.fs, dp.drive, destParts.slice(0, -1)).node;
      const r = yield* putCopy(sh, dir, f.node.name, f.node, confirm, fmt(dp.drive, destParts));
      if (r === "all") confirm = false;
      if (r) n++;
    }
    if (!L) emptyDirs.forEach((rel) => VFS.mkdirp(sh.fs, dp.drive, (dr.canonical || dp.parts).concat(rel)));
    out(lines, `${n} File(s) ${L ? "" : "copied"}`.trimEnd());
    rec.copied = n;
    return n || emptyDirs.length ? true : 1;
  });

  /* ---------------- ROBOCOPY ---------------- */
  def("robocopy", [], {
    summary: "Robust file copy for folders (mirror, resume, logs).",
    usage: "-------------------------------------------------------------------------------\n   ROBOCOPY     ::     Robust File Copy for Windows\n-------------------------------------------------------------------------------\n\n             Usage :: ROBOCOPY source destination [file [file]...] [options]\n\n            source :: Source Directory (drive:\\path or \\\\server\\share\\path).\n       destination :: Destination Dir  (drive:\\path or \\\\server\\share\\path).\n              file :: File(s) to copy (names/wildcards: default is \"*.*\").\n\n /S :: copy Subdirectories, but not empty ones.\n /E :: copy subdirectories, including Empty ones.\n /MIR :: MIRror a directory tree (equivalent to /E plus /PURGE).\n /PURGE :: delete dest files/dirs that no longer exist in source.\n /MOV :: MOVe files (delete from source after copying).\n /L :: List only - don't copy, timestamp or delete any files.\n\nExit codes: 0 = no change, 1 = files copied, 2 = extra files found,\n            8 or more = at least one failure.",
    danger: true,
  }, (sh, rest, lines, rec) => {
    const { args, sw } = parseArgs(rest);
    rec.args = args; rec.switches = sw;
    if (sw.includes("/?") || args.length < 2) {
      if (args.length < 2 && !sw.includes("/?")) { out(lines, "-------------------------------------------------------------------------------"); out(lines, "   ROBOCOPY     ::     Robust File Copy for Windows"); out(lines, "-------------------------------------------------------------------------------"); out(lines, ""); err(lines, "ERROR : No Destination Directory Specified."); note(lines, msg("robocopy_usage")); return 16; }
      showUsage(lines, COMMANDS.robocopy); return true;
    }
    const mir = sw.includes("/mir"), E = sw.includes("/e") || mir, S = sw.includes("/s") || E, purge = sw.includes("/purge") || mir, mov = sw.includes("/mov"), L = sw.includes("/l");
    const pats = args.slice(2).length ? args.slice(2) : ["*.*"];
    const sp = P(sh, args[0]), dp = P(sh, args[1]);
    const sr = R(sh, sp);
    // robocopy prints dates like: Tuesday, October 6, 2026 1:27:20 AM
    const longDate = (d) => {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const h = d.getHours() % 12 || 12, p2 = (n) => String(n).padStart(2, "0");
      return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${d.getHours() < 12 ? "AM" : "PM"}`;
    };
    const started = longDate(new Date());
    out(lines, "");
    out(lines, "-------------------------------------------------------------------------------");
    out(lines, "   ROBOCOPY     ::     Robust File Copy for Windows");
    out(lines, "-------------------------------------------------------------------------------");
    out(lines, "");
    out(lines, `  Started : ${started}`);
    out(lines, `   Source : ${full(sp)}\\`);
    out(lines, `     Dest : ${full(dp)}\\`);
    out(lines, "");
    out(lines, `    Files : ${pats.join(" ")}`);
    out(lines, "");
    out(lines, `  Options : ${pats.join(" ")} ${sw.map((s) => s.toUpperCase()).join(" ")} /DCOPY:DA /COPY:DAT /R:1000000 /W:30`.replace(/\s+/g, " ").replace(/^ /, "  "));
    out(lines, "");
    out(lines, "------------------------------------------------------------------------------");
    out(lines, "");
    if (!sr.node || sr.node.type !== "dir") {
      err(lines, `${new Date().toISOString().slice(0, 19).replace("T", " ")} ERROR 2 (0x00000002) Accessing Source Directory ${full(sp)}\\`);
      err(lines, "The system cannot find the file specified.");
      return 16;
    }
    if (mir || purge) warn(lines, msg("robocopy_mir"));
    const res = { dirs: [1, 0, 0, 0, 0, 0], files: [0, 0, 0, 0, 0, 0], bytes: [0, 0, 0, 0, 0, 0] };
    const res2 = [];
    const res_re = pats.map((p) => VFS.wildcardToRegex(p));
    const match = (n) => res_re.some((re) => re.test(n));
    if (denyWrite(sh, dp.drive, dp.parts)) {
      err(lines, `${new Date().toISOString().slice(0, 19).replace("T", " ")} ERROR 5 (0x00000005) Creating Destination Directory ${full(dp)}\\`);
      err(lines, "Access is denied.");
      note(lines, msg("system_write"));
      return 16;
    }
    if (!L) VFS.mkdirp(sh.fs, dp.drive, dp.parts);
    let destRoot = R(sh, dp);
    const walkDir = (snode, sparts, rel) => {
      const destParts = (destRoot.canonical || dp.parts).concat(rel);
      let dnode = VFS.resolve(sh.fs, dp.drive, destParts).node;
      const files = VFS.sortedChildren(snode).filter((c) => c.type === "file" && match(c.name));
      out(lines, `\t                   ${files.length}\t${fmt(sp.drive, sparts)}\\`);
      files.forEach((f) => {
        res.files[0]++; res.bytes[0] += f.size;
        const ex = dnode && dnode.children[f.name.toLowerCase()];
        const same = ex && ex.type === "file" && ex.size === f.size && ex.t === f.t;
        if (same) { res.files[2]++; res.bytes[2] += f.size; return; }
        res.files[1]++; res.bytes[1] += f.size;
        out(lines, `\t    ${ex ? "Newer   " : "New File"}  \t\t${String(f.size).padStart(8)}\t${f.name}`);
        if (L) return;
        if (!dnode) { VFS.mkdirp(sh.fs, dp.drive, destParts); dnode = VFS.resolve(sh.fs, dp.drive, destParts).node; }
        const c = VFS.copyNode(f); c.t = f.t; dnode.children[f.name.toLowerCase()] = c;
        if (mov) res2.push({ dir: snode, name: f.name });
      });
      if (purge && dnode) {
        VFS.sortedChildren(dnode).forEach((c) => {
          if (snode.children[c.name.toLowerCase()]) return;
          if (c.type === "file") { res.files[5]++; res.bytes[5] += c.size; out(lines, `\t    *EXTRA File \t\t${String(c.size).padStart(8)}\t${c.name}`); }
          else { res.dirs[5]++; out(lines, `\t  *EXTRA Dir        -1\t${fmt(dp.drive, destParts.concat(c.name))}\\`); }
          if (!L) VFS.remove(dnode, c.name);
        });
      }
      if (S) VFS.sortedChildren(snode).forEach((c) => {
        if (c.type !== "dir") return;
        const hasFiles = (() => { let h = false; VFS.walk(c, [], (n) => { if (n.type === "file") h = true; }); return h; })();
        if (!hasFiles && !E) return;
        res.dirs[0]++;
        const dExists = dnode && dnode.children[c.name.toLowerCase()];
        if (dExists) res.dirs[2]++; else { res.dirs[1]++; if (!L) VFS.mkdirp(sh.fs, dp.drive, destParts.concat(c.name)); }
        walkDir(c, sparts.concat(c.name), rel.concat(c.name));
      });
    };
    walkDir(sr.node, sr.canonical, []);
    res2.forEach((x) => VFS.remove(x.dir, x.name));
    if (destRoot.node) res.dirs[2] += 0;
    out(lines, "");
    out(lines, "------------------------------------------------------------------------------");
    out(lines, "");
    const row = (label, arr, isBytes) => out(lines, `${label.padStart(10)} :${arr.map((v) => String(isBytes ? fmtBytes(v) : v).padStart(10)).join("")}`);
    out(lines, "               Total    Copied   Skipped  Mismatch    FAILED    Extras");
    row("Dirs", res.dirs); row("Files", res.files); row("Bytes", res.bytes, true);
    out(lines, `   Ended : ${longDate(new Date())}`);
    let code = 0;
    if (res.files[1]) code |= 1;
    if (res.files[5] || res.dirs[5]) code |= 2;
    rec.copied = res.files[1];
    if (code) note(lines, msg("robocopy_exit", { code }));
    return code;
  });
  function fmtBytes(b) {
    if (b < 1024) return String(b);
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " k";
    if (b < 1024 * 1024 * 1024) return (b / 1048576).toFixed(1) + " m";
    return (b / 1073741824).toFixed(2) + " g";
  }

  /* ---------------- MOVE ---------------- */
  def("move", [], {
    summary: "Moves one or more files from one directory to another directory.",
    usage: "Moves files and renames files and directories.\n\nTo move one or more files:\nMOVE [/Y | /-Y] [drive:][path]filename1[,...] destination\n\nTo rename a directory:\nMOVE [/Y | /-Y] [drive:][path]dirname1 dirname2\n\n  [drive:][path]filename1 Specifies the location and name of the file\n                          or files you want to move.\n  destination             Specifies the new location of the file.\n  /Y                      Suppresses prompting to confirm you want to\n                          overwrite an existing destination file.\n  /-Y                     Causes prompting to confirm you want to overwrite\n                          an existing destination file.",
  }, function* (sh, rest, lines, rec, io, ctx) {
    const { args, sw } = parseArgs(rest);
    rec.args = args; rec.switches = sw;
    if (sw.includes("/?")) { showUsage(lines, COMMANDS.move); return true; }
    if (args.length < 1) { err(lines, "The syntax of the command is incorrect."); note(lines, msg("syntax", { cmd: "move" })); return false; }
    if (args.length > 2) { err(lines, "The syntax of the command is incorrect."); note(lines, msg("move_spaces")); return false; }
    let confirm = !ctx.frame && !sw.includes("/y");
    if (sw.includes("/-y")) confirm = true;
    const e = expand(sh, args[0]);
    if (!e.items.length) { err(lines, e.missingDir ? "The system cannot find the path specified." : "The system cannot find the file specified."); if (!e.missingDir) note(lines, msg("file_not_found")); return false; }
    const dp = P(sh, args[1] || ".");
    const dr = R(sh, dp);
    const destIsDir = dr.node && dr.node.type === "dir";
    if (!destIsDir && e.items.length > 1) { err(lines, "Cannot move multiple files to a single file."); return false; }
    let files = 0, dirs = 0;
    for (const it of e.items) {
      const srcParent = parentOf(sh, e.drive, it.parts);
      if (isSystem(sh, e.drive, it.parts)) { err(lines, "Access is denied."); note(lines, msg("system_protected")); ok = false; return; }
      if (it.node.type === "dir" && inUse(sh, e.drive, it.parts)) { err(lines, "The process cannot access the file because it is being used by another process."); note(lines, msg("rd_in_use")); return false; }
      let destDir, destName, destParts;
      if (destIsDir) { destDir = dr.node; destName = it.node.name; destParts = dr.canonical.concat(destName); }
      else {
        const pr = VFS.resolve(sh.fs, dp.drive, dp.parts.slice(0, -1));
        if (!pr.node || pr.node.type !== "dir") { err(lines, "The system cannot find the path specified."); return false; }
        destDir = pr.node; destName = dp.parts[dp.parts.length - 1]; destParts = pr.canonical.concat(destName);
      }
      if (it.node.type === "dir" && dp.drive === e.drive && destParts.length > it.parts.length && it.parts.every((x, i) => x.toLowerCase() === destParts[i].toLowerCase())) {
        err(lines, "The process cannot access the file because it is being used by another process."); note(lines, msg("move_into_self")); return false;
      }
      if (destDir === srcParent && destName.toLowerCase() === it.node.name.toLowerCase() && destName === it.node.name) { if (e.items.length > 1) out(lines, fmt(e.drive, it.parts)); files += it.node.type === "file" ? 1 : 0; dirs += it.node.type === "dir" ? 1 : 0; continue; }
      const ex = destDir.children[destName.toLowerCase()];
      if (ex && ex !== it.node) {
        if (ex.type === "dir" || it.node.type === "dir") { err(lines, "Access is denied."); note(lines, msg("move_exists")); return false; }
        if (confirm) {
          const a = (yield* ask(`Overwrite ${fmt(dp.drive, destParts)}? (Yes/No/All): `)).trim();
          if (/^n/i.test(a)) continue;
          if (/^a/i.test(a)) confirm = false;
        }
      }
      if (isSystem(sh, e.drive, it.parts) || isSystem(sh, dp.drive, destParts)) { err(lines, "Access is denied."); note(lines, msg("system_protected")); return false; }
      if (!e.single) out(lines, fmt(e.drive, it.parts));
      VFS.remove(srcParent, it.node.name);
      it.node.name = destName;
      destDir.children[destName.toLowerCase()] = it.node;
      destDir.t = VFS.nowIso();
      if (it.node.type === "dir") dirs++; else files++;
    }
    if (dirs) out(lines, `${pad8(dirs)} dir(s) moved.`);
    if (files || !dirs) out(lines, `${pad8(files)} file(s) moved.`);
    rec.moved = files + dirs;
    return files + dirs > 0;
  });

  /* ---------------- REN ---------------- */
  def("ren", ["rename"], {
    summary: "Renames a file or files.",
    usage: "Renames a file or files.\n\nRENAME [drive:][path]filename1 filename2.\nREN [drive:][path]filename1 filename2.\n\nNote that you cannot specify a new drive or path for your destination file.",
  }, (sh, rest, lines, rec) => {
    const { args, sw } = parseArgs(rest);
    rec.args = args; rec.switches = sw;
    if (sw.includes("/?")) { showUsage(lines, COMMANDS.ren); return true; }
    if (args.length !== 2) { err(lines, "The syntax of the command is incorrect."); note(lines, args.length > 2 ? msg("ren_spaces") : msg("syntax", { cmd: "ren" })); return false; }
    const newName = args[1];
    if (/[\\:]/.test(newName)) { err(lines, "The syntax of the command is incorrect."); note(lines, msg("ren_path")); return false; }
    if (VFS.INVALID_NAME.test(newName.replace(/[*?]/g, ""))) { err(lines, "The filename, directory name, or volume label syntax is incorrect."); return false; }
    const e = expand(sh, args[0]);
    if (!e.items.length) { err(lines, "The system cannot find the file specified."); note(lines, msg("file_not_found")); return false; }
    let ok = true, n = 0;
    e.items.forEach((it) => {
      const parent = parentOf(sh, e.drive, it.parts);
      const nn = mapName(it.node.name, newName);
      const ex = parent.children[nn.toLowerCase()];
      if (ex && ex !== it.node) { err(lines, "A duplicate file name exists, or the file cannot be found."); note(lines, msg("ren_exists", { name: nn })); ok = false; return; }
      if (it.node.type === "dir" && inUse(sh, e.drive, it.parts)) { err(lines, "The process cannot access the file because it is being used by another process."); ok = false; return; }
      VFS.remove(parent, it.node.name);
      it.node.name = nn;
      parent.children[nn.toLowerCase()] = it.node;
      n++;
    });
    rec.renamed = n;
    if (n && /\.\w+$/.test(args[0]) && !/\./.test(newName) && !/[*?]/.test(newName)) note(lines, msg("ren_no_ext"));
    return ok;
  });

  /* ---------------- DEL ---------------- */
  def("del", ["erase"], {
    summary: "Deletes one or more files.",
    usage: "Deletes one or more files.\n\nDEL [/P] [/F] [/S] [/Q] [/A[[:]attributes]] names\nERASE [/P] [/F] [/S] [/Q] [/A[[:]attributes]] names\n\n  names         Specifies a list of one or more files or directories.\n                Wildcards may be used to delete multiple files. If a\n                directory is specified, all files within the directory\n                will be deleted.\n\n  /P            Prompts for confirmation before deleting each file.\n  /F            Force deleting of read-only files.\n  /S            Delete specified files from all subdirectories.\n  /Q            Quiet mode, do not ask if ok to delete on global wildcard\n  /A            Selects files to delete based on attributes",
    danger: true,
  }, function* (sh, rest, lines, rec) {
    const { args, sw } = parseArgs(rest);
    rec.args = args; rec.switches = sw;
    if (sw.includes("/?")) { showUsage(lines, COMMANDS.del); return true; }
    if (!args.length) { err(lines, "The syntax of the command is incorrect."); note(lines, msg("syntax", { cmd: "del" })); return false; }
    const Pp = sw.includes("/p"), F = sw.includes("/f"), S = sw.includes("/s"), Q = sw.includes("/q");
    const A = sw.find((s) => /^\/a/.test(s));
    const attrOk = (n) => {
      const a = n.attrs || {};
      if (!A) return !a.h && !a.s;
      const spec = A.replace(/^\/a:?/, "");
      if (!spec) return true;
      return spec.split("").every((c, i, arr) => { if (c === "-") return true; const neg = arr[i - 1] === "-"; const v = c === "h" ? !!a.h : c === "s" ? !!a.s : c === "r" ? !!a.r : c === "a" ? !!a.a : true; return neg ? !v : v; });
    };
    let deleted = 0, sysNoted = false;
    for (const a of args) {
      const p = P(sh, a);
      const r = R(sh, p);
      let dirParts, pattern;
      if (r.node && r.node.type === "dir") { dirParts = r.canonical; pattern = "*"; }
      else { const pr = VFS.resolve(sh.fs, p.drive, p.parts.slice(0, -1)); if (!pr.node || pr.node.type !== "dir") { err(lines, "The system cannot find the path specified."); continue; } dirParts = pr.canonical; pattern = p.parts[p.parts.length - 1] || "*"; }
      const global = pattern === "*" || pattern === "*.*";
      if (global && !Q && !Pp) {
        const ans = (yield* ask(`${fmt(p.drive, dirParts)}\\*, Are you sure (Y/N)? `)).trim();
        if (!/^y/i.test(ans)) continue;
      }
      const re = VFS.wildcardToRegex(pattern);
      const dirs = [{ node: VFS.resolve(sh.fs, p.drive, dirParts).node, parts: dirParts }];
      if (S) VFS.walk(dirs[0].node, dirParts, (n, parts) => { if (n.type === "dir") dirs.push({ node: n, parts }); });
      let found = 0;
      for (const d of dirs) {
        const files = VFS.sortedChildren(d.node).filter((n) => n.type === "file" && re.test(n.name));
        for (const f of files) {
          if (!attrOk(f)) continue;
          found++;
          const fp = fmt(p.drive, d.parts.concat(f.name));
          if (isSystem(sh, p.drive, d.parts)) { err(lines, `${fp}`); err(lines, "Access is denied."); if (!sysNoted) { note(lines, msg("system_protected")); sysNoted = true; } continue; }
          if (f.attrs && f.attrs.r && !F) { err(lines, `${fp}`); err(lines, "Access is denied."); note(lines, msg("del_readonly")); continue; }
          if (Pp) { const ans = (yield* ask(`${fp}, Delete (Y/N)? `)).trim(); if (!/^y/i.test(ans)) continue; }
          VFS.remove(d.node, f.name);
          deleted++;
          if (S) out(lines, `Deleted file - ${fp}`);
        }
      }
      if (!found) {
        const hiddenMatch = VFS.sortedChildren(dirs[0].node).some((n) => n.type === "file" && re.test(n.name));
        err(lines, `Could Not Find ${fmt(p.drive, dirParts.concat(global ? "*" : pattern))}`);
        if (hiddenMatch && !A) note(lines, msg("del_hidden"));
        else if (!global) note(lines, msg("file_not_found"));
      }
    }
    rec.deleted = deleted;
    return true;
  });

  /* ---------------- ATTRIB ---------------- */
  def("attrib", [], {
    summary: "Displays or changes file attributes.",
    usage: "Displays or changes file attributes.\n\nATTRIB [+R | -R] [+A | -A] [+S | -S] [+H | -H] [drive:][path][filename] [/S [/D]]\n\n  +   Sets an attribute.\n  -   Clears an attribute.\n  R   Read-only file attribute.\n  A   Archive file attribute.\n  S   System file attribute.\n  H   Hidden file attribute.\n  /S  Processes matching files in the current folder\n      and all subfolders.\n  /D  Processes folders as well.",
  }, (sh, rest, lines, rec) => {
    const toks = tokenize(rest);
    const changes = [], paths = [];
    let S = false, Dd = false;
    for (const t of toks) {
      const v = t.v;
      if (!t.q && /^[+-][rash]$/i.test(v)) { changes.push({ on: v[0] === "+", a: v[1].toLowerCase() }); continue; }
      if (!t.q && v.toLowerCase() === "/s") { S = true; continue; }
      if (!t.q && v.toLowerCase() === "/d") { Dd = true; continue; }
      if (v === "/?") { showUsage(lines, COMMANDS.attrib); return true; }
      paths.push(v);
    }
    rec.args = paths; rec.switches = changes.map((c) => (c.on ? "+" : "-") + c.a);
    const pathList = paths.length ? paths : ["*"];
    let any = false;
    const show = (n, fp) => {
      const a = n.attrs || {};
      const flags = (a.a ? "A" : " ") + "    " + (a.s ? "S" : " ") + (a.h ? "H" : " ") + (a.r ? "R" : " ");
      out(lines, `${flags.padEnd(19)}${fp}`);
    };
    for (const raw of pathList) {
      const p = P(sh, raw);
      const r = R(sh, p);
      let dirParts, pattern, single = null;
      if (r.node && (r.node.type === "file" || (r.node.type === "dir" && (Dd || changes.length) && !/[*?]/.test(raw)))) { single = { node: r.node, parts: r.canonical }; }
      else if (r.node && r.node.type === "dir") { dirParts = r.canonical; pattern = "*"; }
      else { const pr = VFS.resolve(sh.fs, p.drive, p.parts.slice(0, -1)); if (!pr.node) { err(lines, `Path not found - ${full(p)}`); return false; } dirParts = pr.canonical; pattern = p.parts[p.parts.length - 1]; }
      const targets = [];
      if (single) targets.push(single);
      else {
        const re = VFS.wildcardToRegex(pattern);
        const base = VFS.resolve(sh.fs, p.drive, dirParts).node;
        const add = (node, parts) => VFS.sortedChildren(node).forEach((c) => { if (re.test(c.name) && (c.type === "file" || Dd)) targets.push({ node: c, parts: parts.concat(c.name) }); });
        add(base, dirParts);
        if (S) VFS.walk(base, dirParts, (n, parts) => { if (n.type === "dir") add(n, parts); });
      }
      if (!targets.length) { err(lines, `File not found - ${raw}`); return false; }
      targets.forEach((t) => {
        any = true;
        if (changes.length) {
          t.node.attrs = t.node.attrs || {};
          changes.forEach((c) => { t.node.attrs[c.a] = c.on; });
        } else show(t.node, fmt(p.drive, t.parts));
      });
    }
    if (changes.some((c) => c.a === "h" && c.on)) note(lines, msg("attrib_hidden"));
    return any;
  });

  /* ---------------- TREE ---------------- */
  def("tree", [], {
    summary: "Graphically displays the folder structure of a drive or path.",
    usage: "Graphically displays the folder structure of a drive or path.\n\nTREE [drive:][path] [/F] [/A]\n\n   /F   Display the names of the files in each folder.\n   /A   Use ASCII instead of extended characters.",
  }, (sh, rest, lines, rec) => {
    const { args, sw } = parseArgs(rest);
    rec.args = args; rec.switches = sw;
    if (sw.includes("/?")) { showUsage(lines, COMMANDS.tree); return true; }
    const bad = sw.find((s) => !["/f", "/a"].includes(s));
    if (bad) { err(lines, `Invalid switch - ${bad}`); return false; }
    const F = sw.includes("/f"), A = sw.includes("/a");
    const p = P(sh, args.join(" ") || ".");
    const r = R(sh, p);
    const drv = VFS.getDrive(sh.fs, p.drive);
    out(lines, drv && drv.label ? `Folder PATH listing for volume ${drv.label}` : "Folder PATH listing");
    out(lines, `Volume serial number is ${drv ? drv.serial : "0000-0000"}`);
    if (!r.node || r.node.type !== "dir") { out(lines, "Invalid path - " + (args.join(" ") ? full(p).slice(2) : "\\")); out(lines, "No subfolders exist "); return false; }
    out(lines, args.length ? full(p) : p.drive + ":.");
    const ch = A ? { t: "+---", l: "\\---", v: "|   ", s: "    " } : { t: "├───", l: "└───", v: "│   ", s: "    " };
    let subCount = 0;
    const visit = (node, prefix) => {
      const kids = VFS.sortedChildren(node).filter((c) => !(c.attrs && c.attrs.h));
      const dirs = kids.filter((c) => c.type === "dir");
      const files = kids.filter((c) => c.type === "file");
      if (F && files.length) {
        files.forEach((f) => out(lines, prefix + (dirs.length ? ch.v : ch.s) + f.name));
        out(lines, (prefix + (dirs.length ? ch.v : ch.s)).trimEnd());
      }
      dirs.forEach((d, i) => {
        subCount++;
        const lastOne = i === dirs.length - 1;
        out(lines, prefix + (lastOne ? ch.l : ch.t) + d.name);
        visit(d, prefix + (lastOne ? ch.s : ch.v));
      });
    };
    visit(r.node, "");
    if (!subCount) out(lines, "No subfolders exist ");
    out(lines, "");
    return true;
  });

  /* ---------------- FC ---------------- */
  def("fc", [], {
    summary: "Compares two files or sets of files, and displays the differences.",
    usage: "Compares two files or sets of files and displays the differences between\nthem\n\nFC [/C] [/N] [drive1:][path1]filename1 [drive2:][path2]filename2\n\n  /C         Disregards the case of letters.\n  /N         Displays the line numbers on an ASCII comparison.",
  }, (sh, rest, lines, rec) => {
    const { args, sw } = parseArgs(rest);
    rec.args = args; rec.switches = sw;
    if (sw.includes("/?")) { showUsage(lines, COMMANDS.fc); return true; }
    if (args.length !== 2) { err(lines, "FC: Insufficient number of file specifications"); return 2; }
    const nodes = args.map((a) => R(sh, P(sh, a)).node);
    for (let i = 0; i < 2; i++) if (!nodes[i] || nodes[i].type !== "file") { err(lines, `FC: cannot open ${args[i].toUpperCase()} - No such file or folder`); return 2; }
    const N = sw.includes("/n"), C = sw.includes("/c");
    const nameA = full(P(sh, args[0])).toUpperCase(), nameB = full(P(sh, args[1])).toUpperCase();
    out(lines, `Comparing files ${args[0].toUpperCase()} and ${args[1].toUpperCase()}`);
    if (nodes[0].binary || nodes[1].binary) {
      if (nodes[0].size === nodes[1].size) { out(lines, "FC: no differences encountered"); out(lines, ""); return 0; }
      out(lines, `FC: ${args[0].toUpperCase()} longer than ${args[1].toUpperCase()}`); out(lines, ""); return 1;
    }
    const a = VFS.linesOf(nodes[0]), b = VFS.linesOf(nodes[1]);
    const eq = (x, y) => (C ? x.toLowerCase() === y.toLowerCase() : x === y);
    if (a.length === b.length && a.every((x, i) => eq(x, b[i]))) { out(lines, "FC: no differences encountered"); out(lines, ""); return 0; }
    // simple diff: report blocks that differ, with one line of context
    let i = 0, j = 0;
    const blocks = [];
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && eq(a[i], b[j])) { i++; j++; continue; }
      // find next sync point
      let found = null;
      for (let d = 1; d < 50 && !found; d++) {
        for (let x = 0; x <= d; x++) {
          const ii = i + x, jj = j + (d - x);
          if (ii < a.length && jj < b.length && eq(a[ii], b[jj])) { found = [ii, jj]; break; }
        }
      }
      const [ei, ej] = found || [a.length, b.length];
      blocks.push({ ai: i, aj: ei, bi: j, bj: ej });
      i = ei; j = ej;
    }
    const ln = (k, s) => (N ? `${String(k + 1).padStart(5)}:  ${s}` : s);
    blocks.forEach((bk) => {
      const ctxA = bk.ai > 0 ? [ln(bk.ai - 1, a[bk.ai - 1])] : [];
      const ctxAfterA = bk.aj < a.length ? [ln(bk.aj, a[bk.aj])] : [];
      const ctxB = bk.bi > 0 ? [ln(bk.bi - 1, b[bk.bi - 1])] : [];
      const ctxAfterB = bk.bj < b.length ? [ln(bk.bj, b[bk.bj])] : [];
      out(lines, `***** ${args[0].toUpperCase()}`);
      ctxA.concat(a.slice(bk.ai, bk.aj).map((s, k) => ln(bk.ai + k, s)), ctxAfterA).forEach((s) => out(lines, s));
      out(lines, `***** ${args[1].toUpperCase()}`);
      ctxB.concat(b.slice(bk.bi, bk.bj).map((s, k) => ln(bk.bi + k, s)), ctxAfterB).forEach((s) => out(lines, s));
      out(lines, "*****");
      out(lines, "");
    });
    void nameA; void nameB;
    return 1;
  });
})();
