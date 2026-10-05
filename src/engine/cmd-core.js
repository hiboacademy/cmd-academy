/* ============================================================
   engine/cmd-core.js — navigation, folders, text output, variables
   dir cd pushd popd mkdir rmdir type echo cls ver help title color
   set prompt path date time vol start cmd clip doskey where
   ============================================================ */
(() => {
  const { def, lib, COMMANDS } = Shell;
  const { out, err, note, warn, msg, tokenize, parseArgs, hasSw, fmtTime, num, P, R, full, expand, parentOf, inUse, isSystem, showUsage, ask, getVar, setVar, cwdPath } = lib;

  /* ---------------- DIR ---------------- */
  def("dir", [], {
    summary: "Displays a list of files and subdirectories in a directory.",
    usage: "Displays a list of files and subdirectories in a directory.\n\nDIR [drive:][path][filename] [/A[[:]attributes]] [/B] [/O[[:]sortorder]] [/S] [/W]\n\n  [drive:][path][filename]\n              Specifies drive, directory, and/or files to list.\n  /A          Displays files with specified attributes.\n  attributes   D  Directories                R  Read-only files\n               H  Hidden files               A  Files ready for archiving\n               S  System files               -  Prefix meaning not\n  /B          Uses bare format (no heading information or summary).\n  /O          List by files in sorted order.\n  sortorder    N  By name (alphabetic)       S  By size (smallest first)\n               E  By extension (alphabetic)  D  By date/time (oldest first)\n               G  Group directories first    -  Prefix to reverse order\n  /S          Displays files in specified directory and all subdirectories.\n  /W          Uses wide list format.",
  }, (sh, rest, lines, rec) => {
    const { args, sw } = parseArgs(rest);
    rec.switches = sw; rec.args = args;
    if (sw.includes("/?")) { showUsage(lines, COMMANDS.dir); return true; }
    let attrSpec = null, sortSpec = null;
    for (const s of sw) {
      if (s === "/w" || s === "/b" || s === "/s" || s === "/p" || s === "/q" || s === "/l") continue;
      if (/^\/a:?/.test(s)) { attrSpec = s.replace(/^\/a:?/, ""); continue; }
      if (/^\/o:?/.test(s)) { sortSpec = s.replace(/^\/o:?/, "") || "gn"; continue; }
      err(lines, `Invalid switch - "${s.slice(1)}".`); note(lines, msg("invalid_switch", { cmd: "dir" })); return false;
    }
    const bare = sw.includes("/b"), wide = sw.includes("/w"), recurse = sw.includes("/s");
    const filt = attrFilter(attrSpec);
    // several paths: "dir Documents Music" lists each one (unless it is one name with spaces)
    let targets = [args.join(" ") || "."];
    if (args.length > 1) {
      const joined = P(sh, args.join(" "));
      if (!VFS.resolve(sh.fs, joined.drive, joined.parts).node) targets = args;
    }
    let okAll = true, headerShown = false;
    targets.forEach((target) => {
      const r = listOne(sh, target, { bare, wide, recurse, filt, attrSpec, sortSpec, lines, rec, headerShown });
      headerShown = headerShown || r.header;
      if (!r.ok) okAll = false;
    });
    return okAll;
  });

  function volHeader(lines, drv, letter) {
    out(lines, drv.label ? ` Volume in drive ${letter} is ${drv.label}` : ` Volume in drive ${letter} has no label.`);
    out(lines, ` Volume Serial Number is ${drv.serial}`);
  }

  function listOne(sh, target, o) {
    const { bare, wide, recurse, filt, attrSpec, sortSpec, lines, rec } = o;
    let p = P(sh, target);
    let pattern = null;
    const last = p.parts[p.parts.length - 1];
    if (last && /[*?]/.test(last)) { pattern = last; p = { ...p, parts: p.parts.slice(0, -1) }; }
    const drv = VFS.getDrive(sh.fs, p.drive);
    if (!drv) { err(lines, "The system cannot find the path specified."); note(lines, msg("drive_not_found", { drive: p.drive, list: lib.driveList(sh) })); return { ok: false }; }
    const header = !bare && !o.headerShown;
    let r = VFS.resolve(sh.fs, p.drive, p.parts);
    if (!r.node) {
      if (header) volHeader(lines, drv, p.drive);
      if (r.parent) {
        if (!bare) { out(lines, ""); out(lines, ` Directory of ${VFS.fmt(p.drive, r.canonical)}`); out(lines, ""); }
        err(lines, "File Not Found"); note(lines, msg("file_not_found"));
      } else { if (!bare) out(lines, ""); err(lines, "The system cannot find the path specified."); note(lines, msg("path_not_found")); }
      return { ok: false, header };
    }
    let dirNode = r.node, dirParts = r.canonical;
    if (r.node.type === "file") { pattern = r.node.name; dirParts = r.canonical.slice(0, -1); dirNode = VFS.resolve(sh.fs, p.drive, dirParts).node; }
    const re = pattern ? VFS.wildcardToRegex(pattern) : null;
    rec.target = VFS.fmt(p.drive, dirParts);

    // collect directories to show
    const dirs = [{ node: dirNode, parts: dirParts }];
    if (recurse) VFS.walk(dirNode, dirParts, (n, parts) => { if (n.type === "dir" && !(n.attrs && n.attrs.h)) dirs.push({ node: n, parts }); });

    let totalFiles = 0, totalBytes = 0, totalDirs = 0, shownAny = false;
    if (header) volHeader(lines, drv, p.drive);
    dirs.forEach((d) => {
      let entries = VFS.sortedChildren(d.node).filter((e) => (!re || re.test(e.name)) && filt(e));
      if (sortSpec) entries = sortEntries(entries, sortSpec);
      const isRoot = d.parts.length === 0;
      const showDots = !isRoot && !pattern && filt({ type: "dir", attrs: {} }) && !(attrSpec && /h|s|r|-d/.test(attrSpec));
      if (!entries.length && !(showDots && !recurse)) return;
      if (recurse && !entries.length) return;
      shownAny = true;
      const files = entries.filter((e) => e.type === "file");
      const subdirs = entries.filter((e) => e.type === "dir");
      const bytes = files.reduce((s, f) => s + f.size, 0);
      totalFiles += files.length; totalBytes += bytes; totalDirs += subdirs.length + (showDots ? 2 : 0);
      if (bare) {
        entries.forEach((e) => out(lines, recurse ? VFS.fmt(p.drive, d.parts.concat(e.name)) : e.name));
        return;
      }
      out(lines, "");
      out(lines, ` Directory of ${VFS.fmt(p.drive, d.parts)}`);
      out(lines, "");
      if (wide) {
        const names = (showDots ? ["[.]", "[..]"] : []).concat(entries.map((e) => (e.type === "dir" ? `[${e.name}]` : e.name)));
        const w = Math.max(15, ...names.map((n) => n.length + 2));
        const cols = Math.max(1, Math.floor(64 / w));
        for (let i = 0; i < names.length; i += cols) out(lines, names.slice(i, i + cols).map((n) => n.padEnd(w)).join("").trimEnd());
      } else {
        const t = fmtTime(d.node.t);
        if (showDots) { out(lines, `${t}    <DIR>          .`); out(lines, `${t}    <DIR>          ..`); }
        entries.forEach((e) => {
          if (e.type === "dir") out(lines, `${fmtTime(e.t)}    <DIR>          ${e.name}`);
          else out(lines, `${fmtTime(e.t)}${num(e.size).padStart(18)} ${e.name}`);
        });
      }
      out(lines, `${String(files.length).padStart(16)} File(s) ${num(bytes).padStart(14)} bytes`);
      if (!recurse) out(lines, `${String(subdirs.length + (showDots ? 2 : 0)).padStart(16)} Dir(s) ${num(drv.free).padStart(15)} bytes free`);
    });
    if (!shownAny) {
      if (bare) return { ok: false, header };
      if (!recurse) { out(lines, ""); out(lines, ` Directory of ${VFS.fmt(p.drive, dirParts)}`); out(lines, ""); }
      err(lines, "File Not Found");
      note(lines, pattern ? msg("dir_no_match", { pattern }) : msg("file_not_found"));
      return { ok: false, header };
    }
    if (recurse && !bare) {
      out(lines, "");
      out(lines, "     Total Files Listed:");
      out(lines, `${String(totalFiles).padStart(16)} File(s) ${num(totalBytes).padStart(14)} bytes`);
      out(lines, `${String(totalDirs).padStart(16)} Dir(s) ${num(drv.free).padStart(15)} bytes free`);
    }
    return { ok: true, header };
  }

  function attrFilter(spec) {
    // default: hide hidden and system entries
    if (spec == null) return (e) => !(e.attrs && (e.attrs.h || e.attrs.s));
    if (spec === "") return () => true;
    const tests = [];
    for (let i = 0; i < spec.length; i++) {
      let neg = false, c = spec[i];
      if (c === "-") { neg = true; c = spec[++i]; }
      if (!c) break;
      tests.push((e) => {
        const a = e.attrs || {};
        const v = c === "d" ? e.type === "dir" : c === "h" ? !!a.h : c === "s" ? !!a.s : c === "r" ? !!a.r : c === "a" ? !!a.a : true;
        return neg ? !v : v;
      });
    }
    return (e) => tests.every((t) => t(e));
  }
  function sortEntries(entries, spec) {
    const keys = [];
    for (let i = 0; i < spec.length; i++) { let rev = false, c = spec[i]; if (c === "-") { rev = true; c = spec[++i]; } if (c) keys.push({ c, rev }); }
    const ext = (n) => { const d = n.lastIndexOf("."); return d > 0 ? n.slice(d + 1) : ""; };
    return entries.slice().sort((a, b) => {
      for (const k of keys) {
        let v = 0;
        if (k.c === "n") v = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
        else if (k.c === "e") v = ext(a.name).localeCompare(ext(b.name), "en", { sensitivity: "base" });
        else if (k.c === "s") v = (a.size || 0) - (b.size || 0);
        else if (k.c === "d") v = a.t < b.t ? -1 : a.t > b.t ? 1 : 0;
        else if (k.c === "g") v = (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1);
        if (v) return k.rev ? -v : v;
      }
      return 0;
    });
  }

  /* ---------------- CD ---------------- */
  def("cd", ["chdir"], {
    summary: "Displays the name of or changes the current directory.",
    usage: "Displays the name of or changes the current directory.\n\nCHDIR [/D] [drive:][path]\nCHDIR [..]\nCD [/D] [drive:][path]\nCD [..]\n\n  ..   Specifies that you want to change to the parent directory.\n\nType CD drive: to display the current directory in the specified drive.\nType CD without parameters to display the current drive and directory.\n\nUse the /D switch to change current drive in addition to changing current\ndirectory for a drive.",
  }, (sh, rest, lines, rec) => {
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
      if (!VFS.getDrive(sh.fs, L)) { err(lines, "The system cannot find the drive specified."); note(lines, msg("drive_not_found", { drive: L, list: lib.driveList(sh) })); return false; }
      out(lines, VFS.fmt(L, sh.cwd[L] || [])); return true;
    }
    if (/[*?]/.test(s)) {
      const e = expand(sh, s);
      const d = e.items.find((x) => x.node.type === "dir");
      if (d) s = VFS.fmt(e.drive, d.parts);
    }
    const p = P(sh, s);
    rec.pathKind = p.kind === "drive" ? "absolute" : p.kind;
    if (!VFS.getDrive(sh.fs, p.drive)) { err(lines, "The system cannot find the drive specified."); note(lines, msg("drive_not_found", { drive: p.drive, list: lib.driveList(sh) })); return false; }
    const r = VFS.resolve(sh.fs, p.drive, p.parts);
    if (!r.node) {
      err(lines, "The system cannot find the path specified.");
      const words = rest.trim().split(/\s+/);
      note(lines, /\s/.test(s) && !/"/.test(rest) && words.length > 1 && VFS.resolve(sh.fs, p.drive, P(sh, words[0]).parts).node ? msg("path_spaces") : msg("path_not_found"));
      return false;
    }
    if (r.node.type !== "dir") { err(lines, "The directory name is invalid."); note(lines, msg("dir_name_invalid", { name: r.node.name })); return false; }
    sh.cwd[p.drive] = r.canonical;
    rec.target = VFS.fmt(p.drive, r.canonical);
    if (p.drive !== sh.drive) {
      if (changeDrive) sh.drive = p.drive;
      else note(lines, msg("cd_other_drive", { drive: p.drive, cur: sh.drive }));
    }
    return true;
  });

  def("pushd", [], {
    summary: "Saves the current directory then changes it.",
    usage: "Stores the current directory for use by the POPD command, then\nchanges to the specified directory.\n\nPUSHD [path | ..]\n\n  path        Specifies the directory to make the current directory.",
  }, (sh, rest, lines, rec) => {
    const s = rest.trim().replace(/"/g, "");
    rec.args = s ? [s] : [];
    if (s === "/?") { showUsage(lines, COMMANDS.pushd); return true; }
    if (!s) { sh.dirStack.slice().reverse().forEach((d) => out(lines, d)); return true; }
    const p = P(sh, s);
    const r = R(sh, p);
    if (!r.node || r.node.type !== "dir") { err(lines, "The system cannot find the path specified."); return false; }
    sh.dirStack.push(cwdPath(sh));
    sh.drive = p.drive; sh.cwd[p.drive] = r.canonical;
    rec.target = cwdPath(sh);
    return true;
  });
  def("popd", [], {
    summary: "Restores the directory saved by PUSHD.",
    usage: "Changes to the directory stored by the PUSHD command.\n\nPOPD",
  }, (sh, rest, lines) => {
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.popd); return true; }
    const d = sh.dirStack.pop();
    if (!d) { note(lines, msg("popd_empty")); return true; }
    Shell.setLocation(sh, d);
    return true;
  });

  /* ---------------- MKDIR ---------------- */
  def("mkdir", ["md"], {
    summary: "Creates a directory.",
    usage: "Creates a directory.\n\nMKDIR [drive:]path\nMD [drive:]path\n\nMKDIR creates any intermediate directories in the path, if needed.\nFor example, assume \\a does not exist then:\n\n    mkdir \\a\\b\\c\\d",
  }, (sh, rest, lines, rec) => {
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
      const p = P(sh, raw);
      if (!VFS.getDrive(sh.fs, p.drive)) { err(lines, "The system cannot find the path specified."); note(lines, msg("drive_not_found", { drive: p.drive, list: lib.driveList(sh) })); ok = false; return; }
      const r = VFS.resolve(sh.fs, p.drive, p.parts);
      if (r.node) { err(lines, `A subdirectory or file ${tk.v} already exists.`); note(lines, msg("already_exists")); ok = false; return; }
      if (!VFS.mkdirp(sh.fs, p.drive, p.parts)) { err(lines, "The system cannot find the path specified."); ok = false; return; }
      rec.created = (rec.created || []).concat(VFS.fmt(p.drive, p.parts));
    });
    if (toks.length > 1 && toks.every((t) => !t.q) && rest.trim().split(/\s+/).length > 1 && ok) note(lines, msg("mkdir_many", { n: toks.length }));
    return ok;
  });

  /* ---------------- RMDIR ---------------- */
  def("rmdir", ["rd"], {
    summary: "Removes a directory.",
    usage: "Removes (deletes) a directory.\n\nRMDIR [/S] [/Q] [drive:]path\nRD [/S] [/Q] [drive:]path\n\n    /S      Removes all directories and files in the specified directory\n            in addition to the directory itself.  Used to remove a directory\n            tree.\n\n    /Q      Quiet mode, do not ask if ok to remove a directory tree with /S",
    danger: true,
  }, function* (sh, rest, lines, rec) {
    const { args, sw } = parseArgs(rest);
    rec.args = args; rec.switches = sw;
    if (sw.includes("/?")) { showUsage(lines, COMMANDS.rmdir); return true; }
    if (!args.length) { err(lines, "The syntax of the command is incorrect."); note(lines, msg("syntax", { cmd: "rd" })); return false; }
    const S = sw.includes("/s"), Q = sw.includes("/q");
    let ok = true;
    for (const a of args) {
      const p = P(sh, a);
      const r = R(sh, p);
      if (!r.node) { err(lines, "The system cannot find the file specified."); ok = false; continue; }
      if (r.node.type !== "dir") { err(lines, "The directory name is invalid."); note(lines, msg("rd_file", { name: r.node.name })); ok = false; continue; }
      if (!r.canonical.length) { err(lines, "The process cannot access the file because it is being used by another process."); ok = false; continue; }
      if (inUse(sh, p.drive, r.canonical)) { err(lines, "The process cannot access the file because it is being used by another process."); note(lines, msg("rd_in_use")); ok = false; continue; }
      const empty = !Object.keys(r.node.children).length;
      if (!empty && !S) { err(lines, "The directory is not empty."); note(lines, msg("rd_not_empty", { name: r.node.name })); ok = false; continue; }
      if (!empty && S && !Q) {
        const a2 = yield* ask(`${a}, Are you sure (Y/N)? `);
        if (!/^y/i.test(a2.trim())) continue;
      }
      if (isSystem(sh, p.drive, r.canonical) || (!r.canonical.length)) { err(lines, "Access is denied."); note(lines, msg("system_protected")); ok = false; continue; }
      if (S && hasLocked(r.node)) { err(lines, `${full(p)}\\... - Access is denied.`); note(lines, msg("readonly_inside")); ok = false; continue; }
      const parent = parentOf(sh, p.drive, r.canonical);
      VFS.remove(parent, r.node.name);
      rec.removed = (rec.removed || []).concat(VFS.fmt(p.drive, r.canonical));
    }
    return ok;
  });
  function hasLocked(node) {
    let l = false;
    VFS.walk(node, [], (n) => { if (n.type === "file" && n.attrs && n.attrs.r) l = true; });
    return l;
  }

  /* ---------------- TYPE ---------------- */
  def("type", [], {
    summary: "Displays the contents of a text file.",
    usage: "Displays the contents of a text file or files.\n\nTYPE [drive:][path]filename",
  }, (sh, rest, lines, rec) => {
    const toks = tokenize(rest);
    rec.args = toks.map((t) => t.v); rec.switches = [];
    if (toks.length === 1 && toks[0].v === "/?") { showUsage(lines, COMMANDS.type); return true; }
    if (!toks.length) { err(lines, "The syntax of the command is incorrect."); note(lines, msg("syntax", { cmd: "type" })); return false; }
    let ok = true;
    const many = toks.length > 1 || toks.some((t) => /[*?]/.test(t.v));
    toks.forEach((tk) => {
      const e = expand(sh, tk.v);
      if (!e.items.length) {
        err(lines, e.missingDir ? "The system cannot find the path specified." : "The system cannot find the file specified.");
        if (!e.missingDir) note(lines, msg("file_not_found"));
        ok = false; return;
      }
      e.items.forEach((it) => {
        if (it.node.type === "dir") { if (!many) { err(lines, "Access is denied."); note(lines, msg("type_dir", { name: it.node.name })); ok = false; } return; }
        if (many) { out(lines, ""); out(lines, it.node.name); out(lines, ""); out(lines, ""); }
        if (it.node.binary) { out(lines, "ÿØÿà JFIF  ☺☺ ` `  ÿÛ C ☻☺☺☻☺..."); note(lines, msg("type_binary", { ext: it.node.name.split(".").pop() })); return; }
        (VFS.linesOf(it.node) || []).forEach((l) => out(lines, l));
      });
    });
    return ok;
  });

  /* ---------------- ECHO ---------------- */
  def("echo", [], {
    summary: "Displays messages, or turns command-echoing on or off.",
    usage: "Displays messages, or turns command-echoing on or off.\n\n  ECHO [ON | OFF]\n  ECHO [message]\n\nType ECHO without parameters to display the current echo setting.",
    keep: true,
  }, (sh, rest, lines, rec, io, ctx) => {
    rec.switches = [];
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.echo); return true; }
    if (/^[.(:;+\/\[\]]/.test(rest)) { out(lines, rest.slice(1)); rec.args = rest.slice(1) ? [rest.slice(1)] : []; return true; }
    const text = rest.replace(/^\s/, "");
    rec.args = text.trim() ? [text] : [];
    if (!text.trim()) { out(lines, sh.echo ? "ECHO is on." : "ECHO is off."); return true; }
    const t = text.trim().toLowerCase();
    if (t === "on" || t === "off") {
      if (ctx.frame) sh.echo = t === "on";
      else note(lines, msg("echo_onoff"));
      return true;
    }
    out(lines, text);
    return true;
  });

  def("cls", [], { summary: "Clears the screen.", usage: "Clears the screen.\n\nCLS", keep: true }, (sh, rest, lines, rec, io, ctx) => {
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.cls); return true; }
    ctx.screen.length = 0; ctx.clear = true; rec.clear = true; return true;
  });

  def("ver", [], { summary: "Displays the Windows version.", usage: "Displays the Windows version.\n\nVER" }, (sh, rest, lines) => {
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.ver); return true; }
    out(lines, ""); out(lines, sh.mode === "winre" ? "Microsoft Windows [Version 10.0.22621.1]" : "Microsoft Windows [Version 10.0.22631.4317]"); return true;
  });

  def("help", [], {
    summary: "Provides Help information for Windows commands.",
    usage: "Provides help information for Windows commands.\n\nHELP [command]\n\n    command - displays help information on that command.",
    keep: true,
  }, (sh, rest, lines, rec) => {
    const a = rest.trim().toLowerCase();
    rec.args = a ? [a] : [];
    if (a === "/?") { showUsage(lines, COMMANDS.help); return true; }
    if (a) {
      if (COMMANDS[a]) { showUsage(lines, COMMANDS[a]); return true; }
      out(lines, `This command is not supported by the help utility.  Try "${a} /?".`);
      return false;
    }
    out(lines, "For more information on a specific command, type HELP command-name");
    const seen = new Set();
    Object.keys(COMMANDS).sort().forEach((k) => {
      const c = COMMANDS[k];
      if (seen.has(c.name) || c.hidden || c.winre) return; seen.add(c.name);
      out(lines, c.name.toUpperCase().padEnd(15) + c.summary);
    });
    note(lines, msg("help_footer"));
    return true;
  });

  def("title", [], { summary: "Sets the window title for a CMD.EXE session.", usage: "Sets the window title for the command prompt window.\n\nTITLE [string]", keep: true }, (sh, rest, lines, rec) => {
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.title); return true; }
    sh.title = rest.trim() || null; rec.title = sh.title; return true;
  });

  def("color", [], {
    summary: "Sets the default console foreground and background colors.",
    usage: "Sets the default console foreground and background colors.\n\nCOLOR [attr]\n\n  attr        Specifies color attribute of console output\n\nColor attributes are specified by TWO hex digits -- the first\ncorresponds to the background; the second the foreground.\n\n    0 = Black       8 = Gray\n    1 = Blue        9 = Light Blue\n    2 = Green       A = Light Green\n    3 = Aqua        B = Light Aqua\n    4 = Red         C = Light Red\n    5 = Purple      D = Light Purple\n    6 = Yellow      E = Light Yellow\n    7 = White       F = Bright White",
  }, (sh, rest, lines, rec) => {
    const a = rest.trim();
    if (a === "/?") { showUsage(lines, COMMANDS.color); return true; }
    if (!a) { sh.color = null; rec.color = null; return true; }
    if (!/^[0-9a-f]{1,2}$/i.test(a)) { showUsage(lines, COMMANDS.color); return false; }
    const v = a.length === 1 ? "0" + a : a;
    if (v[0].toLowerCase() === v[1].toLowerCase()) { note(lines, msg("color_same")); return false; }
    sh.color = v.toLowerCase(); rec.color = sh.color; return true;
  });

  /* ---------------- SET ---------------- */
  def("set", [], {
    summary: "Displays, sets, or removes Windows environment variables.",
    usage: "Displays, sets, or removes cmd.exe environment variables.\n\nSET [variable=[string]]\n\n  variable  Specifies the environment-variable name.\n  string    Specifies a series of characters to assign to the variable.\n\nType SET without parameters to display the current environment variables.\n\nSET /A expression\nSET /P variable=[promptString]\n\nThe /A switch specifies that the string to the right of the equal sign\nis a numerical expression that is evaluated.\n\nThe /P switch allows you to set the value of a variable to a line of input\nentered by the user.  Displays the specified promptString before reading\nthe line of input.",
  }, function* (sh, rest, lines, rec, io, ctx) {
    let s = rest.replace(/^\s+/, "");
    rec.switches = [];
    if (s === "/?") { showUsage(lines, COMMANDS.set); return true; }
    if (!s) {
      Object.keys(sh.env).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).forEach((k) => out(lines, `${k}=${sh.env[k]}`));
      return true;
    }
    const am = s.match(/^\/a\s*/i);
    if (am) {
      rec.switches = ["/a"];
      const expr = s.slice(am[0].length).replace(/^"(.*)"$/, "$1");
      rec.args = [expr];
      try {
        const v = SetA.evaluate(expr, sh);
        if (!ctx.frame) out(lines, String(v));
        return true;
      } catch (e) {
        err(lines, e.message || "Missing operand.");
        note(lines, msg("seta_error"));
        return false;
      }
    }
    const pm = s.match(/^\/p\s*/i);
    if (pm) {
      rec.switches = ["/p"];
      let body = s.slice(pm[0].length);
      if (/^".*"$/.test(body.trim())) body = body.trim().slice(1, -1);
      const eq = body.indexOf("=");
      if (eq <= 0) { err(lines, "The syntax of the command is incorrect."); return false; }
      const name = body.slice(0, eq);
      let promptText = body.slice(eq + 1);
      if (/^".*"$/.test(promptText)) promptText = promptText.slice(1, -1);
      rec.args = [name];
      const ans = yield* ask(promptText, "line");
      if (ans === "") return 1;
      setVar(sh, name, ans);
      rec.value = ans;
      return true;
    }
    let body = s;
    if (body.startsWith('"')) {
      const lq = body.lastIndexOf('"');
      body = body.slice(1, lq > 0 ? lq : body.length);
    }
    const eq = body.indexOf("=");
    if (eq < 0) {
      const pre = body.trim().toLowerCase();
      const keys = Object.keys(sh.env).filter((k) => k.toLowerCase().startsWith(pre)).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      if (!keys.length) { err(lines, `Environment variable ${body.trim()} not defined`); return false; }
      keys.forEach((k) => out(lines, `${k}=${sh.env[k]}`));
      return true;
    }
    if (eq === 0) { err(lines, "The syntax of the command is incorrect."); return false; }
    const name = body.slice(0, eq), value = body.slice(eq + 1);
    rec.args = [name, value]; rec.varName = name; rec.value = value;
    setVar(sh, name, value);
    if (/\s$/.test(name)) note(lines, msg("set_space_name", { name: name.trimEnd() }));
    else if (/^\s/.test(value)) note(lines, msg("set_space_value"));
    return true;
  });

  def("prompt", [], { summary: "Changes the Windows command prompt.", usage: "Changes the cmd.exe command prompt.\n\nPROMPT [text]\n\n  $P   Current drive and path\n  $G   > (greater-than sign)\n  $N   Current drive\n  $D   Current date\n  $T   Current time\n  $_   Carriage return and linefeed\n  $$   $ (dollar sign)", keep: true }, (sh, rest, lines) => {
    const a = rest.trim();
    if (a === "/?") { showUsage(lines, COMMANDS.prompt); return true; }
    setVar(sh, "PROMPT", a || "$P$G");
    return true;
  });

  def("path", [], { summary: "Displays or sets a search path for executable files.", usage: "Displays or sets a search path for executable files.\n\nPATH [[drive:]path[;...][;%PATH%]\nPATH ;\n\nType PATH ; to clear all search-path settings and direct cmd.exe to search\nonly in the current directory.\nType PATH without parameters to display the current path." }, (sh, rest, lines) => {
    const a = rest.trim();
    if (a === "/?") { showUsage(lines, COMMANDS.path); return true; }
    if (!a) { const v = getVar(sh, "PATH"); out(lines, v ? "PATH=" + v : "No Path"); return true; }
    setVar(sh, "Path", a === ";" ? "" : a.replace(/^=/, ""));
    return true;
  });

  def("date", [], { summary: "Displays or sets the date.", usage: "Displays or sets the date.\n\nDATE [/T | date]\n\nType DATE without parameters to display the current date setting and\na prompt for a new one.  Press ENTER to keep the same date." }, function* (sh, rest, lines) {
    const a = rest.trim().toLowerCase();
    if (a === "/?") { showUsage(lines, COMMANDS.date); return true; }
    if (a === "/t") { out(lines, lib.dateStr() + " "); return true; }
    out(lines, "The current date is: " + lib.dateStr());
    const ans = a || (yield* ask("Enter the new date: (mm-dd-yy) "));
    if (ans.trim()) { err(lines, "A required privilege is not held by the client."); note(lines, msg("date_set")); return false; }
    return true;
  });
  def("time", [], { summary: "Displays or sets the system time.", usage: "Displays or sets the system time.\n\nTIME [/T | time]\n\nType TIME with no parameters to display the current time setting and a prompt\nfor a new one.  Press ENTER to keep the same time." }, function* (sh, rest, lines) {
    const a = rest.trim().toLowerCase();
    if (a === "/?") { showUsage(lines, COMMANDS.time); return true; }
    if (a === "/t") { const d = new Date(); let h = d.getHours(); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; out(lines, `${String(h).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${ap}`); return true; }
    out(lines, "The current time is: " + lib.timeStr());
    const ans = a || (yield* ask("Enter the new time: "));
    if (ans.trim()) { err(lines, "A required privilege is not held by the client."); note(lines, msg("date_set")); return false; }
    return true;
  });

  def("vol", [], { summary: "Displays a disk volume label and serial number.", usage: "Displays the disk volume label and serial number, if they exist.\n\nVOL [drive:]" }, (sh, rest, lines) => {
    const a = rest.trim();
    if (a === "/?") { showUsage(lines, COMMANDS.vol); return true; }
    const L = (a.match(/^([a-z]):?$/i) || [null, sh.drive])[1].toUpperCase();
    const d = VFS.getDrive(sh.fs, L);
    if (!d) { err(lines, "The system cannot find the path specified."); return false; }
    out(lines, d.label ? ` Volume in drive ${L} is ${d.label}` : ` Volume in drive ${L} has no label.`);
    out(lines, ` Volume Serial Number is ${d.serial}`);
    return true;
  });

  def("start", [], { summary: "Starts a separate window to run a specified program or command.", usage: "Starts a separate window to run a specified program or command.\n\nSTART [\"title\"] [/D path] [/MIN] [/MAX] [/WAIT] [command/program] [parameters]" }, (sh, rest, lines) => {
    const a = rest.trim();
    if (a === "/?") { showUsage(lines, COMMANDS.start); return true; }
    const t = tokenize(a).filter((x) => !(x.q && x.v === "") && !x.v.startsWith("/"));
    const what = t.length ? t[0].v : "cmd";
    note(lines, msg("start_note", { what }));
    return true;
  });

  def("cmd", [], { summary: "Starts a new instance of the Windows command interpreter.", usage: "Starts a new instance of the Windows command interpreter\n\nCMD [/C | /K] [string]\n\n/C      Carries out the command specified by string and then terminates\n/K      Carries out the command specified by string but remains", keep: true }, function* (sh, rest, lines, rec, io, ctx) {
    const a = rest.trim();
    if (a === "/?") { showUsage(lines, COMMANDS.cmd); return true; }
    const m = a.match(/^\/([ck])\s+(.*)$/i);
    if (m) {
      const inner = m[2].replace(/^"(.*)"$/, "$1");
      const node = lib.parseStmt(inner);
      return yield* lib.exec(node, ctx, io);
    }
    Shell.banner().forEach((l) => out(lines, l.text));
    note(lines, msg("cmd_nested"));
    return true;
  });

  def("clip", [], { summary: "Copies the output of a command to the Windows clipboard.", usage: "CLIP\n\nRedirects output of command line tools to the Windows clipboard.\n\n    DIR | CLIP     Places a copy of the current directory listing into the clipboard." }, (sh, rest, lines, rec, io) => {
    if (rest.trim() === "/?") { showUsage(lines, COMMANDS.clip); return true; }
    if (!io.stdin) { note(lines, msg("clip_no_input")); return true; }
    rec.clipboard = io.stdin.join("\n");
    io.stdin.length = 0;
    note(lines, msg("clip_done"));
    return true;
  });

  def("doskey", [], { summary: "Edits command lines and shows command history.", usage: "DOSKEY [/HISTORY]\n\n  /HISTORY    Displays all commands stored in memory.", hidden: false, keep: true }, (sh, rest, lines) => {
    const a = rest.trim().toLowerCase();
    if (a === "/history" || a === "/h") { sh.history.slice(0, -1).forEach((h) => out(lines, h)); return true; }
    showUsage(lines, COMMANDS.doskey);
    return true;
  });

  /* ---------------- WHERE ---------------- */
  def("where", [], {
    summary: "Displays the location of files that match a search pattern.",
    usage: "WHERE [/R dir] [/Q] [/F] [/T] pattern...\n\nDescription:\n    Displays the location of files that match the search pattern.\n    By default, the search is done along the current directory and in\n    the paths specified by the PATH environment variable.\n\nParameter List:\n    /R       Recursively searches and displays the files that match the\n             given pattern starting from the specified directory.\n\n    /Q       Returns only the exit code, without displaying the list\n             of matched files. (Quiet mode)",
  }, (sh, rest, lines, rec) => {
    const toks = tokenize(rest);
    let root = null, quiet = false;
    const pats = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i].v.toLowerCase();
      if (t === "/?") { showUsage(lines, COMMANDS.where); return true; }
      if (t === "/r") { root = toks[++i] ? toks[i].v : null; continue; }
      if (t === "/q") { quiet = true; continue; }
      if (t.startsWith("/")) continue;
      pats.push(toks[i].v);
    }
    rec.args = pats; rec.switches = root ? ["/r"] : [];
    if (!pats.length) { err(lines, "ERROR: A search pattern must be specified."); note(lines, msg("syntax", { cmd: "where" })); return 2; }
    const found = [];
    const exts = (getVar(sh, "PATHEXT") || ".EXE").toLowerCase().split(";");
    pats.forEach((pat) => {
      const reList = [VFS.wildcardToRegex(pat)];
      if (!/\./.test(pat)) exts.forEach((e) => reList.push(VFS.wildcardToRegex(pat + e)));
      const test = (n) => reList.some((re) => re.test(n));
      if (root) {
        const rp = P(sh, root);
        const rn = R(sh, rp);
        if (!rn.node || rn.node.type !== "dir") return;
        const visit = (node, parts) => {
          VFS.sortedChildren(node).forEach((c) => { if (c.type === "file" && test(c.name)) found.push(VFS.fmt(rp.drive, parts.concat(c.name))); });
          VFS.sortedChildren(node).forEach((c) => { if (c.type === "dir") visit(c, parts.concat(c.name)); });
        };
        visit(rn.node, rn.canonical);
      } else {
        const dirs = [cwdPath(sh)].concat((getVar(sh, "PATH") || "").split(";").filter(Boolean));
        const seen = new Set();
        dirs.forEach((d) => {
          const p = P(sh, d);
          const n = R(sh, p);
          if (!n.node || n.node.type !== "dir") return;
          VFS.sortedChildren(n.node).forEach((c) => {
            if (c.type !== "file" || !test(c.name)) return;
            const f = VFS.fmt(p.drive, n.canonical.concat(c.name));
            if (!seen.has(f.toLowerCase())) { seen.add(f.toLowerCase()); found.push(f); }
          });
        });
      }
    });
    rec.found = found.length;
    if (!found.length) { if (!quiet) err(lines, "INFO: Could not find files for the given pattern(s)."); return 1; }
    if (!quiet) found.forEach((f) => out(lines, f));
    return true;
  });
})();
