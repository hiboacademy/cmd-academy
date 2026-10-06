"""Browser check: every route renders without errors and without horizontal
overflow at common phone widths and on desktop, in Persian, German and English.
For each language it also checks the page direction (fa = rtl, de/en = ltr),
that no raw UI key or leftover Persian text is shown in German/English, and
that commands stay left-to-right.
Usage: python3 test/ui_check.py [--shots DIR] [--lang fa,de,en] [--quick]"""
import sys, json, re, pathlib
from playwright.sync_api import sync_playwright
R = pathlib.Path(__file__).resolve().parent.parent
html = (R / "dist/cmd-academy.html").read_text(encoding="utf8")
def page_html(lang):
    return ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            f'<script>window.__CMD_LANG__ = "{lang}";</script></head><body>' + html + '</body></html>')
content = json.loads((R / "dist/content.fa.json").read_text(encoding="utf8"))
ui_keys = set(content["ui"].keys())
lessons = [l["n"] for l in content["lessons"]]
tasks = [p["id"] for l in content["lessons"] for p in l["practice"]]
cmds = [c["name"] for c in content["commands"]]
chs = [c["id"] for c in content["challenges"]]
routes = ["", "learn", "practice", "sim", "batch", "quiz", "quiz-R", "progress", "commands", "search", "favorites", "challenges", "settings", "quiz-V1", "quiz-C1"]
routes += ["lesson%d" % n for n in lessons] + ["task-" + t for t in tasks] + ["quiz-L%d" % n for n in lessons]
routes += ["cmd-" + c for c in cmds] + ["challenge-" + c for c in chs]
arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
shots = arg("--shots", None)
langs = arg("--lang", "fa,de,en").split(",")
quick = "--quick" in sys.argv
widths = [320, 375, 390, 430, 1280]
FA = re.compile(r"[؀-ۿ]")
KEYLIKE = re.compile(r"\b(?:" + "|".join(sorted((re.escape(k) for k in ui_keys if "_" in k), key=len, reverse=True)) + r")\b")
bad = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for lang in langs:
        for w in widths:
            pg = b.new_page(viewport={"width": w, "height": 860})
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text and "fonts.g" not in m.text else None)
            pg.set_content(page_html(lang), wait_until="load")
            d = pg.evaluate("document.documentElement.dir")
            if d != ("rtl" if lang == "fa" else "ltr"): bad.append(f"{lang}: page direction is {d}")
            full = (w in (375, 1280) and lang == "fa") or (w == 375 and not quick)
            rlist = routes if full else routes[:15] + ["lesson1", "lesson3", "lesson4", "lesson11", "task-" + tasks[0], "task-P4a", "cmd-" + cmds[0]]
            for r in rlist:
                pg.evaluate("r => App.go(r)", r)
                sw = pg.evaluate("document.documentElement.scrollWidth")
                nf = pg.evaluate("!!document.querySelector('main h1') && document.querySelector('main h1').textContent === Content.t('not_found')")
                if nf: bad.append(f"not found {lang} {r}")
                if sw > w: bad.append(f"overflow {lang} {w}px {r or 'home'}: {sw}")
                if errs: bad.append(f"error {lang} {w}px {r}: {errs[:2]}"); errs.clear()
                if w == 375:
                    text = pg.evaluate("document.querySelector('main').innerText + ' ' + document.querySelector('nav.bottom-nav').innerText")
                    m = KEYLIKE.search(text)
                    if m: bad.append(f"raw UI key {lang} {r or 'home'}: {m.group(0)}")
                    if lang != "fa":
                        left = [x for x in FA.findall(text.replace("فارسی", ""))]
                        if left: bad.append(f"Persian text left {lang} {r or 'home'}: {text[max(0, text.find(left[0]) - 30):text.find(left[0]) + 30]!r}")
                    # commands and code must stay left-to-right in every language
                    rtl_code = pg.evaluate("[...document.querySelectorAll('main .ex-cmd, main .syntax, main .answer-code, main .term-body, main code.ic, main .bd-code')].filter(e => getComputedStyle(e).direction !== 'ltr').length")
                    if rtl_code: bad.append(f"code not LTR {lang} {r or 'home'}: {rtl_code} elements")
            if shots:
                for r in ["", "lesson3", "lesson4", "task-P4a", "sim", "settings"]:
                    pg.evaluate("r => App.go(r)", r); pg.wait_for_timeout(150)
                    pg.screenshot(path=f"{shots}/{lang}-{w}-{r or 'home'}.png", full_page=False)
            pg.close()
    b.close()
print("\n".join(bad[:60]) if bad else "UI OK: %d routes, %s, %d widths" % (len(routes), "/".join(langs), len(widths)))
sys.exit(1 if bad else 0)
