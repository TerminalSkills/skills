---
name: whatweb
description: >-
  Identify web technologies, frameworks, CMS platforms, and server configurations
  on target websites. Use when tasks involve web technology fingerprinting,
  identifying CMS versions (WordPress, Drupal, Joomla), detecting web servers
  (Apache, Nginx, IIS), finding JavaScript frameworks, discovering WAF presence,
  or mapping the technology stack of a target during reconnaissance.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags:
    - whatweb
    - fingerprinting
    - reconnaissance
    - security
    - web-technology
    - cms-detection
---

# WhatWeb

Identify web technologies on target websites. WhatWeb recognizes CMS platforms, web frameworks, JavaScript libraries, analytics tools, web servers, embedded devices, version numbers, and more. It has over 1,800 plugins for technology detection.

## Installation

```bash
# Debian/Ubuntu
sudo apt install whatweb

# macOS
brew install whatweb

# From source
git clone https://github.com/urbanadventurer/WhatWeb.git
cd WhatWeb && sudo make install

# Docker
docker run --rm guidelacour/whatweb https://example.com
```

## Basic Usage

```bash
# Scan a single URL
whatweb https://example.com

# Scan multiple URLs
whatweb https://example.com https://example.org

# Scan from a file
whatweb -i urls.txt

# Output formats
whatweb https://example.com --log-json=results.json   # JSON
whatweb https://example.com --log-xml=results.xml      # XML
whatweb https://example.com --log-csv=results.csv      # CSV
whatweb https://example.com -v                          # Verbose
```

## Aggression Levels

WhatWeb has 4 aggression levels that control how much it probes the target:

```bash
# Level 1 (Stealthy) — default
# One HTTP request per target. Analyzes headers, body, and cookies.
whatweb -a 1 https://example.com

# Level 2 (Passive) — not implemented, same as 1

# Level 3 (Aggressive)
# Makes additional requests: /robots.txt, /sitemap.xml, common paths
# Sends requests to identify specific versions
whatweb -a 3 https://example.com

# Level 4 (Heavy)
# Brute-force checks, tries many paths and payloads
# Noisy — will appear in logs, may trigger WAF
whatweb -a 4 https://example.com
```

For authorized pentests, use level 3 or 4. For passive recon, stick with level 1.

## Plugin System

WhatWeb's power comes from its 1,800+ plugins. Each plugin detects a specific technology:

```bash
# List all plugins
whatweb --list-plugins

# Search for specific plugins
whatweb --list-plugins | grep -i wordpress

# Use only specific plugins
whatweb --plugins WordPress,Apache,PHP https://example.com

# Disable specific plugins
whatweb --no-plugins=google-analytics,facebook-pixel https://example.com
```

### What WhatWeb detects

```
CMS PLATFORMS
├── WordPress (version, theme, plugins)
├── Drupal, Joomla, Magento, Shopify
├── Ghost, Hugo, Jekyll (static site generators)
└── Custom CMS indicators

WEB SERVERS
├── Apache (version, modules)
├── Nginx (version, configuration hints)
├── IIS (version, ASP.NET version)
├── LiteSpeed, Caddy, Cloudflare
└── Reverse proxy detection

FRAMEWORKS & LANGUAGES
├── PHP (version from headers/errors)
├── Python (Django, Flask, FastAPI)
├── Ruby (Rails version detection)
├── Node.js (Express, Next.js, Nuxt)
├── Java (Spring, Tomcat, JBoss)
└── .NET (version, MVC detection)

JAVASCRIPT LIBRARIES
├── jQuery (version)
├── React, Vue, Angular
├── Bootstrap (version)
└── 200+ JS library plugins

SECURITY
├── WAF detection (Cloudflare, AWS WAF, Akamai)
├── HTTP security headers
├── SSL/TLS configuration
├── Cookie flags (HttpOnly, Secure, SameSite)
└── Content Security Policy

OTHER
├── Analytics (Google Analytics, Matomo)
├── CDN detection (Cloudflare, Fastly, Akamai)
├── Email addresses, phone numbers
├── Country, IP address
└── Embedded devices (routers, cameras, printers)
```

## Interpreting Results

```bash
# Example output:
# https://example.com [200 OK] Apache[2.4.52], Bootstrap[5.2.3],
# Country[US], HTML5, HTTPServer[Ubuntu Linux][Apache/2.4.52 (Ubuntu)],
# JQuery[3.6.0], PHP[8.1.12], Script, Title[Example Site],
# WordPress[6.3.1], X-Powered-By[PHP/8.1.12]

# What this tells a pentester:
# - Apache 2.4.52 on Ubuntu → check for known CVEs
# - PHP 8.1.12 → check for PHP-specific vulnerabilities
# - WordPress 6.3.1 → check for WP core + plugin vulnerabilities
# - jQuery 3.6.0 → check for prototype pollution
# - No WAF detected → direct attacks may work
# - X-Powered-By header → information leakage (should be disabled)
```

## Pipeline Integration

```bash
# Combine with subfinder and httpx for full recon:

# 1. Find subdomains
subfinder -d target.com -silent > subs.txt

# 2. Check which are live
cat subs.txt | httpx -silent > live.txt

# 3. Fingerprint all live hosts
whatweb -i live.txt --log-json=tech-stack.json -a 3

# 4. Parse results to find interesting targets
cat tech-stack.json | jq -r '
  select(.plugins.WordPress) |
  .target + " - WordPress " + .plugins.WordPress.version[0]
'
```

## Bulk Scanning

```bash
# Scan a large list with rate limiting
whatweb -i urls.txt \
  --wait=1 \           # 1 second between requests
  --max-threads=10 \   # 10 concurrent threads
  --log-json=results.json \
  -a 3                 # Aggressive mode

# Resume interrupted scan
whatweb -i urls.txt --log-json=results.json --resume
```

## Examples

### Fingerprint all subdomains of a target

```prompt
We've discovered 150 subdomains for target.com using subfinder. Run WhatWeb against all live hosts to identify the technology stack — CMS platforms, web servers, frameworks, and JavaScript libraries. Flag any outdated versions with known CVEs. Produce a summary table showing each subdomain, its tech stack, and risk level.
```

### Detect WAF and security headers

```prompt
Scan our 5 production domains and check for: WAF presence (Cloudflare, AWS WAF, etc.), security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options), cookie security flags, and TLS configuration. Produce a compliance report showing which domains pass and which need fixes.
```

### Map technology stack for vulnerability assessment

```prompt
Before starting a penetration test on our client's web application at app.client.com, fingerprint the complete technology stack using WhatWeb at aggression level 3. Identify the web server, backend language, framework, CMS, JavaScript libraries, CDN, and any third-party services. Cross-reference all detected versions against the NVD database for known vulnerabilities. Produce a target profile document for the pentest team.
```
