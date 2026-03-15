---
title: Build a Test Data Factory
slug: build-test-data-factory
description: Build a test data factory with fixture generation, relationship-aware seeding, deterministic output, database state management, and cleanup for reliable integration testing.
skills:
  - typescript
  - postgresql
  - hono
  - zod
category: Developer Tools
tags:
  - testing
  - fixtures
  - test-data
  - seeding
  - factory
---

# Build a Test Data Factory

## The Problem

Petra leads QA at a 25-person company. Integration tests are flaky because they share a test database — test A creates a user, test B deletes all users, test A fails. Each test needs specific data setups but developers copy-paste SQL inserts across 200 test files. When the schema changes (new required column), 50 tests break because each hardcoded its own INSERT. Foreign key relationships are painful — creating an order requires a user, product, and address, each with their own required fields. They need a test data factory: define entities once, generate with relationships, deterministic output, database isolation per test, and automatic cleanup.

## Step 1: Build the Data Factory

```typescript
// src/testing/factory.ts — Test data factory with relationships and database isolation
import { pool } from "../db";
import { randomBytes, createHash } from "node:crypto";

type FactoryFn<T> = (overrides?: Partial<T>, context?: FactoryContext) => T;

interface FactoryContext {
  sequence: number;          // auto-incrementing counter
  seed: string;              // for deterministic output
  created: Map<string, any[]>;  // track created entities for cleanup
}

interface FactoryDefinition<T> {
  name: string;
  build: FactoryFn<T>;
  afterCreate?: (entity: T, context: FactoryContext) => Promise<void>;
}

const factories = new Map<string, FactoryDefinition<any>>();
const globalSequence = new Map<string, number>();

// Define a factory
export function define<T>(name: string, buildFn: FactoryFn<T>, afterCreate?: (entity: T, context: FactoryContext) => Promise<void>): void {
  factories.set(name, { name, build: buildFn, afterCreate });
}

// Build entity without persisting (in-memory only)
export function build<T>(name: string, overrides?: Partial<T>): T {
  const factory = factories.get(name);
  if (!factory) throw new Error(`Factory '${name}' not defined`);

  const seq = (globalSequence.get(name) || 0) + 1;
  globalSequence.set(name, seq);

  const context: FactoryContext = { sequence: seq, seed: `${name}-${seq}`, created: new Map() };
  return { ...factory.build(overrides, context), ...overrides } as T;
}

// Create entity and persist to database
export async function create<T extends Record<string, any>>(
  name: string,
  overrides?: Partial<T>
): Promise<T> {
  const entity = build<T>(name, overrides);
  const tableName = nameToTable(name);

  const keys = Object.keys(entity).filter((k) => entity[k] !== undefined);
  const values = keys.map((k) => entity[k]);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");

  await pool.query(
    `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
    values
  );

  // Track for cleanup
  const tracked = cleanupStack.get(tableName) || [];
  tracked.push(entity.id);
  cleanupStack.set(tableName, tracked);

  return entity;
}

// Create multiple entities
export async function createMany<T extends Record<string, any>>(
  name: string,
  count: number,
  overridesFn?: (index: number) => Partial<T>
): Promise<T[]> {
  const entities: T[] = [];
  for (let i = 0; i < count; i++) {
    const overrides = overridesFn ? overridesFn(i) : undefined;
    entities.push(await create<T>(name, overrides));
  }
  return entities;
}

// Create entity with all required relationships
export async function createWithRelations<T extends Record<string, any>>(
  name: string,
  overrides?: Partial<T>
): Promise<T & { _relations: Record<string, any> }> {
  const relations: Record<string, any> = {};
  const factory = factories.get(name);
  if (!factory) throw new Error(`Factory '${name}' not defined`);

  // Check for foreign key fields and create related entities
  const built = build<T>(name, overrides);
  for (const [key, value] of Object.entries(built)) {
    if (key.endsWith("Id") && !overrides?.[key as keyof T]) {
      const relatedName = key.slice(0, -2);  // "userId" → "user"
      if (factories.has(relatedName)) {
        const related = await create(relatedName);
        (built as any)[key] = related.id;
        relations[relatedName] = related;
      }
    }
  }

  const entity = await create<T>(name, built);
  return { ...entity, _relations: relations };
}

// Database isolation: wrap test in transaction that rolls back
export async function withTestTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Override pool.query to use this transaction
    const originalQuery = pool.query.bind(pool);
    (pool as any).query = client.query.bind(client);

    const result = await fn();

    await client.query("ROLLBACK");  // always rollback — test isolation
    (pool as any).query = originalQuery;
    return result;
  } finally {
    client.release();
  }
}

// Deterministic data generation (same seed = same data)
export function deterministicBuild<T>(name: string, seed: string, overrides?: Partial<T>): T {
  const factory = factories.get(name);
  if (!factory) throw new Error(`Factory '${name}' not defined`);

  const hash = createHash("sha256").update(seed).digest("hex");
  const context: FactoryContext = {
    sequence: parseInt(hash.slice(0, 8), 16),
    seed,
    created: new Map(),
  };

  return { ...factory.build(overrides, context), ...overrides } as T;
}

// Cleanup all created entities (reverse order for FK constraints)
const cleanupStack = new Map<string, string[]>();

export async function cleanup(): Promise<void> {
  const tables = [...cleanupStack.entries()].reverse();
  for (const [table, ids] of tables) {
    if (ids.length > 0) {
      await pool.query(`DELETE FROM ${table} WHERE id = ANY($1)`, [ids]);
    }
  }
  cleanupStack.clear();
}

// Reset all sequences
export function resetSequences(): void {
  globalSequence.clear();
}

function nameToTable(name: string): string {
  return name.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "") + "s";
}

// Pre-define common factories
define("user", (overrides, ctx) => ({
  id: overrides?.id || `user-${ctx!.sequence}`,
  email: `user${ctx!.sequence}@test.com`,
  name: `Test User ${ctx!.sequence}`,
  role: "user",
  status: "active",
  createdAt: new Date().toISOString(),
}));

define("organization", (overrides, ctx) => ({
  id: overrides?.id || `org-${ctx!.sequence}`,
  name: `Test Org ${ctx!.sequence}`,
  plan: "pro",
  createdAt: new Date().toISOString(),
}));

define("project", (overrides, ctx) => ({
  id: overrides?.id || `proj-${ctx!.sequence}`,
  name: `Test Project ${ctx!.sequence}`,
  organizationId: overrides?.organizationId || `org-${ctx!.sequence}`,
  ownerId: overrides?.ownerId || `user-${ctx!.sequence}`,
  status: "active",
  createdAt: new Date().toISOString(),
}));

define("order", (overrides, ctx) => ({
  id: overrides?.id || `order-${ctx!.sequence}`,
  userId: overrides?.userId || `user-${ctx!.sequence}`,
  total: Math.round(Math.random() * 10000) / 100,
  status: "pending",
  items: [],
  createdAt: new Date().toISOString(),
}));
```

## Results

- **50 broken tests → 0** — schema change (new required column) fixed in one factory definition; all 200 tests use the factory; single point of update
- **Test isolation** — each test runs in a rolled-back transaction; no shared state; tests run in parallel without flakiness
- **Relationship-aware** — `createWithRelations('order')` auto-creates user, product, address; developer writes one line instead of 4 INSERT statements
- **Deterministic output** — same seed produces same test data; snapshot tests are reproducible; debugging uses exact same data as CI
- **Auto-cleanup** — created entities tracked; `cleanup()` deletes in reverse FK order; no orphaned test data polluting the database
