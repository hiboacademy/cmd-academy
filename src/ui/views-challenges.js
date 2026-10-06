/* ============================================================
   ui/views-challenges.js — real-world scenarios, auto-checked
   ============================================================ */
function ChallengesView() {
  const all = Content.challenges();
  const done = all.filter((c) => Store.challengeDone(c.id)).length;
  const byLevel = [1, 2, 3].map((lv) => {
    const list = all.filter((c) => c.level === lv);
    if (!list.length) return null;
    const lvl = Content.level(lv);
    return h("section", { class: "card chapter" },
      h("div", { class: "chapter-head row between" },
        h("div", null, h("div", { class: "eyebrow" }, T("w_level") + " " + lv), h("h2", null, lvl.title)),
        h("span", { class: "pct small muted" }, `${list.filter((c) => Store.challengeDone(c.id)).length}/${list.length}`)),
      list.map((c) => {
        const ok = Store.challengeDone(c.id);
        const rec = c.after ? Content.lesson(c.after) : null;
        return h("button", { class: "task-row", onClick: () => App.go("challenge-" + c.id) },
          h("span", { class: "st" + (ok ? " done" : "") }, ok ? "✓" : ""),
          h("div", { class: "grow" },
            h("div", { style: { fontWeight: 600 } }, fmt(c.title)),
            h("div", { class: "small muted" }, (c.batch ? ".bat · " : "") + (rec ? T("after_lesson", { n: fa(rec.n) }) : ""))),
          icon("chev", "chev"));
      }));
  });
  return h("div", { class: "stack view" },
    h("div", { class: "row between" }, h("h1", { class: "mono", style: { direction: "ltr", textAlign: "var(--start)" } }, T("t_challenges")), h("span", { class: "pct muted" }, `${done}/${all.length}`)),
    h("p", { class: "muted" }, T("ch_intro")),
    byLevel);
}

function ChallengeView(id) {
  const c = Content.challenge(id);
  if (!c) return NotFound();
  const all = Content.challenges();
  const i = all.indexOf(c);
  const next = all.slice(i + 1).find((x) => !Store.challengeDone(x.id)) || all[i + 1];
  const runner = TaskRunner(c, {
    solvedBefore: Store.challengeDone(id),
    onSolved: () => {
      Store.markChallenge(c.id);
      return h("div", { class: "btn-row" },
        next ? h("button", { class: "btn primary", onClick: () => App.go("challenge-" + next.id) }, T("next_challenge")) : null,
        h("button", { class: "btn", onClick: () => App.go("challenges") }, T("all_challenges")));
    },
  });
  const rec = c.after ? Content.lesson(c.after) : null;
  return h("div", { class: "stack view" },
    backBtn(T("t_challenges"), "challenges"),
    h("div", { class: "stack-xs" },
      h("div", { class: "row between wrap" }, h("div", { class: "eyebrow" }, `${T("w_challenge")} ${i + 1}/${all.length}`), runner.resetBtn),
      h("h1", null, fmt(c.title)),
      c.story ? h("p", { class: "muted" }, fmt(c.story)) : null,
      rec ? h("button", { class: "linkish small", style: { alignSelf: "flex-start" }, onClick: () => App.go("lesson" + rec.n) }, T("after_lesson", { n: fa(rec.n) }) + " · " + rec.t.replace(/`/g, "")) : null),
    runner.el);
}
