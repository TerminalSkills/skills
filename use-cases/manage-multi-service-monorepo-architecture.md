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

Your team runs 6 services in a monorepo: an API gateway, two backend services, a worker queue, a shared UI library, and a common utilities package. Changes to the shared utilities package require manually testing all 5 downstream consumers. Nobody knows which services are affected by a change to a shared type definition until CI fails 20 minutes later.

Meanwhile, the services communicate through a tangle of direct HTTP calls with hardcoded URLs, inconsistent retry logic, and no service discovery. The API gateway has 14 different HTTP client configurations. Adding a new service means updating every other service that calls it -- last time this required changes in 8 files across 4 packages.

## The Solution

Use the **monorepo-manager** skill to set up proper dependency boundaries, affected-service detection, and selective builds. Use the **a2a-protocol** skill to implement standardized agent-to-agent communication, replacing hardcoded HTTP calls with a discoverable, typed protocol.

## Step-by-Step Walkthrough

### 1. Audit monorepo structure and fix dependency boundaries

Understand the current dependency graph and identify what causes unnecessary rebuilds:

> Analyze our monorepo structure in packages/. Map the dependency graph between all 6 packages. Identify circular dependencies, packages importing internal modules from siblings, and shared types duplicated across services.

The analysis reveals 3 circular dependencies, 8 internal module imports bypassing public APIs, and 14 shared type definitions duplicated across 3 services. Breaking these cycles means a change to one package will not silently cascade through the entire monorepo.

### 2. Set up affected-service detection

Configure tooling to detect which services are affected by a change and skip the rest:

> Set up change detection so that when a PR modifies files in packages/shared-utils/, CI automatically identifies and tests all downstream consumers. Generate a dependency-aware pipeline that only builds affected packages.

The pipeline uses file-change detection combined with the dependency graph. A change to shared-utils triggers tests for all 5 consumers, but a change to the worker queue only tests the worker queue. Average CI time drops from 22 minutes to 7 minutes for service-specific changes.

### 3. Implement A2A protocol for service communication

Replace the 14 different HTTP client configurations with standardized agent-to-agent communication:

> Set up A2A protocol between our 3 backend services. Each service should publish an agent card describing its capabilities, supported task types, and auth requirements. Replace the direct HTTP calls in packages/api-gateway/src/routes/ with A2A task requests.

Each service now exposes an `/.well-known/agent.json` card. The gateway discovers services at startup and routes through typed task definitions. Adding a new service means deploying it with an agent card -- the gateway discovers it automatically on the next health check, with zero changes to existing code.

### 4. Add cross-service type safety

Ensure inter-service communication is type-safe across the monorepo:

> Generate shared TypeScript interfaces for all A2A task types. Place them in packages/shared-types/ and configure each service to import from there. Add a CI check validating agent cards match the shared type definitions.

The shared types become the contract between services. If the billing service changes its task input schema, TypeScript compilation fails in every caller, catching breaks at build time. The CI check prevents drift between what a service advertises and what it accepts.

### 5. Create a service scaffold for new packages

Streamline adding new services to the monorepo:

> Create a scaffold template that generates a new service package with the agent card, shared type imports, CI pipeline integration, and dependency declarations already configured. Running the scaffold should produce a deployable service in under 5 minutes.

The scaffold produces a new package directory with boilerplate removed. The agent card template includes placeholder capabilities that the developer fills in. The CI pipeline automatically detects the new package and includes it in affected-service calculations from the first commit.

## Real-World Example

A logistics company ran 8 services in a Turborepo monorepo. CI times averaged 35 minutes because every PR rebuilt everything. Cross-service calls used 23 different HTTP client configurations with inconsistent timeouts.

After implementing monorepo-manager for selective builds and a2a-protocol for communication, CI dropped to 9 minutes. The standardized agent cards eliminated 23 bespoke configurations in favor of one typed protocol. When the team added a ninth service for route optimization, it was discoverable by all other services within minutes of deployment.

The shared types package caught 3 integration bugs at compile time that would have been runtime 500 errors in staging.
