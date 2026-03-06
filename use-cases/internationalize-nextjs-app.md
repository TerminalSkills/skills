---
title: Internationalize a Next.js App for Global Markets
slug: internationalize-nextjs-app
description: >-
  Add multi-language support to a Next.js SaaS with locale routing,
  translated content, date/currency formatting, RTL layout, and accessible
  language switching.
skills:
  - next-intl
  - i18next
  - react-ariacategory: development
tags:
  - i18n
  - nextjs
  - localization
  - accessibility
  - global
---

# Internationalize a Next.js App for Global Markets

Yuki's productivity SaaS has 40% of traffic from non-English countries — Germany, Japan, Brazil, France — but the app is English-only. Support tickets in broken English confirm what analytics show: users struggle with the interface. The team decides to launch in 5 languages to capture the international market.

## Step 1: Project Structure

```text
app/
├── [locale]/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   └── settings/
│       └── page.tsx
├── api/
messages/
├── en.json
├── de.json
├── ja.json
├── pt-BR.json
└── fr.json
middleware.ts
i18n/
└── request.ts
```

## Step 2: Locale Routing

next-intl's middleware handles locale detection and routing automatically.

```typescript
// middleware.ts — Detect locale, redirect, set cookie
import createMiddleware from 'next-intl/middleware'
import { locales, defaultLocale } from './i18n/config'

export default createMiddleware({
  locales: ['en', 'de', 'ja', 'pt-BR', 'fr'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',    // /de/dashboard but /dashboard (for en)
  localeDetection: true,         // detect from Accept-Language header
})

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
}
```

```typescript
// i18n/request.ts — Load messages for the current locale
import { getRequestConfig } from 'next-intl/server'

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale || 'en'
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: 'UTC',
    now: new Date(),
  }
})
```

## Step 3: Translation Messages

```json
// messages/en.json
{
  "Nav": {
    "dashboard": "Dashboard",
    "projects": "Projects",
    "settings": "Settings"
  },
  "Dashboard": {
    "welcome": "Welcome back, {name}",
    "stats": {
      "projects": "You have {count, plural, one {# active project} other {# active projects}}",
      "tasks": "{completed} of {total} tasks completed",
      "streak": "{days}-day streak 🔥"
    },
    "recentActivity": "Recent Activity",
    "noActivity": "No recent activity. Start a task to get going!"
  },
  "Common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "confirm": "Are you sure?",
    "loading": "Loading..."
  }
}
```

```json
// messages/ja.json
{
  "Nav": {
    "dashboard": "ダッシュボード",
    "projects": "プロジェクト",
    "settings": "設定"
  },
  "Dashboard": {
    "welcome": "おかえりなさい、{name}さん",
    "stats": {
      "projects": "アクティブなプロジェクト: {count}件",
      "tasks": "{total}件中{completed}件のタスク完了",
      "streak": "{days}日間連続 🔥"
    },
    "recentActivity": "最近のアクティビティ",
    "noActivity": "最近のアクティビティはありません。タスクを始めましょう！"
  }
}
```

## Step 4: Translated Components

```tsx
// app/[locale]/dashboard/page.tsx — Server component with translations
import { useTranslations, useFormatter } from 'next-intl'

export default function DashboardPage() {
  const t = useTranslations('Dashboard')
  const format = useFormatter()

  const stats = { projects: 12, completed: 87, total: 120, streak: 14 }

  return (
    <main>
      <h1>{t('welcome', { name: 'Yuki' })}</h1>

      <div className="stats-grid">
        <StatCard label={t('stats.projects', { count: stats.projects })} />
        <StatCard label={t('stats.tasks', {
          completed: stats.completed,
          total: stats.total,
        })} />
        <StatCard label={t('stats.streak', { days: stats.streak })} />
      </div>

      {/* Date formatting adapts to locale automatically */}
      <p>{format.dateTime(new Date(), { dateStyle: 'long' })}</p>
      {/* en: "February 20, 2026" */}
      {/* ja: "2026年2月20日" */}
      {/* de: "20. Februar 2026" */}

      <p>{format.number(1234.56, { style: 'currency', currency: 'USD' })}</p>
      {/* en: "$1,234.56" */}
      {/* de: "1.234,56 $" */}
      {/* ja: "$1,234.56" */}
    </main>
  )
}
```

## Step 5: Accessible Language Switcher

```tsx
// components/LanguageSwitcher.tsx — Accessible locale picker
'use client'
import { useLocale } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import { Select, Label, Button, SelectValue, Popover, ListBox, ListBoxItem } from 'react-aria-components'

const languages = [
  { id: 'en', name: 'English', flag: '🇺🇸' },
  { id: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { id: 'ja', name: '日本語', flag: '🇯🇵' },
  { id: 'pt-BR', name: 'Português', flag: '🇧🇷' },
  { id: 'fr', name: 'Français', flag: '🇫🇷' },
]

export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  return (
    <Select
      selectedKey={locale}
      onSelectionChange={(key) => {
        // Replace locale segment in URL
        const segments = pathname.split('/')
        segments[1] = key as string
        router.push(segments.join('/'))
      }}
      aria-label="Select language"
    >
      <Label className="sr-only">Language</Label>
      <Button>
        <SelectValue>{languages.find(l => l.id === locale)?.flag} {languages.find(l => l.id === locale)?.name}</SelectValue>
      </Button>
      <Popover>
        <ListBox>
          {languages.map(lang => (
            <ListBoxItem key={lang.id} id={lang.id}>
              {lang.flag} {lang.name}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  )
}
```

## Results

Within 3 months of launching in 5 languages, international signups increase by 65%. Japanese and German users show 40% higher retention than before (they previously churned at 2x the rate of English users). Support tickets in non-English drop by 70% — users can now navigate the app in their language. The ICU plural syntax handles Japanese (no plurals), German (different plural rules), and Portuguese correctly without special-casing. The React Aria language switcher is fully keyboard-accessible — screen reader users can navigate it with arrow keys, and the current language is announced. SEO improves as each locale gets its own URL path (`/de/pricing`, `/ja/features`), with hreflang tags telling Google which page to show in each country.
