/* ============================================================
   ui/terminal.js — reusable terminal component.
   Used by Simulator, Practice and lesson examples.
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
    } else body.appendChild(h("div", { class: "term-line" }, ln.o));
  });
  return h("div", { class: "term" + (opts.cls ? " " + opts.cls : ""), dir: "ltr" },
    termBar(opts.title || "Command Prompt"), body);
}

function termBar(title, extra) {
  return h("div", { class: "term-bar" },
    h("div", { class: "term-tab" }, h("span", { class: "ti" }, ">_"), title),
    h("div", { class: "spacer" }), extra || null);
}

/* Interactive terminal bound to a Shell instance. */
function InteractiveTerminal({ sh, preload, banner, title, onCommand, keys = true }) {
  const body = h("div", { class: "term-body", role: "log", "aria-live": "polite" });
  const prompt = h("span", { class: "pr" });
  const input = h("input", {
    class: "term-input", type: "text", dir: "ltr", autocomplete: "off", autocapitalize: "off",
    autocorrect: "off", spellcheck: "false", enterkeyhint: "send", "aria-label": Content.t("type_here"),
  });
  const form = h("form", { class: "term-input-row" }, prompt, input);
  const history = [];
  let hIdx = 0;

  function addLines(lines) {
    lines.forEach((l) => {
      if (l.t === "note" || l.t === "warn") {
        body.insertBefore(h("div", { class: "term-note" + (l.t === "warn" ? " warn" : "") },
          h("b", null, l.t === "warn" ? "هشدار" : "راهنما"), fmt(l.text)), form);
      } else if (l.t === "cmd") {
        body.insertBefore(h("div", { class: "term-line" }, h("span", { class: "pr" }, l.p), h("span", { class: "cm" }, l.c)), form);
      } else {
        body.insertBefore(h("div", { class: "term-line" + (l.t === "err" ? " err" : "") }, l.text), form);
      }
    });
  }
  function refreshPrompt() { prompt.textContent = Shell.prompt(sh); }
  function clear() { Array.from(body.children).forEach((c) => { if (c !== form) c.remove(); }); }
  function scroll() {
    body.scrollTop = body.scrollHeight;
    if (wrap.isConnected) {
      const r = form.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 90 || r.top < 0) form.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = "";
    if (v.trim()) { history.push(v); hIdx = history.length; }
    addLines([{ t: "cmd", p: Shell.prompt(sh), c: v }]);
    const r = Shell.run(sh, v);
    if (r.clear) clear(); else addLines(r.lines);
    refreshPrompt();
    scroll();
    if (onCommand && r.rec) onCommand(r);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") { e.preventDefault(); recall(-1); }
    if (e.key === "ArrowDown") { e.preventDefault(); recall(1); }
  });
  function recall(d) {
    if (!history.length) return;
    hIdx = Math.max(0, Math.min(history.length, hIdx + d));
    input.value = history[hIdx] || "";
  }
  function insert(txt) {
    const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
    input.value = input.value.slice(0, s) + txt + input.value.slice(e);
    input.focus();
    const p = s + txt.length;
    try { input.setSelectionRange(p, p); } catch (err) {}
  }
  body.appendChild(form);
  body.addEventListener("click", (e) => { if (!window.getSelection().toString()) input.focus(); });

  const keyRow = keys ? h("div", { class: "keys" },
    ["\\", ":", "..", "/", '"', "*", " "].map((k) => h("button", { type: "button", class: "key", onClick: () => insert(k) }, k === " " ? "␣" : k)),
    h("button", { type: "button", class: "key", "aria-label": "history", onClick: () => { recall(-1); input.focus(); } }, "↑"),
    h("button", { type: "button", class: "key run", onClick: () => form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true })) }, "اجرا ↵"),
  ) : null;

  const wrap = h("div", { class: "term", dir: "ltr" }, termBar(title || "Command Prompt"), body, keyRow);

  function start() {
    clear();
    if (banner) addLines(Shell.banner());
    if (preload) preload.forEach((ln) => addLines([ln.p != null ? { t: "cmd", p: ln.p, c: ln.c } : { t: "out", text: ln.o }]));
    refreshPrompt();
  }
  start();

  return {
    el: wrap,
    focus: () => input.focus({ preventScroll: true }),
    reset(newSh) { sh = newSh; start(); },
    note(text) { addLines([{ t: "note", text }]); scroll(); },
  };
}
