---
name: kali-linux
description: >-
  Use Kali Linux for authorized penetration testing, security research, and
  CTF work. Use when a user asks about installing Kali, setting up a pentest
  lab, picking tools from the Kali toolchain, using Kali in WSL/Docker/VM, or
  updating the distribution.
license: Apache-2.0
compatibility: 'Kali Linux 2024+, WSL2, Docker, VMware, VirtualBox'
metadata:
  author: terminal-skills
  version: 1.0.0
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

Kali Linux is a Debian-based distribution maintained by Offensive Security with 600+ preinstalled tools for penetration testing, digital forensics, reverse engineering, and red teaming. Use Kali as a disposable lab environment — VM snapshots, Docker containers, or WSL2 — never as a daily driver. Tools are organized into Kali Metapackages (e.g., `kali-tools-top10`, `kali-tools-wireless`, `kali-tools-web`) so you install only what you need.

## Instructions

### Step 1: Install Kali

```bash
# Docker (fastest for CTF and quick work)
docker run -it --rm kalilinux/kali-rolling
# Inside the container:
apt update && apt install -y kali-linux-headless

# WSL2 on Windows
wsl --install -d kali-linux
wsl -d kali-linux
sudo apt update && sudo apt install -y kali-linux-default

# Bare VM — download ISO or prebuilt image
# https://www.kali.org/get-kali/ — use the "Virtual Machines" tab
```

### Step 2: Update and Install Tool Groups

```bash
# Keep Kali current — rolling release
sudo apt update && sudo apt full-upgrade -y

# Metapackages — install by category, not tool-by-tool
sudo apt install -y kali-tools-top10       # nmap, metasploit, burp, hydra, john, sqlmap, wireshark, aircrack-ng, hashcat, crackmapexec
sudo apt install -y kali-tools-web         # sqlmap, wfuzz, nikto, dirb, gobuster, zaproxy
sudo apt install -y kali-tools-wireless    # aircrack-ng, reaver, wifite, bully, pixiewps
sudo apt install -y kali-tools-passwords   # john, hashcat, hydra, medusa, cewl, crunch
sudo apt install -y kali-tools-forensics   # foremost, binwalk, autopsy, volatility3, sleuthkit

# List all metapackages
apt-cache search kali-tools
```

### Step 3: Set Up a Safe Lab Environment

```bash
# Isolate Kali on a host-only network in VirtualBox/VMware
# The pentest network must NOT route to the internet or your LAN

# Vulnerable targets for practice (run in the same isolated network)
docker run -d --rm -p 80:80 vulnerables/web-dvwa       # Damn Vulnerable Web App
docker run -d --rm -p 3000:3000 bkimminich/juice-shop  # OWASP Juice Shop
docker run -d --rm -p 8080:8080 citizenstig/nowasp     # Mutillidae II

# Metasploitable 3 — vulnerable Windows/Linux VMs
# https://github.com/rapid7/metasploitable3

# HackTheBox and TryHackMe give you remote labs — use OpenVPN from Kali
sudo openvpn ~/lab.ovpn
```

### Step 4: Daily Workflow

```bash
# Snapshot before every engagement (VirtualBox)
VBoxManage snapshot "Kali" take "pre-engagement-$(date +%F)"

# Case directory — keep every engagement self-contained
mkdir -p ~/cases/acme-2026-04/{recon,exploits,loot,notes,reports}
cd ~/cases/acme-2026-04

# Log everything with script(1)
script -a notes/session-$(date +%F-%H%M).log
# ... run commands ...
exit  # stops logging

# Common tool entry points (all on PATH on Kali)
nmap -sV -sC -oA recon/nmap target.example.com
msfconsole -q -r notes/msf-resume.rc
wireshark &
```

### Step 5: Minimize Footprint and Tear Down

```bash
# Remove tools you don't use to cut attack surface on the Kali box itself
sudo apt autoremove --purge -y $(dpkg -l | grep kali-tools- | awk '{print $2}' | grep -v top10)

# Clean caches before archiving the VM
sudo apt clean
history -c && rm -f ~/.bash_history ~/.zsh_history

# Restore snapshot after the engagement
VBoxManage snapshot "Kali" restore "pre-engagement-2026-04-11"
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
nmap -sV -oA scan 10.10.10.5
# Container disappears on exit — loot/ persists on host
```

### Example 2: Prepare Kali for a Web App Assessment

```bash
sudo apt update
sudo apt install -y kali-tools-web burpsuite zaproxy

# Verify the tools are on PATH
which sqlmap nikto gobuster ffuf wfuzz burpsuite

# Wordlists ship in /usr/share/wordlists (rockyou.txt.gz needs extraction)
sudo gunzip /usr/share/wordlists/rockyou.txt.gz
ls /usr/share/wordlists/
```

## Guidelines

- **Written authorization first.** Using Kali tools against systems you don't own or have explicit permission to test is a crime in most jurisdictions.
- Treat Kali as ephemeral. Use VM snapshots or Docker so you can reset after each engagement.
- Never run Kali as your daily OS. Root-by-default and aggressive tools are a poor fit for general use.
- Use metapackages (`kali-tools-*`) instead of cherry-picking — they track dependencies the Kali team already validated.
- Keep the lab network isolated (host-only or internal network) so stray scans can't reach production or the public internet.
- Kali is rolling release — `apt full-upgrade` weekly. If it breaks, roll back the snapshot.
- `/usr/share/wordlists/` has rockyou, seclists, dirb, and more. Install `seclists` for the full set.
- For client reporting, pair Kali with `faraday` or `dradis` instead of ad-hoc notes.
