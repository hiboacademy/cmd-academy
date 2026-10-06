"""Checks that a translated content file matches its Persian source.

A translation must keep exactly the same structure as the Persian file:
same keys, same list lengths, same order. Only learner-facing text may change:
  - a string that contains Persian letters MUST be translated (no Persian left),
  - a string without Persian letters (commands, paths, switches, output, IDs)
    MUST stay byte-for-byte identical,
  - inside translated text, every `code span` and {placeholder} must be kept.
Lists under the key "keywords" are free (search words per language).

Usage:  python3 i18n_check.py de        (checks src/content/de against fa)
        python3 i18n_check.py en src/content/en/lessons/batch-03.yaml
"""
import re, sys, pathlib, yaml

R = pathlib.Path(__file__).parent
FA = re.compile(r"[؀-ۿ]")
CODE = re.compile(r"`[^`]*`")
PH = re.compile(r"\{[a-z_]+\}")
FREE_KEYS = {"keywords"}
FILES = ["curriculum.yaml", "ui.yaml", "shell.yaml", "commands.yaml", "challenges.yaml"]


def compare(fa, tr, path, errs):
    if isinstance(fa, dict):
        if not isinstance(tr, dict):
            errs.append(f"{path}: expected a mapping"); return
        if set(fa) != set(tr):
            miss = sorted(set(fa) - set(tr)); extra = sorted(set(tr) - set(fa))
            errs.append(f"{path}: keys differ (missing {miss}, extra {extra})")
        for k in fa:
            if k in tr and k not in FREE_KEYS:
                compare(fa[k], tr[k], f"{path}.{k}", errs)
        return
    if isinstance(fa, list):
        if not isinstance(tr, list) or len(fa) != len(tr):
            errs.append(f"{path}: list length differs ({len(fa)} vs {len(tr) if isinstance(tr, list) else type(tr).__name__})"); return
        for i, (a, b) in enumerate(zip(fa, tr)):
            compare(a, b, f"{path}[{i}]", errs)
        return
    if isinstance(fa, str) and FA.search(fa):
        if not isinstance(tr, str):
            errs.append(f"{path}: expected text"); return
        if FA.search(tr):
            errs.append(f"{path}: still contains Persian: {tr[:80]!r}")
        a = sorted(c for c in CODE.findall(fa) if not FA.search(c))
        b = sorted(c for c in CODE.findall(tr) if not FA.search(c))
        if a != b:
            errs.append(f"{path}: code spans changed {sorted(set(a) ^ set(b))[:4]}")
        if sorted(PH.findall(fa)) != sorted(PH.findall(tr)):
            errs.append(f"{path}: placeholders changed {PH.findall(fa)} vs {PH.findall(tr)}")
        return
    if fa != tr:
        errs.append(f"{path}: must stay identical: {fa!r} -> {tr!r}")


def check_file(lang, rel):
    fa = yaml.safe_load(open(R / "src/content/fa" / rel, encoding="utf8"))
    p = R / "src/content" / lang / rel
    if not p.exists():
        return [f"{lang}/{rel}: missing"]
    try:
        tr = yaml.safe_load(open(p, encoding="utf8"))
    except yaml.YAMLError as e:
        return [f"{lang}/{rel}: invalid YAML: {e}"]
    errs = []
    compare(fa, tr, f"{lang}/{rel}", errs)
    return errs


def all_files():
    return FILES + sorted("lessons/" + p.name for p in (R / "src/content/fa/lessons").glob("*.yaml"))


if __name__ == "__main__":
    lang = sys.argv[1]
    rels = [str(pathlib.Path(a).resolve().relative_to((R / "src/content" / lang).resolve())) for a in sys.argv[2:]] or all_files()
    errs = [e for rel in rels for e in check_file(lang, rel)]
    print("\n".join(errs[:80]) if errs else f"{lang}: OK ({len(rels)} files)")
    sys.exit(1 if errs else 0)
