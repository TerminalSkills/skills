---
title: "Set Up Automated API Mocking for Frontend Development with AI"
slug: set-up-automated-api-mocking
description: "Use AI to generate mock API servers from OpenAPI specs, seed them with realistic data, and keep mocks in sync with backend changes."
skills: [api-tester, coding-agent, test-generator]
category: development
tags: [api-mocking, frontend, openapi, development-workflow, testing]
---

# Set Up Automated API Mocking for Frontend Development with AI

## The Problem

A frontend team of three depends on a backend API that is half-built. Endpoints change weekly, new fields appear without warning, and the backend team is in a different timezone. Frontend developers spend two hours every morning figuring out which endpoints work, which are broken, and what the response shapes look like today. They hardcode fake data in their components, which then breaks when the real API ships something different. Integration bugs pile up at the end of every sprint because the frontend was built against imaginary data, not the actual contract.

## The Solution

Use the **api-tester** skill to validate the current OpenAPI spec against the live backend and identify discrepancies. Have the **coding-agent** skill generate a mock server from the spec with realistic seed data. Use the **test-generator** skill to create contract tests that alert when the backend spec changes so mocks stay in sync.

```bash
npx terminal-skills install api-tester coding-agent test-generator
```

## Step-by-Step Walkthrough

### 1. Extract and validate the OpenAPI spec

Tell your AI agent:

> Download the OpenAPI spec from https://api.internal.dev/docs/openapi.json. Validate it for completeness — flag any endpoints missing response schemas, any fields without types, and any mismatches between the spec and actual API responses by hitting each GET endpoint once.

The agent uses **api-tester** to probe the live API:

```text
OpenAPI Spec Validation — 34 endpoints

✅ 28 endpoints match their spec
⚠️ 4 endpoints have undocumented fields in responses:
  GET /api/projects — extra field: "archived_at" (string, nullable)
  GET /api/users/:id — extra field: "avatar_url" (string)
  GET /api/tasks — extra field: "priority" (integer)
  POST /api/tasks — response missing "created_by" field from spec

❌ 2 endpoints return 501 (not implemented yet):
  GET /api/reports/burndown
  POST /api/reports/export
```

### 2. Generate a mock server with realistic data

> Generate a mock API server using MSW (Mock Service Worker) that serves all 34 endpoints from the OpenAPI spec. For each endpoint, generate 20 realistic seed records. Use proper names, dates, UUIDs, and domain-appropriate values (project names, task descriptions). Handle pagination, filtering, and error responses.

The **coding-agent** produces a complete mock setup:

```text
Created mock server:
  mocks/
    handlers/
      projects.ts — 6 handlers (CRUD + list + archive)
      users.ts — 4 handlers
      tasks.ts — 8 handlers
      reports.ts — 2 handlers (stub 501 responses)
    seed/
      projects.json — 20 projects with realistic names
      users.json — 20 users with names, emails, roles
      tasks.json — 60 tasks linked to projects and users
    server.ts — MSW setup with all handlers registered
    browser.ts — Browser worker for Storybook integration

Install: npm install msw --save-dev
Start: npx msw init public/
```

### 3. Wire the mock server into the dev environment

> Configure our Next.js app to use the MSW mock server in development and Storybook. The mock server should activate automatically when NEXT_PUBLIC_API_MOCKING=true. Add a toggle in the browser dev tools to switch between mock and real API.

### 4. Generate contract tests

> Create contract tests that compare the mock server responses against the OpenAPI spec. If the backend team updates the spec, these tests should fail immediately and show exactly which fields changed. Run them in CI on every PR.

The **test-generator** skill produces:

```text
Generated 34 contract tests in tests/contracts/

  ✓ GET /api/projects — response matches schema (12 fields)
  ✓ POST /api/projects — request and response match schema
  ✓ GET /api/tasks — pagination params match spec
  ... 31 more tests

CI integration: added to .github/workflows/test.yml
  - Downloads latest OpenAPI spec
  - Runs contract tests against mock handlers
  - Fails PR if any schema mismatch detected
```

### 5. Auto-update mocks when the spec changes

> Write a script that diffs the current OpenAPI spec against the last known version. When fields are added, auto-generate new seed data and update handlers. When fields are removed, flag them for manual review. Run this as a daily CI job.

## Real-World Example

Priya leads the frontend team at a 20-person SaaS startup. Her three developers used to waste two hours daily fighting API issues — endpoints returning unexpected shapes, backend changes breaking components, and hardcoded fake data masking real integration bugs. After setting up the mock server, the frontend team works independently against a stable, spec-compliant API. When the backend adds a field, the contract test catches it in CI and the mock auto-updates. Sprint integration bugs dropped from an average of 14 to 2. The team ships features three days faster per sprint because they stopped waiting for backend endpoints to stabilize.
