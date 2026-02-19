---
name: sveltekit
description: >-
  Assists with building full-stack web applications using SvelteKit. Use when creating Svelte
  apps with file-based routing, server-side rendering, form actions, or API endpoints. Trigger
  words: sveltekit, svelte, svelte routing, form actions, svelte hooks, svelte adapter,
  svelte load function.
license: Apache-2.0
compatibility: "Requires Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["sveltekit", "svelte", "full-stack", "ssr", "web-framework"]
---

# SvelteKit

## Overview

SvelteKit is a full-stack framework built on Svelte's compiler-first approach, shipping minimal JavaScript with no virtual DOM runtime. It provides file-based routing for pages and API endpoints, server-side form actions with progressive enhancement, and deployment adapters for any hosting platform.

## Instructions

- When setting up routing, use file-based conventions: `+page.svelte` for pages, `+layout.svelte` for shared layouts, `+server.ts` for API endpoints, and route groups `(name)` for shared layouts without URL impact.
- When loading data, use `+page.server.ts` for server-only loading (database queries, secrets) and `+page.ts` for universal loading. Keep `load()` functions thin and move business logic to `$lib/server/`.
- When handling forms, use server-side form actions in `+page.server.ts` with `fail()` for validation errors and `redirect()` for success. Add `use:enhance` for progressive enhancement.
- When creating API routes, export `GET`, `POST`, `PUT`, `DELETE` handlers from `+server.ts` files, returning `json()`, `text()`, or `error()` responses.
- When configuring rendering, default to SSR, use `export const prerender = true` for static pages (marketing, docs, blog), and `export const ssr = false` for client-only pages.
- When adding middleware, use `src/hooks.server.ts` with the `handle` function for auth, logging, and redirects, and `sequence()` to compose multiple hooks.
- When deploying, choose the appropriate adapter: `adapter-auto` for auto-detection, `adapter-node` for self-hosted, `adapter-static` for full SSG, or platform-specific adapters for Vercel, Cloudflare, or Netlify.

## Examples

### Example 1: Build a CRUD app with form actions

**User request:** "Create a SvelteKit app with form-based task management"

**Actions:**
1. Define routes for task list (`/tasks/+page.svelte`) and detail (`/tasks/[id]/+page.svelte`)
2. Implement `load()` in `+page.server.ts` to fetch tasks from the database
3. Add form actions for create, update, and delete with Zod validation
4. Enhance forms with `use:enhance` for no-JS fallback

**Output:** A full-stack task management app with progressive enhancement and server-side validation.

### Example 2: Deploy a hybrid SvelteKit app

**User request:** "Set up a SvelteKit site with static marketing pages and dynamic dashboard"

**Actions:**
1. Create marketing pages with `export const prerender = true`
2. Build dashboard routes with SSR and `+page.server.ts` for authenticated data loading
3. Add auth hook in `src/hooks.server.ts` to protect dashboard routes
4. Configure `adapter-vercel` with edge functions for the dashboard

**Output:** A hybrid app with pre-rendered marketing pages and server-rendered authenticated dashboard.

## Guidelines

- Use `+page.server.ts` for data loading that touches databases or secrets; never expose credentials in `+page.ts`.
- Default to server-side form handling with actions; add `use:enhance` for progressive enhancement.
- Use `export const prerender = true` on marketing pages, docs, and blog posts.
- Keep `load()` functions thin: fetch data and return it, move business logic to `$lib/server/`.
- Use route groups `(name)` to share layouts without affecting URLs.
- Set `data-sveltekit-preload-data="hover"` on links for perceived-instant navigation.
- Always handle the `form` prop in `+page.svelte` to display validation errors after failed actions.
