---
title: Build a Data Mesh with Self-Serve Analytics
slug: build-data-mesh-with-self-serve-analytics
description: >
  Decentralize your monolithic data warehouse into domain-owned data products
  that teams publish and consume independently — cutting analytics request
  backlog from 6 weeks to same-day.
skills:
  - typescript
  - postgresql
  - kafka-js
  - prisma
  - zod
  - hono
  - redis
category: Data Engineering
tags:
  - data-mesh
  - data-products
  - analytics
  - self-serve
  - domain-driven
  - data-contracts
---

# Build a Data Mesh with Self-Serve Analytics

## The Problem

Yuki is VP of Engineering at a 200-person e-commerce company. Every analytics request goes through a 4-person data team. The backlog is 6 weeks deep. Marketing wants campaign attribution data — they wait 3 weeks. Product needs funnel metrics for a board meeting next Tuesday — they scrape it from logs manually. The data team built 400+ dbt models in a monolithic warehouse, and nobody else understands which tables are trustworthy. Last quarter, the CEO made a hiring decision based on a dashboard that was pulling from a deprecated table — the numbers were 3 months stale.

Yuki needs:
- **Domain ownership** — each team (product, marketing, finance) owns and publishes their data
- **Data products** — discoverable, documented, quality-guaranteed datasets with SLAs
- **Self-serve access** — business users query data without filing tickets to the data team
- **Data contracts** — schema and quality guarantees so consumers can trust what they read
- **Federated governance** — global standards (naming, PII handling) with domain autonomy
- **Discovery catalog** — find what data exists, who owns it, and whether it's fresh

## Step 1: Data Product Schema

Every data product has an owner, a schema contract, quality checks, and an SLA.

```typescript
// src/catalog/data-product.ts
// Defines the contract for a publishable data product

import { z } from 'zod';

export const QualityCheck = z.object({
  name: z.string(),
  type: z.enum(['not_null', 'unique', 'range', 'freshness', 'row_count', 'custom_sql']),
  column: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  severity: z.enum(['error', 'warning']),
});

export const DataProduct = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]*$/),  // domain.product_name
  domain: z.string(),           // owning team: 'marketing', 'product', 'finance'
  name: z.string(),
  description: z.string(),
  owner: z.object({
    team: z.string(),
    contact: z.string().email(),
    slackChannel: z.string(),
  }),
  schema: z.array(z.object({
    column: z.string(),
    type: z.enum(['string', 'integer', 'float', 'boolean', 'timestamp', 'json', 'array']),
    description: z.string(),
    pii: z.boolean().default(false),    // personally identifiable information
    nullable: z.boolean().default(true),
  })),
  sla: z.object({
    freshness: z.enum(['realtime', '1h', '4h', '24h']),  // max data staleness
    availability: z.number().min(99).max(100),             // uptime %
    queryLatencyP95Ms: z.number().positive(),
  }),
  qualityChecks: z.array(QualityCheck),
  tags: z.array(z.string()),
  version: z.number().int().positive(),
  publishedAt: z.string().datetime(),
  status: z.enum(['draft', 'published', 'deprecated']),
});

export type DataProduct = z.infer<typeof DataProduct>;
```

```typescript
// Example: Marketing team's campaign attribution data product
const campaignAttribution: DataProduct = {
  id: 'marketing.campaign_attribution',
  domain: 'marketing',
  name: 'Campaign Attribution',
  description: 'Multi-touch attribution for all marketing campaigns. Updated hourly. Covers web, email, and paid channels.',
  owner: {
    team: 'Marketing Analytics',
    contact: 'marketing-data@company.com',
    slackChannel: '#marketing-data',
  },
  schema: [
    { column: 'attribution_id', type: 'string', description: 'Unique attribution record ID', pii: false, nullable: false },
    { column: 'user_id', type: 'string', description: 'Anonymized user identifier', pii: true, nullable: false },
    { column: 'campaign_id', type: 'string', description: 'Campaign identifier', pii: false, nullable: false },
    { column: 'channel', type: 'string', description: 'Acquisition channel (organic, paid, email, referral)', pii: false, nullable: false },
    { column: 'touchpoint_at', type: 'timestamp', description: 'When the user interacted with the campaign', pii: false, nullable: false },
    { column: 'conversion_at', type: 'timestamp', description: 'When the user converted (null if not converted)', pii: false, nullable: true },
    { column: 'revenue_cents', type: 'integer', description: 'Revenue attributed to this touchpoint (multi-touch weighted)', pii: false, nullable: true },
    { column: 'attribution_model', type: 'string', description: 'Model used: linear, time_decay, position_based', pii: false, nullable: false },
  ],
  sla: {
    freshness: '1h',
    availability: 99.5,
    queryLatencyP95Ms: 2000,
  },
  qualityChecks: [
    { name: 'no_null_campaign_ids', type: 'not_null', column: 'campaign_id', severity: 'error' },
    { name: 'valid_channels', type: 'custom_sql', severity: 'error',
      params: { sql: "SELECT COUNT(*) FROM campaign_attribution WHERE channel NOT IN ('organic','paid','email','referral','social','direct')" }},
    { name: 'hourly_freshness', type: 'freshness', column: 'touchpoint_at', severity: 'error',
      params: { maxStaleHours: 2 }},
    { name: 'daily_row_count', type: 'row_count', severity: 'warning',
      params: { minRows: 1000, maxRows: 500000 }},
  ],
  tags: ['marketing', 'attribution', 'campaigns', 'revenue'],
  version: 3,
  publishedAt: '2025-03-01T00:00:00Z',
  status: 'published',
};
```

## Step 2: Data Contract Validator

Before a data product is published, validate it meets the contract.

```typescript
// src/quality/contract-validator.ts
// Validates data against its product contract

import { Pool } from 'pg';
import type { DataProduct, QualityCheck } from '../catalog/data-product';

const db = new Pool({ connectionString: process.env.WAREHOUSE_URL });

interface ValidationResult {
  checkName: string;
  passed: boolean;
  severity: string;
  message: string;
  value?: number;
}

export async function validateDataProduct(product: DataProduct): Promise<{
  valid: boolean;
  results: ValidationResult[];
}> {
  const results: ValidationResult[] = [];
  const tableName = product.id.replace('.', '_');  // marketing.campaign_attribution → marketing_campaign_attribution

  for (const check of product.qualityChecks) {
    const result = await runCheck(tableName, check);
    results.push(result);
  }

  // Schema validation — check all declared columns exist with correct types
  const schemaResult = await validateSchema(tableName, product.schema);
  results.push(...schemaResult);

  const hasErrors = results.some(r => !r.passed && r.severity === 'error');

  return { valid: !hasErrors, results };
}

async function runCheck(table: string, check: QualityCheck): Promise<ValidationResult> {
  try {
    switch (check.type) {
      case 'not_null': {
        const { rows } = await db.query(
          `SELECT COUNT(*) as nulls FROM ${table} WHERE ${check.column} IS NULL`
        );
        const nullCount = parseInt(rows[0].nulls);
        return {
          checkName: check.name,
          passed: nullCount === 0,
          severity: check.severity,
          message: nullCount === 0 ? 'No nulls found' : `${nullCount} null values in ${check.column}`,
          value: nullCount,
        };
      }

      case 'freshness': {
        const maxStaleHours = (check.params?.maxStaleHours as number) ?? 24;
        const { rows } = await db.query(
          `SELECT EXTRACT(EPOCH FROM NOW() - MAX(${check.column})) / 3600 as hours_stale FROM ${table}`
        );
        const staleHours = parseFloat(rows[0].hours_stale ?? '999');
        return {
          checkName: check.name,
          passed: staleHours <= maxStaleHours,
          severity: check.severity,
          message: `Data is ${staleHours.toFixed(1)}h stale (max: ${maxStaleHours}h)`,
          value: staleHours,
        };
      }

      case 'row_count': {
        const { rows } = await db.query(`SELECT COUNT(*) as cnt FROM ${table}`);
        const count = parseInt(rows[0].cnt);
        const min = (check.params?.minRows as number) ?? 0;
        const max = (check.params?.maxRows as number) ?? Infinity;
        return {
          checkName: check.name,
          passed: count >= min && count <= max,
          severity: check.severity,
          message: `${count} rows (expected ${min}-${max})`,
          value: count,
        };
      }

      case 'custom_sql': {
        const sql = check.params?.sql as string;
        const { rows } = await db.query(sql);
        const value = parseInt(rows[0]?.count ?? '0');
        return {
          checkName: check.name,
          passed: value === 0,
          severity: check.severity,
          message: value === 0 ? 'Custom check passed' : `${value} violations found`,
          value,
        };
      }

      default:
        return {
          checkName: check.name, passed: true,
          severity: check.severity, message: 'Check type not implemented',
        };
    }
  } catch (err: any) {
    return {
      checkName: check.name, passed: false,
      severity: check.severity, message: `Check failed: ${err.message}`,
    };
  }
}

async function validateSchema(
  table: string,
  expectedSchema: DataProduct['schema']
): Promise<ValidationResult[]> {
  const { rows: columns } = await db.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position
  `, [table]);

  const results: ValidationResult[] = [];
  for (const expected of expectedSchema) {
    const actual = columns.find((c: any) => c.column_name === expected.column);
    if (!actual) {
      results.push({
        checkName: `schema_${expected.column}`,
        passed: false,
        severity: 'error',
        message: `Column ${expected.column} not found in table`,
      });
    }
  }

  return results;
}
```

## Step 3: Data Product Catalog API

```typescript
// src/api/catalog.ts
// Discovery API — find, browse, and search data products

import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';

const app = new Hono();
const prisma = new PrismaClient();

// Search data products
app.get('/v1/catalog/search', async (c) => {
  const query = c.req.query('q') ?? '';
  const domain = c.req.query('domain');
  const tag = c.req.query('tag');

  const products = await prisma.dataProduct.findMany({
    where: {
      status: 'published',
      ...(domain && { domain }),
      ...(tag && { tags: { has: tag } }),
      ...(query && {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { tags: { has: query.toLowerCase() } },
        ],
      }),
    },
    orderBy: { publishedAt: 'desc' },
  });

  return c.json({
    count: products.length,
    products: products.map(p => ({
      id: p.id,
      domain: p.domain,
      name: p.name,
      description: p.description,
      owner: p.owner,
      sla: p.sla,
      tags: p.tags,
      version: p.version,
      status: p.status,
      lastValidated: p.lastValidatedAt,
      qualityScore: p.qualityScore,  // 0-100 based on recent checks
    })),
  });
});

// Get full product details including schema and quality history
app.get('/v1/catalog/products/:id', async (c) => {
  const id = c.req.param('id');
  const product = await prisma.dataProduct.findUnique({
    where: { id },
    include: {
      qualityHistory: {
        orderBy: { checkedAt: 'desc' },
        take: 30,  // last 30 quality checks
      },
      consumers: {
        select: { team: true, useCase: true },
      },
    },
  });

  if (!product) return c.json({ error: 'Not found' }, 404);
  return c.json(product);
});

// List all domains
app.get('/v1/catalog/domains', async (c) => {
  const domains = await prisma.dataProduct.groupBy({
    by: ['domain'],
    _count: { id: true },
    where: { status: 'published' },
  });

  return c.json(domains.map(d => ({
    domain: d.domain,
    productCount: d._count.id,
  })));
});

// Register as a consumer of a data product (for lineage tracking)
app.post('/v1/catalog/products/:id/consumers', async (c) => {
  const id = c.req.param('id');
  const { team, useCase, contact } = await c.req.json();

  await prisma.dataProductConsumer.create({
    data: { dataProductId: id, team, useCase, contact },
  });

  return c.json({ registered: true });
});

export default app;
```

## Step 4: Self-Serve Query Layer

Business users query data products through a governed SQL interface with PII masking.

```typescript
// src/query/self-serve.ts
// Governed query layer — users query data products with automatic PII masking

import { Pool } from 'pg';
import type { DataProduct } from '../catalog/data-product';

const warehouse = new Pool({ connectionString: process.env.WAREHOUSE_URL });

interface QueryRequest {
  sql: string;
  userId: string;
  userRole: string;  // 'analyst', 'manager', 'admin'
}

export async function executeGoverned(
  request: QueryRequest,
  product: DataProduct
): Promise<{ rows: any[]; rowCount: number; queryTimeMs: number }> {
  // 1. Parse and validate the query targets only this product's table
  const tableName = product.id.replace('.', '_');
  if (!request.sql.toLowerCase().includes(tableName)) {
    throw new Error(`Query must reference the data product table: ${tableName}`);
  }

  // 2. Apply PII masking based on user role
  let maskedSql = request.sql;
  if (request.userRole !== 'admin') {
    const piiColumns = product.schema
      .filter(c => c.pii)
      .map(c => c.column);

    for (const col of piiColumns) {
      // Replace PII column references with masked versions
      const maskExpr = `'***' || RIGHT(${col}, 4)`;  // show last 4 chars
      maskedSql = maskedSql.replace(
        new RegExp(`\\b${col}\\b`, 'gi'),
        `(${maskExpr}) AS ${col}`
      );
    }
  }

  // 3. Add row limit for safety
  if (!maskedSql.toLowerCase().includes('limit')) {
    maskedSql += ' LIMIT 10000';
  }

  // 4. Execute with timeout
  const start = Date.now();
  const result = await warehouse.query({
    text: maskedSql,
    // 30-second query timeout
    statement_timeout: 30_000,
  } as any);

  return {
    rows: result.rows,
    rowCount: result.rowCount ?? 0,
    queryTimeMs: Date.now() - start,
  };
}
```

## Results

After 4 months of data mesh adoption across 5 domains:

- **Analytics request backlog**: eliminated — dropped from 6 weeks to same-day self-serve
- **Data team role shift**: from 80% ad-hoc queries to 80% platform development and data quality
- **Data products published**: 23 products across 5 domains (marketing, product, finance, ops, engineering)
- **Self-serve queries**: 450/day by business users (was 0 — everything went through data team)
- **Data quality score**: 94% average across all products (automated checks run hourly)
- **Stale data incidents**: 2 in 4 months (was 8/month — SLA monitoring catches them instantly)
- **CEO dashboard**: now pulls from 3 validated data products with freshness guarantees, not a deprecated table
- **PII compliance**: 100% of queries from non-admin users get automatic masking — zero manual reviews needed
- **Time to publish new data product**: 2 days (domain team does it themselves with the template)
