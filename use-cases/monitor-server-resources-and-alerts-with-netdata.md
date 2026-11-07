---
title: Monitor Server Resources and Alerts on a Small VPS
slug: monitor-server-resources-and-alerts-with-netdata
description: Put per-second CPU, memory and disk monitoring with early-warning alerts on a small production server, kept private behind an SSH tunnel.
skills:
  - netdata
category: devops
tags:
  - netdata
  - monitoring
  - alerts
  - metrics
  - docker
  - linux
---

# Monitor Server Resources and Alerts on a Small VPS

## The Problem

Tomás is the only developer at a small online shop. The store, its worker and a Postgres database share one 4 GB virtual server. Twice this quarter the site slowed to a crawl in the evening and then recovered by itself. The second time he logged in too late: the logs showed the kernel had killed the worker for running out of memory, but nobody could say what had eaten the RAM or how long it had been building.

The hosting panel only shows five-minute CPU graphs. A full Prometheus and Grafana stack feels like more infrastructure than the shop itself. Tomás wants graphs that go down to the second, a few sensible alerts without writing rules for every disk and process, and nothing publicly reachable.

## The Solution

The agent installs **Netdata** from a pinned Docker image bound to loopback, so the dashboard is only reachable through an SSH tunnel. The stock health rules cover memory, disk space and many other conditions from the first minute; the agent adds one custom early-warning rule for memory and then answers "what happened?" questions through the local REST API instead of a browser.

## Step-by-Step Walkthrough

### Step 1: Start the agent on loopback

Prompt to the agent: "Install Netdata on the shop server so I can look at it from my laptop. Nothing should be reachable from the internet, and turn off telemetry."

```bash
docker run -d --name netdata --restart unless-stopped \
  -p 127.0.0.1:19999:19999 \
  --cap-add SYS_PTRACE --cap-add SYS_ADMIN --security-opt apparmor=unconfined \
  -e DO_NOT_TRACK=1 \
  -v netdataconfig:/etc/netdata -v netdatalib:/var/lib/netdata -v netdatacache:/var/cache/netdata \
  -v /etc/os-release:/host/etc/os-release:ro -v /proc:/host/proc:ro -v /sys:/host/sys:ro \
  netdata/netdata:v2.12.3
sleep 25
curl -s http://127.0.0.1:19999/api/v1/info | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'], d['alarms'])"
```

The last line prints the version and the number of built-in alerts that are currently normal, warning or critical. Tomás opens the dashboard with `ssh -L 19999:127.0.0.1:19999 tomas@203.0.113.40` and then `http://127.0.0.1:19999` in his browser.

### Step 2: See what the built-in alerts already say

Prompt: "Which alerts are raised right now?"

```bash
curl -s http://127.0.0.1:19999/api/v1/alarms | python3 -c "
import json,sys
a=json.load(sys.stdin)['alarms']
for name,v in a.items(): print(name, v['status'], v['value'], v['units'])
print(len(a), 'raised')"
```

An empty result means nothing is raised. The agent also lists the full set once with `/api/v1/alarms?all`, so later additions do not duplicate stock rules.

### Step 3: Add an early-warning memory alert

Prompt: "Warn me while there is still time to react, when free memory stays under 15% for a minute."

```bash
cat > low-available-ram.conf <<'EOF'
 alarm: low_available_ram
    on: system.ram
lookup: average -1m percentage of free
 units: %
 every: 30s
  warn: $this < 15
  crit: $this < 5
  info: Free RAM, one-minute average
    to: sysadmin
EOF
docker cp low-available-ram.conf netdata:/etc/netdata/health.d/low-available-ram.conf
docker exec netdata netdatacli reload-health
sleep 90
curl -s "http://127.0.0.1:19999/api/v1/alarms?all" | python3 -c "import json,sys; print(json.load(sys.stdin)['alarms']['system.ram.low_available_ram']['status'])"
```

The check prints `UNINITIALIZED` for the first minute while the alert collects data, then `CLEAR` on a healthy server. To receive e-mail or Slack messages, the agent opens `/etc/netdata/health_alarm_notify.conf` with `edit-config` inside the container and sets the recipients for the `sysadmin` role, using a webhook URL Tomás keeps in his password manager.

### Step 4: Investigate an incident from the API

Prompt: "Last night around 21:00 the site was slow. What did memory and CPU look like?"

```bash
B=http://127.0.0.1:19999
curl -s "$B/api/v1/data?chart=system.ram&after=-43200&before=-39600&points=12&group=max&format=csv"
curl -s "$B/api/v1/data?chart=system.cpu&after=-43200&before=-39600&points=12&group=max&format=csv"
curl -s "$B/api/v1/alarm_log?after=0" | head -c 1500
```

Each CSV has one row per 10 minutes for the chosen hour. The agent reads the `used` and `cached` columns of the RAM chart, the `iowait` and `user` columns of the CPU chart, and the recent alert transitions, then reports the window where memory climbed.

## Real-World Example

On the third evening after install, the new alert moved to WARNING at 20:52 with 13% memory free. Tomás's agent queried the last 30 minutes through the API: `used` had grown by about 150 MB every five minutes since a nightly report export started, while CPU stayed under 20%. The agent pointed at the export script, Tomás changed it to stream rows in batches of 5,000, and the following evening the RAM chart stayed flat at 61% used. The built-in disk-space alert caught a log directory at 87% a week later, before it caused any trouble.

## Related Skills

- [netdata](/skills/netdata) — installs the agent, defines the health alert and reads metrics and alert state through the API
