---
name: pact
description: When the user wants to implement consumer-driven contract testing between microservices using Pact. Also use when the user mentions "pact," "contract testing," "consumer-driven contracts," "CDC testing," "provider verification," or "Pact Broker." For API mocking, see mockoon or wiremock.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - contract-testing
    - microservices
    - consumer-driven
    - api-testing
---

# Pact

## Overview

You are an expert in Pact, the consumer-driven contract testing framework. You help users write consumer tests that generate pact files, set up provider verification, configure a Pact Broker for sharing contracts, and integrate the "can-i-deploy" workflow into CI/CD pipelines. You understand the contract testing philosophy: consumers define what they need, providers verify they can deliver.

## Instructions

### Initial Assessment

1. **Architecture** — Which services need contract testing?
2. **Language** — JavaScript, Java, Python, Go, or .NET?
3. **Broker** — Self-hosted Pact Broker or Pactflow (SaaS)?
4. **CI** — How are services deployed? Independent pipelines?

### Consumer Test (JavaScript)

```typescript
// tests/consumer.pact.test.ts — Consumer-side Pact test.
// Defines what the consumer expects from the user-service API.
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { resolve } from 'path';
import { UserApiClient } from '../src/api/userClient';

const { like, eachLike, string, integer } = MatchersV3;

const provider = new PactV3({
  consumer: 'order-service',
  provider: 'user-service',
  dir: resolve(__dirname, '../pacts'),
});

describe('User API - Consumer Tests', () => {
  it('should return user by ID', async () => {
    await provider
      .given('a user with ID 1 exists')
      .uponReceiving('a request for user 1')
      .withRequest({
        method: 'GET',
        path: '/api/users/1',
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: like({
          id: integer(1),
          name: string('Jane Doe'),
          email: string('jane@example.com'),
        }),
      })
      .executeTest(async (mockServer) => {
        const client = new UserApiClient(mockServer.url);
        const user = await client.getUser(1);
        expect(user.id).toBe(1);
        expect(user.name).toBeDefined();
        expect(user.email).toBeDefined();
      });
  });

  it('should return 404 for non-existent user', async () => {
    await provider
      .given('no user with ID 999 exists')
      .uponReceiving('a request for non-existent user')
      .withRequest({
        method: 'GET',
        path: '/api/users/999',
      })
      .willRespondWith({
        status: 404,
        body: like({ error: string('User not found') }),
      })
      .executeTest(async (mockServer) => {
        const client = new UserApiClient(mockServer.url);
        await expect(client.getUser(999)).rejects.toThrow('User not found');
      });
  });
});
```

### Provider Verification

```typescript
// tests/provider.pact.test.ts — Provider-side verification test.
// Verifies that user-service fulfills the contracts from all consumers.
import { Verifier } from '@pact-foundation/pact';
import { resolve } from 'path';
import { startApp } from '../src/app';

describe('User Service - Provider Verification', () => {
  let server: any;

  beforeAll(async () => {
    server = await startApp(3456);
  });

  afterAll(async () => {
    await server.close();
  });

  it('should fulfill all consumer contracts', async () => {
    const verifier = new Verifier({
      providerBaseUrl: 'http://localhost:3456',
      provider: 'user-service',
      pactUrls: [resolve(__dirname, '../pacts/order-service-user-service.json')],
      stateHandlers: {
        'a user with ID 1 exists': async () => {
          await seedDatabase({ id: 1, name: 'Jane Doe', email: 'jane@example.com' });
        },
        'no user with ID 999 exists': async () => {
          await clearDatabase();
        },
      },
    });

    await verifier.verifyProvider();
  });
});
```

### Pact Broker Integration

```typescript
// tests/provider-broker.pact.test.ts — Provider verification against Pact Broker.
// Fetches contracts from the broker instead of local files.
import { Verifier } from '@pact-foundation/pact';

const verifier = new Verifier({
  providerBaseUrl: 'http://localhost:3456',
  provider: 'user-service',
  pactBrokerUrl: process.env.PACT_BROKER_BASE_URL,
  pactBrokerToken: process.env.PACT_BROKER_TOKEN,
  publishVerificationResult: process.env.CI === 'true',
  providerVersion: process.env.GIT_COMMIT,
  providerVersionBranch: process.env.GIT_BRANCH,
  consumerVersionSelectors: [
    { mainBranch: true },
    { deployedOrReleased: true },
  ],
});
```

### Can-I-Deploy

```bash
# can-i-deploy.sh — Check if it's safe to deploy a service.
# Queries the Pact Broker to verify all contracts are satisfied.

# Check if consumer can deploy
npx pact-broker can-i-deploy \
  --pacticipant order-service \
  --version $(git rev-parse HEAD) \
  --to-environment production \
  --broker-base-url $PACT_BROKER_BASE_URL \
  --broker-token $PACT_BROKER_TOKEN

# Record deployment
npx pact-broker record-deployment \
  --pacticipant order-service \
  --version $(git rev-parse HEAD) \
  --environment production \
  --broker-base-url $PACT_BROKER_BASE_URL \
  --broker-token $PACT_BROKER_TOKEN
```

### CI Integration

```yaml
# .github/workflows/pact-consumer.yml — Consumer contract test pipeline.
# Runs consumer tests, publishes pacts to broker, checks can-i-deploy.
name: Consumer Contract Tests
on: [push]
jobs:
  pact:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test -- --testPathPattern=pact
      - name: Publish pacts
        run: |
          npx pact-broker publish pacts/ \
            --consumer-app-version ${{ github.sha }} \
            --branch ${{ github.ref_name }} \
            --broker-base-url ${{ secrets.PACT_BROKER_URL }} \
            --broker-token ${{ secrets.PACT_BROKER_TOKEN }}
      - name: Can I deploy?
        run: |
          npx pact-broker can-i-deploy \
            --pacticipant order-service \
            --version ${{ github.sha }} \
            --to-environment production \
            --broker-base-url ${{ secrets.PACT_BROKER_URL }} \
            --broker-token ${{ secrets.PACT_BROKER_TOKEN }}
```
