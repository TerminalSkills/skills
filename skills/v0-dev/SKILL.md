---
name: v0-dev
description: >-
  Generates UI components and full web apps with v0 (v0.app, formerly v0.dev), the AI app builder by Vercel. Use when a user asks to prototype React components, generate shadcn/ui layouts, create landing pages, scaffold UI from natural language prompts, or drive v0 from code through the v0 API.
license: Apache-2.0
compatibility: "A v0 account (usage is billed in credits); the v0 API needs an API key and Node.js"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["ai-ui", "code-generation", "react", "shadcn-ui", "prototyping"]
---
# v0 — AI-Powered UI Generation

## Overview

v0 by Vercel is an AI agent that builds web interfaces and full-stack apps from natural language prompts, screenshots or Figma files. It lives at v0.app (v0.dev redirects there). A new chat starts with a Next.js app using shadcn/ui and Tailwind CSS, runs it in a live preview, and can connect a database, sync with GitHub and publish to Vercel. This skill covers writing effective prompts, iterating, getting the generated code into your own repository, and calling v0 from code with the v0 API (`v0` npm package) or from another agent through its MCP server.

## Instructions

### Effective Prompts

```markdown
## What Makes a Good v0 Prompt

### ✅ Good: Specific, visual, with data examples
"A pricing page with 3 tiers: Starter ($9/mo — 5 projects, 1 user),
Pro ($29/mo — unlimited projects, 5 users, priority support, MOST POPULAR badge),
Enterprise (custom pricing — SSO, audit logs, dedicated support, 'Contact Sales' button).
Each tier is a card with a feature checklist. Use shadcn/ui, make the Pro tier
visually prominent with a border and badge."

### ❌ Bad: Vague, no visual details
"Make me a pricing page"

## Prompt Patterns That Work

### 1. Dashboard with real data
"An analytics dashboard showing: DAU chart (line, last 30 days, current 12.4K),
revenue chart (bar, monthly, $45K this month), conversion funnel (signup→trial→paid,
percentages), and a table of top 10 pages by traffic. Dark theme, minimal."

### 2. Form with validation states
"A multi-step checkout form: Step 1 — shipping address (name, address, city,
state, zip with autocomplete). Step 2 — payment (card number, expiry, CVV
with Stripe-style formatting). Step 3 — review order with item list and totals.
Show a progress bar at top. Include error states and loading states."

### 3. Data table with actions
"A user management table with columns: name (with avatar), email, role
(admin/member/viewer as colored badge), status (active/suspended), last login
(relative time). Include: search bar, role filter dropdown, bulk select checkboxes,
and a row action menu (edit/suspend/delete). Pagination at bottom."
```

A screenshot or a Figma link attached to the prompt works as the visual spec; add text for behavior the image cannot show. For a multi-feature app, ask v0 to plan first (the built-in **Plan Mode** instruction makes it propose a plan and wait for approval).

### Integration Workflow

v0 no longer hands over a single component file: every chat is a complete project. There are two ways to get its code into your own work.

**GitHub sync (recommended).** In the chat open **Project menu `...` → Settings → GitHub → Connect**, pick the account and a repository name. v0 creates a private repository and pushes the project. Every later change is committed to a working branch such as `v0/main-abc123` with its own preview deployment; **Publish** opens (or reuses) a pull request and merges it. v0 never pushes to the base branch directly. An existing repository goes the other way: in a new chat, **+ → Import from… → Import from GitHub**.

```bash
git clone git@github.com:ledgerline/pricing-page.git
cd pricing-page
npm install          # a regular Next.js project; use pnpm instead if the repository has a pnpm-lock.yaml
npm run dev
```

**Copy components into an existing app.** Read the files in the chat's **Code** tab (or pull them with the API, see below) and copy what you need. The components import shadcn/ui primitives, so the target project needs them:

```bash
# 1. A Next.js project with shadcn/ui (skip if you already have one)
npx create-next-app@latest ledgerline-web --typescript --tailwind --app
cd ledgerline-web
npx shadcn@latest init      # interactive: asks for a component library (Base UI, React Aria, Radix UI) and a preset;
                            # without prompts: `init -d` (defaults: Base UI) or `init -b radix -p nova` (Radix UI)

# 2. Install the primitives the generated code imports. They must be built on the same library as the v0 project's
#    own components/ui/*.tsx (check whether those import radix-ui or @base-ui/react), or copy those files instead
npx shadcn@latest add card table badge button input select avatar
npx shadcn@latest add sheet dialog dropdown-menu tabs

# 3. Copy the component files into components/ and fix import paths
# The output is standard React + shadcn/ui + Tailwind: no runtime dependency on v0
```

### Iteration

```markdown
## Iterating on v0 Output

v0 supports conversation-style iteration:

1. Generate initial component: "A user profile card with avatar, name, bio, stats"
2. Refine: "Make the avatar larger, add an edit button, and add social links"
3. Add variants: "Create a compact version of this card for use in a sidebar"
4. Add interactivity: "Make the bio editable inline with a pencil icon toggle"
5. Responsive: "Make it stack vertically on mobile with the avatar centered"

Each iteration builds on the previous — v0 remembers context within a conversation.
```

Two tools make an iteration precise: in the **Code** tab select lines in the gutter and attach a comment to the next prompt; in the **Design** tab click an element in the preview and change its styles directly. Up to 10 prompts can be queued while v0 is still generating.

### Using v0 from Code

The v0 API (v2, base URL `https://api.v0.dev/v2`) exposes the same agent. Create a key at v0.app/settings/keys and keep it on the server.

```bash
npm install v0                  # TypeScript SDK for API v2 (the older v0-sdk package targets v1)
# The SDK reads V0_API_KEY from process.env: keep it in .env.local (git-ignored) or a secret manager,
# never in browser code and never with a NEXT_PUBLIC_ prefix. Next.js loads .env.local itself;
# a plain Node script needs `node --env-file=.env.local` (Node 20.6+)
```

```javascript
// generate-pricing.mjs — run with: node --env-file=.env.local generate-pricing.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { v0 } from "v0"; // reads V0_API_KEY from the environment

const created = await v0.chats.create({
  message:
    "A pricing page with 3 tiers: Starter ($9/mo, 5 projects), Pro ($29/mo, unlimited projects, " +
    "MOST POPULAR badge), Enterprise (custom, 'Contact Sales'). shadcn/ui cards, Pro visually prominent.",
});
if (created.error) throw new Error(created.error.message);
const chatId = created.data.chat.id;

// Iterate in the same chat instead of starting over
const refined = await v0.messages.send({ chatId, message: "Add a monthly/annual toggle with 20% off annual." });
if (refined.error) throw new Error(refined.error.message);

// Pull the generated source into the working tree for review
const result = await v0.chats.getFiles({ chatId });
if (result.error) throw new Error(result.error.message);
for (const file of result.data.files) {
  const target = join("v0-output", file.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(file.content, file.encoding));
}
console.log(`${result.data.files.length} files written to v0-output/ from chat ${chatId}`);
console.log(`credits used: ${created.data.usage.creditsCost.total + refined.data.usage.creditsCost.total}`);
```

Methods return `{ data, error }` instead of throwing. `create` and `send` wait for the generation to finish; `createStream`/`sendStream` return server-sent events for a live UI, and `createAsync`/`sendAsync` return at once for polling. Other calls: `v0.chats.getPreview({ chatId })` for the preview URL, `v0.chats.deploy({ chatId })` to deploy to Vercel, `v0.chats.createFromRepo` / `createFromZip` to start from existing code. `npx create-v0-sdk-app my-v0-app` scaffolds a complete chat-and-preview frontend on top of these.

Coding agents can use v0 through its remote MCP server at `https://v0.app/api/mcp` (`{ "mcpServers": { "v0": { "url": "https://v0.app/api/mcp" } } }`). It signs in with OAuth — no API key goes into the MCP configuration — and exposes the API operations as tools (`chats.create`, `messages.send`, `chats.getFiles`, `chats.deploy`).

### What v0 Generates Well vs What It Doesn't

```markdown
## v0 Strengths
- Landing pages, marketing sites
- Dashboard layouts, admin panels
- Forms (multi-step, with validation UI)
- Data tables with filters and pagination
- Card layouts, grid systems
- Navigation (sidebar, header, breadcrumbs)
- Modal dialogs, slide-overs, popovers
- Full-stack features when asked: API routes, server actions, a database
  (Neon, Supabase, Upstash through Project menu → Settings → Integrations), Stripe payments

## v0 Limitations (handle in your code)
- A first generation uses mock data unless the prompt asks for a data layer
- Best results only on its default stack (Next.js, Tailwind CSS, shadcn/ui);
  other frameworks and component libraries work less reliably
- Customized shadcn/ui primitives confuse it: it is trained on the default implementations
- Complex state management (use React context or Zustand)
- Server Components vs Client Components (review "use client" placement)
- Generated auth, payments and database code needs a security review before production
```

## Examples

### Example 1: Prototype a page and bring it into a repository

User: "I need a pricing page for our SaaS by tomorrow. We use Next.js and shadcn/ui."

1. At v0.app, send the pricing prompt from **Effective Prompts**, then refine in the same chat: "Add a monthly/annual toggle with 20% off annual", "Stack the cards on mobile, Pro first".
2. Connect the chat to GitHub (**Project menu → Settings → GitHub → Connect**, repository `ledgerline/pricing-page`).
3. Work on it locally:

```bash
git clone git@github.com:ledgerline/pricing-page.git && cd pricing-page
npm install && npm run dev      # pnpm, if the repository has a pnpm-lock.yaml
```

Result: a private repository holding a complete Next.js project built with shadcn/ui and Tailwind CSS. Later prompts in the chat arrive as commits on a `v0/…` working branch with a preview deployment, and reach the base branch only through a pull request.

### Example 2: Generate UI from a script

User: "Generate the pricing page from our build script and drop the files into the repo so I can review them."

Save `generate-pricing.mjs` from **Using v0 from Code** and run it:

```bash
npm install v0
node --env-file=.env.local generate-pricing.mjs   # .env.local holds V0_API_KEY
git status --short v0-output/
```

The script creates a chat, sends one refinement, and writes every source file of the generated project under `v0-output/` with its project-relative path (for example `v0-output/app/page.tsx`), then prints how many files it wrote, the chat ID and the credits spent. Each `create` and `send` is a paid generation; the response's `usage` field reports its token counts and credit cost.

## Guidelines

1. **Be specific with data** — Include actual numbers, labels, and content in prompts; "12,450 users" generates better UI than "user count"
2. **Reference shadcn components** — Mention "shadcn/ui" in prompts; v0 generates cleaner code when explicitly targeting the component library
3. **One component at a time** — Build large apps incrementally: one feature per prompt, checked in the preview, instead of one giant prompt
4. **Iterate, don't start over** — Use the conversation to refine; v0 maintains context and each iteration improves on the previous
5. **Review "use client"** — v0 may add `"use client"` unnecessarily; remove it from components that don't use state or effects
6. **Add your design tokens** — After generating, update colors and spacing to match your brand; v0 uses shadcn defaults (a shadcn registry can teach v0 your design system)
7. **Mock data → real data** — Replace mock data with API calls once the UI is finalized, or ask v0 to add the data layer
8. **No vendor lock-in** — v0 output is standard React code; you own it completely, no runtime dependency on v0
9. **Watch the credits** — The Free plan allows 7 messages a day; paid plans (Plus $30/user/month, Business $100/user/month) bill generations in credits by tokens used, and long chats cost more because the whole context is sent each time. Check v0.app/pricing: plans change
10. **Keep secrets out of prompts** — Put API keys in the project's environment variables, not in the chat. v0 may use prompts and generated content for training unless the team has opted out in its Vercel data preferences (the plan table offers the opt-out on Business and Enterprise only; Enterprise content is never used)
11. **The repository is the source of truth** — Once a chat is connected to GitHub, deleting the repository can make the code unrecoverable
