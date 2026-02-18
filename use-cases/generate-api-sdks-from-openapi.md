---
title: "Generate API SDKs from OpenAPI Specs"
slug: generate-api-sdks-from-openapi
description: "Turn your OpenAPI specification into typed SDKs for multiple languages with documentation, tests, and CI publishing."
skills: [coding-agent, test-generator, markdown-writer]
category: development
tags: [SDK, OpenAPI, code-generation, API, developer-experience]
---

# Generate API SDKs from OpenAPI Specs

## The Problem

Your API has 31 endpoints and a well-maintained OpenAPI spec. Customers keep asking for SDKs — the Python team wants a Python client, the JavaScript developers want a typed npm package, and the Go team needs something idiomatic. Hand-writing SDKs for 3 languages means maintaining 3 parallel codebases that drift out of sync every time you add an endpoint.

Existing generators like openapi-generator produce code that works but reads like it was written by a robot — verbose, unidiomatic, and missing error handling patterns developers expect. The generated code needs so much cleanup that maintaining it becomes a full-time job. You need SDKs that feel hand-written but update automatically when your spec changes.

## The Solution

Use **coding-agent** to generate idiomatic SDK code from your OpenAPI spec, **test-generator** to create comprehensive test suites for each SDK, and **markdown-writer** to produce SDK documentation with examples.

```bash
npx terminal-skills install coding-agent test-generator markdown-writer
```

## Step-by-Step Walkthrough

### 1. Analyze the OpenAPI spec

```text
Parse our openapi.yaml. Summarize the API surface: endpoints, models, auth patterns, and pagination style. Identify anything that needs special SDK handling.
```

```text
API SURFACE ANALYSIS:

Endpoints: 31 across 6 groups (Orders, Products, Users, Webhooks, Reports, Events)
Models: 24 schemas | Auth: JWT + API key | Pagination: cursor-based
Errors: RFC 7807 | Rate limiting: 429 + Retry-After

SPECIAL HANDLING: bulk arrays, async report generation, SSE, streaming exports
```

### 2. Generate the TypeScript SDK

```text
Generate a TypeScript SDK for our API. Use fetch, full type safety, automatic pagination, retry on 429, and idiomatic error handling. Structure it as a publishable npm package.
```

```text
Generated: sdks/typescript/
  src/client.ts — Main class with auth, retry on 429, auto-pagination
  src/resources/ — Typed methods for all 6 resource groups
  src/types/ — 24 TypeScript interfaces + typed error classes
  package.json — ESM + CJS, ready to publish

Usage:
  const client = new ApiClient({ apiKey: 'sk_...' });
  for await (const order of client.orders.listAll()) { ... }
```

### 3. Generate the Python SDK

```text
Generate a Python SDK using httpx for async support, Pydantic models, and Pythonic conventions. Package with pyproject.toml for PyPI publishing.
```

```text
Generated: sdks/python/
  src/api_client/client.py — Sync and async clients with httpx
  src/api_client/resources/ — Type-hinted methods for all resources
  src/api_client/models/ — 24 Pydantic models with validation
  pyproject.toml — Poetry config, ready for PyPI

Usage:
  client = ApiClient(api_key="sk_...")
  async for order in client.orders.list_all():
      print(order.total)
```

### 4. Generate test suites for both SDKs

```text
Create test suites for both SDKs. Use recorded HTTP fixtures so tests run without a live API. Cover auth, CRUD, pagination, error handling, and retries.
```

```text
TypeScript: 42 tests (vitest) — auth, CRUD, pagination, errors, retry | 94% coverage
Python: 38 tests (pytest + pytest-httpx) — sync/async, Pydantic, errors | 91% coverage
HTTP fixtures: recorded responses in tests/fixtures/ (shared format)
```

### 5. Generate documentation and publish pipeline

```text
Create README docs for both SDKs with installation, quickstart, and per-resource examples. Add CI pipelines to publish on tag.
```

```text
Documentation:
  sdks/typescript/README.md — Install, quickstart, all resources with examples
  sdks/python/README.md — pip install, quickstart, sync/async examples

CI pipelines:
  .github/workflows/sdk-typescript.yml
    On tag v*-ts: test → build → publish to npm
  .github/workflows/sdk-python.yml
    On tag v*-py: test → build → publish to PyPI

  .github/workflows/sdk-sync.yml
    On change to openapi.yaml: regenerate both SDKs, open PR if diff detected
    Ensures SDKs never drift from the spec
```

## Real-World Example

Tomás, the API lead at a 20-person developer tools startup, was losing deals because competitors had SDKs and he didn't. His 31-endpoint API had a solid OpenAPI spec, but hand-writing SDKs for even 2 languages would take weeks. He'd tried openapi-generator — the output compiled but felt foreign. The Python SDK used requests instead of httpx, had no async support, and error handling was a single catch-all exception.

He ran the three-skill workflow on a Wednesday. The coding-agent produced a TypeScript SDK with auto-pagination, typed errors, and retry logic — code his team would have been proud to write by hand. The Python SDK used Pydantic models and supported both sync and async patterns. The test-generator created 80 tests across both SDKs with recorded HTTP fixtures.

He published both SDKs on Thursday. Within a week, 3 customers who'd been using raw HTTP switched to the SDKs. Support tickets about API integration dropped 40%. The automated sync pipeline caught his next API change on Friday — it regenerated both SDKs and opened a PR before he'd even started updating them manually.
