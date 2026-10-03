---
name: kali-linux
description: >-
  Use Kali Linux for authorized penetration testing, security research, and
  CTF work. Use when a user asks about installing Kali, setting up a pentest
  lab, picking tools from the Kali toolchain, using Kali in WSL/Docker/VM, or
  updating the distribution.
license: Apache-2.0
compatibility: 'Kali Linux 2025+ (rolling), WSL2, Docker, VMware, VirtualBox'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://gitlab.com/kalilinux
  category: devops
  tags:
    - kali-linux
    - penetration-testing
    - security
    - ctf
    - lab-setup
---

# Kali Linux

## Overview

Kali Linux is a Debian-based distribution maintained by OffSec (formerly Offensive Security) with hundreds of tools for penetration testing, digital forensics, reverse engineering, and red teaming. Use Kali as a disposable lab environment — VM snapshots, Docker containers, or WSL2 — never as a daily driver. Tools are organized into Kali Metapackages (e.g., `kali-tools-top10`, `kali-tools-wireless`, `kali-tools-web`) so you install only what you need.

## Instructions

### Step 1: Install Kali

```bash
# Docker (fastest for CTF and quick work); the image ships almost no tools
docker run -it --rm kalilinux/kali-rolling
# Inside the container (you are root, no sudo needed):
apt update && apt install -y kali-linux-headless
# kalilinux/kali-last-release tracks the last point release instead of rolling

# WSL2 on Windows (PowerShell)
wsl --install -d kali-linux
wsl -d kali-linux
sudo apt update && sudo apt install -y kali-linux-default   # optional; add kali-win-kex for a GUI

# Bare VM — download the ISO or prebuilt VM image from https://www.kali.org/get-kali/
# and verify its SHA256 against the published checksum before use. Installer and VM
# images create a non-root user (kali / kali for prebuilt VMs); change the password at once
```

### Step 2: Update and Install Tool Groups

```bash
# Keep Kali current — rolling release
sudo apt update && sudo apt full-upgrade -y

# Metapackages — install by category, not tool-by-tool
sudo apt install -y kali-tools-top10       # aircrack-ng, burpsuite, hydra, john, metasploit-framework, netexec, nmap, responder, sqlmap, wireshark
sudo apt install -y kali-tools-web         # 50+ web assessment tools, from nikto and gobuster to zaproxy
sudo apt install -y kali-tools-wireless    # 802.11, Bluetooth, RFID and SDR tools
sudo apt install -y kali-tools-passwords   # hashcat, john, hydra, medusa and more
sudo apt install -y kali-tools-forensics   # data recovery, artifact analysis, reverse engineering
# System sets: kali-linux-core, kali-linux-headless, kali-linux-default, kali-linux-large, kali-linux-everything

# List all metapackages
apt-cache search kali-tools
```

### Step 3: Set Up a Safe Lab Environment

```bash
# Isolate Kali on a host-only network in VirtualBox/VMware
# The pentest network must NOT route to the internet or your LAN

# Vulnerable targets for practice (run in the same isolated network)
# Publish on 127.0.0.1 only: these apps are deliberately insecure
docker run -d --rm -p 127.0.0.1:3000:3000 bkimminich/juice-shop   # OWASP Juice Shop
# DAMN Vulnerable Web App: follow https://github.com/digininja/DVWA (docker compose file included)

# Metasploitable 3 — vulnerable Windows/Linux VMs
# https://github.com/rapid7/metasploitable3

# Hack The Box and TryHackMe give you remote labs — connect with the OpenVPN file
# from your account: sudo openvpn ~/htb-lab.ovpn
```

### Step 4: Daily Workflow

```bash
# Snapshot before every engagement (VirtualBox)
VBoxManage snapshot "Kali" take "pre-engagement-$(date +%F)"

# Case directory — keep every engagement self-contained
mkdir -p ~/cases/northwind-2026-10/{recon,exploits,loot,notes,reports}
cd ~/cases/northwind-2026-10

# Log everything with script(1)
script -a notes/session-$(date +%F-%H%M).log
# ... run commands ...
exit  # stops logging

# Common tool entry points (all on PATH on Kali)
nmap -sV -sC -oA recon/nmap 10.10.10.5
msfconsole -q -r notes/msf-resume.rc
wireshark &
```

### Step 5: Tear Down

```bash
# Prefer resetting over cleaning: restore the pre-engagement snapshot
VBoxManage snapshot "Kali" restore "pre-engagement-2026-10-03"

# Before archiving a VM, clear caches and shell history
sudo apt clean
history -c && rm -f ~/.bash_history ~/.zsh_history

# Docker lab containers are removed with --rm; remove leftovers
docker ps -a
```

## Examples

### Example 1: Spin Up a Throwaway Kali Container for a CTF

```bash
docker run -it --rm \
  -v "$PWD/ctf-loot:/root/loot" \
  --name ctf \
  kalilinux/kali-rolling bash

# Inside:
apt update && apt install -y nmap hydra john sqlmap curl
cd /root/loot
nmap -sV -oA scan 10.10.10.5   # target from your CTF platform
# Container disappears on exit — loot/ persists on host
```

### Example 2: Prepare Kali for a Web App Assessment

```bash
sudo apt update
sudo apt install -y kali-tools-web

# Verify the tools are on PATH
which sqlmap nikto gobuster burpsuite zaproxy

# Wordlists ship in /usr/share/wordlists (rockyou.txt.gz needs extraction)
sudo gunzip /usr/share/wordlists/rockyou.txt.gz
ls /usr/share/wordlists/
```

## Guidelines

- **Written authorization first.** Using Kali tools against systems you don't own or have explicit permission to test is a crime in most jurisdictions.
- Treat Kali as ephemeral. Use VM snapshots or Docker so you can reset after each engagement.
- Never run Kali as your daily OS. It is built for offensive tooling, not general use. Installer and VM images use a normal user (Kali dropped root-by-default in 2020), while Docker containers run as root.
- Use metapackages (`kali-tools-*`) instead of cherry-picking — they track dependencies the Kali team already validated.
- Keep the lab network isolated (host-only or internal network) so stray scans can't reach production or the public internet.
- Kali is rolling release — `apt full-upgrade` weekly, never plain `apt upgrade`. If it breaks, roll back the snapshot. Docker images lack systemd, so `systemctl` does not work in them.
- `/usr/share/wordlists/` has rockyou, seclists, dirb, and more. Install `seclists` for the full set.
- For client reporting, pair Kali with `faraday` or `dradis` instead of ad-hoc notes.
