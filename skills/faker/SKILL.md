---
name: faker
description: >-
  Generates realistic, repeatable test data with @faker-js/faker: typed factories, seeded output, locale-aware names and addresses, related records and database seed scripts. Use when the user asks for "fake data", "faker", "seed data", "mock data", "test data factory", "random but reproducible test data" or needs to fill a dev database or fixtures without copying production data.
license: Apache-2.0
compatibility: "Node.js 20+ (@faker-js/faker 10 is ESM and CJS, TypeScript types included); works under Vitest, Jest, Playwright and plain scripts. Python projects can use the Faker package instead (pip install faker)"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: "test-data, faker, seeding, fixtures"
  repository: https://github.com/faker-js/faker
---

# Realistic Test Data with Faker

## Overview

`@faker-js/faker` generates plausible names, emails, addresses, prices, dates and free text. It is the right tool when a test or a dev database needs data that looks real and varies, without using real people's records. The two things that decide whether it helps or hurts are repeatability (the same run must give the same data, or failures cannot be reproduced) and consistency (an invoice whose VAT does not match its net amount teaches your tests nothing).

This skill covers the JavaScript/TypeScript library, current major version 10 (verified with 10.6.0). Python's `Faker` has the same idea and a similar API (`Faker.seed(1)`, `fake.name()`), but the module names below are JavaScript only.

Not for: load testing with millions of rows where speed matters more than realism (generate with SQL or a streaming script), anonymising real data (use a masking tool; faker output is unrelated to the source), or security fixtures such as real-looking card numbers that must pass a payment processor (use the processor's test values).

## Instructions

### 1. Look up before you write

Check `package.json` for an existing faker version and for a factory folder (`test/factories`, `tests/support`, `prisma/seed.ts`). Match the repo's module system and test runner. Ask the user only for what you cannot see: the entity shapes if there is no schema or types, the locales needed, and whether data goes into a test, a fixture file or a dev database.

```bash
npm install --save-dev @faker-js/faker
```

Import the default English instance as `faker`. For other locales import the localized instance, for example `fakerDE`, `fakerPL`, `fakerJA`.

### 2. Make one factory per entity

A factory is a function that returns a complete valid object and accepts overrides. Tests then state only what matters to them.

```js
import { faker } from '@faker-js/faker';

export function buildInvoice(overrides = {}) {
  const net = faker.number.int({ min: 5000, max: 250000 });
  return {
    id: faker.string.uuid(),
    number: `INV-${faker.string.numeric(6)}`,
    customer: {
      name: faker.company.name(),
      email: faker.internet.email({ provider: 'billing.test' }),
    },
    currency: faker.helpers.arrayElement(['EUR', 'USD', 'PLN']),
    netCents: net,
    vatCents: Math.round(net * 0.21),
    issuedAt: faker.date.recent({ days: 60 }),
    status: faker.helpers.arrayElement(['draft', 'sent', 'paid']),
    ...overrides,
  };
}
```

Guidance for fields:
- Money as integer minor units, derived values computed from the base value, not generated separately.
- Emails on a reserved or owned test domain (`.test`, or `billing.test` above) so nothing is ever delivered to a real address.
- Enumerations from the real enum, not free text.
- Optional fields: use `faker.helpers.maybe(() => value, { probability: 0.3 })` so some records omit them. It returns `undefined` otherwise.
- Weighted choices when production skews: `faker.helpers.weightedArrayElement([{ weight: 8, value: 'member' }, { weight: 2, value: 'admin' }])`.

### 3. Make it repeatable

Call `faker.seed(n)` before generating. The same seed gives the same sequence with the same library version.

```js
import { beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';

beforeEach(() => {
  faker.seed(20261022);
  faker.setDefaultRefDate('2026-10-22T08:00:00Z');
});
```

The reference date matters: `faker.date.recent()` and `birthdate()` are relative to "now", so without `setDefaultRefDate` a seeded test still changes from day to day. Seed in `beforeEach` so tests do not depend on execution order. If a failure shows up with random data, print the seed (use a fresh `faker.seed()` return value, or generate one from the CI run number) so it can be replayed.

Upgrading faker can change what a seed produces. Do not store seeded output as a golden file unless the library version is pinned and bumping it is a deliberate step.

### 4. Related records

Generate parents first, then pick from them. Do not call `faker.string.uuid()` for a foreign key and hope it matches.

```js
const customers = faker.helpers.multiple(
  () => ({ id: faker.string.nanoid(8), name: faker.person.fullName() }),
  { count: 20 },
);
const orders = faker.helpers.multiple(
  () => ({
    id: faker.string.uuid(),
    customerId: faker.helpers.arrayElement(customers).id,
    total: faker.number.float({ min: 10, max: 300, fractionDigits: 2 }),
  }),
  { count: 80 },
);
```

For values that must not repeat (usernames, SKUs), use `faker.helpers.uniqueArray(generator, count)` or build the value from the row index, for instance `SKU-${String(i).padStart(5, '0')}`. Random generators alone will eventually collide.

### 5. Locales

Use the localized instance when a field must look right for a market. Do not mix locales inside one record unless that is the point.

```js
import { fakerDE, fakerPL } from '@faker-js/faker';

fakerDE.person.fullName();   // German name
fakerPL.location.zipCode();  // Polish format, e.g. 91-487
```

For fallbacks, create an instance: `new Faker({ locale: [de, en] })` tries German first and English for anything German lacks. Also test with long names, apostrophes, accents and right-to-left text; faker gives these for free when you switch locale.

### 6. Seed a database

Write the script so it can run twice. Use a fixed seed, clear or upsert, and insert in batches.

```js
import { faker } from '@faker-js/faker';

faker.seed(11);
faker.setDefaultRefDate('2026-10-22T00:00:00Z');

const people = faker.helpers.multiple(
  () => ({
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email({ provider: 'seed.test' }),
    createdAt: faker.date.recent({ days: 90 }),
  }),
  { count: 500 },
);
// await db.insertInto('people').values(people).execute();   // batch 500 rows at a time
```

Refuse to run a seed script when `NODE_ENV === 'production'` or when the database URL does not look local; print which database it is about to write to.

### 7. Check the result

Run the code once and read the output: no `undefined` where a value is expected, no collisions, plausible ranges, and the same output on two runs with the same seed. Then run the test suite twice and confirm identical results.

## Examples

### Example 1: factory with seeded tests

Request: "Our invoice tests use hard-coded numbers; make them realistic but stable." Add `test/factories/invoice.js` with `buildInvoice` from step 2. In the test file seed in `beforeEach`, as in step 3, and assert on the invariants rather than on literal values:

```js
it('keeps VAT consistent', () => {
  const invoice = buildInvoice();
  expect(invoice.vatCents).toBe(Math.round(invoice.netCents * 0.21));
});
it('lets a test pin one field', () => {
  expect(buildInvoice({ status: 'paid' }).status).toBe('paid');
});
```

Result: three passing tests, and a second run yields identical data.

### Example 2: developer database with Polish and German customers

Request: "Seed 300 customers, a third from Poland, the rest from Germany." Create `scripts/seed-customers.mjs`. Seed once, loop with the index `i`, choose `i % 3 === 0 ? fakerPL : fakerDE`, build `{ name, street, city, zip, country }` from that one instance, and give each email a unique suffix from `i`. Check by printing five rows and counting each country. The script upserts by email, so running it again changes nothing.

### Example 3: realistic orders for a dashboard

Generate 20 customers first, then 80 orders that point at them, with `issuedAt` spread by `faker.date.between({ from: '2026-01-01', to: '2026-10-01' })`. Sort by date before inserting so auto-increment ids follow time. The dashboard then shows a plausible curve; an exact-value test would instead use a fixed fixture.

## Guidelines

- Never put real customer data into fake data "to make it realistic". Do not generate real-looking national IDs or card numbers that could belong to someone; use documented test numbers.
- Do not assert on faker output directly (`expect(name).toBe('Irving Lang')`). Assert on properties or pin the field by override.
- A seed gives stable data only for one library version and one call order. Adding a field to a factory shifts everything after it.
- Free text (`faker.lorem`) is Latin filler; do not use it where a test checks language or length rules, and do not expect natural sentences.
- Do not call faker in production code paths. Keep it a dev dependency.
- If a test is flaky, rerun it with the printed seed before suspecting the code.
- The default instance is global and shared across test files in the same worker; seed in each test file or in `beforeEach`.
