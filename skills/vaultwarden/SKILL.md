---
name: vaultwarden
description: >-
  Deploys and hardens Vaultwarden, a lightweight self-hosted server that is compatible with the official Bitwarden apps and browser extensions, so a person, family or small team can run their own password manager. Use when a user asks to "self-host Bitwarden", "set up Vaultwarden with Docker", "hash the ADMIN_TOKEN", "disable signups", "put Vaultwarden behind Caddy or nginx", or "back up the vault". Covers the container, environment variables, HTTPS reverse proxy, SMTP, backups and updates.
license: Apache-2.0
compatibility: "Docker or Podman with Compose, a domain name with DNS pointing at the server, and a reverse proxy that terminates HTTPS (Caddy, nginx or Traefik)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "vaultwarden, bitwarden, password-manager, self-hosted, docker"
  repository: https://github.com/dani-garcia/vaultwarden
---

# Vaultwarden — a self-hosted Bitwarden-compatible password server

## Overview

Vaultwarden is a Rust implementation of the Bitwarden client API. Official Bitwarden clients (browser extensions, desktop, mobile, CLI) connect to it, and the container bundles a web vault. It supports personal vaults, Send, attachments, organizations with collections, two-factor login, emergency access and an admin page. It is not made by Bitwarden, Inc.; report problems to the Vaultwarden project, not to Bitwarden.

An agent can deploy the container, write its environment, secure the admin token, front it with a reverse proxy, schedule backups and update it. The agent must never create a user's master password, never read vault contents, and never weaken security to make a test pass.

Two facts drive everything else:

- The web vault only works in a secure context, so it needs HTTPS. Terminate TLS at a reverse proxy.
- All state lives in one data directory (`/data` in the container): the SQLite database, attachments, `rsa_key.pem`, and `config.json` if the admin page was used to change settings.

## Instructions

### Run the container, bound to localhost

Official images are published as `vaultwarden/server` (Docker Hub), `ghcr.io/dani-garcia/vaultwarden` and `quay.io/vaultwarden/server`. Pin a version tag such as `1.37.4` and upgrade on purpose (`latest` moves with every release); for a fully reproducible deploy, pin the digest too (`vaultwarden/server:1.37.4@sha256:…`, from `docker buildx imagetools inspect`). Publish the port on 127.0.0.1 only, so the proxy is the single way in:

```yaml
# compose.yaml
services:
  vaultwarden:
    image: vaultwarden/server:1.37.4
    container_name: vaultwarden
    restart: unless-stopped
    environment:
      DOMAIN: "https://vault.northwind-dev.net"
      SIGNUPS_ALLOWED: "false"
      ADMIN_TOKEN: "$$argon2id$$v=19$$m=65540,t=3,p=4$$vlAH8es2mqEXQtF78PoOqBRUjWgXYEJcieXQeAOd0Fo$$KGdicJaJXypr1123nLpA+SiJawzD2niNKIAvZ6gNVqY"
    volumes:
      - ./vw-data/:/data/
    ports:
      - 127.0.0.1:8000:80
```

`DOMAIN` must be the exact public URL, including `https://`, because links in emails and WebAuthn depend on it. In a Compose file every `$` in the hashed token has to be doubled (`$$`), otherwise Compose treats it as a variable. With `docker run`, put the token in single quotes in the shell, and note that `--env-file` does not strip quotes.

### Hash the admin token

The admin page (`/admin`) exists only when `ADMIN_TOKEN` is set. Never store a plain-text token. (The hash in the Compose example is a throwaway demonstration value; generate your own.) Generate an Argon2id PHC string with the built-in command, which prompts twice for the password and needs a terminal:

```bash
docker run --rm -it vaultwarden/server:1.37.4 /vaultwarden hash
```

It prints a line `ADMIN_TOKEN='$argon2id$v=19$m=65540,t=3,p=4$...'`. Use that string as the value; the password you typed is what you enter on the admin login page. Rotating the token or its session lifetime (`ADMIN_SESSION_LIFETIME`, default 20 minutes) does not end sessions that already hold a valid JWT; deleting `rsa_key.pem` and restarting does. To switch the admin page off entirely, remove `ADMIN_TOKEN` (and `DISABLE_ADMIN_TOKEN`) and recreate the container. Never set `DISABLE_ADMIN_TOKEN=true` on a reachable server.

### Lock down registration

By default anyone who can reach the server can sign up. Set `SIGNUPS_ALLOWED=false` after the intended users have registered. Organization owners and admins can still invite people unless `INVITATIONS_ALLOWED=false`; the admin page can always invite. `SIGNUPS_DOMAINS_WHITELIST=northwind-dev.net` restricts registration to a domain, in which case `SIGNUPS_ALLOWED` is ignored. Add `SIGNUPS_VERIFY=true` if email is configured.

### Reverse proxy with HTTPS

Caddy obtains certificates automatically:

```caddyfile
vault.northwind-dev.net {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8000 {
    header_up X-Real-IP {remote_host}
  }
}
```

WebSocket notifications run on the main port since version 1.29, so no second upstream is needed. With nginx you must pass the `Upgrade` and `Connection` headers. Vaultwarden reads the client IP from `X-Real-IP` by default (`IP_HEADER`), only from trusted proxies (`IP_HEADER_TRUSTED_PROXIES=local` by default); keep the proxy on the same host or list its address. Do not expose `/admin` publicly if you can avoid it; restrict it to a private network at the proxy.

### Email

Invitations, verification and some two-factor flows need SMTP. The variables are `SMTP_HOST`, `SMTP_FROM`, `SMTP_PORT` (587), `SMTP_SECURITY` (`starttls`, `force_tls` or `off`), `SMTP_USERNAME` and `SMTP_PASSWORD`. Take the password from an env file or secret that is not committed.

### Check that it is up

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/alive    # 200 when running
docker logs vaultwarden --tail 50
docker exec vaultwarden /vaultwarden --version
```

### Back up and restore

Back up the whole data directory, not only the database. The built-in command makes a consistent SQLite copy inside the data folder:

```bash
docker exec vaultwarden /vaultwarden backup
# Backup to 'data/db_20261024_230559.sqlite3' was successful
```

Then copy the data directory (`db_*.sqlite3` or `db.sqlite3`, `attachments/`, `rsa_key.pem`, `config.json`) to another machine with restic or rclone, encrypted, because `config.json` and `rsa_key.pem` are sensitive. `sends/` and `icon_cache/` are optional. To restore: stop the container, put the files back, delete any stale `db.sqlite3-wal`, start it. Test a restore into a scratch directory periodically.

### Update

Read the release notes, change the tag in `compose.yaml` to the new version, then:

```bash
docker compose pull
docker compose up -d
```

Keep the data volume mounted. Update regularly, because mobile apps and extensions update themselves and can outrun an old server.

## Examples

### Example 1: first deployment for a four-person team

**Request**: "Set up Vaultwarden for our team at vault.northwind-dev.net, with signups closed after we register."

```bash
mkdir -p /srv/vaultwarden && cd /srv/vaultwarden
docker run --rm -it vaultwarden/server:1.37.4 /vaultwarden hash    # user types an admin password; copy the printed string
docker compose up -d                                                # compose.yaml as above, signups initially "true"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/alive
```

Result: `200`, the container listens on 127.0.0.1:8000 only, and Caddy serves https://vault.northwind-dev.net. The four users create their accounts in the web vault and choose their own master passwords. The agent then changes `SIGNUPS_ALLOWED` to `"false"` and runs `docker compose up -d` again.

### Example 2: nightly encrypted backup

**Request**: "Back up Vaultwarden every night to our storage box."

```bash
docker exec vaultwarden /vaultwarden backup
restic -r sftp:backup@storage.northwind-dev.net:/vw-backups backup /srv/vaultwarden/vw-data --exclude /srv/vaultwarden/vw-data/icon_cache
restic -r sftp:backup@storage.northwind-dev.net:/vw-backups forget --keep-daily 14 --keep-weekly 8 --prune
```

Run both from a systemd timer or cron job as a user that can talk to Docker, with the restic password supplied through `RESTIC_PASSWORD_FILE`. Result: a new encrypted snapshot every night and 14 daily plus 8 weekly snapshots kept.

## Guidelines

- Treat the vault as the most sensitive service you run. Keep the host patched, publish only the proxy ports, and keep the container port on 127.0.0.1.
- Never put the admin token, SMTP password or a user's credentials into a repository, chat or shell history. Read them from environment variables or secret files.
- Do not weaken settings for convenience: no `DISABLE_ADMIN_TOKEN`, no HTTP-only public access, no open signups on an internet-facing server.
- A backup you have not restored is not a backup. Never rely on VM snapshots alone, and encrypt copies that contain `config.json` or `rsa_key.pem`.
- Use fail2ban or proxy rate limits against password guessing on a public instance; with a proxy in front, make sure the real client IP reaches Vaultwarden.
- Data is single-node SQLite by default, which is right for most uses. MySQL and PostgreSQL backends exist, but then you also need database dumps in your backups.
- Not a fit when you need a vendor-backed service level or support contract; use the hosted Bitwarden service for that.
