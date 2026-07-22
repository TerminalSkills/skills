---
title: Set Up Comprehensive API Testing
slug: set-up-comprehensive-api-testing
description: Build a complete API testing pipeline combining unit tests with Vitest, consumer-driven contract tests with Pact, load tests with k6, and mock servers with Mockoon — so every layer of your API is verified before it reaches production.
skills:
  - k6
  - pact
  - mockoon
  - vitest
category: devops
tags:
  - api-testing
  - contract-testing
  - load-testing
  - mocking
  - ci-cd
---

# Set Up Comprehensive API Testing

Priya leads backend engineering at a fintech startup. Her team ships a REST API that handles payment processing, account management, and transaction history. Three frontend teams and two partner integrations depend on this API. Last month, a breaking change in the `/transactions` response format slipped through code review and took down the partner dashboard for four hours. The postmortem was clear: unit tests alone aren't enough. Priya needs a layered testing strategy — unit tests for business logic, contract tests to catch breaking changes before they affect consumers, load tests to verify performance under realistic traffic, and mock servers so the frontend teams can develop without waiting on backend deploys.

## Step 1 — Unit Tests with Vitest

Start with the foundation: fast, isolated tests for business logic. Vitest runs in under a second and integrates naturally with TypeScript.

```bash
# install-vitest.sh — Install Vitest and testing utilities.
npm install --save-dev vitest @vitest/coverage-v8
```

```typescript
// src/services/__tests__/transaction-service.test.ts — Unit tests for the transaction service.
// Tests business logic in isolation without database or network calls.
import { describe, it, expect, vi } from 'vitest';
import { TransactionService } from '../transaction-service';

describe('TransactionService', () => {
  const mockRepo = {
    findByUserId: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
  };

  const service = new TransactionService(mockRepo as any);

  it('should reject negative transfer amounts', async () => {
    await expect(
      service.transfer({ from: 'acc-1', to: 'acc-2', amount: -50 })
    ).rejects.toThrow('Amount must be positive');

    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('should calculate fees for international transfers', () => {
    const fee = service.calculateFee({
      amount: 1000,
      currency: 'EUR',
      destinationCurrency: 'USD',
      isInternational: true,
    });

    expect(fee).toBe(25);
  });

  it('should return paginated transaction history', async () => {
    mockRepo.findByUserId.mockResolvedValue({
      transactions: [
        { id: 'tx-1', amount: 100, type: 'credit' },
        { id: 'tx-2', amount: 50, type: 'debit' },
      ],
      total: 47,
    });

    const result = await service.getHistory('user-123', { page: 1, limit: 20 });

    expect(result.transactions).toHaveLength(2);
    expect(result.total).toBe(47);
    expect(result.hasMore).toBe(true);
    expect(mockRepo.findByUserId).toHaveBeenCalledWith('user-123', { offset: 0, limit: 20 });
  });
});
```

Priya runs `npx vitest` and all 43 unit tests pass in 800ms. These cover business logic — fee calculations, validation rules, pagination math. But they don't catch the real problem: what happens when the response format changes and downstream consumers break?

## Step 2 — Contract Tests with Pact

Contract tests verify that the API's actual responses match what consumers expect. The consumer (frontend or partner) writes a test describing what it needs. The provider (Priya's API) verifies it can fulfill that contract. If someone changes the response format, the provider verification fails before the code merges.

```bash
# install-pact.sh — Install Pact for JavaScript.
npm install --save-dev @pact-foundation/pact
```

The partner dashboard team writes their consumer test:

```typescript
// tests/consumer/partner-dashboard.pact.test.ts — Consumer contract test.
// Defines exactly what the partner dashboard expects from the transactions API.
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { resolve } from 'path';
import { TransactionApiClient } from '../../src/clients/transaction-api';

const { like, eachLike, string, integer, timestamp } = MatchersV3;

const provider = new PactV3({
  consumer: 'partner-dashboard',
  provider: 'payment-api',
  dir: resolve(__dirname, '../../pacts'),
});

describe('Transaction API - Partner Dashboard Contract', () => {
  it('should return transaction list with required fields', async () => {
    await provider
      .given('user acc-1 has transactions')
      .uponReceiving('a request for transaction history')
      .withRequest({
        method: 'GET',
        path: '/api/v1/accounts/acc-1/transactions',
        query: { page: '1', limit: '20' },
        headers: { Authorization: 'Bearer valid-token' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          transactions: eachLike({
            id: string('tx-abc'),
            amount: integer(1000),
            currency: string('USD'),
            type: string('credit'),
            status: string('completed'),
            createdAt: timestamp("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", '2024-01-15T10:30:00.000Z'),
          }),
          total: integer(47),
          page: integer(1),
          limit: integer(20),
        },
      })
      .executeTest(async (mockServer) => {
        const client = new TransactionApiClient(mockServer.url, 'valid-token');
        const result = await client.getTransactions('acc-1', { page: 1, limit: 20 });

        expect(result.transactions.length).toBeGreaterThan(0);
        expect(result.transactions[0].id).toBeDefined();
        expect(result.transactions[0].amount).toBeDefined();
        expect(result.total).toBeDefined();
      });
  });
});
```

Now Priya adds provider verification to her API's test suite:

```typescript
// tests/provider/payment-api.pact.test.ts — Provider verification test.
// Verifies Priya's API fulfills all consumer contracts.
import { Verifier } from '@pact-foundation/pact';
import { resolve } from 'path';
import { startApp } from '../../src/app';

describe('Payment API - Provider Verification', () => {
  let server: any;

  beforeAll(async () => {
    server = await startApp(4567);
  });

  afterAll(async () => {
    await server.close();
  });

  it('should fulfill all consumer contracts', async () => {
    const verifier = new Verifier({
      providerBaseUrl: 'http://localhost:4567',
      provider: 'payment-api',
      pactUrls: [
        resolve(__dirname, '../../pacts/partner-dashboard-payment-api.json'),
      ],
      stateHandlers: {
        'user acc-1 has transactions': async () => {
          await seedTestData({
            userId: 'acc-1',
            transactions: [
              { id: 'tx-1', amount: 1000, currency: 'USD', type: 'credit', status: 'completed' },
              { id: 'tx-2', amount: 500, currency: 'USD', type: 'debit', status: 'completed' },
            ],
          });
        },
      },
    });

    await verifier.verifyProvider();
  });
});
```

With this in place, if anyone renames `createdAt` to `created_at` or removes the `status` field, the provider verification fails immediately. The breaking change that took down the partner dashboard for four hours? It would now be caught in the PR check.

## Step 3 — Mock Server with Mockoon for Frontend Development

While Priya's team builds the backend, the three frontend teams need a stable API to develop against. Mockoon gives them a local mock server that matches the real API's contract.

```json
// mocks/payment-api.json — Mockoon environment matching the real API contract.
// Frontend teams run this locally while the backend is in development.
{
  "uuid": "payment-mock",
  "lastMigration": 32,
  "name": "Payment API Mock",
  "port": 4000,
  "hostname": "0.0.0.0",
  "routes": [
    {
      "uuid": "route-transactions",
      "method": "get",
      "endpoint": "api/v1/accounts/:accountId/transactions",
      "responses": [
        {
          "uuid": "resp-tx-200",
          "statusCode": 200,
          "headers": [{ "key": "Content-Type", "value": "application/json" }],
          "body": "{\n  \"transactions\": [\n    {{#repeat 5}}\n    {\n      \"id\": \"tx-{{faker 'string.alphanumeric' length=8}}\",\n      \"amount\": {{faker 'number.int' min=100 max=50000}},\n      \"currency\": \"USD\",\n      \"type\": \"{{oneOf 'credit' 'debit'}}\",\n      \"status\": \"{{oneOf 'completed' 'pending' 'failed'}}\",\n      \"createdAt\": \"{{faker 'date.recent'}}\"\n    }{{#unless @last}},{{/unless}}\n    {{/repeat}}\n  ],\n  \"total\": 47,\n  \"page\": {{queryParam 'page' '1'}},\n  \"limit\": {{queryParam 'limit' '20'}}\n}",
          "default": true
        }
      ]
    },
    {
      "uuid": "route-create-tx",
      "method": "post",
      "endpoint": "api/v1/transfers",
      "responses": [
        {
          "uuid": "resp-transfer-201",
          "statusCode": 201,
          "headers": [{ "key": "Content-Type", "value": "application/json" }],
          "body": "{\n  \"id\": \"tx-{{faker 'string.alphanumeric' length=8}}\",\n  \"from\": \"{{body 'from'}}\",\n  \"to\": \"{{body 'to'}}\",\n  \"amount\": {{body 'amount'}},\n  \"status\": \"pending\",\n  \"createdAt\": \"{{now}}\"\n}",
          "default": true
        }
      ]
    }
  ]
}
```

```bash
# start-mock.sh — Start the Mockoon mock server for local frontend development.
npx @mockoon/cli start --data ./mocks/payment-api.json --port 4000
```

Now the mobile team, web team, and partner team can all develop against `http://localhost:4000` without coordinating with Priya's backend schedule.

## Step 4 — Load Tests with k6

The API handles payment processing — it needs to perform under load. Priya writes k6 tests that simulate realistic traffic patterns: a mix of transaction queries (read-heavy) and transfers (write with validation).

```javascript
// tests/load/payment-api.k6.js — k6 load test simulating realistic payment API traffic.
// Models a mix of read-heavy browsing and occasional transfers.
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const transferDuration = new Trend('transfer_duration');
const transferFailRate = new Rate('transfer_fail_rate');

export const options = {
  scenarios: {
    read_traffic: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 0 },
      ],
      exec: 'browseTransactions',
    },
    write_traffic: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 20,
      exec: 'makeTransfer',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    transfer_duration: ['p(95)<800'],
    transfer_fail_rate: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://staging-api.example.com';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'load-test-token';

const headers = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  'Content-Type': 'application/json',
};

export function browseTransactions() {
  group('Browse Transactions', () => {
    const res = http.get(`${BASE_URL}/api/v1/accounts/acc-1/transactions?page=1&limit=20`, { headers });
    check(res, {
      'status is 200': (r) => r.status === 200,
      'has transactions': (r) => JSON.parse(r.body).transactions.length > 0,
      'response under 500ms': (r) => r.timings.duration < 500,
    });
  });
  sleep(Math.random() * 3 + 1);
}

export function makeTransfer() {
  const payload = JSON.stringify({
    from: 'acc-1',
    to: `acc-${Math.floor(Math.random() * 100) + 2}`,
    amount: Math.floor(Math.random() * 10000) + 100,
    currency: 'USD',
  });

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/transfers`, payload, { headers });
  transferDuration.add(Date.now() - start);
  transferFailRate.add(res.status !== 201);

  check(res, {
    'transfer created': (r) => r.status === 201,
    'has transaction id': (r) => JSON.parse(r.body).id !== undefined,
  });
}
```

## Step 5 — CI Pipeline Bringing It All Together

```yaml
# .github/workflows/api-testing.yml — Complete API testing pipeline.
# Runs unit tests, contract tests, and load tests in sequence.
name: API Testing Pipeline
on:
  push:
    branches: [main]
  pull_request:

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx vitest run --coverage

  contract-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx vitest run tests/consumer/
      - run: npx vitest run tests/provider/
      - name: Publish pacts
        if: github.ref == 'refs/heads/main'
        run: |
          npx pact-broker publish pacts/ \
            --consumer-app-version ${{ github.sha }} \
            --branch main \
            --broker-base-url ${{ secrets.PACT_BROKER_URL }} \
            --broker-token ${{ secrets.PACT_BROKER_TOKEN }}

  load-tests:
    runs-on: ubuntu-latest
    needs: contract-tests
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/k6-action@v0.3.1
        with:
          filename: tests/load/payment-api.k6.js
        env:
          BASE_URL: ${{ secrets.STAGING_API_URL }}
          AUTH_TOKEN: ${{ secrets.LOAD_TEST_TOKEN }}
```

Priya commits the pipeline. The first PR after setup catches a teammate's change that renamed `createdAt` to `timestamp` in the transaction response — the Pact verification fails and blocks the merge. Every layer is covered: business logic (Vitest), API contracts (Pact), frontend development velocity (Mockoon), and performance (k6).
