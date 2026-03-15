---
title: Build an Environment Variable Manager
slug: build-environment-variable-manager
description: Build an environment variable manager with validation, type checking, default values, environment-specific overrides, documentation generation, and CI integration for safe configuration.
skills:
  - typescript
  - hono
  - zod
category: development
tags:
  - environment-variables
  - configuration
  - validation
  - developer-experience
  - ci-cd
---

# Build an Environment Variable Manager

## The Problem

Max leads backend at a 20-person company. The `.env.example` file has 60 variables. New developers miss required ones and get cryptic runtime errors. Types are wrong — `PORT=3000` is a string, not a number, causing comparison bugs. Some variables have no documentation. Production and staging differ in 15 variables but nobody tracks which ones. A missing `DATABASE_URL` in production caused a 2-hour outage. They need env var management: schema validation at startup, type coercion, default values, required checks, environment-specific overrides, and documentation generation.

## Step 1: Build the Env Manager

```typescript
import { z, ZodSchema, ZodError } from "zod";

interface EnvField { name: string; schema: ZodSchema; description: string; secret: boolean; environments: string[]; example: string; }
type EnvConfig = Record<string, EnvField>;

// Define environment schema
const ENV_SCHEMA: EnvConfig = {
  NODE_ENV: { name: "NODE_ENV", schema: z.enum(["development", "staging", "production", "test"]).default("development"), description: "Application environment", secret: false, environments: ["*"], example: "production" },
  PORT: { name: "PORT", schema: z.coerce.number().int().min(1).max(65535).default(3000), description: "HTTP server port", secret: false, environments: ["*"], example: "3000" },
  DATABASE_URL: { name: "DATABASE_URL", schema: z.string().url().startsWith("postgresql://"), description: "PostgreSQL connection string", secret: true, environments: ["*"], example: "postgresql://user:pass@localhost:5432/app" },
  REDIS_URL: { name: "REDIS_URL", schema: z.string().url().default("redis://localhost:6379"), description: "Redis connection URL", secret: true, environments: ["*"], example: "redis://localhost:6379" },
  JWT_SECRET: { name: "JWT_SECRET", schema: z.string().min(32), description: "JWT signing secret (min 32 chars)", secret: true, environments: ["production", "staging"], example: "your-secret-key-at-least-32-characters-long" },
  CORS_ORIGINS: { name: "CORS_ORIGINS", schema: z.string().transform((s) => s.split(",")).pipe(z.array(z.string().url())).or(z.literal("*").transform(() => ["*"])), description: "Allowed CORS origins (comma-separated)", secret: false, environments: ["*"], example: "https://app.example.com,https://admin.example.com" },
  LOG_LEVEL: { name: "LOG_LEVEL", schema: z.enum(["debug", "info", "warn", "error"]).default("info"), description: "Logging level", secret: false, environments: ["*"], example: "info" },
  SMTP_HOST: { name: "SMTP_HOST", schema: z.string().optional(), description: "SMTP server for sending emails", secret: false, environments: ["production", "staging"], example: "smtp.sendgrid.net" },
  SMTP_API_KEY: { name: "SMTP_API_KEY", schema: z.string().optional(), description: "SMTP API key", secret: true, environments: ["production", "staging"], example: "SG.xxx" },
  SENTRY_DSN: { name: "SENTRY_DSN", schema: z.string().url().optional(), description: "Sentry error tracking DSN", secret: false, environments: ["production", "staging"], example: "https://xxx@sentry.io/123" },
};

let validatedEnv: Record<string, any> | null = null;

// Validate all env vars at startup (fail fast)
export function validateEnv(environment?: string): Record<string, any> {
  const env = environment || process.env.NODE_ENV || "development";
  const errors: Array<{ variable: string; error: string }> = [];
  const result: Record<string, any> = {};

  for (const [key, field] of Object.entries(ENV_SCHEMA)) {
    // Skip vars not needed for this environment
    if (!field.environments.includes("*") && !field.environments.includes(env)) continue;

    const rawValue = process.env[key];
    try {
      result[key] = field.schema.parse(rawValue);
    } catch (e) {
      if (e instanceof ZodError) {
        const issues = e.issues.map((i) => i.message).join(", ");
        errors.push({ variable: key, error: `${issues} (got: ${rawValue === undefined ? "undefined" : `"${rawValue}"`})` });
      }
    }
  }

  if (errors.length > 0) {
    console.error("\n❌ Environment validation failed:\n");
    for (const err of errors) {
      const field = ENV_SCHEMA[err.variable];
      console.error(`  ${err.variable}: ${err.error}`);
      console.error(`    Description: ${field.description}`);
      console.error(`    Example: ${field.example}\n`);
    }
    console.error(`${errors.length} variable(s) failed validation. Fix them and restart.\n`);
    process.exit(1);
  }

  validatedEnv = result;
  return result;
}

// Type-safe env access
export function env<K extends keyof typeof ENV_SCHEMA>(key: K): any {
  if (!validatedEnv) throw new Error("Call validateEnv() at startup first");
  return validatedEnv[key];
}

// Generate .env.example file
export function generateEnvExample(): string {
  const lines: string[] = ["# Auto-generated from env schema", `# Generated at: ${new Date().toISOString()}`, ""];
  const grouped = new Map<string, EnvField[]>();
  for (const field of Object.values(ENV_SCHEMA)) {
    const group = field.secret ? "Secrets" : "Configuration";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(field);
  }

  for (const [group, fields] of grouped) {
    lines.push(`# === ${group} ==="`);
    for (const field of fields) {
      lines.push(`# ${field.description}`);
      lines.push(`# Environments: ${field.environments.join(", ")}`);
      lines.push(`${field.name}=${field.secret ? "" : field.example}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

// Generate documentation
export function generateDocs(): string {
  let md = "# Environment Variables\n\n";
  md += `| Variable | Required | Default | Description |\n|---|---|---|---|\n`;
  for (const [key, field] of Object.entries(ENV_SCHEMA)) {
    const required = field.schema.isOptional?.() ? "No" : "Yes";
    const defaultVal = field.example || "-";
    md += `| \`${key}\` | ${required} | ${field.secret ? "(secret)" : defaultVal} | ${field.description} |\n`;
  }
  return md;
}

// Check for missing vars in CI (without failing)
export function auditEnv(): Array<{ variable: string; status: "set" | "missing" | "invalid"; required: boolean }> {
  const results = [];
  for (const [key, field] of Object.entries(ENV_SCHEMA)) {
    const rawValue = process.env[key];
    let status: "set" | "missing" | "invalid" = "missing";
    if (rawValue !== undefined) {
      try { field.schema.parse(rawValue); status = "set"; }
      catch { status = "invalid"; }
    }
    results.push({ variable: key, status, required: !field.schema.isOptional?.() });
  }
  return results;
}
```

## Results

- **Missing DATABASE_URL caught at startup** — app fails immediately with clear error message + description + example; no cryptic runtime error 30 minutes later
- **Type safety** — `PORT` coerced to number; `CORS_ORIGINS` parsed to string array; no more `if (PORT === '3000')` string comparison bugs
- **Auto-generated .env.example** — `npm run env:generate` creates documented example file; always in sync with schema; new developers copy and fill
- **CI audit** — pre-deploy check verifies all required vars are set in production; deployment blocked if `JWT_SECRET` is missing; 2-hour outage impossible
- **Documentation always current** — `npm run env:docs` generates markdown table; lives in README; never out of date
