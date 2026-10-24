---
name: nikto
description: >-
  Scan web servers for vulnerabilities with Nikto, an open-source Perl scanner that checks for dangerous files, outdated server software, risky HTTP settings, missing security headers and default content. Use when a user asks to audit web server configuration, find outdated software, detect exposed files, check for misconfigurations, or run a web server security scan on a host they are authorized to test.
license: Apache-2.0
compatibility: 'Linux, macOS (Perl 5 with XML::Writer), or Docker'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - nikto
    - web-server
    - vulnerability-scanner
    - penetration-testing
    - misconfiguration
  repository: https://github.com/sullo/nikto
---

# Nikto

## Overview

Nikto is a web server scanner that tests a host against a database of thousands of checks: dangerous and default files, outdated server and component versions, risky HTTP methods, directory indexing, missing security headers and similar configuration problems. It is noisy (thousands of requests, easy to detect) and reports leads that need manual confirmation. This skill follows Nikto 2.6.1 (released 2026-07-31).

## Instructions

### Install

```bash
# Debian/Ubuntu/Kali
sudo apt install nikto

# From source (needs Perl and the XML::Writer module)
git clone https://github.com/sullo/nikto.git
cd nikto/program
perl nikto.pl -Version

# Docker
docker run --rm ghcr.io/sullo/nikto:latest -h https://staging.shop.acme.dev
```

If a source checkout prints `Required module not found: XML::Writer`, install it with your system package manager (`libxml-writer-perl` on Debian) or `cpanm XML::Writer`. Below, `nikto` stands for the command you installed, or for `perl nikto.pl` in a checkout.

### Scan

```bash
nikto -host https://staging.shop.acme.dev                      # URL: scheme and port are taken from it
nikto -host staging.shop.acme.dev -port 8080                   # one port
nikto -host staging.shop.acme.dev -port 80,443,8080,8443       # several ports
nikto -host https://staging.shop.acme.dev -nointeractive -ask no -maxtime 30m
```

`-h` is an accepted short form of `-host`. `-nointeractive` and `-ask no` keep it from prompting in scripts and CI, `-maxtime` caps the time per host, `-nocheck` skips the update check. If a site sends a custom "not found" page, tell Nikto with `-404string "Page not found"` or `-404code 302` to avoid floods of false positives.

### Choose what to test

`-Tuning` takes the categories to run: `1` interesting files, `2` misconfiguration/default files, `3` information disclosure, `4` injection (XSS/HTML), `5` remote file retrieval inside the web root, `6` denial of service, `7` remote file retrieval server-wide, `8` command execution, `9` SQL injection, `0` file upload, `a` authentication bypass, `b` software identification, `c` remote source inclusion, `d` web service, `e` admin console. A leading `x` reverses the list: everything except the letters after it.

```bash
nikto -host https://staging.shop.acme.dev -Tuning 23b      # quick configuration review
nikto -host https://staging.shop.acme.dev -Tuning x6       # everything except denial of service
nikto -host https://staging.shop.acme.dev -Cgidirs all     # also test every CGI directory
```

With no `-Tuning`, Nikto runs all categories, including the denial-of-service checks (6); never do that against production.

### Authentication and headers

```bash
nikto -host https://staging.shop.acme.dev -id "$STAGING_USER:$STAGING_PASS"            # HTTP Basic
nikto -host https://staging.shop.acme.dev -Add-header "Cookie: session=$STAGING_SESSION"
nikto -host https://staging.shop.acme.dev -useproxy http://127.0.0.1:8080              # proxy
```

There is no `-cookie` option; send cookies with `-Add-header`. `-Add-header` can be repeated, one header per use.

### Reports

Pick the format with `-Format` (`txt`, `htm`, `xml`, `csv`, `json`, `sql`; several separated by commas) or let the file extension decide:

```bash
nikto -host https://staging.shop.acme.dev -o shop-report.json -Format json
nikto -host https://staging.shop.acme.dev -o shop-report.htm  -Format htm
```

Use `htm`, not `html`: `-Format html` writes a file named `shop-report.html.htm`. In the JSON report each entry of `vulnerabilities` has `id`, `method`, `url`, `msg` and `references`.

### Many hosts

`-host` also accepts a text file of targets (one per line) or Nmap grepable (`-oG`) output, which Nikto turns into host:port pairs, so web servers on odd ports are covered without a shell loop:

```bash
nmap -p 80,443,8080,8443 --open -oG web.gnmap 10.20.30.0/24
nikto -host web.gnmap -Tuning x6 -o web-nikto.json -Format json
```

## Examples

### Example 1: Quick review of a staging server

The user says: "Check staging.shop.acme.dev for misconfigurations and missing headers. It's our server."

```bash
nikto -host https://staging.shop.acme.dev -Tuning 23b -nointeractive -ask no -o shop-report.json -Format json
```

```console
+ Server: nginx/1.18.0
+ [013587] /: Suggested security header missing: strict-transport-security. See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security
+ [013587] /: Suggested security header missing: content-security-policy. See: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
+ [013587] /: Suggested security header missing: referrer-policy. See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy
+ [600575] nginx/1.18.0 appears to be outdated (current is at least 1.31.3).
+ [007352] /: The X-Content-Type-Options header is not set. This could allow the user agent to render the content of the site in a different fashion to the MIME type. See: https://www.netsparker.com/web-vulnerability-scanner/vulnerabilities/missing-content-type-header/
+ 2849 requests: 0 errors and 5 items reported on the remote host
```

This output is illustrative: the format matches Nikto 2.6.1, but the findings depend on the target, and the request count and "current" versions change with the database.

Each line is a lead. Read the message and the reference, then confirm the finding with curl or a browser before reporting it.

### Example 2: Sweep a subnet's web servers

The user says: "Find every web server on 10.20.30.0/24 and scan them, without touching DoS checks. I have written authorization."

```bash
nmap -p 80,443,8080,8443 --open -oG web.gnmap 10.20.30.0/24
nikto -host web.gnmap -Tuning x6 -maxtime 20m -o web-nikto.json -Format json
```

Nikto prints `+ Nmap Input Queued: 10.20.30.15:8080` for every open port it will scan, then the findings per host, and writes one JSON report.

## Guidelines

- Scan only systems you own or are authorized in writing to test. Nikto is loud and will show up in logs and IDS alerts.
- Do not run the default (all categories) or `-Tuning 6` against production: denial-of-service checks can disrupt a live site.
- Treat every finding as unverified until you reproduce it; version-based "outdated" notices ignore backported fixes.
- Nikto tests server and configuration issues, not application logic; pair it with a proxy-based tester such as Burp Suite or ZAP.
- Keep credentials in environment variables, not in the command line you paste into reports.
- Nikto's code is GPL-3.0, but its database files may only be redistributed with the official package.
