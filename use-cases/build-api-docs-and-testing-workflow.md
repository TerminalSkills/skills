---
title: "Build an API Documentation and Testing Workflow"
slug: build-api-docs-and-testing-workflow
description: "Generate accurate API documentation from code, test endpoints systematically, and validate payment integrations with realistic scenarios."
skills:
  - openapi-spec
  - api-tester
  - stripe-testing
category: development
tags:
  - api-documentation
  - api-testing
  - stripe
  - openapi
---

# Build an API Documentation and Testing Workflow

## The Problem

Your API documentation lives in a Notion page that was last updated four months ago. Three endpoints have been added since then, two have changed their request format, and one was deprecated. New developers waste half a day figuring out which docs are accurate. Partners integrating with your API open support tickets because the documented response format does not match what the API actually returns. Testing is manual -- someone runs curl commands from a shared script. The Stripe integration has never been tested with edge cases like disputed charges or failed subscription renewals because setting up those scenarios manually is tedious.

## The Solution

Use the **openapi-spec** skill to produce an OpenAPI 3.1 document from the codebase, lint it and build HTML docs with Redocly CLI, **api-tester** to systematically test every endpoint with automated assertions, and **stripe-testing** to validate payment flows with realistic scenarios including disputes, refunds, and webhook retries.

## Step-by-Step Walkthrough

### 1. Generate API documentation from code

Extract route definitions, request/response types, and validation rules into one spec, then lint it and build the docs page.

> Scan our Express API routes in src/routes/ and write an OpenAPI 3.1 openapi.yaml. Convert the request body schemas from our Zod validators, take response types from our TypeScript return types, and include authentication requirements and example values. Then run `npx @redocly/cli lint openapi.yaml` and `npx @redocly/cli build-docs openapi.yaml -o docs/index.html`.

With Zod 4, `z.toJSONSchema(schema)` emits JSON Schema 2020-12, the dialect OpenAPI 3.1 uses, so the documented request format is generated from the schema the server actually validates with. Redocly's lint step must print "Your API description is valid" and `build-docs` writes a static HTML page you can host anywhere.

### 2. Test all endpoints systematically

Run every endpoint through happy path, error, and edge case scenarios.

> Test all 34 endpoints in our API on the local dev server (http://127.0.0.1:$PORT) with the api-tester skill. For each endpoint, verify: correct HTTP status codes, response schema matches the OpenAPI spec, authentication is enforced on protected routes, validation rejects malformed input with helpful error messages, and pagination returns correct page sizes. Report failures as a summary table.

The test runner produces a table showing pass/fail status for every endpoint and test category:

```text
API Test Results — 34 endpoints, 187 assertions
=================================================
Endpoint                    Status  Auth  Validation  Schema  Pagination
GET    /api/v1/products     PASS    PASS  PASS        PASS    PASS
POST   /api/v1/products     PASS    PASS  PASS        PASS    --
GET    /api/v1/products/:id PASS    PASS  PASS        PASS    --
PUT    /api/v1/products/:id PASS    PASS  PASS        PASS    --
DELETE /api/v1/products/:id PASS    PASS  PASS        PASS    --
GET    /api/v1/orders       PASS    PASS  PASS        PASS    PASS
POST   /api/v1/orders       PASS    PASS  FAIL *      PASS    --
GET    /api/v1/users        PASS    PASS  PASS        PASS    PASS
POST   /api/v1/checkout     PASS    PASS  PASS        FAIL *  --
...

Summary: 183 passed, 4 failed
  * POST /api/v1/orders     — empty body returns 500 instead of 400
  * POST /api/v1/checkout   — response missing "currency" field in schema
  * PUT  /api/v1/users/:id  — accepts invalid email format "not-an-email"
  * GET  /api/v1/reports     — returns 200 without auth header (should be 401)
```

The four failures represent real bugs. The orders endpoint crashes on empty bodies instead of returning a validation error, and the reports endpoint is missing authentication middleware entirely.

### 3. Validate Stripe payment flows end-to-end

Payment integrations have edge cases that only appear under specific conditions.

> Test our Stripe integration in test mode with these scenarios: successful one-time payment, declined card (insufficient funds), 3D Secure authentication required, subscription creation with trial period, subscription upgrade with proration, failed renewal, disputed charge, and webhook replay for a missed event. Use the test key in $STRIPE_API_KEY and Stripe's documented test cards.

The stripe-testing skill maps each scenario to a command or card from the Stripe docs:

| Scenario | How |
|----------|-----|
| Insufficient funds | card `4000000000009995` (`card_declined`, `insufficient_funds`) |
| 3D Secure always required | card `4000002760003184` |
| Failed charge after attaching | card `4000000000000341` |
| Fraudulent dispute | card `4000000000000259` creates a dispute, or `stripe trigger charge.dispute.created` |
| Trial, proration, renewals | a test clock: `stripe post /v1/test_helpers/test_clocks -d frozen_time=$(date +%s)`, then advance it |
| Missed event | `stripe events resend evt_... --webhook-endpoint=we_...` (works up to 30 days) |

Run `stripe listen --forward-to http://127.0.0.1:3000/api/webhooks/stripe` in another terminal so the local handler receives each event with the CLI's signing secret.

### 4. Set up continuous documentation and testing

Automate doc generation and API testing so they run on every pull request.

> Create a CI workflow that regenerates the OpenAPI spec from code on every PR, runs `npx @redocly/cli lint`, and runs `oasdiff breaking main:openapi.yaml openapi.yaml --fail-on ERR` to fail on breaking changes. Run the API test suite against a staging environment after every deployment.

## Real-World Example

A payments platform had three partner companies struggling to integrate because the API docs showed v1 request formats while the live API had silently migrated to v2. The spec was written from the actual route definitions and Zod schemas in 20 minutes. The api-tester discovered that 4 of 34 endpoints returned 500 errors on empty request bodies instead of 400 validation errors. The stripe-testing skill caught a critical bug: disputed charges were being processed as refunds, which meant the company was losing both the charge amount and the dispute fee. The overhaul took the team two days.

## Tips

- Generate documentation on every pull request and diff it against the previous version. If an endpoint's request schema changed but the changelog was not updated, fail the CI check.
- Test with realistic payloads, not minimal valid objects. An endpoint that accepts a product with a 3-character name might break when someone submits a 500-character name with Unicode characters.
- For Stripe testing, always test the webhook signature verification path. A common bug is accepting webhooks without verifying the signature, which allows attackers to forge events. Use `stripe.webhooks.constructEvent` on the raw request body, and test that a request with a wrong signature gets a 400.
- Keep a separate test environment with its own Stripe test API keys. Sharing keys between developers causes test data collisions and flaky test results.
