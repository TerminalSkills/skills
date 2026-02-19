---
name: next-intl
description: >-
  Assists with adding internationalization to Next.js applications using next-intl. Use when
  configuring locale routing, managing translation messages, handling pluralization and
  date/number formatting, or building localized apps with App Router and Server Components.
  Trigger words: next-intl, i18n, internationalization, translations, locale, pluralization.
license: Apache-2.0
compatibility: "Requires Next.js 13+ with App Router"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["next-intl", "i18n", "internationalization", "nextjs", "localization"]
---

# next-intl

## Overview

next-intl is an internationalization library for Next.js App Router that provides locale-based routing, JSON translation messages with ICU format support (plurals, selects, rich text), locale-aware date/number formatting, and Server Component integration where messages stay on the server with zero client-side JavaScript overhead.

## Instructions

- When setting up routing, add a `[locale]` dynamic segment to the app directory, configure middleware for locale detection (URL, Accept-Language, cookie), and use `createNavigation()` for locale-aware `Link`, `redirect`, and `useRouter`.
- When managing translations, organize JSON messages by feature (`{ "auth": {...}, "dashboard": {...} }`) with semantic keys, and use ICU message format for plurals, gender selects, and interpolation.
- When translating in Server Components, use `getTranslations("namespace")` for zero client-side JS; in Client Components, use `useTranslations("namespace")` with `NextIntlClientProvider`.
- When formatting values, use `format.number()` for locale-aware currency and numbers, `format.dateTime()` for dates, and `format.relativeTime()` for relative timestamps, since locale formatting rules vary significantly.
- When adding rich text, use `t.rich()` with tag functions for bold, links, and custom components within translated strings.
- When optimizing SEO, configure alternate `hreflang` links via next-intl's routing, and use `getTranslations` in `generateMetadata` for localized page titles and descriptions.

## Examples

### Example 1: Add multi-language support to a Next.js SaaS app

**User request:** "Add English, German, and Japanese translations to my Next.js app"

**Actions:**
1. Set up `[locale]` routing with middleware for locale detection and default locale without prefix
2. Create `messages/en.json`, `messages/de.json`, and `messages/ja.json` with nested namespaces
3. Use `getTranslations()` in Server Components for page content and navigation
4. Add locale-aware number and date formatting for dashboards and reports

**Output:** A multi-language SaaS app with locale routing, translated content, and properly formatted numbers and dates.

### Example 2: Implement pluralization and rich text in notifications

**User request:** "Add translated notification messages with proper pluralization"

**Actions:**
1. Define ICU message strings: `"{count, plural, =0 {No new notifications} one {# notification} other {# notifications}}"`
2. Add rich text for actionable notifications: `"Click <link>here</link> to view"`
3. Use `t("notifications.count", { count })` and `t.rich("notifications.action", { link: (chunks) => <Link>...</Link> })`
4. Format timestamps with `format.relativeTime()` for "3 hours ago" style display

**Output:** Properly pluralized, locale-aware notification messages with embedded links and relative timestamps.

## Guidelines

- Use Server Components for translations when possible since messages stay on the server with zero client JS.
- Structure messages by feature or page, not as one flat file, for maintainability.
- Use ICU message format for plurals; never use conditional logic like `count === 1 ? "item" : "items"` in code.
- Use `format.number()` and `format.dateTime()` for all displayed numbers and dates since locale formatting is non-trivial.
- Set up middleware for automatic locale detection so users see their language without manual selection.
- Keep translation keys semantic (`"auth.loginButton"` not `"button1"`) so translators have context.
