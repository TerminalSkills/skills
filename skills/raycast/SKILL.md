---
name: raycast
description: Raycast is a keyboard-driven launcher for macOS and Windows that you extend with React and TypeScript commands. Use this skill to build Raycast extensions - list, detail and form views, menu bar commands, preferences, caching - with @raycast/api and @raycast/utils, test them with `npm run dev`, and submit them to the Raycast Store.
license: Apache-2.0
compatibility: Raycast app (macOS or Windows), Node.js 22 or newer, npm
metadata:
  author: terminal-skills
  repository: https://github.com/raycast/extensions
  version: 1.1.0
  category: development
  tags: "launcher, productivity, macos, extensions, react"
---

# Raycast — Launcher Extension Development

## Overview

A Raycast extension is a Node.js project of React components that Raycast renders natively (no DOM, no CSS). Each command in `package.json` maps to a file in `src/`. The API package is `@raycast/api` (2.x today, which requires Node 22 or newer) and the helper hooks live in `@raycast/utils` (`useFetch`, `useCachedPromise`, `useForm`, `showFailureToast`). Extensions run on macOS and Windows; declare which in the manifest `platforms` field. The public store lives in the `raycast/extensions` repository.

## Instructions

### Create and run an extension

Scaffold with the **Create Extension** command inside Raycast (pick a template such as Detail or List), then:

```bash
cd ~/Developer/github-tools
npm install
npm run dev        # ray develop: hot reload, extension appears in root search
npm run build      # ray build -e dist: validates a production build
npm run lint       # ray lint: ESLint over src/
npm run publish    # verifies, builds and opens a pull request to raycast/extensions
npx ray migrate    # upgrade to the latest @raycast/api after a major release
```

`npm run dev` runs until you press Ctrl+C; the extension stays installed afterwards. Run `npm run build` before every submission.

### Manifest

`package.json` is the manifest. Required extension fields: `name`, `title`, `description`, `icon` (512x512 PNG; add `icon@dark.png` for dark mode), `author` (your Raycast Store handle), `platforms`, `categories`. Required command fields: `name` (matches `src/<name>.tsx`), `title`, `description`, `mode`.

```json
{
  "name": "github-tools",
  "title": "GitHub Tools",
  "description": "Search repositories, file issues and watch notifications",
  "icon": "github-icon.png",
  "author": "mira_kowalski",
  "platforms": ["macOS", "Windows"],
  "categories": ["Developer Tools"],
  "license": "MIT",
  "commands": [
    { "name": "search-projects", "title": "Search Projects", "description": "Search and open your repositories", "mode": "view" },
    { "name": "create-issue", "title": "Create Issue", "description": "Create a GitHub issue", "mode": "view" },
    { "name": "menu-bar", "title": "GitHub Notifications", "description": "Unread notifications in the menu bar", "mode": "menu-bar", "interval": "5m" }
  ],
  "preferences": [
    { "name": "githubToken", "title": "GitHub Token", "description": "Personal access token with repo scope", "type": "password", "required": true }
  ]
}
```

Command `mode` is `view`, `no-view` or `menu-bar`. `interval` (minimum `1m`, units s/m/h/d) only works for `no-view` and `menu-bar` commands. Preference types: `textfield`, `password`, `checkbox`, `dropdown`, `appPicker`, `file`, `directory`. Categories are Title Case and case sensitive (for example Developer Tools, Productivity, Web, Other).

### Lists, details, forms

A `List` takes `List.Item` children, each with an `ActionPanel`; the first action runs on Enter. `useFetch` handles loading state, caching and revalidation. `mapResult` receives the parsed response and must return `{ data }`.

### Cache and LocalStorage

`Cache` stores strings only: `new Cache({ namespace, capacity })`, then `get`, `set(key, string)`, `has`, `remove`, `clear`. It has no TTL option (it evicts least-recently-used entries past `capacity`, default 10 MB), so store a timestamp if you need expiry. `LocalStorage` is async and keeps user data across runs.

## Examples

### Example 1: "Search my GitHub repos from Raycast"

```tsx
// src/search-projects.tsx
import { List, Action, ActionPanel, Icon, Color, getPreferenceValues } from "@raycast/api";
import { useFetch } from "@raycast/utils";

interface Repo { id: number; name: string; html_url: string; language: string | null; stargazers_count: number; pushed_at: string }

export default function SearchProjects() {
  const { githubToken } = getPreferenceValues<Preferences>();
  const { data, isLoading } = useFetch("https://api.github.com/user/repos?sort=pushed&per_page=50", {
    headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
    mapResult: (repos: Repo[]) => ({ data: repos }),
    keepPreviousData: true,
    initialData: [] as Repo[],
  });

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search your repos...">
      {data.map((repo) => (
        <List.Item
          key={repo.id}
          title={repo.name}
          subtitle={repo.language ?? ""}
          icon={{ source: Icon.Code, tintColor: Color.Blue }}
          accessories={[{ text: `${repo.stargazers_count} stars` }, { date: new Date(repo.pushed_at), tooltip: "Last push" }]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser url={repo.html_url} title="Open on GitHub" />
              <Action.CopyToClipboard content={`git clone ${repo.html_url}.git`} title="Copy Clone Command" />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
```

`Preferences` is a global type that `npm run dev` generates in `raycast-env.d.ts` from the manifest. In Raycast, "Search Projects" lists the 50 most recently pushed repos; typing filters them, Enter opens the repo.

### Example 2: "Add a form that files an issue and a menu bar counter"

```tsx
// src/create-issue.tsx
import { Form, Action, ActionPanel, showToast, Toast, popToRoot, open, getPreferenceValues } from "@raycast/api";
import { useState } from "react";

export default function CreateIssue() {
  const { githubToken } = getPreferenceValues<Preferences>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(values: { repo: string; title: string; body: string; labels: string[] }) {
    setIsSubmitting(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${values.repo}/issues`, {
        method: "POST",
        headers: { Authorization: `Bearer ${githubToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: values.title, body: values.body, labels: values.labels }),
      });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const issue = (await res.json()) as { number: number; title: string; html_url: string };
      await showToast({
        style: Toast.Style.Success,
        title: `Issue #${issue.number} created`,
        primaryAction: { title: "Open in Browser", onAction: () => open(issue.html_url) },
      });
      await popToRoot();
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Could not create issue", message: String(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form isLoading={isSubmitting} actions={<ActionPanel><Action.SubmitForm title="Create Issue" onSubmit={handleSubmit} /></ActionPanel>}>
      <Form.TextField id="repo" title="Repository" placeholder="acme-labs/billing-api" />
      <Form.TextField id="title" title="Title" placeholder="Invoice PDF fails for EUR customers" />
      <Form.TextArea id="body" title="Description" enableMarkdown />
      <Form.TagPicker id="labels" title="Labels">
        <Form.TagPicker.Item value="bug" title="Bug" />
        <Form.TagPicker.Item value="feature" title="Feature" />
        <Form.TagPicker.Item value="docs" title="Docs" />
      </Form.TagPicker>
    </Form>
  );
}
```

```tsx
// src/menu-bar.tsx - badge with unread notification count, refreshed every 5 minutes
import { MenuBarExtra, Icon, open, getPreferenceValues } from "@raycast/api";
import { useFetch } from "@raycast/utils";

interface Notification { id: string; subject: { title: string }; repository: { name: string } }

export default function StatusMenuBar() {
  const { githubToken } = getPreferenceValues<Preferences>();
  const { data, isLoading } = useFetch<Notification[]>("https://api.github.com/notifications", {
    headers: { Authorization: `Bearer ${githubToken}` },
    initialData: [],
  });
  return (
    <MenuBarExtra icon={Icon.Bell} title={data.length > 0 ? String(data.length) : undefined} isLoading={isLoading}>
      {data.slice(0, 10).map((n) => (
        <MenuBarExtra.Item key={n.id} title={n.subject.title} subtitle={n.repository.name} onAction={() => open("https://github.com/notifications")} />
      ))}
    </MenuBarExtra>
  );
}
```

After `npm run dev`, the menu bar shows a bell with the count; clicking an entry opens the notifications page.

### Example 3: "Cache the repo list for five minutes"

```ts
import { Cache } from "@raycast/api";
const cache = new Cache({ namespace: "repos" });

export async function getRepos(load: () => Promise<unknown[]>) {
  const hit = cache.get("repos");
  if (hit) {
    const { savedAt, items } = JSON.parse(hit);
    if (Date.now() - savedAt < 5 * 60_000) return items;
  }
  const items = await load();
  cache.set("repos", JSON.stringify({ savedAt: Date.now(), items }));
  return items;
}
```

## Guidelines

- Keep tokens in `password` preferences, never in source. Do not touch the Keychain and do not add external analytics: the store rejects both.
- Show cached data first and revalidate in the background (`useFetch`, `useCachedPromise`, `keepPreviousData`); commands should feel instant.
- Put the most common action first in the `ActionPanel`; it is the Enter action. Use toasts for success and failure.
- Store requirements: `license` MIT, a 512x512 PNG icon (not the default one), US English, `package-lock.json` committed. Recommended: a `CHANGELOG.md`, up to 6 screenshots (at least 3; 2000x1250 PNG), and a README when setup is non-trivial. Submission is a pull request to `raycast/extensions`, opened by `npm run publish`.
- Use only APIs that exist on every platform you list in `platforms`; narrow the list if you call macOS-only features such as AppleScript.
- Not for background automation outside a command: extensions run only when invoked, or on the `interval` of a `no-view` or `menu-bar` command.
