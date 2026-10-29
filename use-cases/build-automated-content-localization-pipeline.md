---
title: "Build an Automated Content Localization Pipeline with AI"
slug: build-automated-content-localization-pipeline
description: "Automate translating and adapting app content for multiple locales using AI-powered workflows."
skills: [content-writer, batch-processor, data-extractor]
category: automation
tags: [i18n, localization, translation, content, automation]
---

# Build an Automated Content Localization Pipeline with AI

## The Problem

A 15-person SaaS startup is expanding into Germany, Brazil and Japan. The app has hundreds of translation keys in JSON locale files, plus marketing pages and email templates. The current process: export strings to a spreadsheet, email it to freelance translators, wait days, then copy-paste the result back. Keys get missed, context is lost ("board" could be a Kanban board or a bulletin board), the Brazilian translations read as if written for Portugal, and German uses informal "du" where the brand needs formal "Sie". Nobody tracks which keys were added last sprint, and some English strings are hardcoded in React components and never reach the locale files. A trade show in six weeks needs all three languages.

## The Solution

**data-extractor** finds every translatable string (locale files, email templates; a lint rule finds hardcoded JSX text), **batch-processor** splits the missing keys into small resumable batches, and **content-writer** supplies the brief (audience, tone, glossary) that the model follows when translating each batch. A small script then checks the result mechanically: same keys, same placeholders, correct plural forms per language. The model writes translations; a native speaker still reviews what the checks flag and the brand-critical screens.

This page assumes i18next with react-i18next (current majors 26 and 17), whose JSON uses `{{name}}` placeholders and `_one`/`_other` plural suffixes. If you prefer ICU MessageFormat (`{count, plural, one {# project} other {# projects}}`), add the `i18next-icu` plugin; do not mix the two styles in one file.

## Step-by-Step Walkthrough

### 1. Find every string that needs translating

Locale files are the easy part. Hardcoded JSX text is found with `eslint-plugin-i18next`, whose `i18next/no-literal-string` rule reports literal strings in components (flat config: `i18next.configs['flat/recommended']`). ESLint only lints `.js`/`.mjs`/`.cjs` by default, so the config must also match your component files (`files: ['**/*.{jsx,tsx}']`, with the TypeScript parser for `.tsx`); until it does, `npx eslint src` silently reports nothing.

```console
$ npm install --save-dev eslint-plugin-i18next
$ npx eslint src      # with i18next.configs['flat/recommended'] added to eslint.config.mjs
```

> Using data-extractor: list the text blocks of every file in ./emails with BeautifulSoup, skipping script and style, and write them to emails-strings.json. Then replace each literal string reported by the lint rule with a `t('...')` call and add the key to `src/locales/en.json`.

```python
from bs4 import BeautifulSoup
soup = BeautifulSoup(open("emails/welcome.html", encoding="utf-8"), "html.parser")
blocks = [e.decode_contents().strip() for e in soup.select("h1,h2,h3,p,li,td,button") if e.get_text(strip=True)]
```

Taking whole block elements keeps inline markup such as `<b>trial</b>` inside the sentence, so translators see full sentences instead of fragments. Nested blocks (a `p` inside an `li`) can appear twice; de-duplicate before translating.

### 2. Write the brief once, translate in small batches

> Using content-writer, write `localization-brief.md`: product description (project management SaaS), audience, tone per locale (de: formal Sie; pt-BR: informal "você"; ja: polite desu/masu), a glossary (board, sprint, dashboard: translate or keep English), and the rule that placeholders like `{{name}}` and plural suffixes stay exactly as in the source.

Then split the keys still missing per locale into batches (batch-processor's resume pattern: a batch file that already exists is never overwritten, and finished batches are not redone):

```console
$ python3 locales.py split src/locales de 50
$ python3 locales.py split src/locales pt-BR 50
$ python3 locales.py split src/locales ja 50
```

> For each file in `todo/`, translate the values following localization-brief.md and write the result next to it as `done/<name>.json` with identical keys. Keep UI labels short: German runs about a third longer than English, so flag any value over 40 characters for a shorter alternative. Report ambiguous terms instead of guessing.

Merge the `done/` files into `src/locales/<locale>.json` (use `de`, `pt-BR` and `ja` as file names matching your i18next language codes).

### 3. Get plural forms right per language

Plural categories come from CLDR; ask the runtime rather than a table from memory:

```console
$ node -e 'for (const l of ["en","de","pt-BR","ja"]) console.log(l, new Intl.PluralRules(l).resolvedOptions().pluralCategories)'
en [ 'one', 'other' ]
de [ 'one', 'other' ]
pt-BR [ 'one', 'many', 'other' ]
ja [ 'other' ]
```

German has the same two categories as English (the noun form changes, not the number of forms), Brazilian Portuguese has `one`, `many` and `other` (`many` is for large round numbers such as "1 milhão de projetos"; for `one`, 0 and 1 both select it, so "0 projeto"), and Japanese has only `other` (use a counter such as `{{count}}件のプロジェクト`). In i18next that means `count_one` and `count_other` for German, `count_one`, `count_many` and `count_other` for Portuguese, and only `count_other` for Japanese. Gender agreement ("1 nova tarefa" vs "1 novo projeto") is a translation concern: give the translator the noun, not just the adjective, in the key's context.

Format dates and numbers with `Intl` at runtime rather than translating them: `new Intl.NumberFormat("de-DE").format(1234.56)` gives `1.234,56`, the same call with `ja-JP` gives `1,234.56`, and `new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" })` gives `2026年10月28日`.

### 4. Validate mechanically, then review by hand

> Run `python3 locales.py check src/locales` after every merge and fix what it prints.

```python
"""python3 locales.py check src/locales        -> report problems per locale, exit 1 if any
python3 locales.py split src/locales de 50    -> todo/de-001.json ... with the keys still to translate"""
import json
import re
import sys
from pathlib import Path

PLURAL = {"de": ["one", "other"], "pt-BR": ["one", "many", "other"], "ja": ["other"]}
VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def flat(d, prefix=""):
    for k, v in d.items():
        if isinstance(v, dict):
            yield from flat(v, f"{prefix}{k}.")
        else:
            yield f"{prefix}{k}", v


def load(path):
    return dict(flat(json.loads(Path(path).read_text(encoding="utf-8"))))


def base(key):  # settings.files_one -> settings.files
    return re.sub(r"_(zero|one|two|few|many|other)$", "", key)


def check(folder):
    en = load(f"{folder}/en.json")
    en_bases = {base(k) for k in en}
    bad = 0
    for loc, cats in PLURAL.items():
        tr = load(f"{folder}/{loc}.json")
        for k in sorted(en_bases - {base(k) for k in tr}):
            print(f"{loc}: missing {k}"); bad += 1
        for k in sorted({base(k) for k in tr} - en_bases):
            print(f"{loc}: stale {k}"); bad += 1
        for k, v in tr.items():
            src = en.get(k) or en.get(base(k) + "_other") or en.get(base(k))
            if src is None:
                continue
            if set(VAR.findall(src)) != set(VAR.findall(v)) and not k.endswith("_one"):
                print(f"{loc}: {k}: placeholders differ: {src!r} vs {v!r}"); bad += 1
            if v == src and len(v) > 3:
                print(f"{loc}: {k}: identical to English"); bad += 1
        for b in {base(k) for k in tr if k != base(k)}:  # plural groups need this language's categories
            have = {k.rsplit("_", 1)[1] for k in tr if base(k) == b and k != b}
            if have != set(cats):
                print(f"{loc}: {b}: plural forms {sorted(have)}, expected {cats}"); bad += 1
    return bad


def split(folder, loc, n):
    en, tr = load(f"{folder}/en.json"), {}
    if Path(f"{folder}/{loc}.json").exists():
        tr = load(f"{folder}/{loc}.json")
    todo = {k: v for k, v in en.items() if k not in tr}
    Path("todo").mkdir(exist_ok=True)
    items = list(todo.items())
    for i in range(0, len(items), n):
        out = Path(f"todo/{loc}-{i // n + 1:03d}.json")
        if not out.exists():  # resumable: never clobber a batch that is already in progress
            out.write_text(json.dumps(dict(items[i:i + n]), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(items)} keys to translate into {loc}")


if __name__ == "__main__":
    if sys.argv[1] == "check":
        sys.exit(1 if check(sys.argv[2]) else 0)
    split(sys.argv[2], sys.argv[3], int(sys.argv[4]))
```

On a fixture with deliberate errors it reported a missing key, a renamed placeholder (`{{nom}}` for `{{name}}`), an untranslated string and the missing Portuguese `many` form, and exited with status 1, so it can gate CI. What it cannot judge is meaning: have a native speaker review the flagged ambiguous terms (is "board" a Kanban board?), the formality of sales-facing screens, and any value the model reported as ambiguous.

## Real-World Example

Dani, a frontend developer at the startup, runs the lint rule and finds two dozen hardcoded strings; they become keys in `en.json`. The brief fixes "Sie" for German, a glossary decision on "dashboard" and "sprint" for Japanese, and the model translates the roughly 900 keys in 50-key batches. The check script catches a renamed placeholder and several missing plural forms before anything ships. A native-speaking colleague reviews the flagged terms and the checkout and onboarding screens in a short call, and the team ships all three locales before the trade show. For later releases the same `split` and `check` steps run on just the new keys, which is a small step in the release checklist rather than a translator round trip.

## Related Skills

- **content-writer** for the localization brief: tone, audience and glossary.
- **batch-processor** for resumable batches over many keys.
- **data-extractor** for pulling strings out of templates and source files.
