---
title: Fetch Up-to-Date Code Documentation with Context7
slug: fetch-up-to-date-code-documentation-with-context7
description: Give a coding agent the documentation for the exact framework version a project runs, so an upgrade stops producing deprecated API calls, for web developers.
skills:
  - context7
  - nextjs
category: development
tags:
  - context7
  - documentation
  - nextjs
  - framework-upgrade
  - code-generation
---

## The Problem

Dario Reyes is the only full-stack developer at Pallet & Post, a six-person company with a freight-quote tool built on Next.js. In September he upgrades the app from Next.js 14 to 16.1.6. The build passes after a day of fixes, and then the slow part begins: every time he asks his coding agent for new code, it writes Next.js the way it learned it. It creates `middleware.ts`, which version 16 has deprecated. It reads `cookies()` and `params` without `await`, which version 16 no longer allows. The code looks right, reviews well, and fails at build time or, worse, at runtime.

In the first week after the upgrade Dario counts 11 generated changes that he had to correct by hand, about 20 minutes each once he includes finding the right page in the upgrade guide. Pasting documentation into the chat works, but he has to know in advance which page the agent will need.

## The Solution

Use **context7** so the agent looks up the documentation for the installed version before it writes framework code, and **nextjs** for the structure of the app itself: where route protection belongs, how Server Components and Server Actions fit together. Context7 answers "what is the API today"; the Next.js skill answers "how should this feature be built".

```bash
npx terminal-skills install context7 nextjs
```

## Step-by-Step Walkthrough

### 1. Connect Context7 to the agent

```text
Set up Context7 for Claude Code in this project. Use the CLI mode, I don't want another MCP server running.
```

Dario creates a free key at https://context7.com/dashboard and exports it as `CONTEXT7_API_KEY` in his shell profile. The agent runs:

```bash
npx ctx7 setup --cli --claude --project --yes --api-key "$CONTEXT7_API_KEY"
```

This installs a documentation skill for Claude Code that calls the `ctx7` command when a task involves a library.

### 2. Find the library and the installed version

```text
Which Next.js version do we run, and what is its Context7 ID?
```

```bash
node -p "require('next/package.json').version"
npx ctx7 library next.js "redirect unauthenticated users to the login page"
```

```text
16.1.6

1. Title: Next.js
   Context7-compatible library ID: /vercel/next.js
   Code Snippets: 4606
   Source Reputation: High
   Benchmark Score: 91.87
   Versions: v15.1.8, v16.0.3, v16.1.0, v16.1.1, v16.1.5, v16.1.6, v16.2.2, v16.2.9

2. Title: Next.js
   Context7-compatible library ID: /websites/nextjs
   Code Snippets: 5377

3. Title: Next.js Boilerplate
   Context7-compatible library ID: /ixartz/next-js-boilerplate
   Code Snippets: 448
```

The output is shortened. The agent picks the official repository and the version that matches `package.json`: `/vercel/next.js/v16.1.6`.

### 3. Ask the question against that version

```text
Protect everything under /quotes. Signed-out users go to /login. Check the docs for our version first.
```

```bash
npx ctx7 docs /vercel/next.js/v16.1.6 "redirect unauthenticated users to the login page"
```

```text
### Implement Conditional Redirects with Next.js Proxy for Authentication
Source: https://github.com/vercel/next.js/blob/v16.1.6/docs/01-app/02-guides/redirecting.mdx

export function proxy(request: NextRequest) {
  const isAuthenticated = authenticate(request)
  if (isAuthenticated) {
    return NextResponse.next()
  }
  return NextResponse.redirect(new URL('/login', request.url))
}

export const config = {
  matcher: '/dashboard/:path*',
}
```

The snippet comes from the documentation tagged `v16.1.6`, and it uses a `proxy` function, not `middleware`.

### 4. Write the code from the documentation

The agent asks one more question, because the app reads a session cookie:

```bash
npx ctx7 docs /vercel/next.js/v16.1.6 "read a cookie inside proxy and in a server component"
```

Then it writes the file, following the app conventions from the Next.js skill and the API from the lookup:

```typescript
// proxy.ts
import { NextResponse, type NextRequest } from 'next/server'
import { verifySession } from '@/lib/session'

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('pp_session')?.value
  const session = token ? await verifySession(token) : null

  if (!session) {
    const login = new URL('/login', request.url)
    login.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(login)
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/quotes/:path*',
}
```

```bash
npm run build
```

The build succeeds, and a signed-out request to `/quotes/1042` redirects to `/login?next=/quotes/1042`.

### 5. Make the lookup automatic

```text
Add a rule so you check Context7 for our pinned versions without me asking.
```

The agent appends this to `CLAUDE.md`:

```text
## Library documentation
- Before writing code that calls Next.js, look up the API with Context7.
- Use the version from package.json: /vercel/next.js/v16.1.6. Update this line when the dependency changes.
- Cite the source link of the snippet you relied on in the pull request description.
```

## Real-World Example

Dario sets this up on a Monday morning in about ten minutes. During the following two weeks the agent makes 23 changes that touch framework APIs. It runs a lookup before 19 of them and cites the source in each pull request. Two changes still need a manual fix: both concern a charting package that Context7 has not indexed, so the agent had nothing to look up and fell back on memory.

Corrections drop from 11 in the week after the upgrade to two in the next two weeks, which gives Dario back roughly three hours a week. The habit that changed most is review: instead of checking generated code against his own memory of the upgrade guide, he opens the cited source link and compares.

## Related Skills

- [context7](/skills/context7) — looks up the documentation for the installed library version before the agent writes code
- [nextjs](/skills/nextjs) — provides the App Router structure and conventions the generated code has to fit into
