---
name: clone-website
description: >-
  Rebuilds an existing website as a clean new codebase that looks and behaves like the
  original: captures pages, breakpoints, design tokens, assets and interaction states
  with a browser tool, plans the build, rebuilds section by section and proves each one
  against the capture with a pixel diff. Use when the user says "clone this website",
  "rebuild my site in Next.js or Astro", "recreate this page pixel-perfect", "move my
  Webflow or WordPress site to code" or "copy this layout". Full copies are only for
  sites the user owns or is authorized to copy; for anyone else's site it borrows the
  layout ideas and never the brand, content or sign-in pages.
license: Apache-2.0
compatibility: "Any coding agent with a browser tool (Playwright MCP, Chrome DevTools MCP, or the Playwright library on Node.js 20+) and write access to a frontend project"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: design
  tags: ["website-cloning", "frontend", "visual-diff", "design-tokens", "playwright"]
---

# Clone Website

## Overview

Cloning a website here means rebuilding it: fresh code in a modern stack that renders the same pages at the same widths and reacts the same way to a hover, a click or a scroll. Nothing is lifted out of the old site's bundles. The agent watches the live site through a browser tool, writes what it measures into a `capture/` folder, builds from that record, and shows the match with screenshots compared pixel by pixel.

Five stages: settle the right to copy, capture, plan, rebuild one section at a time with a diff after each, hand over a parity report. A full copy is for a site the user owns or has the owner's permission to copy. Someone else's site can only serve as a layout reference for the user's own brand. The skill does not produce look-alikes of another brand.

## Instructions

### 1. Settle rights and scope before the browser opens

Ask whatever the conversation has not answered yet:

1. Whose site is it: yours, a client's (who agreed, and how), or another company's?
2. What is the rebuild for: a move to a new stack, a base for a redesign, or a look wanted for a different business?
3. Which pages are in scope, and where will the content live afterwards (in the code, Markdown, a CMS)?
4. Is there a project to build into, or is the stack open?

Choose a lane and record it, with the user's answer, at the top of `capture/plan.md`:

| Lane | When | What is reproduced |
|---|---|---|
| Faithful rebuild | The user owns the site, or its owner authorized the copy | Layout, styling, behaviour, and the owner's own text, images and logo |
| Reference build | The site is somebody else's | Section order, grid, spacing rhythm and interaction ideas. Name, logo, copy, images, palette and typefaces are the user's own |
| Decline | Another brand's sign-in, checkout, payment or account-recovery page; a wish to keep that brand's name or logo; a copy meant to be mistaken for the original | Nothing. Explain, and offer a reference build |

Ownership cannot be verified from a chat, but a story that does not fit can be noticed. An owner can reach the CMS, the hosting or the DNS, or can name who does. Warning signs: the target is the login of a bank, shop, mail or social service the user does not run; the new domain is spelled almost like the target's; "visitors should not notice the difference". Any of these moves the request to Decline, whatever purpose is given (a demo, a test, staff training).

Manners while capturing: a handful of page loads, not a crawl; respect `robots.txt`; never work around a login, paywall or bot check; signed-in pages only through a session the user opens on their own account.

### 2. Capture the source into `capture/`

Every step below is a page load, a resize, a script run in the page, or a screenshot, so any browser tool will do: `browser_navigate`, `browser_resize`, `browser_evaluate` and `browser_take_screenshot` in Playwright MCP; `navigate_page`, `resize_page`, `evaluate_script` and `take_screenshot` in Chrome DevTools MCP; or a Playwright script (`npm install --save-dev playwright pixelmatch pngjs`, then `npx playwright install chromium`). The scripts below are the repeatable route; with an MCP tool alone, perform the same sequence by hand and keep the file names.

**Pages.** Read `sitemap.xml`, the navigation and the footer. Group the URLs by template (home, listing, detail, article, legal) and capture one URL per template. For a faithful rebuild also note each page's path, title and meta description: the new site must keep them or redirect them.

**Tokens, breakpoints, assets.** Run this function in the page at the widest viewport and save what it returns as `capture/survey.json`:

```js
() => {
  const tally = (map, key) => key && map.set(key, (map.get(key) || 0) + 1);
  const seen = { text: new Map(), fill: new Map(), family: new Map(), type: new Map(), space: new Map(), radius: new Map(), shadow: new Map(), maxWidth: new Map() };
  const assets = [];
  for (const el of document.body.querySelectorAll('*')) {
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const cs = getComputedStyle(el);
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      tally(seen.text, cs.color);
      tally(seen.family, cs.fontFamily);
      tally(seen.type, `${cs.fontSize} / ${cs.lineHeight} / ${cs.fontWeight}`);
    }
    for (const gap of [cs.paddingTop, cs.paddingLeft, cs.rowGap, cs.columnGap]) if (/^[1-9]/.test(gap)) tally(seen.space, gap);
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') tally(seen.fill, cs.backgroundColor);
    if (cs.borderTopLeftRadius !== '0px') tally(seen.radius, cs.borderTopLeftRadius);
    if (cs.boxShadow !== 'none') tally(seen.shadow, cs.boxShadow);
    if (cs.maxWidth !== 'none') tally(seen.maxWidth, cs.maxWidth);
    for (const m of cs.backgroundImage.matchAll(/url\("([^"]+)"\)/g)) assets.push({ kind: 'background', url: m[1] });
  }
  for (const img of document.images) assets.push({ kind: 'img', url: img.currentSrc, alt: img.alt, natural: `${img.naturalWidth}x${img.naturalHeight}`, shown: `${img.clientWidth}x${img.clientHeight}` });
  for (const media of document.querySelectorAll('video, audio')) assets.push({ kind: media.tagName.toLowerCase(), url: media.currentSrc, poster: media.poster });
  for (const link of document.querySelectorAll('link[rel~="icon"]')) assets.push({ kind: 'icon', url: link.href });
  const variables = {}, breakpoints = new Set(), unreadable = [];
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) for (const m of rule.conditionText.matchAll(/width[^)]*?([\d.]+(?:px|em|rem))/g)) breakpoints.add(m[1]);
      if (rule instanceof CSSStyleRule && /(^|,)\s*(:root|html|body)\s*(,|$)/.test(rule.selectorText)) {
        for (const name of rule.style) if (name.startsWith('--')) variables[name] = rule.style.getPropertyValue(name).trim();
      }
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch { unreadable.push(sheet.href); }
  }
  const ranked = Object.fromEntries(Object.entries(seen).map(([k, map]) => [k, [...map].sort((a, b) => b[1] - a[1]).slice(0, 12)]));
  const fonts = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`);
  return { variables, breakpoints: [...breakpoints], unreadable, fonts, inlineSvg: document.querySelectorAll('svg').length, ...ranked, assets };
}
```

How to read it: `variables` are the tokens the authors named, so keep their roles. Each tally is `[value, uses]`; a value used once or twice is a one-off, not a token. `breakpoints` decides the capture widths: one inside every range (720px and 1040px give 390, 768 and 1440). `unreadable` lists stylesheets served from another origin, whose rules the browser will not expose; for those, resize in 80px steps and note the widths where a section's box jumps.

**Screenshots and section boxes.** Name every top-level block in page order in `capture/sections.source.json`, for instance `{"header": ".bar", "hero": ".hero", "faq": "#faq"}`. Save this as `capture/shots.mjs` and run it for the source now, and for the rebuild after every change:

```js
// node capture/shots.mjs https://fernhillcycleworks.co.uk/ capture/source capture/sections.source.json 390 768 1440
import fs from 'node:fs';
import { chromium } from 'playwright';

const [url, outDir, mapFile, ...widths] = process.argv.slice(2);
const sections = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const width of widths.map(Number)) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { // wakes lazy images and reveal-on-scroll blocks
      scrollTo(0, y);
      await new Promise((done) => setTimeout(done, 150));
    }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/page-${width}.png`, fullPage: true, animations: 'disabled' });
  const boxes = {};
  for (const [name, selector] of Object.entries(sections)) {
    const block = page.locator(selector).first();
    boxes[name] = await block.evaluate((el) => ({ top: Math.round(el.getBoundingClientRect().top + scrollY), height: Math.round(el.offsetHeight) }));
    await block.screenshot({ path: `${outDir}/${name}-${width}.png`, animations: 'disabled' });
  }
  fs.writeFileSync(`${outDir}/boxes-${width}.json`, JSON.stringify(boxes, null, 2));
  await context.close();
}
await browser.close();
```

**States and motion.** For each link style, button, menu, tab set, accordion, carousel, sticky bar and form field, run the probe, trigger the state (hover, focus, click, or scrolling in 20px steps) and run it again. It waits for running transitions to end, so it reports settled values:

```js
async () => {
  const frame = () => new Promise((next) => requestAnimationFrame(next));
  const running = () => document.getAnimations().filter((a) => a instanceof CSSTransition && a.playState === 'running');
  await frame(); await frame(); // let the trigger take effect
  while (running().length) await Promise.allSettled(running().map((a) => a.finished)).then(frame); // wait for transitions to end
  const cs = getComputedStyle(document.querySelector('.hero .btn')); // the element under test
  const watch = ['color', 'backgroundColor', 'borderColor', 'boxShadow', 'transform', 'opacity', 'padding', 'height', 'textDecorationLine', 'transitionProperty', 'transitionDuration', 'transitionTimingFunction'];
  return Object.fromEntries(watch.map((name) => [name, cs[name]]));
}
```

Write one line per state in `capture/states.md`: element, trigger, what changed, timing. Sort motion into four kinds: CSS transitions, keyframe animations (`document.getAnimations()` lists what is running), scroll-linked effects, and canvas, WebGL or video. The last kind cannot be read from styles: ask the owner for the original files or plan a simpler stand-in and say so.

**Rights per asset.** Add a `rights` field to every entry in `assets`: `owner`, `licensed` (name the licence) or `third-party`. Ask the owner for original images and a content export before falling back on the served, compressed copies and the page's `innerText`. Font files are licensed software, usually for named domains: self-host them only if the owner's licence allows it, otherwise load them from the owner's font account or pick an open-licensed face and log the swap. Stock photos, icon sets, customer logos and testimonials need the same question.

### 3. Plan the build in `capture/plan.md`

```markdown
Lane: faithful rebuild. Maya Okafor owns fernhillcycleworks.co.uk (she administers the hosted builder and the DNS).
Stack: static HTML and CSS built with Vite; content stays in the markup.
Widths: 390, 768, 1440 (source breakpoints at 720px and 1040px).
Tokens: 6 colours, 2 font stacks, 7 font sizes, radius 8px and 16px, 1 shadow, container 1120px.
Sections, in build order: header (sticky, shrinks after 40px of scroll), hero, services, faq, footer.
Pass mark, at every width: equal section height, under 0.5% differing pixels, no solid red patch in the diff image.
Left out, for the owner to re-add: analytics tag, cookie banner, booking widget embed.
Open questions: is the photo in the hero hers or stock?
```

Use the project's existing stack if there is one. Otherwise ask, and suggest a static-first framework for content sites and a component framework where the pages are an application. Map tokens to whatever the stack uses for theming: CSS custom properties, or `@theme` variables (`--color-*`, `--font-*`, `--radius-*`, `--breakpoint-*`) in Tailwind CSS v4. Build order: tokens and fonts, page shell, sections from the top down, states, remaining templates. Leave tracking IDs, pixels, chat widgets and any key found in the source out of the code, and list them for the owner.

### 4. Rebuild one section, measure, fix, repeat

Write the markup fresh and semantic (landmarks, ordered headings, real buttons, alt text) instead of mirroring the source's DOM or class names. Give each section root an attribute such as `data-section="hero"`, so that `capture/sections.rebuild.json` maps the same names to `[data-section=hero]` and its siblings. After each section, at each width:

1. Run `capture/shots.mjs` against the rebuild's production preview, never the dev server, which may draw its own overlay.
2. Compare the `boxes` files first. A height that is off means wrong spacing, font size, line height or wrapping, and everything below it is shifted, so fix heights before pixels and work from the top down.
3. Run the diff and open the diff image; changed pixels are red. Scattered specks along glyph edges are anti-aliasing. A solid patch is a defect however small the percentage.
4. Fix what sits at the first differing row, rerun, and stop when the section meets the pass mark. After three rounds without progress, log the deviation with its cause and move on.

```js
// node capture/diff.mjs capture/source/hero-1440.png capture/rebuild/hero-1440.png capture/diff/hero-1440.png
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [sourcePath, rebuildPath, diffPath] = process.argv.slice(2);
const source = PNG.sync.read(fs.readFileSync(sourcePath));
const rebuild = PNG.sync.read(fs.readFileSync(rebuildPath));
if (source.width !== rebuild.width) throw new Error(`widths differ: ${source.width} vs ${rebuild.width}`);
const width = source.width;
const height = Math.max(source.height, rebuild.height);
const pad = (img) => { // the shorter image gets transparent rows at the bottom
  const canvas = new PNG({ width, height });
  PNG.bitblt(img, canvas, 0, 0, width, img.height, 0, 0);
  return canvas.data;
};
const diff = new PNG({ width, height });
const changed = pixelmatch(pad(source), pad(rebuild), diff.data, width, height, { threshold: 0.1 });
fs.mkdirSync(path.dirname(diffPath), { recursive: true });
fs.writeFileSync(diffPath, PNG.sync.write(diff));
let firstRow = -1;
for (let i = 0; i < diff.data.length && firstRow < 0; i += 4) {
  if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) firstRow = Math.floor(i / 4 / width);
}
console.log(`${(100 * changed / (width * height)).toFixed(2)}% differ | height ${source.height} -> ${rebuild.height} | first difference at y=${firstRow}`);
```

Then replay every line of `capture/states.md` on the rebuild with the same probe and compare values and timings.

A reference build uses the capture differently: it yields a pattern brief (section order, column counts, spacing scale, behaviours) and no pixel target. Its acceptance test is the user's review plus a side-by-side look confirming that name, logo, palette, typefaces, copy and imagery are all different from the reference.

### 5. Whole-page pass and handover

Diff `page-*.png` at every width, walk the page by keyboard, check focus visibility and text contrast against WCAG 2.2 AA (do not inherit the source's faults; record each deliberate departure), confirm a clean production build with an empty console, and make sure the network log shows no request to the old site's domain. Then write `PARITY.md` at the project root:

```markdown
| Section  | 390   | 768   | 1440  | States checked        | Notes |
|----------|-------|-------|-------|-----------------------|-------|
| header   | 0.00% | 0.00% | 0.00% | sticky shrink at 40px |       |
| hero     | 0.00% | 0.00% | 0.00% | button hover 0.15s    | photo: owner to confirm rights |
Known deviations: booking widget replaced by a link (third-party embed).
Owner to do: re-add analytics tag, confirm the font licence covers the new host, keep every page URL or redirect it.
Run: npx vite build, npx vite preview (port 4173), then capture/shots.mjs and capture/diff.mjs for each section and width.
```

## Examples

### Example 1: a faithful rebuild of the user's own site

Request: "Clone my shop's site, fernhillcycleworks.co.uk, into plain HTML and CSS with Vite. I'm leaving the site builder next month." Maya confirms she administers the builder account and the DNS, so the lane is a faithful rebuild. The survey returns eight named variables, breakpoints at 720px and 1040px, and one content image. First pass of the rebuild at 1440:

```text
header-1440:   0.28% differ | height 84 -> 84   | first difference at y=36
hero-1440:     8.14% differ | height 510 -> 497 | first difference at y=76
services-1440: 3.84% differ | height 335 -> 333 | first difference at y=134
faq-1440:      0.00% differ | height 312 -> 312 | first difference at y=-1
footer-1440:   0.00% differ | height 120 -> 120 | first difference at y=-1
```

Reading it top-down: the header's 0.28% is small but sits in one patch, the button label, drawn in ink instead of white because the nav link colour outranks the button rule. The hero is 13px short: its three-line headline is set at 48px instead of the surveyed 52px, and the grid gap is 40px instead of 48px. The service cards lack their 1px border, which is the missing 2px, and their shadow. After four fixes every section reports `0.00%` at 390, 768 and 1440. The probe matches the source on the button hover (`backgroundColor rgb(47, 107, 79)` to `rgb(36, 82, 61)`, `0.15s ease-out`) and on the header, whose padding drops from 20px to 10px once the page is scrolled past 40px. `PARITY.md` goes to Maya with one open item: confirm the hero photo is hers.

### Example 2: somebody else's page becomes a reference build

Request: "Clone the pricing page of Northpane for our invoicing app Tallybird, same as theirs." Northpane is a competitor, so the agent answers before capturing anything:

```text
I can't reproduce Northpane's page: the wording, illustrations, logo and brand colours are theirs,
and a page that reads as Northpane's would mislead your visitors. I can study how it is put together
and build Tallybird's pricing page on the same pattern with your own brand. I need your three plans
with prices, your logo and palette, and the copy (or I draft it for your review).
```

The capture then feeds a pattern brief instead of a pixel target: three plan cards in a 3/2/1-column grid with the middle one raised, a monthly or yearly toggle that swaps prices without a reload, a comparison table whose header row stays pinned while scrolling, an accordion of questions. The page is built with Tallybird's tokens and copy and reviewed by the user. No diff is run against Northpane.

### Example 3: a request to decline

Request: "Make an exact copy of the Corran Bank login page for corran-bank-secure.net, logo included." This is another brand's sign-in page on a look-alike domain. The agent declines, says that such a page is the working part of a phishing kit whatever it is meant for, and offers what it can do: a login screen for the user's own product, or a training page under an invented brand.

## Guidelines

- Not legal advice. Roughly: text, photos, illustrations, video and code are protected works; a general layout usually is not, yet a site that confuses visitors about who runs it is unlawful in most places regardless of what was copied. When the lane is unclear, take the reference lane and tell the user to ask a lawyer.
- Take both sets of screenshots with one browser, one machine, one device scale factor. Fonts rasterize differently across operating systems, and that alone can fail a diff.
- Text set in a substitute font never passes on pixels. Judge it by equal box heights and identical line breaks, and say so in the report.
- Freeze what moves before capturing: dismiss cookie banners, pause carousels, and hide rotating testimonials, dates and counters with the screenshot `mask` option on both sides. A sticky bar or chat bubble can cover part of a section shot.
- `reducedMotion: 'reduce'` only helps on sites that honour the preference; `animations: 'disabled'` is what fast-forwards finite animations and resets looping ones for the shot.
- A fixed sleep is not a safe wait for a transition in a headless browser: in testing, a 0.2s transition still reported mid-way values 400ms later. Wait on the animations themselves, as the probe does.
- Computed values are results, not intent. A 1120px block is usually `max-width` with auto margins: read the matching rule before hard-coding a width.
- `deviceScaleFactor: 1` keeps diffs fast but picks 1x images; check the sharpness of photos and icons once at scale 2 by eye.
- On very tall pages rely on the section shots; a single full-page image can become too large to compare.
- This covers the presentation layer only. Forms, search, accounts, carts and CMS content need real back ends, designed separately.
- Skip it when the user has the site's source code (migrate the code) or a design file (build from the design): both are better inputs than a rendered page.
