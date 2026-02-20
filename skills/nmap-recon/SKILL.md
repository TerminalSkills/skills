---
name: nmap-recon
description: >-
  Perform network reconnaissance with Nmap. Use when a user asks to scan
  networks, discover hosts and services, detect OS versions, find open ports,
  enumerate service versions, or perform initial reconnaissance for a
  penetration test.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - nmap
    - reconnaissance
    - network-scanning
    - penetration-testing
    - port-scanning
---

# Nmap Reconnaissance

## Overview

Nmap is the standard tool for network discovery and security auditing. It identifies live hosts, open ports, running services and their versions, operating systems, and potential vulnerabilities. Every penetration test starts with Nmap. Supports TCP/UDP scanning, OS fingerprinting, NSE (Nmap Scripting Engine) for vulnerability detection, and output in XML/JSON for automation.

## Instructions

### Step 1: Host Discovery

```bash
# Discover live hosts on a subnet (no port scan)
nmap -sn 192.168.1.0/24
# -sn: ping scan only, no port scan
# Output: list of live IPs with MAC addresses and hostnames

# Discover hosts without ping (when ICMP is blocked)
nmap -Pn -sn 10.0.0.0/24

# ARP discovery on local network (most reliable on LAN)
nmap -PR -sn 192.168.1.0/24
```

### Step 2: Port Scanning

```bash
# Quick scan — top 1000 ports with service detection
nmap -sV -sC -T4 target.example.com
# -sV: detect service versions (Apache 2.4.52, OpenSSH 8.9)
# -sC: run default NSE scripts (safe checks)
# -T4: aggressive timing (faster, noisier)

# Full TCP port scan — all 65535 ports
nmap -p- -sV --open target.example.com
# -p-: scan all ports (not just top 1000)
# --open: show only open ports (less noise)

# UDP scan — catches DNS, SNMP, TFTP, NTP
nmap -sU --top-ports 100 target.example.com
# UDP scans are slow — limit to top ports

# Specific port ranges
nmap -p 80,443,8080-8090,3000-3010 target.example.com
```

### Step 3: Service Enumeration and OS Detection

```bash
# Aggressive scan — service version + OS detection + scripts + traceroute
nmap -A -T4 target.example.com
# Combines: -sV -sC -O --traceroute

# OS fingerprinting
nmap -O --osscan-guess target.example.com
# Identifies: Linux 5.x, Windows Server 2019, FreeBSD 13, etc.

# Banner grabbing for specific services
nmap -sV --version-intensity 5 -p 22,80,443,3306,5432,6379 target.example.com
# Higher intensity = more probes = better detection
```

### Step 4: NSE Vulnerability Scripts

```bash
# Run vulnerability detection scripts
nmap --script vuln target.example.com
# Checks for: ShellShock, Heartbleed, SMB vulns, etc.

# Specific vulnerability checks
nmap --script ssl-heartbleed -p 443 target.example.com
nmap --script smb-vuln-ms17-010 -p 445 target.example.com
nmap --script http-shellshock --script-args uri=/cgi-bin/status -p 80 target.example.com

# Web server enumeration
nmap --script http-enum,http-title,http-headers,http-methods -p 80,443,8080 target.example.com

# Brute force (use with authorization only)
nmap --script ssh-brute --script-args userdb=users.txt,passdb=pass.txt -p 22 target.example.com

# DNS enumeration
nmap --script dns-brute --script-args dns-brute.domain=example.com
```

### Step 5: Output for Automation

```bash
# XML output for parsing (tools like searchsploit, Metasploit)
nmap -sV -sC -oX scan-results.xml target.example.com

# All formats at once
nmap -sV -sC -oA scan-results target.example.com
# Creates: scan-results.nmap, scan-results.xml, scan-results.gnmap

# Grepable output for quick filtering
nmap -sV -oG - target.example.com | grep "open"

# Parse XML results programmatically
python3 -c "
import xml.etree.ElementTree as ET
tree = ET.parse('scan-results.xml')
for host in tree.findall('.//host'):
    ip = host.find('.//address[@addrtype=\"ipv4\"]').get('addr')
    for port in host.findall('.//port'):
        portid = port.get('portid')
        service = port.find('service')
        name = service.get('name', 'unknown') if service is not None else 'unknown'
        version = service.get('version', '') if service is not None else ''
        state = port.find('state').get('state')
        if state == 'open':
            print(f'{ip}:{portid} — {name} {version}')
"
```

### Step 6: Stealth and Evasion

```bash
# SYN scan (half-open, less logged)
nmap -sS -T2 target.example.com
# -sS: SYN scan (doesn't complete TCP handshake)
# -T2: polite timing (slower but less detectable)

# Fragment packets to evade firewalls
nmap -f -sS target.example.com

# Decoy scan — hide your IP among fake sources
nmap -D RND:10 -sS target.example.com
# RND:10: generate 10 random decoy IPs

# Idle scan — completely anonymous via zombie host
nmap -sI zombie-host.example.com target.example.com

# Source port manipulation (bypass weak firewalls)
nmap --source-port 53 -sS target.example.com
```

## Guidelines

- **Always have written authorization** before scanning any network or host.
- Start with `-sn` (host discovery) → `-sV -sC` (service scan) → `--script vuln` (vulnerability scan). Don't jump to aggressive scans.
- `-T4` is good for most assessments. Use `-T2` when stealth matters, `-T5` only on local networks.
- Full port scan (`-p-`) takes much longer but catches services on non-standard ports — always do it.
- UDP scans (`-sU`) are slow but important — many vulnerabilities live on UDP (SNMP, DNS, TFTP).
- Save all output as XML (`-oX`) — it integrates with Metasploit, searchsploit, and custom parsers.
- NSE scripts in the `vuln` category are safe for authorized testing. `brute` and `exploit` categories are aggressive.
- Combine with `searchsploit` to cross-reference found service versions with known exploits.
