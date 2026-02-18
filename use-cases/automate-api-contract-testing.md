---
title: "Automate API Contract Testing to Prevent Breaking Changes"
slug: automate-api-contract-testing
description: "Set up consumer-driven contract tests between services so API changes never break downstream clients silently."
skills: [api-tester, test-generator, cicd-pipeline]
category: development
tags: [api-contracts, testing, microservices, breaking-changes, pact]
---

# Automate API Contract Testing to Prevent Breaking Changes

## The Problem

A backend team pushes a "minor" API change — renaming a field from `userName` to `user_name`. Three frontend apps break in production. Nobody ran integration tests because they take 40 minutes and flake constantly. The team has 14 internal APIs, each consumed by 2-5 services, and zero contract coverage. Every sprint ships at least one unintended breaking change.

## The Solution

Use `api-tester` to map every endpoint's current request/response shape, `test-generator` to produce consumer-driven contract tests for each client-provider pair, and `cicd-pipeline` to run contracts on every PR so breaking changes get caught before merge.

```bash
npx terminal-skills install api-tester test-generator cicd-pipeline
```

## Step-by-Step Walkthrough

### 1. Map existing API surface

```text
Here's our users service OpenAPI spec (paste or link). Crawl every endpoint,
document request/response schemas, and flag any fields that have inconsistent
naming conventions (camelCase vs snake_case mix). List every consumer service
that calls each endpoint — I'll confirm the list.
```

The agent parses the spec, maps 23 endpoints across 4 resource groups, and flags 6 fields with inconsistent naming. It produces a dependency matrix showing which services consume which endpoints.

### 2. Generate consumer contract tests

```text
For each consumer-provider pair in the matrix, generate Pact contract tests.
The billing service consumes GET /users/{id} and POST /users/{id}/subscription.
The dashboard consumes GET /users, GET /users/{id}, and GET /users/{id}/activity.
The mobile API gateway consumes all user endpoints. Generate provider-side
verification tests too.
```

The agent generates 34 contract test files: one per consumer-endpoint combination on the consumer side, plus provider verification that runs all consumer pacts together.

### 3. Set up the contract broker and CI integration

```text
Configure a Pact broker using the free Pactflow starter. Add CI pipeline steps
so that: consumer tests run on consumer PRs, provider verification runs on
provider PRs, and deployment is blocked if any contract is broken. Use GitHub
Actions. The provider repo is users-service and consumers are billing-service,
dashboard-app, and mobile-gateway.
```

The agent generates GitHub Actions workflows for all 4 repos: consumers publish pacts on PR, the provider verifies against all published pacts, and a "can-i-deploy" check gates each deployment.

### 4. Handle the first breaking change safely

```text
I need to rename the "userName" field to "username" across all endpoints.
Generate a migration plan: add the new field alongside the old one, update
consumer contracts one by one, then deprecate the old field. Show me the
exact contract test changes for each step.
```

The agent produces a 3-phase migration: phase 1 adds `username` as an alias (both fields returned), phase 2 updates each consumer's contracts to expect `username`, phase 3 removes `userName` after all consumers have migrated. Each phase has its own contract test diff.

### 5. Add contract coverage reporting

```text
Add a CI step that reports contract coverage: what percentage of endpoints
have consumer contracts, which endpoints are untested, and which consumers
are missing contracts. Output as a markdown table in PR comments.
```

The agent adds a coverage script that cross-references the OpenAPI spec with published pacts and posts a coverage report: 23/23 endpoints covered, 34/34 consumer-endpoint pairs tested, 100% contract coverage.

## Real-World Example

A platform engineer at a 30-person fintech runs 14 internal APIs. Every two weeks, a field rename or response shape change breaks a downstream service in staging — sometimes in production. The team spends 6-8 hours per sprint debugging integration failures.

1. She maps all 14 APIs and their consumers using the agent, producing a 47-row dependency matrix
2. The agent generates 89 contract test files across all consumer-provider pairs
3. CI pipelines block 3 breaking changes in the first sprint — all caught before merge
4. Integration failures drop from 4 per sprint to zero over 6 weeks
5. The team reclaims 6+ hours per sprint previously spent on integration debugging
