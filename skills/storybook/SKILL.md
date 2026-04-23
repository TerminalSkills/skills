---
name: storybook
description: "Develop, document, and test UI components in isolation using Storybook with Component Story Format (CSF). Use when writing component stories, setting up visual regression testing with Chromatic, configuring storybook addons, generating component documentation with autodocs or MDX, or adding play functions for interaction testing. Trigger words: storybook, stories, csf, component story format, visual testing, chromatic, storybook addons."
license: Apache-2.0
compatibility: "Supports React, Vue, Svelte, Angular with Vite or Webpack"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["storybook", "component-testing", "ui-development", "documentation", "visual-testing"]
---

# Storybook

## Instructions

### Writing Stories (CSF)

Use Component Story Format with a default export for metadata and named exports for variants:

```tsx
// Button.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  component: Button,
  title: "Components/Forms/Button",
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "ghost"] },
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: "primary", children: "Submit Order", size: "md" },
};

export const Loading: Story = {
  args: { variant: "primary", children: "Saving...", isLoading: true },
};

export const Disabled: Story = {
  args: { variant: "secondary", children: "Unavailable", disabled: true },
};
```

### Interaction Testing with Play Functions

```tsx
// LoginForm.stories.tsx
import { expect, fn, userEvent, within } from "@storybook/test";
import type { Meta, StoryObj } from "@storybook/react";
import { LoginForm } from "./LoginForm";

const meta: Meta<typeof LoginForm> = {
  component: LoginForm,
  args: { onSubmit: fn() },
};
export default meta;

export const FilledForm: StoryObj<typeof LoginForm> = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Email"), "user@example.com");
    await userEvent.type(canvas.getByLabelText("Password"), "s3cure-pass!");
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    await expect(args.onSubmit).toHaveBeenCalledOnce();
  },
};
```

### Global Configuration

```ts
// .storybook/preview.ts
import type { Preview } from "@storybook/react";
import { ThemeProvider } from "../src/theme";

const preview: Preview = {
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
  parameters: {
    layout: "centered",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
};
export default preview;
```

### Documentation with MDX

Use autodocs tag on the meta for automatic docs, or write MDX for custom pages combining prose with live examples using `<Canvas>`, `<Controls>`, and `<ArgTypes>` doc blocks.

### Accessibility Testing

Enable `@storybook/addon-a11y` — it runs axe-core audits on every story. Violations surface in the Accessibility panel per story.

### Visual Regression in CI

1. Install test-runner: `npm install -D @storybook/test-runner`
2. Add script: `"test-storybook": "test-storybook"`
3. Integrate Chromatic for screenshot comparison: `npx chromatic --project-token=$CHROMATIC_TOKEN`
4. Verify: `npx test-storybook --url http://localhost:6006` — confirms all play functions pass and stories render without errors

## Examples

### Example 1: Set up Storybook for a React component library

**User request:** "Set up Storybook for our React component library with all variants"

1. Run `npx storybook@latest init` — auto-detects React + Vite
2. Create story files co-located with components: `Button.stories.tsx`, `Input.stories.tsx`
3. Define args for each variant (primary, loading, disabled, error, empty)
4. Add play functions for interactive components (forms, modals, dropdowns)
5. Verify: `npm run storybook` → browse `http://localhost:6006`, confirm Controls panel toggles all args

### Example 2: Add visual regression testing to CI

**User request:** "Set up visual testing for our Storybook in GitHub Actions"

1. Install: `npm install -D @storybook/test-runner @storybook/addon-a11y`
2. Add Chromatic: `npm install -D chromatic`
3. CI step: `npx chromatic --project-token=$CHROMATIC_TOKEN --exit-zero-on-changes`
4. CI step: `npx test-storybook --url http://localhost:6006`
5. Verify: PR check shows Chromatic diff for any visual changes and test-runner catches broken play functions

## Guidelines

- Write at least one story per component variant: default, loading, error, disabled, empty
- Co-locate stories with components: `Button.tsx` + `Button.stories.tsx`
- Use `args` for all dynamic props — enables Controls panel and story composition via spread
- Set shared decorators (ThemeProvider, RouterProvider) in `.storybook/preview.ts`
- Prefer `@storybook/test` (`fn`, `expect`, `userEvent`, `within`) over raw testing-library imports
- Run `test-storybook` in CI to catch broken interactions before merge
