---
name: nmap-recon
description: >-
  Nmap is the standard open-source network scanner for finding live hosts,
  open ports, service versions and operating systems. Use this skill when a
  user asks to scan a network or host they are authorized to test, discover
  hosts, find open ports, enumerate service versions, run NSE scripts, save
  results as XML, or do initial reconnaissance for a penetration test.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows; root or administrator rights for SYN scans and OS detection'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/nmap/nmap
  tags:
    - nmap
    - reconnaissance
    - network-scanning
    - penetration-testing
    - port-scanning
---

# Nmap Reconnaissance

## Overview

Nmap (current release 7.99x) sends probes to targets and reports which hosts are up, which ports are open, which services and versions answer, and often the operating system. The Nmap Scripting Engine (NSE) adds checks for specific services and known vulnerabilities, and results can be written as text, grepable text or XML for other tools.

Only scan systems you own or have written permission to test. `scanme.nmap.org` is the one public host the Nmap project invites you to scan lightly. Everything below uses your own machine (`127.0.0.1`), a lab subnet (`192.168.1.0/24`) or that host.

## Instructions

Install with a package manager: `sudo apt install nmap`, `brew install nmap`, or the Windows installer from nmap.org. `nmap --version` confirms it.

### Step 1: Host discovery

```bash
nmap -sn 192.168.1.0/24          # ping scan: list live hosts, no port scan
nmap -sn -PR 192.168.1.0/24      # ARP discovery on the local LAN (most reliable there)
nmap -sL 192.168.1.0/24          # list targets only, sends nothing to them
```

`-Pn` means "skip discovery and treat every host as up". Use it for a port scan of a host that drops ping, not together with `-sn`.

### Step 2: Port scanning

```bash
nmap -sV -sC 192.168.1.20                 # top 1000 TCP ports, versions, default scripts
nmap -p- --open -sV -T4 192.168.1.20      # all 65535 TCP ports, only open ones shown
nmap -sU --top-ports 100 192.168.1.20     # UDP is slow; limit to common ports
nmap -p 22,80,443,8080-8090 192.168.1.20  # chosen ports
```

As root, Nmap defaults to a SYN scan (`-sS`); without privileges it falls back to a full connect scan (`-sT`). UDP scans and OS detection (`-O`) need root. `-T4` suits fast reliable networks; `-T3` is the default.

### Step 3: Service and OS detection

```bash
sudo nmap -A 192.168.1.20                       # -sV -sC -O --traceroute
sudo nmap -O --osscan-guess 192.168.1.20
nmap -sV --version-intensity 7 -p 22,80,443,3306,5432,6379 192.168.1.20
```

### Step 4: NSE scripts

Scripts are grouped in categories (`default`, `safe`, `discovery`, `version`, `vuln`, `intrusive`, `brute`, `exploit`, `dos`...). `-sC` runs `default`. The `vuln` category checks for known flaws, but some of those checks are intrusive and can disturb fragile services, so run it only with permission.

```bash
nmap --script vuln 192.168.1.20
nmap --script ssl-heartbleed -p 443 192.168.1.20
nmap --script smb-vuln-ms17-010 -p 445 192.168.1.20
nmap --script http-enum,http-title,http-headers,http-methods -p 80,443,8080 192.168.1.20
nmap --script ssl-enum-ciphers -p 443 scanme.nmap.org
nmap --script-help "http-*"                     # what a script does, before running it
```

`brute`, `exploit` and `dos` scripts attack the target (`ssh-brute`, for example); never run them without explicit written scope.

### Step 5: Output for automation

```bash
mkdir -p scans                                          # nmap does not create the output directory
nmap -sV -sC -oA scans/lab-2026-10-20 192.168.1.0/24   # .nmap, .xml and .gnmap together
nmap -sV -oG - 192.168.1.20 | grep "/open/"             # quick filter of grepable output
```

Parse the XML instead of the text output:

```python
import xml.etree.ElementTree as ET

for host in ET.parse("scans/lab-2026-10-20.xml").getroot().findall("host"):
    ip = host.find("address[@addrtype='ipv4']").get("addr")
    for port in host.findall("ports/port"):
        if port.find("state").get("state") != "open":
            continue
        svc = port.find("service")
        name = svc.get("name", "unknown") if svc is not None else "unknown"
        version = svc.get("version", "") if svc is not None else ""
        print(f"{ip}:{port.get('portid')}/{port.get('protocol')} {name} {version}")
```

### Step 6: Slower or quieter scans (authorized tests of firewalls and IDS only)

```bash
sudo nmap -sS -T2 192.168.1.20                    # polite timing
sudo nmap -f 192.168.1.20                         # fragment packets
sudo nmap -D RND:5 192.168.1.20                   # mix in 5 random decoy sources
sudo nmap --source-port 53 192.168.1.20           # test a firewall rule that trusts DNS
```

These test how a defence reacts; they do not make a scan harmless, and the target's logs still show your address.

## Examples

### Check what your own laptop exposes

User: "What ports is my machine listening on?"

```bash
nmap -p- --open -sV 127.0.0.1    # all 65535 ports with version probes can take a few minutes
```

Result: a table such as `22/tcp open ssh OpenSSH ...` and `5432/tcp open postgresql PostgreSQL DB ...`, followed by `Nmap done: 1 IP address (1 host up)`. Anything unexpected in that list is worth closing or binding to localhost.

### Inventory a lab subnet and save it

User: "Find every live host on 192.168.1.0/24 and keep the results."

```bash
mkdir -p scans
nmap -sn 192.168.1.0/24 -oG - | awk '/Up$/{print $2}' > live-hosts.txt
nmap -sV -T4 --top-ports 200 -iL live-hosts.txt -oA scans/lab-2026-10-20
```

Result: `live-hosts.txt` holds one IP per line, and the `scans/` directory has the `.nmap`, `.xml` and `.gnmap` files for later parsing.

## Guidelines

- Written authorization first, every time. Port scanning without permission can be illegal and gets IPs blocked.
- Work in stages: discovery (`-sn`), then a service scan (`-sV -sC`), then targeted scripts. Add `-p-` when you need to find services on unusual ports, accepting the longer run.
- Use `-T4` on reliable networks and `-T2` for slow or fragile ones; `-T5` loses accuracy.
- UDP scans are slow and give many `open|filtered` results; limit them with `--top-ports`.
- Closed, filtered and `open|filtered` are different states; a firewall that drops packets shows as `filtered`, not as closed.
- Version detection sends real requests to the service; on production systems prefer `--version-intensity 2` or lower.
- Save XML (`-oX` or `-oA`) so results can be diffed between runs and imported by other tools. Match found versions against vendor advisories rather than assuming a banner is exact.
- Use `nmap --script-updatedb` after adding scripts, and read a script's `--script-help` before running unfamiliar ones.
