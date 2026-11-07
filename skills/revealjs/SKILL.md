---
name: revealjs
description: >-
  reveal.js is an open-source framework that turns HTML or Markdown into a browser-based slide deck with nested slides, fragments, speaker notes, code highlighting and PDF export. Use it when a user asks to "build a slide deck as a web page", "write my presentation in Markdown", "make slides with code walkthroughs", "add speaker notes", or "export reveal.js slides to PDF". Covers npm install, plugins, config options and headless Chrome PDF export for reveal.js 6.
license: Apache-2.0
compatibility: "A modern browser; Chrome or Chromium for PDF export; any static file server. Node.js is needed only for the npm install (the package has no engines field) and, per the docs, 20.19+ to build from a repository clone"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: content
  tags: "reveal-js, presentations, slides, markdown, html"
  repository: https://github.com/hakimel/reveal.js
---
# reveal.js — HTML and Markdown presentations that run in the browser

## Overview
reveal.js (MIT licensed, version 6.0.2 on npm at the time of writing) renders `<section>` elements as slides. A slide can be plain HTML or Markdown, sections nested inside a section become vertical slides, and built-in features include fragments (step-by-step reveal), auto-animate, speaker view, line-by-line code highlighting and a print stylesheet for PDF. A deck is static files, so it can be hosted anywhere.

Docs: revealjs.com (installation, markup, markdown, speaker-view, pdf-export, config). Prefer the sibling skills when the user wants something else: `dev-slides` for Slidev (Vue-based), `ai-slides` for Marp/PowerPoint output.

## Instructions

### Install
Three routes: download the repo zip (no tooling), clone and `npm start` (dev server on port 8000), or use npm as a dependency. For an agent, npm is simplest:

```bash
mkdir q3-review && cd q3-review
npm init -y
npm install reveal.js
```

The package ships ready-to-use files in `node_modules/reveal.js/dist/`: `reveal.js`, `reveal.css`, `reset.css`, `theme/*.css`, and plugins `dist/plugin/markdown.js`, `highlight.js`, `notes.js`, `math.js`, `search.js`, `zoom.js`. Themes: black, white, league, beige, night, serif, simple, solarized, moon, dracula, sky, blood, plus black-contrast and white-contrast.

### A complete deck (script-tag setup)
Save as `index.html`. Each plugin is a global named `Reveal<Name>`.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Q3 Platform Review</title>
  <link rel="stylesheet" href="node_modules/reveal.js/dist/reset.css">
  <link rel="stylesheet" href="node_modules/reveal.js/dist/reveal.css">
  <link rel="stylesheet" href="node_modules/reveal.js/dist/theme/night.css">
  <link rel="stylesheet" href="node_modules/reveal.js/dist/plugin/highlight/monokai.css">
</head>
<body>
  <div class="reveal">
    <div class="slides">
      <section>
        <h1>Q3 Platform Review</h1>
        <p>Infrastructure team, 29 October 2026</p>
        <aside class="notes">Keep the intro under one minute.</aside>
      </section>
      <section data-markdown data-separator="^---$" data-separator-notes="^Note:">
        <textarea data-template id="highlights-source">
          ## Highlights
          - p95 latency down from 480 ms to 310 ms <!-- .element: class="fragment" -->
          - Deploy frequency up to 38 per week <!-- .element: class="fragment" -->
          Note: Mention the cache rollout in August.
          ---
          ## Config
          ```yaml [1-2|3]
          replicas: 6
          region: eu-west-1
          timeout: 30s
          ```
        </textarea>
      </section>
      <section>
        <section><h2>Risks</h2></section>
        <section><h3>Database failover</h3></section>
      </section>
    </div>
  </div>
  <script src="node_modules/reveal.js/dist/reveal.js"></script>
  <script src="node_modules/reveal.js/dist/plugin/markdown.js"></script>
  <script src="node_modules/reveal.js/dist/plugin/highlight.js"></script>
  <script src="node_modules/reveal.js/dist/plugin/notes.js"></script>
  <script>
    Reveal.initialize({
      hash: true,
      slideNumber: 'c/t',
      transition: 'slide',
      width: 1280,
      height: 720,
      plugins: [RevealMarkdown, RevealHighlight, RevealNotes]
    });
  </script>
</body>
</html>
```

This exact deck was built and rendered to PDF in a scratch directory with reveal.js 6.0.2.

### ES module setup (bundler projects)
```javascript
import Reveal from 'reveal.js';
import Markdown from 'reveal.js/plugin/markdown';
import Highlight from 'reveal.js/plugin/highlight';
import Notes from 'reveal.js/plugin/notes';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/night.css';
import 'reveal.js/plugin/highlight/monokai.css';

const deck = new Reveal({ hash: true, plugins: [Markdown, Highlight, Notes] });
deck.initialize();
```

### Markdown slides
Add the `data-markdown` attribute to a section element and wrap the text in a textarea element that has the `data-template` attribute. `---` on its own line starts a new horizontal slide. Indentation matters: do not mix tabs and spaces. Per-element attributes use HTML comments: `- item <!-- .element: class="fragment" -->`; per-slide attributes use `<!-- .slide: data-background="#0b3d2e" -->`. In a Markdown slide, a line `Note:` starts the speaker notes (the pattern is configurable with `data-separator-notes`).

External Markdown: `<section data-markdown="slides/intro.md" data-separator="^\r?\n---\r?\n" data-separator-vertical="^\r?\n--\r?\n"></section>`. Loading a file needs an HTTP server, not `file://`. Code fences accept highlight steps: ` ```js [1-2|4] ` shows lines 1-2, then line 4.

### Serve locally
```bash
python3 -m http.server 8123 --bind 127.0.0.1
```

Open `http://127.0.0.1:8123/`. Pick a free port; `npx vite` or any static server works too. Press `S` for the speaker view (opens a second window with notes, timer and the next slide), `O` for overview, `F` for fullscreen, `?` for the key list.

### Speaker notes
Use `<aside class="notes">` inside a slide, a `data-notes="..."` attribute, or the `Note:` line in Markdown. The Notes plugin must be registered. Set `showNotes: true` to show notes on the slide itself and in the PDF, or `'separate-page'` to print them on their own page. For a pacing timer set `defaultTiming` (seconds per slide, for example 120) in the config.

### Export to PDF (headless Chrome)
reveal.js prints through a special stylesheet activated by `?print-pdf`; the docs state it is confirmed only in Chrome and Chromium. Verified command:

```bash
python3 -m http.server 8123 --bind 127.0.0.1 &
SERVER_PID=$!
google-chrome --headless --no-sandbox --no-pdf-header-footer --virtual-time-budget=8000 \
  --print-to-pdf=q3-review.pdf "http://127.0.0.1:8123/index.html?print-pdf"
kill $SERVER_PID
```

`--virtual-time-budget` gives the page time to lay out before printing. The three-section test deck produced a multi-page PDF. Fragments print one page per step by default; set `pdfSeparateFragments: false` to print each slide once with everything visible, and `pdfMaxPagesPerSlide: 1` to forbid tall slides spilling onto extra pages. In the interactive dialog use Landscape, Margins none, Background graphics on. `decktape` is an alternative CLI named in the docs (not run here).

### Useful config options
`hash` (slide position in the URL), `slideNumber` (`true`, `'c/t'`), `controls`, `progress`, `transition` (`none`, `fade`, `slide`, `convex`, `concave`, `zoom`), `width`/`height`/`margin` (the design canvas; content is scaled to fit), `center`, `autoSlide` (milliseconds), `showNotes`, `pdfSeparateFragments`, `pdfMaxPagesPerSlide`, `view` (`'scroll'` for scroll mode), `embedded` (deck inside a page element). Change at runtime with `Reveal.configure({ ... })`; navigate with `Reveal.slide(h, v)`, `Reveal.next()`, and listen with `Reveal.on('slidechanged', e => ...)`.

## Examples

### Example 1: "Turn this outline into a 10-minute web deck with speaker notes"
Create `outline.md` with `---` between slides and `Note:` blocks, then reference it:

```html
<section data-markdown="outline.md" data-separator="^\r?\n---\r?\n" data-separator-notes="^Note:"></section>
```

Register `RevealMarkdown` and `RevealNotes`, serve over HTTP, and open it. Result: each `---` block is a slide and pressing `S` shows its note text in the speaker window. (Inline `data-markdown` was run; external-file loading follows the docs.)

### Example 2: "Give me a PDF of the board deck for email"
```bash
python3 -m http.server 8123 --bind 127.0.0.1 &
SERVER_PID=$!
google-chrome --headless --no-sandbox --no-pdf-header-footer --virtual-time-budget=8000 \
  --print-to-pdf=board-deck.pdf "http://127.0.0.1:8123/index.html?print-pdf"
kill $SERVER_PID
```
Result: `board-deck.pdf` with one page per slide (and per fragment step unless `pdfSeparateFragments: false`). Open it once and check the backgrounds and that no slide is cut off.

## Guidelines
- Serve over HTTP. External Markdown, the speaker view and some plugins fail on `file://` pages.
- Keep each `<section>` small; a slide taller than the canvas is scaled down or, in PDF, split across pages.
- Inline Markdown inside a data-template textarea is indentation-sensitive; keep the block consistently indented and avoid consecutive blank lines.
- Always register plugins in `plugins: []`; loading the script tag alone does nothing. There is no separate PDF plugin; use `?print-pdf`.
- Do not hotlink random CDN builds; install from npm and pin the version in `package.json`.
- Speaker notes are visible to anyone with the source or with `showNotes: true`; do not put secrets in them.
- Start the server on a free port and stop it afterwards. Do not use reveal.js for decks that must open in PowerPoint; export PDF, or use a tool that produces .pptx.
