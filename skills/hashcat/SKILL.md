---
name: hashcat
description: >-
  GPU-accelerated password hash recovery with hashcat. Use when a user asks
  to crack NTLM/bcrypt/MD5/SHA/WPA hashes, run mask or rule-based attacks,
  convert a PCAP to a crackable hash, or benchmark hash cracking throughput
  on their own hardware.
license: Apache-2.0
compatibility: 'hashcat 6.2+, NVIDIA/AMD GPU with OpenCL or CUDA'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - hashcat
    - password-cracking
    - gpu
    - ntlm
    - penetration-testing
---

# Hashcat

## Overview

Hashcat is the fastest password hash cracker — 300+ hash modes, native GPU support (CUDA/OpenCL/Metal), and an attack language that covers wordlists, rules, masks, and hybrid combinations. Each hash type is referenced by a mode number (e.g., `-m 1000` for NTLM, `-m 3200` for bcrypt, `-m 22000` for WPA2). Pair with dedicated hardware — cracking on a laptop iGPU is rarely worth it.

## Instructions

### Step 1: Identify the Hash Mode

```bash
# Search by example
hashcat --example-hashes | grep -B1 -A2 'bcrypt'
# MODE: 3200
# TYPE: bcrypt $2*$, Blowfish (Unix)
# HASH: $2a$05$LhayLxezLhK1LhWvKxCyLOj0j1u...

# Common modes worth memorizing
# 0      MD5
# 100    SHA1
# 1000   NTLM
# 1400   SHA2-256
# 1800   sha512crypt  ($6$)
# 3200   bcrypt       ($2a$)
# 5600   NetNTLMv2
# 7500   Kerberos 5 AS-REQ (krb5pa)
# 13100  Kerberos 5 TGS-REP (Kerberoasting)
# 22000  WPA-PBKDF2-PMKID+EAPOL
```

### Step 2: Pick an Attack Mode

```bash
# -a 0  straight (wordlist)
# -a 1  combination (wordlist1 + wordlist2)
# -a 3  brute-force / mask
# -a 6  hybrid wordlist + mask
# -a 7  hybrid mask + wordlist

# Straight wordlist
hashcat -m 1000 ntlm.hash /usr/share/wordlists/rockyou.txt

# Wordlist + rules (biggest single ROI)
hashcat -m 1000 ntlm.hash rockyou.txt -r /usr/share/hashcat/rules/best64.rule

# Mask — 8 chars: Upper, 5 lower, 2 digits
hashcat -m 1000 ntlm.hash -a 3 '?u?l?l?l?l?l?d?d'

# Hybrid: rockyou word + 4-digit year suffix
hashcat -m 1000 ntlm.hash -a 6 rockyou.txt '?d?d?d?d'
```

### Step 3: Run with Sensible Flags

```bash
hashcat -m 1000 \
  -a 0 \
  -w 3 \
  --status --status-timer=30 \
  --session engagement-2026-04 \
  --potfile-path ./engagement.pot \
  -o cracked.txt \
  ntlm.hash rockyou.txt -r best64.rule

# -w 3           workload profile (1=desktop, 3=headless, 4=insane)
# --session      named session so you can pause/resume
# --potfile-path isolate cracked hashes per engagement
# -o             write cracked results to file
# --status       periodic progress line
```

### Step 4: Pause, Resume, and Monitor

```bash
# Interactive keys while running:
#   [s]tatus  [p]ause  [b]ypass  [c]heckpoint  [q]uit

# Resume by session name
hashcat --session engagement-2026-04 --restore

# Show previously cracked hashes
hashcat -m 1000 ntlm.hash --show
# aabb...cc:Summer2026!

# Show only still-uncracked
hashcat -m 1000 ntlm.hash --left > still-to-crack.hash
```

### Step 5: Benchmark and Tune

```bash
# Benchmark every mode
hashcat -b

# Benchmark a specific mode
hashcat -b -m 22000

# Deal with thermal throttling on consumer GPUs
hashcat -m 1000 ntlm.hash rockyou.txt -w 3 --hwmon-temp-abort=90

# Multiple GPUs — list and select
hashcat -I
hashcat -m 1000 ntlm.hash rockyou.txt -d 1,2
```

## Examples

### Example 1: Kerberoasting TGS Hashes

```bash
# After running impacket's GetUserSPNs (during an authorized engagement)
cat tgs.hash
# $krb5tgs$23$*user$DOMAIN$svc/host*$checksum$payload

hashcat -m 13100 tgs.hash /usr/share/wordlists/rockyou.txt \
  -r /usr/share/hashcat/rules/OneRuleToRuleThemAll.rule \
  --session kerberoast-acme \
  -o cracked-svc.txt

hashcat -m 13100 tgs.hash --show
# $krb5tgs$23$...:Service#2024
```

### Example 2: WPA2 Handshake (Own Network)

```bash
# Convert your capture
hcxpcapngtool -o wifi.hc22000 home-01.cap

# Attack with rockyou + best64
hashcat -m 22000 wifi.hc22000 /usr/share/wordlists/rockyou.txt \
  -r /usr/share/hashcat/rules/best64.rule \
  --status --status-timer=10 \
  --session home-wifi

# Show the recovered passphrase
hashcat -m 22000 wifi.hc22000 --show
# abcdef1234567890:aabbccddeeff:...:MyHomePass2026
```

## Guidelines

- **Authorization is required.** Cracking hashes you do not own or have written permission to test is illegal.
- Always confirm the mode number before running — `hashcat --example-hashes` is authoritative, `hashid` is a quick guess.
- Rules are high-leverage: a 14K-word list + `best64.rule` covers more than a 10M-word flat list. Start there.
- Separate pot files per engagement (`--potfile-path ./engagement.pot`). The default global potfile bleeds context across clients.
- Fast hashes (NTLM, MD5, SHA1) complete in minutes on a single GPU. Slow hashes (bcrypt, argon2, sha512crypt) may take days — lean on targeted wordlists and rules, not brute force.
- `-w 3` is the right default when no one is using the GUI. `-w 4` (insane) makes the system unusable.
- Recent mode changes: WPA PMKID/EAPOL is now `-m 22000`; the older `-m 2500` and `-m 16800` are deprecated.
- On cloud GPU instances, write the session and potfile to persistent storage — preemption wipes local disk.
