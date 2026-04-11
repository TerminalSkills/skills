---
name: wireshark
description: >-
  Capture and analyze network traffic with Wireshark and tshark. Use when a
  user asks to sniff packets, debug a protocol, extract files from PCAPs,
  inspect TLS handshakes, troubleshoot network latency, or triage a CTF PCAP
  challenge.
license: Apache-2.0
compatibility: 'Wireshark 4.x, tshark, Linux/macOS/Windows'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - wireshark
    - tshark
    - packet-analysis
    - network-forensics
    - pcap
---

# Wireshark

## Overview

Wireshark is the dominant packet analyzer. It decodes 3000+ protocols and is the reference for anything from "why is this API slow?" to "extract the exfiltrated ZIP from this PCAP." `tshark` is the CLI companion — use it in scripts, over SSH, or when the capture is too large for the GUI. Capture filters (BPF) trim traffic at capture time; display filters refine what you see afterward.

## Instructions

### Step 1: Capture Traffic

```bash
# List interfaces
tshark -D
# 1. eth0
# 2. wlan0
# 3. lo (Loopback)

# Capture to a rolling ring buffer (never fill the disk)
sudo tshark -i eth0 -b filesize:100000 -b files:10 -w capture.pcapng
# filesize in KB; keeps the last 10 × 100MB files

# Capture only relevant traffic using a BPF capture filter
sudo tshark -i eth0 -f "host 10.0.0.5 and port 443" -w target.pcapng

# Capture with packet count limit
sudo tshark -i eth0 -c 1000 -w sample.pcapng

# On a server over SSH, pipe into local Wireshark
ssh user@host "sudo tcpdump -U -s0 -w - 'not port 22'" | wireshark -k -i -
```

### Step 2: Filter in the GUI or CLI

```bash
# Display filters (different syntax from capture filters!)
# Capture filter: "tcp port 80"
# Display filter: "tcp.port == 80"

# Read a PCAP and apply a display filter
tshark -r capture.pcapng -Y "http.request.method == POST"
tshark -r capture.pcapng -Y "ip.src == 10.0.0.5 and tcp.flags.syn == 1"
tshark -r capture.pcapng -Y "dns.qry.name contains \"example.com\""
tshark -r capture.pcapng -Y "tls.handshake.type == 1"  # Client Hello

# Common display filter cheatsheet
# http.request.uri contains "login"
# tcp.analysis.retransmission
# frame.time >= "2026-04-11 12:00:00"
# !(arp or icmp or dns)
```

### Step 3: Extract Useful Fields

```bash
# Pull specific fields as TSV for grep/awk/jq pipelines
tshark -r capture.pcapng -T fields \
  -e frame.time -e ip.src -e ip.dst -e tcp.dstport -e http.host -e http.request.uri \
  -Y "http.request" -E header=y -E separator=,
# Output: CSV you can load in pandas or ClickHouse

# Top talkers
tshark -r capture.pcapng -q -z conv,ip | head -20

# HTTP request list
tshark -r capture.pcapng -q -z http,tree

# TLS server names (SNI) — reveals what hosts a client visited
tshark -r capture.pcapng -Y "tls.handshake.type == 1" \
  -T fields -e tls.handshake.extensions_server_name | sort -u
```

### Step 4: Extract Files and Credentials (from PCAPs you own)

```bash
# Export HTTP objects (images, scripts, downloads)
tshark -r capture.pcapng --export-objects http,./http-objects/
ls http-objects/

# Extract FTP-DATA transfers
tshark -r capture.pcapng --export-objects ftp-data,./ftp-files/

# Extract SMB file transfers
tshark -r capture.pcapng --export-objects smb,./smb-files/

# Reconstruct a TCP stream (e.g., unencrypted protocol dump)
tshark -r capture.pcapng -q -z follow,tcp,ascii,0
# 0 is the stream index — find it first with -Y "tcp.stream eq 0"
```

### Step 5: Decrypt TLS (with keys you legitimately control)

```bash
# Client-side: set SSLKEYLOGFILE before launching the browser
export SSLKEYLOGFILE=~/tls-keys.log
firefox &
# All session keys are appended as the browser negotiates TLS

# In Wireshark: Edit → Preferences → Protocols → TLS → "(Pre)-Master-Secret log filename"
# Or via CLI:
tshark -r traffic.pcapng -o tls.keylog_file:~/tls-keys.log \
  -Y "http.request" -T fields -e http.host -e http.request.uri
```

## Examples

### Example 1: Diagnose a Slow API Call

```bash
# Capture the client's traffic to the API host
sudo tshark -i eth0 -f "host api.example.com and port 443" -w slow-api.pcapng -a duration:60

# Look for retransmissions and RTT issues
tshark -r slow-api.pcapng -q -z io,stat,1,"tcp.analysis.retransmission"
tshark -r slow-api.pcapng -Y "tcp.analysis.retransmission or tcp.analysis.duplicate_ack" \
  -T fields -e frame.time -e ip.src -e ip.dst -e tcp.seq

# Identify high latency conversations
tshark -r slow-api.pcapng -q -z conv,tcp | sort -k6 -n -r | head
```

### Example 2: CTF — Extract a File from a PCAP Challenge

```bash
# Quick triage
tshark -r challenge.pcap -q -z io,phs    # protocol hierarchy
tshark -r challenge.pcap -q -z conv,tcp  # conversations

# Something interesting on FTP
tshark -r challenge.pcap -Y "ftp.request.command == \"RETR\"" \
  -T fields -e ftp.request.arg

# Pull the transferred file
tshark -r challenge.pcap --export-objects ftp-data,./ftp/
file ./ftp/*
# flag.zip: Zip archive data, at least v2.0
```

## Guidelines

- **Capture only what you are authorized to see.** On shared networks, traffic from other users is off-limits unless your ROE says otherwise.
- Capture filters are BPF syntax (`tcp port 443`). Display filters are Wireshark's own (`tcp.port == 443`). Mixing them up is the #1 beginner mistake.
- For long captures, always use ring buffers (`-b filesize:N -b files:N`) so you never fill the disk.
- `.pcapng` is preferred over `.pcap` — it stores interface metadata, comments, and per-packet annotations.
- Big captures belong in `tshark` or editcap; the GUI chokes past ~1GB. Use `editcap -c 100000` to split.
- TLS decryption needs a key log file from the client process; you cannot decrypt arbitrary TLS sessions without one.
- For long-term packet storage, use `tcpdump -U -w` on the server and analyze offline in Wireshark.
- Companion tools: `tcpdump` (lighter capture), `mergecap` (combine PCAPs), `editcap` (slice), `capinfos` (summary).
