---
name: lovable
description: >-
  Lovable (formerly GPT Engineer) is a browser-based AI app builder that turns a natural-language description into a working full-stack web app with a built-in backend, authentication, database and one-click publishing. Use when the user wants to prototype or ship a web app with Lovable, write effective Lovable prompts, connect Supabase or GitHub, review generated security rules, or move a Lovable project into their own editor.
license: Apache-2.0
compatibility: "Browser-based at lovable.dev; no local install. Optional GitHub account for code sync."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - ai-coding
    - full-stack
    - prototyping
    - vibe-coding
    - no-code
---

# Lovable — AI Full-Stack App Generator

## Overview

Lovable (lovable.dev) generates and edits web apps from chat prompts in the browser. Projects use Tailwind CSS and shadcn/ui; apps created since May 2026 use TanStack Start (server-rendered), older ones are React + Vite. For the backend you choose either Lovable Cloud (built-in database, auth, storage, realtime and functions, built on Supabase's open-source stack) or your own Supabase project. Code can be synced two ways with GitHub, and apps are published to a lovable URL or a custom domain. There is nothing to install and no CLI; an agent helps by writing good prompts, reviewing the output and working on the synced repository.

## Instructions

### 1. Plan before the first prompt

Answer four questions: what is it, who uses it, why, and what is the key action. Describe the app section by section with real copy, not placeholders. Lovable's guidance: a full-page prompt gives noise, a section-based prompt gives signal. Name a design direction ("minimal", "premium", "playful") to steer typography and spacing.

### 2. Choose the backend

- New projects: Lovable Cloud (default) or Supabase, chosen when the backend is first enabled.
- Existing Supabase-connected projects keep working. There is no migration from Supabase to Cloud, and no one-click move from Cloud to your own Supabase project, so decide early.

### 3. Work in modes

Lovable has an Agent mode (builds and changes things) and a Chat mode (discuss, plan, no edits). Plan Mode costs 1 credit per message; normal edits cost roughly 0.5-1.7 credits depending on complexity. Add "Ask me any questions you need before building" to get clarifying questions. Put durable rules (stack, naming, tone) in project or workspace knowledge so they persist between chats.

### 4. Review security

Generated tables should have Row Level Security. Read each policy, run the built-in security scan, and test with two different users before publishing.

### 5. Sync and own the code

Connect GitHub from project settings. Sync is two-way for one branch at a time (the default branch unless switched); new branches start from the active one. You can only export Lovable projects to GitHub, not import an existing repo, and files over 10 MB cannot be edited by Lovable. Disconnecting keeps both copies, but reconnecting creates a new repository.

### 6. Plans

Free, Pro, Business and Enterprise; pricing is by credits, not seats. Free includes 5 daily build credits (up to 30 a month) plus small Cloud credits. Check lovable.dev/pricing for current prices.

## Examples

### Example 1: Waitlist app with referrals

**Request:** "Use Lovable to build a SaaS waitlist: signup form with a counter, referral links, a leaderboard, and an admin page."

Prompt to paste:

```
Build a waitlist site for "Parcelly", a shipping-label tool for Etsy sellers.
Sections: hero ("Print labels in 10 seconds") with an email form and a live
signup counter; a leaderboard of the top 10 referrers; /admin page behind
email login that lists signups and exports CSV.
Every signup gets a unique referral link (?ref=code) that credits the referrer.
Style: minimal, dark mode. Use Lovable Cloud for data and auth.
Ask me any questions you need before building.
```

Result: Lovable asks about invite emails, then creates pages, a `signups` table and policies, and a preview URL. A reasonable table and policy set to check against the generated one:

```sql
create table public.signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  referral_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  referred_by uuid references public.signups(id),
  created_at timestamptz not null default now()
);
alter table public.signups enable row level security;
create policy "anyone can join" on public.signups for insert to anon with check (true);
-- reading all rows must be limited to admins, e.g. via a user_roles table
```

### Example 2: Iterating and syncing to GitHub

**Request:** "Add a signups-over-time chart, then get the code into my repo so I can keep working in Cursor."

Chat prompt: "Add a line chart of signups per day to /admin using the existing data; show an empty state when there are no signups." Then: Project settings, GitHub, Connect, pick the account and create the repository. Afterwards:

```bash
git clone git@github.com:parcelly-dev/parcelly-waitlist.git
cd parcelly-waitlist && npm install && npm run dev
```

Pushes to the synced branch appear in Lovable; keep local edits on that branch (or switch the branch in project settings).

## Guidelines

- Put every core feature in the first prompt, then change one thing per follow-up so version history stays useful; bookmark working versions.
- Do not paste API keys into chat; use the secrets/integration dialogs. Server-side keys belong in backend functions, never in client code.
- Never trust generated RLS blindly: an `insert ... with check (true)` policy is fine for a public form, a `select` one is not.
- Credits are consumed by building, hosting and AI features, and are not refundable; prefer Chat/Plan mode for questions.
- Not a good fit for native mobile apps, heavy custom backends or complex existing monorepos: use a coding agent in the repository instead.
