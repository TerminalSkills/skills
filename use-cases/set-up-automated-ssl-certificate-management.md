---
title: "Set Up Automated SSL Certificate Management with AI"
slug: set-up-automated-ssl-certificate-management
description: "Automate SSL certificate monitoring, renewal, and deployment to prevent expiration-related outages."
skills: [cicd-pipeline, coding-agent, n8n-workflow]
category: devops
tags: [ssl, certificates, automation, tls, security]
---

# Set Up Automated SSL Certificate Management with AI

## The Problem

Nina's 15-person engineering team manages 24 SSL certificates across production services, staging environments, API endpoints, and internal tools. Renewals happen manually -- someone gets a calendar reminder, logs into the provider, generates a new cert, and deploys it across the relevant servers. The process works fine until it doesn't.

Last quarter, a wildcard certificate expired on a Saturday night. The API and three customer-facing services went dark for two hours before the on-call engineer even figured out the cause -- nobody suspects SSL first. The error messages were misleading: clients saw "connection refused" and "ERR_CERT_DATE_INVALID," and the initial debugging went down the wrong path entirely, checking load balancer health and DNS resolution before someone finally ran `openssl s_client` and saw the expired certificate.

Two other certificates came within 30 days of each other the following month, creating a stressful scramble. And the worst part: there is no central inventory. Nobody knows which certificates protect which services, when they expire, or who is responsible for renewing them. The knowledge lives in calendar reminders on different people's accounts, some of which belong to engineers who have left the company.

## The Solution

Using the **coding-agent**, **cicd-pipeline**, and **n8n-workflow** skills, this walkthrough builds a complete certificate lifecycle system: a full inventory of all 24 certificates, tiered monitoring with Slack alerts, automated Let's Encrypt renewals, and CI/CD gates that block deploys to hosts with expiring certs.

## Step-by-Step Walkthrough

### Step 1: Discover and Catalog Every Certificate

First, Nina needs to know what she's working with. A manual audit would mean connecting to each server, checking each virtual host, and documenting the certificate details. Instead:

```text
Scan all our domains and subdomains, check the SSL certificates on each, and create an inventory. Include: domain, issuer, expiration date, days until expiry, certificate type (single, wildcard, SAN), and which services use it.
```

The scan comes back with two immediate fires:

**Critical (expires within 30 days):**

| Domain | Expires | Days Left | Used By |
|--------|---------|-----------|---------|
| `*.api.example.com` | Mar 12, 2026 | 23 | API gateway, webhooks |
| `admin.example.com` | Mar 08, 2026 | 19 | Admin panel |

**Upcoming (expires within 90 days):**

| Domain | Expires | Days Left | Used By |
|--------|---------|-----------|---------|
| `app.example.com` | Apr 28, 2026 | 70 | Main web app |
| `docs.example.com` | May 03, 2026 | 75 | Documentation site |

The remaining 20 certificates have 90-365 days remaining. The full inventory lands in `ssl-inventory.json` -- the first time anyone has had a complete picture. The inventory also captures which issuer provided each certificate (Let's Encrypt, DigiCert, etc.), which matters for the renewal automation in the next step.

Before this scan, Nina assumed the two critical certificates were fine because nobody had complained. The wildcard cert for `*.api.example.com` serves not just the main API but also webhook endpoints and internal service-to-service calls. If it had expired, the blast radius would have been far wider than the Saturday night incident -- every microservice that communicates over HTTPS would have failed.

### Step 2: Set Up Tiered Monitoring with Slack Alerts

An inventory is only useful if someone is watching it. Nina sets up daily monitoring with escalating urgency:

```text
Create a monitoring system that checks certificate expiration daily, alerts at 60/30/14/7 days, and sends notifications to Slack with renewal instructions.
```

The monitoring pipeline runs at 6:00 AM UTC every day, checking all 24 endpoints against five alert thresholds:

| Days Until Expiry | Severity | Action |
|-------------------|----------|--------|
| 60 days | Info | Message to `#infrastructure` channel |
| 30 days | Warning | Renewal instructions included |
| 14 days | Urgent | Tags `@oncall` |
| 7 days | Critical | Tags `@engineering-lead` |
| Expired | P0 Incident | Rollback steps and incident escalation |

Two files drive this. The monitoring script connects to each domain, reads the certificate, and compares the expiration date:

```bash
# scripts/check-ssl-certs.sh (core check logic)
for domain in $(jq -r '.[].domain' ssl-inventory.json); do
  expiry=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null \
    | openssl x509 -noout -enddate | cut -d= -f2)
  days_left=$(( ($(date -d "$expiry" +%s) - $(date +%s)) / 86400 ))
  echo "$domain: $days_left days remaining"
done
```

The n8n workflow (`ssl-monitoring-workflow.json`) orchestrates the schedule, threshold logic, and Slack routing.

The monitoring checks more than just expiration. It also verifies the certificate chain is complete (missing intermediates cause hard-to-diagnose failures in some browsers), confirms the certificate matches the domain it is serving, and flags any certificates using deprecated signature algorithms.

### Step 3: Automate Let's Encrypt Renewals

Of the 24 certificates, 18 come from Let's Encrypt -- and those can be fully automated. No more calendar reminders, no more manual renewals:

```text
Set up auto-renewal for all Let's Encrypt certificates. Use certbot with DNS challenge for wildcard certs and HTTP challenge for single-domain certs. Deploy renewed certs automatically and reload the affected services.
```

The renewal pipeline handles everything end-to-end:

1. Certbot checks renewal eligibility 30 days before expiry
2. DNS or HTTP challenge completes automatically (DNS for wildcards, HTTP for single-domain)
3. New certificate deploys to target servers via SCP
4. Nginx and service reload triggers on affected hosts
5. Post-renewal verification runs a TLS handshake test against the live endpoint
6. Slack notification confirms renewal with the new expiration date

The whole thing runs daily at 3:00 AM UTC via cron. Most days nothing happens -- certbot checks eligibility and moves on. When a certificate is within 30 days of expiry, renewal fires automatically.

The post-renewal verification step is critical and often overlooked. Without it, a common failure mode goes undetected: certbot successfully renews the certificate and writes it to disk, but the deployment step fails silently (SSH key expired, target server unreachable, wrong file path). The renewed certificate sits on the certbot server while the old one continues expiring in production. The TLS handshake test after deployment catches this immediately.

The remaining 6 certificates are purchased from a vendor (DigiCert) and cannot be auto-renewed through certbot. These protect services that require Extended Validation (EV) or Organization Validation (OV) certificates for compliance reasons. For those, the monitoring system sends renewal reminders 60 days before expiry with step-by-step instructions -- which provider portal to log into, which certificate type to reissue, which CSR to generate, and which servers need the new cert deployed -- so whoever picks it up knows exactly what to do without prior knowledge of the process.

Each vendor certificate also has a designated owner in the inventory. No more "I thought someone else was handling that" situations.

### Step 4: Add Certificate Checks to the CI/CD Pipeline

The last piece prevents deployments from going out to hosts with bad certificates. This catches the exact scenario that burned Nina before -- a deploy going out fine, but the cert expiring over the weekend with nobody watching.

**Pre-deploy checks:**
- Verify the target domain's certificate is valid and not expiring within 7 days
- Fail the deployment if the certificate is expired or missing
- Warn (but allow) if the certificate expires within 30 days

**Post-deploy checks:**
- Verify TLS handshake succeeds on the deployed service
- Confirm the certificate chain is complete (no missing intermediates)
- Validate HSTS headers are present

The pre-deploy check is the more important one. A developer pushing a Friday afternoon deploy to a host whose certificate expires Sunday will get a clear pipeline failure: "Deployment blocked: SSL certificate for api.example.com expires in 2 days. Renew before deploying." This turns a potential weekend outage into a 5-minute fix during business hours.

The post-deploy chain validation catches a subtler issue: missing intermediate certificates. A server might have a valid leaf certificate, but if the intermediate CA certificate is not included in the chain, some browsers and HTTP clients will reject the connection. This problem is invisible in Chrome (which has its own intermediate cache) but breaks API calls from other services, mobile apps, and command-line tools. The chain check catches this before it reaches customers.

## Real-World Example

Three months after setting everything up, Nina checks the numbers. Twelve certificates have auto-renewed without any human intervention. The two critical ones from the initial scan -- `*.api.example.com` and `admin.example.com` -- renewed themselves a week before their deadlines. The team hasn't had a single certificate-related incident.

The Saturday night scramble is gone. The monitoring caught one close call -- a vendor certificate that was 14 days from expiry with no renewal in progress -- and the Slack alert gave the team two full weeks to handle it during business hours instead of at 2 AM. The CI/CD gate blocked one deployment to a staging server whose certificate had expired without anyone noticing.

The total setup took an afternoon. The first outage it prevented would have cost more in customer trust and engineering time than the entire effort to build it. And unlike the old calendar-reminder system, it does not depend on any single person being available -- the automation runs whether Nina is on vacation, asleep, or interviewing for her next role.

Certificate management went from the team's most common source of preventable outages to a non-issue. The last time anyone thought about SSL was when the Slack bot confirmed a renewal -- and even that took only a glance.
