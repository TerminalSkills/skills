---
name: next-intl
description: >-
  Internationalize Next.js apps with next-intl. Use when adding multi-language
  support, locale routing, date/number formatting, or translating UI content.
license: Apache-2.0
compatibility: 'Next.js 13+ (App Router)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frontend
  tags: [i18n, next-intl, nextjs, localization, internationalization]
---

# next-intl

## Overview

next-intl is the leading i18n library for Next.js App Router. It handles locale routing, message translation, date/number formatting, and works with both server and client components. ICU message syntax for plurals and variables.

## Instructions

### Step 1: Setup

```bash
npm install next-intl
```

```typescript
// i18n/request.ts — Locale detection
import { getRequestConfig } from 'next-intl/server'

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale || 'en'
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
```

```json
// messages/en.json
{
  "HomePage": {
    "title": "Welcome to {appName}",
    "description": "The best tool for {count, plural, one {# team} other {# teams}}",
    "cta": "Get Started"
  },
  "Dashboard": {
    "greeting": "Hello, {name}",
    "lastLogin": "Last login: {date, date, medium}"
  }
}
```

```json
// messages/de.json
{
  "HomePage": {
    "title": "Willkommen bei {appName}",
    "description": "Das beste Tool für {count, plural, one {# Team} other {# Teams}}",
    "cta": "Jetzt starten"
  }
}
```

### Step 2: Server Components

```typescript
// app/[locale]/page.tsx — Translated server component
import { useTranslations } from 'next-intl'

export default function HomePage() {
  const t = useTranslations('HomePage')

  return (
    <main>
      <h1>{t('title', { appName: 'MyApp' })}</h1>
      <p>{t('description', { count: 5000 })}</p>
      <a href="/signup">{t('cta')}</a>
    </main>
  )
}
```

### Step 3: Middleware Routing

```typescript
// middleware.ts — Locale routing
import createMiddleware from 'next-intl/middleware'

export default createMiddleware({
  locales: ['en', 'de', 'fr', 'ja'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',        // /de/about but /about (for en)
})

export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] }
```

## Guidelines

- ICU message syntax: `{count, plural, one {# item} other {# items}}` for plurals.
- Server components: use `useTranslations()` directly, no context needed.
- Client components: wrap with `NextIntlClientProvider`.
- Keep message keys namespaced by page/component for maintainability.
- Use `localePrefix: 'as-needed'` to avoid /en/ prefix for default locale.
