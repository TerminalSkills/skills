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
  - shadcn-ui
  - zod
  - authjs
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

Nadia built a project management SaaS with 200 paying customers. Three enterprise prospects each want the same product but with their own logo, colors, domain, and login page. Her current options: fork the codebase three times (maintenance nightmare) or tell them no ($180K/year in lost ARR). One prospect wants `projects.acmecorp.com` with their brand colors; another needs custom email templates with their compliance footer; the third requires feature flags to hide modules they didn't purchase.

Nadia needs:
- **Single codebase** serving unlimited tenants with unique branding
- **Custom domains** — each tenant's users see `app.clientdomain.com`, not her SaaS domain
- **Theme engine** — colors, logos, fonts, email templates per tenant
- **Feature flags per tenant** — premium modules enabled/disabled
- **Tenant-aware auth** — users authenticate against their tenant's config
- **Admin dashboard** for tenants to self-manage their branding

## Step 1: Tenant Configuration Schema

Each tenant's configuration defines their branding, domain, features, and auth settings.

```typescript
// src/lib/tenant-config.ts
// Defines the shape of a tenant's white-label configuration

import { z } from 'zod';

export const TenantTheme = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily: z.string().default('Inter'),
  borderRadius: z.enum(['none', 'sm', 'md', 'lg', 'full']).default('md'),
  logoUrl: z.string().url(),
  faviconUrl: z.string().url(),
  loginBackgroundUrl: z.string().url().optional(),
});

export const TenantFeatures = z.object({
  timeTracking: z.boolean().default(false),
  ganttChart: z.boolean().default(false),
  customFields: z.boolean().default(false),
  apiAccess: z.boolean().default(false),
  ssoEnabled: z.boolean().default(false),
  maxUsers: z.number().int().positive().default(25),
  maxProjects: z.number().int().positive().default(10),
  whiteLabel: z.boolean().default(false),   // meta: can they hide "Powered by"
});

export const TenantConfig = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  customDomain: z.string().optional(),       // e.g., "projects.acmecorp.com"
  theme: TenantTheme,
  features: TenantFeatures,
  emailFromName: z.string().default(''),
  emailFooterHtml: z.string().default(''),
  supportEmail: z.string().email().optional(),
  ssoConfig: z.object({
    provider: z.enum(['saml', 'oidc']).optional(),
    issuerUrl: z.string().url().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
  }).optional(),
  createdAt: z.string().datetime(),
});

export type TenantConfig = z.infer<typeof TenantConfig>;
export type TenantTheme = z.infer<typeof TenantTheme>;
export type TenantFeatures = z.infer<typeof TenantFeatures>;
```

## Step 2: Tenant Resolution Middleware

Every request must be resolved to a tenant before anything else happens. Resolution order: custom domain → subdomain → path prefix.

```typescript
// src/middleware/tenant-resolver.ts
// Resolves the current tenant from the request hostname or path

import { type NextRequest, NextResponse } from 'next/server';
import { getTenantByDomain, getTenantBySlug } from '@/lib/tenant-store';

export async function resolveTenant(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';
  const pathname = request.nextUrl.pathname;

  // 1. Try custom domain first (e.g., projects.acmecorp.com)
  let tenant = await getTenantByDomain(hostname);
  if (tenant) {
    return { tenant, rewrite: null };
  }

  // 2. Try subdomain (e.g., acmecorp.app.projecthub.io)
  const baseDomain = process.env.BASE_DOMAIN ?? 'app.projecthub.io';
  if (hostname.endsWith(`.${baseDomain}`)) {
    const slug = hostname.replace(`.${baseDomain}`, '');
    tenant = await getTenantBySlug(slug);
    if (tenant) {
      return { tenant, rewrite: null };
    }
  }

  // 3. Try path prefix (e.g., /t/acmecorp/dashboard)
  const pathMatch = pathname.match(/^\/t\/([a-z0-9-]+)(\/.*)?$/);
  if (pathMatch) {
    tenant = await getTenantBySlug(pathMatch[1]);
    if (tenant) {
      // Rewrite to remove the /t/slug prefix
      const rewrite = pathMatch[2] ?? '/';
      return { tenant, rewrite };
    }
  }

  return { tenant: null, rewrite: null };
}
```

```typescript
// src/lib/tenant-store.ts
// Caches tenant configs in Redis with 5-minute TTL

import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { TenantConfig } from './tenant-config';

const redis = new Redis(process.env.REDIS_URL!);
const prisma = new PrismaClient();
const CACHE_TTL = 300;  // 5 minutes

export async function getTenantByDomain(domain: string): Promise<TenantConfig | null> {
  // Check cache first
  const cached = await redis.get(`tenant:domain:${domain}`);
  if (cached) return JSON.parse(cached);

  const row = await prisma.tenant.findFirst({
    where: { customDomain: domain, active: true },
  });
  if (!row) return null;

  const config = mapToConfig(row);
  await redis.setex(`tenant:domain:${domain}`, CACHE_TTL, JSON.stringify(config));
  return config;
}

export async function getTenantBySlug(slug: string): Promise<TenantConfig | null> {
  const cached = await redis.get(`tenant:slug:${slug}`);
  if (cached) return JSON.parse(cached);

  const row = await prisma.tenant.findFirst({
    where: { slug, active: true },
  });
  if (!row) return null;

  const config = mapToConfig(row);
  await redis.setex(`tenant:slug:${slug}`, CACHE_TTL, JSON.stringify(config));
  return config;
}

// Invalidate cache when tenant updates their config
export async function invalidateTenantCache(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return;

  await redis.del(`tenant:slug:${tenant.slug}`);
  if (tenant.customDomain) {
    await redis.del(`tenant:domain:${tenant.customDomain}`);
  }
}

function mapToConfig(row: any): TenantConfig {
  return TenantConfig.parse({
    id: row.id,
    slug: row.slug,
    name: row.name,
    customDomain: row.customDomain,
    theme: row.theme,
    features: row.features,
    emailFromName: row.emailFromName,
    emailFooterHtml: row.emailFooterHtml,
    supportEmail: row.supportEmail,
    ssoConfig: row.ssoConfig,
    createdAt: row.createdAt.toISOString(),
  });
}
```

## Step 3: Dynamic Theme Provider

CSS custom properties injected at the layout level let every component inherit tenant branding without prop drilling.

```typescript
// src/components/theme-provider.tsx
// Injects tenant theme as CSS custom properties

'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { TenantConfig, TenantTheme } from '@/lib/tenant-config';

const TenantContext = createContext<TenantConfig | null>(null);

export function useTenant(): TenantConfig {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}

export function useFeature(feature: keyof TenantConfig['features']): boolean {
  const tenant = useTenant();
  return Boolean(tenant.features[feature]);
}

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: TenantConfig;
  children: ReactNode;
}) {
  const cssVars = themeToCssVars(tenant.theme);

  return (
    <TenantContext.Provider value={tenant}>
      <div style={cssVars as React.CSSProperties}>
        {children}
      </div>
    </TenantContext.Provider>
  );
}

function themeToCssVars(theme: TenantTheme): Record<string, string> {
  return {
    '--color-primary': theme.primaryColor,
    '--color-secondary': theme.secondaryColor,
    '--color-accent': theme.accentColor,
    '--color-background': theme.backgroundColor,
    '--color-text': theme.textColor,
    '--font-family': theme.fontFamily,
    '--radius': radiusMap[theme.borderRadius],
  };
}

const radiusMap: Record<string, string> = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  full: '9999px',
};
```

```css
/* src/app/globals.css */
/* All components reference CSS variables — theme changes propagate automatically */

:root {
  --color-primary: #3b82f6;
  --color-secondary: #64748b;
  --color-accent: #f59e0b;
  --color-background: #ffffff;
  --color-text: #0f172a;
  --font-family: 'Inter', sans-serif;
  --radius: 8px;
}

body {
  font-family: var(--font-family);
  background-color: var(--color-background);
  color: var(--color-text);
}

.btn-primary {
  background-color: var(--color-primary);
  border-radius: var(--radius);
}

.btn-secondary {
  background-color: var(--color-secondary);
  border-radius: var(--radius);
}

.accent-border {
  border-color: var(--color-accent);
}
```

## Step 4: Feature-Gated Components

Modules appear or disappear based on the tenant's purchased features.

```typescript
// src/components/feature-gate.tsx
// Conditionally renders children based on tenant feature flags

'use client';

import { useFeature } from './theme-provider';
import type { TenantConfig } from '@/lib/tenant-config';

export function FeatureGate({
  feature,
  children,
  fallback = null,
}: {
  feature: keyof TenantConfig['features'];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const enabled = useFeature(feature);
  return enabled ? <>{children}</> : <>{fallback}</>;
}
```

```typescript
// src/app/(dashboard)/project/[id]/page.tsx
// Project page with feature-gated modules

import { FeatureGate } from '@/components/feature-gate';
import { TaskBoard } from '@/components/task-board';
import { GanttChart } from '@/components/gantt-chart';
import { TimeTracker } from '@/components/time-tracker';
import { UpgradeBanner } from '@/components/upgrade-banner';

export default function ProjectPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      {/* Always available */}
      <TaskBoard projectId={params.id} />

      {/* Only for tenants with Gantt enabled */}
      <FeatureGate
        feature="ganttChart"
        fallback={<UpgradeBanner feature="Gantt Charts" />}
      >
        <GanttChart projectId={params.id} />
      </FeatureGate>

      {/* Only for tenants with time tracking */}
      <FeatureGate feature="timeTracking">
        <TimeTracker projectId={params.id} />
      </FeatureGate>
    </div>
  );
}
```

## Step 5: Custom Domain SSL with Caddy

Each tenant's custom domain needs a valid SSL certificate. Caddy handles this automatically via ACME.

```typescript
// src/lib/domain-manager.ts
// Manages custom domain registration and SSL provisioning

import { PrismaClient } from '@prisma/client';
import { invalidateTenantCache } from './tenant-store';

const prisma = new PrismaClient();

export async function registerCustomDomain(
  tenantId: string,
  domain: string
): Promise<{ success: boolean; instructions: string[] }> {
  // Verify domain ownership via DNS
  const verified = await verifyDomainDns(domain, tenantId);
  if (!verified) {
    return {
      success: false,
      instructions: [
        `Add a CNAME record: ${domain} → app.projecthub.io`,
        `Or add a TXT record: _projecthub.${domain} → verify=${tenantId}`,
        'DNS changes can take up to 48 hours to propagate.',
      ],
    };
  }

  // Store domain mapping
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { customDomain: domain },
  });

  // Notify Caddy to provision SSL (via admin API)
  await provisionSsl(domain);

  // Clear cache so new domain resolves immediately
  await invalidateTenantCache(tenantId);

  return { success: true, instructions: [] };
}

async function verifyDomainDns(domain: string, tenantId: string): Promise<boolean> {
  const { resolve } = await import('dns/promises');
  try {
    // Check CNAME
    const cnames = await resolve(domain, 'CNAME').catch(() => []);
    if (cnames.some((c: string) => c.includes('projecthub.io'))) return true;

    // Check TXT verification record
    const txts = await resolve(`_projecthub.${domain}`, 'TXT').catch(() => []);
    const flat = txts.flat();
    return flat.some((t: string) => t === `verify=${tenantId}`);
  } catch {
    return false;
  }
}

async function provisionSsl(domain: string): Promise<void> {
  // Caddy's admin API auto-provisions Let's Encrypt certs
  await fetch('http://localhost:2019/config/apps/http/servers/srv0/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      match: [{ host: [domain] }],
      handle: [{
        handler: 'reverse_proxy',
        upstreams: [{ dial: 'localhost:3000' }],
      }],
    }),
  });
}
```

## Step 6: Tenant Admin Dashboard

Tenants manage their own branding through a self-service dashboard.

```typescript
// src/app/(admin)/settings/branding/page.tsx
// Self-service branding editor for tenant admins

'use client';

import { useState } from 'react';
import { useTenant } from '@/components/theme-provider';

export default function BrandingSettings() {
  const tenant = useTenant();
  const [theme, setTheme] = useState(tenant.theme);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/admin/tenant/${tenant.id}/theme`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(theme),
    });
    if (res.ok) {
      // Theme applies on next page load (cache invalidated server-side)
      window.location.reload();
    }
    setSaving(false);
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Branding</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Colors</h2>
        <div className="grid grid-cols-2 gap-4">
          <ColorPicker
            label="Primary"
            value={theme.primaryColor}
            onChange={(c) => setTheme({ ...theme, primaryColor: c })}
          />
          <ColorPicker
            label="Secondary"
            value={theme.secondaryColor}
            onChange={(c) => setTheme({ ...theme, secondaryColor: c })}
          />
          <ColorPicker
            label="Accent"
            value={theme.accentColor}
            onChange={(c) => setTheme({ ...theme, accentColor: c })}
          />
          <ColorPicker
            label="Background"
            value={theme.backgroundColor}
            onChange={(c) => setTheme({ ...theme, backgroundColor: c })}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Logo</h2>
        <LogoUploader
          currentUrl={theme.logoUrl}
          onUpload={(url) => setTheme({ ...theme, logoUrl: url })}
        />
      </section>

      {/* Live preview with the edited theme */}
      <section className="border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Preview</h2>
        <div style={{
          '--color-primary': theme.primaryColor,
          '--color-secondary': theme.secondaryColor,
          '--color-accent': theme.accentColor,
        } as React.CSSProperties}>
          <button className="btn-primary px-4 py-2 text-white rounded">
            Primary Button
          </button>
          <button className="btn-secondary px-4 py-2 text-white rounded ml-2">
            Secondary
          </button>
        </div>
      </section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary px-6 py-2 text-white rounded"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-10 rounded cursor-pointer"
      />
      <span>{label}</span>
      <code className="text-sm text-gray-500">{value}</code>
    </label>
  );
}

function LogoUploader({ currentUrl, onUpload }: {
  currentUrl: string; onUpload: (url: string) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <img src={currentUrl} alt="Logo" className="h-12" />
      <input
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const form = new FormData();
          form.append('file', file);
          const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
          const { url } = await res.json();
          onUpload(url);
        }}
      />
    </div>
  );
}
```

## Results

After launching white-label to the three enterprise prospects:

- **$180K ARR added** from three enterprise contracts ($5K/month each)
- **Single codebase** — zero forks, zero divergence, one CI/CD pipeline
- **Tenant onboarding** takes 15 minutes — create config, point DNS, done
- **Custom domain SSL** provisioned automatically via Caddy — no manual cert management
- **Theme changes** are live in <5 seconds (Redis cache invalidation + page reload)
- **Feature gate overhead**: 0.2ms per check — negligible impact on page load
- **Two more enterprise prospects** signed after seeing the white-label demo
- **Support tickets** dropped 40% — tenants self-manage branding instead of requesting changes
