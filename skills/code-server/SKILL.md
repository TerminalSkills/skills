---
name: code-server
description: >-
  code-server runs VS Code on a remote machine and serves it to any web browser, so you can code from a laptop, tablet or thin client while the files, terminal and compute stay on a server. Use this skill to install code-server from a release archive or package, configure ~/.config/code-server/config.yaml with password auth, keep it on localhost behind an SSH tunnel or a TLS reverse proxy, install extensions from Open VSX and run it as a service. Trigger phrases: "VS Code in the browser", "remote dev server", "install code-server", "code from my iPad".
license: Apache-2.0
compatibility: "Linux x86_64/arm64 with glibc 2.28+ (standalone release), macOS, or Docker 24+; 1 GB RAM minimum, 2 vCPU recommended; curl, jq and sha256sum for the verified download"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "code-server, vscode, remote-development, browser-ide, self-hosted"
  repository: https://github.com/coder/code-server
---

# code-server — VS Code in the browser on your own server

## Overview

code-server is the VS Code editor packaged as a web server. You start it on a Linux box, VM or container; open its URL in a browser and get the full editor with an integrated terminal, debugger and extensions, working directly on the server's files. It protects the page with a password (or hashed password) and can serve HTTPS itself, but the safest layout is to bind it to `127.0.0.1` and reach it through an SSH tunnel or a reverse proxy that terminates TLS.

Extensions come from the Open VSX registry, not Microsoft's marketplace, so a few Microsoft-only extensions are unavailable. Use it for remote development and a consistent environment across devices. It is not a multi-user workspace platform: one process serves one user.

## Instructions

### Installation

Preferred: the standalone release archive (needs only glibc 2.28+; Node is bundled). Download it from the project's GitHub releases, unpack it in a directory you own, and link the binary.

```bash
VERSION=4.144.0    # current tag: https://github.com/coder/code-server/releases
FILE=code-server-${VERSION}-linux-amd64.tar.gz
curl -fLO https://github.com/coder/code-server/releases/download/v${VERSION}/${FILE}
# GitHub records a SHA-256 digest for every release asset; stop unless this prints "OK"
curl -fsSL https://api.github.com/repos/coder/code-server/releases/tags/v${VERSION} \
  | jq -r --arg f "$FILE" '.assets[] | select(.name==$f) | "\(.digest | ltrimstr("sha256:"))  \(.name)"' \
  | sha256sum -c -
mkdir -p ~/.local/lib ~/.local/bin
tar -xzf code-server-${VERSION}-linux-amd64.tar.gz -C ~/.local/lib
ln -sf ~/.local/lib/code-server-${VERSION}-linux-amd64/bin/code-server ~/.local/bin/code-server
code-server --version      # 4.144.0 <commit> with Code 1.144.0
```

The release has no checksum file, but GitHub's API returns a SHA-256 digest for each asset, which the `sha256sum -c` step compares. The anonymous API allows 60 requests an hour; if it answers 403, add `-H "Authorization: Bearer $GITHUB_TOKEN"`.

Alternatives, all documented in the project's install guide:

- Debian/Ubuntu: download `code-server_${VERSION}_amd64.deb` from the same release, verify it the same way (set `FILE` to the .deb name), then `sudo dpkg -i code-server_${VERSION}_amd64.deb`. The RPM is `code-server-${VERSION}-amd64.rpm`.
- npm (requires a supported Node.js and build tools): `npm install -g code-server`.
- macOS: `brew install code-server`.
- Docker: `docker run -it --name code-server -p 127.0.0.1:8080:8080 -v "$PWD:/home/coder/project" -u "$(id -u):$(id -g)" -e "DOCKER_USER=$USER" codercom/code-server:latest` (the project's install guide also mounts `~/.config` and `~/.local` to keep settings).

The project also offers an install script at `code-server.dev/install.sh`; download it to a file and read it before running it, never pipe it to a shell.

### Configuration

The first run writes `~/.config/code-server/config.yaml` with a random password:

```yaml
bind-addr: 127.0.0.1:8080
auth: password
password: <generated, 20 characters>
cert: false
```

Every command-line flag maps to a key of the same name in this file. Change what you need, then restart:

```yaml
bind-addr: 127.0.0.1:8443
auth: password
hashed-password: "$argon2id$v=19$m=65536,t=3,p=4$..."   # takes precedence over `password`
disable-telemetry: true
disable-update-check: true
```

Generate a hash instead of storing a plaintext password, for example with Python (`python3 -m pip install argon2-cffi`): `MY_PASSWORD=... python3 -c 'import os; from argon2 import PasswordHasher; print(PasswordHasher().hash(os.environ["MY_PASSWORD"]))'`, and paste the whole `$argon2...` string, in quotes. (The `npx argon2-cli` command in the project FAQ is an unmaintained package that produced no output on current Node.) The password can also be supplied with the `PASSWORD` environment variable (or `HASHED_PASSWORD`); flags that hold secrets cannot be given on the command line.

Start it on a project directory, with settings from the file or from flags:

```bash
code-server ~/projects/shop-api
code-server --bind-addr 127.0.0.1:8080 --auth password ~/projects/shop-api
curl -s http://127.0.0.1:8080/healthz      # {"status":"alive",...}
```

An unauthenticated request to `/` is redirected (HTTP 302) to the login page, which is a quick way to confirm that auth is on.

### Reach it safely

Option A, SSH tunnel (nothing exposed to the internet). On the local machine:

```bash
ssh -N -L 8080:127.0.0.1:8080 deploy@dev.northwind-labs.dev
# then open http://127.0.0.1:8080
```

Add `ServerAliveInterval 5` and `ExitOnForwardFailure yes` to `~/.ssh/config` so a dead tunnel is noticed.

Option B, reverse proxy with automatic HTTPS (for a tablet or a phone). code-server keeps listening on `127.0.0.1:8080`; Caddy gets the certificate and forwards WebSockets without extra configuration:

```text
code.northwind-labs.dev {
  reverse_proxy 127.0.0.1:8080
}
```

With nginx the proxy must pass `Upgrade` and `Connection` headers (`proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection upgrade;`), otherwise the editor loads but never connects. See the `caddy` or `nginx` skills for the full setup.

### Extensions

```bash
code-server --list-extensions --show-versions
code-server --install-extension esbenp.prettier-vscode        # from Open VSX
code-server --install-extension esbenp.prettier-vscode@12.4.0   # a pinned version
code-server --install-extension ./my-theme-1.0.0.vsix         # local VSIX
code-server --uninstall-extension esbenp.prettier-vscode
```

Extensions install into `~/.local/share/code-server/extensions` by default; `--extensions-dir` and `--user-data-dir` select other locations (useful for a separate profile per project).

### Run as a service

The deb and rpm packages install a systemd template unit that reads the same config file:

```bash
sudo systemctl enable --now code-server@$USER
systemctl status code-server@$USER
```

For the standalone archive, write your own unit that runs `~/.local/bin/code-server` as your user.

## Examples

### Example 1: A remote dev box reachable only through SSH

**Request:** "I have a 4 GB VPS at dev.northwind-labs.dev. Set up VS Code in the browser for me and don't expose it to the internet."

```bash
ssh deploy@dev.northwind-labs.dev
VERSION=4.144.0 FILE=code-server-4.144.0-linux-amd64.tar.gz
curl -fLO https://github.com/coder/code-server/releases/download/v${VERSION}/${FILE}
curl -fsSL https://api.github.com/repos/coder/code-server/releases/tags/v${VERSION} \
  | jq -r --arg f "$FILE" '.assets[] | select(.name==$f) | "\(.digest | ltrimstr("sha256:"))  \(.name)"' | sha256sum -c -
mkdir -p ~/.local/lib ~/.local/bin && tar -xzf code-server-${VERSION}-linux-amd64.tar.gz -C ~/.local/lib
ln -sf ~/.local/lib/code-server-${VERSION}-linux-amd64/bin/code-server ~/.local/bin/code-server
code-server --disable-telemetry ~/projects/shop-api &
grep -E '^(bind-addr|auth)' ~/.config/code-server/config.yaml
```

**Result:** the grep shows `bind-addr: 127.0.0.1:8080` and `auth: password`. From the laptop, `ssh -N -L 8080:127.0.0.1:8080 deploy@dev.northwind-labs.dev` and opening http://127.0.0.1:8080 shows the login page; the password is the `password:` value in that same config file (read it yourself, an agent should not print it into logs).

### Example 2: Browser access from an iPad with HTTPS

**Request:** "I want to code from my iPad. Put it behind HTTPS on code.northwind-labs.dev."

```bash
# DNS A record for code.northwind-labs.dev points at the VPS; ports 80 and 443 are open
sudo systemctl enable --now code-server@$USER
# /etc/caddy/Caddyfile contains the reverse_proxy block shown above
sudo systemctl reload caddy
curl -s -o /dev/null -w '%{http_code}\n' https://code.northwind-labs.dev/healthz
```

**Result:** the health check returns `200`, and the browser shows the login page over a valid certificate. The code-server process itself still listens only on `127.0.0.1:8080`.

## Guidelines

- Never set `auth: none` on anything reachable from a network. Whoever opens the page gets a shell as your user. If you must disable the password, bind to `127.0.0.1` and rely on the SSH tunnel.
- Prefer `bind-addr: 127.0.0.1:<port>` plus tunnel or reverse proxy over `0.0.0.0` with `--cert`; the built-in self-signed certificate triggers browser warnings.
- Use a long random password or a hashed one; the login page is the only protection if the port is reachable.
- WebSockets must pass through any proxy, or the UI hangs on "connecting".
- Run it as an unprivileged user; the integrated terminal has that user's permissions.
- Microsoft's own marketplace is not available; if an extension is missing from Open VSX, install its VSIX file, and only from a source you trust.
- Telemetry and the 6-hourly update check can be switched off with `--disable-telemetry` and `--disable-update-check`.
- Do not use it as a shared IDE for several people on one account; give each person their own instance and port.
