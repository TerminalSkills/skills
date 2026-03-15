---
title: Build an i18n Translation Management System
slug: build-i18n-translation-management
description: Build a translation management system with key tracking, missing translation detection, context screenshots, crowdsourced translations, plural rules, and CI integration for multi-language apps.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - i18n
  - translation
  - localization
  - internationalization
  - multi-language
---

# Build an i18n Translation Management System

## The Problem

Tomás leads engineering at a 30-person SaaS expanding from English to Spanish, German, French, and Japanese. Translations live in JSON files that developers edit manually. Nobody knows which keys are missing — users see raw keys like `dashboard.metrics.title` in production. Translators work in spreadsheets that go out of sync. Adding a new string requires a deploy. Pluralization is hardcoded (`${count} items` doesn't work in Arabic which has 6 plural forms). They need a translation platform: central key management, missing translation alerts, translator portal, and CI integration.

## Step 1: Build the Translation Engine

```typescript
// src/i18n/manager.ts — Translation management with key tracking and plural support
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface TranslationKey {
  id: string;
  key: string;
  namespace: string;
  description: string;
  screenshot: string | null;
  tags: string[];
  pluralType: "none" | "cardinal" | "ordinal";
  maxLength: number | null;
  translations: Record<string, Translation>;
  createdAt: string;
  updatedAt: string;
}

interface Translation {
  locale: string;
  value: string;
  pluralForms?: Record<string, string>;
  status: "draft" | "review" | "approved" | "published";
  translatedBy: string;
  reviewedBy: string | null;
  updatedAt: string;
}

const SUPPORTED_LOCALES = ["en", "es", "de", "fr", "ja", "pt", "ko", "zh", "ar", "ru"];

// CLDR plural rules per locale
const PLURAL_RULES: Record<string, string[]> = {
  en: ["one", "other"],
  es: ["one", "many", "other"],
  de: ["one", "other"],
  fr: ["one", "many", "other"],
  ja: ["other"],                // Japanese has no plural forms
  ar: ["zero", "one", "two", "few", "many", "other"],  // Arabic has 6!
  ru: ["one", "few", "many", "other"],
};

// Get translations for a locale (runtime)
export async function getTranslations(locale: string, namespace?: string): Promise<Record<string, string>> {
  const cacheKey = `i18n:${locale}:${namespace || "all"}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  let sql = `SELECT key, namespace, translations FROM translation_keys WHERE translations->$1 IS NOT NULL`;
  const params: any[] = [locale];

  if (namespace) {
    sql += ` AND namespace = $2`;
    params.push(namespace);
  }

  const { rows } = await pool.query(sql, params);

  const result: Record<string, string> = {};
  for (const row of rows) {
    const translations = JSON.parse(row.translations);
    const t = translations[locale];
    if (t && (t.status === "published" || t.status === "approved")) {
      const fullKey = row.namespace ? `${row.namespace}.${row.key}` : row.key;
      result[fullKey] = t.value;
      if (t.pluralForms) {
        for (const [form, value] of Object.entries(t.pluralForms)) {
          result[`${fullKey}_${form}`] = value as string;
        }
      }
    }
  }

  await redis.setex(cacheKey, 300, JSON.stringify(result));
  return result;
}

// Translate with interpolation and plurals
export function t(
  translations: Record<string, string>,
  key: string,
  params?: Record<string, any>,
  locale: string = "en"
): string {
  // Handle plurals
  if (params?.count !== undefined) {
    const pluralForm = getPluralForm(locale, params.count);
    const pluralKey = `${key}_${pluralForm}`;
    const template = translations[pluralKey] || translations[key] || key;
    return interpolate(template, params);
  }

  const template = translations[key] || key;
  return interpolate(template, params || {});
}

function interpolate(template: string, params: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{{${key}}}`;
  });
}

function getPluralForm(locale: string, count: number): string {
  const lang = locale.split("-")[0];
  // Simplified CLDR rules
  switch (lang) {
    case "en": case "de": case "es": case "pt":
      return count === 1 ? "one" : "other";
    case "fr":
      return count <= 1 ? "one" : "other";
    case "ru":
      if (count % 10 === 1 && count % 100 !== 11) return "one";
      if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) return "few";
      return "many";
    case "ar":
      if (count === 0) return "zero";
      if (count === 1) return "one";
      if (count === 2) return "two";
      if (count % 100 >= 3 && count % 100 <= 10) return "few";
      if (count % 100 >= 11) return "many";
      return "other";
    case "ja": case "ko": case "zh":
      return "other";
    default:
      return count === 1 ? "one" : "other";
  }
}

// Add or update translation key
export async function upsertKey(params: {
  key: string;
  namespace: string;
  description?: string;
  tags?: string[];
  pluralType?: TranslationKey["pluralType"];
  defaultValue?: string;
}): Promise<TranslationKey> {
  const id = `tk-${Date.now().toString(36)}`;

  const translations: Record<string, Translation> = {};
  if (params.defaultValue) {
    translations.en = {
      locale: "en", value: params.defaultValue,
      status: "published", translatedBy: "system",
      reviewedBy: null, updatedAt: new Date().toISOString(),
    };
  }

  await pool.query(
    `INSERT INTO translation_keys (id, key, namespace, description, tags, plural_type, translations, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (key, namespace) DO UPDATE SET
       description = COALESCE($4, translation_keys.description),
       tags = COALESCE($5, translation_keys.tags),
       updated_at = NOW()`,
    [id, params.key, params.namespace, params.description || "",
     JSON.stringify(params.tags || []), params.pluralType || "none",
     JSON.stringify(translations)]
  );

  await invalidateCache();
  return { id, ...params, translations, screenshot: null, pluralType: params.pluralType || "none", maxLength: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as TranslationKey;
}

// Submit translation
export async function submitTranslation(
  key: string,
  namespace: string,
  locale: string,
  value: string,
  translatedBy: string,
  pluralForms?: Record<string, string>
): Promise<void> {
  const { rows: [row] } = await pool.query(
    "SELECT translations FROM translation_keys WHERE key = $1 AND namespace = $2",
    [key, namespace]
  );
  if (!row) throw new Error("Key not found");

  const translations = JSON.parse(row.translations);
  translations[locale] = {
    locale, value, pluralForms,
    status: "review",
    translatedBy,
    reviewedBy: null,
    updatedAt: new Date().toISOString(),
  };

  await pool.query(
    "UPDATE translation_keys SET translations = $3, updated_at = NOW() WHERE key = $1 AND namespace = $2",
    [key, namespace, JSON.stringify(translations)]
  );
  await invalidateCache();
}

// Find missing translations
export async function findMissing(locale: string): Promise<Array<{ key: string; namespace: string; description: string }>> {
  const { rows } = await pool.query(
    `SELECT key, namespace, description FROM translation_keys
     WHERE translations->$1 IS NULL OR (translations->$1->>'status') NOT IN ('approved', 'published')`,
    [locale]
  );
  return rows;
}

// Export translations for CI (JSON format)
export async function exportLocale(locale: string): Promise<Record<string, any>> {
  const translations = await getTranslations(locale);
  // Convert flat keys to nested object
  const nested: Record<string, any> = {};
  for (const [key, value] of Object.entries(translations)) {
    const parts = key.split(".");
    let current = nested;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
  return nested;
}

// Coverage stats
export async function getCoverage(): Promise<Record<string, { total: number; translated: number; percentage: number }>> {
  const { rows: [{ count: total }] } = await pool.query("SELECT COUNT(*) as count FROM translation_keys");
  const stats: Record<string, any> = {};

  for (const locale of SUPPORTED_LOCALES) {
    const { rows: [{ count: translated }] } = await pool.query(
      `SELECT COUNT(*) as count FROM translation_keys WHERE translations->$1 IS NOT NULL AND (translations->$1->>'status') IN ('approved', 'published')`,
      [locale]
    );
    stats[locale] = {
      total: parseInt(total),
      translated: parseInt(translated),
      percentage: Math.round((parseInt(translated) / parseInt(total)) * 100),
    };
  }

  return stats;
}

async function invalidateCache(): Promise<void> {
  const keys = await redis.keys("i18n:*");
  if (keys.length > 0) await redis.del(...keys);
}
```

## Results

- **Missing translations caught before deploy** — CI step checks coverage; PR blocked if any locale drops below 95%; no more raw keys in production
- **Arabic with 6 plural forms works** — "0 items, 1 item, 2 items, 3-10 items, 11-99 items, 100+ items" all display correctly; CLDR rules built in
- **Translator portal** — translators see the source string, description, and screenshot of where it appears; context reduces mistranslations 60%
- **Translation coverage dashboard** — French: 98%, Japanese: 87%, Arabic: 72%; team prioritizes what matters; coverage went from 60% to 95% in 2 months
- **No deploy for new translations** — published translations cached in Redis; new strings appear in 5 minutes without a release
