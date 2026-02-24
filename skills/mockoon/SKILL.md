---
name: mockoon
description: When the user wants to create mock API servers locally using Mockoon with its GUI or CLI. Also use when the user mentions "mockoon," "API mocking," "mock server," "mock API," "OpenAPI mock," or "local API simulation." For programmatic HTTP mocking, see wiremock.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - api-mocking
    - mock-server
    - openapi
    - development
---

# Mockoon

## Overview

You are an expert in Mockoon, the open-source tool for running mock API servers locally. You help users create mock environments using the GUI or CLI, define routes with dynamic responses, import OpenAPI specifications, use templating for realistic data, and run mocks in CI for integration testing. You understand Mockoon's data bucket system, response rules, and proxy mode.

## Instructions

### Initial Assessment

1. **Purpose** — Frontend development, integration testing, or demo?
2. **API spec** — Do you have an OpenAPI/Swagger spec to import?
3. **Complexity** — Static responses or dynamic (templating, rules)?
4. **Environment** — Local development, CI, or Docker?

### CLI Setup

```bash
# setup-mockoon.sh — Install Mockoon CLI for headless mock servers.
npm install -g @mockoon/cli

# Or use npx
npx @mockoon/cli start --data ./mock-environment.json --port 3001
```

### Environment Configuration

```json
// mock-environment.json — Mockoon environment with multiple routes.
// Defines a complete mock API for user and product endpoints.
{
  "uuid": "mock-api-1",
  "lastMigration": 32,
  "name": "Mock API",
  "port": 3001,
  "hostname": "0.0.0.0",
  "routes": [
    {
      "uuid": "route-users-list",
      "method": "get",
      "endpoint": "api/users",
      "responses": [
        {
          "uuid": "resp-users-200",
          "statusCode": 200,
          "label": "Success",
          "headers": [{ "key": "Content-Type", "value": "application/json" }],
          "body": "{\n  \"users\": [\n    { \"id\": 1, \"name\": \"{{faker 'person.fullName'}}\", \"email\": \"{{faker 'internet.email'}}\" },\n    { \"id\": 2, \"name\": \"{{faker 'person.fullName'}}\", \"email\": \"{{faker 'internet.email'}}\" }\n  ]\n}",
          "default": true
        }
      ]
    },
    {
      "uuid": "route-user-by-id",
      "method": "get",
      "endpoint": "api/users/:id",
      "responses": [
        {
          "uuid": "resp-user-200",
          "statusCode": 200,
          "headers": [{ "key": "Content-Type", "value": "application/json" }],
          "body": "{ \"id\": {{urlParam 'id'}}, \"name\": \"{{faker 'person.fullName'}}\", \"email\": \"{{faker 'internet.email'}}\" }",
          "default": true
        },
        {
          "uuid": "resp-user-404",
          "statusCode": 404,
          "headers": [{ "key": "Content-Type", "value": "application/json" }],
          "body": "{ \"error\": \"User not found\" }",
          "label": "Not found",
          "rules": [{ "target": "params", "modifier": "id", "operator": "equals", "value": "999" }]
        }
      ]
    },
    {
      "uuid": "route-create-user",
      "method": "post",
      "endpoint": "api/users",
      "responses": [
        {
          "uuid": "resp-create-201",
          "statusCode": 201,
          "headers": [{ "key": "Content-Type", "value": "application/json" }],
          "body": "{ \"id\": {{faker 'number.int' min=100 max=999}}, \"name\": \"{{body 'name'}}\", \"email\": \"{{body 'email'}}\" }",
          "default": true
        }
      ]
    }
  ]
}
```

### Templating Helpers

```json
// mock-templating-examples.json — Mockoon response body showing templating helpers.
// Generates realistic dynamic data using Faker and Handlebars.
{
  "id": "{{faker 'string.uuid'}}",
  "name": "{{faker 'person.fullName'}}",
  "email": "{{faker 'internet.email'}}",
  "avatar": "{{faker 'image.avatar'}}",
  "createdAt": "{{now 'yyyy-MM-dd'}}",
  "requestInfo": {
    "method": "{{method}}",
    "path": "{{urlParam 'id'}}",
    "query": "{{queryParam 'search'}}",
    "header": "{{header 'Authorization'}}"
  }
}
```

### Response Rules

```json
// mock-with-rules.json — Route with conditional responses based on request data.
// Returns different responses based on query parameters or headers.
{
  "uuid": "route-conditional",
  "method": "get",
  "endpoint": "api/products",
  "responses": [
    {
      "uuid": "resp-empty",
      "statusCode": 200,
      "body": "{ \"products\": [], \"total\": 0 }",
      "label": "Empty results",
      "rules": [{ "target": "query", "modifier": "category", "operator": "equals", "value": "empty" }]
    },
    {
      "uuid": "resp-error",
      "statusCode": 401,
      "body": "{ \"error\": \"Unauthorized\" }",
      "label": "No auth",
      "rules": [{ "target": "header", "modifier": "Authorization", "operator": "equals", "value": "" }]
    },
    {
      "uuid": "resp-default",
      "statusCode": 200,
      "body": "{ \"products\": [{ \"id\": 1, \"name\": \"Widget\" }], \"total\": 1 }",
      "default": true
    }
  ]
}
```

### Docker

```bash
# run-mockoon-docker.sh — Run Mockoon mock server in Docker.
# Useful for CI pipelines and shared development environments.
docker run -d --name mockoon \
  -p 3001:3001 \
  -v $(pwd)/mock-environment.json:/data/mock.json \
  mockoon/cli:latest \
  --data /data/mock.json --port 3001
```

### CI Integration

```yaml
# .github/workflows/mock-api.yml — Run integration tests against Mockoon mock server.
# Starts mock server before running tests.
name: Integration Tests
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - name: Start mock server
        run: |
          npx @mockoon/cli start --data ./mocks/environment.json --port 3001 &
          sleep 3
      - run: npm test
        env:
          API_BASE_URL: http://localhost:3001
```
