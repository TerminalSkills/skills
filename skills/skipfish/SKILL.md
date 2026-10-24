---
name: skipfish
description: >-
  Crawl and probe a web application with SkipFish, a fast active security
  scanner that brute-forces paths from a dictionary, tests injection points and
  writes an HTML report. Use when a user asks to scan a web app they own for
  hidden directories, backup files, XSS, SQL injection or misconfigurations, or
  wants a quick dictionary-driven first pass before manual testing in Burp or
  ZAP. Unmaintained since 2012, so treat results as leads.
license: Apache-2.0
compatibility: "SkipFish 2.10b (last release, 2012). Linux/macOS; built from source, or the skipfish package on Kali. Needs libssl, libidn, zlib and libpcre dev headers to compile."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/spinkham/skipfish"
  category: devops
  tags:
    - skipfish
    - web-scanner
    - reconnaissance
    - penetration-testing
    - vulnerability-scanner
---

# SkipFish

## Overview

SkipFish is an active web application scanner written by Michal Zalewski at Google. It crawls a site, brute-forces hidden paths with a dictionary, injects test payloads into the parameters it finds, and writes an HTML report sorted by severity. It is fast and noisy by design: use it only against applications you own or have written permission to test.

Status you should know before recommending it: the last release is 2.10b (2012). The upstream Google Code project is gone; `spinkham/skipfish` on GitHub is an unofficial mirror whose last commit is from 2023. Debian dropped the package after stretch, but Kali still ships `skipfish 2.10b`. It does not execute JavaScript, so single-page apps and GraphQL back ends are mostly invisible to it. For those, use ZAP or Burp and ffuf; keep SkipFish for classic server-rendered sites and quick path discovery.

## Instructions

### Step 1: Install

```bash
# Kali
sudo apt install skipfish

# Anywhere else: build from source (needs libssl, libidn, zlib and libpcre dev packages)
git clone https://github.com/spinkham/skipfish.git
cd skipfish && make
```

A source build must be run from inside its directory (`./skipfish`), because it reads its `assets/` folder from there. The dictionaries are `dictionaries/minimal.wl`, `medium.wl`, `complete.wl` and `extensions-only.wl`; on a packaged install find them with `dpkg -L skipfish | grep '\.wl$'`.

### Step 2: Understand the dictionary options

`-W` is required on every scan and names a read-write wordlist that SkipFish rewrites at the end of the scan with the keywords it learned from the site. Never point `-W` at a shipped dictionary. Load the shipped one with `-S` (read-only) and give `-W` a fresh file or `-W-` (do not store anything).

| Dictionary | Cost per fuzzed location (from the project docs) |
|---|---|
| `extensions-only.wl` with `-Y` | about 100 requests |
| `complete.wl` with `-Y` | about 2,000 requests |
| `minimal.wl` | about 60,000 requests, the recommended starter |
| `medium.wl` | about 140,000 requests |
| `complete.wl` | over 210,000 requests |

`-Y` means "fuzz either the file name or the extension, not every pair", which is much faster and less complete. `-L` stops learning new keywords; `-W- -L` is a plain crawl with no brute force.

### Step 3: Run a scan

```bash
touch shop-dict.wl
./skipfish -o shop-report -S dictionaries/minimal.wl -W shop-dict.wl \
  -I http://shop.lab.internal/ -X /logout \
  http://shop.lab.internal/
```

The output directory must not exist; SkipFish creates it. Open `shop-report/index.html` in a browser. Press Enter during the scan to see in-flight requests. Use `-u` to suppress the live stats in scripts and CI logs.

### Step 4: Scope and limit the crawl

```bash
# -I only follow URLs containing this string, -X skip URLs containing it
# (both are substring matches, not regexes)
./skipfish -o r1 -W- -S dictionaries/minimal.wl \
  -I http://shop.lab.internal/ \
  -X /logout -X /admin/delete \
  -d 5 -c 100 -r 20000 -k 1:00:00 \
  http://shop.lab.internal/
```

- `-d` maximum depth, `-c` maximum children per directory, `-x` maximum descendants per branch
- `-r` maximum total requests, `-k H:M:S` stop after this long
- `-l` is requests per second (not a request cap)
- `-D other.lab.internal` also crawls that domain; `-B cdn.lab.internal` trusts it without crawling
- `-K csrf_token` leaves a parameter alone; `-O` submits no forms

### Step 5: Authenticated scans

Form login is the best option because SkipFish re-logs in when the session dies:

```bash
./skipfish -o r2 -W- -S dictionaries/minimal.wl \
  --auth-form http://shop.lab.internal/login \
  --auth-user qa-scanner --auth-pass "$SCAN_PASSWORD" \
  --auth-verify-url http://shop.lab.internal/account \
  -X /logout \
  http://shop.lab.internal/
```

The verify URL must answer differently with and without the session (an account or profile page). If the field names are not recognised add `--auth-user-field` and `--auth-pass-field`; if the form posts somewhere other than its action, add `--auth-form-target`.

Other methods: a cookie from your browser or curl with `-N -C "sessionid=$SESSION_ID"` (`-N` stops the server overwriting it), or HTTP Basic with `-A "qa-scanner:$SCAN_PASSWORD"`. Command-line arguments are visible in `ps` to other local users, so use a throwaway test account.

### Step 6: Tune load

```bash
# Gentle: 4 connections to the target, at most 20 requests per second
./skipfish -o r3 -W- -S dictionaries/minimal.wl -m 4 -l 20 -t 20 http://staging.shop.lab.internal/
```

`-m` per-host connections, `-g` global connections, `-l` requests per second, `-t` total request timeout in seconds, `-w` per-read timeout, `-f` consecutive errors before aborting.

## Examples

### Example 1: Quick triage of a new staging site

Request: "Run a fast first pass against our staging shop before the pentest."

```bash
touch staging-dict.wl
./skipfish -o triage -S dictionaries/complete.wl -W staging-dict.wl -Y \
  -I http://staging.shop.lab.internal/ -X /logout -X /cart/clear \
  -r 30000 -k 0:30:00 -u \
  http://staging.shop.lab.internal/
```

Result: after at most 30 minutes `triage/index.html` lists issues grouped by severity, a directory sitemap with brute-forced nodes marked, and document-type counts. Look first at high-risk items (injection errors, exposed `.git` or backup files), then directory listings. Re-test every finding by hand before reporting it.

### Example 2: Authenticated scan of an internal dashboard

Request: "Scan the logged-in part of our dashboard with the QA account."

```bash
read -rs SCAN_PASSWORD && export SCAN_PASSWORD
./skipfish -o dash-report -S dictionaries/minimal.wl -W- \
  --auth-form http://dash.lab.internal/auth/login \
  --auth-user qa-scanner --auth-pass "$SCAN_PASSWORD" \
  --auth-verify-url http://dash.lab.internal/profile \
  -X /auth/logout -X /users/delete -O \
  -I http://dash.lab.internal/ \
  http://dash.lab.internal/
```

Result: SkipFish logs in, checks `/profile` against an anonymous fetch, and crawls with the session. `-O` keeps it from submitting forms, so no data is created or deleted; drop it only on a disposable copy of the app.

## Guidelines

- Written authorization is mandatory. SkipFish sends attack-looking payloads at high rate.
- Exclude every state-changing URL with `-X` (logout, delete, reset, checkout) and prefer a staging copy with test data. `-O` avoids form submissions entirely.
- `-X` and `-I` are substring matches, not regular expressions.
- Never pass a shipped dictionary to `-W`; it gets modified. Use `-S` for shipped ones.
- Expect false positives and misses. It has no JavaScript engine, no NTLM or digest auth, and no 2012-or-later web stack knowledge.
- Do not run it on production without sign-off and a change window; the larger dictionaries send hundreds of thousands of requests per directory.
- For repeated assessments of the same target, reuse the same `-W` file, so learned keywords carry over.
