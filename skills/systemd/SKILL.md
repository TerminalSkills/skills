---
name: systemd
description: >-
  Manage Linux services with systemd: write unit files, run an app on boot,
  restart it when it crashes, read its logs with journalctl, and schedule jobs
  with timers instead of cron. Use when a user asks to create a systemd service,
  run a background process on boot, set up a systemd timer, configure
  dependencies or auto-restart, or harden a service.
license: Apache-2.0
compatibility: 'Linux with systemd 240+ (Ubuntu, Debian, RHEL and Fedora families, Arch); root or sudo for system units'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/systemd/systemd
  tags:
    - systemd
    - linux
    - services
    - daemon
    - process-management
---

# systemd

## Overview

systemd is the init system and service manager on mainstream Linux distributions. Services, timers, sockets and mounts are described by declarative unit files; systemd starts them in dependency order, restarts them on failure, applies resource limits and sandboxing, and collects their output in the journal. Unit files for your own services live in `/etc/systemd/system/` (system) or `~/.config/systemd/user/` (per-user, managed with `systemctl --user`). Syntax below was checked with `systemd-analyze verify` on systemd 255.

## Instructions

### Step 1: Create a service

```ini
# /etc/systemd/system/orders-api.service
[Unit]
Description=Orders API (Node.js)
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=exec
User=deploy
Group=deploy
WorkingDirectory=/opt/orders-api
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/etc/orders-api/env

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/orders-api/uploads

# Resource limits
MemoryMax=512M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
```

Notes: `ExecStart` needs an absolute path; `Type=exec` reports failure if the binary cannot start (`Type=simple` does not); use `Type=notify` for programs that signal readiness; `Wants=` is a soft dependency, `Requires=` a hard one; keep secrets in the `EnvironmentFile` (mode 0600, owned by root), not in the unit. `After=` only orders startup, it does not pull the other unit in.

### Step 2: Manage the service

```bash
sudo systemd-analyze verify /etc/systemd/system/orders-api.service   # catch typos first
sudo systemctl daemon-reload                  # after creating or editing any unit file
sudo systemctl enable --now orders-api        # start now and on every boot
systemctl status orders-api                   # state, recent log lines, main PID
sudo systemctl restart orders-api
sudo systemctl edit orders-api                # drop-in override instead of editing the original
journalctl -u orders-api -f                   # follow logs
journalctl -u orders-api --since "1 hour ago" -p err
journalctl -u orders-api -b                   # since the last boot
systemctl --failed                            # every unit that failed
```

### Step 3: Timers (cron replacement)

```ini
# /etc/systemd/system/db-backup.timer
[Unit]
Description=Nightly database backup

[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/db-backup.service  (same base name, started by the timer)
[Unit]
Description=Database backup

[Service]
Type=oneshot
User=deploy
ExecStart=/opt/scripts/backup.sh
```

```bash
systemd-analyze calendar "Mon..Fri *-*-* 03:00"   # check when an expression fires
sudo systemctl enable --now db-backup.timer        # enable the timer, not the service
systemctl list-timers --all
```

## Examples

**Example 1: "Run my Node app on boot and restart it if it crashes"**

Create `orders-api.service` as in Step 1, then `sudo systemctl daemon-reload && sudo systemctl enable --now orders-api`. Result: `systemctl status orders-api` shows `active (running)`; `sudo kill -9 $(systemctl show -p MainPID --value orders-api)` makes it come back after 5 seconds.

**Example 2: "Replace my nightly cron backup"**

Create `db-backup.service` and `db-backup.timer` from Step 3 and enable the timer. Result: `systemctl list-timers` shows the next run at 03:00 plus up to 10 minutes of random delay; a missed run (machine off) executes at next boot because of `Persistent=true`; output is in `journalctl -u db-backup`.

## Guidelines

- Run `daemon-reload` after every unit file change; `systemctl status` warns when the file changed on disk.
- Prefer `Restart=on-failure` for services that may exit cleanly on purpose; `Restart=always` also restarts after a normal stop request from the app. After too many fast failures systemd stops retrying (`StartLimitBurst`, `StartLimitIntervalSec`); fix the crash, then `systemctl reset-failed`.
- Run services as an unprivileged user (`User=` or `DynamicUser=yes`) and add sandboxing; `systemd-analyze security orders-api` scores the unit and lists what to tighten. `ProtectSystem=strict` makes the filesystem read-only except `ReadWritePaths=`.
- Change vendor units with `systemctl edit` drop-ins, never by editing files under `/usr/lib/systemd/system`.
- Logs go to stdout/stderr and the journal; the journal can be volatile unless `/var/log/journal` exists or `Storage=persistent` is set in `journald.conf`.
- Times in `OnCalendar` use the system timezone; use `systemd-analyze calendar` to test.
