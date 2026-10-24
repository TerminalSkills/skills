---
name: xss-detection
description: >-
  Detect and prevent Cross-Site Scripting (XSS) vulnerabilities in web
  applications. Use when tasks involve testing for reflected, stored, or
  DOM-based XSS on systems you are authorized to test, scanning with dalfox,
  reviewing code for dangerous DOM sinks, implementing Content Security
  Policy, encoding output, sanitizing user input, or auditing web
  applications for injection vulnerabilities. Covers detection and remediation.
license: Apache-2.0
compatibility: "dalfox v3 (Rust, installed via brew/cargo/binary); Python 3.9+ for XSStrike (run from source)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags:
    - xss
    - web-security
    - injection
    - penetration-testing
    - owasp
---

# XSS Detection

## Overview

Find, confirm, and fix Cross-Site Scripting vulnerabilities. XSS lets attackers inject scripts into web pages viewed by other users — stealing sessions, redirecting to phishing sites, or modifying page content.

## Instructions

### Reflected, stored and DOM-based XSS

**Reflected**: the payload comes from the current request (a URL or form field) and is echoed back in the response unsanitized — `https://shop.northfield-outfitters.internal/search?q=<script>alert(1)</script>`, sent to a victim as a link.

**Stored**: the payload is saved server-side (a comment, a profile field) and served to every visitor who later views that page, so it needs no link-click to trigger — more dangerous than reflected because it is persistent and scales to every viewer.

**DOM-based**: the payload never reaches the server. Client-side JavaScript reads untrusted data and writes it into the page:

```javascript
// URL: https://shop.northfield-outfitters.internal/page#<img src=x onerror=alert(1)>
const hash = window.location.hash.substring(1);
document.getElementById('content').innerHTML = hash;  // XSS — server-side scanning won't see this
```

### Manual testing

Test every input point — URL parameters, form fields, headers, cookies:

1. Inject a canary string (e.g. `test12345xss`) and find where it lands in the response: inside HTML body text, an HTML attribute, a `<script>` block, a URL, or CSS.
2. Craft a payload for that context:
   - HTML body: `<img src=x onerror=alert(1)>`
   - HTML attribute (`<input value="test12345xss">`): `"><script>alert(1)</script>` or `" onfocus=alert(1) autofocus="`
   - JavaScript string (`var x = "test12345xss";`): `";alert(1)//`
   - URL/`href` context: `javascript:alert(1)`
3. If the basic payload is blocked, try a filter-bypass variant (below).

### Automated scanning

```bash
# dalfox — specialized XSS scanner, rewritten in Rust as v3 (the old Go v2 line only gets
# security backports now). Install with a package manager or a release binary, not `go install`:
#   brew install dalfox            # macOS/Linux, tracks latest stable
#   cargo install dalfox           # needs Rust 1.93+
#   sudo snap install dalfox       # Ubuntu
# Everything now sits under the `scan` subcommand.

dalfox scan "https://staging.example.org/search?q=test"
dalfox scan urls-with-params.txt --output results.txt
cat urls-with-params.txt | dalfox scan

# XSStrike — Python-based context-aware payload generator. It is not published to PyPI by
# its maintainer (the "xsstrike" PyPI package is an unrelated third-party fork), so run it
# from a clone instead:
#   git clone https://github.com/s0md3v/XSStrike && cd XSStrike
#   python3 -m pip install -r requirements.txt
python3 xsstrike.py -u "https://staging.example.org/search?q=test"
python3 xsstrike.py -u "https://staging.example.org/search?q=test" --fuzzer  # Fuzzing mode
```

### DOM XSS detection

DOM XSS requires analyzing JavaScript source code for dangerous patterns:

```javascript
// DANGEROUS SINKS — functions that execute or render content
// Look for these being called with user-controlled input:

document.write()              // Writes raw HTML
document.writeln()
element.innerHTML = ...       // Parses and renders HTML
element.outerHTML = ...
element.insertAdjacentHTML()
eval()                        // Executes JavaScript string
setTimeout(string)            // Executes if passed a string
setInterval(string)
Function(string)
$.html()                      // jQuery — same as innerHTML
$(user_input)                 // jQuery selector injection
window.location = ...         // Open redirect / javascript: URLs

// SOURCES — where user input comes from:
window.location.hash
window.location.search
window.location.href
document.URL
document.referrer
document.cookie
window.name
window.postMessage data
localStorage / sessionStorage
```

### Filter bypass techniques

When a WAF or input filter blocks the obvious `<script>` payload, a few categories of variant
usually reveal whether the filter does real parsing or just pattern-matching: tag/attribute
alternatives that avoid the word "script" (`<svg onload=alert(1)>`, `<img src=x onerror=alert(1)>`),
case variation (`<ScRiPt>`), HTML-entity or double-URL encoding of the payload, and bracket
notation (`window['alert'](1)`) when parentheses or specific identifiers are blocked. Report
which category defeated the filter and why, rather than a bare payload list.

### Prevention

### Server-side output encoding

The primary defense — encode output based on context:

```python
# output_encoding.py
# Context-aware output encoding prevents XSS

import html
import json

def encode_html(value: str) -> str:
    """Encode for HTML body context.
    
    Converts: & < > " ' to HTML entities
    Use when inserting into: <p>{value}</p>
    """
    return html.escape(value, quote=True)

def encode_attribute(value: str) -> str:
    """Encode for HTML attribute context.
    
    Use when inserting into: <input value="{value}">
    Always quote attributes — unquoted attributes have more bypass vectors.
    """
    return html.escape(value, quote=True)

def encode_javascript(value: str) -> str:
    """Encode for JavaScript string context.
    
    Use when inserting into: var x = "{value}";
    Best practice: use JSON.dumps which handles all escaping.
    """
    return json.dumps(value)  # Handles \, ", newlines, etc.

def encode_url(value: str) -> str:
    """Encode for URL parameter context.
    
    Use when inserting into: <a href="/page?q={value}">
    """
    from urllib.parse import quote
    return quote(value, safe='')
```

### Content Security Policy (CSP)

CSP is the strongest defense against XSS — even if an attacker injects a script, the browser won't execute it:

```
# Strict CSP — blocks inline scripts and eval
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.northfield-outfitters.internal;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';

# How nonce-based CSP works:
# Server generates a random nonce per request
# Only <script nonce="same-random-value"> executes
# Injected scripts without the nonce are blocked
```

```html
<!-- Server generates nonce per request -->
<script nonce="r4nd0m123">
  // This executes — nonce matches CSP header
  app.init();
</script>

<!-- Injected by attacker — blocked by CSP -->
<script>alert(1)</script>
<!-- Browser refuses to execute: no nonce attribute -->
```

### Input validation

Defense-in-depth — validate input even though output encoding is the primary defense:

```python
# input_validation.py
# Validate and sanitize user input as defense-in-depth

import nh3  # Python bindings for the Rust "ammonia" sanitizer.
            # bleach (the older standard choice) announced on 2026-06-05 that it is no
            # longer maintained and will get no further releases, including security fixes —
            # do not start new projects on it.

def sanitize_rich_text(html_input: str) -> str:
    """Sanitize user-provided HTML (e.g., blog comments with formatting).

    Allows safe tags and attributes, strips everything else.
    Use ONLY when you need to accept HTML input.
    For plain text, use output encoding instead.
    """
    allowed_tags = {"p", "br", "b", "i", "em", "strong", "a", "ul", "ol", "li"}
    allowed_attrs = {"a": {"href", "title"}}  # No onclick, no style

    return nh3.clean(
        html_input,
        tags=allowed_tags,
        attributes=allowed_attrs,
        link_rel="noopener noreferrer",   # strips javascript: links and adds a safe rel
    )
```

## Examples

### Test a web application for XSS vulnerabilities

```prompt
Audit our web application for XSS vulnerabilities. Test all input points: search forms, user profile fields, comment sections, URL parameters, and HTTP headers (Referer, User-Agent). For each finding, show the injection context, the payload that triggers it, the XSS type (reflected/stored/DOM), and the impact. Provide remediation guidance specific to each finding.
```

### Implement CSP for an existing application

```prompt
Our Express.js application has no Content Security Policy. Implement a strict CSP with nonce-based script execution. The app uses inline scripts in 3 templates, loads Google Analytics and Stripe.js externally, and has inline styles in some components. Migrate all inline scripts to nonce-based, create the CSP middleware, and set up CSP violation reporting to catch issues before enforcing.
```

### Build an automated XSS testing pipeline

```prompt
Set up an automated XSS testing pipeline that runs on every PR. It should: 1) Spider the running application to discover all forms and URL parameters, 2) Test each input with context-appropriate payloads, 3) Check for DOM XSS by analyzing JavaScript for dangerous sink/source patterns, 4) Verify CSP headers are present and properly configured, 5) Report findings with severity ratings. Use `dalfox scan` (installed via `brew install dalfox` in CI) for reflected/stored and a custom scanner for DOM-based.
```

## Guidelines

- Only test for XSS on applications you have explicit written authorization to test
- Use `alert(1)` or `alert(document.domain)` as proof-of-concept — never use actual cookie-stealing payloads against real users
- Stored XSS payloads persist in the database — coordinate with the target team to clean up after testing
- CSP is the strongest defense but is not a replacement for output encoding — implement both
- Context-aware encoding is critical: HTML encoding in a JavaScript context does not prevent XSS
- Always report XSS findings through responsible disclosure channels, never publicly
- Use `nh3` (Rust-backed) for HTML sanitization in new Python code; `bleach` announced on 2026-06-05 that it is unmaintained and will not receive further security fixes
- dalfox v3 is a full rewrite in Rust with a `scan` subcommand replacing the old `url`/`file`/`pipe` subcommands; the Go v2 line only receives security backports — install from Homebrew, Cargo or a release binary rather than `go install`
