---
name: chromatic
description: When the user wants to perform visual regression testing with Storybook integration using Chromatic. Also use when the user mentions "chromatic," "visual regression," "Storybook testing," "UI review," "visual diff," or "component snapshot testing." For general screenshot comparison, see percy.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - visual-testing
    - storybook
    - regression
    - ui-review
---

# Chromatic

## Overview

You are an expert in Chromatic, the visual testing and review platform built by the Storybook team. You help users set up Chromatic for automated visual regression testing, configure it to capture snapshots of every Storybook story, review visual diffs in the Chromatic UI, manage baselines, and integrate Chromatic into CI for pull request checks.

## Instructions

### Initial Assessment

1. **Storybook** — Already using Storybook? Which version?
2. **Components** — How many stories exist? Any interaction tests?
3. **CI** — Which CI provider?
4. **Team** — Who reviews visual changes? (designers, developers)

### Setup

```bash
# setup-chromatic.sh — Install Chromatic and connect to your project.
# Requires a Storybook project and Chromatic project token.

# Install
npm install --save-dev chromatic

# Run first build (get project token from chromatic.com)
npx chromatic --project-token=chpt_xxxxxxxxxxxx
```

### Story-Level Configuration

```typescript
// src/components/Button.stories.tsx — Storybook stories with Chromatic config.
// Controls snapshot behavior per-story and per-component.
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  component: Button,
  parameters: {
    chromatic: {
      viewports: [320, 768, 1200],
      delay: 300,
      diffThreshold: 0.063,
    },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: 'primary', children: 'Click me' },
};

export const Loading: Story = {
  args: { variant: 'primary', loading: true, children: 'Loading...' },
  parameters: {
    chromatic: { delay: 1000 },
  },
};

export const AnimatedEntry: Story = {
  args: { variant: 'primary', children: 'Hello', animate: true },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
};
```

### Interaction Testing with Chromatic

```typescript
// src/components/Dropdown.stories.tsx — Storybook interaction test snapshotted by Chromatic.
// Opens the dropdown before Chromatic takes the screenshot.
import type { Meta, StoryObj } from '@storybook/react';
import { within, userEvent } from '@storybook/testing-library';
import { expect } from '@storybook/jest';
import { Dropdown } from './Dropdown';

const meta: Meta<typeof Dropdown> = {
  component: Dropdown,
};
export default meta;

type Story = StoryObj<typeof Dropdown>;

export const Opened: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Options' });
    await userEvent.click(trigger);
    await expect(canvas.getByRole('menu')).toBeVisible();
  },
};
```

### Configuration

```javascript
// chromatic.config.js — Chromatic configuration for snapshot behavior.
// Controls which stories to snapshot and how.
module.exports = {
  projectToken: process.env.CHROMATIC_PROJECT_TOKEN,
  autoAcceptChanges: 'main',
  exitZeroOnChanges: true,
  exitOnceUploaded: true,
  onlyChanged: true,
  externals: ['public/**'],
  skip: 'dependabot/**',
};
```

### CI Integration

```yaml
# .github/workflows/chromatic.yml — Run Chromatic on every PR.
# Posts visual diff status check back to GitHub.
name: Chromatic
on: push
jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - uses: chromaui/action@latest
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          autoAcceptChanges: main
          onlyChanged: true
```

### Modes (Theme/Locale Testing)

```typescript
// .storybook/modes.ts — Define modes to test stories in different themes and locales.
// Chromatic snapshots each mode separately.
export const allModes = {
  'light desktop': { theme: 'light', viewport: 1200 },
  'dark desktop': { theme: 'dark', viewport: 1200 },
  'light mobile': { theme: 'light', viewport: 375 },
  'dark mobile': { theme: 'dark', viewport: 375 },
};
```
