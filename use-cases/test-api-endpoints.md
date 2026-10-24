---
title: "Test API Endpoints with AI"
slug: test-api-endpoints
description: "Send requests to REST APIs, validate responses, and diagnose failures automatically."
skills: [api-tester]
category: development
tags: [api, testing, rest, debugging]
---

# Test API Endpoints with AI

## The Problem

You have built or are integrating with a REST API. You need to verify that endpoints return correct status codes, response shapes, and data. Writing curl commands with the right headers, body format, and auth tokens is fiddly. Debugging a 401 or 500 response means manually checking tokens, request format, and server logs.

## The Solution

Use the **api-tester** skill to have your AI agent send requests to your API, validate responses, and diagnose failures. The agent builds the curl (or Python `requests`) calls, handles authentication, chains dependent requests and checks assertions. It works from the shell on your machine, so it can only test what your machine can reach: point it at a local or staging server.

Install the skill:

```bash
npx terminal-skills install api-tester
```

## Step-by-Step Walkthrough

### 1. Define what to test

Export the token yourself so it never appears in the conversation, then describe the job:

```bash
export LOGIN_TOKEN="<token from your login flow>"
```

> Test the CRUD operations on our /api/products endpoint. The base URL is http://127.0.0.1:3000 and auth uses a Bearer token from the LOGIN_TOKEN env var.

### 2. Build and send requests

The agent constructs a request for each operation (Create, Read, Update, Delete), takes the `id` from the create response and uses it in the following requests. Each one looks like this:

```bash
curl -s --max-time 30 \
  -H "Authorization: Bearer $LOGIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "Test Widget", "price": 29.99}' \
  -w '\nHTTP %{http_code} in %{time_total}s\n' \
  http://127.0.0.1:3000/api/products
```

`--max-time` stops a hung server from hanging the test. Adding `--fail-with-body` (curl 7.76+) makes curl exit non-zero on a 4xx or 5xx while still printing the error body, which helps in scripts.

### 3. Responses are validated

Each response is checked for:
- Correct HTTP status code
- Valid JSON structure and the Content-Type header
- Expected fields present in the body
- Data values matching what was sent
- Response time (anything over 2 seconds is flagged as slow)

### 4. Results are reported clearly

```text
API Test Suite: Products CRUD
==============================

1. POST /api/products
   Status: 201 Created -- PASS
   Time:   89ms
   Assertions:
     [PASS] body.id is present
     [PASS] body.name == "Test Widget"
     [PASS] body.price == 29.99

2. GET /api/products/57
   Status: 200 OK -- PASS

3. PUT /api/products/57
   Status: 200 OK -- PASS
   Assertions:
     [PASS] body.name == "Updated Widget"

4. DELETE /api/products/57
   Status: 204 No Content -- PASS

5. GET /api/products/57 (verify deletion)
   Status: 404 Not Found -- PASS

Result: 5/5 PASSED
```

The times and the `57` depend on your server; the shape of the report is what to expect.

### 5. Failures are diagnosed

If a request fails, the agent does not just report "FAIL." It reads the error body, repeats the request without the Authorization header to tell a missing token from a rejected one, checks whether the token's `exp` claim has passed, and suggests a fix. For example, a 401 with `{"error": "Invalid token"}` on one call but 200 with a fresh token points at an expired login, not at the endpoint.

## Real-World Example

A frontend developer is integrating a new third-party payment API in its sandbox environment. The documentation is sparse, and they keep getting 400 errors. Using the api-tester skill:

1. They export the sandbox API key as an environment variable and give the agent the endpoint URL
2. The agent sends a minimal request and reads the error response, for instance "Missing required field: currency"
3. The agent adds the field and retries until the request succeeds
4. The agent tests edge cases: invalid currency code, negative amount, amount over the limit, and records which status code each one returns
5. The developer ends up with a written list of the API's validation rules and a working request body, taken from observed responses rather than guesses

Keep this to sandbox or test keys: the skill's own rule is to ask before sending requests to a production API.

## Related Skills

- [api-tester](../skills/api-tester/SKILL.md) -- Send requests, assert on responses and diagnose failures
