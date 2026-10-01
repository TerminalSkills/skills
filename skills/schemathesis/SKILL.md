---
name: schemathesis
description: >-
  Schemathesis automatically tests APIs by generating test cases from their
  OpenAPI or GraphQL schemas. Use when tasks involve API fuzzing, finding edge
  cases in REST or GraphQL APIs, testing schema compliance, generating
  property-based tests from API specs, finding crashes and 500 errors, or
  validating API contracts. Schemathesis generates thousands of test cases from
  the schema and finds bugs that manual testing misses.
license: Apache-2.0
compatibility: "Schemathesis 4.x, Python 3.10+ (or the official Docker image)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - api-testing
    - fuzzing
    - openapi
    - graphql
    - security
  repository: https://github.com/schemathesis/schemathesis
---

# Schemathesis

## Overview

Automatically generate and run API tests from OpenAPI and GraphQL schemas. Schemathesis finds bugs by generating thousands of test cases — boundary values, invalid types, malformed payloads, deep nesting — that developers never think to write manually. This skill covers Schemathesis 4 (current: 4.28). Version 4 renamed most of the v3 command line and Python API: `--hypothesis-max-examples`, `--stateful=links`, `--junit-xml`, `--cassette-path`, `--base-url` and `schemathesis.from_uri` no longer exist.

## Instructions

### Installation

```bash
pip install schemathesis          # installs the `schemathesis` command and its alias `st`
uvx schemathesis run http://127.0.0.1:8000/openapi.json   # or run once without installing
```

The Docker image `schemathesis/schemathesis:stable` (also on `ghcr.io`) takes the same arguments after the image name (see CI Integration).

### Quick Start

```bash
# Test a running API using the schema it serves
st run http://127.0.0.1:8000/openapi.json
# Test from a local schema file (the API address is then required)
st run ./openapi.yaml --url http://127.0.0.1:8000
# Test a GraphQL API
st run http://127.0.0.1:8000/graphql
```

The exit code is `0` when every check passed, `1` when a check failed or the schema or `schemathesis.toml` could not be loaded, `2` for a command-line error (unknown option, missing schema file).

### How It Works

Schemathesis reads your API schema (OpenAPI 2.0, 3.0, 3.1, 3.2 or GraphQL) and runs four phases in order:

1. **Examples** — sends the examples written in the schema (skipped when there are none)
2. **Coverage** — deterministic cases for every constraint: boundaries, missing required fields, wrong types, undocumented methods
3. **Fuzzing** — random valid and invalid inputs, up to `--max-examples` per operation (default 100)
4. **Stateful** — chains calls (create → read → delete), feeding response data into later requests

Every response goes through all checks (5xx errors, undocumented status codes, response schema violations, accepted invalid input, ignored authentication, and more). A failing case is shrunk to a minimal input and printed with a `curl` command that reproduces it.

### CLI Options

```bash
SCHEMA=http://127.0.0.1:8000/openapi.json
# Authentication
st run $SCHEMA --auth "$API_USER:$API_PASSWORD"               # Basic auth
st run $SCHEMA --header "Authorization: Bearer $API_TOKEN"    # Bearer token
st run $SCHEMA --header "X-API-Key: $API_KEY"                 # API key

# Target specific operations (match the path template in the schema, not a real URL)
st run $SCHEMA --include-path /items                 # exact path
st run $SCHEMA --include-path-regex '^/items/'       # regular expression
st run $SCHEMA --include-method POST
st run $SCHEMA --exclude-path '/admin/users' --exclude-deprecated

# Control test volume and scope
st run $SCHEMA --max-examples 500         # -n: test cases per operation
st run $SCHEMA --phases coverage,fuzzing  # choose phases: examples, coverage, fuzzing, stateful
st run $SCHEMA --checks not_a_server_error            # run only these checks
st run $SCHEMA --exclude-checks unsupported_method    # run all but these
st run $SCHEMA --workers 4                # parallel workers (1-64 or auto)
st run $SCHEMA --rate-limit 100/s         # or `auto` to follow Retry-After on 429
st run $SCHEMA --request-timeout 5 --max-response-time 3   # seconds (v3 took milliseconds)
st run $SCHEMA --seed 42                  # repeat a run with the same inputs
st run $SCHEMA --wait-for-schema 30       # wait for the API to come up (CI)

# Output — files land in ./schemathesis-report/ with a timestamp in the name
st run $SCHEMA --report junit,har                    # also: vcr, ndjson, json, allure
st run $SCHEMA --report-junit-path results.xml       # fixed file name
st run $SCHEMA --report-vcr-path cassette.yaml       # every request and response, as YAML
```

### Test Strategies

#### Negative testing

By default (`--mode all`) Schemathesis sends both valid inputs and inputs that violate the schema; `--mode positive` or `--mode negative` restricts it to one kind. For `{ "type": "integer", "minimum": 1, "maximum": 100 }` it tries `0`, `101`, `null`, `"string"`, `1.5`, `[]`; for an array with `maxItems: 10` it sends 11 items. The `negative_data_rejection` check fails when the API answers such a request with a success status.

#### Stateful testing

The stateful phase runs by default; no flag turns it on. Schemathesis infers links between operations from the schema (a `POST /items` response with an `id` feeds `GET /items/{item_id}`), learns from `Location` headers, and uses explicit OpenAPI `links` when present.

```bash
st run $SCHEMA --phases stateful          # only the chained scenarios
st fuzz $SCHEMA --max-time 600            # continuous multi-step fuzzing, at most 10 minutes
```

This catches bugs that only appear with real resource IDs. If no operation produces data for another one, the summary shows `Stateful (not applicable)`.

#### Custom checks

```python
# api_checks.py — extra checks that run on every response
import schemathesis

LEAK_MARKERS = ("traceback (most recent call last)", "select * from", "/usr/local/lib/python")

@schemathesis.check
def no_internals_in_errors(ctx, response, case):
    """Error responses must not expose stack traces, SQL or server paths."""
    if response.status_code >= 400:
        body = response.text.lower()
        for marker in LEAK_MARKERS:
            assert marker not in body, f"Error response leaks internals: {marker!r}"
```

Load the module through an environment variable (v3's `--pre-run` is gone): `SCHEMATHESIS_HOOKS=api_checks st run $SCHEMA`. A failing custom check is reported as ``Custom check failed: `no_internals_in_errors` ``.

### Configuration File

Settings that repeat belong in `schemathesis.toml` in the project root; it is picked up automatically (or pass `st --config-file ci/schemathesis.toml run ...`). `${NAME}` is replaced from the environment.

```toml
headers = { Authorization = "Bearer ${INVENTORY_API_TOKEN}" }
request-timeout = 5.0               # seconds
continue-on-failure = true
generation.max-examples = 200

[checks]
max_response_time = 3.0             # seconds; this check is off unless set

[[operations]]                      # per-operation override
include-path = "/items/{item_id}/value"
generation.max-examples = 500
```

### Python API

```python
# test_inventory_api.py — run with: pytest test_inventory_api.py
import os
import schemathesis
from hypothesis import settings

schema = schemathesis.openapi.from_url("http://127.0.0.1:8000/openapi.json")
# From a file: schema = schemathesis.openapi.from_path("./openapi.yaml")
#              schema.config.update(base_url="http://127.0.0.1:8000")
AUTH = {"Authorization": f"Bearer {os.environ['INVENTORY_API_TOKEN']}"}

@schema.parametrize()
@settings(max_examples=50)
def test_api(case):
    # Sends the request and runs every built-in check on the response
    case.call_and_validate(headers=AUTH)

@schema.include(path="/items", method="POST").parametrize()
def test_create_item(case):
    response = case.call(headers=AUTH)
    case.validate_response(response)
    assert response.status_code < 500, f"Server error for body: {case.body!r}"

# Stateful: chains POST /items → GET/DELETE /items/{item_id}
schema.config.update(headers=AUTH)        # the state machine sends the headers set in the config
TestInventoryWorkflow = schema.as_state_machine().TestCase
```

For GraphQL use `schemathesis.graphql.from_url(...)`. The CLI does more than the pytest integration (API probes, link inference from `Location` headers, report files), so prefer it unless the tests must live in an existing pytest suite.

### CI Integration

In any CI system the job is the same: start the API, run Schemathesis with `--wait-for-schema`, keep `schemathesis-report/`. A failed check makes the command exit with `1`, which fails the job. Without Python on the runner, use the image:

```bash
mkdir -p schemathesis-report && chmod o+w schemathesis-report   # the container user (UID 1000) must be able to write here
docker run --rm --network host -v "$PWD/schemathesis-report:/app/schemathesis-report" \
  schemathesis/schemathesis:stable run http://127.0.0.1:8080/openapi.json \
  --wait-for-schema 60 --report junit --header "Authorization: Bearer $INVENTORY_API_TOKEN"
```

On GitHub Actions use the official `schemathesis/action@v3` (second example below). For an API with known failures, add `--baseline schemathesis-baseline.json`: the first run writes the file, and once it is committed, later runs turn red only on failures that are not in it (`--baseline-update` adds new ones on purpose).

### Security-Focused Testing

Schemathesis does not send attack payloads on its own, but it already checks several security properties: `ignored_auth` (an operation that declares authentication answers without credentials), `use_after_free` (a deleted resource is still served), `missing_required_header` and `negative_data_rejection`. To probe for injection, feed it a wordlist:

```toml
# schemathesis.toml
[dictionaries.injection]
from-file = "fuzz/injection.dict"   # one quoted string per line: "' OR 1=1--"

[generation.dictionaries]           # 20% of query, path, header and cookie strings
string = { dictionary = "injection", probability = 0.2 }

[parameters]                        # a request body field is bound by name
"body.sku" = { dictionary = "injection", probability = 0.5 }
```

```bash
SCHEMATHESIS_HOOKS=api_checks st run $SCHEMA --max-examples 1000 \
  --header "Authorization: Bearer $API_TOKEN" --report-vcr-path audit-cassette.yaml
```

Read the findings this way: a 500 on special characters is a candidate injection point; slow responses on certain inputs (`--max-response-time`) may be time-based injection; an accepted invalid request means missing server-side validation.

## Examples

### Fuzz a REST API to find crashes

User request: "Our inventory API runs locally on port 8000 and serves its OpenAPI spec at /openapi.json. Fuzz it and tell me what makes it crash."

```bash
st run http://127.0.0.1:8000/openapi.json \
  --header "Authorization: Bearer $INVENTORY_API_TOKEN" \
  --checks not_a_server_error --max-examples 200 --report junit
```

Each failure comes with the request that triggers it; the stateful one shows the whole chain:

```
________________________________ Stateful tests ________________________________
1. Test Case ID: VjUcDs

- Server error

[500] Internal Server Error:
    `Internal Server Error`

Reproduce with:
    curl -X POST -H 'Authorization: [Filtered]' -H 'Content-Type: application/json' -d '{"sku": "00", "quantity": 28504, "unit_price": 5.960464477539063e-08}' http://127.0.0.1:8000/items
    curl -X GET -H 'Authorization: [Filtered]' 'http://127.0.0.1:8000/items/12/value?discount_percent=-55281449238535744'
    st replay VjUcDs

Failures:
  ❌ Server error: 2
Test cases:
  2200 generated, 2 found 2 unique failures, 111 skipped
```

The JUnit file is written to `schemathesis-report/`. After fixing the handler, `st replay` re-sends the recorded failing cases (stored in `.schemathesis/`) and prints `+ FIXED` or `x FAILED` for each. Replay has no `--header` option and the stored request holds `Authorization: [Filtered]`: move the header into `schemathesis.toml` first, otherwise the API answers 401 and the case is reported as `+ FIXED`.

### Add API fuzzing to CI pipeline

User request: "Run Schemathesis on every pull request. The API starts with docker compose, the schema is at localhost:8080/openapi.json, the token is in GitHub Secrets. Fail the build on any 500 or schema violation and keep the JUnit report."

```yaml
# .github/workflows/api-test.yml
on: [push, pull_request]
jobs:
  schemathesis:
    runs-on: ubuntu-latest
    permissions:
      contents: read         # for actions/checkout; unlisted permissions are set to none
      pull-requests: write   # the action comments a schema-coverage summary on pull requests
      actions: read
    steps:
      - uses: actions/checkout@v7
      - name: Start the API
        run: docker compose up -d
      - uses: schemathesis/action@v3
        with:
          schema: http://localhost:8080/openapi.json
          authorization: Bearer ${{ secrets.INVENTORY_API_TOKEN }}
          wait-for-schema: "60"
          max-examples: 200
          args: --report junit
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: api-test-results
          path: schemathesis-report/
```

A pull request that introduces a failure gets a red `schemathesis` job whose log ends with the same summary as a local run (`Failures: ❌ Undocumented HTTP status code: 1`); the `api-test-results` artifact holds the `junit-*.xml` file for a test reporter.

## Guidelines

- Always test against staging or development environments first — never fuzz a production API without explicit authorization. Fuzzing creates, changes and deletes real data through the API.
- Start with a low `--max-examples` value (50-100) to validate setup before running full intensity
- Use `--workers` carefully — too many parallel workers can overwhelm the target and cause false failures; `--rate-limit` caps the request rate
- Ensure your OpenAPI/GraphQL schema is up to date — stale schemas produce misleading results. Many first-run failures are schema gaps (an undocumented 404), not server bugs: fix the schema or exclude that check.
- Schemathesis finds crashes and violations but does not confirm exploitability — triage 500 errors manually
- Use `--report-vcr-path` to record all requests for reproducibility and audit trails. Output and reports replace values of sensitive headers and fields (such as `Authorization`) with `[Filtered]`, but response bodies are written as received — treat report files as sensitive.
- Options from Schemathesis 3 are rejected as unknown, with one trap: `--request-timeout` and `--max-response-time` are still accepted but now mean seconds, so `5000` is 83 minutes. The full mapping is in `MIGRATION.md` in the repository. Add `.schemathesis/` (recorded failures), `.hypothesis/` (example database) and `schemathesis-report/` to `.gitignore`.
