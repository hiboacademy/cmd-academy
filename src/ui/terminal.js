/* ============================================================
   ui/terminal.js — reusable terminal component.
   Used by the Simulator, Practice, Challenges and the Batch editor.
   It answers the engine's questions (Y/N, set /p, pause, choice)
   and waits for timeout/ping delays.
   ============================================================ */

/* Static example terminal (lesson cards, home). lines: [{p,c}|{o}] */
function StaticTerminal(lines, opts = {}) {
  const body = h("div", { class: "term-body" });
  lines.forEach((ln, i) => {
    if (ln.p != null) {
      const isLast = i === lines.length - 1;
      body.appendChild(h("div", { class: "term-line" },
        h("span", { class: "pr" }, ln.p), ln.c ? h("span", { class: "cm" }, ln.c) : null,
        (!ln.c && isLast && opts.cursor !== false) ? h("span", { class: "cursor" }) : null));
    } else body.appendChild(h("div", { class: "term-line" + (ln.e ? " err" : "") }, ln.o));
  });
  const actions = opts.actions || null;
  return h("div", { class: "term" + (opts.cls ? " " + opts.cls : ""), dir: "ltr" },
    termBar(opts.title || "Command Prompt", actions), body);
}

function termBar(title, extra) {
  const tab = h("div", { class: "term-tab" }, h("span", { class: "ti" }, ">_"), h("span", { class: "tt" }, title));
  return h("div", { class: "term-bar" }, tab, h("div", { class: "spacer" }), extra || null);
}

const CONSOLE_COLORS = { 0: "#0c0c0c", 1: "#3b78ff", 2: "#16c60c", 3: "#3a96dd", 4: "#e74856", 5: "#b4009e", 6: "#c19c00", 7: "#cccccc", 8: "#767676", 9: "#3b78ff", a: "#16c60c", b: "#61d6d6", c: "#e74856", d: "#b4009e", e: "#f9f1a5", f: "#f2f2f2" };

/* Interactive terminal bound to a Shell instance. */
function InteractiveTerminal({ sh, preload, banner, title, onCommand, keys = true, cls }) {
  const body = h("div", { class: "term-body", role: "log", "aria-live": "polite" });
  const prompt = h("span", { class: "pr" });
  const input = h("input", {
    class: "term-input", type: "text", dir: "ltr", autocomplete: "off", autocapitalize: "off",
    autocorrect: "off", spellcheck: "false", enterkeyhint: "send", "aria-label": Content.t("type_here"),
  });
  const form = h("form", { class: "term-input-row" }, prompt, input);
  const titleEl = h("span", { class: "tt" });
  const history = [];
  let hIdx = 0, wait = null, timer = null, acc = null, baseTitle = title || "Command Prompt";

  function addLine(l) {
    let el;
    if (l.t === "note" || l.t === "warn") {
      el = h("div", { class: "term-note" + (l.t === "warn" ? " warn" : "") }, h("b", null, l.t === "warn" ? "هشدار" : "راهنما"), fmt(l.text));
    } else if (l.t === "cmd") {
      el = h("div", { class: "term-line" }, h("span", { class: "pr" }, l.p), h("span", { class: "cm" }, l.c));
    } else {
      el = h("div", { class: "term-line" + (l.t === "err" ? " err" : "") }, l.text);
    }
    body.insertBefore(el, form);
  }
  const addLines = (ls) => ls.forEach(addLine);
  function clear() { Array.from(body.children).forEach((c) => { if (c !== form) c.remove(); }); }
  function scroll() {
    body.scrollTop = body.scrollHeight;
    if (wrap.isConnected) {
      const r = form.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 90 || r.top < 0) form.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
  function refreshPrompt() {
    wrap.classList.toggle("is-waiting", !!wait);
    wrap.classList.toggle("is-key", !!wait && wait.kind === "key");
    wrap.classList.toggle("is-sleep", !!wait && wait.kind === "sleep");
    input.disabled = !!wait && wait.kind === "sleep" && !wait.interruptible;
    if (wait) {
      // a multi-line question: earlier lines become output, the last line is the prompt
      const parts = String(wait.prompt || "").split("\n");
      prompt.textContent = parts[parts.length - 1];
      input.placeholder = wait.kind === "key" ? "یک کلید بزن" : wait.kind === "sleep" ? "" : "";
    } else {
      prompt.textContent = Shell.prompt(sh);
      input.placeholder = "";
    }
    titleEl.textContent = (sh.admin ? "Administrator: " : "") + (sh.title || baseTitle);
    body.style.color = sh.color ? CONSOLE_COLORS[sh.color[1]] : "";
    body.style.background = sh.color && sh.color[0] !== "0" ? CONSOLE_COLORS[sh.color[0]] : "";
  }

  function handle(r) {
    if (r.clear) clear();
    addLines(r.lines || []);
    if (acc) {
      acc.recs.push(...(r.recs || []));
      (r.lines || []).forEach((l) => { if (l.t === "out" || l.t === "err") acc.out.push(l.text); else if (l.t === "cmd") acc.out.push(l.p + l.c); });
    }
    (r.recs || []).forEach((rec) => {
      if (rec.clipboard != null) { try { navigator.clipboard.writeText(rec.clipboard).catch(() => {}); } catch (e) {} }
    });
    wait = r.wait || null;
    clearTimeout(timer);
    if (wait) {
      const parts = String(wait.prompt || "").split("\n");
      parts.slice(0, -1).forEach((p) => addLine({ t: "out", text: p }));
      if (wait.kind === "sleep") timer = setTimeout(() => resume(""), wait.ms || 0);
      else if (wait.timeout) timer = setTimeout(() => resume(""), wait.timeout);
    }
    refreshPrompt();
    scroll();
    if (!wait && acc) {
      const a = acc; acc = null;
      if (onCommand) onCommand({ recs: a.recs, rec: a.recs[a.recs.length - 1] || null, output: a.out.join("\n"), lastOutput: a.out.join("\n"), raw: a.raw });
    }
  }

  function resume(answer) {
    if (!wait) return;
    const w = wait;
    clearTimeout(timer);
    if (w.kind !== "sleep") {
      const parts = String(w.prompt || "").split("\n");
      addLine({ t: "cmd", p: parts[parts.length - 1], c: answer });
      if (acc) acc.out.push(parts[parts.length - 1] + answer);
    }
    wait = null;
    handle(Shell.run(sh, answer));
  }

  function submit(v) {
    if (wait) { resume(v); return; }
    if (v.trim()) { history.push(v); hIdx = history.length; }
    addLine({ t: "cmd", p: Shell.prompt(sh), c: v });
    if (!v.trim()) { refreshPrompt(); scroll(); return; }
    acc = { recs: [], out: [], raw: v };
    handle(Shell.run(sh, v));
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (wait && wait.kind === "sleep") { if (wait.interruptible) resume("key"); return; }
    const v = input.value;
    input.value = "";
    submit(v);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "c" && e.ctrlKey) { e.preventDefault(); ctrlC(); return; }
    if (wait && wait.kind === "key" && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); input.value = ""; resume(e.key); return;
    }
    if (wait && wait.kind === "sleep" && wait.interruptible && e.key.length === 1) { e.preventDefault(); resume("key"); return; }
    if (wait) return;
    if (e.key === "ArrowUp") { e.preventDefault(); recall(-1); }
    if (e.key === "ArrowDown") { e.preventDefault(); recall(1); }
    if (e.key === "Tab") { e.preventDefault(); complete(); }
  });
  // phones often send "input" without a usable keydown
  input.addEventListener("input", () => {
    if (wait && wait.kind === "key" && input.value) { const ch = input.value.slice(-1); input.value = ""; resume(ch); }
  });
  function recall(d) {
    if (!history.length) return;
    hIdx = Math.max(0, Math.min(history.length, hIdx + d));
    input.value = history[hIdx] || "";
  }
  /* Tab: complete a file or folder name from the current folder */
  function complete() {
    const v = input.value;
    const m = v.match(/^(.*?)("?)([^\s"]*)$/);
    if (!m) return;
    const word = m[3];
    const cut = word.lastIndexOf("\\");
    const dirPart = cut >= 0 ? word.slice(0, cut + 1) : "";
    const namePart = cut >= 0 ? word.slice(cut + 1) : word;
    const p = VFS.parse(dirPart || ".", sh.drive, sh.cwd);
    const dir = VFS.resolve(sh.fs, p.drive, p.parts).node;
    if (!dir || dir.type !== "dir") return;
    const hit = VFS.sortedChildren(dir).find((c) => c.name.toLowerCase().startsWith(namePart.toLowerCase()) && !(c.attrs && c.attrs.h));
    if (!hit) return;
    const full = dirPart + hit.name;
    input.value = m[1] + (/\s/.test(full) ? '"' + full + '"' : m[2] + full);
  }
  function insert(txt) {
    if (wait && wait.kind === "key") { resume(txt.trim() || " "); return; }
    const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
    input.value = input.value.slice(0, s) + txt + input.value.slice(e);
    input.focus();
    const p = s + txt.length;
    try { input.setSelectionRange(p, p); } catch (err) {}
  }
  function ctrlC() {
    clearTimeout(timer);
    if (wait) {
      const r = Shell.cancel(sh);
      wait = null;
      if (r) addLines(r.lines);
      if (acc) { const a = acc; acc = null; if (onCommand) onCommand({ recs: a.recs, rec: a.recs[a.recs.length - 1] || null, output: a.out.join("\n"), raw: a.raw, cancelled: true }); }
    } else {
      addLine({ t: "cmd", p: Shell.prompt(sh), c: input.value + "^C" });
      input.value = "";
    }
    refreshPrompt(); scroll(); input.focus();
  }
  body.appendChild(form);
  body.addEventListener("click", () => {
    if (window.getSelection().toString()) return;
    if (wait && wait.kind === "sleep" && wait.interruptible) { resume("key"); return; }
    input.focus();
  });

  const keyBtn = (label, fn, extra = {}) => h("button", Object.assign({ type: "button", class: "key", onClick: (e) => { e.preventDefault(); fn(); } }, extra), label);
  const keyRow = keys ? h("div", { class: "keys" },
    ["\\", ":", "..", '"', "*", ">", "|", "&", "%", "/"].map((k) => keyBtn(k, () => insert(k), { "aria-label": k })),
    keyBtn("Tab", () => { complete(); input.focus(); }, { class: "key wide" }),
    keyBtn("↑", () => { recall(-1); input.focus(); }, { "aria-label": "history" }),
    keyBtn("Ctrl+C", ctrlC, { class: "key wide danger-key", "aria-label": "Ctrl+C" }),
    h("button", { type: "button", class: "key run", onClick: () => { if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event("submit", { cancelable: true })); } }, "اجرا ↵"),
  ) : null;

  const bar = h("div", { class: "term-bar" }, h("div", { class: "term-tab" }, h("span", { class: "ti" }, ">_"), titleEl), h("div", { class: "spacer" }));
  const wrap = h("div", { class: "term" + (cls ? " " + cls : ""), dir: "ltr" }, bar, body, keyRow);

  function start() {
    clearTimeout(timer);
    wait = null; acc = null;
    clear();
    if (banner) addLines(Shell.banner());
    if (preload) preload.forEach((ln) => addLines([ln.p != null ? { t: "cmd", p: ln.p, c: ln.c } : { t: "out", text: ln.o }]));
    refreshPrompt();
  }
  start();

  return {
    el: wrap,
    bar,
    focus: () => { try { input.focus({ preventScroll: true }); } catch (e) {} },
    reset(newSh) { sh = newSh; start(); },
    note(text) { addLines([{ t: "note", text }]); scroll(); },
    /* run a command as if typed (used by "try it" buttons and the Batch editor) */
    run(text) { if (wait) ctrlC(); submit(text); },
    get sh() { return sh; },
    busy: () => !!wait,
    destroy() { clearTimeout(timer); },
  };
}
