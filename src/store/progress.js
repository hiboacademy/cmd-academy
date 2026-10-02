/* ============================================================
   store/progress.js — progress saved on this device only.
   One small interface so Cloud Sync can replace it later.
   ============================================================ */
const Store = (() => {
  const KEY = "cmdacademy.progress.v1";
  const empty = () => ({ v: 1, practice: {}, quiz: {}, seen: {} });
  let s = empty();
  let persistent = true;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) s = Object.assign(empty(), JSON.parse(raw));
    } catch (e) { persistent = false; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(s)); persistent = true; } catch (e) { persistent = false; }
  }

  const markPractice = (id) => { s.practice[id] = true; save(); };
  const practiceDone = (id) => !!s.practice[id];
  const markSeen = (n) => { if (!s.seen[n]) { s.seen[n] = true; save(); } };
  function setQuiz(id, score, total) {
    const prev = s.quiz[id];
    if (!prev || score / total >= prev.best / prev.total) s.quiz[id] = { best: score, total };
    save();
  }
  const quizBest = (id) => s.quiz[id] || null;

  /* A lesson is done when all its practice tasks are solved
     and its Mini Quiz was passed with at least half correct. */
  function lessonParts(l) {
    if (!l || !l.full) return null;
    const ids = l.full.practice.map((p) => p.id);
    const done = ids.filter(practiceDone).length;
    const q = quizBest("L" + l.n);
    return { practiceDone: done, practiceTotal: ids.length, quizOk: !!q && q.best / q.total >= 0.5, quiz: q };
  }
  function lessonDone(l) {
    const p = lessonParts(l);
    return !!p && p.practiceDone === p.practiceTotal && p.quizOk;
  }
  function currentLesson() {
    return Content.available().find((l) => !lessonDone(l)) || null;
  }
  function lessonStatus(l) {
    if (!l.full) return "soon";
    if (lessonDone(l)) return "done";
    const c = currentLesson();
    return c && c.n === l.n ? "current" : "open";
  }

  function reset() { s = empty(); save(); }
  const isPersistent = () => persistent;

  return { load, markPractice, practiceDone, markSeen, setQuiz, quizBest, lessonParts, lessonDone, currentLesson, lessonStatus, reset, isPersistent };
})();
