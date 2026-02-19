---
name: shadcn-ui
description: >-
  Assists with building accessible, customizable React interfaces using shadcn/ui components.
  Use when adding UI components from shadcn CLI, theming with CSS variables, building data tables,
  or integrating forms with React Hook Form and Zod. Trigger words: shadcn, shadcn-ui, radix,
  component library, ui components, tailwind components, cn utility.
license: Apache-2.0
compatibility: "Requires React 18+, Tailwind CSS 3+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["shadcn-ui", "react", "components", "tailwind", "radix-ui"]
---

# shadcn/ui

## Overview

shadcn/ui is a copy-paste component library for React built on Radix UI primitives and styled with Tailwind CSS. Components are added to the project source code via CLI (not as npm dependencies), giving full ownership and customization without library version lock-in.

## Instructions

- When adding components, use the CLI (`npx shadcn@latest add button card dialog`) instead of copying from the website, as the CLI handles dependencies and path configuration.
- When theming, customize CSS variables (`--primary`, `--secondary`, `--background`, etc.) in HSL format for consistent palette generation, and use the `dark:` Tailwind prefix with CSS variable switching for dark mode.
- When merging classes, always use the `cn()` utility (built on `clsx` + `tailwind-merge`) for dynamic class merging instead of manual string concatenation.
- When building forms, use the `Form` component which wraps React Hook Form with Zod validation, along with `FormField`, `FormItem`, `FormLabel`, `FormControl`, and `FormMessage` for consistent accessible layout.
- When building data tables, use the `DataTable` component built on TanStack Table with column definitions, sorting, filtering, pagination, and row selection.
- When composing complex UI, combine primitives: `Sheet` + `Form` for slide-out editors, `Dialog` + `Form` for modals, `Command` + `Popover` for comboboxes.
- When organizing code, keep `components/ui/` for shadcn components only and place custom components in `components/`.

## Examples

### Example 1: Build a settings page with form validation

**User request:** "Create a settings form with shadcn/ui components and Zod validation"

**Actions:**
1. Add required components: `npx shadcn@latest add form input select switch card`
2. Define Zod schema for settings fields (name, email, theme, notifications)
3. Build form using `Form`, `FormField`, `FormItem`, and `FormControl` components
4. Style with Card wrapper and add toast notifications for save feedback

**Output:** An accessible settings form with client-side validation and consistent styling.

### Example 2: Create a searchable data table

**User request:** "Add a data table with sorting, filtering, and pagination"

**Actions:**
1. Add data table components: `npx shadcn@latest add table input dropdown-menu`
2. Define typed column definitions with accessors and cell formatters
3. Implement sorting, column filtering, and pagination controls
4. Add row actions dropdown menu for edit/delete operations

**Output:** A fully interactive data table with TanStack Table powering the logic.

## Guidelines

- Use the CLI to add components; do not copy-paste from the website.
- Keep `components/ui/` for shadcn components only; custom components go in `components/`.
- Use the `cn()` utility for all dynamic class merging; never concatenate Tailwind strings manually.
- Define form schemas with Zod and use the `Form` component for consistent validation UX.
- Customize via CSS variables first, component source second; theme changes should not require editing every component.
- Use the `Command` component for search/command palette patterns; it handles keyboard navigation and filtering.
- Compose complex UI from primitives: `Sheet` + `Form` for slide-out editors, `Dialog` + `Form` for modals.
