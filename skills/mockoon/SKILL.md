---
name: mockoon
description: >-
  Mockoon runs mock REST APIs on your machine from a JSON environment file:
  a desktop app designs them and a CLI serves them without a GUI. Use when
  the user wants to fake a backend for frontend work, mock an OpenAPI spec,
  return dynamic responses with templating and rules, or start a mock server
  in CI or Docker. Also use when the user mentions "mockoon," "API mocking,"
  "mock server," "mock API," "OpenAPI mock," or "local API simulation." For
  programmatic HTTP mocking, see wiremock.
license: Apache-2.0
compatibility: "Node.js 18+ for the CLI (@mockoon/cli 9); desktop app on Windows, macOS and Linux"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/mockoon/mockoon
  tags:
    - api-mocking
    - mock-server
    - openapi
    - development
---

# Mockoon

## Overview

Mockoon is an open-source tool for running mock API servers locally. A mock is an *environment*: one JSON file holding routes, responses, rules and data. The desktop app edits and runs environments; the CLI (`mockoon-cli`) serves the same files headlessly in a terminal, CI job or container. Responses can be static, generated with Handlebars templating and Faker, chosen by rules on the request, or backed by an in-memory data bucket that behaves like a small CRUD database.

## Instructions

### Initial Assessment

1. **Purpose** — Frontend development, integration testing, or demo?
2. **API spec** — Do you have an OpenAPI/Swagger spec to import?
3. **Complexity** — Static responses or dynamic (templating, rules)?
4. **Environment** — Local development, CI, or Docker?

### CLI Setup

```bash
# Add the CLI to the project (the binary is called mockoon-cli)
npm install --save-dev @mockoon/cli
npx mockoon-cli start --data ./mocks/storefront.json --port 3001

# Or install it once for all projects
npm install -g @mockoon/cli
```

The desktop app is optional: `brew install --cask mockoon` (macOS), `winget install mockoon` (Windows), `snap install mockoon` (Linux). It stores each environment as a JSON file — right-click an environment and choose "Show in folder" to find it.

### Environment Configuration

`mocks/storefront.json` — a data bucket, a CRUD route on top of it, and a route with conditional responses:

```json
{
  "uuid": "f5420a7c-39c1-4441-a915-8b8e992c9aa8",
  "lastMigration": 33,
  "name": "Storefront API",
  "endpointPrefix": "api",
  "port": 3001,
  "hostname": "127.0.0.1",
  "data": [
    {
      "uuid": "0e938a92-13f3-4763-8728-720e9a7a582b",
      "id": "prod",
      "name": "products",
      "value": "[\n  {{#repeat 3}}\n  { \"id\": \"{{faker 'string.uuid'}}\", \"name\": \"{{faker 'commerce.productName'}}\", \"priceCents\": {{faker 'number.int' min=500 max=9900}} }\n  {{/repeat}}\n]"
    }
  ],
  "routes": [
    {
      "uuid": "5f86de43-cd07-425b-911b-0c9fe72d144e",
      "type": "crud",
      "endpoint": "products",
      "responses": [
        { "uuid": "1493969d-e219-401e-905d-e14c1cb99f86", "bodyType": "DATABUCKET", "databucketID": "prod", "default": true }
      ]
    },
    {
      "uuid": "18b5ebe3-9ef2-4662-9837-ff33b4cb0280",
      "type": "http",
      "method": "get",
      "endpoint": "orders/:id",
      "responses": [
        {
          "uuid": "2de84593-5bd0-402e-9931-1db212693cb1",
          "statusCode": 200,
          "label": "Found",
          "headers": [{ "key": "Content-Type", "value": "application/json" }],
          "body": "{ \"id\": \"{{urlParam 'id'}}\", \"status\": \"shipped\", \"placedAt\": \"{{now 'yyyy-MM-dd'}}\" }",
          "default": true
        },
        {
          "uuid": "5614aaa1-1942-4a87-b143-de99ae9fe737",
          "statusCode": 401,
          "label": "No token",
          "headers": [{ "key": "Content-Type", "value": "application/json" }],
          "body": "{ \"error\": \"Unauthorized\" }",
          "rules": [{ "target": "header", "modifier": "Authorization", "operator": "null", "value": "", "invert": false }]
        },
        {
          "uuid": "c75cf058-59ac-4840-9124-85aea071a2b0",
          "statusCode": 404,
          "label": "Unknown order",
          "headers": [{ "key": "Content-Type", "value": "application/json" }],
          "body": "{ \"error\": \"Order not found\" }",
          "rules": [{ "target": "params", "modifier": "id", "operator": "equals", "value": "ord_missing", "invert": false }]
        }
      ]
    }
  ]
}
```

This file is trimmed for reading. `mockoon-cli start` loads a copy, fills every omitted key with its default and leaves the file on disk untouched; `mockoon-cli validate --data mocks/storefront.json` is strict and lists each omitted key. Files saved by the desktop app or produced by `mockoon-cli import` are complete. Keep `lastMigration` (33 for version 9.9) — without it the CLI stops to ask whether to repair the file unless `--repair` is passed. Every `uuid` must be a real, unique UUID (`node -e "console.log(crypto.randomUUID())"`).

A CRUD route serves `GET`, `POST`, `PUT`, `PATCH` and `DELETE` on `/products` and `/products/:id` from the bucket. Changes live in memory until the server restarts. The list endpoint accepts `page`, `limit`, `sort`, `order`, `search` and filters such as `priceCents_gt=2000` or `name_like=Tote`, and returns `X-Total-Count` and `X-Filtered-Count` headers.

### Templating Helpers

A response body (or bucket value) is a Handlebars template:

```handlebars
{
  "id": "{{faker 'string.uuid'}}",
  "name": "{{faker 'person.fullName'}}",
  "email": "{{faker 'internet.email'}}",
  "createdAt": "{{now 'yyyy-MM-dd'}}",
  "quantity": {{faker 'number.int' min=1 max=20}},
  "request": {
    "method": "{{method}}",
    "pathId": "{{urlParam 'id'}}",
    "search": "{{queryParam 'search'}}",
    "customerEmail": "{{body 'customer.email'}}",
    "auth": "{{header 'Authorization'}}"
  },
  "firstProduct": {{data 'products' '0'}},
  "productNames": [{{#each (dataRaw 'products')}}"{{name}}"{{#unless @last}}, {{/unless}}{{/each}}],
  "region": "{{getEnvVar 'MOCKOON_REGION' 'eu-west-1'}}"
}
```

`data` and `dataRaw` read a bucket by name. `getEnvVar` only sees variables that start with `MOCKOON_` unless `--env-vars-prefix` changes the prefix.

### Response Rules

Each response may carry `rules`; the first response whose rules match is served, otherwise the one marked `"default": true`. Within a response, `"rulesOperator": "AND"` requires all rules (the default is `OR`).

- **target:** `body`, `query`, `header`, `cookie`, `params`, `path`, `method`, `request_number`, `global_var`, `data_bucket`, `templating`
- **operator:** `equals`, `regex`, `regex_i`, `null`, `empty_array`, `array_includes`, `valid_json_schema`
- **modifier:** the property to read, such as a header name, a query parameter or a body path like `customer.email`
- **invert:** `true` negates the rule

```json
{ "target": "query", "modifier": "category", "operator": "regex_i", "value": "^(tea|coffee)$", "invert": false }
```

### OpenAPI

```bash
# Serve a spec directly (Swagger 2 / OpenAPI 3, JSON or YAML)
npx mockoon-cli start --data ./openapi.yaml --port 3001

# Convert it to an environment file to add rules and templating, or go the other way
npx mockoon-cli import --input ./openapi.yaml --output ./mocks/inventory.json --prettify
npx mockoon-cli export --input ./mocks/storefront.json --output ./storefront.openapi.yaml --format yaml
```

### Docker

```bash
# The image's entrypoint is "mockoon-cli start", so only flags follow the image name.
docker run -d --name mockoon \
  -p 3001:3001 \
  -v "$(pwd)/mocks/storefront.json:/data/storefront.json:ro" \
  mockoon/cli:latest \
  --data /data/storefront.json --port 3001 --hostname 0.0.0.0

# Or generate a Dockerfile that bundles the environment file
npx mockoon-cli dockerize --data ./mocks/storefront.json --port 3001 --output ./docker-build/Dockerfile
```

Check the generated Dockerfile before `docker build`: 9.9.0 still writes `FROM node:16-alpine`, on which CLI 9 fails to start (`No such built-in module: node:readline/promises`) — change that line to a current image such as `node:24-alpine`. Its entrypoint passes no `--hostname`, so the bundled file must say `"hostname": "0.0.0.0"` to be reachable through the published port.

### CI Integration

```yaml
# .github/workflows/mock-api.yml — integration tests against a Mockoon mock server
name: Integration Tests
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - name: Start mock server
        uses: mockoon/cli-action@v3
        with:
          version: "9.9.0"
          data-file: "./mocks/storefront.json"
          port: 3001
      - run: npm test
        env:
          API_BASE_URL: http://127.0.0.1:3001/api
```

Without the action, start the CLI in the background (`npx mockoon-cli start --data ./mocks/storefront.json --port 3001 &`) and wait for the port before running tests.

## Examples

### Example 1: Mock a product catalog for frontend work

User: "The products API isn't ready. Give me a fake one on port 3001 that I can read from and write to."

Save the environment above as `mocks/storefront.json`, then:

```bash
npx mockoon-cli start --data ./mocks/storefront.json --watch
```

```text
{"app":"mockoon-server","environmentName":"Storefront API","level":"info","message":"Server started on port 3001", …}
```

```bash
curl -s "http://127.0.0.1:3001/api/products?limit=2&sort=priceCents&order=desc"
# [{"id":"68e6f816-…","name":"Fresh Ceramic Shoes","priceCents":9532},{"id":"5370b85f-…","name":"Luxurious Ceramic Fish","priceCents":6775}]

curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"name":"Canvas Tote","priceCents":2400}' http://127.0.0.1:3001/api/products
# {"name":"Canvas Tote","priceCents":2400,"id":"863298e9-9005-4676-8773-db2b7f05330d"}
```

The new product is returned by later `GET` calls until the server restarts. `--watch` reloads the file when it changes.

### Example 2: Test error handling with rules

User: "I need the order endpoint to return 401 without a token and 404 for a missing order."

The `orders/:id` route above already encodes both cases:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/orders/ord_1042
# 401
curl -s -H "Authorization: Bearer $ORDERS_API_TOKEN" http://127.0.0.1:3001/api/orders/ord_1042
# { "id": "ord_1042", "status": "shipped", "placedAt": "2026-10-01" }
curl -s -H "Authorization: Bearer $ORDERS_API_TOKEN" http://127.0.0.1:3001/api/orders/ord_missing
# { "error": "Order not found" }   (HTTP 404)
```

## Guidelines

- **Environment files are plain JSON** — no comments. An unparseable file fails with "This file is not a valid OpenAPI specification (JSON or YAML v2.0.0 and v3.0.0) or Mockoon environment".
- **Mind the braces in templates.** A helper followed directly by a JSON brace (`max=9900}}}`) is read by Handlebars as a triple-stash and fails with "Expecting 'CLOSE', got 'CLOSE_UNESCAPED'". Put a space before the closing brace.
- **Set `Content-Type` on every response**; without the header Mockoon answers `text/html`.
- **Bind to localhost.** An empty `hostname` listens on all interfaces. Use `127.0.0.1` on a workstation (or `--hostname 127.0.0.1`) and `0.0.0.0` only inside a container.
- **Admin API.** Every running mock exposes `/mockoon-admin/` (logs, state, environment variables) protected by a bearer token that is auto-generated and printed at startup. Pass `--admin-api-token "$MOCKOON_ADMIN_API_TOKEN"` to fix it, or `--disable-admin-api` when it is not needed.
- **Logs.** The CLI also writes `~/.mockoon-cli/logs/{mock-name}.log`; use `--disable-log-to-file` in CI and `--log-transaction` to log full requests and responses (credential headers are redacted).
- **Reproducible data.** `--faker-seed 42` makes Faker output a predictable sequence; `--faker-locale en_GB` changes the locale.
- **Keep the CLI as new as the app.** A file saved by a newer desktop version than the installed CLI is refused; upgrade `@mockoon/cli`. Older files are migrated in memory.
- **OpenAPI is lossy.** Rules and templating have no OpenAPI equivalent, so keep the Mockoon JSON as the source of truth once you add them. Use `--disable-external-refs` for untrusted specs so remote `$ref` URLs are not fetched.
- **When not to use it.** For mocks defined inside test code use MSW or WireMock; Mockoon fits a shared, long-running fake backend.
