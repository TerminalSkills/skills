---
title: "Automate Server Setup and App Deployment with Ansible"
slug: automate-server-setup-with-ansible
description: "Replace manual SSH server configuration with Ansible playbooks and roles that provision, harden, and deploy applications across any number of servers reproducibly."
skills: [ansible, security-audit, coding-agent]
category: devops
tags: [ansible, configuration-management, server-setup, deployment, automation]
---

# Automate Server Setup and App Deployment with Ansible

## The Problem

A team manages 12 servers across staging and production. Every new server takes a full day to set up: install packages, configure nginx, set up SSL, create users, configure firewall, deploy the app, set up monitoring. The process lives in a 47-step wiki page that is always outdated — step 23 references a package that was renamed two years ago, and step 31 was added by someone who left and nobody knows why it's there.

Servers drift over time. Someone installs a package on one server and forgets the others. Someone tweaks an nginx config directly in production "just this once" — then forgets to update the wiki, so the next server gets set up differently. Last month a security patch was applied to 10 of 12 servers; the two missed ones got compromised. Scaling means another day of manual setup per server, and there's no guarantee the new server matches the existing ones. The team is afraid to add capacity during traffic spikes because provisioning takes too long.

## The Solution

Using **ansible** to write playbooks and roles that automate the entire server lifecycle, **security-audit** to define hardening standards as code, and **coding-agent** to build custom Ansible modules for app-specific deployment logic, the entire 47-step wiki page becomes executable code that runs in 8 minutes and produces identical results every time.

## Step-by-Step Walkthrough

### Step 1: Audit Current Servers and Create an Inventory

The first step isn't writing Ansible roles — it's understanding the current state. Every server has drifted in its own direction over months of manual changes, and nobody has a clear picture of the differences:

```text
We have 12 Ubuntu 22.04 servers: 6 web servers, 2 API servers, 2 PostgreSQL
(primary + replica), 1 Redis, 1 worker. They're on Hetzner Cloud with
private networking. SSH access via deploy user with key auth.

Create an Ansible inventory with proper groups and group_vars. Scan all
servers to document what's currently installed, running services, open
ports, and user accounts. Produce a drift report showing differences
between servers that should be identical.
```

The audit playbook runs across all 12 servers using `ansible.builtin.setup` and `ansible.builtin.shell` to collect installed packages, running services, open ports, and user accounts. The structured inventory organizes hosts into groups (`web`, `api`, `postgres`, `redis`, `worker`) with group-specific variables.

The drift report is the eye-opener: **23 differences** across servers that should be identical:

- Three web servers have different nginx versions — 1.18.0, 1.22.0, and 1.24.0. The oldest version has known vulnerabilities.
- Two servers are missing the critical security patch from last month. These are the same two that got compromised.
- One server has an unauthorized user account that nobody recognizes — `dev_temp`, created three months ago, with sudo access.

That last finding turns a routine audit into an urgent security conversation. The user account gets locked immediately, and the audit becomes the catalyst for doing server management properly.

### Step 2: Write Roles for Base Server Configuration

```text
Create Ansible roles for our standard server setup:
1. common — deploy user, SSH hardening, UFW firewall, unattended security
   updates, NTP, log rotation, fail2ban
2. nginx — install, configure sites, SSL via Let's Encrypt, security headers
3. nodejs — Node.js 20 via nvm, PM2 process management, systemd service
4. postgresql — PostgreSQL 16 with streaming replication, automated backups
5. monitoring — node_exporter for Prometheus, log shipping

Each role should be idempotent and tested with Molecule.
```

Five complete roles get generated, each with tasks, handlers, templates, defaults, and Molecule tests:

**common** — Hardens SSH (disables root login, disables password auth, restricts to key-based access only), configures UFW with group-specific port rules (web servers open 80/443, postgres opens 5432 only on the private network, everything else denied by default), sets up fail2ban with custom jail configs (5 failed attempts = 1 hour ban), and enables unattended-upgrades for security patches. Every setting that was a manual step on the wiki is now a variable in `defaults/main.yml` that can be overridden per group or per host.

**nginx** — Sites configured from variables, so adding a new domain is a 3-line change in `group_vars` instead of SSH-ing into 6 servers and editing config files. Let's Encrypt certificates auto-renew via a systemd timer. Security headers (HSTS, X-Frame-Options, Content-Security-Policy) are in the template by default — no more forgetting to add them on new sites.

**nodejs** — Node.js 20 via nvm, PM2 for process management with a systemd service for automatic restart on reboot, and log rotation for app logs that prevents disks from filling up. The PM2 ecosystem config is templated from variables, so memory limits and instance counts are defined in the inventory, not scattered across server configs.

**postgresql** — PostgreSQL 16 with streaming replication configured between primary and replica. `pg_hba.conf` generated from variables, so access rules are visible in the repo instead of hidden on the server. Automated daily backups to S3 with a 30-day retention policy and a restore script that's tested monthly.

**monitoring** — `node_exporter` for Prometheus metrics, log shipping to centralized logging. Every server is observable from day one — no more "we forgot to set up monitoring on that server."

Each role is idempotent — running it twice produces the same result, so applying it to fix drift never creates new problems. Molecule tests verify this in Docker before anything touches a real server.

### Step 3: Create the Deployment Playbook with Rolling Updates

```text
Write a deployment playbook for our Node.js API that deploys 2 servers at
a time, drains connections from the load balancer, runs migrations once,
does zero-downtime PM2 reload, health checks, and rolls back on failure.
Usage: ansible-playbook deploy.yml -e version=v1.2.3
```

The deployment playbook uses `serial: 2` so only two servers update at a time — the other four keep serving traffic. The sequence for each batch:

1. **Drain** — Remove the server from the Hetzner load balancer via API. Wait for in-flight requests to complete (30-second grace period).
2. **Deploy** — Git checkout of the specified tag, `npm ci --production`, PM2 zero-downtime reload
3. **Migrate** — Database migrations run with `run_once: true` on the first server in the first batch only. No duplicate migrations, no ordering issues.
4. **Health check** — Hit `/health` with 10 retries at 3-second intervals, waiting for HTTP 200. The health endpoint checks database connectivity and Redis availability, not just "the process is running."
5. **Restore** — Add the server back to the load balancer

If the health check fails, a `rescue` block rolls back that server (checkout the previous tag, restart PM2) and stops the entire deploy. Slack gets notified with the error details. The remaining servers never get touched, so a bad release affects at most 2 of 6 web servers — and even those get rolled back automatically within 30 seconds of the health check failing.

### Step 4: Encrypt Secrets with Ansible Vault

```text
Set up Ansible Vault for database passwords, API keys, SSL private keys,
and the Hetzner API token. Each environment gets its own vault file.
Vault variables use the vault_ prefix and are referenced in group_vars.
CI/CD can decrypt using an environment variable.
```

The secrets structure follows best practice:

- `group_vars/production/vault.yml` and `group_vars/staging/vault.yml` — each environment isolated, so staging credentials can't accidentally reach production
- All sensitive variables prefixed with `vault_` and referenced in plain-text group_vars (e.g., `db_password: "{{ vault_db_password }}"`) so anyone can see what's configured without decrypting the vault
- `.vault_pass` file excluded from git, with `ansible.cfg` pointing to it for local development
- CI/CD pipeline examples showing how to pass the vault password via `ANSIBLE_VAULT_PASSWORD` environment variable

No more passwords in plaintext wiki pages, shared Slack messages, or sticky notes on monitors. Every secret is encrypted at rest, decrypted only at deploy time, and the vault structure makes it immediately clear which secrets exist and which environments they belong to — even without decryption access.

### Step 5: Set Up CI/CD and Drift Detection

The playbooks and roles are only useful if they're tested before deployment and enforced continuously. Without CI, a broken role reaches production. Without drift detection, manual changes accumulate silently until something breaks.

```text
Create a GitHub Actions pipeline for PR linting, staging auto-deploy on
merge, production deploy on release tag with manual approval, and weekly
drift detection against production.
```

Four workflows cover the full lifecycle:

- **On PR** — `ansible-lint` and Molecule tests for all changed roles. Catches misconfigurations before they merge. A broken handler reference or a missing variable gets caught in CI, not on a production server at 2 AM.
- **On merge to main** — Automatic deployment to staging. Every merge is live in staging within minutes, giving the team continuous confidence that the code works.
- **On release tag** — Production deployment with GitHub environment protection rules. Requires manual approval from an ops engineer — the human confirms the tag, Ansible handles the rest.
- **Every Sunday at 2 AM** — Full `site.yml` in `--check --diff` mode against production. The output gets parsed for changes, and any drift is posted to Slack. A teammate's manual nginx config change gets caught within 7 days instead of drifting silently for months.

A monthly security audit playbook also runs, checking for outdated packages, expired SSL certificates, unauthorized SSH keys, and ports that shouldn't be open. The compliance report goes to the team lead with specific remediation steps for each finding.

## Real-World Example

An ops engineer at a 20-person company manages 12 servers manually. New server setup takes a full day, 2 servers were missed during a critical security patch (and got compromised), and the 47-step wiki is always out of date. The audit reveals the unauthorized `dev_temp` user account, and the security conversation becomes the catalyst for doing this properly.

Five Ansible roles codify the entire server setup. New servers go from bare metal to production-ready in 8 minutes instead of 8 hours — and every new server is guaranteed identical to the existing ones. Rolling deployment with health checks eliminates failed deploys — the rescue block catches a bad release in its first week, rolling back before it reaches more than 2 servers. Without the automated rollback, that release would have caused a 20-minute outage.

Weekly drift detection catches a teammate's manual nginx config change within 7 days — and instead of a blame conversation, the fix is a one-line change to `group_vars` that deploys consistently to all 6 web servers. After 2 months: zero configuration drift, the unauthorized user account is long gone, and the wiki gets archived with a note pointing to the Ansible repo. The infrastructure is finally self-documenting — `git log` tells you exactly what changed, when, and why.
