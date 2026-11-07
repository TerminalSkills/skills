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

Your API has 31 endpoints and a well-maintained OpenAPI spec. Customers keep asking for SDKs -- the Python team wants a Python client, the JavaScript developers want a typed npm package. Hand-writing SDKs for 2 languages means maintaining 2 parallel codebases that drift out of sync every time you add an endpoint.

Generators such as openapi-generator produce code that compiles but is missing what developers expect from a client: retry on rate limits, auto-pagination, and error types that mean something. Asking an AI agent to write the whole SDK from scratch has the opposite problem -- it looks hand-written, but every regeneration is a new draft and nothing guarantees it still matches the spec.

## The Solution

Split the work. A deterministic generator turns `openapi.yaml` into typed models and operation functions, so the part that must match the spec is always regenerated from the spec. **coding-agent** runs Claude Code (or Codex CLI) in the background to write a thin hand-written layer on top -- retries, pagination, friendly errors -- in files the generator never touches. **test-generator** covers that layer with tests, and **markdown-writer** produces the README. CI regenerates the generated part on every spec change.

This page uses two generators: [`@hey-api/openapi-ts`](https://heyapi.dev/openapi-ts/get-started) for TypeScript and [`openapi-python-client`](https://github.com/openapi-generators/openapi-python-client) for Python.

## Step-by-Step Walkthrough

### Step 1: Analyze the OpenAPI Spec

```text
Parse our openapi.yaml. Summarize the API surface: endpoints, models, auth patterns, and pagination style. Identify anything the generators will not handle for us.
```

The agent maps out the API surface and lists what the hand-written layer must cover:

| Aspect | Details |
|---|---|
| **Endpoints** | 31 across 6 groups (Orders, Products, Users, Webhooks, Reports, Events) |
| **Auth** | Bearer token (generators wire this up from `securitySchemes`) |
| **Pagination** | Cursor-based with `next_cursor` -- not generated, needs a wrapper |
| **Rate limiting** | 429 status + `Retry-After` header -- not generated, needs a wrapper |
| **Async reports** | POST returns a job ID, client polls -- needs a convenience method |

Run the spec through a validator before generating (`npx @redocly/cli lint openapi.yaml`); a generator turns spec mistakes into SDK bugs.

### Step 2: Generate the Typed Core

```console
$ npm install --save-dev @hey-api/openapi-ts typescript@5
$ npx openapi-ts -i openapi.yaml -o src/client -c @hey-api/client-fetch
$ pip install openapi-python-client
$ openapi-python-client generate --path openapi.yaml --output-path sdks/python --meta uv
```

The first command produces `src/client/` with `types.gen.ts` (one type per schema), `sdk.gen.ts` (one function per `operationId`, such as `listOrders` and `createOrder`) and a fetch client. The second produces a Python package `orders_api_client` with one module per operation, each exposing `sync`, `sync_detailed`, `asyncio` and `asyncio_detailed`. `--meta` accepts `none`, `poetry`, `setuptools`, `pdm` or `uv`; it also needs `ruff` on the PATH to format the output.

Generated code is typed and ready to use as is:

```typescript
import { listOrders, createOrder } from "./client";
import { client } from "./client/client.gen";   // the index does not re-export the client instance

client.setConfig({ baseUrl: "https://api.example.com", auth: () => process.env.API_TOKEN });
const { data, error } = await listOrders({ query: { cursor: undefined } });
const order = await createOrder({ body: { product_id: "prod_123", quantity: 1 }, throwOnError: true });
```

```python
import os

from orders_api_client import AuthenticatedClient
from orders_api_client.api.default import list_orders

client = AuthenticatedClient(base_url="https://api.example.com", token=os.environ["API_TOKEN"])
page = list_orders.sync(client=client)          # typed model, or None on an undeclared status
```

Note that `openapi-python-client` builds `attrs` classes, not Pydantic models, and uses `httpx` underneath. Commit the generated directories, mark them `linguist-generated` in `.gitattributes`, and never hand-edit them.

### Step 3: Have a Coding Agent Write the Convenience Layer

Give the agent a precise, self-contained task and run it in the background (the `coding-agent` skill covers this pattern). In print mode nobody can approve prompts, so pre-approve only what the task needs:

```bash
LOG=$(mktemp /tmp/sdk-agent.XXXXXX)
claude -p "In sdks/typescript/src/orders.ts write an ApiClient class on top of the generated client in src/client. \
Add: retry on HTTP 429 honouring Retry-After (max 3 retries, then throw RateLimitError), \
an async generator listAll() that follows next_cursor, and a typed ValidationError for 422 responses. \
Do not edit any *.gen.ts file. Finish by running npx tsc --noEmit." \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Write" "Edit" "Bash(npx tsc --noEmit)" \
  --max-budget-usd 2 > "$LOG" 2>&1 &
echo "agent PID $!, log $LOG"
```

Equivalent for Codex CLI: `codex exec --sandbox workspace-write --ephemeral "<same prompt>"`. Review the diff when it finishes; the agent only touched `orders.ts`, so review is a few dozen lines instead of a whole SDK. The result looks like this:

```typescript
const sdk = new ApiClient({ apiKey: process.env.API_TOKEN! });

for await (const order of sdk.listAll()) {   // auto-pagination, 429 retries inside
  console.log(order.total);
}
```

Run the same task for Python. The result is a small module outside the generated package (here `orders_sdk.py`, so it cannot collide with the generated `client.py`); this version was run against a generated client:

```python
import time
from collections.abc import Iterator

from orders_api_client import AuthenticatedClient
from orders_api_client.api.default import list_orders
from orders_api_client.models import Order


class RateLimitError(Exception):
    pass


class ValidationError(Exception):
    def __init__(self, body: bytes):
        super().__init__(body.decode(errors="replace"))


def list_all(client: AuthenticatedClient, max_retries: int = 3) -> Iterator[Order]:
    cursor = None
    while True:
        for attempt in range(max_retries + 1):
            resp = list_orders.sync_detailed(client=client, cursor=cursor or None)
            if resp.status_code != 429:
                break
            if attempt == max_retries:
                raise RateLimitError("still rate limited after retries")
            time.sleep(float(resp.headers.get("Retry-After", "1")))
        if resp.status_code == 422:
            raise ValidationError(resp.content)
        if resp.parsed is None:
            raise RuntimeError(f"unexpected status {resp.status_code}")
        yield from resp.parsed.items
        if not resp.parsed.next_cursor:   # None and "" both end the loop
            return
        cursor = resp.parsed.next_cursor
```

Because the layer sits outside the generated directories, regenerating never overwrites it.

### Step 4: Generate Tests for the Hand-Written Layer

```text
Write vitest tests for src/orders.ts using msw to mock https://api.example.com. Cover: a 429 followed by success, cursor pagination across two pages, 422 -> ValidationError, retry exhaustion. Then write pytest tests for the Python wrapper using pytest-httpx.
```

The test-generator skill detects the framework and produces Arrange-Act-Assert tests with the HTTP layer mocked, so nothing needs a live API:

| SDK | Framework | Mocking |
|---|---|---|
| TypeScript | vitest + `msw` (`setupServer` from `msw/node`) | `http.get(...)` handlers, `Retry-After: 0` in tests so they run instantly |
| Python | pytest + `pytest-httpx` | `httpx_mock.add_response(...)` |

Measure coverage on the hand-written code only; generated files drag the number down and test nothing you own. In `vitest.config.ts` set `test.coverage.exclude: ["src/client/**"]`, and in pytest use `--cov=orders_sdk`:

```console
$ npx vitest run --coverage
$ pytest --cov=orders_sdk --cov-report=term-missing
```

For the generated part, one contract test is enough: regenerate in CI and fail if `git diff --exit-code` is not clean.

### Step 5: README and a Publish Pipeline

```text
Write README docs for both SDKs with installation, quickstart, and one example per resource group.
```

markdown-writer produces the READMEs. Then wire CI so a spec change regenerates the core and a tag publishes. Publish with OIDC trusted publishing instead of long-lived tokens (configure the trusted publisher on npmjs.com and PyPI first; npm needs CLI 11.5.1+ and Node 22.14+):

```yaml
# .github/workflows/sdk-sync.yml -- keep generated code in sync with the spec
on:
  push:
    paths: ['openapi.yaml']
jobs:
  sync:
    runs-on: ubuntu-latest
    permissions: { contents: write, pull-requests: write }
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: '24' }
      - run: npm ci && npx openapi-ts -i openapi.yaml -o sdks/typescript/src/client -c @hey-api/client-fetch
      - uses: peter-evans/create-pull-request@v8  # opens a PR only if the diff is non-empty
        with: { title: "Regenerate SDKs from openapi.yaml" }

# .github/workflows/sdk-typescript.yml -- publish on tag
on:
  push:
    tags: ['v*-ts']
permissions: { id-token: write, contents: read }
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: '24', registry-url: 'https://registry.npmjs.org' }
      - run: npm ci && npm test && npm run build
      - run: npm publish --access public
```

For PyPI use `pypa/gh-action-pypi-publish@release/v1` with `id-token: write` after building with `uv build`. Pin third-party actions to a commit SHA in a real repository.

## Real-World Example

Tomas, the API lead at a 20-person developer tools startup, was losing deals because competitors had SDKs and he didn't. His 31-endpoint API had a solid OpenAPI spec. He had tried openapi-generator before: the output compiled but had no retry logic and a single catch-all exception class.

This time he let `openapi-ts` and `openapi-python-client` produce the typed core in minutes, and used the coding agent only for the thin layer: retries, pagination and typed errors, about 150 lines per language. The test-generator suite for that layer found one real bug on its first run -- the pagination loop stopped early when `next_cursor` was an empty string instead of `null`. He published both packages the same week. When he added a `/shipments` endpoint a few days later, the sync workflow regenerated both cores and opened a PR before he had thought about updating the SDKs by hand; the only manual work was a one-line `listAll` addition for the new resource.
