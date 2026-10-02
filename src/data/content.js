/* ============================================================
   data/content.js — read-only access to course content.
   The UI never hard-codes lessons; it asks Content.
   ============================================================ */
const Content = (() => {
  let D = null;
  const byNum = {};
  let order = [];

  function init(json) {
    D = json;
    const full = {};
    D.lessons.forEach((l) => { full[l.n] = l; });
    D.curriculum.levels.forEach((lv) => {
      lv.chapters.forEach((ch) => {
        ch.lessons.forEach((o) => {
          byNum[o.n] = { ...o, level: lv.id, chapter: ch.id, chapterTitle: ch.title, full: full[o.n] || null };
          order.push(o.n);
        });
      });
    });
  }

  const levels = () => D.curriculum.levels;
  const lesson = (n) => byNum[n] || null;
  const all = () => order.map((n) => byNum[n]);
  const available = () => all().filter((l) => l.full);
  const total = () => order.length;
  const levelLessons = (id) => all().filter((l) => l.level === id);
  const chapterLessons = (id) => all().filter((l) => l.chapter === id);
  const chapter = (id) => {
    for (const lv of D.curriculum.levels) for (const ch of lv.chapters) if (ch.id === id) return { ...ch, level: lv.id };
    return null;
  };
  const tasks = () => available().flatMap((l) => l.full.practice.map((p) => ({ ...p, lesson: l.n })));
  const task = (id) => tasks().find((t) => t.id === id) || null;
  const nextLesson = (n) => { const i = order.indexOf(n); return i >= 0 && i < order.length - 1 ? byNum[order[i + 1]] : null; };

  /* Quizzes: "L3" = lesson 3 mini quiz, "C1" = chapter 1 quiz */
  function quiz(id) {
    if (id[0] === "L") {
      const l = lesson(+id.slice(1));
      return l && l.full ? { id, title: l.t, lesson: l.n, questions: l.full.quiz } : null;
    }
    if (id[0] === "C") {
      const ch = chapter(+id.slice(1));
      if (!ch) return null;
      const qs = chapterLessons(ch.id).filter((l) => l.full).flatMap((l) => l.full.quiz);
      return qs.length ? { id, title: ch.title, chapter: ch.id, questions: qs } : null;
    }
    return null;
  }
  const chapterQuizzes = () => {
    const out = [];
    D.curriculum.levels.forEach((lv) => lv.chapters.forEach((ch) => { const q = quiz("C" + ch.id); if (q) out.push(q); }));
    return out;
  };

  /* command -> lesson number, so the Simulator can say "taught in lesson N" */
  function shellIndex() {
    const idx = {};
    all().forEach((l) => {
      if (l.c) idx[l.c] = l.n;
      (l.aliases || []).forEach((a) => { idx[a] = l.n; });
    });
    return idx;
  }

  function t(key, vars = {}) {
    let s = D.ui[key] != null ? String(D.ui[key]) : key;
    Object.keys(vars).forEach((k) => { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  return { init, levels, lesson, all, available, total, levelLessons, chapterLessons, chapter, tasks, task, nextLesson, quiz, chapterQuizzes, shellIndex, t, shellMessages: () => D.shell };
})();
