---
name: mantine
description: >-
  Build React applications with the Mantine UI component library. Use when a user asks to use Mantine components, configure themes, implement forms with validation, add notifications, or build responsive layouts with Mantine hooks.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["react", "ui-library", "components", "hooks", "typescript"]
---
# Mantine — Full-Featured React Component Library

## Overview

You are an expert in Mantine, the React component library with 100+ customizable components, 50+ hooks, and a CSS-in-JS styling solution. You help developers build polished UIs with form handling, notifications, modals, rich text editing, date pickers, and responsive layouts — all with excellent TypeScript support and accessibility.

## Instructions

### Setup

```bash
npm install @mantine/core @mantine/hooks @mantine/form @mantine/notifications
npm install @mantine/dates dayjs          # Date components
npm install @mantine/tiptap @tiptap/react # Rich text editor
```

### Theme and Provider

```tsx
// src/App.tsx — Mantine theme configuration
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

const theme = createTheme({
  primaryColor: "indigo",
  fontFamily: "Inter, system-ui, sans-serif",
  defaultRadius: "md",
  colors: {
    brand: ["#f0f0ff", "#d6d6ff", "#b3b3ff", "#8080ff", "#4d4dff", "#1a1aff", "#0000e6", "#0000b3", "#000080", "#00004d"],
  },
  components: {
    Button: { defaultProps: { variant: "filled" } },
    TextInput: { defaultProps: { size: "md" } },
  },
});

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-right" />
      <Router />
    </MantineProvider>
  );
}
```

### Components

```tsx
// Dashboard layout with Mantine components
import {
  AppShell, Navbar, Header, Group, Text, Badge, Card,
  SimpleGrid, Stack, Button, ActionIcon, Menu, Avatar,
  Progress, Table, Tabs, Tooltip, ThemeIcon,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconBell, IconSettings, IconLogout } from "@tabler/icons-react";

function Dashboard() {
  const [navOpen, { toggle }] = useDisclosure(true);

  return (
    <AppShell
      navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !navOpen } }}
      header={{ height: 60 }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text size="xl" fw={700}>Dashboard</Text>
          <Group>
            <ActionIcon variant="subtle" size="lg">
              <IconBell size={20} />
            </ActionIcon>
            <Menu>
              <Menu.Target>
                <Avatar src={null} alt="User" radius="xl" size="md" />
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconSettings size={14} />}>Settings</Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconLogout size={14} />}>Logout</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          <StatsCard title="Revenue" value="$45,200" change="+12%" />
          <StatsCard title="Users" value="1,234" change="+5%" />
          <StatsCard title="Orders" value="892" change="+18%" />
          <StatsCard title="Churn" value="2.1%" change="-0.3%" positive />
        </SimpleGrid>
      </AppShell.Main>
    </AppShell>
  );
}
```

### Form Handling

```tsx
// Mantine form with validation
import { useForm } from "@mantine/form";
import { TextInput, PasswordInput, Select, Checkbox, Button, Stack } from "@mantine/core";

function SignupForm() {
  const form = useForm({
    initialValues: { name: "", email: "", password: "", role: "", terms: false },
    validate: {
      name: (v) => (v.length < 2 ? "Name too short" : null),
      email: (v) => (/^\S+@\S+$/.test(v) ? null : "Invalid email"),
      password: (v) => (v.length < 8 ? "At least 8 characters" : null),
      role: (v) => (v ? null : "Select a role"),
      terms: (v) => (v ? null : "You must accept terms"),
    },
  });

  return (
    <form onSubmit={form.onSubmit((values) => console.log(values))}>
      <Stack gap="sm">
        <TextInput label="Name" placeholder="Your name" {...form.getInputProps("name")} />
        <TextInput label="Email" placeholder="you@example.com" {...form.getInputProps("email")} />
        <PasswordInput label="Password" {...form.getInputProps("password")} />
        <Select
          label="Role"
          data={["Developer", "Designer", "Product Manager", "Other"]}
          {...form.getInputProps("role")}
        />
        <Checkbox label="I accept terms" {...form.getInputProps("terms", { type: "checkbox" })} />
        <Button type="submit">Create Account</Button>
      </Stack>
    </form>
  );
}
```

### Hooks

```tsx
// Mantine provides 50+ utility hooks
import {
  useDisclosure, useToggle, useDebouncedValue, useLocalStorage,
  useClipboard, useMediaQuery, useHotkeys, useIdle, useNetwork,
  useDocumentTitle, useIntersection, useScrollIntoView,
} from "@mantine/hooks";

// Debounced search
const [search, setSearch] = useState("");
const [debounced] = useDebouncedValue(search, 300);

// Clipboard
const clipboard = useClipboard({ timeout: 2000 });
clipboard.copy("Hello!"); // clipboard.copied is true for 2 seconds

// Responsive
const isMobile = useMediaQuery("(max-width: 768px)");

// Keyboard shortcuts
useHotkeys([
  ["mod+K", () => openSearch()],
  ["mod+S", () => saveDocument()],
]);

// Local storage with type safety
const [colorScheme, setColorScheme] = useLocalStorage<"light" | "dark">({
  key: "color-scheme",
  defaultValue: "light",
});
```

## Examples

**Example 1: User asks to set up mantine**

User: "Help me set up mantine for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure mantine
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with mantine**

User: "Create a dashboard using mantine"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Use the form library** — `@mantine/form` handles validation, touched state, and nested fields; don't build your own
2. **Theme over inline styles** — Configure component defaults in the theme; avoid prop-based styling on every instance
3. **Hooks for logic** — Mantine's hooks library (`useDisclosure`, `useDebouncedValue`, `useLocalStorage`) reduces boilerplate
4. **AppShell for layouts** — Use `AppShell` for dashboard layouts with navbar, header, aside; handles responsive collapsing
5. **Notifications system** — Use `@mantine/notifications` for toast messages; supports queue, auto-close, and custom components
6. **CSS modules** — Mantine v7 uses CSS modules by default; import component styles and extend with your own
7. **Dark mode built-in** — Use `defaultColorScheme="auto"` for system preference detection; all components adapt
8. **Tabler icons** — Use `@tabler/icons-react` (free, MIT) — Mantine is designed to work with Tabler's icon set
