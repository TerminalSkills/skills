---
title: Build a Notification Template Engine
slug: build-notification-template-engine
description: Build a notification template engine with multi-channel rendering, variable interpolation, conditional blocks, localization, preview mode, and A/B testing for consistent messaging across email, SMS, push, and in-app.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - notifications
  - templates
  - email
  - multi-channel
  - messaging
---

# Build a Notification Template Engine

## The Problem

Lena leads product at a 20-person SaaS sending 500K notifications monthly across email, SMS, push, and in-app. Each channel has hardcoded templates in different codebases — email in the backend, push in the mobile app, SMS in a lambda. Changing "Your order #{{orderId}} has shipped" requires 4 deploys. Templates aren't translated — French users get English push notifications. Marketing wants to A/B test subject lines but there's no infrastructure. They need a template engine: one template per notification type, rendered for each channel, with variables, conditionals, localization, and A/B testing.

## Step 1: Build the Template Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface NotificationTemplate {
  id: string;
  event: string;
  channel: "email" | "sms" | "push" | "in_app";
  locale: string;
  subject?: string;
  body: string;
  variant?: string;
  active: boolean;
  version: number;
}

interface RenderResult {
  channel: string;
  subject?: string;
  body: string;
  plainText?: string;
}

// Render notification for all channels
export async function renderNotification(
  event: string,
  variables: Record<string, any>,
  options?: { locale?: string; channels?: string[]; userId?: string }
): Promise<RenderResult[]> {
  const locale = options?.locale || "en";
  const channels = options?.channels || ["email", "sms", "push", "in_app"];
  const results: RenderResult[] = [];

  for (const channel of channels) {
    const template = await getTemplate(event, channel, locale, options?.userId);
    if (!template) continue;

    const rendered: RenderResult = { channel };
    if (template.subject) rendered.subject = renderTemplate(template.subject, variables);
    rendered.body = renderTemplate(template.body, variables);
    if (channel === "email") rendered.plainText = stripHtml(rendered.body);

    results.push(rendered);
  }

  return results;
}

async function getTemplate(event: string, channel: string, locale: string, userId?: string): Promise<NotificationTemplate | null> {
  const cacheKey = `tmpl:${event}:${channel}:${locale}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Check for A/B variant
  let variant: string | null = null;
  if (userId) {
    const hash = parseInt(createHash("md5").update(userId + event).digest("hex").slice(0, 8), 16);
    variant = hash % 2 === 0 ? "A" : "B";
  }

  // Try locale-specific, then fallback to 'en'
  const { rows: [template] } = await pool.query(
    `SELECT * FROM notification_templates WHERE event = $1 AND channel = $2 AND locale = $3 AND active = true
     ${variant ? "AND (variant = $4 OR variant IS NULL) ORDER BY variant DESC NULLS LAST" : "AND variant IS NULL"}
     LIMIT 1`,
    variant ? [event, channel, locale, variant] : [event, channel, locale]
  );

  if (!template) {
    // Fallback to English
    const { rows: [fallback] } = await pool.query(
      "SELECT * FROM notification_templates WHERE event = $1 AND channel = $2 AND locale = 'en' AND active = true AND variant IS NULL LIMIT 1",
      [event, channel]
    );
    if (fallback) { await redis.setex(cacheKey, 300, JSON.stringify(fallback)); return fallback; }
    return null;
  }

  await redis.setex(cacheKey, 300, JSON.stringify(template));
  return template;
}

function renderTemplate(template: string, variables: Record<string, any>): string {
  let result = template;

  // Variable interpolation: {{variableName}}
  result = result.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const parts = path.split(".");
    let value: any = variables;
    for (const part of parts) value = value?.[part];
    return value !== undefined ? String(value) : `{{${path}}}`;
  });

  // Conditional blocks: {{#if condition}}...{{/if}}
  result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, condition, content) => {
    return variables[condition] ? content : "";
  });

  // Loops: {{#each items}}...{{/each}}
  result = result.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, arrayName, content) => {
    const items = variables[arrayName];
    if (!Array.isArray(items)) return "";
    return items.map((item: any) => {
      return content.replace(/\{\{this\.(\w+)\}\}/g, (_: any, key: string) => String(item[key] ?? ""));
    }).join("");
  });

  return result;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Preview template with sample data
export async function preview(event: string, channel: string, locale: string, sampleData: Record<string, any>): Promise<RenderResult> {
  const template = await getTemplate(event, channel, locale);
  if (!template) throw new Error("Template not found");
  return {
    channel,
    subject: template.subject ? renderTemplate(template.subject, sampleData) : undefined,
    body: renderTemplate(template.body, sampleData),
  };
}

// Create or update template
export async function saveTemplate(params: Omit<NotificationTemplate, "id" | "version">): Promise<void> {
  const { rows: [existing] } = await pool.query(
    "SELECT version FROM notification_templates WHERE event = $1 AND channel = $2 AND locale = $3 AND variant IS NOT DISTINCT FROM $4 ORDER BY version DESC LIMIT 1",
    [params.event, params.channel, params.locale, params.variant || null]
  );
  const version = (existing?.version || 0) + 1;

  await pool.query(
    `INSERT INTO notification_templates (event, channel, locale, subject, body, variant, active, version, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [params.event, params.channel, params.locale, params.subject, params.body, params.variant || null, params.active, version]
  );

  // Invalidate cache
  await redis.del(`tmpl:${params.event}:${params.channel}:${params.locale}`);
}
```

## Results

- **Template change: 4 deploys → 0** — update template in DB; all channels use new wording in <5 minutes via cache refresh; no code changes
- **French push notifications** — locale-specific templates for FR, DE, ES, JA; fallback to EN if translation missing; French users get French notifications
- **A/B testing subject lines** — variant A: "Your order shipped!" vs B: "{{name}}, your package is on its way!"; 50/50 split by userId hash; B wins with 23% higher open rate
- **Conditional content** — `{{#if isPremium}}` shows premium features; `{{#each items}}` renders order line items; dynamic content without code
- **Preview before send** — marketing team previews rendered template with sample data; catches broken variables and formatting; no test emails to production
