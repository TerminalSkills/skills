---
name: radix-ui
description: >-
  Build accessible UI primitives with Radix UI. Use when creating accessible
  dropdowns, dialogs, popovers, tabs, tooltips, or building a design system
  with unstyled, composable components.
license: Apache-2.0
compatibility: 'React 16.8+ (React 19 and RSC supported); Node.js 18+ for npm'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/radix-ui/primitives
  tags: [radix-ui, accessibility, components, react, primitives]
---

# Radix UI

## Overview

Radix UI provides unstyled, accessible React primitives — dropdowns, dialogs, popovers, tabs, accordions, and more. Each component handles keyboard navigation, focus management, screen reader support, and ARIA attributes. You add your own styling. Foundation of shadcn/ui. Install the unified `radix-ui` package (recommended, tree-shakeable) or individual `@radix-ui/react-*` packages; keep all Radix packages on matching versions to avoid duplicated dependencies.

## Instructions

### Step 0: Install and import

```bash
npm install radix-ui
```

```tsx
import { Dialog, DropdownMenu, Tabs, Tooltip } from 'radix-ui'   // unified package
// or per primitive: import { Dialog } from 'radix-ui/dialog'
// older style, still supported: import * as Dialog from '@radix-ui/react-dialog'
```

The examples below use `import * as` from the individual packages; with the unified package the same `Dialog.Root`, `Dialog.Trigger` names apply.

### Step 1: Dialog

```tsx
import * as Dialog from '@radix-ui/react-dialog'

function ConfirmDialog({ trigger, title, description, onConfirm }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg p-6 w-[90vw] max-w-md shadow-xl animate-in fade-in zoom-in-95">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="text-sm text-gray-500 mt-2">
            {description}
          </Dialog.Description>
          <div className="flex justify-end gap-2 mt-6">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded border">Cancel</button>
            </Dialog.Close>
            <button onClick={onConfirm} className="px-4 py-2 rounded bg-red-500 text-white">
              Confirm
            </button>
          </div>
          <Dialog.Close asChild>
            <button className="absolute top-4 right-4" aria-label="Close">✕</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

### Step 2: Dropdown Menu

```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

function UserMenu({ user }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-2">
          <img src={user.avatar} className="w-8 h-8 rounded-full" alt="" />
          {user.name}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="bg-white rounded-lg shadow-lg p-1 min-w-[180px]" sideOffset={5}>
          <DropdownMenu.Item className="px-3 py-2 rounded cursor-pointer hover:bg-gray-100">
            Profile
          </DropdownMenu.Item>
          <DropdownMenu.Item className="px-3 py-2 rounded cursor-pointer hover:bg-gray-100">
            Settings
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
          <DropdownMenu.Item className="px-3 py-2 rounded cursor-pointer hover:bg-red-50 text-red-600">
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
```

Every `Dialog.Content` needs a `Dialog.Title` for screen readers. Wrap it in `VisuallyHidden` if the design has no visible title; if you omit `Dialog.Description`, pass `aria-describedby={undefined}` to `Dialog.Content` to silence the warning. Use `Dialog.Close asChild` for buttons that close it.

### Step 3: Tabs

```tsx
import * as Tabs from '@radix-ui/react-tabs'

<Tabs.Root defaultValue="overview">
  <Tabs.List className="flex border-b">
    <Tabs.Trigger value="overview" className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-blue-500">
      Overview
    </Tabs.Trigger>
    <Tabs.Trigger value="analytics" className="px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-blue-500">
      Analytics
    </Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="overview"><OverviewPanel /></Tabs.Content>
  <Tabs.Content value="analytics"><AnalyticsPanel /></Tabs.Content>
</Tabs.Root>
```

### Step 4: Tooltip

```tsx
import * as Tooltip from '@radix-ui/react-tooltip'

<Tooltip.Provider delayDuration={300}>
  <Tooltip.Root>
    <Tooltip.Trigger asChild><button aria-label="Archive">🗄</button></Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content className="rounded bg-gray-900 px-2 py-1 text-xs text-white" sideOffset={4}>
        Archive project
        <Tooltip.Arrow className="fill-gray-900" />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
```

`Tooltip.Provider` is required (put it once near the app root); the default delay is 700 ms.

## Examples

### Example 1: Confirm-delete dialog

Request: "Add a confirmation dialog before deleting an invoice."

Use `ConfirmDialog` from Step 1 with `trigger={<button>Delete invoice</button>}` and `onConfirm={() => deleteInvoice(invoice.id)}`. Result: focus moves into the dialog, Tab stays inside it, Escape closes it and returns focus to the Delete button.

### Example 2: Account menu with keyboard navigation

Request: "Make a user menu in the header that works with the keyboard."

Use `UserMenu` from Step 2 with `onSelect={() => signOut()}` on the Sign out item. Result: Enter or Space opens the menu, arrow keys move between items, typing "S" jumps to Settings, Escape closes it.

## Guidelines

- Radix is unstyled — bring your own CSS/Tailwind. For pre-styled, use shadcn/ui.
- `asChild` merges Radix behavior onto your custom elements (no extra DOM wrappers).
- `data-[state=active]` and `data-[state=open]` for styling based on component state.
- In Next.js App Router, Radix components need `'use client'` in the file that renders interactive parts.
- Use `onSelect` (not `onClick`) on menu items; call `event.preventDefault()` in it to keep the menu open.
- Radix Themes is a separate, pre-styled library (`@radix-ui/themes`), not needed for primitives.
- All components handle keyboard (Escape, Arrow keys, Enter) and screen readers automatically.
