---
name: react-aria
description: >-
  Build accessible UI components with React Aria. Use when creating accessible
  form controls, implementing ARIA patterns, building design systems, or fixing
  accessibility issues.
license: Apache-2.0
compatibility: 'React 18+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frontend
  tags: [react-aria, accessibility, a11y, design-system, components]
---

# React Aria

## Overview

React Aria (Adobe) provides accessible UI primitives for React. Handles keyboard navigation, screen reader announcements, focus management, and ARIA attributes — you provide styling.

## Instructions

### Step 1: Accessible Components

```tsx
import { Button, Label, ListBox, ListBoxItem, Popover, Select, SelectValue } from 'react-aria-components'

export function SelectField({ label, items, onSelectionChange }) {
  return (
    <Select onSelectionChange={onSelectionChange}>
      <Label>{label}</Label>
      <Button><SelectValue /><span aria-hidden="true">▼</span></Button>
      <Popover>
        <ListBox>
          {items.map(item => (
            <ListBoxItem key={item.id} id={item.id}>{item.name}</ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  )
}
// Arrow keys navigate, Enter selects, Escape closes
// Screen reader: announces value, role, option count
```

### Step 2: Focus Management

```tsx
import { FocusScope } from 'react-aria'

function ModalDialog({ children, onClose }) {
  return (
    <FocusScope contain restoreFocus autoFocus>
      <div role="dialog" aria-modal="true">
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    </FocusScope>
  )
}
```

### Step 3: Custom Hooks

```tsx
import { useButton } from 'react-aria'
import { useRef } from 'react'

function CustomButton(props) {
  const ref = useRef(null)
  const { buttonProps } = useButton(props, ref)
  return <button {...buttonProps} ref={ref}>{props.children}</button>
}
```

## Guidelines

- React Aria = behavior + accessibility. You control styling (Tailwind, CSS-in-JS).
- `react-aria-components`: pre-built accessible components with render props.
- Individual hooks (`useButton`, `useTextField`) for fully custom designs.
- FocusScope traps focus in modals — required for WCAG 2.1.
- Test with VoiceOver (Mac), NVDA (Windows), keyboard-only.
