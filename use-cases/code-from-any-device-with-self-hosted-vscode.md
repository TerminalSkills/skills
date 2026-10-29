---
title: Code From Any Device with Self-Hosted VS Code and code-server
slug: code-from-any-device-with-self-hosted-vscode
description: Give a freelance developer a full VS Code environment in the browser on a rented server, reachable from a laptop over SSH or from an iPad over HTTPS, with no code on the devices.
skills:
  - code-server
  - caddy
category: development
tags:
  - code-server
  - remote-development
  - vscode
  - browser-ide
  - self-hosted
  - ipad
---

## The Problem

Marta Silva is a freelance backend developer who switches between a 2019 laptop that struggles with Docker, a tablet she carries on trains, and a client's locked-down Windows PC where she may not install anything. Her projects are cloned in three places, her editor settings drift, and a full `docker compose` stack for the shop API takes 9 minutes to start on the laptop. Twice this year she lost an afternoon because the code she needed was on the other device.

She already rents a 4 GB VPS with 2 vCPUs that sits idle most of the day. What she needs is one development environment that lives there and is reachable from any browser, without opening an unprotected editor to the internet.

## The Solution

Run **code-server** on the VPS so VS Code, its terminal and her extensions all live next to the code and the Docker daemon. Keep it bound to `127.0.0.1` so it is never directly reachable, then choose how to reach it per device: an SSH tunnel from the laptop, and **Caddy** as a TLS reverse proxy with an automatic certificate for the tablet and the locked-down PC.

## Step-by-Step Walkthrough

### Step 1: Install code-server from the official package

Prompt to the agent: "On dev.northwind-labs.dev, install code-server from the official release package and open the shop-api project with password auth, localhost only."

```bash
VERSION=4.144.0
FILE=code-server_${VERSION}_amd64.deb
curl -fLO https://github.com/coder/code-server/releases/download/v${VERSION}/${FILE}
# compare with the SHA-256 digest GitHub records for the release asset; must print "OK"
curl -fsSL https://api.github.com/repos/coder/code-server/releases/tags/v${VERSION} \
  | jq -r --arg f "$FILE" '.assets[] | select(.name==$f) | "\(.digest | ltrimstr("sha256:"))  \(.name)"' \
  | sha256sum -c -
sudo dpkg -i code-server_${VERSION}_amd64.deb
code-server --version
```

### Step 2: Lock the configuration down

Prompt: "Make sure it only listens on localhost, uses a hashed password, and sends no telemetry."

The agent starts `code-server` once to create `~/.config/code-server/config.yaml`, then edits it. The hash comes from a password Marta types into the environment variable `MY_PASSWORD`, so it never appears in the transcript:

```bash
python3 -m pip install argon2-cffi
python3 -c 'import os; from argon2 import PasswordHasher; print(PasswordHasher().hash(os.environ["MY_PASSWORD"]))'
```

```yaml
bind-addr: 127.0.0.1:8080
auth: password
hashed-password: "$argon2id$v=19$m=65536,t=3,p=4$..."   # the output of the command above
disable-telemetry: true
disable-update-check: true
```

### Step 3: Run it as a service

Prompt: "Keep it running after I disconnect and after reboots."

With the `.deb` package the project's systemd unit is available:

```bash
sudo systemctl enable --now code-server@$USER
systemctl status code-server@$USER --no-pager
curl -s http://127.0.0.1:8080/healthz
```

The health endpoint answers `{"status":"alive",...}`. An unauthenticated request to `/` returns a 302 redirect to the login page, which confirms the password is required.

### Step 4: Laptop access over an SSH tunnel

Prompt: "Show me how to open it from my laptop without exposing any port."

```bash
ssh -N -L 8080:127.0.0.1:8080 deploy@dev.northwind-labs.dev
```

Marta opens http://127.0.0.1:8080 on the laptop. Nothing is published on the VPS's public interface.

### Step 5: HTTPS for the tablet and the locked-down PC

Prompt: "I also need to reach it from my iPad. Put it behind HTTPS on code.northwind-labs.dev."

After pointing a DNS A record at the VPS and opening ports 80 and 443, the agent applies the `caddy` skill and writes the proxy block. Caddy requests the certificate by itself and passes WebSocket traffic through:

```text
code.northwind-labs.dev {
  reverse_proxy 127.0.0.1:8080
}
```

```bash
sudo systemctl reload caddy
curl -s -o /dev/null -w '%{http_code}\n' https://code.northwind-labs.dev/healthz
```

### Step 6: Move her tools into the environment

Prompt: "Install the formatter I use and clone the shop-api repo."

```bash
code-server --install-extension esbenp.prettier-vscode
code-server --list-extensions --show-versions
git clone git@github.com:marta-silva-dev/shop-api.git ~/projects/shop-api
```

Extensions come from the Open VSX registry, not Microsoft's marketplace, so the agent checks each one she asks for against `--list-extensions` after installing.

## Real-World Example

By Friday Marta has one workspace. On the laptop she tunnels in; on the tablet she opens the HTTPS address and types her password once. The shop API stack starts in 90 seconds on the VPS instead of 9 minutes, because the work happens there. The clone on the client's PC is gone: she only uses the browser, so nothing of the client's code sits on her devices.

The VPS costs her the same as before. After a week she adds a firewall rule that allows only ports 22, 80 and 443, since code-server itself listens on localhost only.

## Related Skills

- [code-server](/skills/code-server) — install, configure and secure the browser-based VS Code
- [caddy](/skills/caddy) — automatic HTTPS reverse proxy in front of code-server for devices that cannot use an SSH tunnel
