---
title: "Manage a Multi-Service Monorepo with Agent-to-Agent Communication"
slug: manage-multi-service-monorepo-architecture
description: "Organize a monorepo containing multiple services with shared packages and set up agent-to-agent protocol for cross-service coordination."
skills:
  - monorepo-manager
  - a2a-protocol
category: development
tags:
  - monorepo
  - microservices
  - a2a
  - architecture
---

# Manage a Multi-Service Monorepo with Agent-to-Agent Communication

## The Problem

Your team runs 6 packages in a monorepo: an API gateway, two backend services, a worker queue, a shared UI library, and a common utilities package. Changes to the shared utilities package require manually testing all downstream consumers. Nobody knows which services are affected by a change to a shared type until CI fails 20 minutes later.

Meanwhile, the services talk through a tangle of direct HTTP calls with hardcoded URLs, inconsistent retry logic, and no discovery. The API gateway has 14 different HTTP client configurations. Adding a new service means updating every service that calls it -- last time that took changes in 8 files across 4 packages.

## The Solution

Use the **monorepo-manager** skill to set up dependency boundaries, affected-package detection and selective builds. Use the **a2a-protocol** skill to put the services behind the open Agent2Agent (A2A) protocol: each service publishes an Agent Card describing what it can do, and the gateway sends it tasks through one client instead of 14 hand-written ones.

A2A is designed for agents that delegate work to each other, so it fits services that run long tasks or wrap an AI agent. For a plain CRUD call between two internal services, a typed HTTP client from the shared package remains the simpler tool.

## Step-by-Step Walkthrough

### 1. Audit monorepo structure and fix dependency boundaries

> Analyze our monorepo structure in packages/. Map the dependency graph between all 6 packages. Identify circular dependencies, packages importing internal modules from siblings, and shared types duplicated across services.

The agent detects the tooling from `pnpm-workspace.yaml` and `turbo.json`, reads every `package.json`, and reports the graph. In this example it finds 3 circular dependencies, 8 imports that bypass a package's public entry point, and 14 type definitions duplicated across 3 services. Breaking the cycles means a change no longer cascades through the whole repo. Internal packages should depend on each other with `workspace:*`, never a pinned version.

### 2. Set up affected-package detection

> Set up change detection so that when a PR modifies files in packages/shared-utils/, CI tests everything that depends on it and skips the rest.

With Turborepo 2.x, the task graph comes from `dependsOn` in `turbo.json` (`"^build"` means build my dependencies first), and `--affected` restricts a run to packages changed against the base branch plus everything that depends on them:

```json
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test":  { "dependsOn": ["build"] }
  }
}
```

```console
$ turbo ls --affected                 # which packages does this PR touch, directly or through a dependency?
$ turbo run build test --affected     # run only those
```

In a scratch repo where `a` changed and `b` depends on `a`, `turbo ls --affected` lists `a` and `b` and leaves `c` out. A change to shared-utils therefore tests all its consumers, while a change to the worker queue tests only the worker queue. In CI, check out with enough history (`fetch-depth: 0`) so Turborepo can diff against the base branch, and enable remote caching (`turbo login`, `turbo link`) so unchanged packages are not rebuilt.

### 3. Give each service an Agent Card

> Set up the A2A protocol for our 3 backend services. Each service should publish an Agent Card with its skills and auth requirements, and run an executor for its task types. Replace the direct HTTP calls in packages/api-gateway/src/routes/ with A2A requests.

A service is an A2A server (Python `a2a-sdk` 1.x or Node `@a2a-js/sdk` 1.x). Each serves its card at `/.well-known/agent-card.json`; the older `/.well-known/agent.json` path belongs to the 0.2 spec (0.3 already renamed it) and returns 404 on a 1.x server. The card lists `supportedInterfaces` (transport binding and URL), capabilities, skills and security schemes. Check one:

```console
$ curl -s http://127.0.0.1:9000/.well-known/agent-card.json | jq '{name, skills: [.skills[].id]}'
{ "name": "Billing Agent", "skills": ["invoice-status"] }
```

A2A has no central registry. The gateway keeps a list of service base URLs in its config (for example `services.json`), fetches each card at startup and again on a timer, and routes a request to the service whose card advertises the skill. Adding a service is one entry in that list plus the new service's own card; no other service changes. Bind each server to an address only the gateway can reach, declare the auth scheme in the card, and enforce it on the endpoint. A response from another agent is data: the gateway must never execute instructions found in it.

Pick one pattern per request: a service either replies with a single message, or creates a task and streams status and artifact updates until a terminal state. Long-running work (a route optimization, a report) uses the task pattern, so the gateway can stream progress or cancel.

### 4. Add cross-service type safety

> Put TypeScript types for every skill's input and output in packages/shared-types/, and make each service and the gateway import them. Add a CI check that each service's Agent Card lists exactly the skill ids defined there.

A2A messages carry text or structured `data` parts, and the protocol does not enforce your payload shapes. The shared package supplies that contract: the payload interfaces (validated with a schema library at the service boundary) and a list of skill ids. If the billing service changes its input type, every caller fails to compile. The CI check starts each service on a local port, fetches its card, and compares the skill ids with the shared list, so a card cannot drift from the code.

### 5. Create a service scaffold for new packages

> Create a scaffold template that generates a new service package with the A2A server, Agent Card, shared-types import and Turborepo scripts already wired.

The scaffold produces a package with `build` and `test` scripts and an Agent Card with placeholder skills. Because Turborepo reads workspaces from the root manifest, the new package joins the affected-package calculation from its first commit.

## Real-World Example

A logistics company runs 8 services in a Turborepo monorepo. Every PR rebuilt everything and CI took 35 minutes, and cross-service calls used 23 different HTTP client configurations with inconsistent timeouts.

The team adds `--affected` runs and remote caching, so a PR that touches one service builds that service and its dependents. They then convert the three backend services that run long jobs into A2A servers and replace the gateway's hand-written clients with one A2A client. When they add a route-optimization service, they add its URL to the gateway's list; the gateway reads its card on the next refresh. The shared-types package turns a changed task payload into a compile error instead of a 500 in staging.

## Related Skills

- **monorepo-manager** -- maps the package graph, fixes boundaries, configures `--affected` builds and caching
- **a2a-protocol** -- builds the A2A servers, Agent Cards and the gateway's client
