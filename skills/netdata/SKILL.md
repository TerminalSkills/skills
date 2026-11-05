---
name: netdata
description: >-
  Netdata is a real-time host and container monitoring agent that collects thousands of per-second metrics with no setup, ships hundreds of ready-made alerts, and serves a dashboard and REST API from one local process. Use it when asked to "monitor this server", "install Netdata", "add a disk or RAM alert", "pull CPU numbers from Netdata", "export metrics to Prometheus", or "why is this box slow right now".
license: Apache-2.0
compatibility: "Linux or Docker 24+; Netdata 2.x (tested with v2.12.3); curl and python3 for the API examples"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "netdata, monitoring, observability, alerts, metrics"
  repository: https://github.com/netdata/netdata
---

# Netdata — per-second monitoring with alerts out of the box

## Overview

Netdata is a single agent per machine. It auto-detects what runs on the host (CPU, memory, disks, network, systemd, containers, and hundreds of applications such as nginx, PostgreSQL or Redis), stores metrics locally, evaluates built-in alert rules, and exposes everything on port 19999: a web dashboard and an HTTP API. An agent's work with it falls into four jobs: install the agent safely, tune the configuration (`netdata.conf`, collector files, health alert files), read metrics and alert state through the API, and forward metrics to other tools.

The configuration directory is `/etc/netdata` (inside the Docker image too). Files there override the stock files in `/usr/lib/netdata/conf.d`. The `edit-config` script in `/etc/netdata` copies a stock file into place before opening it; use it instead of editing stock files.

Do not claim the node to Netdata Cloud from an agent session: that needs the user's account and token. The local dashboard and API work without any account.

## Instructions

### Install with Docker (preferred)

Pin the image tag and bind the published port to loopback:

```bash
docker run -d --name netdata --restart unless-stopped \
  -p 127.0.0.1:19999:19999 \
  --cap-add SYS_PTRACE --cap-add SYS_ADMIN --security-opt apparmor=unconfined \
  -e DO_NOT_TRACK=1 \
  -v netdataconfig:/etc/netdata -v netdatalib:/var/lib/netdata -v netdatacache:/var/cache/netdata \
  -v /etc/os-release:/host/etc/os-release:ro \
  -v /proc:/host/proc:ro -v /sys:/host/sys:ro \
  netdata/netdata:v2.12.3
```

`DO_NOT_TRACK=1` turns off anonymous telemetry. Mount `/var/run/docker.sock` read-only only if the user wants container names resolved; that socket is root-equivalent access, so ask first. Wait about 20 seconds, then check `curl -s http://127.0.0.1:19999/api/v1/info`.

### Install on the host

Use a package-manager or the official kickstart script, downloaded and read before it runs. Never pipe it into a shell:

```bash
curl -fsSL https://get.netdata.cloud/kickstart.sh -o /tmp/netdata-kickstart.sh
less /tmp/netdata-kickstart.sh        # review
sh /tmp/netdata-kickstart.sh --non-interactive --stable-channel --disable-telemetry
```

This needs root and installs a systemd unit named `netdata`. Verify with `netdata -v` and `systemctl status netdata`.

### Keep the dashboard private

The Docker command above already publishes on loopback. For a host install set the bind address in `/etc/netdata/netdata.conf`, then restart:

```ini
[web]
    bind to = 127.0.0.1
```

Check the effective value with `netdatacli dumpconfig | grep -A3 '^\[web\]'`. To reach a remote server use an SSH tunnel (`ssh -L 19999:127.0.0.1:19999 ops@10.0.4.12`) or a reverse proxy with authentication. The agent has no login of its own.

### Query metrics through the REST API

Charts have an id such as `system.cpu` or `system.ram`. List them with `/api/v1/charts`. Frequently used calls (all verified on v2.12.3):

```bash
B=http://127.0.0.1:19999
# last 60 s of CPU, averaged into one point per dimension, as JSON
curl -s "$B/api/v1/data?chart=system.cpu&after=-60&points=1&group=average&format=json"
# the same as CSV
curl -s "$B/api/v1/data?chart=system.ram&after=-300&points=5&format=csv"
# wrap the answer with metadata (units, dimension names)
curl -s "$B/api/v1/data?chart=system.ram&after=-60&points=1&format=json&options=jsonwrap"
# every current value in Prometheus text format, or as shell variables
curl -s "$B/api/v1/allmetrics?format=prometheus&help=no"
curl -s "$B/api/v1/allmetrics?format=shell" | grep NETDATA_SYSTEM_CPU
```

`after=-60` means "from 60 seconds ago" (a window longer than the agent's uptime returns an empty answer, so a fresh install cannot answer `after=-300` for the first five minutes); `points` sets how many rows come back; `group` is the aggregation (`average`, `max`, `sum`...). The newer v2 API (`/api/v2/data`, `/api/v2/nodes`, `/api/v2/alerts`) serves multi-node and context queries and is what the dashboard uses. Its parameters differ from v1, so inspect the response before scripting against it. Point a Prometheus scrape job at `/api/v1/allmetrics?format=prometheus` to export host metrics.

### Read alert state

```bash
curl -s "$B/api/v1/alarms"            # only raised alerts (WARNING or CRITICAL)
curl -s "$B/api/v1/alarms?all"        # every alert with status and current value
curl -s "$B/api/v1/alarm_log?after=0" # history of status changes
```

Alert keys are the chart id, a dot, then the alert name, for example `system.ram.low_available_ram`, with `status` of `CLEAR`, `WARNING`, `CRITICAL`, `UNINITIALIZED` or `UNDEFINED`. An empty `alarms` object from the first call means nothing is raised.

### Write a custom alert

Put files in `/etc/netdata/health.d/` (inside the container: `docker exec netdata ...`). A file with a name equal to a stock one replaces it. A new alert:

```text
 alarm: low_available_ram
    on: system.ram
lookup: average -1m percentage of free
 units: %
 every: 30s
  warn: $this < 15
  crit: $this < 5
  info: Free RAM, one-minute average
    to: sysadmin
```

Reload without a restart and confirm the alert exists:

```bash
netdatacli reload-health
sleep 90      # the 1-minute lookup needs a minute of data; the status is UNINITIALIZED until then
curl -s "http://127.0.0.1:19999/api/v1/alarms?all" | python3 -c "import json,sys; print(json.load(sys.stdin)['alarms']['system.ram.low_available_ram']['status'])"
```

Use `template:` instead of `alarm:` with `on: <context>` to apply a rule to every chart of one context (for example every disk). Notification channels (email, Slack, PagerDuty...) are set in `health_alarm_notify.conf`: run `/etc/netdata/edit-config health_alarm_notify.conf` and set the role recipients. Never print the webhook URLs back.

### Tune collectors

Application collectors (the `go.d` plugin) read `/etc/netdata/go.d/<module>.conf`, and plugin switches live in `go.d.conf`. Open one with `./edit-config go.d/postgres.conf` from `/etc/netdata`, add a job with its URL or DSN, and restart the agent (`systemctl restart netdata` or `docker restart netdata`). Take credentials from a dedicated read-only monitoring user. Check the plugin logs afterwards (`journalctl -u netdata`, or `docker logs netdata`) for a "failed" or "check failed" line for the job.

## Examples

### 1. Monitor a small VPS privately and get a RAM warning

**Request:** "Set up Netdata on the staging box so I can see CPU and RAM, and warn me when free memory drops under 15%."

```bash
docker run -d --name netdata --restart unless-stopped -p 127.0.0.1:19999:19999 \
  --cap-add SYS_PTRACE --cap-add SYS_ADMIN --security-opt apparmor=unconfined \
  -e DO_NOT_TRACK=1 -v /etc/os-release:/host/etc/os-release:ro \
  -v /proc:/host/proc:ro -v /sys:/host/sys:ro netdata/netdata:v2.12.3
sleep 25
curl -s http://127.0.0.1:19999/api/v1/info | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'], d['alarms'])"
```

Then create `low-available-ram.conf` as shown above in `/etc/netdata/health.d/` (`docker cp low-available-ram.conf netdata:/etc/netdata/health.d/`) and run `docker exec netdata netdatacli reload-health`; the new alert reports `UNINITIALIZED` for about a minute while it collects data. **Result:** the first command prints `v2.12.3 {'normal': 168, 'warning': 0, 'critical': 0}` (counts vary by host); the new alert is listed by `/api/v1/alarms?all` and appears under `/api/v1/alarms` once free memory crosses the threshold.

### 2. Answer "is the server busy right now?" from the API

**Request:** "What has CPU been doing over the last five minutes, and is anything alerting?"

```bash
B=http://127.0.0.1:19999
curl -s "$B/api/v1/data?chart=system.cpu&after=-300&points=1&group=average&format=csv"
curl -s "$B/api/v1/alarms" | python3 -c "import json,sys; a=json.load(sys.stdin)['alarms']; print([(k,v['status']) for k,v in a.items()] or 'no active alerts')"
```

**Result:** one CSV row with the five-minute average for each CPU dimension (user, system, iowait, softirq...) and either `no active alerts` or a list such as `[('system.ram.low_available_ram', 'WARNING')]`. Report the highest dimension and the alert names; do not guess a cause from one number.

## Guidelines

- Bind to loopback or a private interface and put authentication in front of any remote access. The dashboard and API are unauthenticated and expose process names, mounts and network details.
- Use the Docker image with a pinned tag; avoid `latest` so a restart does not upgrade the agent unexpectedly.
- Change configuration in `/etc/netdata`, never in `/usr/lib/netdata/conf.d` (overwritten by upgrades).
- Mounting the Docker socket or running privileged gives the container host-level power. Only add what a feature needs.
- Local retention is bounded by the disk budget in `netdata.conf`. For long history, export to Prometheus or stream to a parent node, and check the configured limits before promising a retention period.
- Alert thresholds in examples are starting points. Check what the stock rules already cover (`/api/v1/alarms?all`) before adding a duplicate.
- Netdata watches resources; it does not replace log search or an external uptime check (see Uptime Kuma) that notices when the whole host is down.
