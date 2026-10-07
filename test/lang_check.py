"""Language selector check on the real built app (docs/, the same files the
Android app ships), served over HTTP so reloads and restarts are real:
  fresh install -> English (LTR)
  pick Deutsch -> German; restart -> still German (LTR)
  pick فارسی -> Persian, RTL; restart -> still Persian
  all three languages selectable, none disabled, no "Coming soon" on them,
  commands and code stay left-to-right in every language.
Usage: python3 test/lang_check.py"""
import sys, json, pathlib, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

R = pathlib.Path(__file__).resolve().parent.parent
UI = {l: json.loads((R / f"dist/content.{l}.json").read_text(encoding="utf8"))["ui"] for l in ("en", "de", "fa")}
SOON = {UI[l]["coming_soon"] for l in UI} | {"Coming soon", "coming soon"}
bad = []
def check(ok, msg):
    print(("  ok   " if ok else "  FAIL ") + msg)
    if not ok: bad.append(msg)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
class Server(socketserver.TCPServer): allow_reuse_address = True
srv = Server(("127.0.0.1", 0), functools.partial(Quiet, directory=str(R / "docs")))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_address[1]}/"

def state(pg):
    return pg.evaluate("""() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir,
        appDir: document.getElementById('app').dir, saved: JSON.parse(localStorage.getItem('cmdacademy.progress.v1') || '{}').settings,
        nav: document.querySelector('nav.bottom-nav').innerText.replace(/\\s+/g, ' ').trim() })""")

def settings_buttons(pg):
    pg.evaluate("App.go('settings')"); pg.wait_for_timeout(100)
    return pg.evaluate("""() => { const g = [...document.querySelectorAll('.seg')].find(s => s.getAttribute('aria-label') === Content.t('set_lang'));
        return g ? [...g.querySelectorAll('button')].map(b => ({ text: b.innerText.trim(), disabled: b.disabled, pressed: b.getAttribute('aria-pressed'), lang: b.lang })) : null; }""")

def pick(pg, name):
    pg.evaluate("App.go('settings')"); pg.wait_for_timeout(100)
    with pg.expect_navigation():
        pg.locator(".seg button", has_text=name).first.click()
    pg.wait_for_function("typeof App !== 'undefined' && document.querySelector('nav.bottom-nav')")

def code_ltr(pg, lang):
    pg.evaluate("App.go('lesson11')"); pg.wait_for_timeout(150)
    n = pg.evaluate("[...document.querySelectorAll('main .ex-cmd, main .syntax, main .term-body, main code.ic, main .term-hero')].filter(e => getComputedStyle(e).direction !== 'ltr').length")
    check(n == 0, f"{lang}: commands and code are left-to-right")

def restart(ctx, pg):
    pg.close()
    p2 = ctx.new_page(); p2.goto(URL); p2.wait_for_function("typeof App !== 'undefined' && document.querySelector('nav.bottom-nav')")
    return p2

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844})   # fresh install: empty storage
    errs = []
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_function("typeof App !== 'undefined' && document.querySelector('nav.bottom-nav')")

    print("fresh install")
    s = state(pg)
    check(s["lang"] == "en" and s["dir"] == "ltr" and s["appDir"] == "ltr", f"English and LTR by default (got {s['lang']}/{s['dir']})")
    check(not (s["saved"] or {}).get("lang"), "nothing saved until the learner picks a language")
    check(UI["en"]["nav_learn"] in s["nav"], f"English navigation ({s['nav']})")
    btns = settings_buttons(pg)
    check(btns and [x["text"] for x in btns] == ["English", "Deutsch", "فارسی"], f"selector offers English, Deutsch, فارسی ({btns and [x['text'] for x in btns]})")
    check(btns and not any(x["disabled"] for x in btns), "all three languages are enabled")
    check(btns and not any(any(w in x["text"] for w in SOON) for x in btns), "no 'Coming soon' on any language")
    check(btns and [x["pressed"] for x in btns] == ["true", "false", "false"], "English is marked as selected")
    code_ltr(pg, "en")

    print("select Deutsch")
    pick(pg, "Deutsch")
    s = state(pg)
    check(s["lang"] == "de" and s["dir"] == "ltr", f"German active, LTR (got {s['lang']}/{s['dir']})")
    check(UI["de"]["nav_learn"] in s["nav"], f"German navigation ({s['nav']})")
    check((s["saved"] or {}).get("lang") == "de", "choice saved")
    pg.evaluate("App.go('lesson1')"); pg.wait_for_timeout(100)
    check(pg.evaluate("document.querySelector('main h1').innerText") == json.loads((R / "dist/content.de.json").read_text(encoding="utf8"))["curriculum"]["levels"][0]["chapters"][0]["lessons"][0]["t"], "German lesson content")
    pg = restart(ctx, pg); pg.on("pageerror", lambda e: errs.append(str(e)))
    s = state(pg)
    check(s["lang"] == "de" and s["dir"] == "ltr", f"after restart still German (got {s['lang']})")
    btns = settings_buttons(pg)
    check(btns and [x["pressed"] for x in btns] == ["false", "true", "false"], "Deutsch is marked as selected")
    code_ltr(pg, "de")

    print("select فارسی")
    pick(pg, "فارسی")
    s = state(pg)
    check(s["lang"] == "fa" and s["dir"] == "rtl" and s["appDir"] == "rtl", f"Persian active, page RTL (got {s['lang']}/{s['dir']})")
    check(UI["fa"]["nav_learn"] in s["nav"], "Persian navigation")
    pg = restart(ctx, pg); pg.on("pageerror", lambda e: errs.append(str(e)))
    s = state(pg)
    check(s["lang"] == "fa" and s["dir"] == "rtl", f"after restart still Persian and RTL (got {s['lang']}/{s['dir']})")
    btns = settings_buttons(pg)
    check(btns and not any(x["disabled"] for x in btns) and not any(any(w in x["text"] for w in SOON) for x in btns), "in Persian, all three enabled and no 'به‌زودی'")
    code_ltr(pg, "fa")

    print("reset progress keeps the language; back to English")
    pg.evaluate("Store.reset()")
    pg = restart(ctx, pg)
    check(state(pg)["lang"] == "fa", "resetting progress does not reset the language")
    pick(pg, "English")
    pg = restart(ctx, pg)
    s = state(pg)
    check(s["lang"] == "en" and s["dir"] == "ltr", "English again after restart")

    check(not errs, f"no page errors {errs[:2]}")
    b.close()
srv.shutdown(); srv.server_close()
print("LANG OK" if not bad else f"{len(bad)} problem(s)")
sys.exit(1 if bad else 0)
