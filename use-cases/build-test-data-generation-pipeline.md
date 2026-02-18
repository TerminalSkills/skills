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

A 20-person SaaS startup runs integration tests against a staging database with 50 rows of hand-crafted test data. The data was written two years ago and no longer reflects real usage patterns — there are no edge cases, no unicode characters in names, no addresses outside the US, and no records that trigger the new subscription tiers added last quarter. QA keeps finding bugs in production that never surface in staging because the test data does not cover the scenarios real users create. Meanwhile, developers copy production data for local testing, which is a compliance nightmare since it contains real customer PII.

## The Solution

Use the **coding-agent** skill to generate data factories that understand your schema, the **test-generator** skill to create scenario-specific datasets, and the **data-analysis** skill to analyze production data patterns without exposing PII.

## Step-by-Step Walkthrough

### 1. Analyze your schema and relationships

Point the agent at your database:

```text
Analyze the database schema in ./prisma/schema.prisma. Map all tables, relationships, constraints, and enums. Identify which fields need realistic data (emails, addresses, phone numbers) versus which are system-generated (UUIDs, timestamps).
```

### 2. The agent maps the data model

```text
Schema Analysis — 24 tables, 156 columns:

Core entities: User, Organization, Project, Task, Subscription
Relationships: 31 foreign keys, 4 many-to-many via junction tables
Constraints: 12 unique indexes, 8 check constraints, 3 custom enums

Fields requiring realistic data:
- User: name (international), email, phone, address, timezone
- Organization: company name, billing address, VAT number
- Task: title, description (variable length), due dates (past and future)
- Subscription: plan tier, billing cycle, trial expiration
```

### 3. Generate data factories

```text
Create data factory functions for each entity that generate realistic data. Include: international names and addresses (at least US, EU, Japan, Brazil), edge cases (very long names, special characters, emoji in text fields), and valid relational integrity across all foreign keys. Generate 10,000 users across 500 organizations.
```

### 4. The agent builds the pipeline

```text
Generated data factories for 24 tables:
- UserFactory: international names, valid emails, 12 timezone variants
- OrganizationFactory: realistic company names, multi-country addresses
- TaskFactory: variable-length descriptions, dates spanning -2y to +6m
- SubscriptionFactory: all 4 plan tiers, monthly/annual, active/expired/trial

Edge cases included:
- Names with diacritics: José, Müller, Tanaka Yūki, O'Brien
- Emoji in task descriptions
- 0-length optional fields
- Boundary dates (leap year, DST transitions, year-end)
- Max-length strings at field limits

Seeding 10,000 users across 500 orgs... done (47 seconds)
All foreign key constraints satisfied ✓
All unique constraints respected ✓
```

### 5. Create scenario-specific datasets

```text
Generate a focused dataset for testing the billing system: 20 organizations with subscriptions in every state — active, trial expiring tomorrow, trial expired, payment failed, cancelled, downgraded mid-cycle, upgraded mid-cycle, and annual renewal due today.
```

The agent generates a targeted dataset that exercises every billing edge case:

```text
Billing Test Dataset — 20 organizations:

Active subscriptions:
- 5 orgs on Pro monthly ($49/mo), various usage levels
- 3 orgs on Enterprise annual ($499/mo), 2 approaching renewal
- 2 orgs on Starter free tier, one approaching usage limit

Trial states:
- 2 orgs with trial expiring tomorrow (should trigger conversion email)
- 1 org with trial expired 3 days ago (should be locked out)
- 1 org mid-trial with heavy usage (good conversion candidate)

Payment issues:
- 2 orgs with failed payment (retry scheduled)
- 1 org with expired credit card (needs update notification)

Plan changes:
- 1 org downgraded mid-cycle (prorated credit pending)
- 1 org upgraded mid-cycle (prorated charge pending)
- 1 org cancelled with 15 days remaining on annual plan

All amounts, dates, and Stripe-compatible payment method tokens included.
```

## Real-World Example

Lena, a QA lead at a 20-person SaaS startup, is tired of finding bugs in production that never appeared in testing because the staging data is stale and unrealistic.

1. Lena asks the agent to analyze the Prisma schema — it maps 24 tables with all relationships and constraints
2. The agent generates data factories that produce international, edge-case-rich data — 10,000 users across 500 organizations, seeded in under a minute
3. Running the existing test suite against the new data immediately catches 3 bugs: a name truncation issue with Japanese characters, a timezone calculation error for UTC+13, and a billing edge case with mid-cycle plan changes
4. Lena asks for a billing-specific dataset — the agent generates 20 organizations covering every subscription state, which reveals a race condition in the payment retry logic
5. The team adds the data generation pipeline to CI — every test run gets fresh, realistic data. Production copies are deleted, eliminating the PII compliance risk. Bug escape rate drops by 60% over the next quarter
