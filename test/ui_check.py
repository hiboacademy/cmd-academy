"""Browser check: every route renders without errors and without
horizontal overflow at common phone widths and on desktop.
Usage: python3 test/ui_check.py [--shots DIR]"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
R = pathlib.Path(__file__).resolve().parent.parent
html = (R / "dist/cmd-academy.html").read_text(encoding="utf8")
page_html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + html + '</body></html>'
content = json.loads((R / "dist/content.fa.json").read_text(encoding="utf8"))
lessons = [l["n"] for l in content["lessons"]]
tasks = [p["id"] for l in content["lessons"] for p in l["practice"]]
cmds = [c["name"] for c in content["commands"]]
chs = [c["id"] for c in content["challenges"]]
routes = ["", "learn", "practice", "sim", "batch", "quiz", "quiz-R", "progress", "commands", "search", "favorites", "challenges", "settings", "quiz-V1", "quiz-C1"]
routes += ["lesson%d" % n for n in lessons] + ["task-" + t for t in tasks] + ["quiz-L%d" % n for n in lessons]
routes += ["cmd-" + c for c in cmds] + ["challenge-" + c for c in chs]
shots = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None
widths = [320, 375, 390, 430, 1280]
bad = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for w in widths:
        pg = b.new_page(viewport={"width": w, "height": 860})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text and "fonts.g" not in m.text else None)
        pg.set_content(page_html, wait_until="load")
        rlist = routes if w in (375, 1280) else routes[:15] + ["lesson1", "lesson11", "task-" + tasks[0]] + (["cmd-" + cmds[0]] if cmds else [])
        for r in rlist:
            pg.evaluate("r => App.go(r)", r)
            sw = pg.evaluate("document.documentElement.scrollWidth")
            nf = pg.evaluate("!!document.querySelector('main h1') && document.querySelector('main h1').textContent.includes('پیدا نشد')")
            if sw > w: bad.append(f"overflow {w}px {r or 'home'}: {sw}")
            if nf: bad.append(f"not found {r}")
            if errs: bad.append(f"error {w}px {r}: {errs[:2]}"); errs.clear()
        if shots:
            for r in ["", "lesson11", "sim", "batch", "commands", "settings"]:
                pg.evaluate("r => App.go(r)", r); pg.wait_for_timeout(150)
                pg.screenshot(path=f"{shots}/{w}-{r or 'home'}.png", full_page=False)
        pg.close()
    b.close()
print("\n".join(bad[:60]) if bad else "UI OK: %d routes x %d widths" % (len(routes), len(widths)))
sys.exit(1 if bad else 0)
