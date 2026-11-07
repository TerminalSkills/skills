---
name: postgres-js
description: >-
  Postgres.js is a PostgreSQL client for Node.js, Bun and Deno that builds safe parameterized queries from tagged template literals. Use it when asked to "connect Node to Postgres", "run a SQL query from TypeScript", "insert rows with postgres.js", "use a transaction", "listen for Postgres notifications", "stream a big result set with a cursor", or "cancel a slow query". Covers v4 connection options, dynamic inserts and filters, transactions, cursors, LISTEN/NOTIFY, timeouts, TLS and PgBouncer settings.
license: Apache-2.0
compatibility: "Node.js 20+ (or Bun), a reachable PostgreSQL server"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "postgres, postgresql, nodejs, sql, database-client"
  repository: https://github.com/porsager/postgres
---

# Postgres.js — PostgreSQL client with tagged template queries

## Overview

Postgres.js (npm package `postgres`, current major 4) is a dependency-free, ES-module PostgreSQL client. Every value written as `${value}` inside a template literal is sent as a bound parameter, so queries are not built by string concatenation and cannot be injected through values. It pools connections, pipelines queries, prepares statements automatically, and supports transactions, cursors, COPY streams, LISTEN/NOTIFY and logical-replication subscriptions.

This skill is the Node client. For the database itself (schemas, indexes, tuning) use the `postgresql` skill.

## Instructions

### Installation

```bash
npm install postgres
```

It is ESM. In an ES module use `import postgres from 'postgres'`. From CommonJS use `const postgres = require('postgres').default`, which works on Node.js 20.19, 22.12 and later. Types ship with the package.

### Connect

Create one `sql` instance per process and share it. Pass a URL, options, or both (options win over the URL). With no arguments it reads the same environment variables as `psql` (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`).

```ts
// db.ts
import postgres from 'postgres'

export const sql = postgres(process.env.DATABASE_URL!, {
  max: 10,              // pool size (default 10)
  idle_timeout: 30,     // close idle connections after 30 s (default 0 = never)
  connect_timeout: 10,  // seconds (default 30)
  queue_timeout: 5,     // fail a query that waits more than 5 s for a free connection
})
```

Connections open lazily on the first query. Call `await sql.end({ timeout: 5 })` before the process exits so it does not hang.

### Queries

A query returns an array of row objects, and the array also carries `count` (rows affected) and `command` (`SELECT`, `INSERT`...).

```ts
const minTotal = 2000
const orders = await sql`
  select id, customer, total_cents
  from orders
  where total_cents > ${minTotal}
  order by id
`
const result = await sql`select count(*)::int as n from orders`
console.log(result[0].n, result.count, result.command) // 2 1 SELECT
```

Never put quotes around `${...}`. Postgres returns `bigint` and `numeric` columns as strings; cast in SQL (`::int`) or convert in code when the value is small enough.

Typed rows with TypeScript: `await sql<{ id: number; customer: string }[]>\`select id, customer from orders\``.

### Dynamic inserts, updates, lists and identifiers

```ts
const rows = [
  { customer: 'Marta Ilves', total_cents: 4200 },
  { customer: 'Joel Brandt', total_cents: 1999 },
]
// one multi-row insert; the listed keys pick the columns
const inserted = await sql`insert into orders ${sql(rows, 'customer', 'total_cents')} returning id, customer`

// update from an object
await sql`update orders set ${sql({ status: 'paid' }, 'status')} where id = ${inserted[0].id}`

// IN lists: either form works
const ids = inserted.map(r => r.id)
await sql`select * from orders where id in ${sql(ids)}`
await sql`select * from orders where id = any(${ids})`

// identifiers (column or table names) are quoted by sql(name)
const sortColumn = 'total_cents' // validate against an allow-list first
await sql`select * from orders order by ${sql(sortColumn)} desc`
```

JSON values: `${sql.json({ source: 'web' })}` writes a `json`/`jsonb` parameter.

### Conditional filters

Nest `sql\`\`` fragments; an empty fragment adds nothing.

```ts
async function findOrders(filter: { minTotal?: number; customer?: string }) {
  const conditions = sql`and`.join([
    filter.minTotal !== undefined && sql`total_cents > ${filter.minTotal}`,
    filter.customer && sql`customer = ${filter.customer}`,
  ])
  return sql`select * from orders ${conditions.length ? sql`where ${conditions}` : sql``}`
}
```

`join` drops `false`, `null` and `undefined` entries.

### Transactions

`sql.begin` runs the callback on one connection, commits when it resolves and rolls back when it throws. Use the callback's own `tx`, never the outer `sql`, inside it.

```ts
const [order] = await sql.begin(async tx => {
  const [order] = await tx`insert into orders (customer, total_cents) values (${'Marta Ilves'}, ${4200}) returning *`
  await tx`update stock set qty = qty - 1 where sku = ${'KB-104'}`
  return [order]
})
```

A savepoint inside a transaction: `await tx.savepoint(async sp => { ... })`. Throwing inside it rolls back only the savepoint.

### Cursors and large result sets

```ts
// batches of 500 rows
await sql`select * from events order by id`.cursor(500, async rows => {
  await processBatch(rows)
})

// one row at a time
for await (const [row] of sql`select * from events`.cursor()) {
  console.log(row.id)
}
```

### LISTEN / NOTIFY

```ts
await sql.listen('orders_changed', payload => console.log('changed:', payload))
await sql.notify('orders_changed', JSON.stringify({ id: 42 }))
```

Use a direct connection or a session-mode pooler for `listen`. `sql.listen` reconnects and re-subscribes after a dropped connection.

### Timeouts and cancellation

```ts
await sql`select * from slow_report()`.signal(AbortSignal.timeout(5000)) // rejects with code 57014
const q = sql`select pg_sleep(100)`.execute()
setTimeout(() => q.cancel(), 100)
```

Cancellation sends a cancel request on a second connection, so it is best effort. For a hard limit set `statement_timeout` on the server or through `connection: { statement_timeout: 5000 }` in the options.

### Errors

Server errors are `PostgresError` with the SQLSTATE in `error.code` (`23505` unique violation, `42P01` missing table, `57014` cancelled, `28P01` bad password). Postgres.js's own codes include `QUEUE_TIMEOUT`.

```ts
try {
  await sql`insert into users (email) values (${email})`
} catch (error: any) {
  if (error.code === '23505') return { conflict: true }
  throw error
}
```

### TLS, poolers, column naming

```ts
postgres(url, { ssl: 'require' })              // encrypt, no certificate check
postgres(url, { ssl: 'verify-full' })          // encrypt and verify against system CAs
postgres(url, { prepare: false })              // PgBouncer in transaction mode without prepared-statement support
postgres(url, { transform: postgres.camel })   // user_id -> userId in results
```

Use `sslmode=require` in the URL as an alternative to the `ssl` option. Behind a transaction-mode pooler, `listen` and `set` outside a transaction do not work.

### Upgrading from v3

The API is mostly the same. Parameter types are now decided by the server, so a JS `Date` written to a `timestamp` (without time zone) or `date` column outside UTC can behave differently from v3; set `infer: true` to restore v3's typing, or cast in SQL (`${d}::timestamptz`).

## Examples

### 1. Add an order and its line items atomically

Request: "Save Marta's cart as one order with three items, or nothing if any insert fails."

```ts
import { sql } from './db'

const items = [
  { sku: 'KB-104', qty: 1, price_cents: 8900 },
  { sku: 'MS-220', qty: 2, price_cents: 2500 },
  { sku: 'CB-USB', qty: 1, price_cents: 900 },
]

const orderId = await sql.begin(async tx => {
  const [{ id }] = await tx`insert into orders (customer, total_cents)
    values (${'Marta Ilves'}, ${items.reduce((s, i) => s + i.qty * i.price_cents, 0)}) returning id`
  await tx`insert into order_items ${tx(items.map(i => ({ ...i, order_id: id })), 'order_id', 'sku', 'qty', 'price_cents')}`
  return id
})
console.log('saved order', orderId)
```

Result: one transaction with a single multi-row insert for the items. A failing statement throws out of `sql.begin` and nothing is stored.

### 2. Stream a table to CSV without loading it into memory

Request: "Export all 2 million events to a file."

```ts
import { createWriteStream } from 'node:fs'
import { sql } from './db'

const out = createWriteStream('events.csv')
out.write('id,type,created_at\n')
await sql`select id, type, created_at from events order by id`.cursor(1000, rows => {
  for (const r of rows) out.write(`${r.id},${r.type},${r.created_at.toISOString()}\n`)
})
out.end()
await sql.end({ timeout: 5 })
```

Result: memory stays near one batch (1000 rows) while the whole table is written.

### 3. React to database changes

Request: "Print a line whenever the orders table notifies."

```sql
-- once, in psql
create function notify_order() returns trigger as $$
begin perform pg_notify('orders_changed', new.id::text); return new; end $$ language plpgsql;
create trigger orders_notify after insert on orders for each row execute function notify_order();
```

```ts
await sql.listen('orders_changed', id => console.log('new order', id))
```

Result: `new order 43` is printed for every inserted row.

## Guidelines

- Create one `sql` instance and reuse it; do not create one per request. End it on shutdown.
- Never build SQL by joining strings. Values go in `${}`; identifiers go through `sql(name)` and must come from an allow-list, never straight from user input. `sql.unsafe(string)` runs raw text and is only for trusted strings.
- Inside `sql.begin`, use the `tx` argument. A query on the outer `sql` runs outside the transaction.
- A pool of 10 connections per process multiplies fast across replicas. Keep `max` under the server's `max_connections` divided by the number of processes.
- Read the connection string from an environment variable such as `DATABASE_URL`; do not commit it.
- Use `prepare: false` with a pooler that does not support prepared statements, and a direct connection for `listen` and `subscribe`.
- Not the right tool when you want an ORM, schema migrations or generated types; pair it with a migration tool or a query builder in that case.
