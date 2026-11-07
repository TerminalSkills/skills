---
title: "Build an Automated Test Data Generation Pipeline with AI"
slug: build-test-data-generation-pipeline
description: "Generate realistic, schema-aware test data at scale for development, staging, and automated testing environments."
skills: [coding-agent, test-generator, data-analysis]
category: development
tags: [testing, test-data, automation, development, data-generation]
---

# Build an Automated Test Data Generation Pipeline with AI

## The Problem

A 20-person SaaS startup runs integration tests against a staging database with 50 rows of hand-crafted test data. The data was written two years ago and no longer reflects real usage patterns -- there are no edge cases, no unicode characters in names, no addresses outside the US, and no records that trigger the new subscription tiers added last quarter.

QA keeps finding bugs in production that never surface in staging because the test data doesn't cover the scenarios real users create. A customer in Tokyo with a name containing kanji? Never tested. A subscription that was downgraded mid-billing-cycle? Not in the dataset. Meanwhile, developers copy production data for local testing, which is a compliance problem since it contains real customer PII.

The test data problem has two sides: too little variety to catch bugs, and too much risk when developers reach for the easy fix of using production dumps. The compliance team has asked three times for production data to be removed from developer machines, and three times it has crept back because there is no viable alternative.

## The Solution

Using the **coding-agent**, **test-generator**, and **data-analysis** skills, the work splits cleanly. The coding agent reads the schema and writes the seed code with [`@faker-js/faker`](https://fakerjs.dev), a seeded, locale-aware generator, so the data is code you can review and rerun rather than something an LLM invents row by row. The test-generator skill writes tests that guard the factories (constraints, determinism, edge-case coverage). The data-analysis skill profiles the generated dataset so you can see whether it has the variety you asked for before any test runs against it.

## Step-by-Step Walkthrough

### Step 1: Analyze the Schema and Relationships

Run the agent non-interactively on the schema (the `coding-agent` skill describes the pattern; `-p` prints one answer and exits, so nothing is written):

```bash
claude -p "Read prisma/schema.prisma. List every model, relation, unique index, enum and required field. Classify each column as: needs realistic personal data (name, email, phone, address), system-generated (id, timestamps), or foreign key. Give the order in which models must be seeded so no foreign key points at a missing row." \
  --permission-mode plan --allowedTools "Read" > /tmp/schema-analysis.md
```

The analysis maps the data model and gives a seed order, for example **Organization -> User -> Project -> Task**, and **Organization -> Subscription**. Fields like `name`, `email`, `phone` and `address` need localized values; `id`, `created_at` and `updated_at` are generated; foreign keys must reference rows that exist.

### Step 2: Generate Data Factories

```text
Create seeded data factories with @faker-js/faker for each model. Include
international names and addresses (US, Germany, Japan, Brazil, Spain),
edge cases (1-character and column-length names, apostrophes, hyphens, emoji
in text fields), and valid foreign keys. Generate 500 organizations and
10,000 users. Use only the reserved example.test domain for emails.
```

The agent writes factories that build on Faker's per-locale instances (`fakerJA`, `fakerDE`, `fakerPT_BR`, `fakerEN_US`, `fakerES`) instead of hand-typed name lists:

```typescript
// factories.ts
import { Faker, faker, fakerEN_US, fakerDE, fakerJA, fakerPT_BR, fakerES } from "@faker-js/faker";

const LOCALES: Record<string, { f: Faker; tz: string; country: string; w: number }> = {
  "en-US": { f: fakerEN_US, tz: "America/New_York", country: "US", w: 4 },
  "de-DE": { f: fakerDE, tz: "Europe/Berlin", country: "DE", w: 2 },
  "ja-JP": { f: fakerJA, tz: "Asia/Tokyo", country: "JP", w: 2 },
  "pt-BR": { f: fakerPT_BR, tz: "America/Sao_Paulo", country: "BR", w: 2 },
  "es-ES": { f: fakerES, tz: "Europe/Madrid", country: "ES", w: 1 },
};

// Seed EVERY instance: each locale object has its own random generator,
// so faker.seed() alone leaves localized output different on every run.
const SEED = Number(process.env.SEED ?? 42);
for (const f of [faker, ...Object.values(LOCALES).map((l) => l.f)]) f.seed(SEED);

export function makeUser(orgId: string, i: number) {
  const key = faker.helpers.weightedArrayElement(
    Object.entries(LOCALES).map(([value, l]) => ({ value, weight: l.w })));
  const L = LOCALES[key];
  let firstName = L.f.person.firstName(), lastName = L.f.person.lastName();
  if (i % 50 === 0) lastName = "W";                                   // minimum length
  if (i % 97 === 0) firstName = "A".repeat(100);                      // column-length boundary
  if (i % 31 === 0) lastName = `O'${lastName}-von der ${lastName}`;   // apostrophe, hyphen, particles
  return {
    id: faker.string.uuid(), orgId, locale: key, firstName, lastName,
    email: `u${i}.${faker.string.alphanumeric(6).toLowerCase()}@example.test`,
    phone: L.f.phone.number(), country: L.country, address: L.f.location.streetAddress(),
    timezone: i % 40 === 0 ? faker.helpers.arrayElement(["Pacific/Apia", "Pacific/Kiritimati", "Etc/GMT+12"]) : L.tz,
    bio: i % 13 === 0 ? "Shipped it \u{1F680} — 日本語テスト" : null,
  };
}
```

Seeding runs parents first (organizations, then users that reference them), so foreign keys never point at missing rows. The unique `email` is built from the row index, so unique indexes cannot collide. Generating 10,000 users in memory takes well under a second; the time to insert them depends on your database, so batch the inserts (`createMany`, or `COPY` on PostgreSQL) rather than inserting row by row.

Faker needs Node 20.19+, 22.13+ or 24+ (check `npm view @faker-js/faker engines`).

### Step 3: Profile the Output Before Trusting It

Generated data is only useful if it has the variety you wanted. Dump it to CSV and let the data-analysis skill profile it (pandas):

```python
import pandas as pd
df = pd.read_csv("users.csv")
print(df["locale"].value_counts(normalize=True).round(3).to_dict())
print("dup emails:", df["email"].duplicated().sum(), "| null bio:", round(df["bio"].isna().mean(), 3))
print("max first name length:", df["firstName"].str.len().max())
print("non-ASCII last names:", (~df["lastName"].str.isascii()).sum())
print(df["timezone"].value_counts().tail(3).to_dict())
```

```console
{'en-US': 0.366, 'pt-BR': 0.188, 'ja-JP': 0.178, 'de-DE': 0.175, 'es-ES': 0.093}
dup emails: 0 | null bio: 0.923
max first name length: 100
non-ASCII last names: 2302
{'Pacific/Kiritimati': 89, 'Etc/GMT+12': 86, 'Pacific/Apia': 75}
```

This check catches the failure modes of synthetic data: one locale dominating, duplicate keys, nullable fields that are never null, edge cases that never show up. The same profile can compare against **aggregate** production statistics (locale mix, null rates, rows per organization) to tune the weights -- without copying a single production row.

### Step 4: Create Scenario-Specific Datasets

```text
Add a scenario seed "billing" with 20 organizations whose subscriptions cover
every state: active, trial ending tomorrow, trial expired 3 days ago, payment
failed, cancelled with days remaining, downgraded mid-cycle, upgraded
mid-cycle, annual renewal due today. Dates relative to the current time.
```

Scenario seeds are small, explicit and named, so a failing test points at one case:

| State | Count | What it tests |
|---|---|---|
| Active monthly, various usage levels | 5 orgs | Normal billing flow |
| Annual plan, renewal due today | 3 orgs | Renewal logic |
| Free tier near its usage limit | 2 orgs | Upgrade prompts |
| Trial ending tomorrow | 2 orgs | Conversion email trigger |
| Trial expired 3 days ago | 1 org | Account lockout flow |
| Failed payment, retry scheduled | 2 orgs | Payment retry logic |
| Downgraded mid-cycle | 1 org | Proration credit |
| Upgraded mid-cycle | 1 org | Proration charge |
| Cancelled with 15 days remaining | 1 org | Cancellation grace period |
| Two subscriptions in one org changing state together | 2 orgs | Concurrency in retry logic |

If the app talks to Stripe, use Stripe's test mode: pass a test PaymentMethod such as `pm_card_visa` (never real or realistic card numbers), take decline cases from Stripe's testing page, and use [test clocks](https://docs.stripe.com/billing/testing/test-clocks) to move a customer's subscription through trial end and renewal instead of faking dates in your own database.

### Step 5: Guard the Factories with Tests

```text
Write vitest tests for factories.ts: same SEED gives identical output, different SEED gives different output, emails are unique across 10,000 users, every orgId exists in the organizations list, first names never exceed the column length.
```

The test-generator skill detects the framework in the repo and writes Arrange-Act-Assert tests. The determinism test is the one that matters most -- it would have caught the locale-seeding trap above:

```typescript
it("same seed gives the same users", () => {
  const a = buildDataset(42), b = buildDataset(42), c = buildDataset(7);
  expect(a.users).toEqual(b.users);
  expect(a.users).not.toEqual(c.users);
});
```

Run with `npx vitest run`.

### Step 6: Wire It Into CI

In Prisma 7 and later, `prisma migrate reset` and `migrate dev` no longer run the seed script; seeding happens only when you run `prisma db seed`. Point it at your script in `prisma.config.ts` (`migrations: { seed: "tsx prisma/seed.ts" }`), then:

```bash
npx prisma migrate reset --force        # clean database, apply migrations (no seed)
SEED=42 npx prisma db seed              # run the seed script explicitly
npx vitest run                          # or your integration test command
```

Use `migrate reset` only against a throwaway CI database, never a shared one.

Print the seed in the CI log. A fixed seed (42) in the pull request pipeline gives fast, reproducible runs; a random seed in the nightly build (`SEED=$RANDOM$RANDOM`) finds cases a fixed dataset would never hit. When the nightly run fails, rerun locally with the logged seed to reproduce it.

## Real-World Example

Lena, the QA lead at the startup, runs the existing integration suite against the generated data on day one. Three bugs surface: a name truncation that corrupted Japanese display names, a scheduling error for users in UTC+13 that shifted tasks by a day, and a mid-cycle plan change that produced a negative invoice amount. None of them showed up with the old 50-row dataset, which had only ASCII names, US time zones and one subscription per organization.

The team adds the pipeline to CI with a fixed seed on pull requests and a random seed nightly, and the compliance request that came back three times is finally closable: production copies are deleted from developer machines because the generated dataset covers what they were used for. Every test run now starts from the same documented shape, so "works on my machine" turns into "fails with seed 1837264", a line anyone can paste into a terminal.
