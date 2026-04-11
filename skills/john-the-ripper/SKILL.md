---
name: john-the-ripper
description: >-
  Crack password hashes offline with John the Ripper. Use when a user asks
  to identify an unknown hash format, recover a forgotten password from a
  local database or ZIP file, run a CTF hash challenge, or audit the
  strength of hashes from a system they own.
license: Apache-2.0
compatibility: 'John the Ripper 1.9+, Jumbo community build recommended'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - john-the-ripper
    - password-cracking
    - hash-cracking
    - ctf
    - penetration-testing
---

# John the Ripper

## Overview

John the Ripper (JtR) is the classic offline password cracker. It identifies hash formats, runs dictionary, incremental (brute-force), and rule-based attacks, and ships *2john helpers that convert common file formats (ZIP, PDF, SSH keys, KeePass, LUKS) into crackable hashes. The community "Jumbo" fork supports hundreds of formats. JtR is CPU-oriented — use hashcat for GPU work on fast hashes.

## Instructions

### Step 1: Identify the Hash Format

```bash
# Let JtR guess
echo '$6$saltsalt$...' > unknown.hash
john unknown.hash
# Loaded 1 password hash (sha512crypt, crypt(3) $6$ [SHA512 256/256 AVX2 4x])

# Or use hashid
hashid '$2a$12$R9h...'
# Analyzing '$2a$12$R9h...'
# [+] Blowfish(OpenBSD)
# [+] bcrypt

# List all supported formats
john --list=formats | tr ',' '\n' | grep -i bcrypt
```

### Step 2: Convert Files into Crackable Hashes

```bash
# Password-protected ZIP
zip2john secret.zip > secret.hash
john secret.hash

# Password-protected PDF
pdf2john.pl confidential.pdf > pdf.hash
john pdf.hash

# Encrypted SSH private key
ssh2john id_rsa > idrsa.hash
john idrsa.hash

# KeePass database
keepass2john db.kdbx > kp.hash
john kp.hash

# macOS keychain, Office docs, LUKS, 1Password — *2john helpers ship in Jumbo
ls /usr/share/john/*2john*
```

### Step 3: Run Attacks

```bash
# Wordlist attack
john --wordlist=/usr/share/wordlists/rockyou.txt secret.hash

# Wordlist + rules (mangles words: "Summer" → "Summer!", "summer2026", "S0mmer")
john --wordlist=rockyou.txt --rules=Jumbo secret.hash

# Incremental (brute-force) — use only against fast hashes or short passwords
john --incremental=ASCII secret.hash

# Mask attack — you know the pattern
john --mask='?u?l?l?l?l?d?d?d?d' secret.hash
# ?u upper, ?l lower, ?d digit, ?s symbol, ?a all

# Limit duration; resume later
john --max-run-time=3600 secret.hash
john --restore
```

### Step 4: Show and Export Results

```bash
# Display cracked results
john --show secret.hash
# secret.zip:hunter2:::::secret.zip

# Only count / only uncracked
john --show=left secret.hash

# Pot file (already-cracked cache) lives at ~/.john/john.pot
cat ~/.john/john.pot

# Export cracked passwords, one per line
john --show secret.hash | awk -F: 'NF>1 {print $2}'
```

### Step 5: Tuning and Multi-Core

```bash
# All CPU cores (OpenMP builds)
john --fork=8 secret.hash

# Distribute across machines (node 1 of 4)
john --node=1/4 --fork=8 secret.hash

# Benchmark your hardware
john --test --format=bcrypt
john --test --format=sha512crypt
```

## Examples

### Example 1: Crack an /etc/shadow Entry (Own System)

```bash
# On the system you own
sudo cp /etc/shadow /tmp/shadow
sudo cp /etc/passwd /tmp/passwd
chmod 644 /tmp/shadow /tmp/passwd

# Combine into JtR input
unshadow /tmp/passwd /tmp/shadow > creds.txt
head -1 creds.txt
# root:$6$abc...:0:0:root:/root:/bin/bash

john --wordlist=/usr/share/wordlists/rockyou.txt --rules=Single creds.txt
john --show creds.txt
# root:hunter2:0:0:root:/root:/bin/bash

rm /tmp/shadow /tmp/passwd creds.txt
```

### Example 2: CTF — Recover a ZIP Password

```bash
# Given challenge.zip from a CTF
zip2john challenge.zip > zip.hash
cat zip.hash
# challenge.zip:$zip2$*0*3*0*...*$/zip2$:::challenge.zip

# Try rockyou first
john --wordlist=/usr/share/wordlists/rockyou.txt zip.hash

# Add rules if the straight dictionary fails
john --wordlist=rockyou.txt --rules=KoreLogic zip.hash

# Show the result
john --show zip.hash
# challenge.zip:flag2026

# Unzip with the recovered password
unzip -P flag2026 challenge.zip
```

## Guidelines

- **Only crack hashes you own or are authorized to crack.** Possessing and cracking third-party hashes without permission is illegal in most jurisdictions.
- Always identify the hash format first — picking the wrong one wastes hours or produces silent miscracks.
- The "Jumbo" community build (`john-jumbo`) supports far more formats than upstream. Install via your distro or compile from source.
- Order of attacks: wordlist → wordlist+rules → mask (if you know the pattern) → incremental. Don't start with brute-force.
- Fast hashes (MD5, NTLM, SHA1) belong on hashcat with a GPU. JtR excels at slow hashes (bcrypt, sha512crypt, PBKDF2).
- Use `--fork=N` on multi-core systems; default JtR only uses one thread.
- Save partial work — JtR writes progress to `~/.john/john.rec` every minute. `john --restore` resumes.
- The `john.pot` file is your institutional memory. Back it up so you never crack the same hash twice.
