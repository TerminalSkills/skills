---
title: "Build a White-Label SaaS Platform"
description: "Build a multi-tenant SaaS platform that agencies can resell under their own brand — custom domains, per-tenant theming, tiered billing, and admin hierarchy."
skills: [stripe-connect, prisma, nextjs]
difficulty: advanced
time_estimate: "8 hours"
tags: [white-label, multi-tenant, saas, stripe-connect, custom-domain, theming, prisma, nextjs]
---

# Build a White-Label SaaS Platform

## The Problem

You've built a SaaS product that works. Now 10 marketing agencies want to sell it to their clients under their own brand. Each agency wants their logo, colors, and custom domain. Their clients shouldn't see your brand at all.

**Goal:** A platform where agencies sign up, customize their portal, invite clients, and pay you — while their clients pay them.

---

## Who This Is For

**SaaS founder** selling to agencies who want branded portals. You want a single codebase that serves `agency1.com`, `agency2.com`, and `app.yoursaas.com` with different branding and isolated data.

---

## Architecture

```
Platform (your SaaS)
├── Super Admin (you)
│   └── Manage agencies, view all data, set platform pricing
├── Agency Admin (your customers)
│   ├── Own subdomain: agency.yoursaas.com or custom domain
│   ├── Configure branding (logo, colors, fonts)
│   ├── Manage their clients
│   └── Stripe Connect: pay you, charge clients
└── End Users (agency's clients)
    ├── See agency branding, not yours
    └── Access features per their plan
```

---

## Step 1: Prisma Schema

```prisma
// prisma/schema.prisma
model Tenant {
  id           String   @id @default(cuid())
  name         String
  slug         String   @unique  // subdomain: {slug}.yoursaas.com
  customDomain String?  @unique  // custom domain mapping
  createdAt    DateTime @default(now())

  // Branding
  primaryColor   String  @default("#6366f1")
  accentColor    String  @default("#8b5cf6")
  logoUrl        String?
  faviconUrl     String?
  fontFamily     String  @default("Inter")

  // Billing (Stripe Connect)
  stripeAccountId    String?  // agency's Stripe Connect account
  stripePriceId      String?  // what agency pays platform
  stripeSubId        String?
  planTier           String   @default("agency_starter")

  users    TenantUser[]
  clients  Client[]
  settings TenantSettings?
}

model TenantUser {
  id       String @id @default(cuid())
  tenantId String
  userId   String
  role     String @default("member") // agency-admin | member

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, userId])
}

model Client {
  id          String   @id @default(cuid())
  tenantId    String
  name        String
  email       String
  planTier    String   @default("client_basic")
  stripeSubId String?  // client's subscription (agency → client billing)
  createdAt   DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
}

model TenantSettings {
  id              String  @id @default(cuid())
  tenantId        String  @unique
  customCss       String? @db.Text
  allowedFeatures String  @default("[]") // JSON array of feature flags
  maxClients      Int     @default(10)
  maxUsers        Int     @default(5)

  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

---

## Step 2: Tenant Resolution Middleware

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  // Skip static files and API
  if (pathname.startsWith("/_next") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Resolve tenant from hostname
  const tenantSlug = resolveTenantSlug(hostname);

  // Inject tenant context via header (read in layout)
  const response = NextResponse.next();
  response.headers.set("x-tenant-slug", tenantSlug ?? "");
  response.headers.set("x-hostname", hostname);
  return response;
}

function resolveTenantSlug(hostname: string): string | null {
  const rootDomain = process.env.ROOT_DOMAIN ?? "yoursaas.com";

  // Subdomain: agency1.yoursaas.com → "agency1"
  if (hostname.endsWith(`.${rootDomain}`)) {
    return hostname.replace(`.${rootDomain}`, "");
  }

  // Custom domain — resolved from DB in layout
  return null;
}
```

---

## Step 3: Tenant Context in Layout

```typescript
// lib/tenant.ts
import { prisma } from "./prisma";
import { headers } from "next/headers";
import { cache } from "react";

export type TenantTheme = {
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  fontFamily: string;
  customCss: string | null;
};

export const getCurrentTenant = cache(async () => {
  const headersList = headers();
  const slug = headersList.get("x-tenant-slug");
  const hostname = headersList.get("x-hostname");

  if (!slug && !hostname) return null;

  const tenant = await prisma.tenant.findFirst({
    where: slug
      ? { slug }
      : { customDomain: hostname ?? undefined },
    include: { settings: true },
  });

  return tenant;
});
```

```tsx
// app/layout.tsx
import { getCurrentTenant } from "@/lib/tenant";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getCurrentTenant();

  const theme = {
    "--color-primary": tenant?.primaryColor ?? "#6366f1",
    "--color-accent": tenant?.accentColor ?? "#8b5cf6",
    "--font-family": tenant?.fontFamily ?? "Inter",
  } as React.CSSProperties;

  return (
    <html lang="en">
      <head>
        {tenant?.faviconUrl && <link rel="icon" href={tenant.faviconUrl} />}
        {tenant?.settings?.customCss && (
          <style>{tenant.settings.customCss}</style>
        )}
      </head>
      <body style={theme}>
        {children}
      </body>
    </html>
  );
}
```

---

## Step 4: CSS Variable Theming

```css
/* app/globals.css */
:root {
  --color-primary: #6366f1;
  --color-accent: #8b5cf6;
  --font-family: "Inter", sans-serif;
}

.btn-primary {
  background-color: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  filter: brightness(1.1);
}

.sidebar-active {
  border-left: 3px solid var(--color-primary);
  color: var(--color-primary);
}

/* Agency can override via settings.customCss */
```

---

## Step 5: Stripe Connect — Agency Billing

```typescript
// app/api/connect/onboard/route.ts
import Stripe from "stripe";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const tenant = await prisma.tenant.findFirst({
    where: {
      users: { some: { userId: session.user.id, role: "agency-admin" } },
    },
  });

  if (!tenant) return new Response("Not found", { status: 404 });

  // Create or retrieve Stripe Connect account
  let stripeAccountId = tenant.stripeAccountId;

  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "standard",
      email: session.user.email!,
      metadata: { tenantId: tenant.id },
    });
    stripeAccountId = account.id;
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { stripeAccountId },
    });
  }

  // Create onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${process.env.APP_URL}/settings/billing?refresh=true`,
    return_url: `${process.env.APP_URL}/settings/billing?success=true`,
    type: "account_onboarding",
  });

  return Response.json({ url: accountLink.url });
}
```

---

## Step 6: Custom Domain Setup

```typescript
// app/api/tenant/domain/route.ts
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export async function POST(request: Request) {
  const { domain } = await request.json();
  const session = await auth();

  // Validate domain ownership via DNS TXT record
  const txtRecord = await verifyDnsTxtRecord(domain);
  if (!txtRecord) {
    return Response.json(
      { error: "DNS TXT record not found. Add: `yoursaas-verify=<tenant-id>`" },
      { status: 400 }
    );
  }

  await prisma.tenant.update({
    where: { /* tenant from session */ },
    data: { customDomain: domain },
  });

  return Response.json({ ok: true });
}

async function verifyDnsTxtRecord(domain: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${domain}&type=TXT`
    );
    const data = await res.json();
    return data.Answer?.some((r: { data: string }) =>
      r.data.includes("yoursaas-verify=")
    );
  } catch {
    return false;
  }
}
```

---

## Step 7: Feature Flags Per Tenant

```typescript
// lib/features.ts
import { getCurrentTenant } from "./tenant";

const FEATURES = {
  advanced_analytics: ["agency_pro", "agency_enterprise"],
  white_label: ["agency_starter", "agency_pro", "agency_enterprise"],
  api_access: ["agency_enterprise"],
  custom_domain: ["agency_pro", "agency_enterprise"],
};

export async function hasFeature(feature: keyof typeof FEATURES): Promise<boolean> {
  const tenant = await getCurrentTenant();
  if (!tenant) return false;
  return FEATURES[feature].includes(tenant.planTier);
}
```

---

## Deployment Checklist

- [ ] Wildcard DNS: `*.yoursaas.com → your server`
- [ ] SSL wildcard cert (Let's Encrypt with DNS challenge)
- [ ] Stripe Connect webhook handler for `account.updated`
- [ ] Custom domain: Cloudflare proxied, SSL full strict
- [ ] Row-level security or tenant ID filtering on all DB queries

---

## Result

- ✅ Subdomain + custom domain routing
- ✅ CSS variable theming — logo, colors, fonts per tenant
- ✅ Stripe Connect: agency pays you, charges clients
- ✅ Feature flags based on plan tier
- ✅ Admin hierarchy: super-admin → agency-admin → clients

**Payoff:** One codebase serves unlimited agencies, each seeing their own brand, while you collect revenue from every seat.
