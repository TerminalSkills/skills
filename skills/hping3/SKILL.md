---
name: hping3
description: >-
  Craft custom TCP/UDP/ICMP packets with hping3. Use when a user asks to
  test firewall rules, probe services with non-default flags, measure RTT
  to a TCP port, map open ports behind an ICMP-blocking host, or simulate
  packet patterns for network troubleshooting on systems they control.
license: Apache-2.0
compatibility: 'hping3 3.0.0-alpha-2, Linux'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - hping3
    - packet-crafting
    - network-testing
    - firewall-testing
    - penetration-testing
---

# hping3

## Overview

hping3 is a command-line TCP/IP packet crafter. Unlike `ping` (ICMP only), hping3 can send TCP, UDP, and raw IP packets with any flag combination, arbitrary payloads, spoofed sources, and fragmentation — useful for firewall auditing, ACL testing, reachability probes where ICMP is filtered, and low-level network experiments on your own infrastructure. It is interactive and scriptable.

## Instructions

### Step 1: Basic TCP/UDP/ICMP Probes

```bash
# TCP SYN ping to port 443 — works even when ICMP is dropped
sudo hping3 -S -p 443 -c 3 example.com
# -S: SYN flag
# -p: destination port
# -c: packet count

# TCP ACK ping — often passes stateful firewalls that drop SYN
sudo hping3 -A -p 80 -c 3 target.local

# UDP probe
sudo hping3 --udp -p 53 -c 3 ns.example.com

# Traceroute using TCP SYNs (ICMP-agnostic)
sudo hping3 --traceroute -V -S -p 443 example.com
```

### Step 2: Port Scan a Host that Blocks ICMP

```bash
# Sweep a port range with SYN packets
sudo hping3 -S -p ++80 -c 50 target.local
# ++80: increment destination port starting at 80
# Watch replies: SA=open, RA=closed, nothing=filtered

# Target a specific list of ports via a shell loop
for p in 22 80 443 3306 5432 6379; do
  sudo hping3 -S -p $p -c 1 target.local 2>&1 | grep -E 'flags|unreach'
done
```

### Step 3: Test Firewall and ACL Rules

```bash
# Confirm the firewall drops packets with a specific source port
sudo hping3 -S -s 53 -p 80 --keep -c 3 target.local
# -s 53     spoof source port 53
# --keep    don't randomize the source port between packets

# Confirm fragmented packets are allowed / blocked
sudo hping3 -S -p 80 -f -c 3 target.local
# -f: fragment the packet

# Verify whether the firewall lets through packets with the evil bit / reserved flags
sudo hping3 -S -p 80 --tcp-timestamp -c 3 target.local
```

### Step 4: Measure RTT Precisely to a TCP Port

```bash
# Per-packet RTT for a specific service (better than ping for SLA checks)
sudo hping3 -S -p 443 -c 20 -i u200000 api.example.com
# -i u200000: one packet every 200ms

# Summary at the end:
# --- api.example.com hping statistic ---
# 20 packets transmitted, 20 packets received, 0% packet loss
# round-trip min/avg/max = 12.3/14.1/18.7 ms
```

### Step 5: Scripted Use and Custom Payloads

```bash
# Send a custom payload from a file
sudo hping3 -S -p 80 -d 200 -E payload.bin target.local
# -d 200     data size 200 bytes
# -E file    read payload from file

# Listen mode — capture packets with a signature
sudo hping3 --listen 'HTTP' -I eth0

# Tcl scripting (hping3 embeds a Tcl interpreter)
sudo hping3 exec myscript.htcl
```

## Examples

### Example 1: Validate a New Firewall Rule

```bash
# The ops team just allowed TCP/5432 from the app tier to db.example.internal.
# Verify the rule without installing a real Postgres client on the test host.

# From an in-scope app host
sudo hping3 -S -p 5432 -c 5 db.example.internal
# Expected: SA flags (SYN+ACK) → port reachable and listening
# If RA (RST+ACK) → reachable but no listener
# If nothing → firewall is still dropping

# Negative control: prove TCP/6379 is still blocked
sudo hping3 -S -p 6379 -c 5 db.example.internal
# Expected: no response (100% loss) — rule is tight
```

### Example 2: Troubleshoot Asymmetric Latency

```bash
# App team reports "intermittent 500ms latency to api.example.com"
# ping shows steady 30ms but that's ICMP. Measure the real TCP path:

sudo hping3 -S -p 443 -c 200 -i u100000 api.example.com \
  | tee /tmp/hping-api.log

# Look for outliers
awk '/rtt/ {print $NF}' /tmp/hping-api.log | sort -n | tail -20
# 31.2 ms
# 32.0 ms
# 498.6 ms   <-- confirmed outlier
# 502.1 ms

# Traceroute via TCP to locate the slow hop
sudo hping3 --traceroute -V -S -p 443 api.example.com
```

## Guidelines

- **Only test networks and hosts you are authorized to touch.** Crafted packets trip IDS/IPS and can be read as an attack.
- `hping3` needs raw socket privileges — it's `sudo` or `CAP_NET_RAW`.
- Response interpretation: `SA`=SYN+ACK (open), `RA`=RST+ACK (closed), no reply=filtered. Learn these three by heart.
- Do not use source spoofing (`-a` / `--spoof`) across the public internet. Upstream filters drop it and it's illegal on networks you don't own.
- Flood mode (`--flood`) and high rates (`-i u1`) are denial-of-service tools. Do not use them on shared infrastructure — ever. They are here for lab/stress testing on your own gear only.
- For TCP RTT to a specific service, hping3 is more reliable than `ping` because it hits the actual listener.
- Modern replacements worth knowing: `nping` (Nmap's packet crafter — actively maintained) and `scapy` (programmable in Python). Reach for them when `hping3` falls short.
- Always pair packet crafting with a packet capture (`tshark`, `tcpdump`) on at least one end — it's how you confirm what actually hit the wire.
