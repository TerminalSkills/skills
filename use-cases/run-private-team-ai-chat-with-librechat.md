---
title: Run One Private AI Chat for Your Team with LibreChat
slug: run-private-team-ai-chat-with-librechat
description: Replace scattered per-seat AI chat subscriptions with one self-hosted chat over GPT, Claude and open models, with company accounts and monthly spending caps.
skills:
  - librechat
  - caddy
  - openrouter
category: devops
tags:
  - self-hosted
  - ai-chat
  - multi-provider
  - team-tools
  - cost-control
---

## The Problem

Priya Raman runs engineering and IT for Brightpath, a 25-person software consultancy. Over a year, AI chat spread through the company one credit card at a time: 14 people pay for a ChatGPT plan, 6 for Claude, two designers use Gemini, and the rest paste client code into whatever free tier is open. The bill is about $620 a month, nobody knows which client data went where, and when someone leaves their chat history leaves with them.

The team does not want to give up choice. Developers prefer Claude for code review, account managers like GPT for writing, and two engineers want cheap open models for bulk summarising. What Priya needs is one place where everyone signs in with a company account, picks any approved model, keeps conversations on Brightpath's own server, and stays inside a monthly budget she sets — paying providers per token instead of per seat.

## The Solution

Deploy LibreChat with Docker Compose on a small VM the company already runs. Company API keys for OpenAI and Anthropic go in `.env`; OpenRouter is added as a custom endpoint in `librechat.yaml` for open models; the `balance` block gives each person a monthly dollar allowance. Caddy terminates HTTPS in front of the app, and the app's own ports are bound to localhost so nobody can bypass it. Registration closes after the admin account exists, and the agent creates the remaining accounts from the staff list.

## Step-by-Step Walkthrough

### 1. Install LibreChat and fix the secrets

Prompt to the agent:

> Install LibreChat on this VM under /opt/librechat with Docker Compose. Generate permanent secrets instead of the temporary ones and don't start it yet.

```bash
cd /opt
git clone https://github.com/LibreChat-AI/LibreChat.git librechat
cd librechat
cp .env.example .env
cp docker-compose.override.yml.example docker-compose.override.yml
for v in CREDS_KEY JWT_SECRET JWT_REFRESH_SECRET MEILI_MASTER_KEY ADMIN_PANEL_SESSION_SECRET; do
  sed -i "s|^$v=.*|$v=$(openssl rand -hex 32)|" .env
done
sed -i "s|^CREDS_IV=.*|CREDS_IV=$(openssl rand -hex 16)|" .env
```

The agent reminds Priya to copy the six values into the company password manager: `CREDS_KEY` encrypts stored user keys and cannot be changed later without a migration.

### 2. Add the providers

Prompt:

> Use our OpenAI and Anthropic keys for everyone, add OpenRouter for open models, and serve it at chat.brightpath.dev.

With `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and `OPENROUTER_KEY` exported in the shell:

```bash
sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=${OPENAI_API_KEY}|" .env
sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}|" .env
sed -i "s|^DOMAIN_CLIENT=.*|DOMAIN_CLIENT=https://chat.brightpath.dev|" .env
sed -i "s|^DOMAIN_SERVER=.*|DOMAIN_SERVER=https://chat.brightpath.dev|" .env
echo "OPENROUTER_KEY=${OPENROUTER_KEY}" >> .env
echo "ENDPOINTS=openAI,anthropic,agents,custom" >> .env
```

It then writes `librechat.yaml`. LibreChat's balance credits are money, not tokens: 1,000,000 credits = $1 at its per-model list rates, so 15,000,000 is about $15 per person per month:

```yaml
version: 1.3.17
cache: true
endpoints:
  custom:
    - name: 'OpenRouter'
      apiKey: '${OPENROUTER_KEY}'
      baseURL: 'https://openrouter.ai/api/v1'
      models:
        default: ['deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct']
        fetch: true
      titleConvo: true
      titleModel: 'meta-llama/llama-3.3-70b-instruct'
      modelDisplayLabel: 'OpenRouter'
balance:
  enabled: true
  startBalance: 15000000
  autoRefillEnabled: true
  refillIntervalValue: 30
  refillIntervalUnit: 'days'
  refillAmount: 15000000
```

The agent points out that a refill adds to what is left rather than resetting it, and that OpenRouter usage is charged at the prices LibreChat fetches from OpenRouter, so cheap open models barely dent the budget.

Finally it writes `docker-compose.override.yml`, mounting the config and binding the two published ports to loopback. `!override` replaces the stock `ports` list; without it Compose appends the new entry and the public one stays:

```yaml
services:
  api:
    volumes:
      - type: bind
        source: ./librechat.yaml
        target: /app/librechat.yaml
    ports: !override
      - "127.0.0.1:3080:3080"
  admin-panel:
    ports: !override
      - "127.0.0.1:3000:3000"
```

### 3. Start it behind HTTPS

Prompt:

> Start it and put Caddy in front with a real certificate. Nobody should reach port 3080 directly.

```bash
docker compose up -d
docker compose logs --tail 50 api
docker compose ps --format '{{.Name}} {{.Ports}}'
```

Caddyfile on the same VM:

```text
chat.brightpath.dev {
    reverse_proxy localhost:3080
}
```

The agent reloads Caddy and checks that `docker compose ps` lists `127.0.0.1:3080` and `127.0.0.1:3000`, not `0.0.0.0`. It tells Priya why it did not rely on ufw: Docker's own iptables rules route published ports around ufw, so a host firewall rule would not have closed 3080. The VM's cloud firewall still allows only 22, 80 and 443.

### 4. Create the admin, close sign-up, add the team

Priya registers first at `https://chat.brightpath.dev`, which makes her the admin. Then:

> Turn off public registration and create accounts for everyone in staff.csv.

```bash
sed -i "s|^ALLOW_REGISTRATION=.*|ALLOW_REGISTRATION=false|" .env
docker compose down && docker compose up -d
umask 077
tail -n +2 staff.csv | while IFS=, read -r email name username; do
  pw=$(openssl rand -base64 18)
  docker compose exec -T api npm run create-user -- "$email" "$name" "$username" "$pw" --email-verified=true < /dev/null
  printf '%s,%s\n' "$email" "$pw" >> handover.csv
done
```

`create-user` normally stops to ask for a password and whether the email is verified. Passing the password as the fourth argument and `--email-verified=true` answers both, and `-T` with `< /dev/null` keeps `docker compose exec` from reading the rest of `staff.csv` as its input. The script warns that a password on the command line is not secure; the agent gives Priya `handover.csv` as a one-time list, asks everyone to change their password at first login, and deletes the file afterwards instead of emailing it.

### 5. Plan updates

> Write me the update procedure for next month.

```bash
docker compose exec -T mongodb mongodump --db LibreChat --archive > /var/backups/librechat-$(date +%F).archive
docker compose down
git pull
docker compose pull
docker compose up -d
```

The agent adds: read `UPGRADING.md` after `git pull`, because some releases need a one-off migration before the API restarts.

## Real-World Example

Brightpath moved all 25 people over in one afternoon. After the first month the provider invoices came to $212 (OpenAI $96, Anthropic $81, OpenRouter $35) against the old $620 in subscriptions. Most people spent $4–10 of their $15; two developers doing long code reviews on Claude hit the 15,000,000-credit cap in week three, and Priya ran `docker compose exec api npm run add-balance` with 5,000,000 credits ($5) for each of them rather than raising the cap for everyone. Client code now stays in Brightpath's MongoDB, and when a contractor left, deleting one account removed their access to every model at once. Six weeks in, the developers added a shared "Code Review" agent on Claude from the Agent Builder, and the account managers kept GPT as their default — the same login for both.

## Related Skills

- [librechat](/skills/librechat) — deploys the chat app, configures providers, balances and user accounts
- [caddy](/skills/caddy) — terminates HTTPS for chat.brightpath.dev and proxies to port 3080
- [openrouter](/skills/openrouter) — supplies open models through one OpenAI-compatible key
