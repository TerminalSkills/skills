---
name: social-engineer-toolkit
description: >-
  Run authorized red team social engineering assessments with the Social
  Engineer Toolkit (SET). Use when a user asks to simulate a phishing
  campaign for security awareness training, clone a login page for a
  sanctioned exercise, or test an organization's human-layer defenses
  under a signed engagement.
license: Apache-2.0
compatibility: 'SET 8.x, Python 3.10+, Linux'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - social-engineer-toolkit
    - red-team
    - phishing-simulation
    - security-awareness
    - penetration-testing
---

# Social Engineer Toolkit (SET)

## Overview

SET is an open-source red-team framework by TrustedSec that automates the infrastructure side of authorized social engineering exercises: website cloning for credential-harvesting simulations, spear-phishing email staging, QR code generation, and payload delivery. It is strictly for engagements you have signed, scoped permission to run — typically security awareness programs, red team operations, and table-top exercises. Using SET outside of that scope is illegal and this skill does not support that.

## Instructions

### Step 1: Authorize, Scope, and Document First

Before touching SET:

1. A signed Rules of Engagement (ROE) covering: target email domains, target user list, permitted pretexts, start/end dates, escalation path.
2. Written authorization from the client/employer that includes an explicit "authorized to conduct simulated phishing, credential harvesting, and payload delivery" clause.
3. Pre-briefing for the security/IT/legal contacts and the incident response team (the few people who will NOT be told it's a drill).
4. Debrief plan: how results are shared, how captured credentials are handled, and how the victims receive training content afterward.

No ROE → no SET. Stop here.

### Step 2: Install SET in an Isolated Environment

```bash
# Preinstalled on Kali. Otherwise:
git clone https://github.com/trustedsec/social-engineer-toolkit.git set
cd set
sudo python3 setup.py install

# Run SET in a dedicated VM — never on a shared host
sudo setoolkit
```

### Step 3: Clone a Login Page for a Credential Harvest Simulation

```text
# From the SET main menu:
1) Social-Engineering Attacks
  → 2) Website Attack Vectors
    → 3) Credential Harvester Attack Method
      → 2) Site Cloner

# Prompts:
IP address for POST back in Harvester/Tabnabbing: 203.0.113.10  (your attacker VM, inside the ROE-approved range)
Enter the url to clone: https://login.acme-internal.com

# SET clones the page and listens on :80
# Collected credentials are written to:
/var/www/html/harvester_<timestamp>.txt
```

Operational notes:
- The landing domain must be one you own and is listed in the ROE (e.g., `acme-internal-login.example`).
- Credentials must be redacted in the final report. Store plaintext in a sealed, encrypted case folder and destroy after debrief.

### Step 4: Stage a Spear-Phishing Email Campaign

```text
From SET main menu:
1) Social-Engineering Attacks
  → 1) Spear-Phishing Attack Vectors
    → 1) Perform a Mass Email Attack

# Prompts walk you through:
#   Template or custom subject/body
#   Attacker sender profile (use authorized sending infrastructure only)
#   Target list (one email per line, must match the ROE scope)
#   SMTP server (your own authorized relay, never the client's)

# Template the body in a separate file so it goes through client review BEFORE sending.
```

SET's default templates are dated. Always write your own pretext, have it approved, and A/B the wording with your internal safety-review process before any target receives it.

### Step 5: Track, Debrief, and Clean Up

```bash
# Export results as you go
cp /var/www/html/harvester_*.txt cases/acme-2026-04/evidence/

# Stop SET listeners and tear down the VM when the window closes
# (Ctrl+C out of SET, then:)
sudo systemctl stop apache2 2>/dev/null
sudo shutdown -h now

# Metrics to report (not individual identification)
#   - click-through rate
#   - credential-submission rate
#   - report-to-security rate
#   - median time-to-report
```

Immediately after the window:
- Rotate any credentials that were actually submitted.
- Send every targeted user to a short training module (whether they fell for it or not).
- Publish anonymized metrics to leadership.

## Examples

### Example 1: Awareness Campaign for an Internal Team (Authorized)

```text
Scope (from ROE):
  Client:       Acme Corp
  Targets:      120 employees in the Finance department
  Window:       2026-04-15 to 2026-04-19
  Pretexts:     "mandatory benefits update" landing page
  Sending infra: mail.acme-awareness.example (owned by Acme security team)
  Landing URL:  acme-benefits-update.example (registered, HTTPS, under security)

Run:
  1) Draft pretext → legal & HR approve
  2) Clone https://benefits.acme.com with SET Site Cloner
  3) Send emails via authorized relay on the approved day
  4) Monitor harvester logs for clicks and submissions
  5) Auto-redirect submissions to a "You've been phished" training page
  6) Rotate any submitted credentials same day
  7) Debrief Finance leadership and publish metrics
```

### Example 2: Writing Your Own Landing Page Instead of the Stock Template

```bash
# SET's cloned pages are fine for training scenarios, but the pretext matters more
# than the HTML. Host a minimal, branded page on your own VM and point the ROE-
# approved domain at it:

mkdir -p /var/www/awareness && cd /var/www/awareness
# index.html: branded "Benefits Portal" mimic, with an action that POSTs to /collect
# collect.php: records {email, user-agent, click-time} to a local SQLite DB — NOT the password
cat > collect.php <<'PHP'
<?php
$db = new SQLite3('/var/www/awareness/clicks.db');
$db->exec('CREATE TABLE IF NOT EXISTS clicks (id INTEGER PRIMARY KEY, email TEXT, ua TEXT, t INTEGER)');
$stmt = $db->prepare('INSERT INTO clicks (email, ua, t) VALUES (?, ?, ?)');
$stmt->bindValue(1, $_POST['email'] ?? '');
$stmt->bindValue(2, $_SERVER['HTTP_USER_AGENT'] ?? '');
$stmt->bindValue(3, time());
$stmt->execute();
header('Location: /training/phished.html');
PHP

# For an awareness campaign you DO NOT need to capture passwords — clicks are enough.
# Treat credential collection as an extra privilege that must be separately authorized.
```

## Guidelines

- **ROE first, always.** No written authorization, no SET. This is the single rule that determines whether this work is lawful.
- Prefer click-tracking over credential-harvesting. Click-through and report-to-security are the real metrics; raw passwords add legal risk without improving outcomes.
- Never reuse client infrastructure to send simulated phishing. Use your own authorized domain and relay.
- Handle captured data as PII: encrypted at rest, access-logged, destroyed on a fixed timeline, never shared outside the engagement team.
- Debrief fast. Employees deserve training the same day they fall for a simulation, not weeks later.
- Exclude the IR/security team unless the ROE explicitly names them as in-scope — otherwise you are running a surprise drill on the people who defend the company, and you will get calls at 2 AM.
- Report metrics in aggregate. Naming individuals destroys the trust that makes future exercises useful.
- Modern alternatives to SET worth knowing: GoPhish (open source, better reporting), King Phisher, and commercial platforms (KnowBe4, Proofpoint) — SET is fine for labs and quick red team ops, but long-running awareness programs usually need one of those.
