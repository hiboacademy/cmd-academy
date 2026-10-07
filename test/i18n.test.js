/* Three-language support (Persian, German, English) and the practice
   feedback helpers that work the same in every language. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const { ENGINE, ROOT } = require("./load.js");

const LANGS = ["fa", "de", "en"];
const B = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(fs.readFileSync(path.join(ROOT, `dist/content.${l}.json`), "utf8"))]));
const FA = /[\u0600-\u06FF]/;

// load engine + content + the shared view helpers (commandParts) into one context
function loadApp(lang) {
  const files = ENGINE.concat(["src/data/content.js", "src/ui/views-common.js"]);
  const ctx = vm.createContext({ console, Store: { mistakes: () => [] } });
  const code = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n") +
    "\n;this.__x = { Content, commandParts, splitCommandLine, T };";
  vm.runInContext(code, ctx);
  ctx.__x.Content.init(JSON.parse(JSON.stringify(B[lang])));
  return ctx.__x;
}

test("translations match the Persian structure (i18n_check)", () => {
  for (const l of ["de", "en"]) {
    const out = execFileSync("python3", [path.join(ROOT, "i18n_check.py"), l], { encoding: "utf8" });
    assert.match(out, /OK/, out);
  }
});

test("every language has every UI key the code uses", () => {
  const src = fs.readdirSync(path.join(ROOT, "src/ui")).map((f) => fs.readFileSync(path.join(ROOT, "src/ui", f), "utf8")).join("\n") +
    fs.readFileSync(path.join(ROOT, "src/app.js"), "utf8") + fs.readFileSync(path.join(ROOT, "src/data/content.js"), "utf8");
  const used = new Set([...src.matchAll(/\bT\("([a-z0-9_]+)"/g), ...src.matchAll(/Content\.t\("([a-z0-9_]+)"/g), ...src.matchAll(/key: "([a-z0-9_]+)"/g)].map((m) => m[1]));
  for (const l of LANGS) {
    const missing = [...used].filter((k) => !k.endsWith("_") && !(k in B[l].ui));
    assert.deepStrictEqual(missing, [], `${l} is missing UI keys`);
    assert.deepStrictEqual(Object.keys(B[l].ui).sort(), Object.keys(B.fa.ui).sort(), `${l} UI keys differ from fa`);
  }
});

test("German and English contain no Persian text and the same commands", () => {
  for (const l of ["de", "en"]) {
    const s = JSON.stringify({ lessons: B[l].lessons, commands: B[l].commands, challenges: B[l].challenges, shell: B[l].shell, ui: { ...B[l].ui } });
    const left = s.replace(/فارسی/g, "").match(FA);
    assert.ok(!left, `${l} still has Persian text near: ${left && s.slice(left.index - 40, left.index + 40)}`);
    B.fa.lessons.forEach((fl, i) => {
      const tl = B[l].lessons[i];
      assert.strictEqual(tl.n, fl.n);
      fl.practice.forEach((p, k) => {
        assert.deepStrictEqual(tl.practice[k].answer, p.answer, `${l} P${p.id} answer`);
        assert.deepStrictEqual(tl.practice[k].checks, p.checks, `${l} ${p.id} checks`);
      });
      (fl.examples || []).forEach((e, k) => assert.strictEqual(tl.examples[k].c, e.c, `${l} lesson ${fl.n} example command`));
    });
  }
});

test("every practice task has 2+ progressive hints and an explanation, in every language", () => {
  for (const l of LANGS) B[l].lessons.forEach((les) => les.practice.forEach((p) => {
    assert.ok((p.hints || []).length >= 2, `${l} ${p.id} hints`);
    assert.ok(p.explain && p.explain.length > 10, `${l} ${p.id} explain`);
  }));
});

test("lesson 3 teaches opening CMD and the Prompt, without cls", () => {
  for (const l of LANGS) {
    const l3 = B[l].lessons.find((x) => x.n === 3);
    const text = JSON.stringify(l3);
    assert.ok(!/\bcls\b/.test(text), `${l}: lesson 3 must not use cls`);
    assert.ok(l3.steps.length >= 3, `${l}: numbered steps`);
    assert.ok(/Win/.test(l3.steps[0]) && /cmd/.test(l3.steps[1]) && /Enter/.test(l3.steps[2]), `${l}: steps Win+R, cmd, Enter`);
    assert.ok(!/[←→]/.test(l3.meaning + l3.summary + l3.recap + l3.steps.join(" ")), `${l}: no arrow chains`);
    assert.ok(text.includes("C:\\\\Users\\\\Student>"), `${l}: shows the Prompt`);
  }
  const l15 = B.fa.lessons.find((x) => x.n === 15);
  assert.ok(l15.warning, "cls lesson says it deletes nothing");
});

test("lesson 4 explains Command, Argument and Switch before the quiz tests them", () => {
  for (const l of LANGS) {
    const l4 = B[l].lessons.find((x) => x.n === 4);
    assert.strictEqual(l4.anatomy.cmd, "dir Pictures /w");
    assert.deepStrictEqual(l4.anatomy.parts.map((p) => p.role), ["command", "argument", "switch"]);
    assert.ok(l4.quiz.some((q) => q.code === "dir Pictures /w"), "quiz asks about the parts");
    assert.match(l4.meaning, /ping -n/, `${l}: says not every switch starts with /`);
  }
});

test("practice breakdown: commands, arguments, switches and operators in every language", () => {
  for (const l of LANGS) {
    const app = loadApp(l);
    const Content = app.Content;
    const commandParts = (line) => JSON.parse(JSON.stringify(app.commandParts(line)));   // copy out of the vm realm
    const p = commandParts("dir Documents /w");
    assert.deepStrictEqual(p.map((x) => [x.t, x.role]), [["dir", "command"], ["Documents", "argument"], ["/w", "switch"]]);
    assert.strictEqual(p[0].d, Content.command("dir").summary, `${l}: command described from the library`);
    assert.strictEqual(p[2].d, Content.command("dir").switches.find((s) => s.s === "/w").d, `${l}: switch described from the library`);
    const q = commandParts('type Documents\\menu.txt | find /i "pizza" > out.txt');
    assert.deepStrictEqual(q.map((x) => x.role), ["command", "argument", "operator", "command", "switch", "argument", "operator", "argument"]);
    assert.deepStrictEqual(commandParts("ping -n 2 google.com").map((x) => x.role), ["command", "switch", "argument", "argument"]);
    assert.deepStrictEqual(commandParts('cd "Pictures\\Summer 2026"').map((x) => x.t), ["cd", '"Pictures\\Summer 2026"']);
    assert.deepStrictEqual(commandParts("@echo off").map((x) => x.role), ["command", "argument"]);
  }
});

test("search works in each language", () => {
  const word = { fa: "پوشه", de: "Ordner", en: "folder" };
  for (const l of LANGS) {
    const { Content } = loadApp(l);
    assert.ok(Content.search(word[l]).length > 5, `${l}: search "${word[l]}"`);
    assert.strictEqual(Content.search("robocopy")[0].id, "robocopy");
  }
});

test("language selector: English default, all three languages enabled, no 'coming soon'", () => {
  const dom = fs.readFileSync(path.join(ROOT, "src/ui/dom.js"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "src/app.js"), "utf8");
  const settings = fs.readFileSync(path.join(ROOT, "src/ui/views-progress.js"), "utf8");
  assert.match(dom, /const DEFAULT_LANG = "en";/, "English is the default language");
  assert.match(app, /bundle\[Store\.settings\(\)\.lang\] \? Store\.settings\(\)\.lang : DEFAULT_LANG/, "a saved language wins over the default");
  const row = settings.slice(settings.indexOf('T("set_lang")'), settings.indexOf('T("set_sim")'));
  assert.match(row, /\[\["en", "English"\], \["de", "Deutsch"\], \["fa", "فارسی"\]\]/, "selector lists English, Deutsch, فارسی");
  assert.ok(!/coming_soon|disabled/.test(row), "no disabled or 'coming soon' language buttons");
  assert.match(row, /Store\.setSetting\("lang", code\)/, "the choice is saved");
  for (const l of LANGS) assert.ok(B[l].lessons.length === 100 && B[l].ui.set_lang, `${l} bundle is complete`);
  // the page starts in the default language before any script runs
  for (const t of ["src/index.template.html", "src/pwa/index.template.html"]) assert.match(fs.readFileSync(path.join(ROOT, t), "utf8"), /dir="ltr" lang="en"/, t);
});
