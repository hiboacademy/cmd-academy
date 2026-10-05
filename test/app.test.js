/* App logic tests: saved progress, quiz scoring and review, favorites,
   search and the offline (PWA) package. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { load, ENGINE, content, ROOT } = require("./load.js");

// a localStorage stand-in, shared so we can "reload" the Store
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};
const { Content, Store } = load(ENGINE.concat(["src/data/content.js", "src/store/progress.js"]));
const C = content();
Content.init(C);
Store.load();

test("progress starts empty and is not faked", () => {
  assert.strictEqual(Store.accuracy().pct, null);
  assert.strictEqual(Store.streak(), 0);
  assert.strictEqual(Content.all().filter((l) => Store.lessonDone(l)).length, 0);
  assert.strictEqual(Store.currentLesson().n, 1);
});

test("a lesson is done only after all practice and a passed quiz", () => {
  const l = Content.lesson(11);
  l.full.practice.forEach((p, i) => { if (i) Store.markPractice(p.id); });
  assert.ok(!Store.lessonDone(l), "one practice is still open");
  Store.markPractice(l.full.practice[0].id);
  assert.ok(!Store.lessonDone(l), "quiz not passed yet");
  Store.setQuiz("L11", 1, 4);
  assert.ok(!Store.lessonDone(l), "25% is not a pass");
  Store.setQuiz("L11", 3, 4);
  assert.ok(Store.lessonDone(l));
  Store.setQuiz("L11", 0, 4);
  assert.deepStrictEqual(Store.quizBest("L11"), { best: 3, total: 4 }, "a worse retry keeps the best score");
  assert.ok(Store.recentLessons().includes(11));
  assert.strictEqual(Store.streak(), 1, "activity today starts a streak");
});

test("quiz answers feed accuracy and the review list", () => {
  Store.answer("L1-1", true, 1);
  Store.answer("L1-2", false, 1);
  Store.answer("L2-1", false, 2);
  assert.deepStrictEqual(Store.accuracy(), { right: 1, wrong: 2, pct: 33 });
  assert.deepStrictEqual(Store.mistakes().sort(), ["L1-2", "L2-1"]);
  Store.answer("L1-2", true, 1);
  assert.deepStrictEqual(Store.mistakes(), ["L2-1"], "answering right removes it from review");
  const r = Content.quiz("R");
  assert.ok(r.questions.some((q) => q.id === "L2-1"));
});

test("quizzes have the expected sizes and valid questions", () => {
  const l = Content.quiz("L11");
  assert.strictEqual(l.questions.length, C.lessons.find((x) => x.n === 11).quiz.length);
  const v = Content.quiz("V1");
  assert.ok(v.questions.length >= 15 && v.pick === 15);
  Content.chapterQuizzes().forEach((q) => assert.ok(q.questions.length > 0, "chapter quiz " + q.id));
  // every question id resolves back to its question
  C.lessons.forEach((les) => les.quiz.forEach((q, i) => assert.ok(Content.question(`L${les.n}-${i + 1}`), `L${les.n}-${i + 1}`)));
});

test("favorites persist across a reload", () => {
  assert.ok(Store.toggleFav("cmd", "robocopy"));
  assert.ok(Store.toggleFav("lesson", 24));
  assert.ok(Store.toggleFav("ex", "11:2"));
  Store.load(); // simulate reopening the app
  assert.ok(Store.isFav("cmd", "robocopy"));
  assert.ok(Store.isFav("lesson", 24));
  assert.ok(Content.example("11:2"), "lesson example id resolves");
  assert.ok(Content.example("robocopy#0"), "library example id resolves");
  assert.ok(!Store.toggleFav("cmd", "robocopy"), "toggling again removes it");
  assert.ok(!Store.isFav("cmd", "robocopy"));
});

test("reset clears progress but keeps settings", () => {
  Store.setSetting("theme", "light");
  Store.setSetting("font", 1.12);
  Store.reset();
  Store.load();
  assert.strictEqual(Store.accuracy().pct, null);
  assert.ok(!Store.isFav("lesson", 24));
  assert.strictEqual(Store.settings().theme, "light");
  assert.strictEqual(Store.settings().font, 1.12);
});

test("broken saved data does not crash the app", () => {
  mem["cmdacademy.progress.v1"] = "{not json";
  assert.doesNotThrow(() => Store.load());
  mem["cmdacademy.progress.v1"] = JSON.stringify({ practice: { P11a: true } });
  Store.load();
  assert.ok(Store.practiceDone("P11a"));
  assert.deepStrictEqual(Store.favs(), { cmd: [], lesson: [], ex: [] });
});

test("search finds commands, lessons, examples and Persian words", () => {
  const kinds = (q) => new Set(Content.search(q).map((r) => r.kind));
  assert.strictEqual(Content.search("robocopy")[0].id, "robocopy", "exact command name ranks first");
  assert.ok(kinds("copy").has("lesson") && kinds("copy").has("ex"));
  assert.ok(Content.search("پوشه").length > 5, "Persian search works");
  assert.ok(Content.search("پوشه").length === Content.search("پوشه ").length, "spaces are ignored");
  assert.ok(Content.search("كپي").length >= Content.search("کپی").length && Content.search("کپی").length > 0, "Arabic letters match Persian");
  assert.strictEqual(Content.search("ROBOCOPY")[0].id, "robocopy", "case-insensitive");
  assert.ok(Content.search("wildcard").some((r) => r.kind === "cmd" && r.id === "*"));
  assert.deepStrictEqual(Content.search("zzzzqqq"), []);
  assert.ok(Content.search("پیتزا").length + Content.search("pizza").length > 0);
});

test("library links commands to lessons and challenges exist", () => {
  assert.ok(Content.command("dir").lessons.includes(11));
  assert.ok(Content.command("md"), "aliases resolve");
  assert.strictEqual(Content.command("md").name, "mkdir");
  assert.ok(Content.commandList().length >= 75);
  assert.ok(Content.challenges().length >= 20);
  [1, 2, 3].forEach((lv) => assert.ok(Content.challenges().some((c) => c.level === lv), "level " + lv));
  Content.challenges().forEach((c) => assert.ok(!c.after || Content.lesson(c.after), c.id + " after"));
});

test("offline: the service worker caches everything the page needs", () => {
  const docs = path.join(ROOT, "docs");
  const sw = fs.readFileSync(path.join(docs, "sw.js"), "utf8");
  const files = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1]);
  files.forEach((f) => { if (f !== "./") assert.ok(fs.existsSync(path.join(docs, f)), "cached file missing: " + f); });
  const html = fs.readFileSync(path.join(docs, "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]).concat([...html.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/["']/g, "")));
  refs.filter((r) => !/^(data:|https?:)/.test(r)).forEach((r) => assert.ok(files.includes(r) || files.includes("./" + r), "not cached for offline: " + r));
  assert.match(sw, /cmd-academy-[0-9a-f]+/, "cache name carries the build id");
  const manifest = JSON.parse(fs.readFileSync(path.join(docs, "manifest.webmanifest"), "utf8"));
  manifest.icons.forEach((i) => assert.ok(fs.existsSync(path.join(docs, i.src)), i.src));
  assert.strictEqual(manifest.display, "standalone");
});

test("offline: the page loads no code from the internet", () => {
  const html = fs.readFileSync(path.join(ROOT, "docs/index.html"), "utf8");
  assert.ok(!/<script[^>]+src=/i.test(html), "all scripts are inline");
  assert.ok(!/<link[^>]+stylesheet[^>]+https?:/i.test(html), "no remote stylesheets");
  assert.ok(!/@import\s+url\(\s*["']?https?:/i.test(html), "no remote font imports");
});
