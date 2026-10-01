---
name: wireshark
description: >-
  Captures and analyzes network traffic with Wireshark and tshark. Use when a
  user asks to sniff packets, debug a protocol, extract files from PCAPs,
  inspect TLS handshakes, troubleshoot network latency, or triage a CTF PCAP
  challenge.
license: Apache-2.0
compatibility: 'Wireshark 4.4 / 4.6 (tshark, dumpcap, editcap), Linux/macOS/Windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - wireshark
    - tshark
    - packet-analysis
    - network-forensics
    - pcap
  repository: https://gitlab.com/wireshark/wireshark
---

# Wireshark

## Overview

Wireshark is the dominant packet analyzer. It decodes 3000+ protocols and is the reference for anything from "why is this API slow?" to "extract the exfiltrated ZIP from this PCAP." `tshark` is the CLI companion — use it in scripts, over SSH, or when the capture is too large for the GUI. Capture filters (BPF) trim traffic at capture time; display filters refine what you see afterward. The current stable series is 4.6 (4.6.9); distributions still ship 4.4, and every command here works on both.

## Instructions

### Install and Allow Capture Without Root

```bash
sudo apt install tshark            # Debian/Ubuntu: CLI only; `wireshark` adds the GUI
brew install wireshark             # macOS: CLI tools; GUI: brew install --cask wireshark-app
winget install WiresharkFoundation.Wireshark   # Windows; live capture also needs Npcap (npcap.com),
                                               # which the silent install skips

# Debian/Ubuntu: let members of the `wireshark` group capture, then join it
sudo dpkg-reconfigure wireshark-common      # answer "Yes"
sudo usermod -a -G wireshark "$USER"        # log out and in again
```

Reading a capture file (`-r`) needs no privileges at all. Only the small `dumpcap` helper needs capture rights; running `tshark` or Wireshark itself as root is discouraged because all protocol dissectors then run as root. On macOS with the Homebrew formula, `brew install --cask wireshark-chmodbpf` grants the same access after a reboot (the `wireshark-app` cask already includes it, and the two casks conflict).

### Step 1: Capture Traffic

```bash
# List interfaces
tshark -D
# 1. eth0
# 2. any
# 3. lo (Loopback)

# Capture to a rolling ring buffer (never fill the disk)
tshark -i eth0 -b filesize:100000 -b files:10 -w capture.pcapng
# filesize in kB; keeps the last 10 × 100MB files, named capture_00001_20260411120117.pcapng ...

# Capture only relevant traffic using a BPF capture filter
tshark -i eth0 -f "host 10.0.0.5 and port 443" -w target.pcapng

# Stop after a packet count or after a number of seconds
tshark -i eth0 -c 1000 -w sample.pcapng
tshark -i eth0 -a duration:60 -w one-minute.pcapng

# On a server over SSH, pipe into local Wireshark
ssh deploy@web-01.internal "sudo tcpdump -U -s0 -w - 'not port 22'" | wireshark -k -i -
```

For unattended captures use `dumpcap` with the same `-i`, `-f`, `-b`, `-a` and `-w` options: it only writes packets and does not dissect them, so it uses little memory.

### Step 2: Filter in the GUI or CLI

```bash
# Display filters (different syntax from capture filters!)
# Capture filter: "tcp port 80"
# Display filter: "tcp.port == 80"

# Read a PCAP and apply a display filter
tshark -r capture.pcapng -Y "http.request.method == POST"
tshark -r capture.pcapng -Y "ip.src == 10.0.0.5 and tcp.flags.syn == 1"
tshark -r capture.pcapng -Y "dns.qry.name contains \"ledgerline.dev\""
tshark -r capture.pcapng -Y "tls.handshake.type == 1"  # Client Hello

# Common display filter cheatsheet
# http.request.uri contains "login"
# tcp.analysis.retransmission
# frame.time >= "2026-04-11 12:00:00"
# !(arp or icmp or dns)
```

### Step 3: Extract Useful Fields

```bash
# Pull specific fields as CSV for grep/awk pipelines, pandas or ClickHouse
tshark -r capture.pcapng -Y "http.request" -T fields \
  -e frame.time_epoch -e ip.src -e ip.dst -e tcp.dstport -e http.host -e http.request.uri \
  -E header=y -E separator=, -E quote=d
# "1100903354.172938000","10.1.1.101","10.1.1.1","80","10.1.1.1","/"
# (frame.time prints "Nov 19, 2004 ..." with a comma inside; use frame.time_epoch for CSV)

# Top talkers
tshark -r capture.pcapng -q -z conv,ip | head -20
tshark -r capture.pcapng -q -z endpoints,ip

# HTTP: packet counts by method and status, then every requested host and URI
tshark -r capture.pcapng -q -z http,tree
tshark -r capture.pcapng -q -z http_req,tree

# TLS server names (SNI) — reveals what hosts a client visited
tshark -r capture.pcapng -Y "tls.handshake.type == 1" \
  -T fields -e tls.handshake.extensions_server_name | sort -u
```

### Step 4: Extract Files and Credentials (from PCAPs you own)

```bash
# Export HTTP objects (images, scripts, downloads)
tshark -r capture.pcapng -q --export-objects http,./http-objects/   # -q: do not also print every packet
ls http-objects/

# Extract FTP-DATA transfers
tshark -r capture.pcapng -q --export-objects ftp-data,./ftp-files/

# Extract SMB file transfers (other types: tftp, imf, dicom — see --export-objects help)
tshark -r capture.pcapng -q --export-objects smb,./smb-files/

# Reconstruct a TCP stream (e.g., unencrypted protocol dump)
tshark -r capture.pcapng -q -z follow,tcp,ascii,0
# 0 is the stream index — list the indexes of interesting packets with
tshark -r capture.pcapng -Y "ftp-data" -T fields -e tcp.stream | sort -un
```

### Step 5: Decrypt TLS (with keys you legitimately control)

```bash
# Client-side: set SSLKEYLOGFILE before launching the browser
export SSLKEYLOGFILE="$HOME/tls-keys.log"
firefox &
# All session keys are appended as the browser negotiates TLS

# In Wireshark: Edit → Preferences → Protocols → TLS → "(Pre)-Master-Secret log filename"
# Or via CLI (write $HOME, not ~ — the shell does not expand ~ after the colon):
tshark -r traffic.pcapng -o "tls.keylog_file:$HOME/tls-keys.log" \
  -Y "http.request" -T fields -e http.host -e http.request.uri

# Embed the keys in the capture so it decrypts anywhere without the preference
editcap --inject-secrets tls,"$HOME/tls-keys.log" traffic.pcapng traffic-with-keys.pcapng
```

A capture with embedded keys exposes the plaintext to anyone who gets the file — share it accordingly.

## Examples

### Example 1: Diagnose a Slow API Call

User: "Requests from this box to api.ledgerline.dev take seconds from time to time. Is it the network?"

```bash
# Capture the client's traffic to the API host for one minute
tshark -i eth0 -f "host api.ledgerline.dev and port 443" -w slow-api.pcapng -a duration:60

# Retransmissions per second, and the packets themselves
tshark -r slow-api.pcapng -q -z io,stat,1,"tcp.analysis.retransmission"
tshark -r slow-api.pcapng -Y "tcp.analysis.retransmission or tcp.analysis.duplicate_ack" \
  -T fields -e frame.time -e ip.src -e ip.dst -e tcp.seq

# Round-trip time: average and worst ACK delay per 5-second interval
tshark -r slow-api.pcapng -q \
  -z io,stat,5,"AVG(tcp.analysis.ack_rtt)tcp.analysis.ack_rtt","MAX(tcp.analysis.ack_rtt)tcp.analysis.ack_rtt"
```

```
| Col 1: AVG(tcp.analysis.ack_rtt)tcp.analysis.ack_rtt |
|     2: MAX(tcp.analysis.ack_rtt)tcp.analysis.ack_rtt |
|------------------------------------------------------|
|          |1         |2         |                     |
| Interval |    AVG   |    MAX   |                     |
|--------------------------------|                     |
|  0 <>  5 | 0.173799 | 1.010145 |                     |
|  5 <> 10 | 0.000373 | 0.001779 |                     |
```

An interval with a one-second maximum next to sub-millisecond ones, plus retransmissions in the same seconds, points at packet loss on the path. Flat RTT with slow responses means the time is spent in the server: `-Y "tcp.analysis.ack_rtt > 0.1" -T fields -e tcp.stream -e ip.src -e tcp.analysis.ack_rtt` shows which side answers late.

### Example 2: CTF — Extract a File from a PCAP Challenge

User: "I got challenge.pcap from a CTF. There should be a file hidden in it."

```bash
# Quick triage
tshark -r challenge.pcap -q -z io,phs    # protocol hierarchy
tshark -r challenge.pcap -q -z conv,tcp  # conversations

# Something interesting on FTP
tshark -r challenge.pcap -Y "ftp.request.command == \"RETR\"" \
  -T fields -e ftp.request.arg
# backup.zip

# Pull the transferred file
tshark -r challenge.pcap -q --export-objects ftp-data,./ftp/
file ./ftp/*
# ./ftp/backup.zip: Zip archive data, made by v3.0 UNIX, extract using at least v1.0
```

The hierarchy shows `ftp` and `ftp-data` frames under `tcp`, the `RETR` filter names the file, and the export writes it under its original name. If the directory stays empty (tshark could not tie the data connection to a `RETR`), carve the data stream by hand (1 is the `tcp.stream` number of the `ftp-data` packets; the `grep` drops the header lines, which would otherwise corrupt the output): `tshark -r challenge.pcap -q -z follow,tcp,raw,1 | grep -E '^[[:space:]]*[0-9a-f]+$' | xxd -r -p > backup.zip`.

## Guidelines

- **Capture only what you are authorized to see.** On shared networks, traffic from other users is off-limits unless your ROE says otherwise.
- Capture filters are BPF syntax (`tcp port 443`). Display filters are Wireshark's own (`tcp.port == 443`). Mixing them up is the #1 beginner mistake.
- Do not capture with `sudo tshark`: besides the security risk, `dumpcap` then drops every privilege except packet capture, so `-w capture.pcapng` in a directory root does not own fails with "could not be opened: Permission denied". Use the `wireshark` group, or as a last resort write to a root-owned directory.
- For long captures, always use ring buffers (`-b filesize:N -b files:N`) so you never fill the disk.
- `.pcapng` is preferred over `.pcap` — it stores interface metadata, comments, and per-packet annotations.
- Big captures belong in `tshark` or editcap; the GUI becomes slow on multi-gigabyte files. Use `editcap -c 100000 big.pcapng part.pcapng` to split.
- TLS decryption needs a key log file from the client process; you cannot decrypt arbitrary TLS sessions without one.
- Captures contain credentials, cookies and personal data in the clear. Store and share them as sensitive files, and cut them down with a display filter first: `tshark -r capture.pcapng -Y "ip.addr == 10.0.0.5" -w subset.pcapng`.
- Companion tools: `dumpcap` (capture only), `tcpdump` (lighter capture), `mergecap` (combine PCAPs), `editcap` (slice), `capinfos` (summary).
