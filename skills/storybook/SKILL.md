---
name: storybook
description: >-
  Assists with developing, documenting, and testing UI components in isolation using Storybook.
  Use when writing component stories, setting up visual regression testing, configuring addons,
  or generating component documentation. Trigger words: storybook, stories, csf, component
  story format, visual testing, chromatic, storybook addons.
license: Apache-2.0
compatibility: "Supports React, Vue, Svelte, Angular with Vite or Webpack"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["storybook", "component-testing", "ui-development", "documentation", "visual-testing"]
---

# Storybook

## Overview

Storybook is a UI component workshop for developing, documenting, and testing components in isolation. It supports React, Vue, Svelte, and Angular with Component Story Format (CSF), interactive controls, accessibility auditing, and visual regression testing through Chromatic integration.

## Instructions

- When writing stories, use Component Story Format (CSF) with a default export for component metadata and named exports for each variant (Primary, Secondary, Loading, Error, Disabled).
- When making stories interactive, use `args` for all dynamic props to enable the Controls panel, and add `play` functions with `@storybook/test` for automated interaction testing.
- When adding documentation, use autodocs tag for automatic generation from stories, or MDX files for combining prose with live component examples using doc blocks like `<Canvas>`, `<Controls>`, and `<ArgTypes>`.
- When testing accessibility, enable `@storybook/addon-a11y` which runs axe-core audits on every story automatically.
- When setting up visual regression, integrate Chromatic or Percy for screenshot comparison across PRs, and run `@storybook/test-runner` in CI to execute all play functions.
- When configuring globally, set shared decorators (ThemeProvider, RouterProvider) and parameters in `.storybook/preview.ts` to apply to all stories.
- When organizing, use sidebar hierarchy with `title: "Components/Forms/Input"` and keep stories co-located with components (`Button.tsx` + `Button.stories.tsx`).

## Examples

### Example 1: Build a component library with stories

**User request:** "Set up Storybook for our React component library with all variants"

**Actions:**
1. Initialize Storybook with `npx storybook@latest init` for the React Vite framework
2. Write stories for each component with args for variant, size, disabled, and loading states
3. Add play functions for interactive components (buttons, forms, modals)
4. Configure autodocs for automatic documentation generation

**Output:** A browsable component catalog with interactive controls and auto-generated docs.

### Example 2: Add visual regression testing to CI

**User request:** "Set up visual testing for our Storybook components in CI"

**Actions:**
1. Install `@storybook/test-runner` and configure CI pipeline
2. Add `@storybook/addon-a11y` for accessibility checks
3. Integrate Chromatic for visual regression screenshots on each PR
4. Configure the test-runner to execute all play functions in headless Playwright

**Output:** A CI pipeline that catches visual regressions, accessibility issues, and broken interactions.

## Guidelines

- Write at least one story per component variant: default, loading, error, disabled, and empty states.
- Use `args` for all dynamic props to enable the Controls panel and story composition.
- Keep stories next to components: `Button.tsx` + `Button.stories.tsx` in the same directory.
- Add play functions for interactive components: buttons, forms, modals, and dropdowns.
- Use decorators for shared context (ThemeProvider, RouterProvider) at the preview level.
- Document design decisions in MDX: when to use each variant, dos and don'ts.
- Run `storybook test-runner` in CI to catch broken interactions before merge.
