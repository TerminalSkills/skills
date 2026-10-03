---
name: chromatic
description: Chromatic is a visual testing service from the Storybook team that snapshots every story in a cloud browser and shows visual diffs for review on each pull request. Use when the user wants visual regression testing with Storybook, or mentions "chromatic," "visual regression," "Storybook testing," "UI review," "visual diff," or "component snapshot testing." For general screenshot comparison, see percy.
license: Apache-2.0
compatibility: "Node.js 22+ for the chromatic CLI (18.x); a Storybook project and a Chromatic account; checked against chromatic 18.10.2 and Storybook 10"
metadata:
  author: terminal-skills
  version: "1.2.0"
  category: development
  tags:
    - visual-testing
    - storybook
    - regression
    - ui-review
  repository: https://github.com/chromaui/chromatic-cli
---

# Chromatic

## Overview

Chromatic is a hosted visual testing and review platform made by the maintainers of Storybook. The `chromatic` CLI builds and publishes your Storybook, Chromatic captures a snapshot of every story in cloud browsers, compares it with the accepted baseline, and lists the differences in a web UI where designers and developers accept or deny them. The same service also snapshots Playwright, Cypress and Vitest tests through the `@chromatic-com/playwright`, `@chromatic-com/cypress` and `@chromatic-com/vitest` packages. This skill covers the Storybook workflow.

## Instructions

### Initial assessment

1. Which Storybook version, and which framework package (`@storybook/react-vite`, `@storybook/nextjs`, ...)?
2. Does it build locally (`npm run build-storybook`)? Chromatic needs a working static build.
3. Which CI provider, and who reviews visual changes?

### Setup

```bash
npm install --save-dev chromatic
export CHROMATIC_PROJECT_TOKEN=chpt_...   # from the project's Manage page on chromatic.com
npx chromatic
```

The CLI reads `CHROMATIC_PROJECT_TOKEN` from the environment (preferred over the `--project-token` flag, which leaks into shell history and CI logs). The first build becomes the baseline; later builds are compared with it and marked "unreviewed" until someone accepts or denies the changes. The CLI needs Node 22 or newer.

### Story parameters

Set `parameters.chromatic` at the project (`.storybook/preview.ts`), component (`meta`) or story level:

- `delay: 300` waits that many milliseconds before the snapshot.
- `diffThreshold: 0.063` is the default sensitivity (0 most sensitive, 1 least); raise it to ignore anti-aliasing noise.
- `disableSnapshot: true` skips a story, for example one that is purely animated.
- `ignoreSelectors: ['.product-price']` ignores pixels in matching elements. Equivalent markup: `data-chromatic="ignore"` or the `chromatic-ignore` class. A size change of the ignored element still counts as a change.
- `modes` captures a story under several viewport/theme combinations (see Modes below). The older `viewports` parameter is legacy; use modes.

### Interaction tests

Chromatic runs each story's `play` function and takes the snapshot after it finishes. In Storybook 9 and 10, import the test utilities from `storybook/test`; the old `@storybook/testing-library` and `@storybook/jest` packages are deprecated.

### Configuration file

`chromatic.config.json` in the project root (JSON, not a JS module) holds a subset of CLI options. Keys: `buildScriptName`, `storybookBuildDir`, `onlyChanged`, `externals`, `skip`, `autoAcceptChanges`, `exitZeroOnChanges`, `exitOnceUploaded`. Boolean-or-glob options accept branch globs, for example `"autoAcceptChanges": "main"`. Keep the token out of this file.

### TurboSnap

`onlyChanged: true` snapshots only stories affected by the changed files, using the bundler's dependency graph (Webpack or Vite) and full git history, so CI must fetch with `fetch-depth: 0`. Changes to `.storybook/preview`, static files, a mismatched lockfile, or paths listed in `externals` (fonts, global CSS, images) force a full rebuild.

### CI (GitHub Actions)

Chromatic recommends triggering on `push`; `pull_request` builds a synthetic merge commit that can produce wrong baselines. The official workflow uses `chromaui/action@latest` with a `CHROMATIC_PROJECT_TOKEN` repository secret and `fetch-depth: 0` on checkout (see Example 2).

### Modes

Define modes once in `.storybook/modes.ts` and reuse them across stories. Modes set at project (`.storybook/preview.ts`), component and story level are stacked, not overridden: a story is snapshotted under every mode from all three levels, each with its own baseline and approval. Name the mode keys clearly, because the name becomes the badge in the review UI.

## Examples

### Example 1: Snapshot a Button across themes and sizes

**User request:** "Make Chromatic capture our Button in light and dark, on mobile and desktop."

```typescript
// .storybook/modes.ts
export const allModes = {
  "light mobile": { theme: "light", viewport: 375 },
  "dark mobile": { theme: "dark", viewport: 375 },
  "light desktop": { theme: "light", viewport: 1200 },
  "dark desktop": { theme: "dark", viewport: 1200 },
} as const;
```

```typescript
// src/components/Button.stories.jsx
import { allModes } from "../../.storybook/modes";
import { Button } from "./Button";

export default {
  component: Button,
  parameters: { chromatic: { modes: allModes, diffThreshold: 0.063 } },
};

export const Primary = {
  args: { variant: "primary", children: "Checkout" },
};
```

The `theme` key only changes anything if your preview defines a global of that name (for example through a theme decorator); `viewport` accepts a pixel width or a named viewport.

**Result:** the next build shows four snapshots per story, named after the mode; accept them to set the baselines.

### Example 2: Open dropdown and run Chromatic in CI

**User request:** "Snapshot the Dropdown while it is open, and add Chromatic to GitHub Actions."

```typescript
import { expect, userEvent, within } from "storybook/test";
// inside Dropdown.stories.jsx
export const Opened = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Options" }));
    await expect(canvas.getByRole("menu")).toBeVisible();
  },
};
```

```yaml
# .github/workflows/chromatic.yml
name: Chromatic
on: push
jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - uses: chromaui/action@latest
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          autoAcceptChanges: main
          onlyChanged: true
          skip: "dependabot/**"
```

**Result:** pushes to feature branches get a Chromatic status check that reports the diffs for review; pushes to `main` are auto-accepted so the baseline follows the merged code. A failing `expect` in `play` is reported as an interaction test failure.

## Guidelines

- Treat the project token as a secret: keep it in CI secrets or an environment variable, never in `chromatic.config.json` or committed scripts.
- Make stories deterministic before blaming Chromatic: fixed dates, seeded random data, mocked network, no looping animations. Use `delay`, `disableSnapshot` or `ignoreSelectors` for the rest.
- Each snapshot counts against your plan, so every extra mode multiplies usage; use `onlyChanged` and apply wide mode sets only to components that need them.
- With the CLI, a build with visual changes exits non-zero by default, which blocks merging; the GitHub Action defaults `exitZeroOnChanges` to true, so there the gate is the Chromatic status check. `exitOnceUploaded` makes the CLI exit 0 as soon as the upload finishes, without waiting for results.
- Auto-accept only on the main branch; accepting on feature branches defeats review.
- For one-off screenshot comparison outside Storybook, use a general tool such as Percy or Playwright's built-in snapshot assertions.
