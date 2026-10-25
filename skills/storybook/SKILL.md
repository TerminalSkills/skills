---
name: storybook
description: >-
  Storybook is a workshop for building, documenting and testing UI components in isolation. Use this skill when writing component stories (CSF), setting up Storybook 10, adding interaction, accessibility or visual tests, generating autodocs, or moving off the old test runner. Trigger words: storybook, stories, csf, play function, storybook test, vitest addon, chromatic, a11y addon.
license: Apache-2.0
compatibility: "Storybook 10.x; Node.js 20+ (see install docs); React, Vue, Svelte, Angular, Web Components; Vite recommended"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "storybook, component-testing, ui-development, documentation, visual-testing"
  repository: https://github.com/storybookjs/storybook
---

# Storybook

## Overview

Storybook renders each UI component in isolation as a set of "stories" written in Component Story Format (CSF). Stories double as living documentation (autodocs), interaction tests (play functions), accessibility checks (axe-core) and visual regression baselines. The current major is 10 (checked at 10.6.3); it is ESM-only and the testing helpers moved from `@storybook/test` into the main package as `storybook/test`.

## Instructions

### Install

```bash
npm create storybook@latest          # detects the framework, installs addons, adds scripts
npm run storybook                    # dev server on http://localhost:6006
npm run build-storybook              # static build in storybook-static/
```

pnpm: `pnpm create storybook@latest`; yarn: `yarn create storybook`. Add addons later with `npx storybook add @storybook/addon-a11y` so the package and `.storybook/main.ts` stay in sync.

### Write stories

One `*.stories.tsx` file per component, next to it. The default export is metadata, named exports are stories. Import types from the framework package (`@storybook/react-vite`, `@storybook/vue3-vite`, ...), not from `@storybook/react`.

```tsx
// src/components/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from './Button';

const buttonMeta = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  args: { label: 'Save changes', onClick: fn() },
} satisfies Meta<typeof Button>;
export default buttonMeta;
type Story = StoryObj<typeof buttonMeta>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Disabled: Story = { args: { disabled: true } };

export const CallsHandler: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /save changes/i }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
```

- Use `args` for every dynamic prop so the Controls panel and story composition work; use `fn()` for callbacks.
- Global decorators (ThemeProvider, router) and parameters go in `.storybook/preview.ts`; the `tags: ['autodocs']` entry can also go there to document every component.
- Autodocs needs `@storybook/addon-docs` (installed by `create storybook`; in Storybook 9+ it is a separate addon). Use MDX with `<Meta of={...} />`, `<Canvas>`, `<Controls>` for hand-written pages.

### Test

- **Interaction tests**: `play` functions run in the Interactions panel while you browse and as tests in CI.
- **Vitest addon (recommended)**: `npx storybook add @storybook/addon-vitest` sets up Vitest browser mode with Playwright Chromium and turns every story into a test. Run in the terminal or CI with `npx vitest --project=storybook` (the project name is created by the addon).
- **Accessibility**: `npx storybook add @storybook/addon-a11y`. Control the effect per story with `parameters: { a11y: { test: 'error' | 'todo' | 'off' } }`; it also runs inside the Vitest addon.
- **`@storybook/test-runner`** (Jest + Playwright) is superseded by the Vitest addon and is only kept for Webpack-based Storybooks; do not start new setups on it.
- **Visual regression**: Chromatic (`npx chromatic --project-token=$CHROMATIC_PROJECT_TOKEN`) or the Visual tests addon; keep the token in CI secrets.

## Examples

### Example 1: "Set up Storybook for our React + Vite component library"

Run `npm create storybook@latest` in the repo root, accept the Vitest and a11y options, then write `Button.stories.tsx` as above. `npm run storybook` shows the catalog with an auto-generated Docs page and an Interactions panel for `CallsHandler`.

### Example 2: "Run our stories as tests in CI"

```yaml
# .github/workflows/storybook.yml (steps only)
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npx vitest --project=storybook
```

A story that throws on render, fails an assertion in `play`, or violates an a11y rule set to `error` fails the job.

## Guidelines

- Cover each meaningful state of a component: default, loading, error, disabled, empty.
- Keep stories beside components and give each a clear `title` hierarchy (`Components/Forms/Input`) or let Storybook derive it.
- Import test utilities from `storybook/test` in Storybook 9 and 10; `@storybook/test` and `@storybook/testing-library` are the old v8 packages.
- Upgrade with `npx storybook@latest upgrade`; it runs the automigrations for major bumps.
- Do not call real APIs in stories: mock data and modules (`msw`, module mocks) so tests stay deterministic.
- Storybook is for component-level checks; do not use it in place of end-to-end tests of full user flows.
