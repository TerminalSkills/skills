---
name: htop
description: >-
  Monitor system resources with htop and related tools. Use when a user asks
  to check CPU/memory usage, find resource-hungry processes, monitor server
  performance, or diagnose system bottlenecks.
license: Apache-2.0
compatibility: 'Linux, macOS'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - htop
    - monitoring
    - processes
    - performance
    - linux
---

# htop / System Monitoring

## Overview

htop is an interactive process viewer for Linux. Combined with other CLI tools (top, vmstat, iostat, iotop, nethogs), it provides comprehensive real-time system monitoring without installing external agents.

## Instructions

### Step 1: Process Monitoring

```bash
htop                      # interactive process viewer
htop -u deploy            # filter by user
htop -p 1234,5678         # monitor specific PIDs

# Inside htop:
# F5 = tree view (parent/child processes)
# F6 = sort by column
# F9 = kill process
# / = search
# Space = tag process
```

### Step 2: Resource Analysis

```bash
# CPU and memory overview
free -h                    # memory usage (human-readable)
uptime                     # load average (1, 5, 15 min)
nproc                      # number of CPU cores

# Disk I/O
iostat -x 1                # disk I/O stats, 1 second interval
iotop                      # top for disk I/O (shows which process reads/writes)

# Network
nethogs                    # bandwidth per process
ss -tulnp                  # listening ports with process names
iftop                      # bandwidth per connection
```

### Step 3: Quick Diagnostics Script

```bash
#!/bin/bash
# scripts/server-status.sh — Quick health check
echo "=== CPU Load ==="
uptime

echo -e "\n=== Memory ==="
free -h

echo -e "\n=== Disk ==="
df -h /

echo -e "\n=== Top 5 CPU Processes ==="
ps aux --sort=-%cpu | head -6

echo -e "\n=== Top 5 Memory Processes ==="
ps aux --sort=-%mem | head -6

echo -e "\n=== Listening Ports ==="
ss -tulnp | grep LISTEN
```

## Guidelines

- Load average > number of CPU cores = system is overloaded.
- `free -h`: look at "available" column, not "free" (Linux uses free RAM for cache).
- Use `dstat` for combined CPU/disk/net stats in one view.
- For historical monitoring, pair with Prometheus + Grafana or Netdata.
