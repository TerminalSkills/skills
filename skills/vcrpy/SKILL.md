---
name: vcrpy
description: >-
  VCR.py records the HTTP calls a Python test makes into a cassette file and replays them on later runs, so tests that depend on third-party APIs become fast, offline and deterministic. Use when the user asks to stop tests hitting a real API, record or replay HTTP in pytest, fix flaky network tests, keep API keys out of recorded fixtures, re-record stale cassettes, or says "vcr", "vcrpy", "cassette", "pytest-recording".
license: Apache-2.0
compatibility: "Python 3.9+, pip; works with requests, urllib3, httpx, aiohttp, boto3 and tornado; pytest-recording for the pytest integration"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "python, testing, http, pytest, mocking"
  repository: https://github.com/kevin1024/vcrpy
---

# VCR.py — record and replay HTTP in Python tests

## Overview

VCR.py wraps the HTTP client libraries a Python program uses. The first time a test runs inside a cassette, VCR lets the real request through and writes the request and response to a YAML file (the cassette). On later runs it answers matching requests from that file and makes no network call. Tests keep passing offline or when the vendor is down, run in milliseconds, and the cassette in git documents exactly what the API returned.

The pytest plugin `pytest-recording` adds a `@pytest.mark.vcr` marker, command-line record modes and network blocking, and is the integration the VCR.py docs recommend. The older `pytest-vcr` is no longer maintained.

## Instructions

### Install

```bash
python -m venv .venv && . .venv/bin/activate
pip install vcrpy pytest pytest-recording requests
```

### Use a cassette directly

```python
import requests
import vcr

with vcr.use_cassette("tests/cassettes/rates.yaml"):
    resp = requests.get("https://api.ratesdb.io/latest", params={"base": "EUR"})

@vcr.use_cassette("tests/cassettes/rates.yaml")   # decorator form
def test_rates():
    ...
```

With the decorator you may omit the path; the cassette is then named after the test function and stored next to the test file. Inside the context manager `as cass` gives access to `cass.requests`, `cass.responses`, `len(cass)` and `cass.play_count`, useful for asserting that the code made exactly the calls you expect.

### Record modes

| Mode | Behaviour |
|---|---|
| `once` (VCR.py default) | Replay a cassette that exists; record if the file does not exist; raise on any request not in an existing cassette |
| `new_episodes` | Replay what matches, record anything new and append it |
| `none` | Replay only; any unmatched request raises `CannotOverwriteExistingCassetteException` |
| `all` | Ignore the stored responses, hit the network and record again (use to refresh) |

Set it per cassette (`vcr.use_cassette(path, record_mode="none")`) or for a configured `vcr.VCR(...)` object. Use `none` in CI so a test can never reach the network by accident.

### pytest with pytest-recording

```python
import pytest

@pytest.mark.vcr
def test_fetch_rate():
    ...
```

The cassette is written to `cassettes/test_invoices/test_total_converted_to_usd.yaml` for that test in `test_invoices.py` next to the test file. Run with the mode on the command line:

```bash
pytest --record-mode=once tests/        # first run: record missing cassettes
pytest tests/                           # default mode is "none": replay only, fail on a new request
pytest --record-mode=rewrite tests/     # rebuild cassettes from scratch (re-record stale ones)
pytest --block-network tests/           # also block sockets for tests without a cassette
pytest --disable-recording tests/       # turn the plugin off, talk to the real service
```

`--record-mode` accepts `once`, `new_episodes`, `none`, `all` and `rewrite`. `rewrite` replaces the default cassette instead of extending it (as `all` does). Allow specific hosts under `--block-network` with `--allowed-hosts=localhost,api.ratesdb.io` (regexes, comma-separated) or `@pytest.mark.block_network(allowed_hosts=[...])`. Use `@pytest.mark.default_cassette("rates.yaml")` to share one cassette name, and `@pytest.mark.vcr("a.yaml", "b.yaml")` to load several.

Shared configuration goes in a `vcr_config` fixture; any `vcr.VCR` keyword works:

```python
# tests/conftest.py
import pytest

@pytest.fixture(scope="module")
def vcr_config():
    return {
        "filter_headers": [("authorization", "DUMMY")],
        "filter_query_parameters": ["api_key"],
        "filter_post_data_parameters": ["client_secret"],
        "ignore_hosts": ["localhost"],
    }
```

Marker arguments override the fixture for one test: `@pytest.mark.vcr(filter_query_parameters=["token"])`.

### Keep secrets out of cassettes

Cassettes are committed, so scrub them at record time. Filters are applied before the file is written and also before matching.

- `filter_headers=["authorization", "x-api-key"]` removes the header; `[("authorization", "DUMMY")]` replaces its value; a callable `(key, value, request)` computes one.
- `filter_query_parameters=["api_key"]` and `filter_post_data_parameters=["client_secret"]` do the same for the query string and form bodies.
- `before_record_request=fn` and `before_record_response=fn` take a request or response, may mutate it, and return `None` to drop the interaction entirely (for example a login call).
- Response bodies are not filtered by the option lists above. If a response contains tokens or personal data, scrub it in `before_record_response`.

After recording, always check the files: `grep -rniE "bearer|api[_-]?key|token" tests/cassettes`.

### Control request matching

By default a request replays when method, scheme, host, port, path and query match. Change it with `match_on`, from `method`, `uri`, `scheme`, `host`, `port`, `path`, `query`, `body`, `raw_body`, `headers`:

```python
vcr.use_cassette("tests/cassettes/rates.yaml", match_on=["method", "path", "query"])
```

Drop `host` and `port` when the test starts a local server on a random port; otherwise the second run does not match and VCR raises. Add `body` for POST endpoints that differ only in their JSON payload. The same request recorded twice is replayed once per recording; pass `allow_playback_repeats=True` if the code calls an identical request more times than it was recorded.

### Other options worth knowing

- `serializer="json"` stores JSON instead of YAML. Install `libyaml` or PyYAML's C loader for faster YAML.
- `decode_compressed_response=True` stores gzip bodies as readable text.
- `ignore_localhost=True` and `ignore_hosts=[...]` let those requests pass through unrecorded.
- `unittest` users inherit `vcr.unittest.VCRTestCase`; cassettes go to `cassettes/<Class>.<method>.yaml`.

## Examples

### Example 1: Stop a billing test from calling a live exchange-rate API

Request: "tests/test_invoices.py calls the rates API and fails whenever it rate-limits us. Make it deterministic and do not commit our key."

```python
# tests/conftest.py
import pytest

@pytest.fixture(scope="module")
def vcr_config():
    return {"filter_headers": [("authorization", "DUMMY")], "filter_query_parameters": ["api_key"]}
```

```python
# tests/test_invoices.py
import pytest
from billing.invoices import convert_total

@pytest.mark.vcr
def test_total_converted_to_usd():
    assert convert_total(amount_eur=250, to="USD") == 270.0
```

```bash
RATES_API_KEY="$(cat ~/.secrets/rates-key)" pytest --record-mode=once tests/test_invoices.py   # records once
grep -rniE "$(cat ~/.secrets/rates-key)" tests/cassettes || echo "no key in cassettes"
pytest tests/test_invoices.py                                  # replays, no network
```

The first command creates `tests/cassettes/test_invoices/test_total_converted_to_usd.yaml`; the grep prints the "no key" message; the last run passes in milliseconds, with the network unplugged too.

### Example 2: Re-record when the vendor changes its response

Request: "The shipping API added a field and our parser needs it. Refresh the cassettes."

```bash
git rm -q tests/cassettes/test_shipping/test_label_created.yaml   # or use --record-mode=rewrite
SHIPPO_TOKEN="$(cat ~/.secrets/shippo-test-token)" pytest --record-mode=rewrite tests/test_shipping.py
git diff --stat tests/cassettes
```

Use the vendor's sandbox token. The diff shows exactly which fields changed in the recorded response, so the review covers both the code change and the new API contract.

### Example 3: Replay a test that starts its own local server

When the fixture starts a server on a random port (as in a local mock), pass `match_on=["method", "path", "query"]` in `vcr_config`. Without it the replay fails with "No match for the request" because the port in the recorded URI differs on every run, which was reproduced and fixed this way.

## Guidelines

- Commit cassettes, but review them like code: they contain real response bodies. Never record with production credentials; use sandbox keys.
- Use `none` (the pytest-recording default) in CI and `once` locally. A failing "Can't overwrite existing cassette" error means the code made a request the cassette lacks: compare the printed request against the recorded ones before re-recording.
- Re-record on a schedule or when the vendor changes, otherwise tests keep passing against an API that no longer exists. Cassettes cannot detect upstream drift by themselves.
- Time-dependent values (dates, nonces, signed URLs, request IDs in the body) break matching; remove them from `match_on` or freeze time in the test.
- Streaming and WebSocket traffic is not a good fit; VCR.py records plain request and response pairs.
- Cassette files are loaded with a safe YAML loader; do not commit cassettes from untrusted sources.
- For mocking an API that does not exist yet, or for browser-level tests, use a mock server or Playwright instead.
