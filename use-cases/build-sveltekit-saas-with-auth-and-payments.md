---
title: Build a SvelteKit SaaS with Auth and Payments
slug: build-sveltekit-saas-with-auth-and-payments
description: >-
  Build a production SaaS app with SvelteKit 3 -- email and password sessions
  you own, Stripe subscriptions with a verified webhook, Drizzle on
  PostgreSQL, form actions, and progressive enhancement.
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

## The Problem

Maren wants to build a SaaS with SvelteKit because she is tired of React's complexity. She needs sign-up and sign-in, a paid plan billed through Stripe, and a dashboard that only paying or signed-in users can reach. The tutorials she finds import the `lucia` package (deprecated on npm in March 2025), and upgrade the user to the paid plan from the checkout success redirect instead of from Stripe's signed webhook, which lets anyone who opens the success URL grant themselves Pro.

## The Solution

Use **sveltekit** for routing, load functions, form actions and hooks (this page targets SvelteKit 3), **lucia-auth** for the hand-written session pattern that replaced the Lucia library, **drizzle-orm** for the PostgreSQL schema, **stripe-billing** for Checkout, the customer portal and the webhook, and **tailwindcss** for styling.

## Step-by-Step Walkthrough

### Step 1: Project setup

```bash
npx sv create my-saas --template minimal --types ts --no-add-ons --install npm
cd my-saas || exit 1
npx sv add 'tailwindcss=plugins:none' --install npm
npm install drizzle-orm pg stripe @node-rs/argon2
npm install -D drizzle-kit @types/pg
```

SvelteKit 3 needs Node.js 22.17 or newer. Environment variables are declared once in `src/env.ts` and imported from `$app/env/private` (the older `$env/*` modules are deprecated). The build fails if one is missing, which is what you want:

```typescript
// src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {}, APP_URL: {}, STRIPE_SECRET_KEY: {},
	STRIPE_WEBHOOK_SECRET: {}, STRIPE_PRO_PRICE_ID: {}
});
```
Put real values in `.env` (git-ignored) and use `sk_test_` keys until launch. `STRIPE_PRO_PRICE_ID` is a recurring Price created in the Stripe dashboard, and `STRIPE_WEBHOOK_SECRET` comes from `stripe listen` in development.

### Step 2: Schema and sessions

Lucia's author deprecated the `lucia` package and its adapters in March 2025 and now recommends owning about fifty lines of session code. The `lucia-auth` skill explains the pattern: the cookie holds a random token, the database stores only its SHA-256 hash, so a leaked table cannot be replayed as cookies. This version uses a fixed 30-day lifetime; add a sliding renewal if you want one, and call `invalidateSession` from a sign-out action.

```typescript
// src/lib/server/db/schema.ts
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('app_user', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	passwordHash: text('password_hash').notNull(),
	plan: text('plan').notNull().default('free'),
	stripeCustomerId: text('stripe_customer_id'),
	stripeSubscriptionId: text('stripe_subscription_id')
});

export const sessions = pgTable('session', {
	id: text('id').primaryKey(), // SHA-256 of the cookie token, never the token itself
	userId: text('user_id').notNull().references(() => users.id),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});
```
`src/lib/server/db/index.ts` exports `db = drizzle(DATABASE_URL, { schema })` from `drizzle-orm/node-postgres`. Generate and apply the migration with `npx drizzle-kit generate` then `npx drizzle-kit migrate` (`drizzle.config.ts` points at the schema and reads `DATABASE_URL`).

```typescript
// src/lib/server/auth.ts
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db } from './db/index.js';
import { sessions, users } from './db/schema.js';

const DAY = 24 * 60 * 60 * 1000;
const COOKIE = 'session';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string, cookies: Cookies) {
	const token = randomBytes(24).toString('base64url');
	const expiresAt = new Date(Date.now() + 30 * DAY);
	await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
	setCookie(cookies, token, expiresAt);
}

export async function validateSession(token: string) {
	const id = hashToken(token);
	const [row] = await db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, id));
	if (!row) return null;
	if (row.session.expiresAt.getTime() <= Date.now()) {
		await db.delete(sessions).where(eq(sessions.id, id));
		return null;
	}
	const { id: userId, email, name, plan } = row.user;
	return { user: { id: userId, email, name, plan } };
}

export async function invalidateSession(token: string) {
	await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export function setCookie(cookies: Cookies, token: string, expires: Date) {
	cookies.set(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: true, expires });
}
export const getToken = (cookies: Cookies) => cookies.get(COOKIE);
export const clearCookie = (cookies: Cookies) => cookies.delete(COOKIE, { path: '/' });
```
Wire it into the request with a hook and type `event.locals`. In SvelteKit 3 the `Handle` type comes from `@sveltejs/kit/hooks`:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit/hooks';
import { clearCookie, getToken, validateSession } from '#lib/server/auth.js';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	const token = getToken(event.cookies);
	const result = token ? await validateSession(token) : null;
	if (result) event.locals.user = result.user;
	else if (token) clearCookie(event.cookies);
	return resolve(event);
};
```
Add `user: { id: string; email: string; name: string; plan: string } | null` to `App.Locals` in `src/app.d.ts`. SvelteKit 3 always checks the `Origin` of cross-site form posts, so the form actions below are protected against CSRF without extra code. Never change state in a `GET` handler.

### Step 3: Sign-up and sign-in with form actions

Passwords are hashed with Argon2id through `@node-rs/argon2`. Unknown email and wrong password return the same message, and sign-up does not reveal whether an email is taken.

```typescript
// src/routes/login/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import { verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { createSession } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import type { Actions } from './$types';

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');
		const [user] = await db.select().from(users).where(eq(users.email, email));
		if (!user || !(await verify(user.passwordHash, password))) {
			return fail(400, { error: 'Invalid email or password' });
		}
		await createSession(user.id, cookies);
		redirect(303, '/dashboard');
	}
};
```
The sign-up action is the same shape: validate the fields, hash the password with `hash(password, { memoryCost: 19456, timeCost: 3, parallelism: 1 })`, `insert(users).onConflictDoNothing().returning()`, answer with one generic error if nothing was inserted, then `createSession` and redirect. The pages are plain `<form method="POST" action="?/login" use:enhance>` elements with Tailwind classes, so they post without JavaScript; `stripe.ts` exports `new Stripe(STRIPE_SECRET_KEY)`. In SvelteKit 3 an enhanced submission reports the status code you pass to `fail()`.

### Step 4: Protected dashboard

```typescript
// src/routes/dashboard/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	return { user: locals.user };
};
```
The layout's `+layout.svelte` shows `data.user.name`, `data.user.email` and a plan badge, renders `{@render children()}` and links to `/dashboard/billing`.

### Step 5: Stripe Checkout and the customer portal

The billing actions create the Stripe customer once, start a subscription Checkout session, and send paying users to Stripe's hosted customer portal to cancel or change their card. They do **not** change the plan: the webhook does.

```typescript
// src/routes/dashboard/billing/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import { APP_URL, STRIPE_PRO_PRICE_ID } from '$app/env/private';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { stripe } from '#lib/server/stripe.js';
import type { Actions, PageServerLoad } from './$types';

const getUser = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	return { plan: (await getUser(locals.user.id)).plan };
};

export const actions: Actions = {
	upgrade: async ({ locals }) => {
		if (!locals.user) return fail(401);
		const user = await getUser(locals.user.id);
		let customerId = user.stripeCustomerId;
		if (!customerId) {
			customerId = (await stripe.customers.create({ email: user.email, name: user.name })).id;
			await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, user.id));
		}
		const session = await stripe.checkout.sessions.create({
			customer: customerId,
			mode: 'subscription',
			line_items: [{ price: STRIPE_PRO_PRICE_ID, quantity: 1 }],
			client_reference_id: user.id,
			success_url: `${APP_URL}/dashboard/billing?success=true`,
			cancel_url: `${APP_URL}/dashboard/billing`
		});
		redirect(303, session.url!);
	},

	portal: async ({ locals }) => {
		if (!locals.user) return fail(401);
		const { stripeCustomerId } = await getUser(locals.user.id);
		if (!stripeCustomerId) return fail(400);
		const portal = await stripe.billingPortal.sessions.create({
			customer: stripeCustomerId,
			return_url: `${APP_URL}/dashboard/billing`
		});
		redirect(303, portal.url);
	}
};
```
Enable the customer portal once in the Stripe dashboard (Settings, Billing, Customer portal) or `billingPortal.sessions.create` fails.

### Step 6: The webhook that grants the plan

Stripe signs every event. The handler must read the raw body with `request.text()`, because `request.json()` changes the bytes and breaks the signature.

```typescript
// src/routes/api/stripe/webhook/+server.ts
import { error } from '@sveltejs/kit';
import { STRIPE_WEBHOOK_SECRET } from '$app/env/private';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { users } from '#lib/server/db/schema.js';
import { stripe } from '#lib/server/stripe.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text(); // raw bytes: never request.json()
	let event;
	try {
		event = stripe.webhooks.constructEvent(body, request.headers.get('stripe-signature') ?? '', STRIPE_WEBHOOK_SECRET);
	} catch {
		error(400, 'Invalid signature');
	}

	if (event.type === 'checkout.session.completed') {
		const s = event.data.object;
		if (s.mode === 'subscription' && s.client_reference_id) {
			await db.update(users)
				.set({ plan: 'pro', stripeCustomerId: s.customer as string, stripeSubscriptionId: s.subscription as string })
				.where(eq(users.id, s.client_reference_id));
		}
	} else if (event.type === 'customer.subscription.deleted') {
		await db.update(users)
			.set({ plan: 'free', stripeSubscriptionId: null })
			.where(eq(users.stripeSubscriptionId, event.data.object.id));
	}
	return Response.json({ received: true });
};
```
In development run `stripe listen --forward-to 127.0.0.1:5173/api/stripe/webhook` and copy the printed `whsec_` secret into `.env`. In production add the endpoint under Developers, Webhooks and subscribe to `checkout.session.completed` and `customer.subscription.deleted`. Stripe retries failed deliveries, so make handlers idempotent (the updates above are).

### Step 7: Check it

Run `npm run check` (svelte-check over routes, hooks, env and the Stripe event types) and `npm run build` (needs the five variables from `src/env.ts` set). Sign up, open `/dashboard/billing`, pay with Stripe's test card `4242 4242 4242 4242`, and confirm the plan badge changes only after the webhook arrives. For production, replace `adapter-auto` in `vite.config.ts` with `adapter-node` (self-hosting) or your platform's adapter.

## Real-World Example

Maren ships the app to a small VPS with `adapter-node`. Her first test customer closes the Checkout tab before the redirect and still ends up on Pro a few seconds later, because the plan change comes from Stripe's webhook rather than from the browser. When another tester cancels in the customer portal, the `customer.subscription.deleted` event drops the account back to the free plan with no code path of her own to maintain. She adds a nightly job that deletes expired rows from the `session` table.

## Related Skills

- **sveltekit** -- routes, form actions, hooks and adapters for SvelteKit 3
- **lucia-auth** -- the session pattern that replaced the deprecated Lucia library
- **stripe-billing** -- Checkout, customer portal and webhook handling
- **drizzle-orm** -- typed PostgreSQL schema and migrations
- **tailwindcss** -- styling, installed with `sv add`
