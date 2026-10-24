---
name: iptables
description: >-
  iptables and nftables are the Linux kernel packet-filtering tools used to
  build host firewalls, open or block ports and set up NAT. Use when a user
  asks to set up a firewall on a Linux server, block or allow a port or IP,
  restrict SSH, configure masquerade or port forwarding, persist rules across
  reboots, migrate from iptables to nftables, or fix Docker and ufw conflicts.
license: Apache-2.0
compatibility: "Linux with root access; iptables 1.8+ (nf_tables backend) or nftables 1.0+; console or out-of-band access recommended"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://git.netfilter.org/nftables
  tags:
    - iptables
    - firewall
    - nftables
    - security
    - networking
---

# iptables / nftables

## Overview

Both tools filter packets with rules grouped into chains and tables. nftables is the current kernel framework, and the default backend behind `iptables` on Debian 10+ and RHEL 8+. Plain `iptables` on those systems is usually `iptables-nft` (check with `iptables --version`, which prints `(nf_tables)` or `(legacy)`), a compatibility front end that writes nftables rules. New setups should write nftables directly; `iptables` syntax is still common in existing guides, Docker and scripts. Releases checked: iptables 1.8.13, nftables 1.1.7 (October 2026). `nft -c` and `iptables-translate` were run here; applying rules needs root and was not done.

Rules are lost on reboot unless you persist them. A wrong default-drop rule on a remote machine cuts your own SSH session.

## Instructions

### Step 1: Inspect before changing

```bash
sudo nft list ruleset                  # everything, including rules iptables-nft created
sudo iptables -S                       # rules as commands
sudo iptables -L INPUT -n -v --line-numbers
```

### Step 2: nftables, a complete host firewall

Write `/etc/nftables.conf`. The `flush ruleset` line also removes tables created by Docker or fail2ban. On such hosts drop that line and, to reload cleanly, start the file with `table inet filter` and `delete table inet filter` so only your own table is replaced.

```nft
#!/usr/sbin/nft -f
flush ruleset

table inet filter {
    set admin_ips {
        type ipv4_addr
        flags interval
        elements = { 203.0.113.0/24 }
    }
    chain input {
        type filter hook input priority filter; policy drop;
        iif lo accept
        ct state established,related accept
        ct state invalid drop
        ip protocol icmp icmp type echo-request limit rate 5/second accept
        meta l4proto ipv6-icmp accept
        ip saddr @admin_ips tcp dport 22 accept
        tcp dport { 80, 443 } accept
        limit rate 5/minute log prefix "nft-drop: "
    }
    chain forward {
        type filter hook forward priority filter; policy drop;
    }
    chain output {
        type filter hook output priority filter; policy accept;
    }
}
```

`inet` covers IPv4 and IPv6 in one table. `ipv6-icmp` must stay open or IPv6 breaks (neighbor discovery). Check the syntax, load it, and enable it at boot:

```bash
sudo nft -c -f /etc/nftables.conf        # check only, nothing is applied
sudo nft -f /etc/nftables.conf
sudo systemctl enable --now nftables     # Debian/Ubuntu: loads /etc/nftables.conf at boot
# RHEL family: the service reads /etc/sysconfig/nftables.conf, so put your rules (or an include line) there
```

### Step 3: iptables, the equivalent

Order matters: accept rules first, drop policy last, and add the SSH rule before changing the policy.

```bash
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A INPUT -m conntrack --ctstate INVALID -j DROP
sudo iptables -A INPUT -p tcp --dport 22 -s 203.0.113.0/24 -j ACCEPT
sudo iptables -A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
sudo iptables -A INPUT -p icmp --icmp-type echo-request -m limit --limit 5/second -j ACCEPT
sudo iptables -P INPUT DROP
sudo iptables -P FORWARD DROP
```

`iptables` handles IPv4 only. Repeat the rules with `ip6tables` (and allow `-p ipv6-icmp`), otherwise IPv6 stays wide open. Insert with `-I INPUT 1 ...` to put a rule at the top, delete with `-D INPUT 3` (the number from `--line-numbers`).

Persist the rules:

```bash
sudo apt install iptables-persistent       # Debian/Ubuntu, asks to save current rules
sudo netfilter-persistent save             # rewrites /etc/iptables/rules.v4 and rules.v6
sudo dnf install iptables-services && sudo service iptables save   # RHEL family
```

Validate a saved file before loading it: `sudo iptables-restore --test < /etc/iptables/rules.v4`.

### Step 4: ufw, the shortcut

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw limit 22/tcp                          # allows SSH, rate-limits repeated attempts
sudo ufw allow 443/tcp
sudo ufw allow from 10.0.0.0/8 to any port 5432 proto tcp
sudo ufw enable
sudo ufw status verbose
```

### Step 5: Translate old rules

```bash
iptables-translate -A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
# nft 'add rule ip filter INPUT ip protocol tcp tcp dport { 80, 443 } counter accept'
sudo iptables-save | iptables-restore-translate -f /dev/stdin   # whole ruleset
```

Matches with no nft equivalent, such as `-m recent`, are printed as comments and need a manual rewrite (use a set with a timeout or `limit`).

## Examples

### Example 1: "Lock down a new web server, SSH only from the office"

Use the Step 2 file with the office range in `admin_ips`. Before applying it over SSH, schedule an automatic rollback so a mistake cannot lock you out:

```bash
sudo nft list ruleset > /root/nft-before.conf
echo 'nft flush ruleset; nft -f /root/nft-before.conf' | sudo at now + 3 minutes
sudo nft -f /etc/nftables.conf
# open a second SSH session; if it works, cancel the rollback:
sudo atrm $(sudo atq | awk '{print $1}')   # needs the 'at' package; jobs queued with sudo belong to root
```

Result: ports 80 and 443 answer for everyone, port 22 only for 203.0.113.0/24, everything else is silently dropped.

### Example 2: "Share my server's connection with a VPN subnet (NAT)"

```bash
echo 'net.ipv4.ip_forward=1' | sudo tee /etc/sysctl.d/90-forward.conf
sudo sysctl --system
sudo nft add table ip nat
sudo nft 'add chain ip nat postrouting { type nat hook postrouting priority srcnat; policy accept; }'
sudo nft add rule ip nat postrouting oifname "eth0" ip saddr 10.8.0.0/24 masquerade
```

The forward chain also needs `iifname "wg0" oifname "eth0" accept` and `ct state established,related accept`, because its policy is drop. Result: clients in 10.8.0.0/24 reach the internet with the server's address. Save with `sudo nft list ruleset | sudo tee /etc/nftables.conf` and add the shebang and `flush ruleset` lines back.

## Guidelines

- Never set `-P INPUT DROP` or load a drop-policy file on a remote machine without an SSH accept rule and a timed rollback (Example 1) or console access.
- Do not mix tools. ufw, firewalld, Docker, fail2ban and hand-written rules all edit the same kernel tables. Pick one owner for the filter rules.
- Docker publishes ports through its own chains, ahead of ufw. A container with `-p 8080:80` is reachable even when ufw denies 8080. Bind it to `127.0.0.1:8080:80`, or filter with rules in the `DOCKER-USER` chain, which Docker evaluates first and never overwrites.
- Counting rules and `LOG` are useful for debugging; remove or rate-limit them, since a flood of drops can fill the disk.
- Use sets (`{ 80, 443 }`, named sets with `flags interval`) instead of one rule per address; a rule list scales linearly.
- `iptables -F` removes rules but keeps the chain policy. With `-P INPUT DROP` still set, flushing blocks all inbound traffic including SSH; run `-P INPUT ACCEPT` first.
- Prefer a cloud security group or hardware firewall for the outer layer; host rules are the second layer, not the only one.
