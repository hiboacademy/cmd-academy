/* Content checks: every practice task can be solved with its own answer,
   wrong attempts are rejected, demos run, quizzes are well-formed. */
const test = require("node:test");
const assert = require("node:assert");
const { load, ENGINE, content } = require("./load.js");
const C = content();
const { Shell, Checker, VFS } = load(ENGINE);
Shell.setMessages(C.shell);

function solve(spec) {
  const sh = Checker.shellFor(spec);
  const recs = [];
  let out = "";
  const inputs = (spec.inputs || []).slice();
  const runLine = (line) => {
    const r = Shell.runAll(sh, line, inputs, { defaultAnswer: "" });
    recs.push(...r.recs);
    out += "\n" + r.text;
    return r;
  };
  let last = null;
  if (spec.batch) {
    const desk = VFS.resolve(sh.fs, "C", ["Users", "Student", "Desktop"]).node;
    VFS.writeFile(desk, spec.batch.file || "script.bat", [].concat(spec.answer).join("\n") + "\n", false);
    if (Shell.cwdPath(sh).toLowerCase() !== "c:\\users\\student\\desktop") Shell.setLocation(sh, "C:\\Users\\Student\\Desktop");
    last = runLine(((spec.batch.file || "script.bat") + " " + (typeof spec.batch.args === "string" ? spec.batch.args : (spec.testArgs || ""))).trim());
  } else {
    [].concat(spec.answer).forEach((a) => { last = runLine(a); });
  }
  return { ok: Checker.evaluate(spec.checks, sh, recs, { output: out, lastOutput: last ? last.text : "" }), out };
}
function wrong(spec) {
  const sh = Checker.shellFor(spec);
  if (spec.batch) {
    const desk = VFS.resolve(sh.fs, "C", ["Users", "Student", "Desktop"]).node;
    VFS.writeFile(desk, spec.batch.file || "script.bat", "@echo off\n", false);
    Shell.setLocation(sh, "C:\\Users\\Student\\Desktop");
    const r = Shell.runAll(sh, spec.batch.file || "script.bat", [], { defaultAnswer: "" });
    return Checker.evaluate(spec.checks, sh, r.recs, { output: r.text, lastOutput: r.text });
  }
  const r = Shell.runAll(sh, "dir Music", [], { defaultAnswer: "" });
  return Checker.evaluate(spec.checks, sh, r.recs, { output: r.text, lastOutput: r.text });
}

test("curriculum numbers are continuous", () => {
  const nums = C.curriculum.levels.flatMap((lv) => lv.chapters.flatMap((ch) => ch.lessons.map((l) => l.n)));
  assert.deepStrictEqual(nums, nums.map((_, i) => i + 1));
  assert.strictEqual(nums.length, 100);
});

test("lesson numbers match the curriculum and are unique", () => {
  const seen = new Set();
  C.lessons.forEach((l) => { assert.ok(!seen.has(l.n), "duplicate lesson " + l.n); seen.add(l.n); });
});

const ids = new Set();
C.lessons.forEach((l) => {
  test(`lesson ${l.n} is complete`, () => {
    ["term", "summary", "meaning", "usage", "practice", "quiz"].forEach((k) => assert.ok(l[k], `lesson ${l.n} missing ${k}`));
    assert.ok(l.practice.length >= 1, `lesson ${l.n} needs practice`);
    assert.ok(l.quiz.length >= 3, `lesson ${l.n} needs 3+ quiz questions`);
    l.quiz.forEach((q, i) => {
      const where = `lesson ${l.n} q${i + 1}`;
      assert.ok(["mcq", "tf", "type", "fix", "predict", "order"].includes(q.kind), where + " kind");
      if (q.kind === "tf") assert.strictEqual(typeof q.answer, "boolean", where);
      else if (q.kind === "type") assert.ok(Array.isArray(q.accept) && q.accept.length, where + " accept");
      else if (q.kind === "order") assert.ok(Array.isArray(q.items) && q.items.length >= 2, where + " items");
      else { assert.ok(Array.isArray(q.options) && q.options.length >= 2, where + " options"); assert.ok(q.answer >= 0 && q.answer < q.options.length, where + " answer index"); assert.strictEqual(new Set(q.options).size, q.options.length, where + " duplicate options"); }
      assert.ok(q.explain, where + " explain");
    });
    if (l.demo) {
      const lines = Checker.demo(l.demo);
      const bad = lines.filter((x) => x.e && /not recognized|Simulator error/.test(x.o || ""));
      if (!l.demo.expectError) assert.deepStrictEqual(bad, [], `lesson ${l.n} demo has errors`);
    }
  });
  l.practice.forEach((p) => {
    test(`practice ${p.id} (lesson ${l.n})`, () => {
      assert.ok(!ids.has(p.id), "duplicate id " + p.id); ids.add(p.id);
      assert.ok(p.hints && p.hints.length, p.id + " hints");
      assert.ok(p.answer, p.id + " answer");
      const r = solve(p);
      assert.ok(r.ok, `${p.id}: the answer does not pass its own checks\n${r.out.slice(-1200)}`);
      assert.ok(!wrong(p), `${p.id}: a wrong attempt passes`);
    });
  });
});

test("challenges can be solved", () => {
  (C.challenges || []).forEach((c) => {
    const r = solve(c);
    assert.ok(r.ok, `challenge ${c.id} fails with its own solution\n${r.out.slice(-1500)}`);
    assert.ok(!wrong(c), `challenge ${c.id}: wrong attempt passes`);
  });
});

test("library entries are well-formed", () => {
  const names = new Set();
  (C.commands || []).forEach((c) => {
    assert.ok(c.name && c.summary && c.category && c.syntax, "command " + c.name);
    assert.ok(!names.has(c.name), "duplicate " + c.name); names.add(c.name);
    assert.ok((C.categories || []).some((k) => k.id === c.category), c.name + " category " + c.category);
    (c.related || []).forEach((r) => assert.ok(C.commands.some((x) => x.name === r || (x.aliases || []).includes(r)), `${c.name}: related ${r} missing`));
  });
});
