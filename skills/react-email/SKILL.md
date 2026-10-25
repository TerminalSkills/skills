---
name: react-email
description: >-
  React Email is an open-source library for building HTML emails from React
  components, with a live preview server and a render function that outputs
  email-safe HTML and plain text. Use when asked to "build an email template
  with React", "set up React Email", "render a React component to email HTML",
  "preview emails locally", or "style emails with Tailwind". Covers react-email
  6.x, the single-package imports, Tailwind, rendering and sending through any
  provider (Resend, SendGrid, Postmark, AWS SES).
license: Apache-2.0
compatibility: Node.js 20.19+, React 18 or 19, TypeScript recommended
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/resend/react-email
  tags: "email, react, components, templates, html"
---

# React Email

## Overview

React Email turns React components into HTML that renders in Gmail, Outlook and Apple Mail. Layout components (`Row`, `Column`, `Section`) compile to tables, `Tailwind` inlines styles, and `render()` returns an HTML string or a plain-text version. It is provider-agnostic: you render, then hand the string to any sender.

Since react-email 6 (checked against 6.11.3, October 2026) everything is imported from the single `react-email` package. `@react-email/components` is deprecated on npm; migrate by removing it and importing from `react-email`. `@react-email/render` is still published, but `render` is re-exported from `react-email`.

## Instructions

### 1. Install

```bash
npm install react-email react react-dom
npm install -D typescript @types/react
```

Or scaffold a project with example templates: `npx create-email`. The CLI binary is `email` (also `react-email`).

### 2. Write a template

Put templates in `emails/`; each default-exports a component. Add `PreviewProps` so the preview server has sample data.

```tsx
// emails/welcome.tsx
import {
  Html, Head, Body, Container, Section, Heading, Text, Button, Hr,
  Preview, Tailwind, pixelBasedPreset,
} from "react-email";

interface WelcomeProps {
  name: string;
  teamName: string;
  inviteUrl: string;
}

export default function Welcome({ name, teamName, inviteUrl }: WelcomeProps) {
  return (
    <Html>
      <Head />
      <Preview>You have been invited to {teamName}</Preview>
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Body className="bg-gray-50 font-sans">
          <Container className="mx-auto max-w-[600px] p-8">
            <Section className="bg-white p-8">
              <Heading className="text-2xl font-bold text-gray-900">
                Welcome, {name}
              </Heading>
              <Text className="text-base text-gray-600">
                You have been invited to join {teamName}.
              </Text>
              <Button href={inviteUrl} className="bg-blue-600 px-6 py-3 text-white">
                Accept invitation
              </Button>
              <Hr className="my-6 border-gray-200" />
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

Welcome.PreviewProps = {
  name: "Alice Chen",
  teamName: "Northwind Engineering",
  inviteUrl: "https://app.northwind.dev/invite/8f3k2",
} satisfies WelcomeProps;
```

`pixelBasedPreset` makes Tailwind emit `px` instead of `rem`, which Outlook and some other clients handle badly.

### 3. Preview

```bash
npx email dev                  # http://localhost:3000, hot reload
npx email dev -d src/emails -p 3030
```

Options: `-d/--dir` template folder (default `./emails`), `-p/--port` (default 3000), `-c/--clients` clients to show compatibility warnings for.

### 4. Render and send

`render` is async and returns a Promise in current versions.

```tsx
// scripts/send-welcome.tsx (run as an ES module, for example with "type": "module" in package.json, because of the top-level await)
import { render } from "react-email";
import Welcome from "../emails/welcome";

const element = <Welcome {...Welcome.PreviewProps} />;
const html = await render(element);
const text = await render(element, { plainText: true });
// pass html and text to your provider's send call
```

Static export of every template: `npx email export --outDir out` (flags: `-p/--pretty`, `-t/--plainText`, `-e/--extension`). Use `-e blade.php` style extensions for non-JS backends.

## Examples

### Example 1: "Send the invite through Resend"

```tsx
import { Resend } from "resend";
import { render } from "react-email";
import Welcome from "./emails/welcome";

const resend = new Resend(process.env.RESEND_API_KEY);
const element = <Welcome name="Alice Chen" teamName="Northwind Engineering"
  inviteUrl="https://app.northwind.dev/invite/8f3k2" />;

await resend.emails.send({
  from: "Northwind <team@mail.northwind.dev>",
  to: "alice.chen@northwind.dev",
  subject: "Join Northwind Engineering",
  html: await render(element),
  text: await render(element, { plainText: true }),
});
```

Result: Resend returns a message id; the inbox shows the preview line from `<Preview>`.

### Example 2: "Generate plain HTML files for our Laravel app"

```bash
npx email export --outDir resources/views/emails -e blade.php -p
```

Result: `resources/views/emails/welcome.blade.php` containing the rendered, pretty-printed HTML, built from `emails/welcome.tsx`.

## Guidelines

- Import from `react-email`, not `@react-email/components` (deprecated). Keep `react` and `react-dom` installed; they are peer dependencies.
- Always `await render(...)`; treating it as synchronous gives you a Promise, not HTML.
- Always send a plain-text part alongside the HTML.
- Use absolute `https://` URLs for images and links; relative paths do not work in an inbox. Host images yourself.
- Email clients ignore much modern CSS (flex, grid, many selectors). Stick to the components and Tailwind utilities that compile to inline styles, and check the preview's compatibility warnings.
- Web fonts via `Font` only work in some clients; always give a fallback family.
- Never put secrets in templates; props are rendered into the HTML.
- Use sample data in `PreviewProps`, never real customers' data.
