/* ============================================================
   engine/vfs.js — Virtual File System
   Everything lives in memory. Nothing touches the real device.
   Future: becomes src/engine/vfs.ts in the Vite project.
   ============================================================ */
const VFS = (() => {
  const INVALID_NAME = /[<>:"\/\\|?*]/;

  function D(name, t, children = []) {
    const map = {};
    children.forEach((c) => { map[c.name.toLowerCase()] = c; });
    return { type: "dir", name, t, children: map };
  }
  function F(name, t, content, size) {
    const n = { type: "file", name, t };
    if (typeof content === "string") { n.content = content; n.size = content.length; }
    else { n.binary = true; n.size = size || 0; }
    return n;
  }

  /* The default sandbox disk layout (C:, D:, E: = USB). */
  function createDefault() {
    const t1 = "2026-09-20T09:12", t2 = "2026-09-28T10:15", t3 = "2026-10-01T18:40";
    const C = D("", t1, [
      D("Program Files", t1, [D("Common Files", t1)]),
      D("Users", t1, [
        D("Public", t1),
        D("Student", t2, [
          D("Desktop", t2, [F("notes.txt", t3, "Remember: practice CMD every day!\n")]),
          D("Documents", t2, [
            D("Work", t2, [F("report.txt", t3, "Monthly report\nSales: 1,240\nStatus: OK\n")]),
            F("todo.txt", t3, "1. Learn dir\n2. Learn cd\n3. Create a folder with mkdir\n"),
            F("menu.txt", t3, "Restaurant Menu\n---------------\nPizza      8.50\nPasta      7.00\nSalad      5.50\n"),
          ]),
          D("Downloads", t2, [F("setup.exe", t2, null, 5242880)]),
          D("Music", t2, [F("song.mp3", t2, null, 3145728)]),
          D("Pictures", t2, [
            D("Holidays", t2, [F("family.jpg", t2, null, 912384)]),
            F("beach.jpg", t2, null, 1048576),
            F("cat.jpg", t3, null, 248311),
          ]),
        ]),
      ]),
      D("Windows", t1, [
        D("System32", t1, [F("cmd.exe", t1, null, 289792), F("notepad.exe", t1, null, 201216)]),
        F("win.ini", t1, "; for 16-bit app support\n[fonts]\n[extensions]\n"),
      ]),
    ]);
    const Dd = D("", t1, [
      D("Projects", t2, [D("website", t2, [F("index.html", t2, "<h1>Hello CMD Academy</h1>\n")])]),
      D("Backup", t2, [F("readme.txt", t2, "Backups are stored here.\n")]),
    ]);
    const E = D("", t3, [D("Photos", t3), F("info.txt", t3, "USB stick for CMD Academy practice.\n")]);
    return {
      drives: {
        C: { label: "", serial: "1A2B-3C4D", free: "48,213,442,560", root: C },
        D: { label: "Data", serial: "7E10-22F5", free: "312,904,118,272", root: Dd },
        E: { label: "USB", serial: "0C3A-91B8", free: "15,021,309,952", root: E },
      },
    };
  }

  function clone(fs) { return JSON.parse(JSON.stringify(fs)); }

  /* Parse a user path into an absolute {drive, parts} using per-drive cwd.
     cwdMap: { C: ["Users","Student"], D: [], ... }, curDrive: "C" */
  function parse(input, curDrive, cwdMap) {
    let s = String(input).replace(/"/g, "").replace(/\//g, "\\").trim();
    let drive = curDrive, absolute = false, kind = "relative";
    const m = s.match(/^([a-zA-Z]):(.*)$/);
    if (m) { drive = m[1].toUpperCase(); s = m[2]; kind = "absolute"; }
    if (s.startsWith("\\")) { absolute = true; kind = "absolute"; }
    const base = absolute ? [] : (cwdMap[drive] || []).slice();
    s.split("\\").forEach((seg) => {
      const p = seg.trim();
      if (!p || p === ".") return;
      if (p === "..") { base.pop(); return; }
      base.push(p);
    });
    return { drive, parts: base, kind };
  }

  function getDrive(fs, letter) { return fs.drives[letter] || null; }

  /* Walk to a node. Returns {node, canonical:[names]} or {node:null, missingAt} */
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
    const esc = p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp("^" + esc + "$", "i");
  }

  function mkdirp(fs, drive, parts, t) {
    const d = getDrive(fs, drive);
    let node = d.root;
    for (const p of parts) {
      let next = node.children[p.toLowerCase()];
      if (!next) { next = { type: "dir", name: p, t, children: {} }; node.children[p.toLowerCase()] = next; }
      if (next.type !== "dir") return false;
      node = next;
    }
    return true;
  }

  function sortedChildren(dir) {
    return Object.values(dir.children).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  }

  return { createDefault, clone, parse, resolve, fmt, getDrive, wildcardToRegex, mkdirp, sortedChildren, INVALID_NAME };
})();
