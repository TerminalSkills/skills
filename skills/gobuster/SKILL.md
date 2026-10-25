---
name: gobuster
description: >-
  Gobuster is a fast command-line brute-forcer that finds hidden directories
  and files on web servers, DNS subdomains, virtual hosts and open cloud
  storage buckets from a wordlist. Use when a user asks to discover hidden
  endpoints, enumerate subdomains, find backup files, run content discovery
  during an authorized penetration test, or fix a gobuster command that errors
  on flags such as -d or --status-codes.
license: Apache-2.0
compatibility: "Linux, macOS, Windows. Gobuster 3.8.x; building from source needs Go 1.25+."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/OJ/gobuster
  tags: "gobuster, directory-bruteforce, subdomain-enumeration, penetration-testing, content-discovery"
---

# Gobuster

## Overview

Gobuster is a multi-threaded brute-force tool written in Go. Modes: `dir` (directories and files), `dns` (subdomains), `vhost` (virtual hosts), `fuzz` (replace the `FUZZ` keyword anywhere in URL, headers or body), `s3` and `gcs` (cloud buckets), and `tftp`. It finds admin panels, backup files, forgotten endpoints and unlisted hosts.

Only run it against systems you own or have written permission to test. It sends thousands of requests and shows up in logs.

## Instructions

### Install

```bash
sudo apt install gobuster                    # Debian/Kali; or: brew install gobuster
go install github.com/OJ/gobuster/v3@latest  # needs Go 1.25+
```

Release binaries (`gobuster_Linux_x86_64.tar.gz` etc.) are on the GitHub releases page next to `gobuster_<version>_checksums.txt`; verify with `sha256sum -c` before extracting. Check the version with `gobuster --version`.

### Directory and file discovery

```bash
# Basic scan
gobuster dir -u http://127.0.0.1:8080 -w /usr/share/wordlists/dirb/common.txt

# Extensions, more threads, only interesting status codes
gobuster dir -u http://127.0.0.1:8080 \
  -w /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt \
  -x php,txt,bak,old,sql,zip,env -t 30 \
  -s 200,204,301,302,307,401,403 -b ""

# Authenticated, saved to a file, errors hidden
gobuster dir -u http://127.0.0.1:8080/api/v1 -w api-endpoints.txt \
  -H "Authorization: Bearer $API_TOKEN" -c "session=$SESSION_ID" \
  --no-error -o results.txt
```

Key flags: `-x` extensions, `-X` extensions file, `-t` threads (default 10), `-s` allowed status codes, `-b` blocked status codes, `--xl` exclude body lengths, `-e` print full URLs, `-r` follow redirects, `-k` skip TLS verification, `-a` user agent, `-d` per-thread delay (for example `500ms`), `--db` look for backup copies of found files, `-q` and `--np` for clean output.

Gobuster 3.x blocks status 404 by default (`-b 404`) and refuses to start if `-s` is also set. Pass `-b ""` together with `-s`, or use `-b` alone. There is no recursive mode in v3: rerun against each interesting directory.

### DNS subdomains

```bash
gobuster dns --do staging.northwind.dev \
  -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt \
  --resolver 1.1.1.1:53 -t 30
```

The domain flag is `--domain` / `--do`; in `dns` mode `-d` is the delay and `-d northwind.dev` fails with a parse error. Use `-c` to also check CNAMEs and `--wc` to continue when a wildcard record is detected (results will then be noise).

### Virtual hosts

```bash
gobuster vhost -u http://10.10.14.5 --domain northwind.dev --append-domain \
  -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt \
  --xl 11234
```

When the URL is an IP address, set `--domain` so the Host header is built correctly. `--xl` hides responses of the default page's length; `--xh` adjusts for hostnames that change the length.

### Buckets and fuzzing

```bash
gobuster s3 -w northwind-bucket-names.txt        # also: gobuster gcs -w ...
gobuster fuzz -u "http://127.0.0.1:8080/search?q=FUZZ" -w params.txt -b 404 --exclude-length 0
```

## Examples

### Example 1: Find leftover files on your staging site

**User prompt:** "Scan our staging app at http://127.0.0.1:8080 for forgotten backup or config files."

```bash
gobuster dir -u http://127.0.0.1:8080 \
  -w /usr/share/seclists/Discovery/Web-Content/common.txt \
  -x zip,bak,sql --np -q
```

Result (each line is path, status, size):

```
admin                (Status: 301) [Size: 0] [--> /admin/]
backup.zip           (Status: 200) [Size: 2481530]
.env                 (Status: 200) [Size: 412]
```

`backup.zip` and `.env` served with 200 are findings to remove; check the 301 directories by hand.

### Example 2: Enumerate subdomains of a domain you own

**User prompt:** "List the subdomains of northwind.dev that resolve."

```bash
gobuster dns --do northwind.dev -w subdomains-top1million-5000.txt -t 30 -o subdomains.txt -q
```

Result: one line per hit, for example `staging.northwind.dev` and `grafana.northwind.dev`. If the tool stops with a wildcard warning, the zone answers every name; use vhost mode against the web server instead.

## Guidelines

- Get written authorization first; set `-t` and `-d` so you do not take a service down.
- Pick the wordlist to fit the target (SecLists `Discovery/Web-Content`, `Discovery/DNS`); start small, then widen.
- A 403 confirms the path exists. Servers that answer 200 for everything need `--xl` or `-b` filters; gobuster warns about this and `--force` overrides the check, which is rarely wise.
- Older tutorials use `-l`, `-d domain` or `--show-ips`; these flags do not exist in v3.8 (length is printed by default; hide it with `--hl`).
- Keep API tokens in environment variables, not in shell history.
- Save output (`-o`) and combine with an Nmap scan of discovered hosts.
