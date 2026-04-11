---
title: "Run an Authorized Phishing Awareness Simulation"
slug: run-authorized-phishing-awareness-simulation
description: >-
  Design, execute, and debrief a security awareness phishing simulation under
  a signed rules-of-engagement agreement — from pretext approval and landing
  page cloning to measuring click-through and report-to-security rates,
  rotating any submitted credentials, and pushing every targeted employee
  into a training module the same day.
skills: [social-engineer-toolkit, kali-linux]
category: devops
tags: [security-awareness, phishing-simulation, red-team, training, human-risk]
---

# Run an Authorized Phishing Awareness Simulation

## The Problem

Most security programs train employees once a year with a 20-minute slideshow and then wonder why click-through rates on real phishing emails stay at 15%. Training without practice doesn't stick. What actually moves the needle is regular, realistic, scoped simulations — employees receive a plausible pretext, the ones who click land on a "you've been phished" page, and the ones who report it get credit. Six months later the click-through rate is 3% and the report-to-security rate is 60%.

Running this well is harder than it sounds. A sloppy simulation either lacks realism (nobody clicks, you learn nothing) or lacks governance (HR and legal find out you phished the entire company and your quarter ends badly). The failure mode that everyone warns new red teamers about is exactly the same: **no written authorization, no clean handling of collected data, no same-day training**. Get those three right and the simulation turns into a recurring program the business will actually fund. Get them wrong and you lose the mandate forever.

## The Solution

Use a **Kali Linux** VM as the operator workstation and the **Social Engineer Toolkit (SET)** to clone a landing page and stage the campaign against an approved target list. Treat the work as an engagement: a signed ROE, approved pretext, owned sending infrastructure, encrypted handling of any collected artifacts, and a same-day training redirect for anyone who clicks. The goal is not to catch people — it's to generate the click, the report, the training, and the metric. Done consistently over quarters, the metric trends in the right direction and the business has a human-risk number it can manage like any other risk.

## Step-by-Step Walkthrough

### Step 1: Get the ROE Signed Before Touching Any Tool

Nothing below this step happens without a signed rules-of-engagement document. The ROE names:

- **Scope**: which email domains and which target lists are in-bounds. No out-of-scope users, period.
- **Pretexts**: exact wording of permitted lures. Legal and HR sign off on the pretext, not just the operator.
- **Window**: start and end dates. Outside the window, you are not authorized.
- **Infrastructure**: sending domain, landing domain, hosting provider. All must be owned by you or the client — never the client's production relays, never a squatted domain.
- **Data handling**: where captured artifacts live, who can access them, how long they're retained, and when they're destroyed.
- **Safe list**: which security and IR contacts are told ahead of time (so you don't ambush the responders).
- **Escalation**: who gets called if something unexpected happens mid-campaign (e.g., a targeted user panics).

Save the signed ROE into the case directory before anything else touches disk.

```bash
mkdir -p ~/engagements/acme-q2-2026/{roe,pretext,evidence,metrics,report}
cp ~/Documents/acme-phish-roe-signed.pdf ~/engagements/acme-q2-2026/roe/
sha256sum ~/engagements/acme-q2-2026/roe/*.pdf > ~/engagements/acme-q2-2026/roe/hash.txt
```

### Step 2: Register Owned Infrastructure

```bash
# Sending relay: your own provider with SPF/DKIM/DMARC aligned to the sending domain
# Landing domain: registered and pointed at your operator VM. HTTPS required.
# Typical setup for an Acme awareness exercise:
#   Sending:  mail.acme-awareness.example
#   Landing:  https://benefits-portal.acme-hr.example

# Confirm DNS and TLS are valid before going live
dig +short mx acme-awareness.example
curl -I https://benefits-portal.acme-hr.example
# HTTP/2 200
```

### Step 3: Clone the Landing Page with SET

On an isolated Kali VM (snapshot first — you will restore after the window):

```bash
sudo setoolkit
```

```text
1) Social-Engineering Attacks
  → 2) Website Attack Vectors
    → 3) Credential Harvester Attack Method
      → 2) Site Cloner

IP address for POST back in Harvester/Tabnabbing: 10.20.30.40   (your operator VM)
Enter the url to clone: https://benefits.acme.com
```

SET clones the target page and starts an HTTP listener. For an awareness exercise you usually do **not** need to capture passwords — the click is what you're measuring. If the ROE does authorize credential capture, the submissions land in `/var/www/html/harvester_<timestamp>.txt`. Treat that file as sensitive PII from the moment it exists.

```bash
# Immediately move captured files out of the web root into an encrypted case folder
sudo mv /var/www/html/harvester_*.txt ~/engagements/acme-q2-2026/evidence/
sudo chmod 600 ~/engagements/acme-q2-2026/evidence/harvester_*.txt
```

### Step 4: Write the Pretext (and Have It Reviewed)

```text
Subject: [HR] Mandatory 2026 Benefits Update — Action Required by Friday
From: HR Benefits <hr-benefits@acme-awareness.example>

Hi {{first_name}},

Open enrollment for the 2026 benefits plan closes this Friday.
Please review and confirm your elections in the Benefits Portal:

  https://benefits-portal.acme-hr.example/enroll/{{tracking_id}}

If you've already completed your update, no action is needed.

Thanks,
Acme People Operations
```

The pretext must be signed off by the HR lead and a legal/privacy reviewer before it is sent. The `{{tracking_id}}` is unique per recipient so you can distinguish clicks without storing identifying data in the URL path.

### Step 5: Send the Campaign and Measure

Use a mail merge tool, a scripted sender, or SET's mass-email module — whichever the ROE allows. Keep the send rate low and steady (not a single burst) so you don't trip the organization's own anti-spam posture:

```bash
# Minimal Python sender using the approved relay (pseudo-code)
python3 send_campaign.py \
  --targets ~/engagements/acme-q2-2026/roe/targets.csv \
  --template ~/engagements/acme-q2-2026/pretext/body.html \
  --subject "[HR] Mandatory 2026 Benefits Update — Action Required by Friday" \
  --rate 10/min \
  --log ~/engagements/acme-q2-2026/evidence/sent.log
```

Four metrics to track (and only these four):

| Metric | What it measures |
|---|---|
| Send rate | Did every authorized target receive the email? |
| Click-through rate | How many people followed the link? |
| Credential submission rate | (If captured) how many entered credentials? |
| Report-to-security rate | How many people forwarded the email to the internal reporting mailbox? |

The last one is the real score. A program where clicks drop and reports rise is working.

### Step 6: Same-Day Training Redirect and Credential Rotation

Anyone who clicks must land on a training page the same day — no shame, short content, concrete "how to spot this next time" guidance. Implement this as a redirect on the landing VM:

```bash
# After the user POSTs (or the click is logged), redirect to the training page
cat > /var/www/html/training-redirect.php <<'PHP'
<?php
header('Location: https://learn.acme-awareness.example/phishing-101');
exit;
PHP
```

If the ROE permitted credential capture and anyone actually submitted, rotate those credentials with IT before the end of the day. Delete the raw captures on the agreed retention date.

### Step 7: Debrief and Report in Aggregate

```markdown
# Acme — Q2 2026 Phishing Awareness Simulation Report

- Targets in scope: 842
- Delivered: 842 (100%)
- Clicks: 67 (8.0%)    ← down from 11.2% last quarter
- Credential submissions: 14 (1.7%)   ← all rotated same day
- Reported to security: 301 (35.8%)   ← up from 22% last quarter
- Median time to first report: 4m 12s ← down from 18m

Findings
- Finance and Sales had higher click rates than Engineering (concentrate training there)
- Reporting rate climbed after the Q1 training refresh — keep cadence
- Two targets clicked within 60s of delivery — they get 1:1 training
```

Report anonymized numbers to leadership. Never name individuals in the report. The names matter only for the 1:1 training nudge.

### Step 8: Tear Down

```bash
# Stop SET, kill the landing site, destroy the operator VM image
sudo pkill -f setoolkit
sudo systemctl stop apache2
sudo shutdown -h now
# Restore the pre-engagement snapshot so the operator VM leaves no trace
```

## Real-World Example

Marcus runs security at a 900-person healthcare SaaS. Annual compliance training has plateaued at a 14% click-through rate on real phishing emails, and the board has asked him to show improvement. He builds a quarterly simulation program: signed ROE, pretext approved by HR and legal, owned sending and landing domains, and a 15-minute training module that every clicker sees the same day.

For Q2 he uses SET on a dedicated Kali VM to clone a benefits portal landing page and sends a mail merge from `acme-awareness.example` against all 842 employees. He does not capture credentials — just clicks and reports, to keep legal comfortable and reduce the blast radius if the operator VM is compromised. Results come in over 72 hours: 67 clicks, 301 reports, median time-to-report under 5 minutes. He rolls out a 1:1 nudge for the two people who clicked in under a minute and publishes anonymized numbers to leadership along with the click-rate trend line across the last four quarters.

By Q4 the click rate is down to 3.8% and the report-to-security rate is 61%. The IR team processes the forwarded reports through an automated triage pipeline and several of them turn out to be *real* phishing attempts that the reporting employees caught — because the simulations had trained them to look. The program pays for itself twice: once in human risk reduction and once in free intelligence from employees who are now an active sensor network.

## Related Skills

- [social-engineer-toolkit](../skills/social-engineer-toolkit/SKILL.md) — campaign staging, site cloning, mass email
- [kali-linux](../skills/kali-linux/SKILL.md) — disposable operator workstation
- [wireshark](../skills/wireshark/SKILL.md) — validate what the landing page is sending and receiving
