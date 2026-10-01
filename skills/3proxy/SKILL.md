---
name: 3proxy
description: >-
  3proxy is a small open-source proxy server that runs HTTP/HTTPS, SOCKS4/5,
  SNI and TCP/UDP port-mapping proxies from one config file. Use when a user
  asks to set up an HTTP or SOCKS5 proxy, add proxy users and passwords, write
  3proxy access rules, chain or rotate upstream (parent) proxies, limit
  bandwidth, connections or monthly traffic per user, run 3proxy in Docker, or
  fix a 3proxy.cfg that will not start.
license: Apache-2.0
compatibility: 'Linux, FreeBSD, macOS, Windows. 3proxy 1.0 (current) or 0.9.9.x (LTS)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/3proxy/3proxy
  tags:
    - 3proxy
    - proxy
    - socks5
    - http-proxy
    - networking
---

# 3proxy

## Overview

3proxy is a tiny proxy server: one binary (`3proxy`, about 330 KB in the 1.0.0 package) that starts HTTP(S), SOCKS4/5, SNI, FTP, POP3/SMTP and TCP/UDP port-mapping services from a single config file. The config is a script executed top to bottom — each line is a command, and a service line (`proxy`, `socks`, `tcppm`) starts with whatever `auth`, ACL and limits are in force at that point. This skill covers installation, the packaged file layout, users, ACLs, parent proxies, traffic limits and hardening.

## Instructions

### Step 1: Installation

Debian and Ubuntu do not ship a `3proxy` package. The project publishes its own signed apt and dnf repositories (channels: `current` = 1.0, `lts` = 0.9.9.x).

```bash
# Debian 12+ / Ubuntu 22.04+
curl -fsSLO https://3proxy.org/repo/3proxy-release-key.asc
# verify the signing key's fingerprint before trusting it; stop if this prints nothing
gpg --show-keys --with-colons 3proxy-release-key.asc \
  | grep -q '^fpr:::::::::FC12214499FCC7BA1CFF6CDC0312384E3A73940B:' && echo "key fingerprint OK"
sudo install -m 644 3proxy-release-key.asc /usr/share/keyrings/3proxy.asc
sudo tee /etc/apt/sources.list.d/3proxy.sources <<EOF
Types: deb
URIs: https://3proxy.org/repo/deb
Suites: current
Components: main
Signed-By: /usr/share/keyrings/3proxy.asc
EOF
sudo apt update && sudo apt install 3proxy
```

RHEL, AlmaLinux, Rocky and CentOS Stream 8–10 use the dnf repository described at https://3proxy.org/repo/. A container image is on Docker Hub as `3proxy/3proxy` (tags `latest`, `1.0.0`, `lts`, `busybox`, `minimal`):

```bash
docker run -d --name 3proxy --read-only -p 3128:3128 -p 1080:1080 \
  -v /srv/3proxy/3proxy.cfg:/etc/3proxy/3proxy.cfg:ro 3proxy/3proxy:1.0.0
```

In the container, use a bare `log` line so records go to stdout (`docker logs 3proxy`).

**What the package installs:**

| Path | Purpose |
|---|---|
| `/etc/3proxy/3proxy.cfg` | Launcher: `chroot /usr/local/3proxy proxy proxy`, then `include /conf/3proxy.cfg`. Leave it alone. |
| `/etc/3proxy/conf/3proxy.cfg` | The config to edit (`/etc/3proxy/conf` links to `/usr/local/3proxy/conf`). |
| `/etc/3proxy/conf/passwd`, `counters`, `bandlimiters` | Users, traffic quotas and speed limits written by `add3proxyuser`. |
| `/var/log/3proxy` | Links to `/usr/local/3proxy/logs`. |

Because of the chroot, every path **inside** the editable config is relative to `/usr/local/3proxy`: `/conf/passwd`, `/logs/3proxy.log`, `/count/3proxy.3cf`. The package enables `3proxy.service` and tries to start it, but the packaged config reads `/conf/passwd`, which does not exist until the first `add3proxyuser` call — until then 3proxy exits with a parse error. Manage the service with `systemctl restart 3proxy`; `systemctl reload 3proxy` (sends `SIGUSR1`) re-reads the config of a running service.

### Step 2: Basic Configuration

`/etc/3proxy/conf/3proxy.cfg` — authenticated HTTP and SOCKS5 proxy:

```
nscache 65536
nserver 1.1.1.1
nserver 8.8.8.8

config /conf/3proxy.cfg
monitor /conf/3proxy.cfg

log /logs/3proxy.log D
logformat "L%Y-%m-%d %H:%M:%S %N.%p %E %U %C:%c %R:%r %O %I %T"
rotate 30

counter /count/3proxy.3cf
users $/conf/passwd
include /conf/counters
include /conf/bandlimiters
auth strong
deny * * 127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
allow *
proxy -p3128
socks -p1080
```

`monitor` reloads the config within a minute of the file changing. `log` with no file name writes to stdout; `log @3proxy` writes to syslog. `D` rotates daily (the file on disk is `3proxy.log.2026.10.01`) and `rotate 30` keeps 30 files. The `counter` and `include` lines come from the packaged config: they load the quotas and speed limits that `add3proxyuser` writes. Do not add `daemon` under systemd — the unit is `Type=simple`.

### Step 3: Users and Authentication

```bash
sudo add3proxyuser alice "$ALICE_PROXY_PASSWORD"            # hashed entry in /etc/3proxy/conf/passwd
sudo add3proxyuser bob "$BOB_PROXY_PASSWORD" 2048 8388608   # + 2048 MB/day quota and an 8 Mbit/s cap
sudo systemctl restart 3proxy
```

A `users` line can also be written by hand. Password types: `CL:` cleartext, `CR:` crypt hash (`$3$` BLAKE2b, or `$1$` MD5-crypt when built with OpenSSL), `NT:` NT hash. `3proxy_crypt "$PROXY_SALT" "$ALICE_PROXY_PASSWORD"` prints a ready `CR:$3$…` value. Quote any entry that contains `$` — an unquoted `$` starts a file include:

```
users "alice:CR:$3$k7Qm2x$G47yV9w…" ops:CL:Winter-Harbor-48
```

`auth` types: `none` (default — ACLs, limits and parents are **not** applied), `iponly` (ACLs by address, no password), `strong` (username and password), `cache`/`cacheacl` with `authcache`. `auth iponly strong` asks for a password only when the matching rule names a user.

### Step 4: Access Control Lists (ACLs)

Fields, in order: users, source addresses, targets, target ports, operations, weekdays, time periods. Lists are comma-separated without spaces; `*` means any. Rules are checked top to bottom and the first match wins. An empty list means `allow *`; a non-empty list ends with an implicit `deny *`.

```
auth strong
# host names, with a wildcard at either end
deny * * *facebook.com,*instagram.com
# full access for one user
allow admin
# web ports only
allow alice,bob * * 80,443
# office LAN, Monday to Friday, working hours
allow * 192.168.1.0/24 * * * 1-5 08:00:00-18:00:00
```

Operations include `CONNECT`, `BIND`, `UDPASSOC`, `HTTP`, `HTTPS`, `HTTP_GET`, `HTTP_POST` and `FTP`. A host-name rule only matches when the client sends a host name, so pair it with address rules.

### Step 5: Several Services with Different Rules

`flush` empties the access list; without it, rules keep accumulating for every later service.

```
# LAN clients, no password
auth iponly
allow * 10.8.0.0/24
proxy -p3128 -i10.8.0.1
flush

# Internet-facing SOCKS5, password required
auth strong
allow alice,bob * * 80,443
socks -p1080 -i203.0.113.50
```

`-i` sets the listening address for one service and `-e` the outgoing address; the `internal` and `external` commands set them for every service that follows. Port forwarding: `tcppm -i127.0.0.1 2222 10.0.0.5 22` maps local port 2222 to SSH on 10.0.0.5.

### Step 6: Parent Proxies (Chaining and Rotation)

`parent` extends the `allow` rule directly above it — a `parent` with no preceding `allow` is a startup error. The first argument is a weight from 1 to 1000. Parents whose weights add up to 1000 form one group, and one member is picked at random per new connection. Every further 1000 adds another hop.

```
auth strong

# Rotation: one hop, chosen at random among three upstreams
allow alice
parent 334 socks5 198.51.100.11 1080 rotate Upstream-Pass-71
parent 333 socks5 198.51.100.12 1080 rotate Upstream-Pass-71
parent 333 socks5 198.51.100.13 1080 rotate Upstream-Pass-71

# Two-hop chain: SOCKS5 first, then an HTTP CONNECT proxy
allow bob
parent 1000 socks5 198.51.100.11 1080
parent 1000 connect 198.51.100.40 3128

proxy -p3128
```

Types: `socks4`, `socks5`, `connect` (HTTP CONNECT), `http`, `tcp`, `extip` (only sets the outgoing address). A trailing `+` (`socks5+`, `connect+`) lets the parent resolve host names; combine it with `fakeresolve`. A trailing `s` (`socks5s`, `https`) connects to the parent over TLS and needs `ssl_client_mode 3`. `parentretries 3` retries a failed parent.

### Step 7: Bandwidth, Connection and Traffic Limits

```
# simultaneous connections per service started below (default 100)
maxconn 1000
# alice: 5 parallel connections (period 0); bob: 120 new connections per 60 seconds
connlim 5 0 alice
connlim 120 60 bob
# rates are bits per second: 8 Mbit/s incoming for alice, 2 Mbit/s outgoing shared by everyone
bandlimin 8388608 alice
bandlimout 2097152 *

counter /count/3proxy.3cf
# counter 1: 51200 MB per month in both directions; counter 2: 2048 MB incoming per day
countall 1 M 51200 alice
countin 2 D 2048 bob
```

`connlim` takes a rate **and** a period. `countin`/`countout`/`countall` take a counter number (sequential, and unique across the config — `add3proxyuser` numbers the ones it writes to `/conf/counters` from 0), a period (`H`, `D`, `W`, `M`) and a limit in megabytes. One rule that lists several users or a CIDR gives them a shared limit; write one rule per user for individual limits. `maxconn` affects the services started after it; bandwidth limits and counters apply to every service.

### Step 8: Security Hardening

```
# bind explicitly instead of listening on every interface
internal 203.0.113.50
external 203.0.113.50
auth strong
deny * * 127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16
allow alice,bob * * 80,443
socks -p1080
```

Restrict the ports at the firewall as well:

```bash
sudo ufw allow from 198.51.100.0/24 to any port 1080 proto tcp
sudo ufw deny 1080/tcp
```

## Examples

### Example 1: Authenticated HTTP and SOCKS5 proxy for a small team

**User prompt:** "Set up 3proxy on our Ubuntu VPS at 203.0.113.50 with HTTP and SOCKS5. Create accounts for alice and bob with 50 GB of traffic a month each, web ports only, and give me (ops) full access."

```bash
sudo apt install 3proxy            # after adding the repository from Step 1
sudo add3proxyuser ops "$OPS_PROXY_PASSWORD"
sudo add3proxyuser alice "$ALICE_PROXY_PASSWORD"
sudo add3proxyuser bob "$BOB_PROXY_PASSWORD"
```

In `/etc/3proxy/conf/3proxy.cfg`, keep the `nserver`, `log`, `counter /count/3proxy.3cf` and `users $/conf/passwd` lines and replace everything from `auth strong` down (including `admin -p8080`):

```
countall 1 M 51200 alice
countall 2 M 51200 bob
auth strong
deny * * 127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
allow ops
allow alice,bob * * 80,443
proxy -p3128 -i203.0.113.50
socks -p1080 -i203.0.113.50
```

```bash
sudo systemctl restart 3proxy
curl -x http://alice:"$ALICE_PROXY_PASSWORD"@203.0.113.50:3128 https://ifconfig.me
```

Result: `curl` prints `203.0.113.50`. A request from alice to any port other than 80 or 443 is refused, and so is all of her traffic once the 51200 MB monthly counter is used up.

### Example 2: Rotate outgoing traffic across three upstream SOCKS5 proxies

**User prompt:** "Route everything from our scraper through three upstream SOCKS5 proxies at 198.51.100.11, .12 and .13 port 1080, user 'rotate', and listen locally on port 8080."

Remove the packaged service section (from `auth strong` down, including `admin -p8080`), then append the new one. The upstream password is read from the environment:

```bash
sudo add3proxyuser scraper "$SCRAPER_PROXY_PASSWORD"
sudo tee -a /etc/3proxy/conf/3proxy.cfg >/dev/null <<EOF
auth strong
allow scraper
parent 334 socks5 198.51.100.11 1080 rotate ${UPSTREAM_PROXY_PASSWORD}
parent 333 socks5 198.51.100.12 1080 rotate ${UPSTREAM_PROXY_PASSWORD}
parent 333 socks5 198.51.100.13 1080 rotate ${UPSTREAM_PROXY_PASSWORD}
proxy -p8080 -i127.0.0.1
EOF
sudo systemctl restart 3proxy
for i in 1 2 3 4; do curl -s -x http://scraper:"$SCRAPER_PROXY_PASSWORD"@127.0.0.1:8080 https://ifconfig.me; echo; done
```

Result: the printed address changes between the three upstreams from one connection to the next. With `%R` in `logformat`, each log record shows which upstream served the request.

## Guidelines

- A comment must start the line with `#`. Text after a command is parsed as arguments, and a line that starts with a space is ignored entirely — so never indent directives or append `# notes` to them.
- 3proxy has no config-check option. A bad line stops startup with a message such as `Command: 'connlim' wrong number of arguments , line 14`; read it with `journalctl -u 3proxy -n 20` and keep a copy of the working config before editing.
- Never expose a service with `auth none`: it is an open proxy, and ACLs, limits and parents are ignored. Use `auth strong` on public addresses and `auth iponly` only for trusted networks.
- `strong` authentication sends the password in clear text over plain HTTP and SOCKS5. Reach the proxy through a VPN or SSH tunnel, or use the built-in TLS server (`ssl_serv`, with `ssl_server_cert` and `ssl_server_key`).
- The `%E` field of a log record explains a refusal: `1` denied by a `deny` rule, `3` no rule matched, `4`–`8` missing user or wrong password, `10` traffic or connection limit exceeded, `13` connect failed.
- Deny loopback and private ranges before any `allow`, otherwise proxy users can reach services on the proxy host and its internal network.
- The packaged config also starts the web admin interface (`admin -p8080`). Remove that line or bind it with `-i127.0.0.1`.
- Parent weights must add up to a multiple of 1000. Three parents at 1000 each make a three-hop chain, not rotation.
- `bandlimin`/`bandlimout` rates are bits per second; multiply bytes per second by 8.
- Start the service as root and let the config drop privileges — the packaged launcher does `chroot /usr/local/3proxy proxy proxy`; in a custom config put `setgid` before `setuid`, after the last service on a privileged port.
- When you download a release file by hand, check it first: `sha256sum -c SHA256SUMS-x86_64 --ignore-missing`, and `gpg --verify SHA256SUMS-x86_64.asc SHA256SUMS-x86_64` with the project's release key.
- 3proxy is not a caching proxy and not a VPN: it does not cache responses or tunnel all of a device's traffic.
