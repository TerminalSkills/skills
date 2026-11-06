---
title: Build Visual Regression Testing for UI Components
slug: build-visual-regression-testing-for-ui-components
description: >
  Catch unintended CSS changes before they ship — screenshot every
  component variant, diff against baselines, and block PRs that break
  visual consistency across 200+ components.
skills:
  - typescript
  - playwright-testing
  - vitest
  - github-actions
  - docker-helper
  - storybook
category: development
tags:
  - visual-testing
  - regression
  - ui-components
  - screenshot-diff
  - playwright
  - storybook
  - design-system
---

# Build Visual Regression Testing for UI Components

## The Problem

A design system with 200+ React components powers four product teams' UIs. CSS changes cause cascading visual bugs: updating a button's padding breaks card layouts, changing a color token makes text unreadable on dark backgrounds, and a z-index change hides dropdown menus. These bugs reach production because unit tests pass — the logic is correct, but the UI looks broken. Each one takes hours to find, fix and deploy.

The approach: build Storybook once, open every story in Playwright at three viewport widths and two themes, and compare each screenshot to a baseline committed in git. Playwright Test already does the capture, diffing, baseline storage and report (`toHaveScreenshot`), so there is no custom diff engine to maintain. The one trap is that the same page renders slightly differently on macOS, Windows and Linux (fonts, anti-aliasing), so baselines are only comparable if they are always produced in the same environment. Docker provides that.

## Step 1: Functional story tests first

Visual diffs are noisy when a story throws. Run the stories as tests before the screenshots. With Storybook 10 the Vitest addon turns every story and its `play` function into a test (`npx storybook add @storybook/addon-vitest`, then `npx vitest --project=storybook`). Fix those failures first; this page covers the visual layer.

## Step 2: Playwright config and one test per story

Install an exact Playwright version (the Docker image in Step 4 must carry the same one) and an HTTP server for the static build:

```console
$ npm i -D --save-exact @playwright/test@1.65.0
$ npm i -D http-server
```

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 },
  },
  use: { baseURL: 'http://127.0.0.1:6006' },
  projects: [
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'npx http-server storybook-static -a 127.0.0.1 -p 6006 --silent',
    url: 'http://127.0.0.1:6006/index.json',
    reuseExistingServer: !process.env.CI,
  },
});
```

The server is bound to `127.0.0.1`, and Playwright waits for `index.json` before starting. Each project is one viewport, so every test runs three times.

```typescript
// tests/visual/stories.spec.ts
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

type Entry = { id: string; type: 'story' | 'docs' };
const index = JSON.parse(readFileSync('storybook-static/index.json', 'utf8')) as {
  entries: Record<string, Entry>;
};
const storyIds = Object.values(index.entries)
  .filter((entry) => entry.type === 'story')
  .map((entry) => entry.id);

for (const theme of ['light', 'dark']) {
  for (const id of storyIds) {
    test(`${id} [${theme}]`, async ({ page }) => {
      await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
      await page.locator('#storybook-root').waitFor();
      await expect(page).toHaveScreenshot(`${id}--${theme}.png`, { fullPage: true });
    });
  }
}
```

Notes:

- `index.json` is written by `npx storybook build -o storybook-static`; entries of type `docs` are skipped.
- `globals=theme:dark` only takes effect if your `.storybook/preview.ts` defines a `theme` global (a toolbar item or an entry in `initialGlobals`) and a decorator that applies it.
- `toHaveScreenshot` disables CSS animations and waits for two consecutive identical frames before comparing, so no fixed `waitForTimeout` is needed. Mask or mock anything truly dynamic (dates, avatars) in the story itself.
- Baselines are stored next to the spec in `tests/visual/stories.spec.ts-snapshots/`, named `<story>--<theme>-<project>-<platform>.png`. Commit them. A baseline created on macOS is named `-darwin` and will not be used on Linux, which is the reason for Step 4.

When a test fails, Playwright writes the expected, actual and diff images to `test-results/` and into the HTML report. In a single-viewport check I changed a button's padding and got `1328 pixels (ratio 0.01 of all image pixels) are different`.

## Step 3: Generate baselines, then review them like code

Create or update baselines with `npx playwright test --update-snapshots` (Step 4 shows the Docker form). A design-token change then shows up as a PNG diff in the pull request, and the designer approves the change by approving the images, not by trusting a description.

## Step 4: Render in the Playwright Docker image

Playwright publishes versioned images that bundle the browsers and system fonts. Use the same tag locally and in CI so every baseline is rendered identically. The tag must match the pinned `@playwright/test` version, and `noble` is the Ubuntu 24.04 flavor.

```console
$ docker run --rm --init --ipc=host \
    -v "$PWD":/work -v /work/node_modules -w /work \
    -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
    mcr.microsoft.com/playwright:v1.65.0-noble \
    sh -c 'npm ci && npx storybook build -o storybook-static && npx playwright test --update-snapshots && chown -R "$HOST_UID:$HOST_GID" tests/visual storybook-static'
```

`--ipc=host` and `--init` are Playwright's recommendation for Chromium in Docker. The anonymous `/work/node_modules` volume keeps the container's Linux `node_modules` from overwriting yours, and `--rm` removes it with the container. The `chown` hands the generated files back to your user, since the container runs as root. Bump the image tag together with `@playwright/test` and regenerate the baselines in the same PR.

## Step 5: GitHub Actions

CI runs inside the same image and fails the PR when any screenshot differs:

```yaml
# .github/workflows/visual-test.yml
name: Visual Regression Tests
on:
  pull_request:
    paths: ['src/**', '.storybook/**', 'tests/visual/**', 'package*.json']

permissions:
  contents: read

jobs:
  visual-test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    container:
      image: mcr.microsoft.com/playwright:v1.65.0-noble
      options: --ipc=host --init
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx storybook build -o storybook-static
      - run: npx playwright test
      - name: Upload report and diff images
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: visual-diff
          path: |
            playwright-report/
            test-results/
          retention-days: 14
```

A failed run uploads the HTML report and the diff images; the `github` reporter also annotates the failing tests in the PR. To accept an intended change, regenerate the baselines with the Docker command from Step 4 and commit the new PNGs. Mark the job as a required check in branch protection so a visual change cannot merge unreviewed.

With hundreds of stories the PNGs add up: store `tests/visual/**/*.png` with Git LFS, or shard the run with `npx playwright test --shard=1/4` across a matrix.

## Results

For a design system of this size, the setup gives the team:

- every story captured at 3 viewports × 2 themes, so 200 stories produce about 1,200 baseline images
- CSS and token changes visible as pixel diffs in the pull request, not found in production
- baselines that match between laptops and CI, because both render in the same Docker image
- no custom diffing code to maintain: capture, comparison, retries and the report are Playwright's

## Related Skills

- [typescript](/skills/typescript) — typed config and spec files
- [playwright-testing](/skills/playwright-testing) — `toHaveScreenshot`, projects and the report
- [vitest](/skills/vitest) — the Storybook Vitest addon for functional story tests
- [github-actions](/skills/github-actions) — the PR workflow, permissions and artifacts
- [docker-helper](/skills/docker-helper) — running and pinning the Playwright image
- [storybook](/skills/storybook) — building the static Storybook and its `index.json`
