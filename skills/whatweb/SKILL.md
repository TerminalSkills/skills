---
name: whatweb
description: >-
  Identify web technologies, frameworks, CMS platforms, and server configurations
  on target websites. Use when tasks involve web technology fingerprinting,
  identifying CMS versions (WordPress, Drupal, Joomla), detecting web servers
  (Apache, Nginx, IIS), finding JavaScript frameworks, discovering WAF presence,
  or mapping the technology stack of a target during reconnaissance.
license: Apache-2.0
compatibility: "Ruby (0.6.4), or a distro package"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/urbanadventurer/WhatWeb
  category: devops
  tags:
    - fingerprinting
    - reconnaissance
    - security
    - web-technology
    - cms-detection
---

# WhatWeb

## Overview

Identify web technologies on target websites. WhatWeb recognizes CMS platforms, web frameworks, JavaScript libraries, analytics tools, web servers, embedded devices, version numbers, and more. It has over 1,800 plugins for technology detection.

## Instructions

### Installation

```bash
# Debian/Ubuntu/Kali
sudo apt install whatweb

# macOS
brew install whatweb

# From source (latest release is 0.6.4, April 2026; needs Ruby)
git clone https://github.com/urbanadventurer/WhatWeb.git
cd WhatWeb && bundle install
./whatweb --version
```

The repository also ships a `make install` target for a system-wide install. Check `whatweb --version` after installing: distro packages often lag behind the release.

### Basic Usage

```bash
# Scan a single URL
whatweb https://www.northwind-logistics.com

# Scan multiple URLs
whatweb https://www.northwind-logistics.com https://blog.northwind-logistics.com

# Scan from a file
whatweb -i urls.txt

# Output formats
whatweb https://www.northwind-logistics.com --log-json=results.json   # JSON
whatweb https://www.northwind-logistics.com --log-xml=results.xml     # XML
whatweb https://www.northwind-logistics.com --log-brief=results.txt    # one line per target, greppable
whatweb https://www.northwind-logistics.com -v                          # Verbose
```

### Aggression Levels

Levels control how much WhatWeb probes the target (`-a` / `--aggression`):

```bash
# Level 1 (Stealthy) - default
# One HTTP request per target, follows redirects. Analyzes headers, body, cookies.
whatweb -a 1 https://shop.northwind-logistics.com

# Level 2 is unused

# Level 3 (Aggressive)
# Plugins that matched at level 1 make extra requests (guess URLs, pin down versions)
whatweb -a 3 https://shop.northwind-logistics.com

# Level 4 (Heavy)
# Aggressive tests of ALL plugins run against every URL. Noisy, may trigger a WAF
whatweb -a 4 https://shop.northwind-logistics.com
```

To find an exact version, combine level 3 with one plugin (`-p wordpress -a 3`): far fewer requests than a full level 3 scan. WhatWeb has no intrusion or exploit tests, but levels 3-4 still need permission. WhatWeb does not cache, so aggressive scans of redirecting URLs repeat requests.

### Plugin System

WhatWeb's power comes from its 1,800+ plugins. Each plugin detects one technology:

```bash
# List all plugins
whatweb --list-plugins

# Search plugin names and descriptions, or show details for one
whatweb --search-plugins wordpress
whatweb --info-plugins phpBB

# Use only specific plugins (comma separated)
whatweb --plugins WordPress,Apache,PHP https://blog.northwind-logistics.com

# Remove a plugin from the full set with a minus modifier
whatweb --plugins=-md5 https://blog.northwind-logistics.com

# Quick custom match without writing a plugin
whatweb --custom-plugin ":text=>'powered by OpenCart'" https://shop.northwind-logistics.com
```

A `+` modifier adds to the full set (for example `+plugins-disabled`), `-` removes from it, and a plain list selects only those plugins.

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

SECURITY-RELATED HEADERS
├── Strict-Transport-Security, X-Frame-Options, UncommonHeaders
├── Cookie flags (HttpOnly, Secure)
└── Some WAF/CDN products (Cloudflare, Akamai, Sucuri) via plugins

OTHER
├── Analytics (Google Analytics, Matomo)
├── CDN detection (Cloudflare, Fastly, Akamai)
├── Email addresses, phone numbers
├── Country, IP address
└── Embedded devices (routers, cameras, printers)
```

### Interpreting Results

```bash
# Example output:
# https://www.northwind-logistics.com [200 OK] Apache[2.4.52], Bootstrap[5.2.3],
# Country[US], HTML5, HTTPServer[Ubuntu Linux][Apache/2.4.52 (Ubuntu)],
# JQuery[3.6.0], PHP[8.1.12], Script, Title[Northwind Logistics],
# WordPress[6.3.1], X-Powered-By[PHP/8.1.12]

# What this tells a pentester:
# - Apache 2.4.52 on Ubuntu → check for known CVEs
# - PHP 8.1.12 → check for PHP-specific vulnerabilities
# - WordPress 6.3.1 → check for WP core + plugin vulnerabilities
# - jQuery 3.6.0 → check for prototype pollution
# - No WAF detected → direct attacks may work
# - X-Powered-By header → information leakage (should be disabled)
```

### Pipeline Integration

```bash
# Combine with subfinder and ProjectDiscovery httpx (not the Python httpx package)

# 1. Find subdomains
subfinder -d northwind-logistics.com -silent > subs.txt

# 2. Keep the live ones
httpx -l subs.txt -silent > live.txt

# 3. Fingerprint all live hosts (JSON log is one array of result objects)
whatweb -i live.txt --log-json=tech-stack.json -a 1

# 4. Pick out WordPress sites with their version
jq -r '.[] | select(.plugins.WordPress) |
  .target + " - WordPress " + (.plugins.WordPress.version[0] // "unknown")' tech-stack.json
```

### Bulk Scanning

```bash
# Large list, polite pacing: one request per second per thread, 10 threads
whatweb -i urls.txt --wait=1 --max-threads=10 --log-json=results.json -a 1

# Hostnames, CIDR ranges and ranges like 10.0.0-3.1-254 are valid targets
whatweb --no-errors --url-prefix https:// 192.168.10.0/24
```

Defaults: 25 threads, 15 s open timeout, 30 s read timeout. There is no resume option: split large lists and re-run the unfinished part. Add `--no-cookies` for very high thread counts.

## Examples

### Fingerprint all subdomains of a target

```prompt
We've discovered 150 subdomains for northwind-logistics.com using subfinder. Run WhatWeb against all live hosts to identify the technology stack — CMS platforms, web servers, frameworks, and JavaScript libraries. Flag any outdated versions with known CVEs. Produce a summary table showing each subdomain, its tech stack, and risk level.
```

### Detect WAF and security headers

```prompt
Scan our 5 production domains with WhatWeb and report which ones show a recognizable WAF or CDN (Cloudflare, Akamai, Sucuri), which send Strict-Transport-Security and X-Frame-Options, and which set cookies without HttpOnly. Note that WhatWeb does not test TLS configuration or full CSP; say which checks need another tool.
```

### Map technology stack for vulnerability assessment

```prompt
Before starting a penetration test on our client's web application at app.client.com, fingerprint the complete technology stack using WhatWeb at aggression level 3. Identify the web server, backend language, framework, CMS, JavaScript libraries, CDN, and any third-party services. Cross-reference all detected versions against the NVD database for known vulnerabilities. Produce a target profile document for the pentest team.
```

## Guidelines

- WhatWeb is GPLv2 and sends a `WhatWeb/<version>` User-Agent by default; change it with `-U` when policy requires
- WhatWeb reports what the target advertises; hidden versions and WAFs can be missed
- Only scan targets you have explicit written authorization to test
- Start with aggression level 1 (stealthy) for initial recon; only escalate to level 3-4 on authorized pentests
- Level 4 (heavy) is noisy and will appear in target logs — use only when stealth is not a concern
- Use `--wait` for rate limiting when scanning large URL lists to avoid overwhelming targets
- Cross-reference detected versions against NVD/CVE databases for vulnerability context
- WhatWeb results may include false positives — verify critical technology findings manually
