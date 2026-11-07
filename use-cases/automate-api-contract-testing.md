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

The fundamental issue is asymmetric knowledge: the provider team knows what they changed, but they have no idea which consumers depend on which fields. A field that looks unused might be the only thing holding the billing dashboard together.

## The Solution

Use **api-tester** to map every endpoint's current request/response shape, **test-generator** to produce consumer-driven contract tests for each client-provider pair, and **cicd-pipeline** to run contracts on every PR so breaking changes get caught before merge.

## Step-by-Step Walkthrough

### Step 1: Map the Existing API Surface

```text
Here's our users service OpenAPI spec (paste or link). Crawl every endpoint,
document request/response schemas, and flag any fields that have inconsistent
naming conventions (camelCase vs snake_case mix). List every consumer service
that calls each endpoint — I'll confirm the list.
```

The spec contains 23 endpoints across 4 resource groups. Before writing any tests, the inconsistencies need documenting — 6 fields mix naming conventions, which is how the `userName` versus `user_name` disaster happened in the first place:

| Endpoint | Inconsistent Fields | Used By |
|---|---|---|
| `GET /users/{id}` | `userName` (camelCase) | billing, dashboard, mobile |
| `POST /users/{id}/subscription` | `plan_type` (snake_case) | billing |
| `GET /users/{id}/activity` | `lastLogin` (camelCase) | dashboard |

The full dependency matrix shows which services consume which endpoints — 47 consumer-endpoint pairs total. This is the map that did not exist before, and it is the reason nobody could predict what would break.

### Step 2: Generate Consumer Contract Tests

```text
For each consumer-provider pair in the matrix, generate Pact contract tests.
The billing service consumes GET /users/{id} and POST /users/{id}/subscription.
The dashboard consumes GET /users, GET /users/{id}, and GET /users/{id}/activity.
The mobile API gateway consumes all user endpoints. Generate provider-side
verification tests too.
```

Each consumer gets tests that describe exactly what it expects from the provider. Here is what the billing service's contract looks like:

```javascript
// billing-service/tests/contracts/users.pact.spec.js
const { PactV3, MatchersV3 } = require('@pact-foundation/pact');
const path = require('path');
const { like } = MatchersV3;

const provider = new PactV3({
  consumer: 'billing-service',
  provider: 'users-service',
  dir: path.resolve(__dirname, '../../pacts'),
});

it('returns user with subscription fields', async () => {
  provider
    .given('user 123 exists with active subscription')
    .uponReceiving('a request for user 123')
    .withRequest({ method: 'GET', path: '/users/123' })
    .willRespondWith({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        id: like('123'),
        userName: like('jane.doe'),        // Billing depends on this exact field name
        email: like('jane@example.com'),
        subscription: { plan_type: like('enterprise'), status: like('active') },
      },
    });

  await provider.executeTest(async (mockServer) => {
    // in a real suite, call the billing client code against mockServer.url
    const user = await (await fetch(`${mockServer.url}/users/123`)).json();
    expect(user.userName).toBe('jane.doe');
  });
});
```

Install with `npm i -D @pact-foundation/pact @pact-foundation/pact-cli jest`. Running the test writes the contract to `pacts/billing-service-users-service.json`.

The critical detail: the billing service's contract explicitly specifies `userName` (camelCase). Verifying that contract against a provider that returns `user_name` instead fails with `Actual map is missing the following keys: userName`, so the rename is caught *before the code ships*.

In total: **47 contract tests** — one per consumer-endpoint combination on the consumer side, plus provider verification tests that run all consumer pacts together. The provider cannot ship a change that breaks any consumer.

### Step 3: Set Up the Contract Broker and CI Integration

With **cicd-pipeline**, the contract steps go into GitLab CI (the skill covers GitLab CI and CircleCI; GitHub Actions has its own skill).

```text
Set up a Pact Broker (the open-source pactfoundation/pact-broker image, or a
hosted PactFlow account). Add CI jobs so that: consumer tests run on consumer
merge requests and publish pacts, provider verification runs on provider merge
requests, and deployment is blocked if any contract is broken. Use GitLab CI.
The provider repo is users-service and consumers are billing-service,
dashboard-app, and mobile-gateway. Broker URL and token come from CI variables.
```

The CI integration creates a closed loop where contract violations block deployment:

**Consumer side** (billing-service, dashboard-app, mobile-gateway):

```yaml
# .gitlab-ci.yml
consumer-contracts:
  image: node:22
  script:
    - npm ci
    - npx jest --testPathPatterns=pact
    - npx pact-broker publish ./pacts --consumer-app-version "$CI_COMMIT_SHA" --branch "$CI_COMMIT_REF_NAME"
  # PACT_BROKER_BASE_URL and PACT_BROKER_TOKEN are masked CI/CD variables
```

**Provider side** (users-service): a verification script reads the pacts from the broker and publishes the result.

```javascript
// pact-verification.js
const { Verifier } = require('@pact-foundation/pact');
new Verifier({
  provider: 'users-service',
  providerBaseUrl: process.env.PROVIDER_URL,       // the service started in the job, e.g. http://127.0.0.1:3000
  pactBrokerUrl: process.env.PACT_BROKER_BASE_URL,
  pactBrokerToken: process.env.PACT_BROKER_TOKEN,
  providerVersion: process.env.CI_COMMIT_SHA,
  providerVersionBranch: process.env.CI_COMMIT_REF_NAME,
  publishVerificationResult: process.env.CI === 'true',
  consumerVersionSelectors: [{ mainBranch: true }, { deployedOrReleased: true }],
  stateHandlers: { 'user 123 exists with active subscription': async () => { /* seed test data */ } },
}).verifyProvider();
```

```yaml
provider-verification:
  image: node:22
  script:
    - npm ci
    - node pact-verification.js
    - npx pact-broker can-i-deploy --pacticipant users-service --version "$CI_COMMIT_SHA" --to-environment production

deploy-production:
  needs: [provider-verification]
  script:
    - ./deploy.sh
    - npx pact-broker record-deployment --pacticipant users-service --version "$CI_COMMIT_SHA" --environment production
```

The `can-i-deploy` check is the enforcement mechanism. It queries the broker: "Given my latest code, will any consumer break?" If the answer is yes, the job fails and the deployment is blocked. The `record-deployment` step tells the broker which version is live, so the next check compares against what is actually in production.

### Step 4: Handle the First Breaking Change Safely

```text
I need to rename the "userName" field to "username" across all endpoints.
Generate a migration plan: add the new field alongside the old one, update
consumer contracts one by one, then deprecate the old field. Show me the
exact contract test changes for each step.
```

This is the exact scenario that caused the outage. With contracts in place, the rename becomes a controlled three-phase migration instead of a surprise breaking change:

**Phase 1: Provider adds the alias (both fields returned)**

```typescript
// users-service — response now includes both fields
{
  userName: 'jane.doe',   // Keep for existing consumers
  username: 'jane.doe',   // New canonical field
}
```

All existing consumer contracts still pass because `userName` is still present. The new `username` field is additive — it breaks nothing.

**Phase 2: Consumers migrate one by one**

Each consumer updates its contract to expect `username` instead of `userName`, at its own pace. The billing team does it on Monday, the dashboard team on Wednesday, the mobile team the following week. Each migration is a small, safe PR.

```typescript
// billing-service — updated contract
willRespondWith: {
  body: {
    username: like('jane.doe'),  // Changed from userName
  },
}
```

**Phase 3: Provider removes the old field**

Once the broker shows that every consumer's latest contract expects `username`, the provider removes `userName`. If any consumer is still referencing the old field, the `can-i-deploy` check blocks the removal.

Total time: 2-3 weeks, zero breakage, full confidence at every step.

### Step 5: Add Contract Coverage Reporting

```text
Add a CI step that reports contract coverage: what percentage of endpoints
have consumer contracts, which endpoints are untested, and which consumers
are missing contracts. Output as a markdown table in PR comments.
```

A coverage script cross-references the OpenAPI spec with published pacts and posts a report on every PR:

| Resource Group | Endpoints | Covered | Coverage |
|---|---|---|---|
| Users | 8 | 8 | 100% |
| Subscriptions | 5 | 5 | 100% |
| Activity | 6 | 6 | 100% |
| Admin | 4 | 4 | 100% |
| **Total** | **23** | **23** | **100%** |

47 out of 47 consumer-endpoint pairs tested. Every endpoint has at least one consumer contract, and every consumer has contracts for every endpoint it uses. When a new endpoint gets added without contracts, the coverage report flags it immediately.

## Real-World Example

A platform engineer at a 30-person fintech runs 14 internal APIs. Every two weeks, a field rename or response shape change breaks a downstream service in staging — sometimes in production. The team spends 6-8 hours per sprint debugging integration failures, and the post-mortem always says the same thing: "we didn't know anyone was using that field."

She maps all 14 APIs and their consumers, producing a 47-row dependency matrix that makes the invisible dependencies visible for the first time. The agent generates 89 contract test files across all consumer-provider pairs. CI pipelines enforce contracts on every PR.

In the first sprint with contracts, 3 breaking changes are caught before merge — all cases where a provider team had no idea a consumer depended on a specific field name or response shape. Over 6 weeks, integration failures drop from 4 per sprint to zero. The team reclaims 6+ hours per sprint that was being burned on "why did this break?" investigations.
