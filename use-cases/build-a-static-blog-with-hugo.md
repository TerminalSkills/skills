---
title: Build a Static Blog with Hugo
slug: build-a-static-blog-with-hugo
description: Launch a fast Markdown blog on free static hosting, with drafts, a theme and automatic publishing on every push, for writers and small businesses.
skills:
  - hugo
  - github-actions
category: development
tags:
  - hugo
  - static-site-generator
  - blog
  - github-pages
  - markdown
---

## The Problem

Sofia Marchetti runs Saltmarsh Bakery with two employees and writes a recipe journal that brings in most of her wholesale enquiries. The journal lives on a hosted blog plan that costs 19 euros a month. Pages take 3 to 4 seconds to load on a phone, the plugin updates break the layout about once a quarter, and last spring the site was offline for a weekend after a failed update.

She writes in Markdown anyway and pastes every post into a web editor by hand. With 140 posts and one new post a week, she wants the files in a Git repository she controls, a site that cannot be broken by a plugin, and no monthly bill.

She does not want to learn a build toolchain. Publishing should mean: write a file, push, done.

## The Solution

The agent uses the **hugo** skill to scaffold the project, add a theme, configure the site, create posts and build it. It uses the **github-actions** skill to write the workflow that builds the site and publishes it to GitHub Pages on every push to `main`.

## Step-by-Step Walkthrough

### 1. Install Hugo and scaffold the project

**Prompt:** "Set up a Hugo blog called saltmarsh-journal on my Mac, with the Ananke theme."

```bash
brew install hugo
hugo version
hugo new project saltmarsh-journal
cd saltmarsh-journal
git init
git submodule add https://github.com/gohugo-ananke/ananke themes/ananke
printf 'public/\nresources/\n.hugo_build.lock\n' > .gitignore
```

`hugo version` reports v0.167.0, which is newer than the v0.158.0 the skill requires.

### 2. Configure the site

**Prompt:** "The title is Saltmarsh Bakery Journal, British English, and I want post addresses with year and month."

The agent writes `hugo.toml`:

```toml
baseURL = 'https://journal.saltmarshbakery.co/'
locale = 'en-gb'
title = 'Saltmarsh Bakery Journal'
theme = 'ananke'
enableRobotsTXT = true

[params]
  description = 'Recipes and notes from a small coastal bakery'

[permalinks.page]
  posts = '/:year/:month/:slug/'
```

### 3. Write the first post and preview it

**Prompt:** "Create a post about my first sourdough loaf and let me look at it before it goes live."

```bash
hugo new content content/posts/first-sourdough-loaf.md
hugo server --buildDrafts --navigateToChanged
```

The new file starts with `draft = true`. The agent adds the body text and the tags `sourdough` and `starter`, starts the server in the background and gives Sofia the address http://localhost:1313/. The browser reloads each time the file is saved.

### 4. Publish the post and check what is still a draft

**Prompt:** "The sourdough post is ready. Anything else unfinished?"

The agent sets `draft = false` in the post, then runs:

```bash
hugo list drafts
hugo build --gc --minify --cleanDestinationDir
```

`hugo list drafts` prints one remaining row, `content/posts/rye-starter-day-5.md`. The build reports 16 pages in 30 ms and writes the post to `public/2026/09/first-sourdough-loaf/index.html`.

### 5. Publish automatically on every push

**Prompt:** "Host it on GitHub Pages and rebuild whenever I push."

Sofia sets the Pages source to "GitHub Actions" in the repository settings. The agent writes `.github/workflows/hugo.yaml`:

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

Then the agent commits and pushes:

```bash
git add .
git commit -m "feat: scaffold Hugo journal with Ananke theme"
git remote add origin git@github.com:saltmarsh-bakery/journal.git
git push -u origin main
```

`submodules: recursive` matters: without it the theme directory is empty in CI and the site builds without a layout.

## Real-World Example

Sofia and the agent finished the setup in one afternoon. Moving the 140 existing posts took the longest: the agent converted the export to Markdown files with TOML front matter, and `hugo list drafts` showed the 9 posts that had never been published on the old site, so none of them went live by accident.

The full site of 140 posts builds in under a second on her laptop, and the GitHub Actions run takes about 40 seconds from push to live. Pages that needed 3 to 4 seconds on a phone now load in well under one, because they are plain files with minified HTML.

Her weekly routine is three steps: `hugo new content content/posts/seeded-rye-loaf.md`, write, push. The 19 euro plan is cancelled, which saves 228 euros a year, and there has been no layout breakage since, because nothing on the site updates itself.

## Related Skills

- [hugo](/skills/hugo) — scaffolds the project, manages the theme and configuration, creates posts, lists drafts and builds the site
- [github-actions](/skills/github-actions) — builds the site in CI and publishes `public/` to GitHub Pages on every push to `main`
