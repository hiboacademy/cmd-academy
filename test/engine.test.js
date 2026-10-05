/* Simulator engine tests: paths, file commands, wildcards, redirection,
   pipes, chaining and Batch. Everything runs in the virtual file system. */
const test = require("node:test");
const assert = require("node:assert");
const { load, ENGINE } = require("./load.js");
const { Shell, VFS } = load(ENGINE);

const fresh = (opts) => Shell.create(opts || {});
const run = (sh, line, answers) => Shell.runAll(sh, line, answers || [], { defaultAnswer: "" });
const out = (sh, line, answers) => run(sh, line, answers).text;
const node = (sh, path) => { const p = VFS.parse(path, sh.drive, sh.cwd); return VFS.resolve(sh.fs, p.drive, p.parts).node; };
const content = (sh, path) => { const n = node(sh, path); return n && n.content; };
const writeBatch = (sh, name, lines) => {
  const desk = node(sh, "C:\\Users\\Student\\Desktop");
  VFS.writeFile(desk, name, lines.join("\n") + "\n", false);
  Shell.setLocation(sh, "C:\\Users\\Student\\Desktop");
};

test("security: the simulator never touches the real system", () => {
  const src = ["shell", "cmd-core", "cmd-files", "cmd-system", "cmd-disk", "cmd-batch", "cmd-network", "cmd-text", "vfs"]
    .map((f) => require("fs").readFileSync(require("path").join(__dirname, "../src/engine/" + f + ".js"), "utf8")).join("\n");
  assert.ok(!/child_process|require\(|\beval\(|new Function|XMLHttpRequest|fetch\(/.test(src), "engine must stay sandboxed");
});

test("paths: absolute, relative, parent, root and drives", () => {
  const sh = fresh();
  assert.strictEqual(Shell.cwdPath(sh), "C:\\Users\\Student");
  run(sh, "cd Documents\\Work");
  assert.strictEqual(Shell.cwdPath(sh), "C:\\Users\\Student\\Documents\\Work");
  run(sh, "cd ..\\..\\Pictures");
  assert.strictEqual(Shell.cwdPath(sh), "C:\\Users\\Student\\Pictures");
  run(sh, "cd \\");
  assert.strictEqual(Shell.cwdPath(sh), "C:\\");
  run(sh, "cd D:\\Projects");
  assert.strictEqual(Shell.cwdPath(sh), "C:\\", "cd to another drive does not switch drive");
  run(sh, "D:");
  assert.strictEqual(Shell.cwdPath(sh), "D:\\Projects", "each drive remembers its folder");
  run(sh, "cd /d C:\\Users\\Student\\Desktop");
  assert.strictEqual(Shell.cwdPath(sh), "C:\\Users\\Student\\Desktop");
  run(sh, 'cd "..\\Pictures\\Summer 2026"');
  assert.strictEqual(Shell.cwdPath(sh), "C:\\Users\\Student\\Pictures\\Summer 2026");
  assert.match(out(sh, "cd NoSuchFolder"), /cannot find the path/);
  run(sh, "cd /d c:\\USERS\\student");
  assert.strictEqual(Shell.cwdPath(sh), "C:\\Users\\Student", "paths are case-insensitive and shown in stored case");
});

test("pushd and popd return to the remembered folder", () => {
  const sh = fresh();
  run(sh, "pushd D:\\Backup");
  assert.strictEqual(Shell.cwdPath(sh), "D:\\Backup");
  run(sh, "popd");
  assert.strictEqual(Shell.cwdPath(sh), "C:\\Users\\Student");
});

test("mkdir, rmdir and the not-empty rule", () => {
  const sh = fresh();
  run(sh, "mkdir A\\B\\C");
  assert.strictEqual(node(sh, "A\\B\\C").type, "dir");
  assert.match(out(sh, "rd A"), /not empty/);
  run(sh, "rd /s /q A");
  assert.strictEqual(node(sh, "A"), null);
  assert.match(out(sh, "mkdir Documents"), /already exists/);
});

test("copy, move, ren and del", () => {
  const sh = fresh();
  run(sh, "copy Desktop\\notes.txt D:\\Backup");
  assert.ok(node(sh, "D:\\Backup\\notes.txt"));
  assert.ok(node(sh, "Desktop\\notes.txt"), "copy keeps the source");
  run(sh, "move Downloads\\invoice.pdf Documents");
  assert.ok(node(sh, "Documents\\invoice.pdf"));
  assert.strictEqual(node(sh, "Downloads\\invoice.pdf"), null);
  run(sh, "ren Documents\\menu.txt menu_2026.txt");
  assert.ok(node(sh, "Documents\\menu_2026.txt"));
  assert.strictEqual(node(sh, "Documents\\menu.txt"), null);
  run(sh, "del Documents\\Work\\draft.tmp");
  assert.strictEqual(node(sh, "Documents\\Work\\draft.tmp"), null);
  assert.match(out(sh, "del nothing.txt"), /Could Not Find/);
  // overwrite asks; answering No keeps the old file
  run(sh, "echo old> a.txt");
  run(sh, "echo new> b.txt");
  run(sh, "copy b.txt a.txt", ["n"]);
  assert.match(content(sh, "a.txt"), /old/);
  run(sh, "copy /y b.txt a.txt");
  assert.match(content(sh, "a.txt"), /new/);
  // concatenation
  run(sh, "copy a.txt+b.txt ab.txt");
  assert.strictEqual(content(sh, "ab.txt").replace(/\r/g, ""), "new\nnew\n");
});

test("read-only files cannot be deleted without /f", () => {
  const sh = fresh();
  run(sh, "attrib +r Desktop\\notes.txt");
  assert.match(out(sh, "del Desktop\\notes.txt"), /Access is denied/);
  assert.ok(node(sh, "Desktop\\notes.txt"));
  run(sh, "del /f Desktop\\notes.txt");
  assert.strictEqual(node(sh, "Desktop\\notes.txt"), null);
});

test("wildcards: * and ?", () => {
  const sh = fresh();
  Shell.setLocation(sh, "C:\\Users\\Student\\Documents\\Work");
  const names = (pat) => out(sh, "dir /b " + pat).split("\n").filter((l) => /\.\w+$/.test(l.trim())).map((l) => l.trim()).sort();
  assert.deepStrictEqual(names("report*.txt"), ["report.txt", "report1.txt", "report10.txt", "report2.txt"]);
  assert.deepStrictEqual(names("report?.txt"), ["report.txt", "report1.txt", "report2.txt"]);
  assert.deepStrictEqual(names("*.tmp"), ["draft.tmp"]);
  run(sh, "copy report?.txt D:\\Backup");
  assert.ok(node(sh, "D:\\Backup\\report1.txt"));
  assert.strictEqual(node(sh, "D:\\Backup\\report10.txt"), null);
  run(sh, "ren *.tmp *.bak");
  assert.ok(node(sh, "draft.bak"));
  run(sh, "del *.txt");
  assert.strictEqual(Object.values(node(sh, ".").children).filter((n) => n.name.endsWith(".txt")).length, 0);
});

test("redirection: >, >>, <, 2>, 2>&1 and nul", () => {
  const sh = fresh();
  run(sh, "echo one> f.txt");
  run(sh, "echo two>> f.txt");
  assert.strictEqual(content(sh, "f.txt"), "one\ntwo\n");
  run(sh, "echo three> f.txt");
  assert.strictEqual(content(sh, "f.txt"), "three\n", "> replaces the file");
  assert.match(out(sh, "sort < Documents\\guests.txt").trim(), /^Ali\nDavid/);
  const r = run(sh, "dir NoSuch 2> err.txt");
  assert.ok(!/File Not Found/.test(r.lines.filter((l) => l.t === "err").map((l) => l.text).join("\n")), "stderr goes to the file");
  assert.match(content(sh, "err.txt"), /File Not Found/);
  run(sh, "dir NoSuch 2>> err.txt");
  assert.strictEqual((content(sh, "err.txt").match(/File Not Found/g) || []).length, 2);
  run(sh, "dir Documents NoSuch > all.txt 2>&1");
  assert.match(content(sh, "all.txt"), /menu\.txt/);
  assert.match(content(sh, "all.txt"), /File Not Found/);
  assert.strictEqual(out(sh, "echo hidden > nul").trim(), "");
  assert.match(out(sh, "echo x > NoDir\\f.txt"), /cannot find the path/);
});

test("pipes", () => {
  const sh = fresh();
  assert.strictEqual(out(sh, 'type Documents\\menu.txt | find "Pizza"').trim(), "Pizza      8.50");
  assert.match(out(sh, "type Documents\\guests.txt | sort | more"), /Ali[\s\S]*Sara/);
  assert.strictEqual(out(sh, 'type Documents\\guests.txt | find /c /v ""').trim(), "6");
  assert.match(out(sh, 'ipconfig | find "IPv4"'), /192\.168\.1\.24/);
  assert.match(out(sh, 'tasklist | find /i "notepad"'), /notepad\.exe/);
});

test("chaining: &, && and ||", () => {
  const sh = fresh();
  assert.match(out(sh, "echo a & echo b"), /a\s*\nb/);
  assert.match(out(sh, "mkdir X && echo made"), /made/);
  assert.ok(!/made/.test(out(sh, "mkdir X && echo made")), "&& skips after a failure");
  assert.match(out(sh, "type none.txt || echo missing"), /missing/);
  assert.ok(!/missing/.test(out(sh, "type Desktop\\notes.txt || echo missing")), "|| skips after success");
  assert.match(out(sh, "type none.txt && echo ok || echo failed"), /failed/);
});

test("errorlevel follows success and failure", () => {
  const sh = fresh();
  run(sh, "dir NoSuch");
  assert.notStrictEqual(sh.errorlevel, 0);
  run(sh, "dir");
  assert.strictEqual(sh.errorlevel, 0);
  run(sh, "notacommand");
  assert.strictEqual(sh.errorlevel, 9009);
});

test("variables: set, set /a, expansion and substrings", () => {
  const sh = fresh();
  run(sh, "set city=Tehran");
  assert.strictEqual(out(sh, "echo %city%").trim(), "Tehran");
  assert.strictEqual(out(sh, "echo %CITY%").trim(), "Tehran", "variable names are case-insensitive");
  assert.strictEqual(out(sh, "echo %nothing%").trim(), "%nothing%", "undefined stays as text at the prompt");
  run(sh, "set /a total=(4+2)*3");
  assert.strictEqual(Shell.getVar(sh, "total"), "18");
  assert.strictEqual(out(sh, "echo %city:~0,3%").trim(), "Teh");
  assert.strictEqual(out(sh, "echo %city:Teh=Sh%").trim(), "Shran");
  run(sh, "set /p name=Name: ", ["Sara"]);
  assert.strictEqual(Shell.getVar(sh, "name"), "Sara");
});

test("batch: arguments, IF, ELSE, GOTO and CALL", () => {
  const sh = fresh();
  writeBatch(sh, "t.bat", [
    "@echo off",
    "if \"%~1\"==\"\" (echo no args) else (echo first=%1)",
    "if exist notes.txt echo notes found",
    "if not exist none.txt echo none missing",
    "set n=5",
    "if %n% gtr 3 echo big",
    "call :greet World",
    "goto end",
    "echo SKIPPED",
    ":end",
    "echo done",
    "goto :eof",
    ":greet",
    "echo Hello %1",
    "exit /b 0",
  ]);
  const t = out(sh, "t.bat Ali");
  assert.match(t, /first=Ali/);
  assert.match(t, /notes found/);
  assert.match(t, /none missing/);
  assert.match(t, /big/);
  assert.match(t, /Hello World/);
  assert.match(t, /done/);
  assert.ok(!/SKIPPED/.test(t));
  assert.ok(!/@echo off|if exist/.test(t), "echo off hides the script lines");
  assert.match(out(sh, "t.bat"), /no args/);
});

test("batch: FOR loops and delayed expansion", () => {
  const sh = fresh();
  writeBatch(sh, "loop.bat", [
    "@echo off",
    "setlocal enabledelayedexpansion",
    "for /l %%i in (1,2,7) do echo N%%i",
    "for %%f in (..\\Documents\\*.txt) do echo F:%%~nxf",
    "set count=0",
    "for %%x in (a b c) do set /a count+=1",
    "echo count=!count!",
    "set c2=0",
    "for %%x in (a b) do (set /a c2+=1 & echo inside=!c2!)",
    "for /f \"tokens=1,2 delims=,\" %%a in (data.csv) do echo %%b-%%a",
  ]);
  VFS.writeFile(node(sh, "C:\\Users\\Student\\Desktop"), "data.csv", "Ali,10\nSara,20\n", false);
  const t = out(sh, "loop.bat");
  assert.match(t, /N1\s*\nN3\s*\nN5\s*\nN7/);
  assert.match(t, /F:menu\.txt/);
  assert.match(t, /count=3/);
  assert.match(t, /inside=1[\s\S]*inside=2/);
  assert.match(t, /10-Ali\s*\n20-Sara/);
  assert.strictEqual(Shell.getVar(sh, "count"), null, "setlocal changes end with the script");
});

test("batch: infinite loops are stopped safely", () => {
  const sh = fresh();
  writeBatch(sh, "inf.bat", ["@echo off", ":top", "goto top"]);
  const r = run(sh, "inf.bat");
  assert.ok(r.lines.length < 50, "the runner stops the loop and returns");
});

test("dangerous commands stay inside the sandbox", () => {
  const sh = fresh({ admin: true });
  run(sh, "format E: /fs:exfat /q", ["", "y"]);
  // E: still exists as a virtual drive; nothing outside the VFS is reachable
  assert.ok(sh.fs.drives.E);
  const sh2 = fresh();
  assert.match(out(sh2, "rd /s /q C:\\Windows"), /denied|in use|Access/i);
  assert.ok(node(sh2, "C:\\Windows\\System32"), "system folders are protected");
});

test("Ctrl+C cancels a waiting command", () => {
  const sh = fresh();
  const r = Shell.run(sh, "ping -t google.com");
  assert.ok(sh.pending, "ping -t waits");
  Shell.cancel(sh);
  assert.ok(!sh.pending);
  assert.ok(r);
});
