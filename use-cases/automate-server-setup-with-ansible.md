---
title: "Automate Server Setup and App Deployment with Ansible"
slug: automate-server-setup-with-ansible
description: "Replace manual SSH server configuration with Ansible playbooks and roles that provision, harden, and deploy applications across any number of servers reproducibly."
skills: [ansible-automation, security-audit, coding-agent]
category: devops
tags: [ansible, configuration-management, server-setup, deployment, automation]
---

# Automate Server Setup and App Deployment with Ansible

## The Problem

A team manages 12 servers across staging and production. Every new server takes a full day to set up: install packages, configure nginx, set up SSL, create users, configure firewall, deploy the app, set up monitoring. The process lives in a 47-step wiki page that is always outdated. Servers drift over time — someone installs a package on one server and forgets the others. Last month a security patch was applied to 10 of 12 servers; the two missed ones got compromised. Scaling means another day of manual setup per server.

## The Solution

Use `ansible-automation` to write playbooks and roles that automate the entire server lifecycle, `security-audit` to define hardening standards as code, and `coding-agent` to build custom Ansible modules for app-specific deployment logic.

```bash
npx terminal-skills install ansible-automation security-audit coding-agent
```

## Step-by-Step Walkthrough

### 1. Audit current servers and create inventory

```
We have 12 Ubuntu 22.04 servers: 6 web servers, 2 API servers, 2 PostgreSQL
(primary + replica), 1 Redis, 1 worker. They're on Hetzner Cloud with
private networking. SSH access via deploy user with key auth.

Create an Ansible inventory with proper groups and group_vars. Scan all
servers to document what's currently installed, running services, open
ports, and user accounts. Produce a drift report showing differences
between servers that should be identical.
```

The agent creates a structured inventory with host groups, writes an audit playbook using `ansible.builtin.setup` and `ansible.builtin.shell` to collect installed packages, running services, open ports, and user accounts from all 12 servers, then produces a drift report highlighting 23 differences: 3 servers have different nginx versions, 2 are missing the security patch, and 1 has an unauthorized user account.

### 2. Write roles for the base server configuration

```
Create Ansible roles for our standard server setup:

1. common: deploy user, SSH hardening (disable root login, password auth),
   UFW firewall (deny all, allow SSH + specific ports per group), unattended
   security updates, NTP, log rotation, fail2ban
2. nginx: install, configure sites from variables, SSL via Let's Encrypt
   with auto-renewal, security headers, rate limiting
3. nodejs: install Node.js 20 via nvm, PM2 for process management, systemd
   service, log rotation for app logs
4. postgresql: install 16, configure primary with streaming replication,
   pg_hba.conf from variables, automated daily backups to S3
5. monitoring: node_exporter for Prometheus, configure log shipping to
   centralized logging

Each role should be idempotent and tested with Molecule.
```

The agent generates 5 complete roles with tasks, handlers, templates, defaults, and Molecule tests. The common role hardens SSH, configures UFW with group-specific port rules, sets up fail2ban with custom jail configs, and enables unattended-upgrades. Each role includes sensible defaults that can be overridden via group_vars.

### 3. Create the deployment playbook with rolling updates

```
Write a deployment playbook for our Node.js API that:
1. Deploys to 2 servers at a time (serial)
2. Drains connections from the Hetzner load balancer before each batch
3. Pulls the specified git tag
4. Runs npm ci --production
5. Runs database migrations (only once, on the first server)
6. Restarts PM2 with zero-downtime reload
7. Runs health checks (HTTP 200 on /health within 30 seconds)
8. Adds server back to load balancer
9. If health check fails: rollback that server and stop the entire deploy

Usage: ansible-playbook deploy.yml -e version=v1.2.3
```

The agent writes a deployment playbook with `serial: 2`, pre-task LB drain via Hetzner API, a deploy role with git checkout, npm install, and PM2 reload, a `run_once` task for migrations, post-task health checks with 10 retries at 3-second intervals, and a rescue block that rolls back on failure and notifies Slack.

### 4. Encrypt secrets and set up Ansible Vault

```
We have sensitive data: database passwords, API keys, SSL private keys,
Hetzner API token. Set up Ansible Vault for all secrets. Structure it so:
- Each environment (staging/production) has its own vault file
- Vault variables are prefixed with vault_ and referenced in group_vars
- The vault password is stored in a file excluded from git
- CI/CD can decrypt using an environment variable

Also set up external-secrets integration for the PostgreSQL passwords
used in the app config templates.
```

The agent creates vault files for each environment, restructures all sensitive variables to use the `vault_` prefix pattern, generates a `.vault_pass` template with gitignore entry, configures `ansible.cfg` to use the vault password file, and adds CI/CD pipeline examples showing how to pass the vault password via environment variable.

### 5. Set up CI/CD and scheduled compliance checks

```
Create a GitHub Actions pipeline that:
1. On PR: run ansible-lint and molecule tests for all changed roles
2. On merge to main: deploy to staging automatically
3. On release tag: deploy to production (requires manual approval)
4. Every Sunday at 2am: run the full site.yml in check mode against
   production to detect configuration drift, post results to Slack

Also create a security hardening playbook that runs monthly: checks for
outdated packages, expired SSL certificates, unauthorized SSH keys, and
open ports that shouldn't be open.
```

The agent generates GitHub Actions workflows for CI testing with Molecule in Docker, automated staging deployment on merge, production deployment with environment protection rules, a weekly drift detection cron job that runs `--check --diff` and parses the output for changes, and a monthly security audit playbook that produces a compliance report.

## Real-World Example

An ops engineer at a 20-person company manages 12 servers manually. New server setup takes a day, 2 servers were missed during a critical security patch, and the team wiki is always out of date.

1. She audits all servers with Ansible and finds 23 configuration drifts including the 2 unpatched servers
2. Five roles codify the entire server setup — new servers go from bare metal to production-ready in 8 minutes
3. Rolling deployment with health checks eliminates failed deploys — the rescue block catches a bad release before it reaches more than 2 servers
4. Weekly drift detection catches a teammate's manual nginx config change within 7 days
5. After 2 months: server setup time drops from 8 hours to 8 minutes, zero configuration drift, and the wiki is replaced by self-documenting Ansible code

## Related Skills

- [ansible-automation](../skills/ansible-automation/) — Writes playbooks, roles, and manages server configuration
- [security-audit](../skills/security-audit/) — Defines hardening standards and compliance checks as code
- [coding-agent](../skills/coding-agent/) — Builds custom deployment logic and integration scripts
