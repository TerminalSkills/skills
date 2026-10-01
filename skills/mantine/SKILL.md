---
name: mantine
description: >-
  Build React applications with the Mantine UI component library. Use when a user asks to use Mantine components, configure themes, implement forms with validation, add notifications, or build responsive layouts with Mantine hooks.
license: Apache-2.0
compatibility: "React 19.2+ (Mantine 9); a bundler with PostCSS such as Vite or Next.js"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["react", "ui-library", "components", "hooks", "typescript"]
  repository: https://github.com/mantinedev/mantine
---
# Mantine — Full-Featured React Component Library

## Overview

Mantine is a React component library with 120+ customizable components and 70+ hooks, plus packages for forms, notifications, dates, charts and rich text editing, all written in TypeScript. Since version 7 it ships plain CSS files instead of CSS-in-JS: styles are imported once and customized through the theme, CSS variables and CSS modules. This skill targets Mantine 9 (released March 2026), which requires React 19.2 or later; Example 2 and the Guidelines cover what changed since 7 and 8.

## Instructions

### Setup

```bash
npm install @mantine/core @mantine/hooks @mantine/form @mantine/notifications
npm install @mantine/dates dayjs          # Date components
npm install @mantine/tiptap @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-link  # Rich text editor
npm install --save-dev postcss postcss-preset-mantine postcss-simple-vars
```

The PostCSS preset adds `rem()`, `light-dark()`, `@mixin hover` and the breakpoint variables to your own CSS files. Create `postcss.config.cjs` in the project root:

```js
module.exports = {
  plugins: {
    "postcss-preset-mantine": {},
    "postcss-simple-vars": {
      variables: {
        "mantine-breakpoint-xs": "36em",
        "mantine-breakpoint-sm": "48em",
        "mantine-breakpoint-md": "62em",
        "mantine-breakpoint-lg": "75em",
        "mantine-breakpoint-xl": "88em",
      },
    },
  },
};
```

### Theme and Provider

```tsx
// src/App.tsx — styles, theme and providers, set up once at the root
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css"; // package styles go after core styles

import { Button, MantineProvider, TextInput, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { Dashboard } from "./Dashboard";

const theme = createTheme({
  primaryColor: "brand",
  fontFamily: "Inter, system-ui, sans-serif",
  colors: {
    // a custom color needs at least 10 shades, lightest first
    brand: ["#f0f0ff", "#d6d6ff", "#b3b3ff", "#8080ff", "#4d4dff", "#1a1aff", "#0000e6", "#0000b3", "#000080", "#00004d"],
  },
  components: {
    Button: Button.extend({ defaultProps: { variant: "light" } }),
    TextInput: TextInput.extend({ defaultProps: { size: "md" } }),
  },
});

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-right" />
      <Dashboard />
    </MantineProvider>
  );
}
```

### Components

```tsx
// src/Dashboard.tsx — responsive shell: header, collapsible navbar, stat cards
import { AppShell, Avatar, Badge, Burger, Card, Group, Menu, NavLink, SimpleGrid, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { GearIcon, SignOutIcon } from "@phosphor-icons/react";

const stats = [
  { title: "Revenue", value: "$45,200", change: "+12%" },
  { title: "Users", value: "1,234", change: "+5%" },
  { title: "Orders", value: "892", change: "+18%" },
  { title: "Churn", value: "2.1%", change: "-0.3%" },
];

export function Dashboard() {
  const [opened, { toggle }] = useDisclosure();

  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
            <Text size="xl" fw={700}>Dashboard</Text>
          </Group>
          <Menu>
            <Menu.Target>
              <Avatar name="Dana Whitfield" color="initials" radius="xl" style={{ cursor: "pointer" }} />
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<GearIcon size={14} />}>Settings</Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<SignOutIcon size={14} />}>Log out</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <NavLink label="Overview" active />
        <NavLink label="Orders" />
        <NavLink label="Customers" />
      </AppShell.Navbar>

      <AppShell.Main>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {stats.map((stat) => (
            <Card key={stat.title} withBorder>
              <Text size="sm" c="dimmed">{stat.title}</Text>
              <Group justify="space-between" mt="xs">
                <Text size="xl" fw={700}>{stat.value}</Text>
                <Badge color={stat.title === "Churn" || stat.change.startsWith("+") ? "teal" : "red"}>{stat.change}</Badge>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      </AppShell.Main>
    </AppShell>
  );
}
```

### Form Handling

```tsx
// src/SignupForm.tsx — uncontrolled form with validation
import { Button, Checkbox, PasswordInput, Select, Stack, TextInput } from "@mantine/core";
import { hasLength, isEmail, isNotEmpty, useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

export function SignupForm() {
  const form = useForm({
    mode: "uncontrolled",
    initialValues: { name: "", email: "", password: "", role: "", terms: false },
    validate: {
      name: hasLength({ min: 2 }, "Name too short"),
      email: isEmail("Invalid email"),
      password: hasLength({ min: 8 }, "At least 8 characters"),
      role: isNotEmpty("Select a role"),
      terms: (value) => (value ? null : "You must accept the terms"),
    },
  });

  const handleSubmit = form.onSubmit((values) => {
    notifications.show({ title: "Account created", message: `Welcome, ${values.name}`, color: "teal" });
  });

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="sm">
        <TextInput label="Name" key={form.key("name")} {...form.getInputProps("name")} />
        <TextInput label="Email" placeholder="dana@northwind.io" key={form.key("email")} {...form.getInputProps("email")} />
        <PasswordInput label="Password" key={form.key("password")} {...form.getInputProps("password")} />
        <Select label="Role" data={["Developer", "Designer", "Product Manager"]} key={form.key("role")} {...form.getInputProps("role")} />
        <Checkbox label="I accept the terms" key={form.key("terms")} {...form.getInputProps("terms", { type: "checkbox" })} />
        <Button type="submit">Create account</Button>
      </Stack>
    </form>
  );
}
```

### Hooks

```tsx
// src/SearchBox.tsx — a few of the 70+ hooks in @mantine/hooks
import { useRef, useState } from "react";
import { Button, Group, TextInput } from "@mantine/core";
import { getHotkeyHandler, useClipboard, useDebouncedValue, useDidUpdate, useHotkeys, useLocalStorage, useMediaQuery } from "@mantine/hooks";

export function SearchBox({ onSearch }: { onSearch: (query: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300); // updates 300 ms after typing stops
  const clipboard = useClipboard({ timeout: 2000 }); // clipboard.copied stays true for 2 s
  const isMobile = useMediaQuery("(max-width: 48em)"); // false on the server and until the first effect runs

  // without defaultValue the value is typed `string[] | undefined`
  const [recent, setRecent] = useLocalStorage<string[]>({ key: "recent-searches", defaultValue: [] });

  // document-level shortcut; ignored while focus is in an input, textarea or select
  useHotkeys([["mod+K", () => input.current?.focus()]]);

  useDidUpdate(() => onSearch(debounced), [debounced]); // search as you type; skips the first render

  const submit = () => {
    onSearch(search); // not `debounced`: for 300 ms after the last key it still holds the old text
    setRecent([search, ...recent].slice(0, 5));
  };

  return (
    <Group>
      <TextInput
        ref={input}
        placeholder={recent[0] ?? "Search orders"}
        size={isMobile ? "md" : "sm"}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        onKeyDown={getHotkeyHandler([["Enter", submit]])} // shortcuts inside an input
      />
      <Button onClick={() => clipboard.copy(search)}>{clipboard.copied ? "Copied" : "Copy query"}</Button>
    </Group>
  );
}
```

## Examples

### Example 1: Add Mantine and a dark-mode toggle to a Vite app

User: "Add Mantine to my Vite + React + TypeScript app and give me a dark mode switch in the header."

```bash
npm install @mantine/core @mantine/hooks @phosphor-icons/react
npm install --save-dev postcss postcss-preset-mantine postcss-simple-vars
```

Add `postcss.config.cjs` from Setup, import `@mantine/core/styles.css` in the root file, wrap the app in `MantineProvider` with `defaultColorScheme="auto"`, then:

```tsx
// src/ColorSchemeToggle.tsx
import { ActionIcon, useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";

export function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  // "auto" can mean either; the computed value is always "light" or "dark"
  const computed = useComputedColorScheme("light", { getInitialValueInEffect: true });

  return (
    <ActionIcon variant="default" size="lg" aria-label="Toggle color scheme" onClick={() => setColorScheme(computed === "light" ? "dark" : "light")}>
      {computed === "light" ? <MoonIcon size={18} /> : <SunIcon size={18} />}
    </ActionIcon>
  );
}
```

Result: the app follows the operating system's scheme until the button is clicked; the choice is then kept in `localStorage` and `<html>` carries `data-mantine-color-scheme="dark"` or `"light"`.

### Example 2: Upgrade a Mantine 7 project to 9

User: "We're still on Mantine 7 and React 18. Move us to the current version."

```bash
npm install react@^19.2.0 react-dom@^19.2.0 @types/react@^19 @types/react-dom@^19
npm install @mantine/core@9 @mantine/hooks@9 @mantine/form@9 @mantine/dates@9 @mantine/notifications@9
npx tsc --noEmit   # Vite template (tsconfig with project references): npx tsc -b
```

Update `@tiptap/*` to 3.x and `recharts` to 3.x if `@mantine/tiptap` or `@mantine/charts` are installed. The compiler lists most of what broke, for example:

```
error TS2305: Module '"@mantine/core"' has no exported member 'TypographyStylesProvider'.
error TS2322: Type '{ in: boolean; children: Element; }' is not assignable to type '… CollapseProps …'.
  Property 'in' does not exist on type '… CollapseProps …'.
error TS2322: Type 'Dispatch<SetStateAction<[Date | null, Date | null]>>' is not assignable to type '(value: DatesRangeValue<string>) => void'.
```

Fixes: `TypographyStylesProvider` → `Typography`; `<Collapse in>` → `expanded`; `<Grid gutter>` → `gap`; `<Spoiler initialState>` → `defaultExpanded`; `useFullscreen` → `useFullscreenDocument` or `useFullscreenElement`; `useHeadroom()` returns `{ pinned, scrollProgress }`; `zodResolver(schema)` → `schemaResolver(schema, { sync: true })` from `@mantine/form`; `@mantine/dates` values are strings such as `"2026-10-01"` since 8.0, so `useState<Date | null>` becomes `useState<string | null>`. `<Text color="red">` still compiles but no longer sets the color — search for it and use `c="red"`.

## Guidelines

1. **Use the form library** — `@mantine/form` handles validation, touched state, and nested fields; don't build your own. Prefer `mode: "uncontrolled"` with `key={form.key(...)}` on every input and read values with `form.getValues()`; in this mode `form.values` does not update while typing
2. **Theme over inline styles** — Configure component defaults in the theme with `Component.extend`; avoid prop-based styling on every instance
3. **Hooks for logic** — Mantine's hooks library (`useDisclosure`, `useDebouncedValue`, `useLocalStorage`) reduces boilerplate
4. **AppShell for layouts** — Use `AppShell` for dashboard layouts with navbar, header, aside; `Navbar` and `Header` exist only as `AppShell.Navbar` and `AppShell.Header`, each enabled by its config prop
5. **Notifications system** — Render `<Notifications />` exactly once inside `MantineProvider` and call `notifications.show()` from anywhere; supports queue, auto-close, and custom components
6. **CSS modules, not CSS-in-JS** — Import the `styles.css` of every package you use (`@mantine/core/styles.css` first, then for example `@mantine/dates/styles.css`); missing imports are the usual cause of unstyled date pickers and notifications. `createStyles` and the `sx` prop left `@mantine/core` in 7.0 and live on only in the optional `@mantine/emotion` package
7. **Dark mode built-in** — Use `defaultColorScheme="auto"` for system preference detection. With server rendering add `<ColorSchemeScript />` to `<head>` and spread `mantineHtmlProps` on `<html>` to avoid a flash and a hydration warning
8. **Icons** — Any icon library works. The docs and demos use `@phosphor-icons/react`; `@tabler/icons-react` remains a common choice
9. **Version 9 look changes** — The default radius is now `md` and the `light` variant uses solid colors; set `defaultRadius: "sm"` or pass `cssVariablesResolver={v8CssVariablesResolver}` to keep the 8.x look while migrating
10. **When not to use** — Mantine components are client components: they render on the server but cannot be React server components, and a file that uses hooks or compound components such as `Tabs.Tab` needs `'use client'`. Astro is not supported, and a project that cannot move to React 19.2 has to stay on Mantine 8
