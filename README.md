# CMD Academy

Persian (RTL) mobile-first app for learning Windows CMD from zero to Batch scripting.
Everything runs offline; the CMD Simulator is a sandbox and never runs real commands.

## Structure
- `src/content/fa/` — course content in YAML (curriculum, lessons, UI text, simulator notes)
- `src/engine/` — virtual file system, CMD interpreter, practice checker
- `src/data/`, `src/store/` — content access and on-device progress
- `src/ui/`, `src/app.js` — screens and navigation
- `src/pwa/` — manifest, service worker and page template for the installable app
- `docs/` — built app, published with GitHub Pages

## Build
```
pip install pyyaml
python3 build.py
```
Then commit `docs/`. Add lessons by adding a YAML file in `src/content/fa/lessons/`.
