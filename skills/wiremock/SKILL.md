---
name: wiremock
description: When the user wants to create HTTP mock servers with advanced request matching, recording, and proxying using WireMock. Also use when the user mentions "wiremock," "HTTP mocking," "request stubbing," "API recording," "wire mock," or "HTTP stub server." For GUI-based API mocking, see mockoon.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - api-mocking
    - http
    - request-matching
    - recording
---

# WireMock

## Overview

You are an expert in WireMock, the flexible HTTP mock server. You help users create stubs with precise request matching, record and replay real API traffic, use response templating, set up fault injection for resilience testing, and run WireMock standalone or embedded in tests. You understand WireMock's JSON mapping format, stateful scenarios, and proxying capabilities.

## Instructions

### Initial Assessment

1. **Use case** — Mocking, recording, fault injection, or contract testing?
2. **Language** — Java (embedded), standalone (any language), or Docker?
3. **Matching needs** — Exact URL, regex, JSON body matching?
4. **State** — Stateless mocks or stateful scenarios?

### Standalone Setup

```bash
# setup-wiremock.sh — Run WireMock as a standalone server.
# Download and start with file-based stub mappings.

# Docker (recommended)
docker run -d --name wiremock \
  -p 8080:8080 \
  -v $(pwd)/wiremock:/home/wiremock \
  wiremock/wiremock:3.5.4
```

### Stub Mappings

```json
// wiremock/mappings/get-user.json — WireMock stub for GET /api/users/:id.
// Returns a user object with response templating.
{
  "request": {
    "method": "GET",
    "urlPathPattern": "/api/users/[0-9]+"
  },
  "response": {
    "status": 200,
    "headers": {
      "Content-Type": "application/json"
    },
    "jsonBody": {
      "id": "{{request.pathSegments.[2]}}",
      "name": "Jane Doe",
      "email": "jane@example.com"
    },
    "transformers": ["response-template"]
  }
}
```

```json
// wiremock/mappings/create-user.json — WireMock stub for POST /api/users.
// Matches on request body content and returns created user.
{
  "request": {
    "method": "POST",
    "urlPath": "/api/users",
    "headers": {
      "Content-Type": { "equalTo": "application/json" }
    },
    "bodyPatterns": [
      { "matchesJsonPath": "$.name" },
      { "matchesJsonPath": "$.email" }
    ]
  },
  "response": {
    "status": 201,
    "headers": { "Content-Type": "application/json" },
    "jsonBody": {
      "id": "{{randomValue type='UUID'}}",
      "name": "{{jsonPath request.body '$.name'}}",
      "email": "{{jsonPath request.body '$.email'}}"
    },
    "transformers": ["response-template"]
  }
}
```

### Fault Injection

```json
// wiremock/mappings/fault-injection.json — WireMock stubs for resilience testing.
// Simulates slow responses, connection resets, and variable latency.
{
  "mappings": [
    {
      "request": { "method": "GET", "urlPath": "/api/slow" },
      "response": {
        "status": 200,
        "fixedDelayMilliseconds": 5000,
        "jsonBody": { "data": "delayed" }
      }
    },
    {
      "request": { "method": "GET", "urlPath": "/api/flaky" },
      "response": {
        "fault": "CONNECTION_RESET_BY_PEER"
      }
    },
    {
      "request": { "method": "GET", "urlPath": "/api/random-delay" },
      "response": {
        "status": 200,
        "delayDistribution": {
          "type": "lognormal",
          "median": 200,
          "sigma": 0.4
        },
        "jsonBody": { "data": "variable latency" }
      }
    }
  ]
}
```

### Recording Mode

```bash
# record-api.sh — Use WireMock to record real API traffic.
# Proxies requests to the real API and saves responses as stubs.

# Start in record mode
docker run -d --name wiremock-recorder \
  -p 8080:8080 \
  -v $(pwd)/wiremock:/home/wiremock \
  wiremock/wiremock:3.5.4 \
  --proxy-all="https://api.example.com" \
  --record-mappings

# Make requests through WireMock (they get recorded)
curl http://localhost:8080/api/users
curl http://localhost:8080/api/products?category=electronics

# Stop recording — stubs are saved in wiremock/mappings/
docker stop wiremock-recorder
```

### Stateful Scenarios

```json
// wiremock/mappings/stateful-order.json — WireMock stateful scenario.
// Simulates an order that changes state: pending -> confirmed -> shipped.
{
  "mappings": [
    {
      "scenarioName": "Order Lifecycle",
      "requiredScenarioState": "Started",
      "newScenarioState": "Order Placed",
      "request": { "method": "POST", "urlPath": "/api/orders" },
      "response": {
        "status": 201,
        "jsonBody": { "id": "ord-123", "status": "pending" }
      }
    },
    {
      "scenarioName": "Order Lifecycle",
      "requiredScenarioState": "Order Placed",
      "newScenarioState": "Order Confirmed",
      "request": { "method": "GET", "urlPath": "/api/orders/ord-123" },
      "response": {
        "status": 200,
        "jsonBody": { "id": "ord-123", "status": "confirmed" }
      }
    },
    {
      "scenarioName": "Order Lifecycle",
      "requiredScenarioState": "Order Confirmed",
      "request": { "method": "GET", "urlPath": "/api/orders/ord-123" },
      "response": {
        "status": 200,
        "jsonBody": { "id": "ord-123", "status": "shipped" }
      }
    }
  ]
}
```

### Programmatic API

```bash
# wiremock-api.sh — Create stubs via WireMock's admin API at runtime.
# Useful for dynamic test setup.

# Create a stub
curl -X POST http://localhost:8080/__admin/mappings \
  -H 'Content-Type: application/json' \
  -d '{
    "request": { "method": "GET", "urlPath": "/api/health" },
    "response": { "status": 200, "jsonBody": { "status": "ok" } }
  }'

# List all stubs
curl http://localhost:8080/__admin/mappings

# Reset all stubs
curl -X POST http://localhost:8080/__admin/reset
```

### CI Integration

```yaml
# .github/workflows/wiremock.yml — Run tests against WireMock in CI.
# Uses Docker service container.
name: Integration Tests
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      wiremock:
        image: wiremock/wiremock:3.5.4
        ports:
          - 8080:8080
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
        env:
          MOCK_API_URL: http://localhost:8080
```
