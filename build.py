"""Bundle CMD Academy into one self-contained HTML page.
Content (YAML) -> JSON, then CSS + JS + JSON are inlined.
Later the Vite project imports the same JSON files instead."""
import json, glob, yaml, pathlib
R = pathlib.Path(__file__).parent
def y(p): return yaml.safe_load(open(R / p, encoding="utf8"))
import i18n_check
VERSION = "1.1.0"
LANGS = ["fa", "de", "en"]          # Persian is the source; de/en must match its structure

def load_lang(lang):
    lessons = []
    for f in sorted(glob.glob(str(R / f"src/content/{lang}/lessons/*.yaml"))):
        lessons += yaml.safe_load(open(f, encoding="utf8"))
    lib = y(f"src/content/{lang}/commands.yaml")
    return {"lang": lang, "curriculum": y(f"src/content/{lang}/curriculum.yaml"), "lessons": lessons,
            "shell": y(f"src/content/{lang}/shell.yaml"), "ui": y(f"src/content/{lang}/ui.yaml"),
            "categories": lib["categories"], "commands": lib["commands"],
            "challenges": y(f"src/content/{lang}/challenges.yaml") or [],
            "meta": {"version": VERSION}}

errs = [e for lang in LANGS[1:] for rel in i18n_check.all_files() for e in i18n_check.check_file(lang, rel)]
if errs:
    raise SystemExit("translations do not match the Persian source:\n" + "\n".join(errs[:40]))
bundle = {lang: load_lang(lang) for lang in LANGS}
content = bundle["fa"]
lessons = content["lessons"]
# sanity checks
nums = [l["n"] for lv in content["curriculum"]["levels"] for ch in lv["chapters"] for l in ch["lessons"]]
assert nums == list(range(1, len(nums) + 1)), "lesson numbers must be continuous"
ids = [p["id"] for l in lessons for p in l["practice"]]
assert len(ids) == len(set(ids)), "duplicate practice id"
pathlib.Path(R / "dist").mkdir(exist_ok=True)
for lang in LANGS:
    json.dump(bundle[lang], open(R / f"dist/content.{lang}.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
order = ["src/engine/vfs.js", "src/engine/sysdata.js", "src/engine/seta.js", "src/engine/shell.js",
         "src/engine/cmd-core.js", "src/engine/cmd-files.js", "src/engine/cmd-text.js", "src/engine/cmd-system.js",
         "src/engine/cmd-network.js", "src/engine/cmd-disk.js", "src/engine/cmd-batch.js", "src/engine/checker.js", "src/data/content.js",
         "src/store/progress.js", "src/ui/dom.js", "src/ui/terminal.js", "src/ui/views-common.js", "src/ui/views-home.js",
         "src/ui/views-learn.js", "src/ui/views-practice.js", "src/ui/views-sim.js", "src/ui/views-quiz.js",
         "src/ui/views-library.js", "src/ui/views-challenges.js", "src/ui/views-progress.js", "src/app.js"]
js = "\n".join(open(R / f, encoding="utf8").read() for f in order)
import hashlib as _h
build_id = _h.sha1((js + json.dumps(bundle, ensure_ascii=False)).encode()).hexdigest()[:8]
for lang in LANGS: bundle[lang]["meta"]["build"] = build_id
css = open(R / "src/ui/styles.css", encoding="utf8").read()
data = json.dumps(bundle, ensure_ascii=False).replace("</", "<\\/")
html = open(R / "src/index.template.html", encoding="utf8").read()
html = html.replace("/*STYLES*/", css).replace("/*CONTENT*/", data).replace("/*SCRIPTS*/", js)
open(R / "dist/cmd-academy.html", "w", encoding="utf8").write(html)
print(f"{len(nums)} lessons in outline, {len(lessons)} written, {len(ids)} practice tasks, languages {'/'.join(LANGS)}, {len(html)//1024} KB")

# ---------- PWA (installable app) -> docs/ for GitHub Pages ----------
import shutil, hashlib
AR = "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0898-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC"
LA = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
faces = []
for w in (400, 500, 700):
    faces.append(f'@font-face{{font-family:"Vazirmatn";font-style:normal;font-weight:{w};font-display:swap;src:url(fonts/vazirmatn-arabic-{w}-normal.woff2) format("woff2");unicode-range:{AR}}}')
    faces.append(f'@font-face{{font-family:"Vazirmatn";font-style:normal;font-weight:{w};font-display:swap;src:url(fonts/vazirmatn-latin-{w}-normal.woff2) format("woff2");unicode-range:{LA}}}')
for w in (400, 600, 700):
    faces.append(f'@font-face{{font-family:"JetBrains Mono";font-style:normal;font-weight:{w};font-display:swap;src:url(fonts/jetbrains-mono-latin-{w}-normal.woff2) format("woff2")}}')
D = R / "docs"
if D.exists(): shutil.rmtree(D)
shutil.copytree(R / "src/assets/fonts", D / "fonts")
shutil.copytree(R / "src/assets/icons", D / "icons")
shutil.copy(R / "src/pwa/manifest.webmanifest", D / "manifest.webmanifest")
pw = open(R / "src/pwa/index.template.html", encoding="utf8").read()
pw = pw.replace("/*FONTS*/", "\n".join(faces)).replace("/*STYLES*/", css).replace("/*CONTENT*/", data).replace("/*SCRIPTS*/", js)
open(D / "index.html", "w", encoding="utf8").write(pw)
files = ["./", "index.html", "manifest.webmanifest"] + sorted(
    str(p.relative_to(D)).replace("\\", "/") for p in D.rglob("*") if p.is_file() and p.parent != D)
build = hashlib.sha1(pw.encode()).hexdigest()[:10]
sw = open(R / "src/pwa/sw.js", encoding="utf8").read().replace("__BUILD__", build).replace("__FILES__", json.dumps(files))
open(D / "sw.js", "w", encoding="utf8").write(sw)
open(D / ".nojekyll", "w").write("")
print(f"PWA built in docs/ (build {build}, {len(files)} cached files)")
