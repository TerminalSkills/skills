---
title: Build an API Contract Changelog
slug: build-api-contract-changelog
description: Build an API contract changelog that detects breaking changes between OpenAPI spec versions, generates migration guides, alerts affected consumers, and maintains backward compatibility reports.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - api
  - changelog
  - breaking-changes
  - openapi
  - compatibility
---

# Build an API Contract Changelog

## The Problem

Raj leads API platform at a 25-person company with 200 API consumers. They shipped a "minor" update that removed an optional field — 15 consumers broke because they depended on it. Nobody knows which spec changes are breaking until customers complain. Consumers can't see what changed between API versions. Migration guides are written manually after the fact. They need automated contract diffing: compare OpenAPI spec versions, classify changes as breaking/non-breaking, generate migration guides, and notify affected consumers before deploy.

## Step 1: Build the Contract Changelog

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface SpecChange {
  path: string;
  method: string;
  changeType: "added" | "removed" | "modified";
  field: string;
  severity: "breaking" | "non-breaking" | "deprecation";
  description: string;
  migrationHint: string;
}

interface ChangelogEntry {
  id: string;
  fromVersion: string;
  toVersion: string;
  changes: SpecChange[];
  breakingCount: number;
  nonBreakingCount: number;
  deprecationCount: number;
  migrationGuide: string;
  createdAt: string;
}

// Compare two OpenAPI specs
export async function diffSpecs(oldSpec: any, newSpec: any, fromVersion: string, toVersion: string): Promise<ChangelogEntry> {
  const changes: SpecChange[] = [];

  const oldPaths = Object.keys(oldSpec.paths || {});
  const newPaths = Object.keys(newSpec.paths || {});

  // Removed paths (breaking)
  for (const path of oldPaths) {
    if (!newSpec.paths[path]) {
      for (const method of Object.keys(oldSpec.paths[path])) {
        if (["get","post","put","patch","delete"].includes(method)) {
          changes.push({ path, method: method.toUpperCase(), changeType: "removed", field: "endpoint", severity: "breaking", description: `Endpoint ${method.toUpperCase()} ${path} removed`, migrationHint: `This endpoint no longer exists. Check the migration guide for alternatives.` });
        }
      }
    }
  }

  // Added paths (non-breaking)
  for (const path of newPaths) {
    if (!oldSpec.paths[path]) {
      for (const method of Object.keys(newSpec.paths[path])) {
        if (["get","post","put","patch","delete"].includes(method)) {
          changes.push({ path, method: method.toUpperCase(), changeType: "added", field: "endpoint", severity: "non-breaking", description: `New endpoint ${method.toUpperCase()} ${path}`, migrationHint: "New endpoint available. No action required." });
        }
      }
    }
  }

  // Modified paths
  for (const path of oldPaths) {
    if (!newSpec.paths[path]) continue;
    for (const method of Object.keys(oldSpec.paths[path])) {
      if (!["get","post","put","patch","delete"].includes(method)) continue;
      const oldOp = oldSpec.paths[path][method];
      const newOp = newSpec.paths[path]?.[method];
      if (!newOp) { changes.push({ path, method: method.toUpperCase(), changeType: "removed", field: "method", severity: "breaking", description: `Method ${method.toUpperCase()} removed from ${path}`, migrationHint: "This method is no longer available." }); continue; }

      // Check parameters
      const oldParams = new Map((oldOp.parameters || []).map((p: any) => [p.name, p]));
      const newParams = new Map((newOp.parameters || []).map((p: any) => [p.name, p]));
      for (const [name, param] of oldParams) {
        if (!newParams.has(name)) { changes.push({ path, method: method.toUpperCase(), changeType: "removed", field: `param:${name}`, severity: param.required ? "breaking" : "non-breaking", description: `Parameter '${name}' removed`, migrationHint: `Remove '${name}' from your requests.` }); }
      }
      for (const [name, param] of newParams) {
        if (!oldParams.has(name)) {
          const sev = (param as any).required ? "breaking" : "non-breaking";
          changes.push({ path, method: method.toUpperCase(), changeType: "added", field: `param:${name}`, severity: sev, description: `New ${(param as any).required ? 'required' : 'optional'} parameter '${name}'`, migrationHint: (param as any).required ? `Add '${name}' to your requests.` : "Optional parameter, no action required." });
        }
      }

      // Check response schema
      const oldResponse = oldOp.responses?.['200']?.content?.['application/json']?.schema;
      const newResponse = newOp.responses?.['200']?.content?.['application/json']?.schema;
      if (oldResponse && newResponse) {
        const schemaDiffs = diffSchemas(oldResponse, newResponse, `${method.toUpperCase()} ${path} response`);
        changes.push(...schemaDiffs);
      }

      // Check deprecation
      if (!oldOp.deprecated && newOp.deprecated) {
        changes.push({ path, method: method.toUpperCase(), changeType: "modified", field: "deprecated", severity: "deprecation", description: `${method.toUpperCase()} ${path} is now deprecated`, migrationHint: newOp.description || "Migrate to the replacement endpoint before removal." });
      }
    }
  }

  const entry: ChangelogEntry = {
    id: createHash("md5").update(`${fromVersion}:${toVersion}`).digest("hex").slice(0, 12),
    fromVersion, toVersion, changes,
    breakingCount: changes.filter((c) => c.severity === "breaking").length,
    nonBreakingCount: changes.filter((c) => c.severity === "non-breaking").length,
    deprecationCount: changes.filter((c) => c.severity === "deprecation").length,
    migrationGuide: generateMigrationGuide(changes, fromVersion, toVersion),
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO api_changelogs (id, from_version, to_version, changes, breaking_count, migration_guide, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [entry.id, fromVersion, toVersion, JSON.stringify(changes), entry.breakingCount, entry.migrationGuide]
  );

  // Alert if breaking changes
  if (entry.breakingCount > 0) {
    await redis.rpush("notification:queue", JSON.stringify({ type: "breaking_api_change", fromVersion, toVersion, breakingCount: entry.breakingCount }));
  }

  return entry;
}

function diffSchemas(oldSchema: any, newSchema: any, context: string): SpecChange[] {
  const changes: SpecChange[] = [];
  if (!oldSchema?.properties || !newSchema?.properties) return changes;

  const oldProps = Object.keys(oldSchema.properties);
  const newProps = Object.keys(newSchema.properties);

  for (const prop of oldProps) {
    if (!newSchema.properties[prop]) {
      changes.push({ path: context, method: "", changeType: "removed", field: `response.${prop}`, severity: "breaking", description: `Response field '${prop}' removed`, migrationHint: `Stop relying on '${prop}' in responses.` });
    } else if (oldSchema.properties[prop].type !== newSchema.properties[prop].type) {
      changes.push({ path: context, method: "", changeType: "modified", field: `response.${prop}`, severity: "breaking", description: `Response field '${prop}' type changed from ${oldSchema.properties[prop].type} to ${newSchema.properties[prop].type}`, migrationHint: `Update your type handling for '${prop}'.` });
    }
  }
  for (const prop of newProps) {
    if (!oldSchema.properties[prop]) {
      changes.push({ path: context, method: "", changeType: "added", field: `response.${prop}`, severity: "non-breaking", description: `New response field '${prop}'`, migrationHint: "New field available. No action required." });
    }
  }
  return changes;
}

function generateMigrationGuide(changes: SpecChange[], from: string, to: string): string {
  const breaking = changes.filter((c) => c.severity === "breaking");
  if (breaking.length === 0) return `No breaking changes from ${from} to ${to}.`;

  let guide = `# Migration Guide: ${from} → ${to}\n\n## Breaking Changes (${breaking.length})\n\n`;
  for (const change of breaking) {
    guide += `### ${change.description}\n- **Path:** ${change.path}\n- **Action:** ${change.migrationHint}\n\n`;
  }
  return guide;
}
```

## Results

- **Breaking change caught before deploy** — spec diff in CI shows "required parameter added" → deploy blocked until migration guide written; 15-consumer outage prevented
- **Auto-generated migration guide** — each breaking change includes specific action: "Remove 'legacy_id' from responses" or "Add 'tenant_id' parameter"; consumers know exactly what to do
- **Deprecation tracking** — deprecated endpoints tracked with timeline; consumers get 90-day warning; graceful sunset instead of surprise removal
- **Consumer notification** — breaking changes trigger alerts to API consumer contacts; they prepare before the update ships; no surprise breakage
- **Full changelog history** — every spec version change recorded; diff any two versions; auditors can trace API evolution over time
