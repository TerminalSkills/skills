---
name: burp-suite
description: >-
  Test web application security with Burp Suite. Use when a user asks to
  intercept HTTP traffic, test for web vulnerabilities, fuzz API endpoints,
  analyze authentication flows, or perform manual web application pentesting.
license: Apache-2.0
compatibility: 'Java-based (Linux, macOS, Windows)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - burp-suite
    - web-security
    - proxy
    - penetration-testing
    - api-testing
---

# Burp Suite

## Overview

Burp Suite is the standard web application security testing platform. Its intercepting proxy captures and modifies HTTP/HTTPS traffic between browser and server. Includes: Scanner (automated vulnerability detection), Intruder (parameter fuzzing), Repeater (manual request modification), Sequencer (token randomness analysis), and Decoder (encoding/decoding). Community Edition is free; Professional adds the scanner and advanced features.

## Instructions

### Step 1: Proxy Setup and Traffic Interception

```text
1. Start Burp Suite → Proxy tab → Intercept is On
2. Configure browser proxy: 127.0.0.1:8080
3. Install Burp CA certificate for HTTPS interception:
   - Browse to http://burpsuite
   - Download CA certificate
   - Import into browser trust store

4. Browse the target application normally
   → Burp captures every request in HTTP History
   → Site map builds automatically from crawled pages
```

```text
# Proxy → HTTP History shows all captured requests:
# Method  URL                              Status  Length
# GET     /api/v1/users/me                 200     1,247
# GET     /api/v1/projects                 200     8,432
# POST    /api/v1/projects                 201     523
# GET     /api/v1/projects/123/tasks       200     15,891
# PUT     /api/v1/tasks/456                200     312
# DELETE  /api/v1/tasks/789                403     89

# Right-click any request → Send to Repeater / Intruder / Scanner
```

### Step 2: Repeater — Manual Testing

```text
# Send a request to Repeater to modify and resend manually

# Test IDOR: Change user ID in the request
GET /api/v1/users/123/profile HTTP/1.1
→ Change to: GET /api/v1/users/124/profile HTTP/1.1
→ If 200 OK with different user's data → IDOR vulnerability

# Test privilege escalation: Use regular user token on admin endpoint
GET /api/v1/admin/users HTTP/1.1
Authorization: Bearer <regular-user-token>
→ If 200 OK → Broken access control

# Test input validation: Inject payloads
POST /api/v1/search HTTP/1.1
Content-Type: application/json

{"query": "' OR 1=1--", "limit": 10}
→ If different response → possible SQL injection

{"query": "<script>alert(1)</script>"}
→ If reflected in response → possible XSS
```

### Step 3: Intruder — Automated Fuzzing

```text
# Send request to Intruder → mark injection points with §

# IDOR enumeration: Fuzz user IDs
GET /api/v1/users/§1§/transactions HTTP/1.1
→ Payload: Numbers 1-1000
→ Filter: responses with status 200 and different lengths
→ Every 200 = accessible user's transactions

# Directory brute force
GET /§admin§/ HTTP/1.1
→ Payload: wordlist (common-dirs.txt)
→ Filter: status != 404

# Credential stuffing (authorized testing only)
POST /api/v1/auth/login HTTP/1.1
{"email": "§user@example.com§", "password": "§password123§"}
→ Payload type: Pitchfork (parallel lists)
→ Payload 1: email list, Payload 2: password list
→ Filter: status 200 or different response length

# Parameter fuzzing for injection
POST /api/v1/products HTTP/1.1
{"name": "§test§", "category": "electronics"}
→ Payload: SQL/XSS/SSTI fuzzing wordlist
→ Monitor: response time (time-blind), errors (error-based), content changes
```

### Step 4: Scanner (Professional Edition)

```text
# Active scan crawls and tests automatically
# Target → Right-click → Scan

# Scanner checks for:
# - SQL injection (all techniques)
# - Cross-site scripting (reflected, stored, DOM)
# - Server-side request forgery (SSRF)
# - Server-side template injection (SSTI)
# - XML external entity injection (XXE)
# - Path traversal
# - OS command injection
# - Authentication flaws
# - Session management issues
# - Information disclosure

# Configure scan scope to stay within authorized targets:
# Target → Scope → Include: *.target.example.com
```

### Step 5: Automation with Burp Extensions

```text
# BApp Store extensions (essential for pentesting):

# Autorize — automatic authorization testing
# Tests every request with a different user's session
# Finds IDOR and privilege escalation automatically

# Logger++ — advanced request logging with filters
# Filter by regex, response codes, content types

# Param Miner — discovers hidden parameters
# Finds unlinked parameters that accept input

# Turbo Intruder — high-speed fuzzing (Python scripted)
# 10-100x faster than built-in Intruder

# JWT Editor — decode, modify, and forge JWT tokens
# Test: algorithm confusion, expired tokens, signature bypass

# Hackvertor — encoding/decoding in-line within requests
# Nest encodings: <@base64><@url>payload<@/url><@/base64>
```

### Step 6: Export for Reporting

```text
# Export findings:
# Target → Issues → Right-click → Report selected issues
# Format: HTML or XML
# Includes: severity, confidence, evidence, remediation

# Export requests for sqlmap or other tools:
# Right-click request → Copy to file → Save as .txt
# sqlmap -r saved-request.txt --batch

# Export sitemap for documentation:
# Target → Site map → Right-click → Save selected items
```

## Guidelines

- **Scope your proxy** — only intercept traffic to authorized targets. Exclude third-party domains.
- Repeater is your best friend for manual testing — modify one parameter at a time and observe responses.
- Intruder with wordlists finds IDOR, directory traversal, and injection points faster than manual testing.
- Always check authorization: send regular-user requests to admin endpoints (test with Autorize extension).
- Save your Burp project frequently — losing a 4-hour testing session is painful.
- Use macros for authenticated scanning — configure session handling rules to auto-login when session expires.
- Burp Scanner produces false positives — always manually verify findings before reporting.
- Combine with sqlmap: export the exact request from Burp (`-r request.txt`) for targeted injection testing.
