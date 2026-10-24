---
title: Self-Host a Team Password Manager with Vaultwarden
slug: self-host-a-team-password-manager-with-vaultwarden
description: Run a Bitwarden-compatible password manager on your own server with HTTPS, a hashed admin token, closed signups and tested encrypted backups, for a small team that wants to own its credentials.
skills:
  - vaultwarden
  - caddy
  - restic
category: devops
tags:
  - password-manager
  - self-hosted
  - bitwarden
  - backups
  - security
---

## The Problem

Marek Novak runs a six-person web agency. Client logins, hosting panels and API keys live in a shared spreadsheet, two browsers' built-in password stores and a few Slack messages. When a developer left last month, nobody could say which credentials he had seen. The agency does not want to pay per seat for a hosted vault, and the clients' contracts say credentials must stay on infrastructure the agency controls. Marek has a small VPS and a domain, and wants a real password manager the whole team can use from their browsers and phones within an afternoon.

## The Solution

Use `vaultwarden`, a lightweight server that speaks the Bitwarden protocol, so everyone can use the official Bitwarden apps and extensions against the agency's own server. `caddy` terminates HTTPS with automatic certificates, and `restic` ships encrypted, versioned backups off the box. The agent does the deployment and hardening; each person creates their own account and master password, which the agent never sees.

## Step-by-Step Walkthrough

### Step 1: Hash the admin token and write the Compose file

Prompt to the agent: "Deploy Vaultwarden on this server for vault.northwind-dev.net. Bind it to localhost, protect the admin page with a hashed token, and keep signups open only until we have registered."

The agent asks Marek to type an admin password into a hashing prompt, so the password never appears in the chat:

```bash
mkdir -p /srv/vaultwarden && cd /srv/vaultwarden
docker run --rm -it vaultwarden/server:1.37.4 /vaultwarden hash
```

It copies the printed `$argon2id$...` string into `compose.yaml`, doubling every `$` as `$$` so Compose does not treat it as a variable:

```yaml
services:
  vaultwarden:
    image: vaultwarden/server:1.37.4
    container_name: vaultwarden
    restart: unless-stopped
    environment:
      DOMAIN: "https://vault.northwind-dev.net"
      SIGNUPS_ALLOWED: "true"
      ADMIN_TOKEN: "$$argon2id$$v=19$$m=65540,t=3,p=4$$vlAH8es2mqEXQtF78PoOqBRUjWgXYEJcieXQeAOd0Fo$$KGdicJaJXypr1123nLpA+SiJawzD2niNKIAvZ6gNVqY"
    volumes:
      - ./vw-data/:/data/
    ports:
      - 127.0.0.1:8000:80
```

(The hash shown is a throwaway example; the agent uses the one generated for Marek.)

```bash
docker compose up -d
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/alive
```

The check prints `200`.

### Step 2: Put Caddy in front with HTTPS

Prompt: "Expose it at vault.northwind-dev.net with a real certificate."

```caddyfile
vault.northwind-dev.net {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8000 {
    header_up X-Real-IP {remote_host}
  }
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -s -o /dev/null -w "%{http_code}\n" https://vault.northwind-dev.net/alive
```

The last command prints `200` over HTTPS. The web vault needs this secure context to run its cryptography, so plain HTTP would not work even on a private network.

### Step 3: Register the team, then close signups

Prompt: "Tell me when I can register, then close registration."

Marek and five colleagues open https://vault.northwind-dev.net, create their accounts and set their own master passwords, then install the Bitwarden browser extension and point it at the agency's server URL under the self-hosted option. Once all six exist the agent changes `SIGNUPS_ALLOWED` to `"false"`, runs `docker compose up -d`, and confirms that the "Create account" link has disappeared. Future hires are invited from the admin page at `/admin`, which the agent restricts to the office VPN address range in the Caddyfile.

### Step 4: Set up email

Prompt: "Hook up our SMTP relay so invitations work."

The agent adds `SMTP_HOST`, `SMTP_FROM`, `SMTP_PORT`, `SMTP_SECURITY=starttls`, `SMTP_USERNAME` and `SMTP_PASSWORD` to the service, reading the password from an environment file kept out of Git, and sends a test invitation from the admin page.

### Step 5: Back up nightly and test the restore

Prompt: "Back it up every night to the storage box and prove the restore works."

```bash
docker exec vaultwarden /vaultwarden backup
export RESTIC_PASSWORD_FILE=/root/.restic-vw-password
restic -r sftp:backup@storage.northwind-dev.net:/vw-backups init
restic -r sftp:backup@storage.northwind-dev.net:/vw-backups backup /srv/vaultwarden/vw-data --exclude /srv/vaultwarden/vw-data/icon_cache
restic -r sftp:backup@storage.northwind-dev.net:/vw-backups forget --keep-daily 14 --keep-weekly 8 --prune
```

These go into a systemd timer. To prove the restore, the agent restores the latest snapshot into `/tmp/vw-restore-check`, confirms that `db.sqlite3`, `rsa_key.pem` and `attachments/` are present and that the database opens, then deletes the check directory.

## Real-World Example

By evening the agency has a working vault. Marek imports the passwords from the shared spreadsheet through the web vault's import tool and deletes the spreadsheet. The six users have the browser extension and the phone app. `/admin` is reachable only from the VPN, the admin token is stored hashed, signups are closed, and the first nightly snapshot of 41 MB is on the storage box with a restore verified. The next time a developer leaves, Marek removes the account in the admin panel and rotates only the shared credentials that person could open, which the collections list shows him in a minute.

## Related Skills

- [vaultwarden](/skills/vaultwarden) — the password server: container, admin token, signup policy, backups
- [caddy](/skills/caddy) — HTTPS reverse proxy with automatic certificates
- [restic](/skills/restic) — encrypted, versioned off-site backups of the data directory
