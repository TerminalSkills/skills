---
title: "Self-Host Workflow Automation and Proxy Services"
slug: self-host-automation-and-proxy-services
description: "Deploy n8n for workflow automation and 3proxy for network proxy access on your own infrastructure, avoiding SaaS costs and retaining full control over data and routing."
skills:
  - n8n-self-host
  - 3proxy
category: devops
tags:
  - self-hosted
  - automation
  - proxy
  - n8n
  - privacy
---

# Self-Host Workflow Automation and Proxy Services

## The Problem

A 20-person agency uses Zapier for 40 workflow automations (CRM sync, invoice generation, lead scoring, Slack notifications) at $250 per month, and a commercial proxy service for web research at $180 per month. Both handle sensitive client data: CRM records flow through Zapier, and research queries reveal client strategy to the proxy provider's logs. The agency wants to cut costs, own its data pipeline, and run everything on a server it already pays for. Team members also need authenticated proxy access from restrictive networks.

## The Solution

Deploy **n8n** with the **n8n-self-host** skill (Docker Compose, PostgreSQL, task runners) and **3proxy** with the **3proxy** skill (authenticated HTTP and SOCKS5). One VPS runs both, and the rule for every service is the same: it listens on `127.0.0.1` or the compose network, or it sits behind the reverse proxy. The only ports open to the internet are 443 (Caddy) and the two authenticated proxy ports.

## Step-by-Step Walkthrough

### 1. Deploy n8n behind Caddy, bound to localhost

> Deploy n8n 2.x on our VPS with Docker Compose and PostgreSQL, as in the n8n-self-host skill: pinned image tag, `n8nio/runners` sidecar at the same version, generated `N8N_ENCRYPTION_KEY`. Publish the editor only on 127.0.0.1:5678 and put Caddy in front at automate.agency.com. Set the timezone to America/New_York, prune executions older than 30 days, and set the webhook URL.

The changes to the skill's compose file that matter for exposure and for this page:

```yaml
  n8n:
    ports:
      - "127.0.0.1:5678:5678"          # the skill's template publishes 5678 on all interfaces; do not
    environment:
      - N8N_WEBHOOK_URL=https://automate.agency.com/
      - GENERIC_TIMEZONE=America/New_York
      - N8N_PROXY_HOPS=1               # Caddy is the one proxy in front
      - EXECUTIONS_DATA_PRUNE=true
      - EXECUTIONS_DATA_MAX_AGE=720    # hours: 30 days
```

Keep the PostgreSQL, task-runner and Redis services unpublished (no `ports:` at all); they are reachable only on the compose network. Caddy terminates TLS and forwards to the loopback port:

```
automate.agency.com {
    reverse_proxy 127.0.0.1:5678
}
```

n8n 2.x has no basic-auth switch. The first visit creates the owner account: use a strong password and enable MFA in the account settings, since the editor can run code and holds every credential. Check from outside the server that `http://<server-ip>:5678` does not answer. `N8N_WEBHOOK_URL` (the successor to the deprecated `WEBHOOK_URL`) is what lets HubSpot and other services call the workflow URLs n8n generates.

### 2. Rebuild the Zapier workflows in n8n

> Recreate our top 5 Zapier workflows in n8n. First: when a deal closes in HubSpot, create an invoice in QuickBooks, post to #revenue in Slack, and append a row to the Google Sheets revenue tracker. Second: when a website form arrives, score the lead on company size and budget, create a HubSpot contact, and assign a sales rep by territory. Retry each external call 3 times, and send a Slack alert when a workflow fails for good.

In n8n this means the node setting **Retry On Fail** (Max Tries 3) on each call, plus a separate workflow that starts with an **Error Trigger** node and posts to Slack; select it as the **Error Workflow** in each workflow's settings. There is no importer for Zaps, so each one is rebuilt by hand. Start with the workflows that carry client financial data, since those gain most from keeping the data on your server. Workflows you build are saved unpublished until you publish them.

### 3. Configure 3proxy with team authentication

Run 3proxy in the same compose project, from the `3proxy/3proxy:1.0.2` image (a read-only container with only the config and a counter directory mounted). It serves two audiences from one config: the team through authenticated ports published on the server's public address only, and n8n through an extra port that is never published and accepts only the compose network.

Pin the compose network so the ACL can name it:

```yaml
services:
  3proxy:
    image: 3proxy/3proxy:1.0.2
    read_only: true
    restart: always
    ports:
      - "${PROXY_PUBLIC_IP}:3128:3128"   # team HTTP proxy
      - "${PROXY_PUBLIC_IP}:1080:1080"   # team SOCKS5
      # 3129 is deliberately not published
    volumes:
      - ./3proxy/3proxy.cfg:/etc/3proxy/3proxy.cfg:ro
      - ./3proxy/passwd:/etc/3proxy/passwd:ro
      - ./3proxy/count:/count            # traffic counters survive restarts

networks:
  default:
    ipam:
      config:
        - subnet: 172.16.50.0/24         # pick a range no other Docker network on the host uses
```

Passwords are stored as hashes. On the host, `openssl passwd -1` makes an MD5-crypt hash that 3proxy accepts as `CR:`; the plain password goes in your password manager, not in the file. The `$` in a hash is why the entry is read from a file (`users $/etc/3proxy/passwd`) instead of being written inline.

```console
$ printf '%s\n' "alice:CR:$(openssl passwd -1 "$ALICE_PROXY_PASSWORD")" > 3proxy/passwd
$ printf '%s\n' "bob:CR:$(openssl passwd -1 "$BOB_PROXY_PASSWORD")" >> 3proxy/passwd
$ chmod 644 3proxy/passwd      # the container user must be able to read it; keep the directory private (700)
```

`3proxy/3proxy.cfg`:

```
nscache 65536
nserver 1.1.1.1
nserver 9.9.9.9
log
logformat "L%Y-%m-%d %H:%M:%S %N.%p %E %U %C:%c %R:%r %O %I %T"
counter /count/3proxy.3cf
users $/etc/3proxy/passwd
countall 1 M 20480 alice
countall 2 M 20480 bob

# Team: password required, web ports only
auth strong
deny * * 127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16
allow alice,bob * * 80,443
proxy -p3128
socks -p1080
flush

# n8n: no password, but only from the compose network, and never published
auth iponly
deny * * 127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16
allow * 172.16.50.0/24 * 80,443
proxy -p3129
```

Each `countall` line is one 20 GB (20480 MB) monthly counter per user, in both directions; counter numbers must be unique. Every default password is gone: there is no admin interface in this config (the packaged `admin -p8080` line is not used), and nobody has a shared account. The `deny` line comes before any `allow` so proxy users cannot reach the VPS itself, the Docker network, or cloud metadata at `169.254.169.254`. 3proxy logs to the container's stdout; Docker's log driver does the rotation, so set `max-size` and `max-file` under `logging.options` for the service. Tested with this configuration: an unauthenticated or wrong-password request is refused, a valid user gets through on both the HTTP and SOCKS5 ports, port 8080 and private addresses are denied, and from the compose subnet the internal port answers without a password while the team ports still demand one.

Team members point their browser or tools at `http://alice:<password>@<server-ip>:3128` or `socks5h://...:1080`. `strong` authentication sends the password in clear text on these protocols, so for people on untrusted networks reach the server over a VPN or an SSH tunnel, or enable 3proxy's TLS server as the skill describes. Restrict the public ports to known source ranges in the firewall too.

### 4. Use the proxy from n8n workflows

> Create an n8n workflow that runs every Monday at 08:00: fetch our 10 tracked competitor pricing URLs through the 3proxy internal port, hash the response body of each page, compare it with last week's hash, and post a summary to #competitive-intel in Slack for each page that changed. Keep the hashes in an n8n Data Table.

Use a **Schedule Trigger**, then an **HTTP Request** node per URL with *Options > Proxy* set to `http://3proxy:3129` (the compose service name resolves on the shared network; the node's Proxy option takes an HTTP proxy). Do not set the global `HTTP_PROXY` variables on n8n: they would send HubSpot, Slack and QuickBooks calls through the proxy too. A **Code** node hashes the body, a **Data Table** node stores last week's value, and an **IF** node decides whether to post. The request leaves from the agency's server address instead of the office network, and the pages are compared as raw HTML, so a changed price shows up but a rendered screenshot does not exist in this design. Only fetch pages whose terms allow automated access.

### 5. Monitoring and backups

> Add Uptime Kuma monitors: an HTTPS check on automate.agency.com and TCP checks on the proxy ports 3128 and 1080. Write a nightly backup that dumps the n8n PostgreSQL database, copies the `.n8n` volume and the 3proxy counter directory to S3-compatible storage, and alert Slack if either service is down for more than 2 minutes.

Run Uptime Kuma as a third compose service published on `127.0.0.1` only and reach it over Caddy with its own login, or through an SSH tunnel. The backup needs three things for n8n, as the skill warns: a `pg_dump` of the database, the `.n8n` folder (it holds the encryption key; the credentials in the dump are unreadable without it), and a copy of `.env`. Encrypt the archive before it leaves the server. Test a restore on a scratch machine before you cancel Zapier.

## Real-World Example

The agency deployed both services on a Friday afternoon on a VPS it already paid for. The lead developer rebuilt 15 workflows by Monday and migrated the remaining 25 over the following week. The most complex one, lead scoring with routing to three sales reps by territory and deal size, was easier to follow in n8n's canvas than in Zapier's step list.

The 3proxy setup took under an hour. Each team member got personal credentials, and the research team liked having one stable exit address instead of the rotating addresses of the old service, which had kept triggering CAPTCHAs. By the agency's own count, it stopped paying $430 a month in SaaS fees. It also added integrations Zapier's connectors lacked, and the weekly competitor-page check ran as a single self-hosted workflow where it had previously needed separate tools. The trade-off: updates, backups and uptime became the agency's job, which is why the pinned versions, the monitors and the tested restore are part of the setup.

## Related Skills

- **n8n-self-host**: Docker Compose with PostgreSQL, pinned versions, task runners, backup and restore for Steps 1, 2 and 5
- **3proxy**: authenticated HTTP and SOCKS5 proxy, ACLs, per-user counters and hardening for Steps 3 and 4
