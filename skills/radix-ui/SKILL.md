---
name: radix-ui
description: >-
  Build accessible UI primitives with Radix UI. Use when creating accessible
  dropdowns, dialogs, popovers, tabs, tooltips, or building a design system
  with unstyled, composable components.
license: Apache-2.0
compatibility: 'React 18+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags: [radix-ui, accessibility, components, react, primitives]
---

# Radix UI

## Overview

Radix UI provides unstyled, accessible React primitives — dropdowns, dialogs, popovers, tabs, accordions, and more. Each component handles keyboard navigation, focus management, screen reader support, and ARIA attributes. You add your own styling. Foundation of shadcn/ui.

## Instructions

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

## Guidelines

- Radix is unstyled — bring your own CSS/Tailwind. For pre-styled, use shadcn/ui.
- `asChild` merges Radix behavior onto your custom elements (no extra DOM wrappers).
- `data-[state=active]` and `data-[state=open]` for styling based on component state.
- Install individual packages: `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`.
- All components handle keyboard (Escape, Arrow keys, Enter) and screen readers automatically.
