---
name: hugo
description: >-
  Hugo is a static site generator that turns Markdown content and templates
  into a complete HTML website in seconds, with no database or server runtime.
  Use when a user asks to create a Hugo site or blog, add a theme, write posts
  with front matter, preview with hugo server, configure hugo.toml, build the
  site for production, find unpublished drafts, or deploy a Hugo site to
  GitHub Pages or a cloud bucket.
license: Apache-2.0
compatibility: "Hugo v0.158.0+ on macOS, Linux or Windows 10+; Git for themes and deployment; Go only for Hugo Modules or building from source"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["hugo", "static-site-generator", "markdown", "blog", "github-pages"]
  repository: https://github.com/gohugoio/hugo
---
# Hugo — Static sites from Markdown and templates

## Overview

Hugo is a single binary that reads a project directory (content, templates, assets, configuration) and writes a finished website to `public/`. It includes a development server with live reload, asset pipelines for CSS, JavaScript and images, multilingual support, and taxonomies such as tags and categories. Reach for it when the result is documentation, a blog, a landing page or a company site that can be served as plain files.

## Instructions

### Installation

```bash
brew install hugo                    # macOS and Linux
winget install Hugo.Hugo.Extended    # Windows
choco install hugo-extended          # Windows, alternative
scoop install hugo-extended          # Windows, alternative
hugo version
```

Linux distributions package it too (`snap install hugo`, `apt install hugo`, `dnf install hugo`, `pacman -S hugo`), but apart from the snap these repositories are often behind the current release. Check `hugo version` afterwards: this skill assumes v0.158.0 or later. Prebuilt archives for every platform are on https://github.com/gohugoio/hugo/releases/latest.

Hugo ships in four editions: standard, deploy, extended and extended/deploy. Standard is enough unless the site needs `hugo deploy` (deploy editions) or the deprecated LibSass transpiler (extended editions). Sass through Dart Sass works in every edition. Most package managers install an extended edition.

### Create a project

```bash
hugo new project saltmarsh-journal
cd saltmarsh-journal
git init
git submodule add https://github.com/gohugo-ananke/ananke themes/ananke
```

`hugo new site` is an alias for the same command and is what older tutorials show. Add `--format yaml` to get `hugo.yaml` instead of `hugo.toml`. The skeleton contains `archetypes/`, `assets/`, `content/`, `data/`, `i18n/`, `layouts/`, `static/` and `themes/`. Browse themes at https://themes.gohugo.io/, or scaffold one with `hugo new theme harbor`.

### Configure the site

```toml
baseURL = 'https://journal.saltmarshbakery.co/'
locale = 'en-gb'
title = 'Saltmarsh Bakery Journal'
theme = 'ananke'
enableRobotsTXT = true

[params]
  description = 'Recipes and notes from a small coastal bakery'

[[menus.main]]
  name = 'Recipes'
  pageRef = '/recipes'
  weight = 10

[permalinks.page]
  posts = '/:year/:month/:slug/'
```

This is `hugo.toml` in the project root. `baseURL` must start with the protocol and end with a slash. `locale` replaced `languageCode` in v0.158.0. Put custom values under `[params]`. Keep the file short: set only what differs from the defaults.

```bash
hugo config | grep -i baseurl    # show the effective configuration
```

### Write content

```bash
hugo new content content/posts/first-sourdough-loaf.md
```

Run it from the project root. The file is created from `archetypes/default.md` (or `archetypes/posts.md` when it exists) with `draft = true`. A finished post looks like this:

```toml
+++
date = '2026-09-14T08:30:00+01:00'
draft = true
title = 'First Sourdough Loaf'
tags = ['sourdough', 'starter']
+++
Feed the starter twice before mixing the dough.
```

Front matter delimited by `+++` is TOML, `---` is YAML. Reserved fields include `title`, `date`, `draft`, `publishDate`, `expiryDate`, `slug`, `weight`, `description` and `aliases`; custom fields go under `params`. A page is left out of the build when `draft` is true, `date` or `publishDate` is in the future, or `expiryDate` has passed.

### Preview locally

```bash
hugo server --buildDrafts --navigateToChanged
```

The server listens on http://localhost:1313/ (bound to 127.0.0.1), rebuilds on every change and reloads the browser. It runs until interrupted, so start it in the background or let the user run it. Useful flags: `--port 1414`, `--bind 0.0.0.0` to reach it from another device, `--disableFastRender` for full re-renders.

### Build for production

```bash
hugo build --gc --minify --cleanDestinationDir
```

Plain `hugo` runs the same build. Output goes to `public/`. Hugo overwrites files there but does not delete old ones; `--cleanDestinationDir` removes stale files from `public/`, which matters after unpublishing a page. Override settings per build with `--baseURL`, `--destination` and `--environment`.

### Review content status

```bash
hugo list drafts
hugo list future
hugo list expired
hugo list published
```

Each prints CSV with the columns `path,slug,title,date,expiryDate,publishDate,draft,permalink,kind,section`.

### Environments and environment variables

```bash
hugo build --environment staging
HUGO_BASEURL=https://staging.saltmarshbakery.co/ hugo build
```

The environment is `production` for `hugo build` and `development` for `hugo server`. Settings can be split into `config/_default/hugo.toml` plus overrides such as `config/staging/hugo.toml`. Any setting can come from a variable prefixed with `HUGO_`; site parameters use `HUGO_PARAMS_`. Variables win over the configuration file.

### Themes as Hugo Modules

```bash
hugo mod init github.com/saltmarsh-bakery/journal
hugo mod get -u
hugo mod tidy
```

Modules are an alternative to Git submodules and require Go on the machine. After `hugo mod init`, declare the import in `hugo.toml`:

```toml
[module]
  [[module.imports]]
    path = 'github.com/gohugo-ananke/ananke/v2'
```

The path must match the `module` line in the theme's own `go.mod`, including a version suffix such as `/v2`.

### Deploy

Any host that serves static files can publish `public/`. For GitHub Pages, set the repository's Pages source to "GitHub Actions" and build in a workflow:

```yaml
name: Build and deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
env:
  HUGO_VERSION: 0.167.0
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          submodules: recursive
          fetch-depth: 0
      - id: pages
        uses: actions/configure-pages@v6
      - name: Install Hugo
        working-directory: ${{ runner.temp }}
        run: |
          base="https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}"
          curl -sfLO "${base}/hugo_${HUGO_VERSION}_linux-amd64.tar.gz"
          curl -sfLO "${base}/hugo_${HUGO_VERSION}_checksums.txt"
          grep "hugo_${HUGO_VERSION}_linux-amd64.tar.gz" "hugo_${HUGO_VERSION}_checksums.txt" | sha256sum -c -
          mkdir -p "${HOME}/.local/hugo"
          tar -C "${HOME}/.local/hugo" -xf "hugo_${HUGO_VERSION}_linux-amd64.tar.gz"
          echo "${HOME}/.local/hugo" >> "${GITHUB_PATH}"
      - run: hugo build --gc --minify --baseURL "${{ steps.pages.outputs.base_url }}/"
      - uses: actions/upload-pages-artifact@v5
        with:
          path: ./public
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

With a deploy edition, `hugo deploy --target production --dryRun` previews a sync of `public/` to the Amazon S3, Google Cloud Storage or Azure Blob target defined under `[deployment]`; drop `--dryRun` to apply it.

## Examples

### Example 1: Start a blog with a theme and a first post

**Request:** "Set up a Hugo blog for my bakery called Saltmarsh Bakery Journal, with the Ananke theme and a first post about sourdough."

```bash
hugo new project saltmarsh-journal
cd saltmarsh-journal
git init
git submodule add https://github.com/gohugo-ananke/ananke themes/ananke
hugo new content content/posts/first-sourdough-loaf.md
hugo build --gc --minify
```

Between the last two commands the agent writes the `hugo.toml` shown above, fills in the post body and sets `draft = false`.

**Result:** the build ends with a summary table and `public/` holds the site:

```text
                  │ EN
──────────────────┼────
 Pages            │ 16
 Paginator pages  │  0
 Non-page files   │  0
 Static files     │  1
 Processed images │  0
 Aliases          │  3
 Cleaned          │  0

Total in 30 ms
```

The post is written to `public/2026/09/first-sourdough-loaf/index.html`, next to `index.html`, `index.xml` (RSS), `sitemap.xml`, `robots.txt` and `tags/sourdough/index.html`.

### Example 2: Find out why a post is missing from the live site

**Request:** "I wrote the rye starter post last week but it is not on the site. What is wrong?"

```bash
hugo list drafts
hugo list future
```

**Result:**

```text
path,slug,title,date,expiryDate,publishDate,draft,permalink,kind,section
content/posts/rye-starter-day-5.md,,Rye Starter Day 5,2026-09-22T07:15:00+01:00,0001-01-01T00:00:00Z,2026-09-22T07:15:00+01:00,true,https://journal.saltmarshbakery.co/2026/09/rye-starter-day-5/,page,posts
```

The post is still marked `draft = true`. The agent changes that line to `draft = false` in `content/posts/rye-starter-day-5.md`, runs `hugo build --gc --minify --cleanDestinationDir`, and confirms that `public/2026/09/rye-starter-day-5/index.html` exists.

## Guidelines

- **Check the version first.** Tutorials and distribution packages lag behind. On releases before v0.158.0 the language setting is `languageCode`, not `locale`.
- **Do not commit `public/` or `resources/`.** Hugo recreates them on every build. Add both to `.gitignore` and let CI build the site.
- **Stale files are a real risk.** Without `--cleanDestinationDir`, a page that became a draft again stays in `public/` and gets deployed. Note that the flag deletes anything in `public/` the build did not produce.
- **Never deploy a `-D` build.** `--buildDrafts`, `--buildFuture` and `--buildExpired` are for previews. Setting them in the configuration file publishes unfinished content for everyone on the team.
- **`baseURL` decides every absolute link.** A wrong value breaks CSS and navigation on the host. On GitHub Pages project sites the path includes the repository name; pass it with `--baseURL` in CI.
- **Themes as submodules need `submodules: recursive`** in the checkout step, otherwise CI builds an empty site without an error.
- **The development server is not a production web server.** It has limited options; publish the files from `public/` instead.
- **Third-party themes and modules run templates inside your build.** Review a theme before adding it, pin it to a commit or version, and leave the `_merge` setting at its default so a theme cannot change `security` or `markup` configuration.
- **`hugo deploy` deletes remote files that are missing locally** (up to 256 per run by default). Always start with `--dryRun`, and only run the real sync when the user has confirmed the target.
- **Hugo does not follow symbolic links.** Use module mounts to bring in content from another directory.
- **When not to use Hugo:** pages that need per-request server logic, logged-in user content or a database. Hugo produces files at build time; pair it with a separate API or choose an application framework.
