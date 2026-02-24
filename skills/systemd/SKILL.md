---
name: systemd
description: >-
  Manage Linux services with systemd. Use when a user asks to create a system
  service, run an app on boot, manage background processes, set up timers
  (cron replacement), or configure service dependencies and auto-restart.
license: Apache-2.0
compatibility: 'Linux (systemd-based: Ubuntu, Debian, CentOS, Fedora, Arch)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - systemd
    - linux
    - services
    - daemon
    - process-management
---

# systemd

## Overview

systemd manages Linux services — start, stop, restart, enable on boot, and monitor processes. It replaces init scripts with declarative unit files. Handles dependencies, auto-restart, logging (journald), resource limits, and timers (cron replacement).

## Instructions

### Step 1: Create a Service

```ini
# /etc/systemd/system/myapp.service — Node.js app as a system service
[Unit]
Description=My Node.js Application
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/opt/myapp
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/opt/myapp/.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/myapp/uploads

# Resource limits
MemoryMax=512M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
```

### Step 2: Manage Service

```bash
sudo systemctl daemon-reload          # reload after editing unit files
sudo systemctl enable myapp            # start on boot
sudo systemctl start myapp             # start now
sudo systemctl status myapp            # check status
sudo systemctl restart myapp           # restart
sudo systemctl stop myapp              # stop
journalctl -u myapp -f                 # view live logs
journalctl -u myapp --since "1 hour ago"  # recent logs
```

### Step 3: Timer (Cron Replacement)

```ini
# /etc/systemd/system/backup.timer — Run backup daily at 3 AM
[Unit]
Description=Daily Backup Timer

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/backup.service — The actual backup job
[Unit]
Description=Database Backup

[Service]
Type=oneshot
User=deploy
ExecStart=/opt/scripts/backup.sh
```

```bash
sudo systemctl enable --now backup.timer
systemctl list-timers                    # list active timers
```

## Guidelines

- Always run `daemon-reload` after changing unit files.
- Use `Restart=always` for production services — systemd auto-restarts on crash.
- `journalctl -u service -f` is the primary log viewer — replaces checking log files.
- Timers are better than cron: persistent (catch up missed runs), dependency-aware, logged.
