---
name: i18next
description: >-
  Internationalize JavaScript apps with i18next, the translation framework behind react-i18next.
  Use when adding translations, handling plurals, formatting numbers and currencies, loading
  locale files by namespace, detecting the user's language, or i18n for React, Node.js and
  vanilla JS.
license: Apache-2.0
compatibility: 'Current Node.js LTS or a modern browser; React 16.8+ for react-i18next; TypeScript 5+ optional'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/i18next/i18next"
  category: development
  tags: [i18next, i18n, localization, translations, react-i18next]
---

# i18next

## Overview

i18next is a framework-independent i18n library for JavaScript: namespaces, lazy loading, plurals (through `Intl.PluralRules`), interpolation, built-in formatting (numbers, currency, dates), context and backend plugins. React uses it through `react-i18next`. Current majors: `i18next` 26, `react-i18next` 17, `i18next-http-backend` 4, `i18next-browser-languagedetector` 8, `i18next-fs-backend` 2.

## Instructions

### Step 1: Install

```bash
npm install i18next react-i18next i18next-http-backend i18next-browser-languagedetector
```

For Node.js (server, CLI, tests) use `i18next-fs-backend` instead of the HTTP backend. Locale files live at `public/locales/<lng>/<namespace>.json`.

### Step 2: React setup (`src/i18n.ts`, imported once before rendering)

```typescript
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'de', 'fr', 'ja'],
    ns: ['common', 'dashboard'],
    defaultNS: 'common',
    backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' },
    detection: { order: ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag'] },
  })

export default i18n
```

Namespaces load over HTTP, so components suspend until their namespace arrives; wrap the app in `<Suspense>` (or set `react: { useSuspense: false }` and check `ready` from `useTranslation`).

### Step 3: Use translations

```tsx
import { useTranslation, Trans } from 'react-i18next'

function Dashboard() {
  const { t, i18n } = useTranslation('dashboard')
  return (
    <div>
      <h1>{t('welcome', { name: 'Alice' })}</h1>
      <p>{t('projects', { count: 5 })}</p>
      <Trans i18nKey="terms">Agree to <a href="/terms">Terms</a>.</Trans>
      <button onClick={() => i18n.changeLanguage('de')}>Deutsch</button>
    </div>
  )
}
```

`public/locales/en/dashboard.json`:

```json
{
  "welcome": "Welcome back, {{name}}!",
  "projects_one": "You have {{count}} project",
  "projects_other": "You have {{count}} projects",
  "total": "Total: {{amount, currency(USD)}}",
  "terms": "Agree to <1>Terms</1>."
}
```

Plural keys use the CLDR category as suffix (`_one`, `_other`; languages like Russian also need `_few` and `_many`, Arabic adds `_zero` and `_two`). Always pass `count`. `{{amount, currency(USD)}}` uses the built-in `Intl` formatters (`number`, `currency`, `datetime`, `relativetime`, `list`).

### Step 4: Node.js without React

The snippet uses top-level `await`, so run it as an ES module (`.mjs` file or `"type": "module"`).

```javascript
import i18n from 'i18next'
import Backend from 'i18next-fs-backend'

await i18n.use(Backend).init({
  lng: 'de',
  fallbackLng: 'en',
  ns: ['dashboard'],
  defaultNS: 'dashboard',
  backend: { loadPath: './locales/{{lng}}/{{ns}}.json' },
})
i18n.t('welcome', { name: 'Alice' })          // per-request: i18n.getFixedT('en')('welcome', ...)
```

`init()` returns a promise; await it before calling `t`. In a server shared by many users never call `changeLanguage` per request; use `i18n.getFixedT(lng)` or `i18n.cloneInstance({ lng })`.

### Migrating from older versions

`initImmediate` is now `initAsync` (v24; the alias was removed in v26). The old function form of `interpolation.format` was removed in v26: use the `{{value, formatName}}` syntax with built-in or custom formatters. v4 JSON format only (v3 `_plural` suffixes are gone); convert with `i18next-v4-format-converter`.

## Examples

### Example 1: Add German to a React app

**User request:** "Add German and a language switcher to our dashboard"

Add `'de'` to `supportedLngs`, create `public/locales/de/dashboard.json` with the same keys (`welcome`, `projects_one`, `projects_other`), and call `i18n.changeLanguage('de')` from the switcher. With German active the page shows "Willkommen zurück, Alice!" and "Du hast 5 Projekte"; a key missing in German falls back to English. The detector stores the choice in `localStorage` (its default `caches: ['localStorage']`; add `'cookie'` to share it with a server), so it survives reloads.

### Example 2: Russian plurals and currency in a Node script

**User request:** "Print project counts in Russian for 1, 3 and 5"

With `projects_one`, `projects_few`, `projects_many` and `projects_other` in `locales/ru/dashboard.json` and `lng: 'ru'`, `[1, 3, 5].map(n => i18n.t('projects', { count: n }))` returns `1 проект`, `3 проекта`, `5 проектов`. In English, `t('total', { amount: 1234.5 })` returns `Total: $1,234.50`.

## Guidelines

- Split translations into namespaces by feature and load them on demand with `useTranslation('ns')`; do not load everything on start.
- Keep keys stable and descriptive; a missing key renders as the key itself, so test every locale for it (`saveMissing` can report them to the backend in development).
- Use `<Trans>` only for text with embedded markup; plain strings use `t`.
- Do not build sentences by concatenating translated pieces; word order differs between languages. Use interpolation.
- Interpolation escapes HTML by default (`escapeValue: true`). React already escapes, so `react-i18next` setups usually set `interpolation: { escapeValue: false }`; keep it on for any output that is written as raw HTML.
- Server rendering: initialise one instance per request (or use `getFixedT`) and send the same language and resources to the client, otherwise hydration mismatches appear.
- Restrict `supportedLngs` to languages you ship; the detector may report others.
