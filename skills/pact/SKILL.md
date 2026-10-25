---
name: pact
description: >-
  Sets up consumer-driven contract testing with Pact JS: a consumer test that writes a pact file, a provider verification that replays it, and a Pact Broker or PactFlow with can-i-deploy in CI. Use when the user mentions "pact", "contract testing", "consumer-driven contracts", "provider verification", "can-i-deploy", "Pact Broker" or wants to stop two services breaking each other without end-to-end tests.
license: Apache-2.0
compatibility: "Node.js 22+ (required by @pact-foundation/pact 17), Jest or Vitest, an HTTP provider reachable from the test runner; a Pact Broker or PactFlow account for sharing contracts"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: "contract-testing, pact, microservices, api-testing, ci"
---

# Pact Contract Testing (Pact JS)

## Overview

A contract test answers one question: will this consumer keep working against that provider, without starting both? The consumer test runs the real client code against a Pact mock server, and what the client sent and expected is saved as a pact file. The provider later replays that file against its real API. If both sides pass, the contract holds. A broker stores the pacts and verification results, and `can-i-deploy` uses them to decide whether a version may ship.

Pact JS 17 (verified with 17.1.4) uses the V4 consumer API (`PactV4`) and the `Verifier` class. Matching rules come from `MatchersV3`.

Use it for HTTP/JSON services owned by different teams or deployed independently. Do not use it for third-party APIs you cannot ask to verify, for load or latency checks, or as a replacement for testing business logic inside the provider.

## Instructions

### 1. Ask and look up first

Ask only what the project cannot tell you: which service is the consumer, which is the provider, whether a broker exists (URL, token in an environment variable), and how the provider is started in tests. Look up the HTTP client the consumer uses, its test runner, the provider framework, and the CI system.

Decide the names once. Consumer and provider names become part of the pact file name and the broker, so use the deployable service names (`storefront-web`, `parcel-tracker`), not team names.

### 2. Install

```bash
npm install --save-dev @pact-foundation/pact vitest
```

Node 22 or newer is required. Pact files are written to `./pacts` unless `dir` says otherwise; add `pacts/` to `.gitignore` when a broker is used.

### 3. Write the consumer test

Cover only what the consumer really reads. Every extra field in the expectation becomes a demand on the provider.

```js
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { PactV4, MatchersV3 } from '@pact-foundation/pact';
import { ShipmentClient } from '../src/shipment-client.js';

const { like, regex, eachLike, timestamp } = MatchersV3;

const pact = new PactV4({
  consumer: 'storefront-web',
  provider: 'parcel-tracker',
  dir: path.resolve(process.cwd(), 'pacts'),
});

describe('parcel-tracker contract', () => {
  it('returns a parcel that exists', () =>
    pact
      .addInteraction()
      .given('parcel TRK-48213 is in transit')
      .uponReceiving('a request for parcel TRK-48213')
      .withRequest('GET', '/parcels/TRK-48213', (b) =>
        b.headers({
          Accept: 'application/json',
          Authorization: regex(/^Bearer .+$/, 'Bearer tok-7f3a'),
        }),
      )
      .willRespondWith(200, (b) =>
        b.headers({ 'Content-Type': 'application/json' }).jsonBody({
          trackingCode: 'TRK-48213',
          status: regex(/^(label_created|in_transit|delivered)$/, 'in_transit'),
          updatedAt: timestamp("yyyy-MM-dd'T'HH:mm:ss'Z'", '2026-10-12T09:30:00Z'),
          events: eachLike({ city: like('Rotterdam'), code: like('ARR') }),
        }),
      )
      .executeTest(async (mockServer) => {
        const client = new ShipmentClient(mockServer.url, 'tok-7f3a');
        const parcel = await client.getParcel('TRK-48213');
        expect(parcel.status).toBe('in_transit');
      }));
});
```

Rules that keep contracts honest:
- The client under test must take its base URL from a parameter, so the test can pass `mockServer.url`.
- `.given(...)` names a provider state. Write it as a sentence the provider team can implement ("parcel TRK-48213 is in transit").
- Use matchers (`like`, `regex`, `eachLike`, `timestamp`) for values that vary; exact values for things the consumer branches on.
- Add one interaction per distinct response the consumer handles: success, not found, validation error, unauthorized.
- The mock server verifies the request too. If the client sends something different, `executeTest` throws.

After `vitest run`, `pacts/storefront-web-parcel-tracker.json` exists. Open it once and check that matching rules appear under `matchingRules` and that no secret is in it (use a fake token).

### 4. Verify on the provider side

Run the real provider with its dependencies stubbed, and map each provider state to setup code.

```js
import { describe, it } from 'vitest';
import { Verifier } from '@pact-foundation/pact';
import { buildApp, parcelStore } from '../src/app.js';

describe('parcel-tracker provider verification', () => {
  it('honours every consumer pact', async () => {
    const server = buildApp().listen(0);
    const { port } = server.address();
    try {
      await new Verifier({
        provider: 'parcel-tracker',
        providerBaseUrl: `http://127.0.0.1:${port}`,
        pactUrls: ['./pacts/storefront-web-parcel-tracker.json'],
        stateHandlers: {
          'parcel TRK-48213 is in transit': async () => {
            await parcelStore.reset();
            await parcelStore.insert({ trackingCode: 'TRK-48213', status: 'in_transit' });
          },
          'no parcel TRK-00000 exists': async () => parcelStore.reset(),
        },
      }).verifyProvider();
    } finally {
      server.close();
    }
  });
});
```

`verifyProvider()` rejects when any interaction fails, so the test fails with the diff. Missing state handlers are the most common cause of confusing failures. Use `beforeEach`/`afterEach` hooks or `requestFilter` only when every request needs shared setup such as an auth header.

### 5. Share pacts through a broker

Self-hosted Pact Broker and PactFlow expose the same API. Keep the URL and token in `PACT_BROKER_BASE_URL` and `PACT_BROKER_TOKEN`; never commit them.

Publish from the consumer pipeline with the Pact CLI (installed from the `pactfoundation/pact-cli` image or the `@pact-foundation/pact-cli` package):

```bash
pact-broker publish ./pacts \
  --consumer-app-version "$GITHUB_SHA" \
  --branch "$GITHUB_REF_NAME"
```

Tell the provider to fetch from the broker and report back:

```js
await new Verifier({
  provider: 'parcel-tracker',
  providerBaseUrl: `http://127.0.0.1:${port}`,
  pactBrokerUrl: process.env.PACT_BROKER_BASE_URL,
  pactBrokerToken: process.env.PACT_BROKER_TOKEN,
  consumerVersionSelectors: [
    { mainBranch: true },
    { deployedOrReleased: true },
  ],
  enablePending: true,
  providerVersion: process.env.GITHUB_SHA,
  providerVersionBranch: process.env.GITHUB_REF_NAME,
  publishVerificationResult: process.env.CI === 'true',
  stateHandlers,
}).verifyProvider();
```

- Selectors keep verification to the pacts that matter: the consumer's main branch and whatever is live.
- `enablePending: true` stops a brand-new consumer expectation from breaking the provider build before the provider has had a chance to implement it.
- Publish verification results only from CI, never from a laptop.

### 6. Gate deployments

Register environments once (`production`, `staging`) in the broker. Before each deploy, ask:

```bash
pact-broker can-i-deploy --pacticipant storefront-web --version "$GITHUB_SHA" --to-environment production
```

Exit code 0 means every pact involving this version is verified against what runs in that environment. After a successful deploy, record it so later checks know what is live:

```bash
pact-broker record-deployment --pacticipant storefront-web --version "$GITHUB_SHA" --environment production
```

A provider-side change to the API goes through the same gate: the provider build verifies the consumers' pacts, publishes results, then asks `can-i-deploy` for itself.

### 7. Handle a provider webhook (optional)

When a consumer publishes a changed pact, the broker can trigger the provider's pipeline with a webhook on the event `contract_requiring_verification_published`. This verifies the new contract at once rather than at the provider's next commit.

## Examples

### Example 1: first contract between two services

Request: "storefront-web calls parcel-tracker; add contract tests." Look up `src/shipment-client.js` and the Express app of `parcel-tracker`. Add the consumer test from step 3 with a success and a 404 interaction, run `npx vitest run`, and confirm `pacts/storefront-web-parcel-tracker.json` lists both. Add the provider verification from step 4 with a state handler for each `given`. Run it against the local file. Result: two tests pass on the consumer, one verification on the provider, and no broker needed yet.

### Example 2: provider renames a field

`parcel-tracker` wants to rename `status` to `state`. The provider verification fails with `Expected 'status' but it was missing` for storefront-web. The team does not rename in place: they return both fields for a release, storefront-web switches to `state` and its pact is republished, then the provider removes `status` once `can-i-deploy` shows no deployed consumer reads it. The contract turned a breaking change into a planned migration.

### Example 3: CI for the consumer (GitHub Actions)

```yaml
name: storefront-web contracts
on: [push]
jobs:
  contract:
    runs-on: ubuntu-latest
    env:
      PACT_BROKER_BASE_URL: ${{ vars.PACT_BROKER_BASE_URL }}
      PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npx vitest run test/shipment-client.pact.test.js
      - run: >
          docker run --rm -v "$PWD/pacts:/pacts" -e PACT_BROKER_BASE_URL -e PACT_BROKER_TOKEN
          pactfoundation/pact-cli publish /pacts
          --consumer-app-version "$GITHUB_SHA" --branch "$GITHUB_REF_NAME"
      - run: >
          docker run --rm -e PACT_BROKER_BASE_URL -e PACT_BROKER_TOKEN
          pactfoundation/pact-cli broker can-i-deploy
          --pacticipant storefront-web --version "$GITHUB_SHA" --to-environment production
```

## Guidelines

- A pact describes what the consumer uses, not the provider's whole API. Do not copy the OpenAPI schema into it.
- Do not put business rules into provider states. A state sets up data; the tests do not check the logic behind it.
- Match shapes, not values, unless the consumer depends on the value. Overly exact pacts make every provider change look breaking.
- Keep tokens, real customer data and production URLs out of pact files; they are uploaded and read by other teams.
- Provider state names are an agreement between teams. Renaming one is a breaking change.
- Messages (queues, events) use the same ideas with `MessageConsumerPact`/`MessageProviderPact`; handle them separately from HTTP.
- Contract tests do not replace one or two end-to-end smoke tests, and they do not cover non-functional behaviour.
- Pin the major version of the Pact packages in all services; consumers and providers on different spec versions can still interoperate, but upgrades are easier together.
