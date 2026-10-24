---
name: ssrf-detection
description: >-
  Finds server-side request forgery (SSRF) risk in code that fetches a user-supplied URL, and fixes it
  with a tested URL-validation guard (scheme allowlist, DNS resolution against private/link-local
  ranges, connect-to-resolved-IP to close the DNS-rebinding gap). Use when reviewing a webhook,
  link-preview, image-import, PDF-generator or any feature that fetches an external URL server-side,
  or when hardening cloud metadata access (IMDSv2).
license: Apache-2.0
compatibility: "Python 3.10+ for the guard; AWS CLI v2 for the metadata-hardening command."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - ssrf
    - web-security
    - secure-coding
    - owasp
    - cloud-security
---

# SSRF Detection

## Overview

Server-side request forgery happens when a server fetches a URL that an attacker controls, and the server can reach destinations the attacker cannot reach directly: localhost, an internal admin API, a database port, or a cloud instance-metadata endpoint. Any feature that takes a URL and fetches it on the backend is a candidate: webhook registration, link unfurling, "import image from URL", PDF/document generation from a remote resource, RSS/feed readers, and server-side OAuth or SSO callbacks.

This skill is for finding and fixing that risk in your own application. It does not cover attacking systems you do not own; SSRF testing against infrastructure you do not control is unauthorized access in most jurisdictions.

## Instructions

### 1. Find the vectors

Search the codebase for server-side HTTP calls built from request input:

```bash
grep -rnE "(axios|fetch|requests\.(get|post)|urllib|http\.client)\(.*req\.(query|body|params)" src/
grep -rniE "(url|uri|endpoint|webhook|callback|src|target).*=.*req\." src/
```

For each hit, check whether the destination is ever resolved and connected to without going through a validator like the one below. Pay special attention to:

- Redirect handling — an allowed URL can redirect to a blocked one; validate again at each hop, or disable redirects and handle the first one yourself.
- Any parser (image, PDF, XML, markdown) that can itself fetch a remote resource (e.g. an XML external entity, an SVG `<image>`, a markdown image tag) — these are SSRF vectors even if your own code never calls `fetch`.

### 2. Validate before connecting, and connect to what you validated

The common bug is to validate a URL, then let the HTTP client re-resolve the hostname itself — the second lookup can return a different (private) address (DNS rebinding) because nothing pins it. The guard below resolves once, checks the result, and hands the caller the already-checked IP.

```python
"""Defensive SSRF guard: validate a user-supplied URL, then connect to the IP that was checked."""
import ipaddress, socket, ssl, http.client
from urllib.parse import urlparse

class BlockedURL(ValueError):
    pass

def is_blocked(ip) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return not ip.is_global or ip in ipaddress.ip_network("100.64.0.0/10")

def resolve_safe(hostname, port):
    try:
        infos = socket.getaddrinfo(hostname, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise BlockedURL(f"cannot resolve {hostname}") from exc
    for _, _, _, _, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if is_blocked(ip):
            raise BlockedURL(f"{hostname} resolves to non-public address {ip}")
    return infos[0][4][0]

def validate_url(url, allowed_schemes=("http", "https")):
    parsed = urlparse(url)
    if parsed.scheme not in allowed_schemes:
        raise BlockedURL(f"blocked scheme {parsed.scheme!r}")
    if not parsed.hostname:
        raise BlockedURL("no hostname")
    if parsed.username or parsed.password:
        raise BlockedURL("credentials in URL are not allowed")
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError:
        raise BlockedURL("invalid port")
    return parsed.hostname, resolve_safe(parsed.hostname, port)

class PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host, safe_ip, **kw):
        super().__init__(host, **kw)
        self.safe_ip = safe_ip
    def connect(self):
        self.sock = socket.create_connection((self.safe_ip, self.port), self.timeout)

class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, safe_ip, **kw):
        super().__init__(host, **kw)
        self.safe_ip = safe_ip
    def connect(self):
        sock = socket.create_connection((self.safe_ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)

MAX_BYTES = 5 * 1024 * 1024

def fetch_preview(url):
    hostname, safe_ip = validate_url(url)
    parsed = urlparse(url)
    cls = PinnedHTTPSConnection if parsed.scheme == "https" else PinnedHTTPConnection
    conn = cls(hostname, safe_ip, port=parsed.port, timeout=5)
    try:
        conn.request("GET", (parsed.path or "/") + (f"?{parsed.query}" if parsed.query else ""))
        resp = conn.getresponse()
        if 300 <= resp.status < 400:
            raise BlockedURL("redirects are not followed")
        body = resp.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise BlockedURL("response exceeds size limit")
        return body
    finally:
        conn.close()
```

`fetch_preview` connects to `safe_ip` itself, so the hostname is never resolved a second time (TLS still verifies the certificate against `hostname`). It does not follow redirects: to support them, call `validate_url` on each `Location` and repeat, with a hop limit. `ip.is_global` rejects loopback, link-local, private, unspecified and reserved ranges, and the unwrapping of IPv4-mapped IPv6 addresses (`::ffff:127.0.0.1`) closes a bypass a plain network list misses. Save it as `ssrf_guard.py` to use the check in Example 2.

### 3. Harden cloud metadata access

Metadata services sit at a fixed address with no network boundary; if SSRF reaches them, they hand over credentials. Require the session-token protocol so the attacker also needs to set a custom header the SSRF request usually cannot add:

```bash
aws ec2 modify-instance-metadata-options   --instance-id i-0abcd1234efgh5678   --http-tokens required   --http-endpoint enabled
```

GCP's metadata server already requires the `Metadata-Flavor: Google` header for the same reason; Azure's requires `Metadata: true`. Neither header is one a basic SSRF (the server following a URL you supplied) can add, but a library that blindly forwards arbitrary headers from the original request can.

### 4. Defense in depth

- Resolve once, check the result, connect to that address — never re-resolve after validation.
- Allow only `http` and `https`; reject `file://`, `ftp://`, and the `gopher://`/`dict://` family used to reach other TCP services through a URL.
- Reject credentials embedded in the URL (`user:pass@host`) and reject a port that is not 80/443 unless the feature genuinely needs one.
- Put a dedicated fetcher behind its own network policy (no route to internal services) in front of anything that resolves attacker-influenced hostnames, so a bypass in the code does not also bypass the network.
- Cap response size and timeout; a hung or huge response from an internal service is itself a denial-of-service vector.

## Examples

### Example 1: review a link-preview feature

```prompt
Our Node/Express endpoint takes a url query param and fetches it with axios to build a link preview card. Review it for SSRF and fix it: block private, loopback and link-local ranges (including IPv6), resolve once and connect to the resolved address, disable automatic redirects, and cap the response at 5 MB with a 5 second timeout.
```

Result: the handler now calls a validator equivalent to `validate_url` above before any network call, rejects private, loopback and link-local targets (including IPv4-mapped IPv6), connects to the checked IP, and a redirect from an allowed host to a blocked one is rejected rather than followed.

### Example 2: confirm the guard rejects the known-bad cases

```console
$ python3 -c "
from ssrf_guard import validate_url, BlockedURL
for u in ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:6379/', 'http://localhost:8080/', 'http://images.unsplash.com/']:
    try: print(u, '->', validate_url(u))
    except BlockedURL as e: print(u, '-> BLOCKED:', e)
"
http://169.254.169.254/latest/meta-data/ -> BLOCKED: 169.254.169.254 resolves to non-public address 169.254.169.254
http://127.0.0.1:6379/ -> BLOCKED: 127.0.0.1 resolves to non-public address 127.0.0.1
http://localhost:8080/ -> BLOCKED: localhost resolves to non-public address 127.0.0.1
http://images.unsplash.com/ -> ('images.unsplash.com', '2606:4700:10::ac42:93f3')  # any public IP; varies
```

## Guidelines

- This skill is for securing your own application. Probing systems you do not have explicit written authorization to test is out of scope and, in most places, unlawful.
- A finding that exposes real cloud credentials or internal data is sensitive: report it through your organization's private security channel, not a public issue tracker.
- An allowlist of destination hosts, where the feature allows it, is stronger than a denylist of private ranges: a denylist can miss a range (carrier-grade NAT, IPv4-mapped IPv6, newly assigned ranges).
- Treat the validator as one layer, not the whole defense: pair it with network segmentation so a bypass in application code still cannot reach internal services.
- Re-validate after every redirect, or do not follow redirects at all; a URL that passes validation can still redirect to one that would not.
