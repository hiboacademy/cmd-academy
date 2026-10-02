/* ============================================================
   app.js — boot, router and navigation shell.
   Routes: "" | learn | lessonN | practice | task-ID | sim |
           quiz | quiz-L3 | quiz-C1 | progress
   ============================================================ */
const App = (() => {
  const state = { route: "", learnLevel: 1, simSh: null, simTerm: null, quizRun: null };
  let main, navEls = [];

  const NAV = [
    { route: "", key: "nav_home", icon: "home", match: (r) => r === "" },
    { route: "learn", key: "nav_learn", icon: "learn", match: (r) => r === "learn" || r.startsWith("lesson") },
    { route: "practice", key: "nav_practice", icon: "practice", match: (r) => r === "practice" || r.startsWith("task-") },
    { route: "sim", key: "nav_sim", icon: "sim", match: (r) => r === "sim" },
    { route: "progress", key: "nav_progress", icon: "progress", match: (r) => r === "progress" },
  ];

  function view(r) {
    if (r === "") return HomeView();
    if (r === "learn") return LearnView();
    if (/^lesson\d+$/.test(r)) return LessonView(+r.slice(6));
    if (r === "practice") return PracticeView();
    if (r.startsWith("task-")) return TaskView(r.slice(5));
    if (r === "sim") return SimView();
    if (r === "quiz") return QuizHomeView();
    if (/^quiz-[LC]\d+$/.test(r)) return QuizRunView(r.slice(5));
    if (r === "progress") return ProgressView();
    return NotFound();
  }

  function render() {
    main.innerHTML = "";
    main.classList.toggle("wide", state.route === "sim");
    main.appendChild(view(state.route));
    navEls.forEach(({ el, item }) => {
      if (item.match(state.route)) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
    });
  }

  function go(route) {
    if (route !== state.route && !route.startsWith("quiz-")) state.quizRun = null;
    if (route.startsWith("quiz-") && state.quizRun && "quiz-" + state.quizRun.id !== route) state.quizRun = null;
    state.route = route;
    render();
    window.scrollTo(0, 0);
    try { if (location.hash.slice(1) !== route) location.hash = route; } catch (e) {}
  }

  function boot() {
    document.documentElement.setAttribute("dir", "rtl");
    document.documentElement.setAttribute("lang", "fa");
    const data = JSON.parse(document.getElementById("cmd-content").textContent);
    Content.init(data);
    Shell.setMessages(Content.shellMessages());
    Shell.setLessonIndex(Content.shellIndex());
    Store.load();

    const sidebar = h("nav", { class: "sidebar", "aria-label": "main" },
      h("div", { class: "brand" }, Content.t("app_name")));
    const bottom = h("nav", { class: "bottom-nav", "aria-label": "main" });
    NAV.forEach((item) => {
      const s = h("button", { class: "side-btn", onClick: () => go(item.route) }, icon(item.icon), Content.t(item.key));
      const b = h("button", { class: "nav-btn", onClick: () => go(item.route) }, icon(item.icon), Content.t(item.key));
      sidebar.appendChild(s); bottom.appendChild(b);
      navEls.push({ el: s, item }, { el: b, item });
    });
    sidebar.appendChild(h("div", { class: "side-sep" }));
    const quizItem = { match: (r) => r.startsWith("quiz") };
    const qb = h("button", { class: "side-btn", onClick: () => go("quiz") }, icon("quiz"), "Quiz");
    sidebar.appendChild(qb); navEls.push({ el: qb, item: quizItem });

    main = h("main", { class: "main" });
    document.getElementById("app").append(sidebar, main, bottom);

    try { state.route = decodeURIComponent(location.hash.slice(1)); } catch (e) { state.route = ""; }
    window.addEventListener("hashchange", () => {
      const r = location.hash.slice(1);
      if (r !== state.route) { state.route = r; state.quizRun = null; render(); }
    });
    render();
  }

  return { boot, go, render, state };
})();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", App.boot);
else App.boot();
