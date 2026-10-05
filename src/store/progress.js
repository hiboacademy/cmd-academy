/* ============================================================
   store/progress.js — learning data saved on this device only.
   One small interface so Cloud Sync can replace it later.
   ============================================================ */
const Store = (() => {
  const KEY = "cmdacademy.progress.v1";
  const empty = () => ({
    v: 2, practice: {}, quiz: {}, seen: {}, answers: {}, cmdErrors: {}, challenges: {},
    favs: { cmd: [], lesson: [], ex: [] }, days: {}, recent: [], scripts: {},
    settings: { theme: "dark", font: 1 },
  });
  let s = empty();
  let persistent = true;
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        s = Object.assign(empty(), d);
        s.favs = Object.assign({ cmd: [], lesson: [], ex: [] }, d.favs || {});
        s.settings = Object.assign({ theme: "dark", font: 1 }, d.settings || {});
        s.v = 2;
      }
    } catch (e) { persistent = false; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(s)); persistent = true; } catch (e) { persistent = false; }
    listeners.forEach((f) => { try { f(); } catch (e) {} });
  }
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function touch() { s.days[today()] = true; }

  /* ---------- practice & challenges ---------- */
  function markPractice(id) {
    if (!s.practice[id]) { s.practice[id] = true; touch(); }
    const t = Content.task(id);
    if (t) noteLessonDone(t.lesson);
    save();
  }
  const practiceDone = (id) => !!s.practice[id];
  function markChallenge(id) { if (!s.challenges[id]) { s.challenges[id] = true; touch(); save(); } }
  const challengeDone = (id) => !!s.challenges[id];
  function cmdError(name) {
    if (!name || name === "?" || /[^\w.-]/.test(name)) return;
    s.cmdErrors[name] = (s.cmdErrors[name] || 0) + 1;
    save();
  }
  function weakCommands(n = 5) {
    return Object.entries(s.cmdErrors).sort((a, b) => b[1] - a[1]).slice(0, n).map(([cmd, count]) => ({ cmd, count }));
  }
  const markSeen = (n) => { if (!s.seen[n]) { s.seen[n] = true; save(); } };

  /* ---------- quiz ---------- */
  function answer(qid, right, lesson) {
    const a = s.answers[qid] || { right: 0, wrong: 0, lesson };
    if (right) a.right++; else a.wrong++;
    a.lastWrong = !right;
    a.lesson = lesson;
    s.answers[qid] = a;
    touch();
    save();
  }
  function setQuiz(id, score, total) {
    const prev = s.quiz[id];
    if (!prev || score / total >= prev.best / prev.total) s.quiz[id] = { best: score, total };
    if (id[0] === "L") noteLessonDone(+id.slice(1));
    touch();
    save();
  }
  const quizBest = (id) => s.quiz[id] || null;
  function accuracy() {
    let r = 0, w = 0;
    Object.values(s.answers).forEach((a) => { r += a.right; w += a.wrong; });
    return { right: r, wrong: w, pct: r + w ? Math.round((r / (r + w)) * 100) : null };
  }
  const mistakes = () => Object.keys(s.answers).filter((k) => s.answers[k].lastWrong);

  /* ---------- lessons ---------- */
  /* A lesson is done when all its practice tasks are solved
     and its Mini Quiz was passed with at least half correct. */
  function lessonParts(l) {
    if (!l || !l.full) return null;
    const ids = l.full.practice.map((p) => p.id);
    const done = ids.filter(practiceDone).length;
    const q = quizBest("L" + l.n);
    const quizOk = !!q && q.best / q.total >= 0.5;
    const pct = Math.round(((done + (quizOk ? 1 : 0)) / (ids.length + 1)) * 100);
    return { practiceDone: done, practiceTotal: ids.length, quizOk, quiz: q, pct };
  }
  function lessonDone(l) {
    const p = lessonParts(l);
    return !!p && p.practiceDone === p.practiceTotal && p.quizOk;
  }
  function noteLessonDone(n) {
    const l = Content.lesson(n);
    if (l && lessonDone(l) && !s.recent.includes(n)) { s.recent.push(n); if (s.recent.length > 20) s.recent.shift(); }
  }
  function currentLesson() { return Content.available().find((l) => !lessonDone(l)) || null; }
  function lessonStatus(l) {
    if (!l.full) return "soon";
    if (lessonDone(l)) return "done";
    const c = currentLesson();
    if (c && c.n === l.n) return "current";
    const p = lessonParts(l);
    return p && (p.practiceDone || p.quiz) ? "started" : "open";
  }
  const recentLessons = () => s.recent.slice(-5).reverse();

  /* ---------- streak ---------- */
  function streak() {
    let n = 0;
    const d = new Date();
    const key = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    if (!s.days[key(d)]) d.setDate(d.getDate() - 1);
    while (s.days[key(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ---------- favorites ---------- */
  function isFav(kind, id) { return s.favs[kind].includes(String(id)); }
  function toggleFav(kind, id) {
    id = String(id);
    const arr = s.favs[kind];
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
    save();
    return i < 0;
  }
  const favs = () => s.favs;

  /* ---------- batch scripts & settings ---------- */
  const scripts = () => s.scripts;
  function saveScript(name, text) { s.scripts[name] = text; save(); }
  function deleteScript(name) { delete s.scripts[name]; save(); }
  const settings = () => s.settings;
  function setSetting(k, v) { s.settings[k] = v; save(); }

  function reset() { const keep = s.settings; s = empty(); s.settings = keep; save(); }
  const isPersistent = () => persistent;
  const onChange = (f) => listeners.push(f);
  const raw = () => s;

  return {
    load, markPractice, practiceDone, markChallenge, challengeDone, cmdError, weakCommands, markSeen,
    answer, setQuiz, quizBest, accuracy, mistakes, lessonParts, lessonDone, currentLesson, lessonStatus, recentLessons,
    streak, isFav, toggleFav, favs, scripts, saveScript, deleteScript, settings, setSetting, reset, isPersistent, onChange, raw,
  };
})();
