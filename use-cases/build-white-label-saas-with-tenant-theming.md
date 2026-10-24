---
title: Build a White-Label SaaS Platform with Tenant Theming
slug: build-white-label-saas-with-tenant-theming
description: >
  Turn a single-tenant SaaS into a white-label platform where each customer
  gets their own branding, domain, and feature set — without maintaining
  separate codebases.
skills:
  - typescript
  - nextjs
  - prisma
  - redis
  - tailwindcss
  - zod
category: development
tags:
  - white-label
  - multi-tenant
  - theming
  - saas
  - custom-domains
  - branding
---

# Build a White-Label SaaS Platform with Tenant Theming

## The Problem

Nadia built a project management SaaS with 200 paying customers. Three enterprise prospects each want the same product but with their own logo, colors and domain. Her options: fork the codebase three times (a maintenance nightmare) or say no and lose roughly $180K a year in contracts. One prospect wants `projects.acmecorp.com` in their brand colors; another needs email templates with their compliance footer; the third wants modules they did not buy hidden.

Nadia needs:
- **One codebase** serving many tenants with their own branding
- **Custom domains**, so users see `app.clientdomain.com`, not her domain
- **A theme engine** for colors, logo and font per tenant
- **Feature flags per tenant**, enforced on the server

## The Solution

Resolve the tenant from the hostname in Next.js `proxy.ts`, load its config from Redis (falling back to Postgres through Prisma), validate it with Zod, and expose the theme as CSS variables that Tailwind v4 utilities read. Caddy issues certificates for customer domains on demand, but only after your app confirms it knows the domain.

Versions this was written against: Next.js 16 (the old `middleware.ts` is now `proxy.ts` and runs on the Node.js runtime, so Redis and Prisma are allowed there), Tailwind CSS 4, Zod 4, Prisma 7, ioredis, Caddy 2.

## Step-by-Step Walkthrough

### Step 1: Tenant configuration schema

Never store or cache secrets in this object. SSO client secrets stay in their own table and are read only by the auth code.

```typescript
// src/lib/tenant-config.ts
import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const TenantTheme = z.object({
  primaryColor: hex,
  backgroundColor: hex,
  // Allowlist, not free text: the value ends up in a CSS variable
  fontFamily: z.enum(['Inter', 'Roboto', 'Open Sans', 'Lato']).default('Inter'),
  borderRadius: z.enum(['none', 'sm', 'md', 'lg', 'full']).default('md'),
  logoUrl: z.url({ protocol: /^https$/ }),
});

export const TenantFeatures = z.object({
  timeTracking: z.boolean().default(false),
  ganttChart: z.boolean().default(false),
  maxUsers: z.number().int().positive().default(25),
  maxProjects: z.number().int().positive().default(10),
  hidePoweredBy: z.boolean().default(false),
});

export const TenantConfig = z.object({
  id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  customDomain: z.string().nullish(),
  theme: TenantTheme,
  features: TenantFeatures,
});

export type TenantConfig = z.infer<typeof TenantConfig>;
export type TenantTheme = z.infer<typeof TenantTheme>;
```

The `Tenant` Prisma model stores `slug`, a unique nullable `customDomain`, a random `domainVerifyToken`, `active`, and the `theme` and `features` columns as `Json`, matching these schemas.

### Step 2: Tenant store with Redis cache

`prisma` is your shared client from `src/lib/prisma.ts`; Prisma 7 needs a driver adapter there, see the Prisma docs for your database.

```typescript
// src/lib/tenant-store.ts
import { Redis } from 'ioredis';
import { prisma } from './prisma';
import { TenantConfig } from './tenant-config';

const redis = new Redis(process.env.REDIS_URL!);
const TTL_SECONDS = 300;
async function cached(key: string, load: () => Promise<unknown | null>) {
  const hit = await redis.get(key);
  if (hit) return TenantConfig.parse(JSON.parse(hit));
  const row = await load();
  if (!row) return null;
  const config = TenantConfig.parse(row);
  await redis.set(key, JSON.stringify(config), 'EX', TTL_SECONDS);
  return config;
}

export const getTenantByDomain = (domain: string) =>
  cached(`tenant:domain:${domain}`, () =>
    prisma.tenant.findFirst({ where: { customDomain: domain, active: true } }));

export const getTenantBySlug = (slug: string) =>
  cached(`tenant:slug:${slug}`, () =>
    prisma.tenant.findFirst({ where: { slug, active: true } }));

export async function invalidateTenantCache(tenantId: string) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!t) return;
  await redis.del(`tenant:slug:${t.slug}`);
  if (t.customDomain) await redis.del(`tenant:domain:${t.customDomain}`);
}
```

### Step 3: Resolve the tenant in `proxy.ts`

Resolution order: custom domain, then subdomain. The result is passed to the app as a request header. Delete any `x-tenant-slug` the client sent, otherwise a visitor can pick their own tenant.

```typescript
// src/proxy.ts  (named middleware.ts before Next.js 16)
import { NextRequest, NextResponse } from 'next/server';
import { getTenantByDomain, getTenantBySlug } from '@/lib/tenant-store';

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? 'app.projecthub.io';
export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete('x-tenant-slug');

  const host = request.nextUrl.hostname.toLowerCase(); // no port

  let tenant = await getTenantByDomain(host);
  if (!tenant && host.endsWith(`.${BASE_DOMAIN}`)) {
    tenant = await getTenantBySlug(host.slice(0, -(BASE_DOMAIN.length + 1)));
  }
  if (!tenant) return new NextResponse('Unknown tenant', { status: 404 });

  headers.set('x-tenant-slug', tenant.slug);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/|api/tls-allowed|favicon.ico).*)'],
};
```

### Step 4: Theme variables and Tailwind v4

The root layout is a server component: it reads the header, loads the config and sets the variables on `<html>`. Server components can read the config directly; only client components that need it use the context.

```tsx
// src/app/layout.tsx
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTenantBySlug } from '@/lib/tenant-store';
import { TenantProvider } from '@/components/tenant-provider';
import './globals.css';

const RADIUS = { none: '0px', sm: '4px', md: '8px', lg: '12px', full: '9999px' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const slug = (await headers()).get('x-tenant-slug');
  const tenant = slug ? await getTenantBySlug(slug) : null;
  if (!tenant) notFound();
  const t = tenant.theme;

  const vars = {
    '--tenant-primary': t.primaryColor,
    '--tenant-background': t.backgroundColor,
    '--tenant-font': `'${t.fontFamily}', sans-serif`,
    '--tenant-radius': RADIUS[t.borderRadius],
  } as React.CSSProperties;

  return (
    <html lang="en" style={vars}>
      <body className="bg-background font-tenant">
        <TenantProvider tenant={tenant}>{children}</TenantProvider>
      </body>
    </html>
  );
}
```

In Tailwind v4 the theme lives in CSS. `@theme inline` makes utilities such as `bg-primary` and `rounded-tenant` read the runtime variables instead of baking in values:

```css
/* src/app/globals.css */
@import 'tailwindcss';

:root {
  --tenant-primary: #3b82f6;
  --tenant-background: #ffffff;
  --tenant-font: 'Inter', sans-serif;
  --tenant-radius: 8px;
}

@theme inline {
  --color-primary: var(--tenant-primary);
  --color-background: var(--tenant-background);
  --font-tenant: var(--tenant-font);
  --radius-tenant: var(--tenant-radius);
}
```

`TenantProvider` is a small client context (`createContext` plus a `useTenant()` hook that throws outside the provider) so client components can read the config.

### Step 5: Feature gates, in the UI and on the server

Hiding a module is cosmetic. Every route handler for a gated module must check the flag too, or a tenant can call the API directly. In the UI a `<FeatureGate feature="ganttChart" fallback={<UpgradeBanner />}>` component simply renders its children when `useTenant().features[feature]` is true.

```typescript
// src/app/api/projects/[id]/gantt/route.ts, same check at the top of every gated handler
const slug = (await headers()).get('x-tenant-slug');
const tenant = slug ? await getTenantBySlug(slug) : null;
if (!tenant?.features.ganttChart) return Response.json({ error: 'feature_disabled' }, { status: 403 });
```

### Step 6: Custom domains with on-demand TLS

Never let Caddy issue a certificate for any hostname that arrives: that lets anyone exhaust your Let's Encrypt rate limits. Configure an `ask` endpoint that returns 200 only for domains you have verified.

```caddy
# /etc/caddy/Caddyfile
{
	on_demand_tls {
		ask http://127.0.0.1:3000/api/tls-allowed
	}
}

https:// {
	tls {
		on_demand
	}
	# the ask endpoint must not be reachable from the internet
	respond /api/tls-allowed 404
	reverse_proxy 127.0.0.1:3000
}
```

Caddy calls the endpoint with `?domain=<hostname>` and issues a certificate only on a 200 response:

```typescript
// src/app/api/tls-allowed/route.ts
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get('domain')?.toLowerCase();
  if (!domain) return new Response(null, { status: 400 });
  const ok = await prisma.tenant.findFirst({ where: { customDomain: domain, active: true } });
  return new Response(null, { status: ok ? 200 : 404 });
}
```

The `respond` line keeps the endpoint off the public site (Caddy itself reaches it directly on 127.0.0.1), and the matcher in Step 3 keeps it out of the tenant proxy. Domain verification happens before `customDomain` is saved:

```typescript
// src/lib/domain-manager.ts
import { resolveCname, resolveTxt } from 'node:dns/promises';

export async function isDomainVerified(domain: string, verifyToken: string) {
  const cnames = await resolveCname(domain).catch(() => [] as string[]);
  const txts = (await resolveTxt(`_projecthub.${domain}`).catch(() => [] as string[][])).flat();
  return (
    cnames.some((c) => c.replace(/\.$/, '').toLowerCase() === 'app.projecthub.io') ||
    txts.includes(`verify=${verifyToken}`)
  );
}
```

If it returns false, show the tenant the CNAME (`domain -> app.projecthub.io`) or TXT (`_projecthub.domain -> verify=<token>`) record to add. Only after it returns true save `customDomain` (lowercased) and call `invalidateTenantCache`. Never match the CNAME target with `includes`: `evil-projecthub.io` would pass.

Apex domains cannot carry a CNAME, so those tenants must use the TXT record plus an A/ALIAS record pointing to your server.

### Step 7: Tenant branding endpoint

The branding page is a form with `<input type="color">` fields that PUTs to a handler. Validate with `TenantTheme.safeParse`, write the `theme` column, then call `invalidateTenantCache`. Take `tenantId` from the session of an authenticated tenant admin, never from the URL or body, so one tenant cannot edit another. Accept logo uploads through a presigned upload to object storage and store only the resulting HTTPS URL.

## Real-World Example

Nadia onboards Acme Corp. She inserts a `Tenant` row with Acme's colors and `ganttChart: true`, then sends them the TXT record to publish. Once `isDomainVerified` returns true, she saves `customDomain`, and the first visit to `https://projects.acmecorp.com` makes Caddy ask `/api/tls-allowed`, get a 200 and obtain a certificate. A second tenant with `ganttChart: false` sees the upgrade banner in the UI and gets a 403 from the Gantt API. All three customers run on the same deployment, so a bug fix ships once.

## Related Skills

- [typescript](../skills/typescript/SKILL.md): typed config shared by proxy, layout and handlers
- [nextjs](../skills/nextjs/SKILL.md): `proxy.ts`, server layouts and route handlers
- [prisma](../skills/prisma/SKILL.md): tenant model and domain lookups
- [redis](../skills/redis/SKILL.md): tenant config cache with explicit invalidation
- [tailwindcss](../skills/tailwindcss/SKILL.md): `@theme inline` bound to runtime variables
- [zod](../skills/zod/SKILL.md): validation of tenant config and branding input
