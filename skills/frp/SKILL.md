---
name: frp
description: >-
  frp is a reverse proxy that lets you publish services running behind NAT or a firewall through a server that has a public IP. A server (frps) and a client (frpc) are configured in TOML. Use this skill to expose a local web app, SSH or any TCP/UDP port from your own machines, protect the tunnel with a token and TLS, and check proxy status on the dashboard. Trigger phrases: "expose my local server", "self-hosted tunnel", "frp config", "frps frpc", "reach my home machine over SSH", "alternative to ngrok".
license: Apache-2.0
compatibility: "Linux, macOS or Windows release binaries (frp 0.52+ for TOML); a host with a public IP for frps"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "frp, reverse-proxy, tunnel, nat-traversal, self-hosted"
  repository: https://github.com/fatedier/frp
---

# frp — self-hosted reverse proxy for services behind NAT

## Overview

frp has two programs. `frps` runs on a machine with a public address and listens for clients. `frpc` runs next to the service you want to publish, connects out to `frps`, and registers one or more proxies. Traffic that reaches `frps` is carried back through that connection to the local service, so the private machine needs no inbound firewall rule or port forwarding.

Proxy types: `tcp`, `udp`, `http`, `https`, `tcpmux`, plus private ones (`stcp`, `sudp`, `xtcp`) that require a matching visitor on the other side. Configuration is TOML (YAML and JSON also work since v0.52); the old INI format is deprecated and receives no new features, so always write TOML.

Use it only to publish services you own or are authorised to expose. For a hosted tunnel with no server of your own, see the `ngrok` skill.

## Instructions

### Installation

Download the release archive for your OS from the project's GitHub releases and check it against the checksum file in the same release.

```bash
VERSION=0.71.1   # current tag: https://github.com/fatedier/frp/releases
curl -fLO https://github.com/fatedier/frp/releases/download/v${VERSION}/frp_${VERSION}_linux_amd64.tar.gz
curl -fLO https://github.com/fatedier/frp/releases/download/v${VERSION}/frp_sha256_checksums.txt
sha256sum --ignore-missing -c frp_sha256_checksums.txt
tar xzf frp_${VERSION}_linux_amd64.tar.gz
cd frp_${VERSION}_linux_amd64
ls    # frpc  frpc.toml  frps  frps.toml  LICENSE
```

Put `frps` on the public server and `frpc` on the private machine. Both accept `-c <file>`, and both have a `verify` subcommand that checks a config without starting anything:

```bash
./frps verify -c frps.toml
./frpc verify -c frpc.toml
```

### Server configuration (frps.toml)

Secrets can come from environment variables inside the file with `{{ .Envs.NAME }}`, so no token has to be written to disk or committed.

```toml
bindAddr = "0.0.0.0"          # where frpc clients connect
bindPort = 7000
vhostHTTPPort = 8080          # shared port for all `http` proxies (matched by Host header)

auth.method = "token"
auth.token = "{{ .Envs.FRP_TOKEN }}"

# clients may only claim these remote ports
allowPorts = [{ start = 6000, end = 6010 }]

# dashboard: keep it on loopback and reach it through an SSH tunnel
webServer.addr = "127.0.0.1"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "{{ .Envs.FRP_DASH_PASSWORD }}"
```

```bash
export FRP_TOKEN="$(openssl rand -hex 24)"          # share this value with each frpc
export FRP_DASH_PASSWORD="$(openssl rand -hex 16)"
./frps -c frps.toml
```

Token auth is the default method. `allowPorts` stops a client from grabbing arbitrary ports on the server. Open only `bindPort` and the proxy ports you really publish in the firewall.

### Client configuration (frpc.toml)

```toml
serverAddr = "203.0.113.20"       # the public IP or name of frps
serverPort = 7000
auth.method = "token"
auth.token = "{{ .Envs.FRP_TOKEN }}"

# local admin API used by `frpc status` and `frpc reload`
webServer.addr = "127.0.0.1"
webServer.port = 7400

[[proxies]]
name = "staging-web"
type = "http"
localIP = "127.0.0.1"
localPort = 3000
customDomains = ["staging.devteam.example"]   # DNS must point at the frps host

[[proxies]]
name = "home-ssh"
type = "tcp"
localIP = "127.0.0.1"
localPort = 22
remotePort = 6000                 # must be inside allowPorts
```

```bash
./frpc -c frpc.toml
./frpc status -c frpc.toml       # lists each proxy as running, with its remote address
./frpc reload -c frpc.toml       # apply proxy changes without restarting
```

Each `[[proxies]]` block is one proxy with a unique `name`. A `http` proxy is reached at `http://<domain>:<vhostHTTPPort>`; `subdomain` can be used instead of `customDomains` when the server sets `subdomainHost`. Quick one-off tunnels are possible without a file, for example `frpc tcp --help` shows the flags for a single TCP proxy.

### Encrypt and verify the control connection

Since v0.50 `frpc` uses TLS to `frps` by default. Two things are not automatic: `frpc` does not verify the server certificate unless it has a trust source, and `frps` still accepts non-TLS clients unless forced.

```toml
# frps.toml
transport.tls.force = true
transport.tls.certFile = "/etc/frp/server.crt"
transport.tls.keyFile = "/etc/frp/server.key"
```

```toml
# frpc.toml
transport.tls.useSystemCa = true          # certificate issued by a public CA
# or: transport.tls.trustedCaFile = "/etc/frp/ca.crt"   # your private CA
```

TLS on the control connection does not encrypt the end-to-end payload of an `http` proxy; terminate HTTPS on the local service or use an `https` proxy for that.

### Private access with stcp

Instead of opening a public port for SSH, publish it with `type = "stcp"` and a shared `secretKey`, and connect from another machine through a visitor.

```toml
# frpc.toml on the machine that hosts the service
[[proxies]]
name = "office-ssh"
type = "stcp"
secretKey = "{{ .Envs.FRP_STCP_KEY }}"
localIP = "127.0.0.1"
localPort = 22
```

```toml
# frpc.toml on the machine that connects
serverAddr = "203.0.113.20"
serverPort = 7000
auth.method = "token"
auth.token = "{{ .Envs.FRP_TOKEN }}"

[[visitors]]
name = "office-ssh-visitor"
type = "stcp"
serverName = "office-ssh"
secretKey = "{{ .Envs.FRP_STCP_KEY }}"
bindAddr = "127.0.0.1"
bindPort = 6001
```

```bash
ssh -p 6001 deploy@127.0.0.1
```

### Dashboard

With `webServer` set on `frps`, an SSH tunnel such as `ssh -N -L 7500:127.0.0.1:7500 ops@203.0.113.20` makes it available at `http://127.0.0.1:7500` (basic auth). The same listener serves a JSON API: `GET /api/serverinfo` and `GET /api/proxy/http` (or `/tcp`) with the dashboard credentials.

## Examples

### Example 1: Show a staging app to a client without deploying

**Request:** "My Next.js staging app runs on localhost:3000 on my laptop. Make it reachable as staging.devteam.example for the client demo, through our VPS at 203.0.113.20."

```bash
# on the VPS: frps.toml as above, then
export FRP_TOKEN="$(openssl rand -hex 24)"; export FRP_DASH_PASSWORD="$(openssl rand -hex 16)"
./frps verify -c frps.toml && ./frps -c frps.toml
# on the laptop (same FRP_TOKEN exported), frpc.toml with the staging-web proxy
./frpc verify -c frpc.toml && ./frpc -c frpc.toml
curl -s -H 'Host: staging.devteam.example' http://203.0.113.20:8080/
```

**Result:** `frpc status` lists `staging-web  running  127.0.0.1:3000  staging.devteam.example:8080`, and the curl returns the app's HTML. Add a DNS A record for the domain so the client's browser reaches `http://staging.devteam.example:8080`.

### Example 2: SSH into a home server that has no public IP

**Request:** "I can't forward ports on my ISP router, but I need SSH to my home server from anywhere."

```bash
# VPS: frps.toml with allowPorts = [{ start = 6000, end = 6010 }]
# home server: frpc.toml with the home-ssh tcp proxy (remotePort = 6000), run as a service
./frpc -c frpc.toml
# from anywhere
ssh -p 6000 andrey@203.0.113.20
```

**Result:** the SSH login prompt of the home server appears. For stricter access, switch the proxy to `stcp` as shown above so no public SSH port exists at all.

## Guidelines

- Always set `auth.method = "token"` with a long random token (from an environment variable or `auth.tokenSource` file), otherwise anyone who finds the server can register proxies.
- A public `tcp` proxy is a public port on the internet. Do not publish databases, Docker sockets, admin panels or anything without its own authentication; prefer `stcp` or an SSH tunnel for those.
- Keep the dashboard on `127.0.0.1` and never reuse the default `admin` password; the dashboard shows all clients and proxies.
- Use `allowPorts` on the server and unique proxy names; two proxies with the same `remotePort` conflict.
- `frpc` needs `transport.tls.useSystemCa` or `trustedCaFile` to verify the server; without them the connection is encrypted but not authenticated.
- Run both programs under a service manager (systemd) so they restart after a crash or reboot.
- Do not write new INI configs. `xtcp` (peer-to-peer) may fail on some NAT types; fall back to `stcp`.
- frp does not issue certificates or load-balance across hosts; for HTTPS with real certificates put a reverse proxy such as `caddy` in front or terminate TLS locally.
