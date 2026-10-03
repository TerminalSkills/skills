---
name: maltego-transforms
description: >-
  Build custom Maltego transforms in Python with the maltego-transforms SDK, so any API or data source appears as connected nodes in Maltego's link-analysis graph. Use when mapping domains, IPs, emails, persons and organizations, writing OSINT or threat-intelligence transforms, or migrating from the archived maltego-trx and Canari libraries.
license: Apache-2.0
compatibility: "Python 3.10-3.14, Maltego desktop or Graph Browser"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: research
  tags: [maltego, transforms, threat-intel, graph, visualization]
  repository: https://github.com/MaltegoTech/maltego-transforms
  use-cases:
    - "Build a custom transform to map domain to associated email addresses"
    - "List subdomains from certificate transparency logs on the graph"
    - "Visualize relationships between threat actor infrastructure nodes"
    - "Migrate an old maltego-trx transform server to the current SDK"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Maltego Transforms

## Overview

Maltego is a link-analysis tool for OSINT and threat intelligence. A transform takes one entity from the graph (a domain, IP, email, person) and returns related entities. You host transforms in your own server and Maltego calls it over HTTP.

The current library is the **Maltego Transforms SDK** (`pip install maltego-transforms`, import package `maltego`, version 1.1.1 on 25 September 2026, MIT, Python 3.10 to 3.14). It replaces `maltego-trx`, whose repository is marked archived and unmaintained (last release 1.7.0, November 2025), and Canari (`canari`, last release 2019). Old tutorials using `DiscoverableTransform`, `response.addEntity(...)` or `canari create-profile` target those libraries.

## Instructions

### 1. Install and scaffold

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install maltego-transforms maltego-transforms-std-entities
maltego-transforms start recon-transforms        # runnable project with example transforms
```

Other commands: `maltego-transforms init` (turn the current directory into a project) and `maltego-transforms install-skills` (add agent skills for authoring transforms). `start --with-skills` scaffolds with them.

### 2. Write a transform

A transform is an `async` function registered with `@register_transform`. Type hints declare the input and output entity types. Return one entity, `None`, or `yield` from an `AsyncGenerator` to stream results. Typed standard entities (`Domain`, `DNSName`, `IPv4Address`, `EmailAddress`, `AS`, `Netblock`, `Organization`, `Website`, `Person`, `Phrase` ...) come from `maltego.entities`.

Input is wrapped in a `MaltegoContext`; use `context.log.inform(...)`, `.partial(...)`, `.fatal(...)` for messages shown in the client, and raise `MaltegoException("text")` for a user-visible error. Settings (API keys, limits) are declared with `TransformSetting` and arrive as a `settings` dict argument.

### 3. Run the server and connect Maltego

```python
from maltego.server import MaltegoServerSettings, ServerHTTPSettings, run_server

settings = MaltegoServerSettings(
    server_name="Recon Helpers", ns="terminalskills.recon", author="terminal-skills",
    http_settings=ServerHTTPSettings(protocol="http"),   # plain HTTP for local development only
)
run_server(settings=settings)
```

`python project.py` serves on `127.0.0.1:3000` and prints a seed URL (`/seed`). In Maltego, add the seed URL as a transform seed to discover and install the transforms. The Graph Browser client requires HTTPS with a trusted certificate (see Maltego's "HTTPS, Certificates, and Browser Trust" article); the SDK enables SSL by default beyond local development.

### 4. Useful SDK features

- `input_constraints` limit which entities a transform is offered for.
- `TransformSetting(..., auth=True, is_global=True)` stores one credential for every transform in the namespace; other types include int, float, boolean, date, datetime, datetime_range and list variants.
- `@register_entity` defines custom entities (`MaltegoEntity` subclass with `TYPE_NAME`, `Config`, and `MaltegoEntityProperty` fields).
- Middlewares for logging, authorization and audit; OAuth authenticators for services that need them.

## Examples

### Example 1: Domain to subdomains from certificate transparency

Request: "Add a transform that expands a Domain into the hostnames found in CT logs."

```python
from typing import AsyncGenerator

import httpx
from maltego.entities import DNSName, Domain
from maltego.server import MaltegoContext, MaltegoException, register_transform


@register_transform(
    display_name="Domain to Subdomains [CT Logs]",
    description="Lists hostnames seen in certificate transparency logs via crt.sh.",
    transform_set="Recon Helpers",
)
async def domain_to_subdomains(
    input_entity: Domain, context: MaltegoContext
) -> AsyncGenerator[DNSName, None]:
    domain = input_entity.value
    headers = {"User-Agent": "terminal-skills-check (https://terminalskills.io)"}
    async with httpx.AsyncClient(timeout=30, headers=headers) as http:
        r = await http.get("https://crt.sh/", params={"q": f"%.{domain}", "output": "json"})
    if r.status_code != 200:
        raise MaltegoException(f"crt.sh answered HTTP {r.status_code}")
    seen: set[str] = set()
    for row in r.json():
        for name in row["name_value"].splitlines():
            name = name.strip().lstrip("*.").lower()
            if name.endswith(domain) and name not in seen:
                seen.add(name)
                yield DNSName(name)
```

Result: right-click `python.org` on the graph, run "Domain to Subdomains [CT Logs]", and one `DNSName` node per hostname appears (for example `education.python.org`). crt.sh is a free service that times out under load; keep the timeout and the error message.

### Example 2: Domain to emails with a per-user API key

Request: "Find emails for a domain with Hunter, and keep the API key out of the code."

```python
from typing import Any, AsyncGenerator, Dict

import httpx
from maltego.entities import Domain, EmailAddress
from maltego.server import MaltegoContext, MaltegoException, TransformSetting, register_transform

HUNTER_KEY = TransformSetting(
    name="hunter_api_key", display_name="Hunter API key",
    type=TransformSetting.Types.str, optional=False, auth=True, is_global=True,
)


@register_transform(
    display_name="Domain to Emails [Hunter]",
    description="Email addresses Hunter has seen for a domain.",
    transform_set="Recon Helpers",
    settings=[HUNTER_KEY],
)
async def domain_to_emails(
    input_entity: Domain, settings: Dict[str, Any], context: MaltegoContext
) -> AsyncGenerator[EmailAddress, None]:
    headers = {"X-API-KEY": settings["hunter_api_key"]}
    async with httpx.AsyncClient(timeout=20, headers=headers) as http:
        r = await http.get("https://api.hunter.io/v2/domain-search", params={"domain": input_entity.value})
    if r.status_code == 401:
        raise MaltegoException("Hunter rejected the API key")
    r.raise_for_status()
    for item in r.json()["data"]["emails"]:
        yield EmailAddress(item["value"])
```

Result: Maltego asks each user for the key once and stores it; one `EmailAddress` node appears per address. Hunter accepts the key as `api_key` query parameter, `X-API-KEY` header or Bearer token; the header keeps it out of logs.

## Guidelines

- Do not start new work on `maltego-trx` or Canari; if you inherit a project that uses them, port one transform at a time to the SDK (a function plus decorator replaces the class plus `create_entities`).
- Never hardcode API keys; use `TransformSetting` and read them from the `settings` dict.
- Bind development servers to 127.0.0.1. A public server needs HTTPS, authentication and a reverse proxy.
- Respect each data source's terms and rate limits; cache repeated lookups and set timeouts on every request.
- Use OSINT transforms only on targets you are authorized to investigate; email and person data is personal data under GDPR and similar laws.
- Prefer streaming (`yield`) for long result lists so the graph fills while the transform runs.
