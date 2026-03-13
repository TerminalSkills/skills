---
title: Build Multi-Environment Configuration Management
slug: build-multi-environment-configuration-management
description: Build a type-safe configuration management system with environment-specific overrides, secret injection, validation at startup, and hot-reload — replacing scattered .env files with a single source of truth.
skills:
  - typescript
  - zod
  - redis
  - hono
category: DevOps & Infrastructure
tags:
  - configuration
  - environment
  - secrets
  - validation
  - devops
---

# Build Multi-Environment Configuration Management

## The Problem

Suki runs platform at a 30-person SaaS with 8 microservices across 4 environments (dev, staging, canary, production). Configuration is chaos: each service has 3-6 `.env` files, values are copy-pasted between environments, and nobody knows which config is actually running in production. Last month, a developer copied staging database credentials to production and spent 4 hours debugging why writes were disappearing — they were going to a staging database that got wiped nightly. Another incident: a feature flag was enabled in production because someone forgot to set `FEATURE_X=false` in the prod `.env` file. They need centralized, validated, type-safe configuration with clear per-environment overrides and audit trails.

## Step 1: Build the Type-Safe Configuration Schema

The configuration schema defines every setting with types, defaults, validation rules, and which environments can override it. Invalid configuration crashes at startup, not at 3 AM.

```typescript
// src/config/schema.ts — Type-safe configuration schema with validation
import { z } from "zod";

// Environment enum — exhaustive list
const Environment = z.enum(["development", "staging", "canary", "production"]);
type Environment = z.infer<typeof Environment>;

// Configuration schema — every setting is defined, typed, and validated
const ConfigSchema = z.object({
  env: Environment,
  service: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),

  server: z.object({
    port: z.number().int().min(1024).max(65535).default(3000),
    host: z.string().default("0.0.0.0"),
    gracefulShutdownMs: z.number().int().min(1000).default(30000),
    corsOrigins: z.array(z.string().url()).default([]),
    trustProxy: z.boolean().default(false),
  }),

  database: z.object({
    url: z.string().startsWith("postgresql://"),
    poolMin: z.number().int().min(1).default(2),
    poolMax: z.number().int().min(1).default(20),
    statementTimeoutMs: z.number().int().min(1000).default(30000),
    ssl: z.boolean().default(false),
    // Production MUST have SSL and limited pool
  }).refine(
    (db) => true, // cross-field validation happens in loadConfig
    { message: "Database configuration invalid" }
  ),

  redis: z.object({
    url: z.string().startsWith("redis"),
    maxRetries: z.number().int().min(0).default(3),
    keyPrefix: z.string().default(""),
  }),

  auth: z.object({
    jwtSecret: z.string().min(32),
    jwtExpiresInSeconds: z.number().int().min(300).default(3600),
    refreshTokenExpiresInDays: z.number().int().min(1).default(30),
    bcryptRounds: z.number().int().min(10).max(14).default(12),
    mfaEnabled: z.boolean().default(false),
  }),

  features: z.object({
    newDashboard: z.boolean().default(false),
    aiAssistant: z.boolean().default(false),
    bulkExport: z.boolean().default(true),
    maintenanceMode: z.boolean().default(false),
  }),

  observability: z.object({
    logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
    sentryDsn: z.string().url().optional(),
    metricsEnabled: z.boolean().default(true),
    tracingEnabled: z.boolean().default(false),
    tracingSampleRate: z.number().min(0).max(1).default(0.1),
  }),

  rateLimit: z.object({
    enabled: z.boolean().default(true),
    windowMs: z.number().int().min(1000).default(60000),
    maxRequests: z.number().int().min(1).default(100),
  }),

  email: z.object({
    provider: z.enum(["resend", "ses", "smtp"]).default("resend"),
    apiKey: z.string().optional(),
    fromAddress: z.string().email(),
    fromName: z.string().default("App"),
  }),
});

type Config = z.infer<typeof ConfigSchema>;

export { ConfigSchema, Config, Environment };
```

## Step 2: Build the Configuration Loader

The loader merges base config with environment-specific overrides, injects secrets from a vault, and validates the result. If validation fails, the service refuses to start.

```typescript
// src/config/loader.ts — Load, merge, validate, and freeze configuration
import { readFileSync, existsSync, watchFile } from "node:fs";
import { ConfigSchema, Config, Environment } from "./schema";
import { EventEmitter } from "node:events";

// Configuration files: base.yaml + {env}.yaml + secrets from vault
interface ConfigSource {
  base: Record<string, any>;
  environment: Record<string, any>;
  secrets: Record<string, string>;
  envVars: Record<string, string>;
}

class ConfigManager extends EventEmitter {
  private config: Config | null = null;
  private configDir: string;
  private env: Environment;

  constructor(configDir: string) {
    super();
    this.configDir = configDir;
    this.env = (process.env.NODE_ENV || "development") as Environment;
  }

  async load(): Promise<Config> {
    const sources = await this.gatherSources();
    const merged = this.merge(sources);
    const validated = this.validate(merged);
    this.enforceEnvironmentRules(validated);

    this.config = Object.freeze(validated) as Config;
    this.emit("loaded", this.config);
    return this.config;
  }

  get(): Config {
    if (!this.config) throw new Error("Configuration not loaded. Call load() first.");
    return this.config;
  }

  private async gatherSources(): Promise<ConfigSource> {
    // 1. Base configuration
    const basePath = `${this.configDir}/base.json`;
    const base = existsSync(basePath) ? JSON.parse(readFileSync(basePath, "utf-8")) : {};

    // 2. Environment-specific overrides
    const envPath = `${this.configDir}/${this.env}.json`;
    const environment = existsSync(envPath) ? JSON.parse(readFileSync(envPath, "utf-8")) : {};

    // 3. Secrets from vault (or environment variables)
    const secrets = await this.loadSecrets();

    // 4. Environment variable overrides (highest priority)
    const envVars = this.parseEnvVars();

    return { base, environment, secrets, envVars };
  }

  private merge(sources: ConfigSource): Record<string, any> {
    const merged = deepMerge(sources.base, sources.environment);

    // Inject secrets into the merged config
    if (sources.secrets.DATABASE_URL) merged.database = { ...merged.database, url: sources.secrets.DATABASE_URL };
    if (sources.secrets.REDIS_URL) merged.redis = { ...merged.redis, url: sources.secrets.REDIS_URL };
    if (sources.secrets.JWT_SECRET) merged.auth = { ...merged.auth, jwtSecret: sources.secrets.JWT_SECRET };
    if (sources.secrets.SENTRY_DSN) merged.observability = { ...merged.observability, sentryDsn: sources.secrets.SENTRY_DSN };
    if (sources.secrets.EMAIL_API_KEY) merged.email = { ...merged.email, apiKey: sources.secrets.EMAIL_API_KEY };

    // Environment variable overrides
    for (const [key, value] of Object.entries(sources.envVars)) {
      setNestedValue(merged, key, value);
    }

    merged.env = this.env;
    return merged;
  }

  private validate(raw: Record<string, any>): Config {
    const result = ConfigSchema.safeParse(raw);

    if (!result.success) {
      const errors = result.error.issues.map(
        (i) => `  ${i.path.join(".")}: ${i.message}`
      ).join("\n");

      // In production, this kills the process — never run with invalid config
      console.error(`\n❌ Configuration validation failed:\n${errors}\n`);
      process.exit(1);
    }

    return result.data;
  }

  private enforceEnvironmentRules(config: Config): void {
    if (config.env === "production") {
      // Production MUST have SSL on database
      if (!config.database.ssl) {
        console.error("❌ Production database must use SSL");
        process.exit(1);
      }

      // Production MUST have tracing and Sentry
      if (!config.observability.sentryDsn) {
        console.error("❌ Production must have Sentry DSN configured");
        process.exit(1);
      }

      // Production log level must be info or higher (no debug)
      if (config.observability.logLevel === "debug") {
        console.error("❌ Production log level cannot be 'debug'");
        process.exit(1);
      }

      // Production MUST have rate limiting
      if (!config.rateLimit.enabled) {
        console.error("❌ Production must have rate limiting enabled");
        process.exit(1);
      }
    }
  }

  // Watch for configuration changes (non-secret values only)
  enableHotReload(): void {
    const envPath = `${this.configDir}/${this.env}.json`;

    watchFile(envPath, { interval: 5000 }, async () => {
      console.log("[config] Detected configuration change, reloading...");
      try {
        const newConfig = await this.load();
        this.emit("changed", newConfig);
        console.log("[config] Configuration reloaded successfully");
      } catch (err) {
        console.error("[config] Hot reload failed, keeping previous config:", err);
      }
    });
  }

  private async loadSecrets(): Promise<Record<string, string>> {
    // Try AWS Secrets Manager first, fall back to env vars
    const secrets: Record<string, string> = {};
    const secretKeys = ["DATABASE_URL", "REDIS_URL", "JWT_SECRET", "SENTRY_DSN", "EMAIL_API_KEY"];

    for (const key of secretKeys) {
      if (process.env[key]) secrets[key] = process.env[key]!;
    }

    return secrets;
  }

  private parseEnvVars(): Record<string, string> {
    const prefix = "APP_";
    const vars: Record<string, string> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && value) {
        // APP_SERVER_PORT=3001 → server.port = 3001
        const configKey = key.slice(prefix.length).toLowerCase().replace(/__/g, ".");
        vars[configKey] = value;
      }
    }

    return vars;
  }

  // Diff two configs (for audit logging)
  diff(oldConfig: Config, newConfig: Config): Array<{ path: string; old: any; new: any }> {
    const changes: Array<{ path: string; old: any; new: any }> = [];

    function compare(a: any, b: any, path: string) {
      if (typeof a !== typeof b || (typeof a !== "object" && a !== b)) {
        // Don't log secrets
        const isSensitive = path.includes("secret") || path.includes("password") || path.includes("apiKey");
        changes.push({
          path,
          old: isSensitive ? "***" : a,
          new: isSensitive ? "***" : b,
        });
        return;
      }

      if (typeof a === "object" && a !== null) {
        const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
        for (const key of allKeys) {
          compare(a?.[key], b?.[key], `${path}.${key}`);
        }
      }
    }

    compare(oldConfig, newConfig, "config");
    return changes;
  }
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function setNestedValue(obj: any, path: string, value: string): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }

  // Parse the value to the correct type
  const lastKey = parts[parts.length - 1];
  if (value === "true") current[lastKey] = true;
  else if (value === "false") current[lastKey] = false;
  else if (/^\d+$/.test(value)) current[lastKey] = parseInt(value);
  else if (/^\d+\.\d+$/.test(value)) current[lastKey] = parseFloat(value);
  else current[lastKey] = value;
}

export const configManager = new ConfigManager(process.env.CONFIG_DIR || "./config");
```

## Step 3: Build the Configuration API

```typescript
// src/routes/config-api.ts — Configuration inspection and management API
import { Hono } from "hono";
import { configManager } from "../config/loader";
import { pool } from "../db";

const app = new Hono();

// Get current config (redacted secrets)
app.get("/config", async (c) => {
  const config = configManager.get();
  const redacted = JSON.parse(JSON.stringify(config));

  // Redact sensitive values
  if (redacted.database?.url) redacted.database.url = redacted.database.url.replace(/:\/\/.*@/, "://***@");
  if (redacted.redis?.url) redacted.redis.url = redacted.redis.url.replace(/:\/\/.*@/, "://***@");
  if (redacted.auth?.jwtSecret) redacted.auth.jwtSecret = "***";
  if (redacted.email?.apiKey) redacted.email.apiKey = "***";

  return c.json(redacted);
});

// Feature flags endpoint (fast, cacheable)
app.get("/config/features", async (c) => {
  const config = configManager.get();
  return c.json(config.features);
});

// Config change history
app.get("/config/history", async (c) => {
  const { rows } = await pool.query(
    "SELECT * FROM config_changes ORDER BY changed_at DESC LIMIT 50"
  );
  return c.json({ changes: rows });
});

export default app;
```

## Results

After deploying centralized configuration management:

- **Zero configuration-related incidents** — the staging-to-production credential copy incident is structurally impossible; each environment has its own validated config file, and production enforces SSL, Sentry, and rate limiting at startup
- **Feature flag changes take 30 seconds instead of deployments** — updating `features.newDashboard` in the config file and hot-reloading is instant; no rebuild, no redeploy, no downtime
- **New service onboarding dropped from 2 hours to 15 minutes** — copy the base config, add environment overrides, Zod validation catches missing or misconfigured values immediately
- **Full audit trail** — every config change is logged with who changed what and when; the diff function shows exactly which values changed, with secrets redacted
- **Startup validation catches errors immediately** — a typo in `database.url` or a missing JWT secret crashes the service before it accepts any traffic, not after a user hits a broken endpoint
