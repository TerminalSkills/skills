---
title: Protect Your Site from AI Crawlers with Anubis
slug: protect-your-site-from-ai-crawlers-with-anubis
description: Put a proof-of-work gate in front of a self-hosted wiki or forge so mass AI scraping stops eating your server, while real visitors and the good search engines still get through.
skills:
  - anubis
  - nginx
category: devops
tags:
  - anubis
  - ai-crawlers
  - bot-protection
  - reverse-proxy
  - nginx
---

# Protect Your Site from AI Crawlers with Anubis

## The Problem

Lena Hartmann runs a small open-source community. Her self-hosted wiki and code forge sit on one 4 GB VPS. Since September the load average has stayed above 6. The access log shows about 40 requests per second, mostly deep, expensive pages such as the forge's blame and diff views, from thousands of residential IP addresses that all claim to be an ordinary Chrome or Firefox. A `robots.txt` Disallow changed nothing, and blocking IP ranges by hand fails because new ones appear every day. Rate limiting per IP does little when each address sends only a handful of requests. Lena does not want to hand her traffic to a commercial bot-management service, and she does not want a CAPTCHA that annoys contributors.

The existing guides in the catalog cover building a rate limiter or a bot-detection engine inside your own application. Lena has no appetite to change the wiki's code; she needs a filter in front of software she did not write.

## The Solution

Anubis is a reverse proxy that challenges anything that looks like a browser with a small proof-of-work, and lets people through once their browser has solved it. The agent installs Anubis next to the existing nginx, writes a policy that denies known AI crawlers by name and challenges every other browser-like request, moves the real site behind it, and checks the effect on the Prometheus counters. nginx keeps doing TLS and routing; Anubis only does filtering.

## Step-by-Step Walkthrough

### 1. Look at what is hitting the site

Prompt: "Look at the nginx access log for wiki.hartmann-oss.org and tell me which user agents and paths take most of the traffic."

```bash
sudo awk '{print $7}' /var/log/nginx/access.log | cut -d'?' -f1 | sort | uniq -c | sort -rn | head -10
sudo awk -F'"' '{print $6}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10
```

The agent reports that 71% of requests carry browser user agents and that the top paths are `/commits/` and `/blame/` pages. That confirms a plain `robots.txt` rule or one blocked user agent is not enough.

### 2. Install Anubis and keep the backend private

Prompt: "Install Anubis from the release package, run it as a service for the forge, and make sure the forge only answers on localhost."

```bash
cd /tmp && curl -fsSLO https://github.com/TecharoHQ/anubis/releases/download/v1.28.2/anubis_1.28.2_amd64.deb
curl -fsSL https://api.github.com/repos/TecharoHQ/anubis/releases/tags/v1.28.2 \
  | jq -r '.assets[] | select(.name=="anubis_1.28.2_amd64.deb") | "\(.digest | ltrimstr("sha256:"))  \(.name)"' \
  | sha256sum -c - || exit 1
sudo apt install ./anubis_1.28.2_amd64.deb
sudo cp /etc/anubis/default.env /etc/anubis/forge.env
sudo cp /usr/share/doc/anubis/botPolicies.yaml /etc/anubis/forge.botPolicies.yaml
```

The agent edits `/etc/anubis/forge.env` so the service listens on loopback and forwards to the forge's internal port, then appends a persistent signing key:

```text
BIND=127.0.0.1:8923
TARGET=http://127.0.0.1:3000
POLICY_FNAME=/etc/anubis/forge.botPolicies.yaml
METRICS_BIND=127.0.0.1:9090
```

```bash
echo "ED25519_PRIVATE_KEY_HEX=$(openssl rand -hex 32)" | sudo tee -a /etc/anubis/forge.env > /dev/null
sudo systemctl enable --now anubis@forge.service
curl -s http://127.0.0.1:9090/metrics | head -3
```

### 3. Write the policy

Prompt: "Deny the AI crawlers by name, keep the good search engines, never challenge our CI runner, and challenge every other browser."

```yaml
# /etc/anubis/forge.botPolicies.yaml
bots:
  - name: ci-runner
    action: ALLOW
    remote_addresses:
      - 203.0.113.40/32
  - import: (data)/meta/ai-block-aggressive.yaml
  - import: (data)/crawlers/_allow-good.yaml
  - import: (data)/common/keep-internet-working.yaml
  - name: generic-browser
    user_agent_regex: Mozilla
    action: CHALLENGE
```

```bash
sudo systemctl restart anubis@forge.service
```

### 4. Route nginx through Anubis

Prompt: "Change the nginx vhost so public traffic goes to Anubis instead of the forge, and send the client address."

```nginx
location / {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Http-Version $server_protocol;
    proxy_set_header X-TLS-SNI-Name $ssl_server_name;
    proxy_pass http://127.0.0.1:8923;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Verify from outside

Prompt: "Check that a browser gets the challenge, a denied crawler is counted, and the counters move."

```bash
curl -s -A "Mozilla/5.0 Firefox/130.0" https://wiki.hartmann-oss.org/ | grep -o "Making sure you.*not a bot"
curl -s http://127.0.0.1:9090/metrics | grep '^anubis_policy_results'
```

The agent reads the metrics: `CHALLENGE` for `bot/generic-browser` and `DENY` for the AI-crawler rule are growing, and the server load is dropping.

## Real-World Example

Lena's forge served about 3.4 million requests in the week before the change. After the switch she watches the load for a day. The load average falls from 6.2 to 1.1. The policy counters show most requests ending in `DENY` or an unsolved `CHALLENGE`, and the forge logs show only about 60,000 requests that actually reached the application, nearly all from contributors who solved the challenge once and kept their cookie for a week. Two contributors on a script-blocking browser extension could not load pages; Lena asks them to allow JavaScript for the domain, which Anubis's own page explains. She lowers nothing further and sets a reminder to read the counters weekly.

## Related Skills

- [anubis](/skills/anubis) — the proof-of-work filter, its policy file and its environment variables
- [nginx](/skills/nginx) — terminates TLS and forwards every request to Anubis
