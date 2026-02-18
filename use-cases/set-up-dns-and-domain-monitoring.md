---
title: "Set Up Automated DNS and Domain Monitoring with AI"
slug: set-up-dns-and-domain-monitoring
description: "Monitor DNS records, domain expiration, SSL certificates, and propagation issues automatically."
skills: [coding-agent, n8n-workflow, report-generator]
category: devops
tags: [dns, domain, monitoring, ssl, infrastructure]
---

# Set Up Automated DNS and Domain Monitoring with AI

## The Problem

Jun's company manages 30+ domains across production services, marketing sites, and internal tools. DNS records get changed without documentation. Domains expire because renewal emails go to a former employee's inbox. SSL certificates lapse over a weekend. DNS propagation issues after a migration take hours to diagnose because nobody is sure what the records should be.

The worst part: you only find out when something breaks. A customer reports they cannot reach the site. Email stops working because someone deleted an MX record during an "unrelated" change. A staging subdomain still points to a decommissioned server, and an external security scanner flags it as a dangling DNS entry that could be hijacked -- a real security risk, not just a hygiene issue.

Last quarter, the company acquired a smaller company and inherited 12 additional domains. Nobody has a complete picture of all DNS records across both companies. Some of these domains still point to the acquired company's old infrastructure, which is being decommissioned next month.

## The Solution

Using the **coding-agent**, **n8n-workflow**, and **report-generator** skills, this walkthrough inventories all domains with their expected DNS state, sets up automated monitoring that catches drift and expiration, and produces weekly health reports so nothing slips through the cracks.

## Step-by-Step Walkthrough

### Step 1: Inventory All Domains and Define Expected State

The monitoring system needs a source of truth -- what should each DNS record be? Without this baseline, there is no way to detect unauthorized changes. Jun provides the domain list:

```text
Set up DNS monitoring for our domains. Here's the list:
- example.com -- production app, should have A record to 203.0.113.10
- api.example.com -- CNAME to our load balancer at lb.example.com
- mail.example.com -- MX records pointing to Google Workspace
- staging.example.com -- A record to 203.0.113.20
- docs.example.com -- CNAME to our-docs.netlify.app

Also monitor: domain expiration dates, SSL certificate expiry, and SPF/DKIM/DMARC records for email deliverability.
```

Four monitoring scripts get created, each handling a different aspect:

| Script | What It Checks |
|--------|---------------|
| `dns-checker.js` | Resolves all DNS records and compares against expected values |
| `ssl-checker.js` | Checks certificate expiry for all HTTPS endpoints |
| `domain-expiry.js` | Queries WHOIS for registration expiration dates |
| `email-auth.js` | Validates SPF, DKIM, and DMARC records |

The expected state for each domain gets stored in a JSON configuration file that serves as the single source of truth. When a legitimate change happens (migrating to a new load balancer, for example), the config file gets updated to reflect the new expected state. This prevents false alarms while still catching unexpected changes.

The config file also documents *why* each record exists -- something DNS zone files never capture. Six months from now, when someone asks "why does staging point to 203.0.113.20?" the config file has the answer, not tribal knowledge.

### Step 2: Run the Initial Scan

The first scan against all 40+ domains reveals problems that have been silently accumulating:

| Domain | DNS | SSL Expiry | Domain Expiry | Email Auth |
|--------|-----|-----------|---------------|------------|
| example.com | OK | 2026-08-14 | 2027-03-01 | SPF+DKIM valid |
| api.example.com | OK | 2026-08-14 | (subdomain) | N/A |
| mail.example.com | OK | N/A | (subdomain) | SPF+DKIM valid |
| staging.example.com | **DRIFT** | 2026-03-02 | (subdomain) | N/A |
| docs.example.com | OK | 2026-05-20 | (subdomain) | N/A |

Two issues surface immediately:

**DNS drift on staging:** The A record for `staging.example.com` points to `203.0.113.25` instead of the expected `203.0.113.20`. Someone changed it -- probably during a test -- and never changed it back. The staging environment has been hitting the wrong server for who knows how long. Developers have been reporting intermittent staging failures for weeks, and nobody connected it to a DNS change. This is a classic example of a problem that is obvious in hindsight but invisible without monitoring -- the symptoms (intermittent failures) point in completely the wrong direction (application bugs).

**SSL certificate expiring in 13 days:** The staging SSL certificate expires on March 2nd. Thirteen days away, and nobody knew. Staging does not get the same attention as production, but when it goes down, development grinds to a halt.

Across the full 40-domain scan, Jun finds even more buried problems: 3 domains from the acquired company have SSL certificates expiring within 2 weeks. One domain is 45 days from expiring entirely, with renewal emails going to a deactivated email address that belonged to the acquired company's former CTO. Two subdomains still point to servers that were decommissioned months ago -- dangling DNS entries waiting to be exploited.

### Step 3: Set Up Automated Alerts

Now that the expected state is defined, monitoring runs continuously:

```text
Create an n8n workflow that runs these checks every 6 hours and sends alerts to our Slack #ops channel when:
- Any DNS record doesn't match expected value
- SSL certificate expires within 30 days
- Domain expires within 60 days
- Email authentication records are missing or invalid
```

The n8n workflow definition includes scheduled triggers every 6 hours, DNS resolution and comparison logic for every domain, SSL and WHOIS checks, and Slack notification routing with appropriate urgency levels. The workflow JSON is ready to import into n8n directly.

The 6-hour interval is a deliberate choice. DNS changes propagate within minutes but their impact may not be noticed for hours. Checking every 6 hours provides fast enough detection to prevent customer impact (most DNS-related outages take hours to diagnose) without generating excessive API calls against DNS resolvers and WHOIS servers.

The workflow checks from multiple DNS resolver locations (Google DNS, Cloudflare, and a regional resolver) to catch propagation inconsistencies. A record that resolves correctly from one location but not another indicates a propagation issue that might only affect some users -- the hardest kind of problem to diagnose without monitoring.

Each alert includes the specific finding, the expected versus actual value, and a suggested action. A DNS drift alert does not just say "record changed" -- it says: "staging.example.com A record changed from 203.0.113.20 to 203.0.113.25. If this was intentional, update the expected state config. If not, revert the DNS change."

The email authentication checks are particularly valuable for the marketing team. SPF, DKIM, and DMARC records directly affect email deliverability -- if someone accidentally modifies an SPF record during a DNS migration, marketing emails start landing in spam folders. The monitoring catches this within 6 hours instead of waiting for someone to notice declining email open rates weeks later.

### Step 4: Handle the Acquired Company's Domains

The 12 domains from the acquisition need special attention. Jun runs a targeted audit:

```text
For the 12 acquired domains, check which ones have active traffic, which have DNS records pointing to infrastructure being decommissioned, and which have registration contacts that need to be updated to our accounts.
```

The audit reveals 4 domains with active customer traffic, 3 that are parked with no DNS records, and 5 with records pointing to the old company's AWS account that is being shut down next month. All 12 have WHOIS contacts pointing to email addresses at the acquired company's domain. The registrar contacts get updated immediately to prevent expiration -- everything else goes into the monitoring system with the correct expected state.

### Step 5: Generate Weekly Domain Health Reports

Alerts catch emergencies. Weekly reports catch slow-building problems and give Jun a single view of the entire domain portfolio:

```text
Every Monday, generate a domain health report summarizing the status of all domains, any changes detected in the past week, and upcoming expirations.
```

The weekly report includes:
- Full domain inventory status (green/yellow/red for each check)
- Any DNS changes detected in the past 7 days (with before/after values)
- SSL certificates expiring in the next 60 days
- Domain registrations expiring in the next 90 days
- Email deliverability status for all domains with MX records
- Action items ranked by urgency

The report posts to Slack every Monday morning. Jun reviews it in 5 minutes and either takes action or moves on with confidence. No more relying on memory, calendar reminders, or hoping that the right person gets the renewal email.

The report format is designed for quick scanning. Domains with all-green status collapse into a single "40 domains healthy" line. Only domains with warnings or action items are expanded with details. This keeps the Monday report from becoming a wall of text that nobody reads -- it shows exactly what needs attention and nothing else.

## Real-World Example

The monitoring pays for itself the following week. A developer is configuring a test environment and accidentally updates the production CNAME for `api.example.com` instead of the staging record. The automated check runs 30 minutes later, detects the DNS drift, and fires a Slack alert: "api.example.com CNAME changed from lb.example.com to test-lb.example.com."

Jun reverts the change before any customer notices. Without monitoring, the team would have discovered this when API calls started failing -- probably during peak traffic, probably after 30 minutes of debugging whether the issue was in the application code, the load balancer, or the DNS layer.

Over the following quarter, the monitoring catches 2 more accidental DNS changes, auto-alerts on 4 SSL certificates approaching expiration (all renewed during business hours instead of over a weekend), and flags the acquired company's domain that was 45 days from expiring with no valid renewal contact. That domain hosted a critical OAuth callback URL -- losing it would have broken authentication for hundreds of users of the acquired product.

The CEO stops getting surprised by domain expiration notices. Jun has confidence that the 40-domain portfolio is under control. And when the acquired company's old infrastructure gets decommissioned, the weekly report clearly shows which subdomains still point to it and need to be updated -- no last-minute scramble, no missed records.

The total setup took a few hours. The monitoring runs itself. The alternative -- discovering DNS problems from customer complaints and security scanners -- costs orders of magnitude more in engineering time, customer trust, and stress.
