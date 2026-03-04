---
name: schemathesis
description: >-
  Automatically test APIs by generating test cases from OpenAPI/GraphQL schemas.
  Use when tasks involve API fuzzing, finding edge cases in REST or GraphQL APIs,
  testing schema compliance, generating property-based tests from API specs,
  finding crashes and 500 errors, or validating API contracts. Schemathesis
  generates thousands of test cases from your schema and finds bugs that manual
  testing misses.
license: Apache-2.0
compatibility: "Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - api-testing
    - fuzzing
    - openapi
    - graphql
    - security
---

# Schemathesis

## Overview

Automatically generate and run API tests from OpenAPI and GraphQL schemas. Schemathesis finds bugs by generating thousands of test cases — boundary values, invalid types, malformed payloads, deep nesting — that developers never think to write manually.

## Instructions

### Installation

```bash
pip install schemathesis

# Or with all extras
pip install schemathesis[all]
```

### Quick Start

```bash
# Test a live API using its OpenAPI schema
st run https://api.example.com/openapi.json

# Test from a local schema file
st run ./openapi.yaml --base-url http://localhost:8080

# Test a GraphQL API
st run https://api.example.com/graphql
```

### How It Works

Schemathesis reads your API schema (OpenAPI 2.0/3.0/3.1 or GraphQL) and:

1. **Generates test cases** — valid and invalid inputs based on parameter types, constraints, and formats
2. **Sends requests** — fires thousands of combinations at your API
3. **Checks for failures** — 500 errors, schema violations, response timeouts, crashes
4. **Shrinks failures** — reduces failing test cases to the minimal reproducible example
5. **Reports results** — shows exactly which input caused which failure

```
Schema → Generator → Request → Response → Checker → Report
         ├── Valid values        ├── Status code OK?
         ├── Boundary values     ├── Response matches schema?
         ├── Invalid types       ├── No 500 errors?
         ├── Null/empty          ├── Response time OK?
         ├── Overflow values     └── No crashes?
         └── Unicode/special chars
```

### CLI Options

```bash
# Basic testing
st run https://api.example.com/openapi.json

# Authentication
st run URL --auth user:password                    # Basic auth
st run URL --header "Authorization: Bearer TOKEN"  # Bearer token
st run URL --header "X-API-Key: KEY"               # API key

# Target specific endpoints
st run URL --include-path "/api/users"             # Only test /api/users
st run URL --include-method POST                   # Only test POST endpoints
st run URL --exclude-path "/api/admin"             # Skip admin endpoints

# Control test volume
st run URL --hypothesis-max-examples=500    # Max test cases per endpoint
st run URL --hypothesis-deadline=5000       # Max ms per test case
st run URL --workers 4                      # Parallel workers

# Output
st run URL --report                     # Generate HTML report
st run URL --cassette-path=cassette.yaml  # Save all requests/responses
st run URL --junit-xml=results.xml      # JUnit format for CI
```

### Test Strategies

### Negative testing

Schemathesis automatically generates inputs that violate schema constraints:

```
If schema says: { "type": "integer", "minimum": 1, "maximum": 100 }
Schemathesis tries: 0, -1, -2147483648, 101, 999999999, null, "string", 1.5, []

If schema says: { "type": "string", "format": "email" }
Schemathesis tries: "", "not-an-email", "a@b", null, 12345, very-long-string...

If schema says: { "type": "array", "maxItems": 10 }
Schemathesis tries: [], [1000 items], null, "not-array", nested arrays...
```

### Stateful testing (link-based)

Schemathesis can chain API calls using OpenAPI links:

```bash
# Enable stateful testing — creates resources, then tests operations on them
st run URL --stateful=links

# Example flow:
# 1. POST /users → creates user, gets ID
# 2. GET /users/{id} → uses the created ID
# 3. PUT /users/{id} → updates with fuzzed data
# 4. DELETE /users/{id} → cleanup
```

This catches bugs that only appear with real resource IDs, not random values.

### Custom checks

```python
# custom_checks.py
# Add custom validation logic to Schemathesis test runs

import schemathesis

@schemathesis.check
def no_sensitive_data_in_errors(response, case):
    """Ensure error responses don't leak sensitive information.
    
    Checks that 4xx/5xx responses don't contain stack traces,
    database queries, or internal paths.
    """
    if response.status_code >= 400:
        body = response.text.lower()
        sensitive_patterns = [
            "traceback",
            "stack trace",
            "sql",
            "select * from",
            "/usr/local/",
            "/home/",
            "password",
            "secret",
            "internal server",
        ]
        for pattern in sensitive_patterns:
            assert pattern not in body, (
                f"Sensitive data '{pattern}' found in error response"
            )

@schemathesis.check
def response_time_acceptable(response, case):
    """Ensure no endpoint takes longer than 5 seconds.
    
    Slow responses might indicate injection vulnerabilities
    (time-based SQL injection) or denial-of-service potential.
    """
    assert response.elapsed.total_seconds() < 5.0, (
        f"Response took {response.elapsed.total_seconds():.1f}s "
        f"(limit: 5s) — possible DoS vector"
    )
```

```bash
# Run with custom checks
st run URL --checks all --hypothesis-max-examples=200
```

### Python API

```python
# test_api.py
# Use Schemathesis in pytest for CI integration

import schemathesis

# Load schema
schema = schemathesis.from_url("https://api.example.com/openapi.json")

# Or from file
schema = schemathesis.from_path("./openapi.yaml", base_url="http://localhost:8080")

# Generate test cases for all endpoints
@schema.parametrize()
def test_api(case):
    """Property-based test generated from OpenAPI schema.
    
    Schemathesis generates hundreds of test cases per endpoint,
    testing boundary values, invalid types, and edge cases.
    """
    response = case.call()
    case.validate_response(response)  # Check response matches schema

# Target specific endpoint
@schema.parametrize(endpoint="/api/users", method="POST")
def test_create_user(case):
    """Test user creation with generated inputs."""
    response = case.call()
    case.validate_response(response)
    assert response.status_code != 500, f"Server error with input: {case.body}"
```

### CI Integration

```yaml
# .github/workflows/api-test.yml
name: API Schema Testing
on: [push, pull_request]

jobs:
  schemathesis:
    runs-on: ubuntu-latest
    services:
      api:
        image: your-api:latest
        ports:
          - 8080:8080
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Schemathesis
        uses: schemathesis/action@v1
        with:
          schema: http://localhost:8080/openapi.json
          args: >-
            --checks all
            --stateful=links
            --hypothesis-max-examples=200
            --junit-xml=results.xml
      
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: api-test-results
          path: results.xml
```

### Security-Focused Testing

For penetration testing, configure Schemathesis to look for security issues:

```bash
# Test for injection vulnerabilities
# Schemathesis will try SQL injection, XSS, and command injection payloads
# in string parameters
st run URL \
  --checks all \
  --hypothesis-max-examples=1000 \
  --header "Authorization: Bearer TOKEN" \
  --stateful=links \
  --report

# Common findings:
# - 500 errors on special characters → potential injection
# - Slow responses on certain inputs → time-based injection
# - Different error messages → information disclosure
# - Bypassed validation → missing server-side checks
# - Schema violations in responses → data leakage
```

## Examples

### Fuzz a REST API to find crashes

```prompt
Our REST API has an OpenAPI 3.0 spec at /api/docs/openapi.json. Run Schemathesis against all endpoints with 500 test cases per endpoint. Focus on finding 500 errors, schema violations, and slow responses (>3 seconds). Use stateful testing to chain CRUD operations. Generate an HTML report showing all findings with reproducible curl commands.
```

### Add API fuzzing to CI pipeline

```prompt
Set up Schemathesis in our GitHub Actions CI to run on every PR. The API starts in Docker (docker-compose up), schema is at localhost:8080/openapi.json. Run with 200 test cases per endpoint, fail the build on any 500 error or schema violation. Output JUnit XML for GitHub's test reporter. Include authentication via Bearer token from GitHub Secrets.
```

### Security-focused API testing

```prompt
We're doing a security assessment of our payment API. Use Schemathesis to test all endpoints with maximum fuzzing intensity. Check for: SQL injection indicators (500 errors with special chars), information disclosure in error responses, slow queries suggesting time-based injection, and missing input validation. Produce a security findings report with severity ratings.
```

## Guidelines

- Always test against staging or development environments first — never fuzz a production API without explicit authorization
- Start with a low `--hypothesis-max-examples` value (50-100) to validate setup before running full intensity
- Use `--workers` carefully — too many parallel workers can overwhelm the target and cause false failures
- Ensure your OpenAPI/GraphQL schema is up to date — stale schemas produce misleading results
- Schemathesis finds crashes and violations but does not confirm exploitability — triage 500 errors manually
- Use `--cassette-path` to record all requests for reproducibility and audit trails
