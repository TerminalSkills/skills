---
title: "Build a Localization System for Your SaaS"
description: "Add 5 languages to your Next.js SaaS in 2 weeks: i18n routing, AI-powered translation with Claude, pluralization, date/number formatting, and RTL support."
skills: [anthropic-sdk]
difficulty: intermediate
time_estimate: "10 hours"
tags: [i18n, localization, next.js, translation, ai-translation, rtl, saas, internationalization]
---

# Build a Localization System for Your SaaS

Your EU expansion requires French, German, Spanish, and Arabic. Human translation agencies quote 3 months and $40k. AI-assisted translation with human review gets you there in 2 weeks for under $500.

## Persona

**Elena** is the product lead at a B2B SaaS. They just closed their first German enterprise deal — contingent on a German interface by Q1. She has 2 weeks, 1 developer, and 800 translation keys.

---

## Architecture

```
Next.js App Router
  ├── /en  ← default
  ├── /fr
  ├── /de
  ├── /es
  └── /ar  ← RTL

Translation files: public/locales/{lang}/common.json
AI pipeline: new strings → Claude → review queue → approved
```

---

## Step 1: Next.js i18n Routing Setup

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  i18n: {
    locales: ['en', 'fr', 'de', 'es', 'ar'],
    defaultLocale: 'en',
    localeDetection: true,
  },
};

export default nextConfig;
```

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/api/', '/_next/', '/favicon'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next();

  // Respect explicit locale in path
  const hasLocale = /^\/(en|fr|de|es|ar)(\/|$)/.test(pathname);
  if (hasLocale) return NextResponse.next();

  // Auto-detect from Accept-Language
  const acceptLang = req.headers.get('accept-language') ?? '';
  const preferred = acceptLang.split(',')[0].split('-')[0];
  const locale = ['en', 'fr', 'de', 'es', 'ar'].includes(preferred)
    ? preferred : 'en';

  return NextResponse.redirect(new URL(`/${locale}${pathname}`, req.url));
}
```

---

## Step 2: Translation File Structure

```json
// public/locales/en/common.json
{
  "nav": {
    "dashboard": "Dashboard",
    "settings": "Settings",
    "billing": "Billing"
  },
  "billing": {
    "plan": "{{plan}} Plan",
    "seats": "{{count}} seat",
    "seats_plural": "{{count}} seats",
    "trial_ends": "Trial ends in {{days}} days",
    "upgrade_cta": "Upgrade to {{plan}}"
  },
  "errors": {
    "required": "This field is required",
    "email_invalid": "Please enter a valid email"
  }
}
```

```typescript
// lib/i18n.ts — lightweight hook, no heavy library needed
import { useRouter } from 'next/router';

type Params = Record<string, string | number>;

export function useTranslation(namespace = 'common') {
  const { locale } = useRouter();
  const [messages, setMessages] = useState<Record<string, unknown>>({});

  useEffect(() => {
    import(`../public/locales/${locale}/${namespace}.json`)
      .then(m => setMessages(m.default));
  }, [locale, namespace]);

  function t(key: string, params?: Params, count?: number): string {
    const keys = key.split('.');
    let value: unknown = messages;

    for (const k of keys) value = (value as Record<string, unknown>)?.[k];

    // Pluralization
    if (count !== undefined) {
      const pluralKey = count === 1 ? key : `${key}_plural`;
      const pluralKeys = pluralKey.split('.');
      let plural: unknown = messages;
      for (const k of pluralKeys) plural = (plural as Record<string, unknown>)?.[k];
      if (plural) value = plural;
      params = { ...params, count };
    }

    let result = (value as string) ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(`{{${k}}}`, String(v));
      });
    }
    return result;
  }

  return { t, locale };
}
```

---

## Step 3: AI Translation Pipeline with Claude

```typescript
// scripts/translate-missing.ts
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const anthropic = new Anthropic();
const LOCALES = ['fr', 'de', 'es', 'ar'];
const LOCALES_DIR = path.join(process.cwd(), 'public/locales');

function flattenKeys(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.entries(obj).reduce((acc, [key, val]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && val !== null) {
      Object.assign(acc, flattenKeys(val as Record<string, unknown>, fullKey));
    } else {
      acc[fullKey] = val as string;
    }
    return acc;
  }, {} as Record<string, string>);
}

async function translateBatch(
  strings: Record<string, string>,
  targetLocale: string,
  targetLanguage: string
): Promise<Record<string, string>> {
  const entries = Object.entries(strings);
  const input = entries.map(([k, v]) => `${k}: ${v}`).join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Translate these UI strings to ${targetLanguage}.

Rules:
- Keep {{variable}} placeholders exactly as-is
- Keep the "key: value" format
- For plural forms, add a key_plural entry when the original has _plural
- Maintain the same tone (professional SaaS product)
- For RTL languages, ensure natural phrasing

Strings to translate:
${input}

Return only the translated key: value pairs.`,
    }],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  return responseText.split('\n').reduce((acc, line) => {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (key && value) acc[key] = value;
    }
    return acc;
  }, {} as Record<string, string>);
}

async function main() {
  const enStrings = JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, 'en/common.json'), 'utf-8')
  );
  const flatEn = flattenKeys(enStrings);

  const langNames: Record<string, string> = {
    fr: 'French', de: 'German', es: 'Spanish', ar: 'Arabic'
  };

  for (const locale of LOCALES) {
    const outPath = path.join(LOCALES_DIR, `${locale}/common.json`);
    const existing = fs.existsSync(outPath)
      ? flattenKeys(JSON.parse(fs.readFileSync(outPath, 'utf-8')))
      : {};

    // Only translate missing keys
    const missing = Object.fromEntries(
      Object.entries(flatEn).filter(([k]) => !existing[k])
    );

    if (Object.keys(missing).length === 0) {
      console.log(`${locale}: up to date`);
      continue;
    }

    console.log(`${locale}: translating ${Object.keys(missing).length} keys...`);
    const translated = await translateBatch(missing, locale, langNames[locale]);

    // Merge and write — save to review/ for human approval
    const reviewPath = path.join(LOCALES_DIR, `review/${locale}.json`);
    fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
    fs.writeFileSync(reviewPath, JSON.stringify(translated, null, 2));
    console.log(`${locale}: saved to review/${locale}.json`);
  }
}

main().catch(console.error);
```

---

## Step 4: Pluralization and Date/Number Formatting

```typescript
// lib/formatters.ts
export function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatNumber(value: number, locale: string, style?: 'currency' | 'percent'): string {
  return new Intl.NumberFormat(locale, {
    style: style ?? 'decimal',
    currency: style === 'currency' ? 'EUR' : undefined,
    minimumFractionDigits: style === 'currency' ? 2 : 0,
  }).format(value);
}

// Usage:
// formatDate(new Date(), 'de') → "19. März 2026"
// formatNumber(1234567, 'fr') → "1 234 567"
// formatNumber(49.99, 'de', 'currency') → "49,99 €"
```

---

## Step 5: RTL Support (Arabic, Hebrew)

```tsx
// app/[locale]/layout.tsx
const RTL_LOCALES = ['ar', 'he'];

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const isRTL = RTL_LOCALES.includes(params.locale);

  return (
    <html lang={params.locale} dir={isRTL ? 'rtl' : 'ltr'}>
      <body className={isRTL ? 'font-arabic' : ''}>
        {children}
      </body>
    </html>
  );
}
```

```css
/* styles/rtl.css */
[dir="rtl"] .ml-4 { margin-left: 0; margin-right: 1rem; }
[dir="rtl"] .pl-4 { padding-left: 0; padding-right: 1rem; }
[dir="rtl"] .text-left { text-align: right; }
[dir="rtl"] .border-l { border-left: none; border-right-width: 1px; }
/* Use logical properties in new code: margin-inline-start instead of margin-left */
```

---

## Results

Elena shipped German and French in 10 days. The enterprise deal closed. Two more EU deals came in the next month. Total cost: $180 in Claude API calls + 8 hours of human review.

> "We translated 800 keys in 2 hours. The 4-hour human review caught maybe 20 corrections. Well worth it." — Elena
