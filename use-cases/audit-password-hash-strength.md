---
title: "Audit the Password Hash Strength of Your Own Systems"
slug: audit-password-hash-strength
description: >-
  Export password hashes from your own systems — Linux /etc/shadow, Active
  Directory NTDS.dit, application databases — and run a controlled offline
  cracking audit with John the Ripper and hashcat to identify weak passwords,
  measure the hash algorithm's real-world strength, and drive targeted
  password rotation or policy changes.
skills: [john-the-ripper, hashcat, kali-linux]
category: devops
tags: [password-audit, credential-hygiene, offline-cracking, hash-analysis, security]
---

# Audit the Password Hash Strength of Your Own Systems

## The Problem

Password policies are written in theory ("at least 12 characters, 1 symbol") and broken in practice ("Summer2026!"). The only way to know whether your user population is actually following the intent of the policy is to take the hashes they produced, feed them into a real cracker, and see which ones fall. And the only way to know whether the *hash algorithm* you picked is buying you real runway is to benchmark it against a modern GPU on your own hardware. Both questions have clean, concrete answers — but only if you're willing to run an offline cracking audit against data you're authorized to touch.

Every engineer knows "use bcrypt, not MD5" as a slogan. What they usually don't know is: given a 14-card GPU rig, how many bcrypt rounds per second does it actually do against *my* cost factor? How many of my 2000 user hashes fall to rockyou+best64 in a 30-minute run? Which service accounts are using default passwords that were rotated once three years ago and never since? The answers drive very different actions (bump the cost factor, rotate 17 specific accounts, kill the legacy NTLM path) and none of them show up in a compliance checklist.

## The Solution

Work inside an authorized scope. Export hashes from systems you own into a controlled case directory, run **John the Ripper** for slow hashes and format handling, **hashcat** for GPU throughput on fast hashes, and both together with layered attacks: straight dictionary → rules → targeted wordlists → masks. Report aggregate metrics and the specific accounts that need action — never plaintext passwords in Slack. The audit happens on a **Kali** analysis VM that gets snapshotted before and wiped after, with the pot files backed up to the engagement folder for long-term institutional memory.

## Step-by-Step Walkthrough

### Step 1: Authorize and Scope the Audit

The audit needs a written go-ahead signed by the owner of the system whose hashes you are about to crack. For internal audits that usually means the CISO plus the system owner (AD admin, DBA, platform lead). The scope document names:

- Which systems' hashes are in scope (AD, Linux fleet, a specific app DB).
- What happens to the plaintexts that get recovered (who sees them, how long they live, how they are destroyed).
- Who receives the final report and in what format.
- When the audit runs (outside of business hours, inside a change window).

Without that document, this is not a password audit; it's a crime. Stop here.

### Step 2: Stand Up an Isolated Analysis Environment

```bash
# Dedicated Kali VM, snapshot, no network access except pulling the hashes
VBoxManage snapshot "kali-audit" take "pre-password-audit-2026-04-11"

# Case directory — encrypted at rest on the host
mkdir -p ~/audits/acme-2026-04-11/{hashes,wordlists,pot,report}
cd ~/audits/acme-2026-04-11

# Tooling
sudo apt install -y john hashcat seclists
```

### Step 3: Export Hashes from Each In-Scope System

```bash
# Linux host — /etc/shadow (on the system, by the system owner)
sudo unshadow /etc/passwd /etc/shadow > ~/audits/acme-2026-04-11/hashes/linux-web01.shadow

# Active Directory — via a secretsdump run authorized by the AD owner
# (run on a sanctioned jump host, with Domain Admin approval, inside the window)
impacket-secretsdump -ntds ntds.dit -system SYSTEM LOCAL \
  -outputfile ~/audits/acme-2026-04-11/hashes/ad
ls ~/audits/acme-2026-04-11/hashes/
# ad.ntds            -> NTLM hashes (LM should be blank)
# ad.ntds.kerberos   -> Kerberos keys
# linux-web01.shadow -> sha512crypt

# App database — your own app, you own the schema
# Extract the hash column into a one-per-line file
psql -h db -U auditor acmeprod -c "COPY (SELECT id || ':' || password_hash FROM users) TO STDOUT" \
  > ~/audits/acme-2026-04-11/hashes/app-users.hash
```

Hash the input files and log their counts:

```bash
sha256sum hashes/*.hash hashes/*.shadow hashes/ad.ntds > hashes/inputs.sha256
wc -l hashes/*
# 2187 hashes/ad.ntds
#  412 hashes/app-users.hash
#   54 hashes/linux-web01.shadow
```

### Step 4: Run John the Ripper for Format Detection and Slow Hashes

John excels at slow hashes (sha512crypt, bcrypt, PBKDF2) and at surfacing format issues fast:

```bash
# Let JtR detect the format on the Linux shadow export
john --format=sha512crypt --fork=8 \
  --wordlist=/usr/share/wordlists/rockyou.txt \
  --rules=Jumbo \
  --pot=pot/linux.pot \
  hashes/linux-web01.shadow

# Show recovered
john --pot=pot/linux.pot --show hashes/linux-web01.shadow
# root:CorrectHorse2024:0:0:root:/root:/bin/bash     <-- oops

# For the bcrypt app hashes — benchmark first
john --test --format=bcrypt
# Benchmarking: bcrypt ("$2a$05" or "$2a$10")
# Speed for cost 1 (iteration count) of 1024 ... 19720 c/s real, 2570 c/s virtual

# Then run the actual crack
john --format=bcrypt --fork=8 \
  --wordlist=/usr/share/wordlists/rockyou.txt \
  --rules=Jumbo \
  --max-run-time=7200 \
  --pot=pot/app.pot \
  hashes/app-users.hash
```

### Step 5: Move Fast Hashes to Hashcat on a GPU

```bash
# NTLM (mode 1000) — fast hash, perfect for GPU
# Extract just the hash column from the secretsdump file
awk -F: '{print $4}' hashes/ad.ntds > hashes/ad-ntlm.txt

# Layered attack: dictionary → rules → targeted → mask
hashcat -m 1000 hashes/ad-ntlm.txt \
  /usr/share/wordlists/rockyou.txt \
  --session ad-1 --potfile-path pot/ad.pot -w 3 \
  -o cracked/ad-stage1.txt

hashcat -m 1000 hashes/ad-ntlm.txt \
  /usr/share/wordlists/rockyou.txt \
  -r /usr/share/hashcat/rules/best64.rule \
  --session ad-2 --potfile-path pot/ad.pot -w 3

# Targeted company wordlist — seasons, product names, years, common suffixes
cewl -d 2 -m 5 https://acme.com > wordlists/acme-cewl.txt
hashcat -m 1000 hashes/ad-ntlm.txt wordlists/acme-cewl.txt \
  -r /usr/share/hashcat/rules/OneRuleToRuleThemAll.rule \
  --session ad-3 --potfile-path pot/ad.pot -w 3

# 8-char mask as the final sweep
hashcat -m 1000 hashes/ad-ntlm.txt -a 3 '?u?l?l?l?l?l?d?d' \
  --session ad-4 --potfile-path pot/ad.pot -w 3

# Show recovered
hashcat -m 1000 hashes/ad-ntlm.txt --potfile-path pot/ad.pot --show \
  > cracked/ad-recovered.txt
wc -l cracked/ad-recovered.txt
# 214 hashes/ad-ntlm.txt
# 214 of 2187 cracked (9.8%)
```

### Step 6: Turn Results into a Report — Never into Plaintexts on Slack

```bash
# Aggregate metrics
python3 - <<'PY' > report/summary.md
import collections, re
cracked = open('cracked/ad-recovered.txt').read().strip().splitlines()
totals = 2187
lengths = collections.Counter(len(line.split(':', 1)[1]) for line in cracked)
patterns = collections.Counter()
for line in cracked:
    pw = line.split(':', 1)[1]
    if re.match(r'[A-Z][a-z]+\d+!?$', pw): patterns['Capitalized+digits'] += 1
    if re.search(r'(spring|summer|fall|winter)\d{2,4}', pw, re.I): patterns['Season+year'] += 1
    if 'acme' in pw.lower(): patterns['Contains company name'] += 1
print(f"# AD Password Audit — 2026-04-11")
print(f"- Hashes in scope: {totals}")
print(f"- Cracked: {len(cracked)} ({len(cracked)*100/totals:.1f}%)")
print(f"\n## Length distribution of cracked passwords")
for k in sorted(lengths): print(f"- {k} chars: {lengths[k]}")
print(f"\n## Common patterns")
for k, v in patterns.most_common(): print(f"- {k}: {v}")
PY
cat report/summary.md
```

Include in the report:
- Total hashes in scope and percentage cracked.
- Length and pattern distributions of the cracked subset.
- List of accounts that need rotation (by username, not by plaintext).
- Recommended policy change (e.g., "ban top 10k seasonal patterns", "raise bcrypt cost from 10 to 12").
- Benchmark numbers for the hash algorithm on your hardware.

### Step 7: Rotate, Tear Down, and Preserve the Pot File

```bash
# Hand the rotation list to the AD owner — usernames only
awk -F: '{print $1}' cracked/ad-recovered.txt > report/rotate-me.txt

# Archive pot files to the long-term engagement vault (encrypted)
tar czf acme-2026-04-11.tar.gz pot/ report/ hashes/inputs.sha256
gpg --encrypt --recipient security-team@acme.com acme-2026-04-11.tar.gz

# Wipe plaintexts from the analysis VM
shred -u cracked/*.txt
# Restore the snapshot — nothing sensitive survives on the VM
VBoxManage snapshot "kali-audit" restore "pre-password-audit-2026-04-11"
```

## Real-World Example

Helena is the platform security lead at a 600-person SaaS. The company uses bcrypt cost 10 for application passwords and NTLM-backed Active Directory for SSO. She's signed off a quarterly password audit with the CISO and the AD owner. On audit day she pulls a `secretsdump` of the AD NTDS and a read-only export of the `users` table from the application database into her locked-down Kali VM, which has no internet connectivity except through the audit egress point.

John the Ripper makes a first pass at the 412 bcrypt hashes with rockyou+Jumbo rules over two hours — 11 fall, all of them reused by service accounts that were created years ago and never rotated. Hashcat starts on the 2187 NTLM hashes in parallel on the two-GPU analysis box. By the end of the audit window: 214 NTLM hashes cracked (9.8%), 11 bcrypt (2.7%). The bcrypt benchmark on her rig comes in at 19,700 candidates per second, which means the attacker expected-effort against rockyou with rules is about 12 hours — borderline. She recommends bumping cost from 10 to 12 in the next release, which costs the app ~80ms per login but quadruples the cracking time.

The AD report names 214 accounts for rotation and flags three patterns (season+year, company name+year, `<FirstName>123!`) for addition to the banned-password list. Helena hands rotation over to the AD owner, destroys the plaintexts on the analysis VM, and stores the encrypted pot archive in the audit vault so the next audit can compare directly and track whether the banned-pattern list is actually reducing reuse. Three months later the next audit comes in at 3.1% — the policy change worked.

## Related Skills

- [john-the-ripper](../skills/john-the-ripper/SKILL.md) — slow-hash cracking, format detection, *2john helpers
- [hashcat](../skills/hashcat/SKILL.md) — GPU-accelerated cracking with layered attacks
- [kali-linux](../skills/kali-linux/SKILL.md) — disposable, snapshotted analysis environment
