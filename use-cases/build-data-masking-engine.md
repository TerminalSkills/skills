---
title: Build a Data Masking Engine
slug: build-data-masking-engine
description: Build a real-time data masking engine with field-level redaction, role-based visibility, format-preserving masking, audit logging, and API middleware for PII protection in responses.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Security
tags:
  - data-masking
  - pii
  - privacy
  - redaction
  - security
---

# Build a Data Masking Engine

## The Problem

Aisha leads compliance at a 25-person fintech. Support agents need to see customer accounts but shouldn't see full SSNs or bank account numbers. API responses leak PII to frontend logs — a support page that shows `{"ssn": "123-45-6789"}` in the network tab violates PCI-DSS. Different roles need different views: support sees last 4 digits, compliance sees full data, analytics sees pseudonymized data. Current approach: manual `substring()` calls scattered across 40 API endpoints — inconsistent and error-prone. They need centralized data masking: configure once, apply everywhere, role-aware, and audit every access to sensitive fields.

## Step 1: Build the Masking Engine

```typescript
// src/masking/engine.ts — Real-time data masking with role-based policies
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface MaskingPolicy {
  field: string;             // JSONPath pattern: "$.user.ssn", "$.accounts[*].number"
  type: "ssn" | "email" | "phone" | "card" | "name" | "address" | "custom";
  rules: Array<{
    role: string;            // "*" for default, "admin", "support", "analytics"
    strategy: "full" | "partial" | "hash" | "redact" | "none";
    options?: { showFirst?: number; showLast?: number; hashSalt?: string; replacement?: string };
  }>;
}

const policies: MaskingPolicy[] = [
  {
    field: "$.*.ssn",
    type: "ssn",
    rules: [
      { role: "compliance", strategy: "none" },
      { role: "support", strategy: "partial", options: { showLast: 4 } },
      { role: "analytics", strategy: "hash", options: { hashSalt: "analytics-v1" } },
      { role: "*", strategy: "redact" },
    ],
  },
  {
    field: "$.*.email",
    type: "email",
    rules: [
      { role: "compliance", strategy: "none" },
      { role: "support", strategy: "partial", options: { showFirst: 2, showLast: 0 } },
      { role: "*", strategy: "redact" },
    ],
  },
  {
    field: "$.*.cardNumber",
    type: "card",
    rules: [
      { role: "*", strategy: "partial", options: { showLast: 4 } },  // PCI: nobody sees full card
    ],
  },
  {
    field: "$.*.phone",
    type: "phone",
    rules: [
      { role: "compliance", strategy: "none" },
      { role: "support", strategy: "partial", options: { showLast: 4 } },
      { role: "*", strategy: "redact" },
    ],
  },
];

// Apply masking to any data object based on viewer's role
export function maskData(data: any, viewerRole: string): any {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map((item) => maskData(item, viewerRole));
  if (typeof data !== "object") return data;

  const masked = { ...data };

  for (const key of Object.keys(masked)) {
    // Check if this field has a masking policy
    const policy = findPolicy(key);
    if (policy) {
      const rule = policy.rules.find((r) => r.role === viewerRole) || policy.rules.find((r) => r.role === "*");
      if (rule) {
        masked[key] = applyMask(masked[key], policy.type, rule.strategy, rule.options);
      }
    } else if (typeof masked[key] === "object") {
      // Recurse into nested objects
      masked[key] = maskData(masked[key], viewerRole);
    }
  }

  return masked;
}

function findPolicy(fieldName: string): MaskingPolicy | null {
  const normalized = fieldName.toLowerCase();
  return policies.find((p) => {
    const policyField = p.field.split(".").pop()?.replace(/[\$\*\[\]]/g, "").toLowerCase();
    return policyField === normalized || p.type === normalized;
  }) || null;
}

function applyMask(
  value: any,
  type: MaskingPolicy["type"],
  strategy: string,
  options?: any
): any {
  if (value === null || value === undefined) return value;
  const str = String(value);

  switch (strategy) {
    case "none": return value;
    case "redact": return options?.replacement || "[REDACTED]";
    case "full": return "*".repeat(str.length);

    case "partial": {
      const showFirst = options?.showFirst || 0;
      const showLast = options?.showLast || 0;
      const visible = str.slice(0, showFirst) + "*".repeat(Math.max(0, str.length - showFirst - showLast)) + str.slice(-showLast || undefined);

      // Format-preserving masking for specific types
      switch (type) {
        case "ssn": return `***-**-${str.slice(-4)}`;
        case "card": return `****-****-****-${str.replace(/\D/g, "").slice(-4)}`;
        case "email": {
          const [local, domain] = str.split("@");
          return `${local.slice(0, showFirst)}***@${domain}`;
        }
        case "phone": return `***-***-${str.replace(/\D/g, "").slice(-4)}`;
        default: return visible;
      }
    }

    case "hash": {
      const { createHash } = require("node:crypto");
      return createHash("sha256").update((options?.hashSalt || "") + str).digest("hex").slice(0, 16);
    }

    default: return "[MASKED]";
  }
}

// Hono middleware — masks all API responses based on authenticated user's role
export function maskingMiddleware() {
  return async (c: any, next: any) => {
    await next();

    // Only mask JSON responses
    const contentType = c.res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return;

    const role = c.get("userRole") || "anonymous";
    const body = await c.res.json();
    const masked = maskData(body, role);

    // Audit sensitive field access
    const accessedFields = detectSensitiveFields(body);
    if (accessedFields.length > 0) {
      await redis.rpush("masking:audit", JSON.stringify({
        role, path: c.req.path, fields: accessedFields,
        timestamp: new Date().toISOString(),
        userId: c.get("userId"),
      }));
    }

    c.res = new Response(JSON.stringify(masked), {
      status: c.res.status,
      headers: c.res.headers,
    });
  };
}

function detectSensitiveFields(data: any, path: string = ""): string[] {
  if (!data || typeof data !== "object") return [];
  const fields: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (findPolicy(key)) fields.push(`${path}.${key}`);
    if (typeof value === "object" && value !== null) {
      fields.push(...detectSensitiveFields(value, `${path}.${key}`));
    }
  }
  return fields;
}
```

## Results

- **PCI-DSS compliance** — card numbers always show only last 4 digits regardless of role; no full card number in any API response; audit passed
- **Role-based views** — support agent sees `***-**-6789` for SSN; compliance officer sees `123-45-6789`; same API endpoint, different masking based on role
- **40 endpoints fixed at once** — middleware applies globally; no per-endpoint masking code; new endpoints automatically protected
- **Audit trail** — every access to sensitive fields logged with who, when, which field; compliance can prove no unauthorized PII access
- **Analytics gets pseudonymized data** — hash strategy produces consistent pseudonym per SSN; analytics can count unique users and track patterns without seeing real PII
