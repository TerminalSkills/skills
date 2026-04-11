---
title: "Investigate a Network Intrusion from a PCAP"
slug: investigate-network-intrusion-from-pcap
description: >-
  Triage a suspicious packet capture during an incident response: identify the
  scope of a network intrusion, extract exfiltrated files and malware payloads,
  reconstruct the attacker timeline, and produce evidence for the incident
  report. Uses Wireshark/tshark for protocol analysis and Foremost for carving
  artifacts out of the capture.
skills: [wireshark, foremost, nmap-recon]
category: devops
tags: [incident-response, dfir, network-forensics, pcap-analysis, threat-hunting]
---

# Investigate a Network Intrusion from a PCAP

## The Problem

An IDS alert fires at 03:14. Your NSM appliance already rolled up an hour of full-packet capture into a 4GB `.pcapng` file covering the suspect window. You have one question to answer before the 9 AM incident call: **what actually happened?** Specifically — which hosts were compromised, what did the attacker take out, what tooling did they use, and is the attack still live? Executive leadership wants a timeline. Legal wants the list of files that left the building. The blue team wants IoCs to block.

"Open the file in Wireshark and look around" is not a triage strategy on a 4GB capture. Scrolling random packets will burn an hour before you've answered any of those questions. You need to go top-down: protocol distribution → suspicious conversations → payloads and files → timeline. And you need to extract evidence — files, commands, binaries — as you go so legal and the SOC get something concrete by 9 AM.

## The Solution

Use **Wireshark** and its CLI companion **tshark** to pivot from a protocol hierarchy overview down to specific conversations, then **Foremost** to carve files directly out of the raw capture bytes regardless of protocol. Keep everything in a case directory with hashes so the chain of custody holds up. **Nmap** comes in at the end to sweep the suspect hosts for persistence. This workflow turns a 4GB blob into a narrative: who talked to whom, when, with what, and what left.

## Step-by-Step Walkthrough

### Step 1: Set Up the Case Directory and Preserve the Original

```bash
mkdir -p ~/cases/incident-2026-04-11/{evidence,carved,notes,report}
cd ~/cases/incident-2026-04-11

# Hash before you touch it — the hash goes in the final report
sha256sum /var/nsm/capture-0314.pcapng > evidence/original.sha256
cp /var/nsm/capture-0314.pcapng evidence/capture.pcapng
sha256sum evidence/capture.pcapng | diff - evidence/original.sha256
# Identical → chain of custody intact

# Log every command you run
script -a notes/session.log
```

### Step 2: Get the Big Picture with tshark Statistics

```bash
# What's in this capture, by protocol?
tshark -r evidence/capture.pcapng -q -z io,phs > notes/protocol-hierarchy.txt
head -30 notes/protocol-hierarchy.txt
#  eth              frames:2938412 bytes:3987142844
#    ip             frames:2938411 bytes:3987101234
#      tcp          frames:2412980 bytes:3601112222
#        tls        frames:1840003 bytes:2901823883
#        http       frames:  48221 bytes:  58712331
#        smb2       frames:  12802 bytes:  28111983      <-- unusual for the DMZ
#      udp          frames: 525430 bytes: 385989611
#        dns        frames:  98112 bytes:  19812441      <-- a lot of DNS

# Top talkers (IP conversations)
tshark -r evidence/capture.pcapng -q -z conv,ip \
  | head -30 > notes/top-talkers.txt

# Top TCP conversations
tshark -r evidence/capture.pcapng -q -z conv,tcp \
  | head -20 > notes/top-tcp.txt
```

Two red flags jump out: SMB2 in a zone that shouldn't see it, and a DNS volume that's an order of magnitude higher than baseline. Pivot into both.

### Step 3: Inspect the Suspicious DNS Traffic

```bash
# DNS query names and lengths — long subdomains suggest DNS tunneling
tshark -r evidence/capture.pcapng -Y "dns.qry.name" \
  -T fields -e frame.time -e ip.src -e dns.qry.name \
  | awk 'length($NF) > 60' \
  | head -50 > notes/long-dns.txt

cat notes/long-dns.txt | head
# ...  10.0.5.14  YWJjZGVmZ2hpamtsbW5vcGFxcnN0dXZ3eHl6MDEyMzQ1Njc4OQ.cdn.evil-c2.example
# ...  10.0.5.14  MTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6.cdn.evil-c2.example

# The label is base64-shaped. Decode a sample.
echo 'YWJjZGVmZ2hpamtsbW5vcGFxcnN0dXZ3eHl6MDEyMzQ1Njc4OQ' | base64 -d
# abcdefghijklmnopaqrstuvwxyz0123456789   <-- confirmed DNS exfil

# Unique IoC list for the SOC
awk '{print $NF}' notes/long-dns.txt \
  | grep -oE '[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+$' \
  | sort -u > notes/c2-domains.txt
```

### Step 4: Pull the SMB Session and Carve Any Transferred Files

```bash
# Which hosts are speaking SMB2?
tshark -r evidence/capture.pcapng -Y "smb2" \
  -T fields -e ip.src -e ip.dst | sort -u
# 10.0.5.14 -> 10.0.9.22    <-- user workstation talking to a file server

# File names that crossed the wire
tshark -r evidence/capture.pcapng -Y "smb2.filename" \
  -T fields -e frame.time -e smb2.filename \
  | tee notes/smb-files.txt
# ...  customers_q1.xlsx
# ...  payroll-2026.xlsx
# ...  contracts\2025\acme-msa.pdf

# Export SMB objects via tshark
mkdir -p carved/smb
tshark -r evidence/capture.pcapng \
  --export-objects smb,./carved/smb/
ls carved/smb/ | head
```

`tshark --export-objects` handles intact protocol transfers. Foremost catches what tshark misses — files embedded inside TLS sessions that were decrypted into the capture, files fragmented across protocols, and files dropped via tooling that doesn't follow SMB object boundaries.

```bash
# Broad file carving — magic byte signatures, protocol-agnostic
foremost -t all -i evidence/capture.pcapng -o carved/foremost

cat carved/foremost/audit.txt | head -40
# 0:  00000001.pdf  212 KB   5242880
# 1:  00000002.zip  1 MB     52428800     <-- archive of something
# 2:  00000003.exe  384 KB   78643200     <-- unexpected binary
# 3:  00000004.jpg   28 KB   94371840

# Inspect the carved binary — never execute it
file carved/foremost/exe/00000003.exe
sha256sum carved/foremost/exe/00000003.exe > notes/suspicious-binary.sha256
# Paste the hash into VirusTotal / internal sandbox, not the file itself.
```

### Step 5: Build the Attacker Timeline

```bash
# Normalize the events into a single timeline CSV
{
  echo "time,src,dst,event"
  tshark -r evidence/capture.pcapng -Y "smb2.filename" \
    -T fields -e frame.time_epoch -e ip.src -e ip.dst -e smb2.filename \
    | awk -F'\t' '{printf "%s,%s,%s,smb-file:%s\n", $1, $2, $3, $4}'
  tshark -r evidence/capture.pcapng -Y "dns.qry.name" \
    -T fields -e frame.time_epoch -e ip.src -e dns.qry.name \
    | awk -F'\t' 'length($NF) > 60 {printf "%s,%s,,dns-exfil:%s\n", $1, $2, $NF}'
} | sort -t, -k1,1n > notes/timeline.csv

head notes/timeline.csv
```

Convert the epoch column to ISO-8601 for the report, then paste the top 20 rows into the incident summary. The narrative at this point is: workstation `10.0.5.14` fetched internal files from the SMB file server, then used DNS tunneling to `cdn.evil-c2.example` to exfiltrate them. You have file names, sizes, hashes, C2 domains, and timestamps.

### Step 6: Check Whether the Attack Is Still Live

```bash
# Scan the suspect workstation for listening services and unexpected ports
sudo nmap -sV -sC -p- -T4 10.0.5.14 -oA notes/nmap-patient-zero
# Run this only from an authorized jump host inside the network.
# Look for: new listeners, unexpected admin shares, persistence via WMI/WinRM.

# Block the C2 domains immediately at the DNS sinkhole
while read d; do echo "$d IN A 127.0.0.1"; done < notes/c2-domains.txt \
  > notes/sinkhole-entries.zone
# Hand off to the SOC for deployment.
```

## Real-World Example

Kenji, a senior analyst on a 6-person incident response team, gets paged at 04:02 when an IDS alerts on repeated high-entropy DNS traffic from the finance VLAN. The on-duty SOC has already saved an hour of packet capture. By 04:20 Kenji has the PCAP opened in a case directory on his analysis VM, hashes preserved, and `tshark -q -z io,phs` running on the whole 4GB blob.

Within ten minutes he confirms DNS tunneling to a newly registered `.example` domain and unusual SMB file access from a finance workstation to the HR file share — a path that should be blocked by segmentation policy and clearly isn't. `tshark --export-objects smb` pulls three Excel files and a PDF straight out of the capture; Foremost independently carves the same files plus an unfamiliar 384KB EXE that was embedded in an encrypted session. The EXE hash matches a known commodity RAT signature in the team's internal malware database.

By 06:30 Kenji hands the SOC a timeline CSV, a hash of the carved binary, a list of C2 domains for the DNS sinkhole, and the list of files that touched the wire. The SOC isolates the workstation, the networking team updates the segmentation rule that should have blocked the SMB path in the first place, and legal gets the exact filenames they need to start the breach-notification analysis. The 9 AM incident bridge has facts instead of speculation — because the first two hours were spent carving and timelining, not scrolling through Wireshark.

## Related Skills

- [wireshark](../skills/wireshark/SKILL.md) — protocol hierarchy, display filters, object export
- [foremost](../skills/foremost/SKILL.md) — carve files out of raw capture bytes
- [nmap-recon](../skills/nmap-recon/SKILL.md) — follow-up scan of the suspect hosts
