---
name: amass
description: >-
  OWASP Amass maps an organization's external attack surface: it finds subdomains, IP addresses, netblocks and ASNs from passive sources and active DNS techniques and stores them in an asset database. Use when: comprehensive subdomain enumeration, attack surface discovery, finding forgotten hosts before a pentest, tracking newly appeared assets, building a graph of target infrastructure.
license: Apache-2.0
compatibility: "Linux, macOS or Windows binary, Go 1.26+ to build from source, or Docker"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: research
  repository: https://github.com/owasp-amass/amass
  tags: [amass, dns, subdomain, attack-surface, network-mapping]
  use-cases:
    - "Enumerate all subdomains for a target domain using passive sources"
    - "Seed an enumeration with ASNs, CIDR ranges and IP addresses"
    - "Discover shadow IT and forgotten subdomains before a pentest"
    - "Build a visual network graph of target infrastructure"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# OWASP Amass

## Overview

OWASP Amass performs attack surface mapping and external asset discovery with open source intelligence and active reconnaissance. This skill covers **Amass v5** (v5.1.1 is the latest release checked, April 2026), which is a different tool from v3/v4 in several ways:

- A background **engine** (REST API on `127.0.0.1:4000`) does the work; `amass enum` starts it automatically if it is not running and talks to it as a client. `amass engine` runs it by hand.
- `enum` is **passive by default** (the `-passive` flag is deprecated and does nothing). `-active` adds zone transfer attempts and certificate name grabs.
- Results go to an asset database in the config directory (`~/.config/amass` on Linux), not to `-o`/`-json` files. You read them back with `subs`, `track`, `viz` and `assoc`.
- The v4 subcommands `intel` and `db` and the `-json`, `-o`, `-asn` org lookups of `enum`/`intel` are gone. Subcommands now are: `enum`, `subs`, `track`, `viz`, `assoc`, `engine`.

## Instructions

### Step 1: Install

```bash
# Homebrew
brew tap owasp-amass/homebrew-amass && brew install amass

# Go (needs Go 1.26+)
CGO_ENABLED=0 go install -v github.com/owasp-amass/amass/v5/cmd/amass@main

# Release archive, verified against the published checksums
curl -fsSLO https://github.com/owasp-amass/amass/releases/download/v5.1.1/amass_linux_amd64.tar.gz
curl -fsSLO https://github.com/owasp-amass/amass/releases/download/v5.1.1/amass_checksums.txt
sha256sum --ignore-missing -c amass_checksums.txt
tar -xzf amass_linux_amd64.tar.gz

# Docker
docker pull owaspamass/amass:latest
docker run --rm -v ~/.config/amass:/.config/amass owaspamass/amass:latest enum -d northwind-labs.io

amass --version
```

Release archives exist for linux (amd64, arm64, 386, armv6, armv7), darwin and windows; check the actual file names in the release page before downloading.

### Step 2: Passive enumeration (no direct contact with the target)

```bash
amass enum -d northwind-labs.io                    # passive is the default
amass enum -d northwind-labs.io,northwind-labs.com # several domains
amass enum -df domains.txt -nocolor -silent        # domains from a file
amass enum -list                                   # list available data sources
amass enum -d northwind-labs.io -include Shodan,VirusTotal -exclude Ahrefs
```

### Step 3: Active enumeration (touches the target's DNS and TLS)

```bash
amass enum -active -d northwind-labs.io -p 80,443,8443
amass enum -d northwind-labs.io -brute -w ./subdomains-top1mil-5000.txt
amass enum -d northwind-labs.io -brute -alts -max-depth 3
amass enum -d northwind-labs.io -r 8.8.8.8,1.1.1.1 -timeout 60
amass enum -d northwind-labs.io -rigid           # do not expand scope to related domains
```

`-brute` uses a built-in short wordlist unless `-w` is given. `-alts` generates altered names (`-aw` for a custom list). `-timeout` is minutes without progress before the run stops (default 30).

### Step 4: Seed with ASNs, CIDRs and addresses

v5 has no `intel` command; ranges are scope seeds for `enum`:

```bash
amass enum -asn 64496 -cidr 198.51.100.0/24
amass enum -addr 198.51.100.1-254 -d northwind-labs.io
```

Finding an organization's ASNs and ranges now has to be done with another source (RIR/RDAP, BGP lookups); Amass also records ASNs and netblocks it meets during enumeration, shown by `subs`.

### Step 5: Read results from the database

```bash
amass subs -d northwind-labs.io -names -nocolor            # discovered names only
amass subs -d northwind-labs.io -names -o northwind-names.txt
amass subs -d northwind-labs.io -ip                        # names with addresses
amass subs -d northwind-labs.io -summary                   # ASN table summary
amass subs -d northwind-labs.io -show                      # full results
```

### Step 6: Track new assets over time

```bash
amass enum -d northwind-labs.io                            # run again on a schedule
amass track -d northwind-labs.io -since "09/01 00:00:00 2026 UTC"
```

`-since` uses the format `MM/DD HH:MM:SS YYYY TZ`; `track` lists assets first seen after that moment.

### Step 7: Visualize

```bash
amass viz -d northwind-labs.io -d3 -dot -gexf -o ./graphs
dot -Tpng ./graphs/amass.dot -o ./graphs/amass.png   # Graphviz, file names may differ
```

`-d3` writes an interactive HTML force graph, `-dot` a Graphviz file, `-gexf` a Gephi file. List the output directory to see the exact names.

### Step 8: Configure data sources and options

Keys live in `~/.config/amass/datasources.yaml`; options in `config.yaml` (both are created on first run). Pass another file with `-config`. Keys come from your own accounts; never commit this file.

```yaml
# ~/.config/amass/datasources.yaml
global_options:
  minimum_ttl: 1440
datasources:
  - name: Shodan
    ttl: 10080
    creds:
      account:
        apikey: REPLACE_WITH_SHODAN_KEY
  - name: VirusTotal
    ttl: 10080
    creds:
      account:
        apikey: REPLACE_WITH_VIRUSTOTAL_KEY
  - name: PassiveTotal
    creds:
      account:
        username: ops@northwind-labs.io
        apikey: REPLACE_WITH_PASSIVETOTAL_KEY
```

```yaml
# ~/.config/amass/config.yaml
scope:
  domains:
    - northwind-labs.io
  ports: [80, 443, 8443]
options:
  datasources: "./datasources.yaml"
  bruteforce:
    enabled: false
  alterations:
    enabled: false
```

The same file can point `options.database` at Postgres (`postgres://…`) or Neo4j instead of the default local database.

## Examples

### Example 1: "Find all subdomains of our domain before the pentest starts"

```bash
amass enum -d northwind-labs.io -nocolor -silent
amass subs -d northwind-labs.io -names -o northwind-names.txt
wc -l northwind-names.txt
```

Result: `northwind-names.txt` holds one host name per line (for example `vpn.northwind-labs.io`, `staging-api.northwind-labs.io`). Resolve them with `dnsx` or `dig` before reporting, because some are stale or wildcard answers.

### Example 2: "What new hosts appeared since last month?"

```bash
amass enum -d northwind-labs.io -nocolor -silent
amass track -d northwind-labs.io -since "09/01 00:00:00 2026 UTC"
```

Result: a list of names and addresses first discovered after 1 September 2026, the candidates for review.

## Guidelines

- **Authorization**: passive mode still queries third parties, but `-active`, `-brute` and `-alts` send traffic to the target's DNS and web ports. Use them only with written permission.
- **Keys matter**: without data source keys coverage is limited to free sources such as certificate transparency. Rate limits of free tiers apply.
- **Old tutorials are wrong for v5**: commands with `intel`, `db`, `-json`, `-o` on `enum`, or `-d3 -o file.html` will fail. Run `amass enum -h` and `amass <subcommand> -h` to check flags on your build.
- **Runtime**: a passive run takes minutes; brute force with large wordlists takes hours. The engine port 4000 must be free.
- **Data stays**: the asset database keeps history between runs; pass `-dir` to separate engagements and delete it when the engagement ends.
- Verify discovered names yourself: wildcard DNS and third-party data produce false positives.
