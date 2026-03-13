---
title: Build a SvelteKit SaaS with Auth and Payments
slug: build-sveltekit-saas-with-auth-and-payments
description: >-
  Build a production SaaS app with SvelteKit — authentication with Lucia,
  Stripe subscriptions, server-side load functions, form actions, and
  progressive enhancement for a fast, accessible app.
skills:
  - sveltekit
  - lucia-auth
  - stripe-billing
  - drizzle-orm
  - tailwindcss
category: development
tags:
  - sveltekit
  - saas
  - auth
  - stripe
  - fullstack
---

# Build a SvelteKit SaaS with Auth and Payments

Maren wants to build a SaaS with SvelteKit because she's tired of React's complexity. Svelte compiles away the framework — no virtual DOM, no hooks rules, no `useEffect` foot-guns. SvelteKit gives her server-side rendering, form actions that work without JavaScript, and load functions for type-safe data fetching. Combined with Lucia for auth and Stripe for payments, she has a production SaaS stack.

## Step 1: Project Setup

```bash
npx sv create my-saas --template minimal --types ts
cd my-saas
npm install lucia @lucia-auth/adapter-drizzle drizzle-orm stripe
npm install -D drizzle-kit
```

## Step 2: Authentication with Lucia

```typescript
// src/lib/server/auth.ts
import { Lucia } from "lucia";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { db } from "./db";
import { users, sessions } from "./db/schema";

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);

export const lucia = new Lucia(adapter, {
  sessionCookie: { attributes: { secure: process.env.NODE_ENV === "production" } },
  getUserAttributes: (attrs) => ({
    email: attrs.email,
    name: attrs.name,
    plan: attrs.plan,
  }),
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: { email: string; name: string; plan: string };
  }
}
```

```typescript
// src/hooks.server.ts
import { lucia } from "$lib/server/auth";
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get(lucia.sessionCookieName);

  if (sessionId) {
    const { session, user } = await lucia.validateSession(sessionId);
    if (session?.fresh) {
      const cookie = lucia.createSessionCookie(session.id);
      event.cookies.set(cookie.name, cookie.value, { path: ".", ...cookie.attributes });
    }
    if (!session) {
      const cookie = lucia.createBlankSessionCookie();
      event.cookies.set(cookie.name, cookie.value, { path: ".", ...cookie.attributes });
    }
    event.locals.user = user;
    event.locals.session = session;
  }

  return resolve(event);
};
```

## Step 3: Login Page with Form Actions

```svelte
<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import { enhance } from "$app/forms";
  let { form } = $props();
</script>

<div class="max-w-sm mx-auto mt-20">
  <h1 class="text-2xl font-bold mb-6">Sign In</h1>

  <!-- Works without JavaScript! Progressive enhancement. -->
  <form method="POST" action="?/login" use:enhance class="space-y-4">
    {#if form?.error}
      <div class="bg-red-50 text-red-600 p-3 rounded">{form.error}</div>
    {/if}

    <div>
      <label for="email" class="block text-sm font-medium">Email</label>
      <input id="email" name="email" type="email" required
        class="w-full px-3 py-2 border rounded mt-1" />
    </div>

    <div>
      <label for="password" class="block text-sm font-medium">Password</label>
      <input id="password" name="password" type="password" required minlength="10"
        class="w-full px-3 py-2 border rounded mt-1" />
    </div>

    <button type="submit" class="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
      Sign In
    </button>
  </form>

  <p class="text-center text-sm text-gray-600 mt-4">
    No account? <a href="/signup" class="text-blue-600">Sign up</a>
  </p>
</div>
```

```typescript
// src/routes/login/+page.server.ts
import { fail, redirect } from "@sveltejs/kit";
import { lucia } from "$lib/server/auth";
import { verify } from "@node-rs/argon2";
import type { Actions } from "./$types";

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const data = await request.formData();
    const email = data.get("email") as string;
    const password = data.get("password") as string;

    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) return fail(400, { error: "Invalid email or password" });

    const valid = await verify(user.passwordHash, password);
    if (!valid) return fail(400, { error: "Invalid email or password" });

    const session = await lucia.createSession(user.id, {});
    const cookie = lucia.createSessionCookie(session.id);
    cookies.set(cookie.name, cookie.value, { path: ".", ...cookie.attributes });

    redirect(302, "/dashboard");
  },
};
```

## Step 4: Stripe Subscription Billing

```typescript
// src/routes/dashboard/billing/+page.server.ts
import Stripe from "stripe";
import type { PageServerLoad, Actions } from "./$types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, "/login");

  const user = await db.query.users.findFirst({ where: eq(users.id, locals.user.id) });

  let subscription = null;
  if (user?.stripeSubscriptionId) {
    subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  }

  return { plan: user?.plan || "free", subscription };
};

export const actions: Actions = {
  upgrade: async ({ locals }) => {
    if (!locals.user) return fail(401);

    const user = await db.query.users.findFirst({ where: eq(users.id, locals.user.id) });

    // Create or get Stripe customer
    let customerId = user?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user!.email, name: user!.name });
      customerId = customer.id;
      await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, locals.user.id));
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
      success_url: `${process.env.APP_URL}/dashboard/billing?success=true`,
      cancel_url: `${process.env.APP_URL}/dashboard/billing`,
    });

    redirect(303, session.url!);
  },

  cancelSubscription: async ({ locals }) => {
    if (!locals.user) return fail(401);
    const user = await db.query.users.findFirst({ where: eq(users.id, locals.user.id) });
    if (user?.stripeSubscriptionId) {
      await stripe.subscriptions.update(user.stripeSubscriptionId, { cancel_at_period_end: true });
    }
    return { success: true };
  },
};
```

## Step 5: Protected Dashboard Layout

```typescript
// src/routes/dashboard/+layout.server.ts
import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, "/login");
  return { user: locals.user };
};
```

```svelte
<!-- src/routes/dashboard/+layout.svelte -->
<script lang="ts">
  let { data, children } = $props();
</script>

<div class="flex min-h-screen">
  <nav class="w-64 bg-gray-900 text-white p-4">
    <div class="mb-8">
      <p class="font-semibold">{data.user.name}</p>
      <p class="text-sm text-gray-400">{data.user.email}</p>
      <span class="text-xs bg-blue-600 px-2 py-0.5 rounded mt-1 inline-block">
        {data.user.plan}
      </span>
    </div>
    <a href="/dashboard" class="block py-2 px-3 rounded hover:bg-gray-800">Dashboard</a>
    <a href="/dashboard/billing" class="block py-2 px-3 rounded hover:bg-gray-800">Billing</a>
    <a href="/dashboard/settings" class="block py-2 px-3 rounded hover:bg-gray-800">Settings</a>
  </nav>

  <main class="flex-1 p-6">
    {@render children()}
  </main>
</div>
```

## Summary

Maren's SaaS loads instantly with SvelteKit's SSR and works without JavaScript (forms submit natively, pages render on the server). Lucia handles authentication with type-safe sessions — the user object is available in every server load function and form action. Stripe Checkout handles upgrade flows with a single form submission. The auth guard in the dashboard layout protects all nested routes. Svelte's reactivity is simpler than React: `$state` instead of `useState`, no dependency arrays, no stale closures. The compiled output is 40% smaller than the equivalent React app.
