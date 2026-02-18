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

Use the **api-tester** skill to have your AI agent send requests to your API, validate responses, and diagnose failures. The agent handles authentication, request construction, and assertion checking.

Install the skill:

```bash
npx terminal-skills install api-tester
```

## Step-by-Step Walkthrough

### 1. Tell the agent what to test

> Test the CRUD operations on our /api/products endpoint. The base URL is http://localhost:3000 and auth uses a Bearer token from the LOGIN_TOKEN env var.

### 2. The agent builds and sends requests

It constructs requests for each operation (Create, Read, Update, Delete), chains them so the created resource ID is used in subsequent requests, and includes proper headers and auth.

### 3. Responses are validated

Each response is checked for:
- Correct HTTP status code
- Valid JSON structure
- Expected fields present in the body
- Data values matching what was sent

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
   Time:   23ms

3. PUT /api/products/57
   Status: 200 OK -- PASS
   Time:   45ms
   Assertions:
     [PASS] body.name == "Updated Widget"

4. DELETE /api/products/57
   Status: 204 No Content -- PASS
   Time:   31ms

Result: 4/4 PASSED (188ms total)
```

### 5. Failures are diagnosed

If a request fails, the agent does not just report "FAIL." It investigates: checks the response body for error messages, verifies the token is valid, tests if the endpoint exists, and suggests fixes.

## Real-World Example

A frontend developer is integrating a new third-party payment API. The documentation is sparse, and they keep getting 400 errors. Using the api-tester skill:

1. They provide the endpoint URL and their API key
2. The agent sends a minimal request and analyzes the error response: "Missing required field: currency"
3. The agent adds the currency field and tries again: 200 OK
4. The agent tests edge cases: invalid currency code (400), negative amount (400), amount over the limit (422)
5. The developer now has a complete understanding of the API's validation rules and expected request format
