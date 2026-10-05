/* ============================================================
   ui/dom.js — tiny DOM helpers + icons (React-like h()).
   ============================================================ */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  kids.flat(Infinity).forEach((k) => {
    if (k == null || k === false) return;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  });
  return el;
}

/* Persian text with `code` islands -> nodes. Code is always LTR. */
function fmt(text) {
  const frag = document.createDocumentFragment();
  String(text || "").split(/(`[^`]+`)/g).forEach((part) => {
    if (!part) return;
    if (part.startsWith("`") && part.endsWith("`")) frag.appendChild(h("code", { class: "ic", dir: "ltr" }, part.slice(1, -1)));
    else frag.appendChild(document.createTextNode(part));
  });
  return frag;
}
const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  learn: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/><path d="M8 7h8M8 11h6"/>',
  practice: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3"/><path d="M12 15h5"/>',
  sim: '<rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="M2.5 8h19"/><path d="M6 12.5h.01M9 12.5h6"/><path d="M6 16h3"/>',
  progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><path d="M12 17h.01"/>',
  back: '<path d="m9 6 6 6-6 6"/>',
  chev: '<path d="m15 6-6 6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  tip: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  library: '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="m16.5 4.6 3.8 1 -3.9 15-3.8-1z"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  flame: '<path d="M12 21c-4 0-7-2.7-7-6.5 0-3 2-5 3.5-6.5.3 2 1.3 3 2.5 3.5C11 8 12 5 15 3c-.5 3 2 5 3 7 .7 1.4 1 2.8 1 4.5C19 18.3 16 21 12 21z"/>',
  review: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>',
};
function icon(name, cls) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.8");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  if (cls) s.setAttribute("class", cls);
  s.innerHTML = ICONS[name] || "";
  return s;
}
function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

/* small confirm dialog built into the page (window.confirm is not available) */
function confirmDialog({ text, yes, no, danger = true }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const close = (v) => { back.remove(); document.removeEventListener("keydown", onKey); if (prev && prev.focus) prev.focus(); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    const yesBtn = h("button", { class: "btn " + (danger ? "danger" : "primary"), onClick: () => close(true) }, yes);
    const box = h("div", { class: "dialog", role: "alertdialog", "aria-modal": "true", "aria-label": text },
      h("p", null, fmt(text)),
      h("div", { class: "btn-row" }, yesBtn, h("button", { class: "btn", onClick: () => close(false) }, no)));
    const back = h("div", { class: "dialog-back", onClick: (e) => { if (e.target === back) close(false); } }, box);
    document.body.appendChild(back);
    document.addEventListener("keydown", onKey);
    yesBtn.focus();
  });
}
let toastTimer = null;
function toast(text) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = h("div", { class: "toast", role: "status" }, h("div", null, text));
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2200);
}
function starButton(kind, id, label) {
  const b = h("button", { class: "icon-btn plain star", "aria-pressed": Store.isFav(kind, id) ? "true" : "false", "aria-label": label || "Favorite", title: label || "Favorite" }, icon("star"));
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    const on = Store.toggleFav(kind, id);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    toast(on ? Content.t("fav_added") : Content.t("fav_removed"));
  });
  return b;
}

/* Shown by the PWA page when a new version took over (see pwa/index.template.html). */
function showUpdateBar() {
  if (document.querySelector(".update-bar")) return;
  const bar = h("div", { class: "update-bar", role: "status" },
    h("span", { class: "grow" }, Content.t("update_ready")),
    h("button", { class: "btn small primary", onClick: () => location.reload() }, Content.t("update_reload")),
    h("button", { class: "icon-btn plain", "aria-label": Content.t("close"), onClick: () => bar.remove() }, icon("x")));
  document.body.appendChild(bar);
}
window.showUpdateBar = showUpdateBar;
