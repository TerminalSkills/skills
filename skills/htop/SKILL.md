---
name: htop
description: >-
  htop is an interactive process viewer for Linux, macOS and BSD that shows CPU,
  memory and per-process usage live, with filtering, tree view and kill/renice
  from the keyboard. Use when a user asks to check CPU or memory usage, find
  resource-hungry processes, monitor server performance, or diagnose system
  bottlenecks, together with vmstat, iostat, ss and similar tools.
license: Apache-2.0
compatibility: 'Linux, macOS, BSD'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags: "htop, monitoring, processes, performance, linux"
  repository: https://github.com/htop-dev/htop
---

# htop / System Monitoring

## Overview

htop is an interactive, ncurses-based process viewer (current release 3.5.3, August 2026). It runs on Linux, macOS, FreeBSD and other Unixes, needs no agent, and lets you sort, filter, tree-view, trace and signal processes without typing PIDs. Combined with `free`, `vmstat`, `iostat`, `ss` and friends it covers most live "why is this box slow" questions.

Install it from the system package manager: `sudo apt install htop`, `sudo dnf install htop`, `brew install htop`, `sudo pacman -S htop`.

## Instructions

### Step 1: Process monitoring

```bash
htop                          # interactive viewer
htop -u deploy                # only processes of user "deploy" (plain -u means yourself)
htop -p 1234,5678             # only these PIDs
htop -F nginx                 # filter by command text; "nginx|php-fpm" matches either
htop -s PERCENT_MEM           # start sorted by memory (-s help lists the columns)
htop -t                       # start in tree view
htop -d 20 -H                 # refresh every 2 s (delay is in tenths of a second), highlight new processes
htop --readonly               # look but cannot kill or renice (safe on shared hosts)
```

Keys inside htop:

| Key | Action |
|-----|--------|
| F5 or `t` | tree view (toggle) |
| F6 or `<` `>` | choose sort column; `I` inverts; `P` CPU, `M` memory, `T` time, `N` PID |
| F3 or `/` | search the command lines; F3 again for the next match |
| F4 or `\` | filter the list to matching commands (Esc in the filter to clear) |
| `u` | show one user's processes |
| Space, `c` | tag a process; `c` tags it with its children; `U` untags all |
| F9 or `k` | send a signal to the selected or tagged processes (pick SIGTERM first) |
| F7 / F8 | lower / raise nice value (lowering needs root) |
| `s`, `l` | strace and lsof of the selected process, when those tools are installed |
| `F` | follow the selected process as the sort order moves it |
| `K`, `H` | hide kernel threads, hide user threads |
| F2 | setup: meters, columns, colour scheme (saved in `~/.config/htop/htoprc`) |

Reading the screen: the `S` column shows `R` running, `S` sleeping, `D` uninterruptible disk wait (many of these means an I/O stall), `Z` zombie. `RES` is real memory used, `VIRT` is address space and is usually meaningless on its own, `SHR` is shared.

### Step 2: Resource analysis

```bash
# CPU and memory overview (Linux)
free -h                    # memory; read the "available" column
uptime                     # load average for 1, 5 and 15 minutes
nproc                      # number of CPU cores
vmstat 1 5                 # run queue, swap in/out (si/so), I/O wait (wa), 5 samples

# Disk I/O (iostat comes from the sysstat package)
iostat -x 1                # per-device utilisation and latency
sudo iotop -o              # only processes doing I/O right now (needs root)

# Network
sudo nethogs               # bandwidth per process (needs root)
sudo iftop                 # bandwidth per connection (needs root)
ss -tlnp                   # listening TCP sockets with owning process
ss -ulnp                   # listening UDP sockets
```

On macOS use `sysctl -n hw.ncpu`, `vm_stat` and `iostat -w 1`; `free`, `nproc`, `iotop` and `ps --sort` are Linux (procps) tools.

### Step 3: Quick diagnostics script

```bash
#!/bin/bash
# scripts/server-status.sh — quick health check on Linux
echo "=== CPU load ($(nproc) cores) ==="
uptime

echo -e "\n=== Memory ==="
free -h

echo -e "\n=== Disk ==="
df -h /

echo -e "\n=== Top 5 CPU processes ==="
ps aux --sort=-%cpu | head -6

echo -e "\n=== Top 5 memory processes ==="
ps aux --sort=-%mem | head -6

echo -e "\n=== Listening sockets ==="
ss -tulnp
```

## Examples

**"The server is slow, what is eating the CPU?"** Run `htop`, press `P` to sort by CPU, and look at the top rows. Compare the load average in the header with the core count (`nproc`). If one row sits at 100% CPU, press F9 and choose SIGTERM (15) first; use SIGKILL (9) only if it ignores that. For a process that is a child of a supervisor, press F5 first to see which parent will respawn it.

**"Memory is almost full, which service leaks?"** Run `free -h` and check that "available" is low, not just "free". Then `htop -s PERCENT_MEM` (or press `M`) and watch the `RES` column over a few minutes; a process whose `RES` only grows is the suspect. Press `F` to keep it selected while the list reshuffles.

**"Find everything my deploy user runs that is related to node."** `htop -u deploy -F node`, then F5 for the tree. Tag the stale ones with Space and kill them together with F9.

## Guidelines

- A load average above the number of cores means runnable or blocked tasks are queuing; if CPU is idle but load is high, look for `D` states and I/O wait (`vmstat`, `iostat -x`).
- In `free -h` read "available", not "free": Linux uses spare RAM as cache.
- Do not trust `VIRT`; use `RES` or the `PSS` column (add it in F2 setup) to compare processes.
- htop shows other users' processes but kill, renice and some columns (such as EXE) need root or matching privileges. Prefer `--readonly` when you only want to look.
- Check the process and its parent before sending a signal; killing a worker that a supervisor restarts changes nothing.
- htop is a live view. For history pair it with Prometheus and Grafana or Netdata; for a single snapshot use `ps`. `btop` is a similar viewer with disk and network panels.
