/* ============================================================
   app.js — boot, router and navigation shell.
   Routes (hash): "" | learn | lessonN | practice | task-ID | sim | batch |
     quiz | quiz-L3 | quiz-C1 | quiz-V1 | quiz-R | progress | commands |
     cmd-NAME | search | favorites | challenges | challenge-ID | settings
   ============================================================ */
const App = (() => {
  const state = { route: "", learnLevel: null, simSh: null, simTerm: null, simMode: "normal", simRun: null, quizRun: null, batchSh: null, batchFile: null, libCat: "all", libQ: "", searchQ: "" };
  let main, navEls = [];
  const scrollMem = {};

  const NAV = [
    { route: "", key: "nav_home", icon: "home", match: (r) => r === "" },
    { route: "learn", key: "nav_learn", icon: "learn", match: (r) => r === "learn" || r.startsWith("lesson") },
    { route: "practice", key: "nav_practice", icon: "practice", match: (r) => r === "practice" || r.startsWith("task-") || r.startsWith("challenge") || r === "batch" },
    { route: "sim", key: "nav_sim", icon: "sim", match: (r) => r === "sim" },
    { route: "progress", key: "nav_progress", icon: "progress", match: (r) => r === "progress" },
  ];
  const SIDE_MORE = [
    { route: "batch", label: "Batch Editor", icon: "code", match: (r) => r === "batch" },
    { route: "commands", label: "Command Library", icon: "library", match: (r) => r === "commands" || r.startsWith("cmd-") },
    { route: "challenges", label: "Challenges", icon: "trophy", match: (r) => r.startsWith("challenge") },
    { route: "quiz", label: "Quiz", icon: "quiz", match: (r) => r.startsWith("quiz") },
    { route: "search", key: "nav_search", icon: "search", match: (r) => r === "search" },
    { route: "favorites", key: "nav_favorites", icon: "star", match: (r) => r === "favorites" },
    { route: "settings", key: "nav_settings", icon: "settings", match: (r) => r === "settings" },
  ];

  function view(r) {
    if (r === "") return HomeView();
    if (r === "learn") return LearnView();
    if (/^lesson\d+$/.test(r)) return LessonView(+r.slice(6));
    if (r === "practice") return PracticeView();
    if (r.startsWith("task-")) return TaskView(r.slice(5));
    if (r === "sim") return SimView();
    if (r === "batch") return BatchView();
    if (r === "quiz") return QuizHomeView();
    if (/^quiz-([LCV]\d+|R)$/.test(r)) return QuizRunView(r.slice(5));
    if (r === "progress") return ProgressView();
    if (r === "commands") return LibraryView();
    if (r.startsWith("cmd-")) return CommandView(r.slice(4));
    if (r === "search") return SearchView();
    if (r === "favorites") return FavoritesView();
    if (r === "challenges") return ChallengesView();
    if (r.startsWith("challenge-")) return ChallengeView(r.slice(10));
    if (r === "settings") return SettingsView();
    return NotFound();
  }

  function render() {
    main.innerHTML = "";
    main.classList.toggle("wide", ["sim", "batch"].includes(state.route) || state.route.startsWith("challenge-") || (state.route.startsWith("task-") && !!(Content.task(state.route.slice(5)) || {}).batch));
    let v;
    try { v = view(state.route); }
    catch (e) {
      if (typeof console !== "undefined") console.error(e);
      v = h("div", { class: "stack view" }, h("h1", null, T("error_title")), h("p", { class: "muted" }, String(e && e.message || e)), h("button", { class: "btn", onClick: () => go("") }, T("nav_home")));
    }
    main.appendChild(v);
    navEls.forEach(({ el, item }) => {
      if (item.match(state.route)) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
    });
    const h1 = main.querySelector("h1");
    document.title = state.route === "" ? "CMD Academy" : (h1 ? h1.textContent.replace(/`/g, "") + " · " : "") + "CMD Academy";
  }

  function readHash() {
    try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return location.hash.slice(1); }
  }
  function go(route, opts = {}) {
    scrollMem[state.route] = window.scrollY;
    if (route !== state.route && !route.startsWith("quiz-")) state.quizRun = null;
    if (route.startsWith("quiz-") && state.quizRun && "quiz-" + state.quizRun.id !== route) state.quizRun = null;
    state.route = route;
    render();
    window.scrollTo(0, opts.keepScroll ? scrollMem[route] || 0 : 0);
    try { if (readHash() !== route) location.hash = encodeURIComponent(route); } catch (e) {}
    focusMain();
  }
  function focusMain() {
    const h1 = main.querySelector("h1");
    if (h1 && !main.querySelector(".term-input, .search-in, textarea")) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
  }

  function boot() {
    const root = document.documentElement;
    root.setAttribute("dir", "rtl");
    root.setAttribute("lang", "fa");
    const data = JSON.parse(document.getElementById("cmd-content").textContent);
    Content.init(data);
    Shell.setMessages(Content.shellMessages());
    Shell.setLessonIndex(Content.shellIndex());
    Store.load();
    applySettings();
    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const onChange = () => { if (Store.settings().theme === "system") applySettings(); };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
    }

    const sidebar = h("nav", { class: "sidebar", "aria-label": T("nav_main") },
      h("div", { class: "brand" }, T("app_name")));
    const bottom = h("nav", { class: "bottom-nav", "aria-label": T("nav_main") });
    NAV.forEach((item) => {
      const s = h("button", { class: "side-btn", onClick: () => go(item.route) }, icon(item.icon), T(item.key));
      const b = h("button", { class: "nav-btn", onClick: () => go(item.route) }, icon(item.icon), T(item.key));
      sidebar.appendChild(s); bottom.appendChild(b);
      navEls.push({ el: s, item }, { el: b, item });
    });
    sidebar.appendChild(h("div", { class: "side-sep" }));
    SIDE_MORE.forEach((item) => {
      const s = h("button", { class: "side-btn", onClick: () => go(item.route) }, icon(item.icon), item.label || T(item.key));
      sidebar.appendChild(s); navEls.push({ el: s, item });
    });

    main = h("main", { class: "main", id: "main" });
    document.getElementById("app").append(sidebar, main, bottom);

    state.route = readHash();
    window.addEventListener("hashchange", () => {
      const r = readHash();
      if (r !== state.route) {
        scrollMem[state.route] = window.scrollY;
        state.route = r; state.quizRun = null; render();
        window.scrollTo(0, scrollMem[r] || 0);
      }
    });
    render();
  }

  return { boot, go, render, state };
})();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", App.boot);
else App.boot();
