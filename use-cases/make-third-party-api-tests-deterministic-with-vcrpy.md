---
title: Make Third-Party API Tests Deterministic with VCR.py
slug: make-third-party-api-tests-deterministic-with-vcrpy
description: Record an external API's real responses once, replay them offline in pytest and CI, and keep API keys out of committed fixtures, for Python teams whose tests flake on vendor outages.
skills:
  - vcrpy
  - pytest
  - github-actions
category: development
tags:
  - python
  - testing
  - http-recording
  - flaky-tests
  - ci
---

# Make Third-Party API Tests Deterministic with VCR.py

## The Problem

Marta maintains the billing service of a 12-person logistics startup. Forty-one of its 230 tests call a currency-rates API and a shipping-label API for real. The suite takes 6 minutes, fails about one CI run in five when a vendor rate-limits or has a slow minute, and cannot run on a plane. Developers have started re-running red builds until they go green, and last month a real bug was dismissed as "the rates API again".

Hand-written mocks are not the answer: the team tried them, the fake payloads drifted from what the vendors really return, and two production bugs came from fields the mocks never had. What the tests need is the real responses, captured once, replayed every time, and refreshed on purpose.

## The Solution

Use **vcrpy** to record each test's HTTP traffic into a cassette file and replay it offline. Use **pytest** with the `pytest-recording` plugin so a test only needs `@pytest.mark.vcr`, and so CI runs in replay-only mode. Use **github-actions** to run the suite with the network blocked and to schedule a weekly re-record job that opens a pull request when a vendor's responses change.

## Step-by-Step Walkthrough

### Step 1: Install and configure recording

Prompt: "Install VCR for our pytest suite. Cassettes must never contain our API keys, and replay must not depend on the order or port of requests."

```bash
. .venv/bin/activate
pip install vcrpy pytest-recording
```

```python
# tests/conftest.py
import pytest

@pytest.fixture(scope="module")
def vcr_config():
    return {
        "filter_headers": [("authorization", "DUMMY"), "x-api-key"],
        "filter_query_parameters": ["api_key"],
        "filter_post_data_parameters": ["client_secret"],
        "match_on": ["method", "path", "query"],
    }
```

### Step 2: Mark the tests that call vendors

Prompt: "Mark the 41 tests that hit the rates and shipping APIs."

```python
import pytest
from billing.invoices import convert_total

@pytest.mark.vcr
def test_total_converted_to_usd():
    assert convert_total(amount_eur=250, to="USD") == 270.0
```

The agent finds the tests by searching for the vendor client modules (`grep -rl "ratesdb\|shipping_client" tests/`) and adds the marker to each.

### Step 3: Record once with sandbox credentials

Prompt: "Record the cassettes using our sandbox keys, then prove no secret got into them."

```bash
export RATES_API_KEY="$(cat ~/.secrets/rates-sandbox-key)"
export SHIPPING_TOKEN="$(cat ~/.secrets/shipping-test-token)"
pytest --record-mode=once tests/
grep -rniE "$RATES_API_KEY|$SHIPPING_TOKEN|bearer " tests/cassettes || echo "cassettes are clean"
```

The first command creates `tests/cassettes/<module>/<test>.yaml` for each marked test. The grep must print the "clean" line before anything is committed. If a response body carries a token, add a `before_record_response` function to the config that scrubs it, delete the cassette and record again.

### Step 4: Run replay-only with the network blocked

Prompt: "Prove the suite works with no network."

```bash
pytest --block-network tests/
```

The default mode of `pytest-recording` is `none`: a request that is not in a cassette fails with `CannotOverwriteExistingCassetteException` instead of reaching the internet. The 41 tests now finish in about 2 seconds in total.

### Step 5: Wire CI and a scheduled refresh

Prompt: "Make CI replay-only, and add a weekly job that re-records and opens a PR if a vendor changed something."

```yaml
# .github/workflows/tests.yml
name: tests
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements-dev.txt
      - run: pytest --block-network tests/
```

```yaml
# .github/workflows/refresh-cassettes.yml
name: refresh-cassettes
on:
  schedule: [{ cron: "0 5 * * 1" }]
  workflow_dispatch:
jobs:
  rerecord:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements-dev.txt
      - run: pytest --record-mode=rewrite tests/
        env:
          RATES_API_KEY: ${{ secrets.RATES_SANDBOX_KEY }}
          SHIPPING_TOKEN: ${{ secrets.SHIPPING_TEST_TOKEN }}
      - run: git diff --stat tests/cassettes
```

The refresh job uses sandbox secrets only. A non-empty diff in `tests/cassettes` is the signal that a vendor changed a response; a maintainer reviews it like any code change.

## Real-World Example

Marta runs the five steps on a Thursday afternoon. Recording takes 3 minutes because the tests really call the sandboxes; the secret grep finds one leak, a `Set-Cookie` header from the shipping API, which the agent removes by adding `before_record_response` and recording that cassette again. After that the full suite runs in 31 seconds locally and 48 seconds in CI, down from 6 minutes, and the red-build-rerun habit stops.

Three weeks later the weekly job opens a diff: the shipping vendor now returns `label_url_expires_at`. The parser test did not break, but the team adds the field to their model on purpose instead of finding out in production.

## Related Skills

- [vcrpy](/skills/vcrpy) — records and replays the HTTP calls, filters secrets and controls request matching
- [pytest](/skills/pytest) — the test runner, fixtures and markers that the recording plugin hooks into
- [github-actions](/skills/github-actions) — runs the replay-only suite on pull requests and the scheduled re-record job
