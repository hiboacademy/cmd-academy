/* ============================================================
   engine/vfs.js — Virtual File System
   Everything lives in memory. Nothing touches the real device.
   Nodes: { type:"dir", name, t, attrs, children:{lowername:node} }
          { type:"file", name, t, attrs, content | binary+size }
   attrs: { h:hidden, r:read-only, s:system, a:archive }
   ============================================================ */
const VFS = (() => {
  const INVALID_NAME = /[<>:"\/\\|?*]/;

  function D(name, t, children = [], attrs) {
    const map = {};
    children.forEach((c) => { map[c.name.toLowerCase()] = c; });
    return { type: "dir", name, t, attrs: attrs || {}, children: map };
  }
  function F(name, t, content, size, attrs) {
    const n = { type: "file", name, t, attrs: Object.assign({ a: true }, attrs || {}) };
    if (typeof content === "string") { n.content = content; n.size = byteLen(content); }
    else { n.binary = true; n.size = size || 0; }
    return n;
  }
  function byteLen(s) { return String(s).replace(/\n/g, "\r\n").length; }

  /* The default sandbox disk layout (C:, D:, E: = USB). */
  function createDefault() {
    const t1 = "2026-09-20T09:12", t2 = "2026-09-28T10:15", t3 = "2026-10-01T18:40", t4 = "2026-10-03T08:05";
    const C = D("", t1, [
      D("Program Files", t1, [
        D("CMD Academy", t1, [F("academy.exe", t1, null, 1843200), F("readme.txt", t1, "CMD Academy - learn Windows Command Prompt safely.\n")]),
        D("Common Files", t1),
      ]),
      D("Users", t1, [
        D("Public", t1, [D("Documents", t1)]),
        D("Student", t2, [
          D("AppData", t1, [D("Local", t1, [D("Temp", t4, [
            F("log1.tmp", t4, "temporary log 1\n"), F("cache.tmp", t4, null, 65536), F("setup_log.txt", t4, "Setup finished.\n"),
          ])]), D("Roaming", t1)], { h: true }),
          D("Desktop", t2, [
            F("notes.txt", t3, "Remember: practice CMD every day!\n"),
            F("shopping list.txt", t3, "milk\nbread\neggs\ncoffee\n"),
          ]),
          D("Documents", t2, [
            D("Work", t2, [
              F("report.txt", t3, "Monthly report\nSales: 1,240\nStatus: OK\n"),
              F("report1.txt", t3, "Report 1\nJanuary sales: 980\n"),
              F("report2.txt", t3, "Report 2\nFebruary sales: 1,105\n"),
              F("report10.txt", t3, "Report 10\nOctober sales: 1,312\n"),
              F("draft.tmp", t3, "unfinished text\n"),
            ]),
            F("todo.txt", t3, "1. Learn dir\n2. Learn cd\n3. Create a folder with mkdir\n"),
            F("menu.txt", t3, "Restaurant Menu\n---------------\nPizza      8.50\nPasta      7.00\nSalad      5.50\nSoup       4.50\nCoffee     2.50\n"),
            F("guests.txt", t3, "Sara\nAli\nmina\nReza\nhibo\nDavid\n"),
            F("secret.txt", t3, "You found the hidden file!\n", 0, { h: true }),
          ]),
          D("Downloads", t2, [
            F("setup.exe", t2, null, 5242880), F("invoice.pdf", t2, null, 183206), F("photos.zip", t2, null, 8388608),
            F("temp1.tmp", t3, "temp\n"), F("temp2.tmp", t3, "temp\n"),
          ]),
          D("Music", t2, [F("song.mp3", t2, null, 3145728), F("podcast.mp3", t2, null, 20971520)]),
          D("Pictures", t2, [
            D("Holidays", t2, [F("family.jpg", t2, null, 912384)]),
            D("Summer 2026", t3, [F("sea.jpg", t3, null, 1520640), F("sunset.jpg", t3, null, 1288190)]),
            F("beach.jpg", t2, null, 1048576),
            F("cat.jpg", t3, null, 248311),
            F("logo.png", t3, null, 40960),
          ]),
        ]),
      ]),
      D("Windows", t1, [
        D("System32", t1, [
          D("drivers", t1, [D("etc", t1, [F("hosts", t1, "# Copyright (c) Microsoft Corp.\n#\n# This is a sample HOSTS file used by Microsoft TCP/IP for Windows.\n127.0.0.1       localhost\n")])]),
          ...["cmd.exe", "notepad.exe", "ping.exe", "ipconfig.exe", "tasklist.exe", "taskkill.exe", "tracert.exe", "nslookup.exe", "netstat.exe",
            "where.exe", "xcopy.exe", "robocopy.exe", "find.exe", "findstr.exe", "sort.exe", "more.com", "tree.com", "fc.exe", "attrib.exe",
            "hostname.exe", "whoami.exe", "systeminfo.exe", "chkdsk.exe", "sfc.exe", "dism.exe", "diskpart.exe", "shutdown.exe", "choice.exe",
            "timeout.exe", "getmac.exe", "arp.exe", "route.exe", "pathping.exe", "sc.exe", "net.exe", "calc.exe", "format.com", "clip.exe"]
            .map((n, i) => F(n, t1, null, 20480 + i * 4096)),
        ], { s: true }),
        D("Temp", t1),
        F("explorer.exe", t1, null, 5398528),
        F("notepad.exe", t1, null, 201216),
        F("win.ini", t1, "; for 16-bit app support\n[fonts]\n[extensions]\n"),
      ]),
    ]);
    const Dd = D("", t1, [
      D("Projects", t2, [D("website", t2, [F("index.html", t2, "<h1>Hello CMD Academy</h1>\n"), F("style.css", t2, "body { color: green; }\n")])]),
      D("Backup", t2, [F("readme.txt", t2, "Backups are stored here.\n")]),
    ]);
    const E = D("", t3, [D("Photos", t3), F("info.txt", t3, "USB stick for CMD Academy practice.\n")]);
    return {
      drives: {
        C: { label: "", serial: "1A2B-3C4D", fs: "NTFS", free: 48213442560, root: C, system: true },
        D: { label: "Data", serial: "7E10-22F5", fs: "NTFS", free: 312904118272, root: Dd },
        E: { label: "USB", serial: "0C3A-91B8", fs: "FAT32", free: 15021309952, root: E, removable: true },
      },
    };
  }

  function clone(fs) { return JSON.parse(JSON.stringify(fs)); }
  function emptyRoot() { return D("", nowIso(), []); }

  function nowIso() {
    const d = new Date(); d.setSeconds(0, 0);
    return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  /* Parse a user path into an absolute {drive, parts} using per-drive cwd. */
  function parse(input, curDrive, cwdMap) {
    let s = String(input).replace(/"/g, "").replace(/\//g, "\\").trim();
    let drive = curDrive, absolute = false, kind = "relative";
    const m = s.match(/^([a-zA-Z]):(.*)$/);
    if (m) { drive = m[1].toUpperCase(); s = m[2]; kind = "absolute"; }
    if (s.startsWith("\\")) { absolute = true; kind = "absolute"; }
    else if (m && s === "") { kind = "drive"; }
    const base = absolute ? [] : (cwdMap[drive] || []).slice();
    s.split("\\").forEach((seg) => {
      const p = seg.trim();
      if (!p || p === ".") return;
      if (p === "..") { base.pop(); return; }
      if (/^\.{3,}$/.test(p)) { base.pop(); base.pop(); return; }
      base.push(p);
    });
    return { drive, parts: base, kind };
  }

  function getDrive(fs, letter) { return fs.drives[letter] || null; }

  /* Walk to a node. Returns {node, canonical:[names]} or {node:null, ...} */
  function resolve(fs, drive, parts) {
    const d = getDrive(fs, drive);
    if (!d) return { node: null, noDrive: true };
    let node = d.root;
    const canonical = [];
    for (let i = 0; i < parts.length; i++) {
      if (node.type !== "dir") return { node: null, missingAt: i, throughFile: true };
      const next = node.children[parts[i].toLowerCase()];
      if (!next) return { node: null, missingAt: i, parent: i === parts.length - 1 ? node : null, canonical };
      canonical.push(next.name);
      node = next;
    }
    return { node, canonical };
  }

  function fmt(drive, parts) { return drive + ":\\" + parts.join("\\"); }

  function wildcardToRegex(p) {
    // "*.*" and "*" match everything (also names without extension)
    if (p === "*.*" || p === "*") return /^.*$/;
    let src = "";
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === "*") src += ".*";
      else if (c === "?") {
        // like CMD: "?" is one character, but may be empty right before "." or at the end
        const rest = p.slice(i + 1);
        src += (/^\?*(\.|$)/.test(rest)) ? ".?" : ".";
      } else src += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    // "name.*" also matches "name" (no extension)
    src = src.replace(/\\\.\.\*$/, "(\\..*)?");
    return new RegExp("^" + src + "$", "i");
  }
  const hasWild = (s) => /[*?]/.test(s);

  function mkdirp(fs, drive, parts, t) {
    const d = getDrive(fs, drive);
    let node = d.root;
    for (const p of parts) {
      let next = node.children[p.toLowerCase()];
      if (!next) { next = { type: "dir", name: p, t: t || nowIso(), attrs: {}, children: {} }; node.children[p.toLowerCase()] = next; }
      if (next.type !== "dir") return false;
      node = next;
    }
    return true;
  }

  function sortedChildren(dir) {
    return Object.values(dir.children).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  }

  function put(dir, node) { dir.children[node.name.toLowerCase()] = node; dir.t = nowIso(); }
  function remove(dir, name) { delete dir.children[name.toLowerCase()]; dir.t = nowIso(); }
  function copyNode(n) { return JSON.parse(JSON.stringify(n)); }

  function writeFile(dir, name, content, append) {
    const key = name.toLowerCase();
    const ex = dir.children[key];
    if (ex && ex.type === "dir") return "isdir";
    if (ex && ex.attrs && ex.attrs.r) return "readonly";
    if (ex && append && !ex.binary) {
      let c = ex.content || "";
      if (c && !c.endsWith("\n")) c += "\n";
      ex.content = c + content; ex.size = byteLen(ex.content); ex.t = nowIso();
      return "ok";
    }
    const f = F(name, nowIso(), content);
    if (ex) { f.name = ex.name; f.attrs = ex.attrs; }
    dir.children[key] = f;
    dir.t = nowIso();
    return "ok";
  }

  function textOf(node) { return node.binary ? null : (node.content || ""); }
  function linesOf(node) {
    const c = textOf(node);
    if (c == null) return null;
    if (c === "") return [];
    return c.replace(/\n$/, "").split("\n");
  }

  /* Walk a subtree: yields {node, parts} for every descendant */
  function walk(node, parts, cb) {
    if (node.type !== "dir") return;
    sortedChildren(node).forEach((c) => {
      const p = parts.concat(c.name);
      cb(c, p);
      if (c.type === "dir") walk(c, p, cb);
    });
  }
  function treeSize(node) {
    if (node.type === "file") return node.size;
    let s = 0; walk(node, [], (c) => { if (c.type === "file") s += c.size; }); return s;
  }

  return {
    createDefault, clone, emptyRoot, nowIso, parse, resolve, fmt, getDrive, wildcardToRegex, hasWild, mkdirp,
    sortedChildren, put, remove, copyNode, writeFile, textOf, linesOf, walk, treeSize, byteLen, INVALID_NAME, F, D,
  };
})();
