---
name: next-intl
description: >-
  next-intl adds internationalization to Next.js App Router apps: locale-prefixed
  routing, ICU message translation, and locale-aware date, number and list
  formatting in Server and Client Components. Use when the user asks to add
  multi-language support, translate a Next.js site, set up /de or /fr routes,
  switch language, or format dates and plurals per locale.
license: Apache-2.0
compatibility: 'Next.js App Router (next-intl 4.x supports Next.js 12-16 and React 16.8-19)'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/amannn/next-intl
  category: development
  tags: [i18n, next-intl, nextjs, localization, internationalization]
---

# next-intl

## Overview

next-intl (4.x) is an i18n library for the Next.js App Router. It provides locale routing through a proxy/middleware, JSON messages with ICU syntax (variables, plurals, dates), and hooks that work in Server and Client Components. Setup is four small files plus a `[locale]` route segment.

## Instructions

### Step 1: Install and configure the plugin

```bash
npm install next-intl
```

```typescript
// next.config.ts
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {}
const withNextIntl = createNextIntlPlugin() // finds ./src/i18n/request.ts or ./i18n/request.ts
export default withNextIntl(nextConfig)
```

### Step 2: Routing, request config, navigation

```typescript
// src/i18n/routing.ts
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'de', 'fr', 'ja'],
  defaultLocale: 'en',
  localePrefix: 'as-needed', // /about for en, /de/about for the rest; default is 'always'
})
```

```typescript
// src/i18n/request.ts
import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
```

```typescript
// src/i18n/navigation.ts — locale-aware replacements for next/link and next/navigation
import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
```

### Step 3: Proxy (Next.js 16) or middleware (Next.js 15 and earlier)

The file is `src/proxy.ts` on Next.js 16 and was `src/middleware.ts` before. The content is the same:

```typescript
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  // skip api, trpc, _next, _vercel and anything with a dot (favicon.ico)
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
}
```

### Step 4: Messages and the `[locale]` layout

Create `messages/en.json`:

```json
{
  "HomePage": {
    "title": "Welcome to {appName}",
    "teams": "Trusted by {count, plural, one {# team} other {# teams}}",
    "cta": "Get started"
  },
  "Dashboard": { "lastLogin": "Last login: {date, date, medium}" }
}
```

Move all pages under `src/app/[locale]/`. In Next.js 15+ `params` is a Promise:

```tsx
// src/app/[locale]/layout.tsx
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale) // enables static rendering; also call it in each page
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
```

`NextIntlClientProvider` with no props passes the server's locale and messages to Client Components.

### Step 5: Use translations

```tsx
// src/app/[locale]/page.tsx — async Server Component
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('HomePage')
  return (
    <main>
      <h1>{t('title', { appName: 'Northwind' })}</h1>
      <p>{t('teams', { count: 5000 })}</p>
      <Link href="/signup">{t('cta')}</Link>
    </main>
  )
}
```

In a non-async component, or a Client Component marked `'use client'`, call `useTranslations('HomePage')` instead. `useFormatter()` / `getFormatter()` give `format.dateTime(date, { dateStyle: 'medium' })` and `format.number(1999.5, { style: 'currency', currency: 'EUR' })`.

## Examples

**"Add German to my Next.js site."** Add `'de'` to `locales` in `routing.ts`, create `messages/de.json` with the same keys as `en.json`, then run `npm run dev` and open `/de`. The page renders the German strings, and `<Link href="/signup">` points to `/de/signup` there.

**"Add a language switcher."** In a Client Component:

```tsx
'use client'
import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'

export function LocaleSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  return (
    <select value={locale} onChange={(e) => router.replace(pathname, { locale: e.target.value })}>
      {['en', 'de', 'fr', 'ja'].map((l) => <option key={l}>{l}</option>)}
    </select>
  )
}
```

Choosing `de` navigates to `/de` plus the current path and keeps the user on the current route.

## Guidelines

- Import `Link`, `redirect`, `useRouter` and `usePathname` from your `i18n/navigation.ts`, not from `next/link` or `next/navigation`, or links lose the locale prefix.
- Call `setRequestLocale(locale)` in every layout and page that should render statically, after validating the locale, and before any `useTranslations` call.
- With `localePrefix: 'as-needed'` the matcher must also match unprefixed paths; the default matcher above does. A request for `/en/about` redirects to `/about`.
- Pathnames containing a dot (`/users/jane.doe`) are excluded by the matcher; add an explicit extra matcher entry for them.
- Keep message keys namespaced by page or component, and keep the same keys in every locale file; a missing key logs an error and renders the key name.
- Plurals use ICU: `{count, plural, one {# item} other {# items}}`. Some languages (Polish, Arabic) need more categories such as `few` and `many`.
- Only messages used by Client Components need to reach the browser; pass a subset with `<NextIntlClientProvider messages={...}>` to keep the bundle small.
- The `localePrefix` default is `'always'`. Do not rely on `'as-needed'` unless you set it.
