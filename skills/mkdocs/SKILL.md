---
name: mkdocs
description: >-
  MkDocs is a Python static site generator that builds a documentation site
  from Markdown files and one mkdocs.yml, most often with the Material for
  MkDocs theme. Use when a user asks to create project documentation, configure
  MkDocs themes, add search and navigation, customize Markdown extensions,
  deploy docs to GitHub Pages, version docs with mike, or decide between
  MkDocs 1.x, Material for MkDocs and its successor Zensical.
license: Apache-2.0
compatibility: "Python 3.8+ for MkDocs 1.6 and Material for MkDocs 9.7; Python 3.10+ for Zensical"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["documentation", "python", "static-site", "material-theme", "markdown"]
  repository: https://github.com/mkdocs/mkdocs
---
# MkDocs — Python Documentation Generator

## Overview

MkDocs turns a folder of Markdown files and one `mkdocs.yml` into a static documentation site. Most sites pair it with Material for MkDocs (`mkdocs-material`), which adds the theme, search, navigation features, tags, blog and social cards. The ecosystem changed in 2025–2026, so check the state before starting (as of October 2026):

- **MkDocs 1.6.1** (August 2024) is still the latest stable release; `pip install mkdocs` installs it. There has been no 1.x release since.
- **MkDocs 2.0** exists only as pre-releases (`2.0.dev6`, installed only with `pip install --pre`). It is a rewrite: according to the Material for MkDocs maintainers it drops the plugin system, replaces the theming API and does not read `mkdocs.yml` (`2.0.dev6` stops with an error when it finds one), so no existing Material site builds on it.
- **Material for MkDocs 9.7** is in maintenance mode since November 2025: 9.7.0 was the last feature release (it made the former Insiders features free), and the team promised critical bug and security fixes for at least 12 months, later extended to May 5, 2027, when the theme reaches end of life. It requires `mkdocs>=1.6,<2`.
- **Zensical** (`zensical`, MIT) is the successor from the same team. It reads an existing `mkdocs.yml`, reimplements the popular plugins natively and is released about once a week. It is at 0.0.67, a series its own team calls alpha; they have announced 0.1.0, the first release line they describe as dependable, for November 5, 2026.
- **ProperDocs** (`properdocs`) is a community fork of MkDocs 1.x that aims to be a drop-in replacement.

## Instructions

### What to use today

- **Existing Material for MkDocs site:** keep building it, with exact version pins. Nothing forces a move, but it will get no new features. Build the same `mkdocs.yml` with Zensical alongside and switch when every plugin you depend on is supported (Example 2).
- **New site:** start with Zensical if its supported plugin list covers you; pin the exact version because it is pre-1.0. Choose Material for MkDocs 9.7 if you need a third-party MkDocs plugin Zensical does not replace, and accept that it is frozen.
- **Never** install MkDocs with `--pre` or leave `mkdocs` unpinned in a Material project.

### Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install "mkdocs-material==9.7.7"       # installs mkdocs 1.6.1
mkdocs new ledger-docs && cd ledger-docs   # creates mkdocs.yml and docs/index.md
mkdocs serve                               # live preview at http://127.0.0.1:8000
mkdocs build --strict                      # static site in site/; warnings fail the build
pip freeze > requirements.txt              # lock the versions for CI
```

Material prints a red notice about MkDocs 2.0 on every build; `export NO_MKDOCS_2_WARNING=1` silences it.

### Configuration

```yaml
# mkdocs.yml
site_name: Ledger SDK Documentation
site_url: https://docs.ledgerkit.dev/
repo_url: https://github.com/ledgerkit/ledger-sdk
repo_name: ledgerkit/ledger-sdk

theme:
  name: material
  palette:
    - scheme: default
      primary: indigo
      accent: indigo
      toggle:
        icon: material/brightness-7
        name: Switch to dark mode
    - scheme: slate
      primary: indigo
      accent: indigo
      toggle:
        icon: material/brightness-4
        name: Switch to light mode
  features:
    - navigation.instant           # SPA-like navigation (needs site_url)
    - navigation.tracking          # URL follows the active heading
    - navigation.tabs              # top-level sections as tabs
    - navigation.sections
    - navigation.expand
    - navigation.top               # back-to-top button
    - search.suggest
    - search.highlight
    - content.code.copy            # copy button on code blocks
    - content.code.annotate        # code annotations
    - content.tabs.link            # linked content tabs
    - announce.dismiss

plugins:
  - search                         # must be listed again once `plugins` is set
  - tags
  - social                         # needs: pip install "mkdocs-material[imaging]"

markdown_extensions:
  - admonition                     # callout boxes
  - pymdownx.details               # collapsible callouts
  - pymdownx.superfences           # nested code blocks, Mermaid
  - pymdownx.tabbed:
      alternate_style: true        # content tabs
  - pymdownx.highlight:
      anchor_linenums: true
  - pymdownx.emoji:
      emoji_index: !!python/name:material.extensions.emoji.twemoji
      emoji_generator: !!python/name:material.extensions.emoji.to_svg
  - attr_list
  - md_in_html
  - toc:
      permalink: true

nav:
  - Home: index.md
  - Getting Started:
    - Installation: guide/installation.md
    - Quick Start: guide/quickstart.md
  - API Reference:
    - Client: api/client.md
  - Changelog: changelog.md
```

### Markdown Features (Material Theme)

````markdown
!!! note "Sandbox keys"
    Keys that start with `lk_test_` only reach the sandbox.

!!! warning
    This endpoint is rate limited to 60 requests per minute.

??? info "Click to expand"
    A collapsible admonition (`pymdownx.details`).

=== "Python"

    ```python
    client = Client(
        api_key=os.environ["LEDGER_API_KEY"],  # (1)!
        timeout=30,                            # (2)!
    )
    ```

    1. Create the key under Settings → API keys.
    2. Seconds. The default is 60.

=== "cURL"

    ```bash
    curl -H "Authorization: Bearer $LEDGER_API_KEY" https://api.ledgerkit.dev/v1/invoices
    ```
````

The `(1)!` markers are code annotations (`content.code.annotate`); the numbered list directly below the block supplies their text.

### API reference, versions, deployment

```bash
pip install "mkdocstrings[python]"     # then add `- mkdocstrings` under plugins
pip install mike                       # versioned docs on the gh-pages branch
mike deploy --push --update-aliases 2.1 latest
mike set-default --push latest
mkdocs gh-deploy --force               # unversioned: build and push site/ to gh-pages
```

- A page containing `::: ledger_sdk.Client` renders that class from its docstrings.
- For the version selector add `extra: { version: { provider: mike } }` to `mkdocs.yml`. Use either `mike` or `mkdocs gh-deploy` on a repository, not both.
- In CI, run the same commands after `pip install -r requirements.txt` with `permissions: contents: write`, and set the Pages source to the `gh-pages` branch.

### Zensical

```bash
pip install "zensical==0.0.67"
zensical new handbook        # zensical.toml, docs/, .github/workflows/docs.yml
cd handbook
zensical serve               # preview at localhost:8000
zensical build --clean       # static site in site/
```

`zensical build` and `zensical serve` also run in a directory that only has `mkdocs.yml`. Not supported there: `hooks`, `exclude_docs`, `draft_docs`, `not_in_nav`, the `gh-deploy` and `get-deps` commands, and the `--site-dir`, `--theme` and `--use-directory-urls` flags (set them in the config). Plugins without a native replacement are skipped silently. `theme: { variant: classic }` keeps the Material look; the default is the new `modern` design.

## Examples

**Example 1: Documentation for a Python SDK, published on GitHub Pages**

User: "Set up docs for our SDK with MkDocs Material and publish them from CI."

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install "mkdocs-material[imaging]==9.7.7" "mkdocstrings[python]"
mkdocs new . && pip freeze > requirements.txt
```

Write the `mkdocs.yml` shown above with `- mkdocstrings` added to `plugins`, put `::: ledger_sdk.Client` in `docs/api/client.md`, create the other pages listed under `nav:` (a missing one aborts a `--strict` build), then add the workflow:

```yaml
# .github/workflows/docs.yml
name: docs
on:
  push:
    branches: [main]
permissions:
  contents: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          git config user.name github-actions[bot]
          git config user.email 41898282+github-actions[bot]@users.noreply.github.com
      - uses: actions/setup-python@v5
        with:
          python-version: 3.x
      - run: pip install -r requirements.txt
      - run: mkdocs gh-deploy --force --strict
```

Result: `mkdocs build --strict` ends with `INFO - Documentation built in 7.85 seconds`; `site/` contains `index.html`, `api/client/index.html` with the methods of `Client`, `search/`, `sitemap.xml` and one social card PNG per page under `site/assets/images/social/`. Each push to `main` updates the `gh-pages` branch.

**Example 2: Try Zensical on an existing Material for MkDocs site**

User: "Material for MkDocs is in maintenance mode. Can our docs move to Zensical?"

```bash
python3 -m venv .venv-zensical
.venv-zensical/bin/pip install "zensical==0.0.67" mkdocstrings-python
.venv-zensical/bin/zensical build --clean
```

```text
Build started
No issues found
Build finished in 4.21s
```

Compare `site/` with the MkDocs output page by page (navigation, search, tabs, annotations, API pages), and check every entry under `plugins:` against the supported list at `https://zensical.org/docs/compatibility/mkdocs/plugins/`. The same `mkdocs.yml` keeps building with `mkdocs build`, so the production pipeline stays untouched until the comparison is clean; then replace `mkdocs gh-deploy` in CI with `zensical build --clean` plus a GitHub Pages upload (the workflow `zensical new` generates shows the steps).

## Guidelines

1. **Pin everything** — `mkdocs-material==9.7.7` (or an exact `zensical` version) in `requirements.txt`; rebuild the lock file on purpose, not on every CI run
2. **Build with `--strict` in CI** — broken links and missing nav entries fail the build instead of shipping
3. **Material theme** — use `mkdocs-material` rather than the built-in `mkdocs` and `readthedocs` themes for search, tabs, annotations and dark mode
4. **Code annotations** — `(1)!` for inline explanations instead of long comments
5. **Content tabs** — show the same example in several languages; `content.tabs.link` keeps the choice across the page
6. **Admonitions for callouts** — `!!! note/warning/tip/danger`; more visible than bold text
7. **Social cards** — the `social` plugin needs the `imaging` extra plus the Cairo system library; a stale `.cache/` can hide the missing dependency, so add `.cache/` to `.gitignore` and install the extra in CI
8. **Versioning** — `mike` keeps each version in its own folder on `gh-pages`; with Zensical it works through the fork `squidfunk/mike` until native versioning ships
9. **Third-party plugins are code** — an MkDocs plugin and `hooks:` run arbitrary Python during the build; install only plugins you trust
10. **When not to use** — a site that needs React components or MDX is better served by Docusaurus; Sphinx remains the choice for reStructuredText and heavy cross-project API references
