---
name: react-aria
description: >-
  Build accessible UI components with React Aria. Use when creating accessible
  form controls, implementing ARIA patterns, building design systems, or fixing
  accessibility issues.
license: Apache-2.0
compatibility: 'React 16.8+ (React 19 supported); Node.js 18+ for tooling'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags: [react-aria, accessibility, a11y, design-system, components]
  repository: https://github.com/adobe/react-spectrum
---

# React Aria

## Overview

React Aria (Adobe, part of the `react-spectrum` monorepo) provides unstyled, accessible UI primitives for React. It handles keyboard navigation, screen reader announcements, focus management, internationalization and ARIA attributes; you provide the styling. It comes in two layers: `react-aria-components` (ready-made components with render props and data attributes) and `react-aria` (hooks for fully custom markup). Checked against `react-aria-components` 1.22 and `react-aria` 3.53 (October 2026); both accept React 16.8 through 19.

## Instructions

### Step 1: Install

```bash
npm install react-aria-components
# only if you build custom components from hooks:
npm install react-aria
```

Components render with class names like `react-aria-Button`, so you can style them with plain CSS, or pass `className` (a string or a function of the render state).

### Step 2: Accessible components

```tsx
import { Button, Label, ListBox, ListBoxItem, Popover, Select, SelectValue } from 'react-aria-components'

type Role = { id: string; name: string }

export function RoleSelect({ roles, onChange }: { roles: Role[]; onChange: (id: string) => void }) {
  return (
    <Select onSelectionChange={(key) => onChange(String(key))}>
      <Label>Role</Label>
      <Button><SelectValue /><span aria-hidden="true">▼</span></Button>
      <Popover>
        <ListBox items={roles}>
          {(role) => <ListBoxItem>{role.name}</ListBoxItem>}
        </ListBox>
      </Popover>
    </Select>
  )
}
```

Items need an `id` (here taken from the objects; with a static list write `<ListBoxItem id="admin">`). Arrow keys move, Enter selects, Escape closes, typing jumps to a match, and the component renders a hidden native `<select>` so browser autofill and form submission work. If an item's children are not plain text, give it `textValue` so typeahead and announcements still work.

### Step 3: Forms and validation

```tsx
import { Button, FieldError, Form, Input, Label, Text, TextField } from 'react-aria-components'

export function SignIn() {
  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault()
        const data = Object.fromEntries(new FormData(e.currentTarget))
        console.log(data.email)
      }}
    >
      <TextField name="email" type="email" isRequired
        validate={(v) => (v.endsWith('@mailinator.com') ? 'Use a work address' : null)}>
        <Label>Email</Label>
        <Input />
        <Text slot="description">We only use it for receipts.</Text>
        <FieldError />
      </TextField>
      <Button type="submit">Sign in</Button>
    </Form>
  )
}
```

`FieldError` shows the browser or `validate` message and is linked to the input with `aria-describedby`. The components default to `validationBehavior="native"` (the browser blocks an invalid submit, as in a normal form); set `"aria"` to validate live without blocking, which is the default for the bare hooks. Server errors go to `<Form validationErrors={{ email: 'Already registered' }}>`.

### Step 4: Dialogs and focus

Prefer the built-in modal; it traps focus, restores it to the trigger, locks scroll and closes on Escape:

```tsx
import { Button, Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from 'react-aria-components'

<DialogTrigger>
  <Button>Delete project</Button>
  <ModalOverlay isDismissable>
    <Modal>
      <Dialog>
        {({ close }) => (
          <>
            <Heading slot="title">Delete "billing-api"?</Heading>
            <Button onPress={close}>Cancel</Button>
          </>
        )}
      </Dialog>
    </Modal>
  </ModalOverlay>
</DialogTrigger>
```

Use `FocusScope` (from `react-aria`) only for your own overlays: `<FocusScope contain restoreFocus autoFocus>`.

### Step 5: Styling with state

Every component exposes state as data attributes and as render props:

```css
.react-aria-Button[data-pressed] { transform: scale(0.97); }
.react-aria-Button[data-focus-visible] { outline: 2px solid #2563eb; }
.react-aria-ListBoxItem[data-selected] { background: #dbeafe; }
```

```tsx
<Button className={({ isPressed, isFocusVisible }) => (isPressed ? 'btn btn-down' : isFocusVisible ? 'btn btn-ring' : 'btn')}>Save</Button>
```

With Tailwind use the data-attribute variants (`data-[pressed]:scale-95`) or the `tailwindcss-react-aria-components` plugin.

### Step 6: Client-side routing

Links (`Link`, `Tab`, `ListBoxItem` with `href`) render real anchors. Wire your router once at the root so they navigate without a full reload:

```tsx
import { RouterProvider } from 'react-aria-components'
// Next.js app router example
const router = useRouter()
<RouterProvider navigate={router.push}>{children}</RouterProvider>
```

### Step 7: Custom hooks

```tsx
import { useButton } from 'react-aria'
import { useRef } from 'react'

function IconButton(props: Parameters<typeof useButton>[0]) {
  const ref = useRef<HTMLButtonElement>(null)
  const { buttonProps } = useButton(props, ref)
  return <button {...buttonProps} ref={ref}>{props.children}</button>
}
```

Callbacks are `onPress`, not `onClick`: `onPress` unifies mouse, touch, keyboard and screen reader activation. Hooks that need collection state (select, combobox, tabs) pair with `react-stately` hooks such as `useSelectState`.

## Examples

**"Make our dropdown keyboard and screen-reader accessible."** Replace the `<div>` dropdown with Step 2. Result: the trigger announces "Role, collapsed, button", Arrow Down opens the list, Enter selects and focus returns to the button.

**"Add a delete confirmation that traps focus."** Use Step 4. Result: Tab cycles inside the dialog, Escape closes it, focus returns to "Delete project", and the page behind is inert for assistive technology.

## Guidelines

- React Aria is behavior plus accessibility; styling is yours. No CSS is shipped.
- Always give inputs a visible `Label` or an `aria-label`; the library warns in the console when both are missing.
- Use `onPress` and `onPressStart`, not `onClick`, on React Aria components.
- Do not hand-roll `role="dialog"` markup; use `Modal`/`Dialog` or `Popover`.
- Test with a screen reader (VoiceOver, NVDA) and keyboard only; automated checks catch a minority of issues.
- Wrap apps in `I18nProvider` only to force a locale; by default components follow the browser language and RTL direction.
