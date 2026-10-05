/* ============================================================
   data/content.js — read-only access to course content.
   The UI never hard-codes lessons; it asks Content.
   ============================================================ */
const Content = (() => {
  let D = null;
  const byNum = {};
  const order = [];
  const questions = {};      // qid -> question (with lesson)
  const commands = {};       // name -> library entry
  const cmdAlias = {};       // alias -> name
  let searchIndex = null;

  function init(json) {
    D = json;
    const full = {};
    D.lessons.forEach((l) => {
      full[l.n] = l;
      (l.quiz || []).forEach((q, i) => { q.id = `L${l.n}-${i + 1}`; q.lesson = l.n; questions[q.id] = q; });
      (l.practice || []).forEach((p) => { p.lesson = l.n; });
    });
    D.curriculum.levels.forEach((lv) => {
      lv.chapters.forEach((ch) => {
        ch.lessons.forEach((o) => {
          byNum[o.n] = { ...o, level: lv.id, chapter: ch.id, chapterTitle: ch.title, full: full[o.n] || null };
          order.push(o.n);
        });
      });
    });
    (D.commands || []).forEach((c) => {
      commands[c.name] = c;
      (c.aliases || []).forEach((a) => { cmdAlias[a] = c.name; });
    });
    // link library entries to lessons
    all().forEach((l) => {
      [l.c].concat(l.aliases || [], (l.full && l.full.commands) || []).filter(Boolean).forEach((name) => {
        const c = command(name);
        if (c) { c.lessons = c.lessons || []; if (!c.lessons.includes(l.n)) c.lessons.push(l.n); }
      });
    });
    Object.values(commands).forEach((c) => { if (c.lessons) c.lessons.sort((a, b) => a - b); });
  }

  const levels = () => D.curriculum.levels;
  const level = (id) => D.curriculum.levels.find((x) => x.id === id);
  const lesson = (n) => byNum[n] || null;
  function all() { return order.map((n) => byNum[n]); }
  const available = () => all().filter((l) => l.full);
  const total = () => order.length;
  const levelLessons = (id) => all().filter((l) => l.level === id);
  const chapterLessons = (id) => all().filter((l) => l.chapter === id);
  function chapter(id) {
    for (const lv of D.curriculum.levels) for (const ch of lv.chapters) if (ch.id === id) return { ...ch, level: lv.id };
    return null;
  }
  const chapters = () => D.curriculum.levels.flatMap((lv) => lv.chapters.map((ch) => ({ ...ch, level: lv.id })));
  const tasks = () => available().flatMap((l) => l.full.practice.map((p) => ({ ...p, lesson: l.n })));
  const task = (id) => tasks().find((t) => t.id === id) || null;
  const nextLesson = (n) => { const i = order.indexOf(n); return i >= 0 && i < order.length - 1 ? byNum[order[i + 1]] : null; };
  const prevLesson = (n) => { const i = order.indexOf(n); return i > 0 ? byNum[order[i - 1]] : null; };
  const question = (qid) => questions[qid] || null;

  /* Quizzes: "L3" lesson, "C1" chapter, "V1" level, "R" review of mistakes */
  function quiz(id) {
    if (id[0] === "L") {
      const l = lesson(+id.slice(1));
      return l && l.full ? { id, kind: "lesson", title: l.t, lesson: l.n, questions: l.full.quiz } : null;
    }
    if (id[0] === "C") {
      const ch = chapter(+id.slice(1));
      if (!ch) return null;
      const qs = chapterLessons(ch.id).filter((l) => l.full).flatMap((l) => l.full.quiz);
      return qs.length ? { id, kind: "chapter", title: ch.title, chapter: ch.id, questions: qs, pick: 8 } : null;
    }
    if (id[0] === "V") {
      const lv = level(+id.slice(1));
      if (!lv) return null;
      const qs = levelLessons(lv.id).filter((l) => l.full).flatMap((l) => l.full.quiz);
      return qs.length ? { id, kind: "level", title: `Level ${lv.id} — ${lv.code}`, level: lv.id, questions: qs, pick: 15 } : null;
    }
    if (id === "R") {
      const qs = Store.mistakes().map(question).filter(Boolean);
      return { id, kind: "review", title: "مرور اشتباه‌ها", questions: qs, pick: 12 };
    }
    return null;
  }
  const chapterQuizzes = () => chapters().map((ch) => quiz("C" + ch.id)).filter(Boolean);

  /* command -> lesson number, so the Simulator can say "taught in lesson N" */
  function shellIndex() {
    const idx = {};
    all().forEach((l) => {
      if (l.c && !(l.c in idx)) idx[l.c] = l.n;
      (l.aliases || []).forEach((a) => { if (!(a in idx)) idx[a] = l.n; });
    });
    return idx;
  }

  /* ---------- command library ---------- */
  function command(name) {
    const n = String(name || "").toLowerCase();
    return commands[n] || commands[cmdAlias[n]] || null;
  }
  const commandList = () => Object.values(commands).sort((a, b) => a.name.localeCompare(b.name));
  const categories = () => D.categories || [];

  /* ---------- challenges ---------- */
  const challenges = () => D.challenges || [];
  const challenge = (id) => challenges().find((c) => c.id === id) || null;

  /* ---------- search ---------- */
  function normFa(s) {
    return String(s || "").toLowerCase()
      .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[‌‏ً-ٟ]/g, "")
      .replace(/[`"'«»]/g, "").replace(/\s+/g, " ").trim();
  }
  function buildIndex() {
    const idx = [];
    commandList().forEach((c) => idx.push({ kind: "cmd", id: c.name, title: c.name, sub: c.summary, text: normFa([c.name, (c.aliases || []).join(" "), c.summary, c.full, c.category, (c.keywords || []).join(" ")].join(" ")) }));
    available().forEach((l) => {
      const f = l.full;
      idx.push({ kind: "lesson", id: l.n, title: l.t, sub: `Lesson ${l.n} · ${f.term}`, text: normFa([l.t, f.term, f.fullForm, f.summary, f.objective, l.c, (l.aliases || []).join(" "), f.meaning].join(" ")) });
      (f.examples || []).forEach((e, i) => idx.push({ kind: "ex", id: `${l.n}:${i}`, title: e.c, sub: e.d, lesson: l.n, text: normFa(e.c + " " + e.d) }));
      (f.quiz || []).forEach((q) => idx.push({ kind: "quiz", id: q.id, title: q.q, sub: `Mini Quiz · Lesson ${l.n}`, lesson: l.n, text: normFa(q.q + " " + (q.code || "") + " " + (q.options || []).join(" ")) }));
    });
    commandList().forEach((c) => (c.examples || []).forEach((e, i) => idx.push({ kind: "ex", id: `${c.name}#${i}`, title: e.c, sub: e.d, cmd: c.name, text: normFa(e.c + " " + e.d) })));
    challenges().forEach((c) => idx.push({ kind: "challenge", id: c.id, title: c.title, sub: c.task, text: normFa(c.title + " " + c.task + " " + (c.tags || []).join(" ")) }));
    return idx;
  }
  function search(q) {
    const nq = normFa(q);
    if (!nq) return [];
    if (!searchIndex) searchIndex = buildIndex();
    const words = nq.split(" ");
    const res = [];
    searchIndex.forEach((e) => {
      if (!words.every((w) => e.text.includes(w))) return;
      let score = 0;
      const t = normFa(e.title);
      if (t === nq) score += 100;
      else if (t.startsWith(nq)) score += 50;
      else if (t.includes(nq)) score += 20;
      score += { cmd: 8, lesson: 6, ex: 3, challenge: 2, quiz: 1 }[e.kind];
      res.push({ ...e, score });
    });
    return res.sort((a, b) => b.score - a.score);
  }

  /* example by id: "12:0" (lesson 12, example 0) or "copy#1" (library) */
  function example(id) {
    const s = String(id);
    if (s.includes("#")) { const [name, i] = s.split("#"); const c = command(name); return c && c.examples && c.examples[+i] ? { ...c.examples[+i], cmd: c.name } : null; }
    const [n, i] = s.split(":");
    const l = lesson(+n);
    return l && l.full && l.full.examples && l.full.examples[+i] ? { ...l.full.examples[+i], lesson: +n } : null;
  }

  function t(key, vars = {}) {
    let s = D.ui[key] != null ? String(D.ui[key]) : key;
    Object.keys(vars).forEach((k) => { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  return {
    init, levels, level, lesson, all, available, total, levelLessons, chapterLessons, chapter, chapters, tasks, task,
    nextLesson, prevLesson, question, quiz, chapterQuizzes, shellIndex, command, commandList, categories,
    challenges, challenge, search, example, normFa, t, shellMessages: () => D.shell, meta: () => D.meta || {},
  };
})();
