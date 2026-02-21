---
title: "Deploy a Self-Hosted SaaS Platform on Hetzner with Coolify"
slug: deploy-self-hosted-saas-on-hetzner
description: "Replace expensive managed PaaS providers with a self-hosted Coolify instance on Hetzner Cloud, cutting hosting costs by 70% while keeping one-click deploys."
skills:
  - coolify
  - hetzner-cloud
category: devops
tags:
  - self-hosting
  - hetzner
  - coolify
  - paas
  - deployment
---

# Deploy a Self-Hosted SaaS Platform on Hetzner with Coolify

## The Problem

A bootstrapped SaaS startup spends $420/month on Heroku for three apps, two workers, and a managed Postgres database. The team wants the convenience of git-push deploys and automatic SSL, but the bill keeps climbing with every new dyno. Moving to raw VPS hosting means losing the deploy workflow the team relies on daily.

## The Solution

Using the **hetzner-cloud** skill to provision cost-effective servers and the **coolify** skill to install and configure a self-hosted PaaS that replicates the Heroku experience -- git push deploys, automatic SSL via Let's Encrypt, and a web dashboard for logs and environment variables.

## Step-by-Step Walkthrough

### 1. Provision the Hetzner server

Spin up a dedicated cloud server sized for the workload.

> I need a Hetzner Cloud server for running Coolify as a self-hosted PaaS. The workload is 3 Node.js apps, 2 background workers, and a PostgreSQL database. Recommend a server type in the Nuremberg region, set up a firewall allowing only SSH, HTTP, and HTTPS, and configure a private network for inter-service communication.

The skill provisions a CPX31 (4 vCPU, 8 GB RAM) at roughly $14/month, creates a firewall with ports 22, 80, and 443, attaches a 10.0.0.0/16 private network, and outputs the server IP.

### 2. Install and configure Coolify

Deploy Coolify onto the fresh server and connect it to the GitHub repository.

> Install Coolify on the Hetzner server at 65.108.x.x. Configure it with a wildcard DNS entry on apps.mycompany.com, connect it to our GitHub organization, and enable automatic SSL certificate provisioning with Let's Encrypt.

Coolify installs via its one-line script, sets up Traefik as the reverse proxy, and registers a GitHub App for webhook-based deploys. Every push to main triggers a build.

### 3. Migrate applications and databases

Move the three apps and their Postgres database from Heroku to Coolify.

> Migrate our three Heroku apps (api, dashboard, marketing-site) to Coolify. Each app has a Dockerfile already. Also create a PostgreSQL 16 database service and import the Heroku pg_dump I downloaded to /tmp/heroku-backup.sql. Set environment variables from the attached .env files.

Coolify creates each app as a separate resource, assigns subdomains (api.apps.mycompany.com), and deploys from the existing Dockerfiles. The database runs as a Coolify service on the private network, inaccessible from the public internet.

### 4. Configure monitoring and backups

Set up automated database backups and basic health monitoring.

> Configure Coolify to back up the PostgreSQL database to a Hetzner Storage Box every 6 hours. Set up health checks for all three apps with a 30-second interval and enable Slack notifications for failed deployments or health check failures.

Coolify's built-in backup scheduler pushes pg_dump snapshots to the mounted storage volume. Health check endpoints are polled on schedule, and the Slack webhook fires on any failure.

## Real-World Example

Marta runs a three-person SaaS startup that was spending $420/month on Heroku for a Next.js dashboard, an Express API, and a marketing site. She provisions a Hetzner CPX31 server for $14/month, installs Coolify, and migrates all three apps in an afternoon. The team keeps their git-push deploy workflow, gets automatic SSL, and monitors everything through the Coolify dashboard. Monthly hosting drops from $420 to $28 including the storage box for backups -- a 93% reduction with no change to the developer experience.
