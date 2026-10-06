# CMD Academy

Persian (RTL) mobile-first app for learning Windows CMD from zero to Batch scripting.
100 lessons, a CMD Simulator, practice tasks, quizzes, 24 challenges and a command library.
Everything runs offline on the device; progress is saved only on the device.

**Safety:** the CMD Simulator is a sandbox over a virtual file system written in JavaScript.
It never runs a real command, on the phone, in the browser or on a server.

## What is inside
- `src/content/fa/` — course content in YAML: curriculum, lessons (`lessons/batch-01..10.yaml`),
  command library (`commands.yaml`), challenges, UI text and simulator notes
- `src/engine/` — virtual file system, CMD/Batch interpreter, practice checker
- `src/data/`, `src/store/` — content access and on-device progress
- `src/ui/`, `src/app.js` — screens and navigation
- `src/pwa/` — manifest, service worker and page template for the installable web app
- `docs/` — the built web app (also the Android app's web content)
- `android/` — Capacitor Android project
- `test/` — engine, app and content tests, and a UI check at phone and desktop widths

## Build and test
```
pip install pyyaml
python3 build.py              # builds docs/ and dist/cmd-academy.html
node --test test/*.test.js    # engine, app and content tests
python3 test/ui_check.py      # every screen at 320/375/390/430/1280 px (needs playwright)
```
The content tests run every practice answer, challenge, quiz simulator task and
"try it" example in the simulator, and check that wrong attempts are rejected.

## Publish
- **Website / installable app (PWA):** GitHub → Settings → Pages → Source: **GitHub Actions**.
  Every push to `main` runs the tests and publishes `docs/`.
  On the phone, open the site in Chrome → menu → **Add to Home screen**.
- **Android APK:** every push to `main` builds `CMD-Academy.apk` and attaches it to the
  **latest** release. Open the release on the phone, download the APK and install it.
  APKs are signed with `android/app/cmd-academy.keystore` so each new one installs as an update.
  For Play Store publishing, create your own key and add it as the secrets
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## Languages
The app is available in Persian (fa, right-to-left), German (de) and English (en); the
learner picks the language in Settings (or with `?lang=de` in the address).
Persian in `src/content/fa/` is the source. `src/content/de/` and `src/content/en/` have
the same files with only the learner-facing text translated. `python3 i18n_check.py de`
(run automatically by the build) makes sure every translation keeps the same structure,
code spans and placeholders, and that commands, paths, answers and checks are identical.

## Adding content
Add or edit lessons in `src/content/fa/lessons/*.yaml`, then update the same entry in the
German and English files; practice checks are described in
`src/engine/checker.js`. Run the build and tests; a lesson whose answer does not pass its
own checks fails the tests.
