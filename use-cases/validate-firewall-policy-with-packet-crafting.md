---
title: "Validate Firewall Policy with Packet Crafting"
slug: validate-firewall-policy-with-packet-crafting
description: >-
  Prove (and disprove) firewall and network ACL rules in production by
  sending crafted TCP/UDP/ICMP packets with hping3, cross-checking reachability
  with Nmap, and confirming what actually traverses the wire with Wireshark.
  Catches misconfigured rules, asymmetric paths, and overly permissive
  allow-lists before the next auditor or attacker does.
skills: [hping3, nmap-recon, wireshark]
category: devops
tags: [firewall, network-testing, acl-validation, packet-crafting, infrastructure]
---

# Validate Firewall Policy with Packet Crafting

## The Problem

Firewall rules live in two places: the config file, where they are declarative and confident, and on the wire, where the truth lives. The two diverge constantly. A rule gets added "temporarily" and never removed. Two rules of opposite intent are applied in the wrong order. Egress is tight but ingress is a sieve. A brand-new VPC has a "deny all" at the bottom that silently masks three wide-open rules above it. Someone migrates a service behind a new NAT and the source-IP-based ACL that used to keep everything tidy now sees the whole world as one address.

You cannot find any of these by reading the config. You need to actually send packets — from realistic positions in the network, with realistic flags, and watch what gets through. `ping` is not enough: most firewalls drop ICMP and most of the interesting rules are TCP/UDP. A port scan from outside is not enough either: you need to test from every policy position (DMZ, app tier, db tier, remote VPN, partner peering) and you need both positive tests (this should pass) and negative tests (this should be blocked).

## The Solution

Use **hping3** to send exactly the packets you want — specific source ports, SYN vs ACK, fragmented, UDP, ICMP — from every position in the network that matters. Cross-check with **Nmap** for broader sweeps and service-version confirmation. Capture the traffic on one end with **Wireshark/tshark** so you can tell "no response" (firewall dropped it) from "RST" (reached the host but no listener) from "SYN-ACK" (reached the host and the service is up). The result is a matrix that maps intended policy against observed behavior, with evidence for each cell — the kind of artifact that makes audits short.

## Step-by-Step Walkthrough

### Step 1: Draft the Policy Matrix Before Sending Packets

Start from the declared policy, not from the config. For each network boundary you care about, build a matrix of (source, destination, protocol, port, expected). The matrix is the test plan.

```text
From            -> To                  Proto  Port   Expected
app-tier        -> db.example.internal TCP    5432   allow
app-tier        -> db.example.internal TCP    6379   deny  (Redis moved to private subnet)
dmz             -> app.example.internal TCP    443    allow
dmz             -> app.example.internal TCP    22     deny  (SSH is jump-host only)
vpn             -> jump.example.internal TCP   22     allow
internet        -> db.example.internal  *      *      deny
internet        -> app.example.internal TCP    443    allow
partner-peering -> api.example.internal TCP    443    allow
partner-peering -> api.example.internal TCP    80     deny  (HTTPS only)
```

Every row becomes one positive test (from allowed sources it should pass) and, for deny rows, one negative test (from any source it should be blocked).

### Step 2: Run Positive Tests with hping3 from Authorized Source Hosts

Positive tests prove the rule lets the right traffic through. Run them from a source host that is in scope.

```bash
# From app-tier jump host -> db (TCP/5432 should be allowed)
sudo hping3 -S -p 5432 -c 5 db.example.internal
# len=46 ip=10.0.9.22 ttl=62 id=0 sport=5432 flags=SA seq=0 win=64240 rtt=1.1 ms
# 5 packets transmitted, 5 received, 0% packet loss
# SA = SYN+ACK = port is reachable AND a listener is on it. PASS.

# From dmz -> app (TCP/443 should be allowed)
sudo hping3 -S -p 443 -c 5 app.example.internal

# From vpn host -> jump (TCP/22 should be allowed)
sudo hping3 -S -p 22 -c 5 jump.example.internal

# Edge case: verify the rule still allows TCP with a non-default source port
sudo hping3 -S -s 34567 -p 5432 --keep -c 3 db.example.internal
# Some overly-strict firewalls break on non-ephemeral source ports.
```

Flag interpretation cheat sheet — commit it to memory:

| Response | Meaning |
|---|---|
| `flags=SA` (SYN+ACK) | Reached host, service listening — rule allows, service up |
| `flags=RA` (RST+ACK) | Reached host, no listener — rule allows, service down |
| No reply / timeout | Firewall dropped the packet — rule denies |
| `ICMP unreach` | Something in the path actively rejected it |

### Step 3: Run Negative Tests — the Rules That Should Block

Negative tests are the half most people skip, and they're where real findings live.

```bash
# From the public internet (use a cloud VM outside the org) -> db
# Should time out completely.
sudo hping3 -S -p 5432 -c 5 db.example.com
# 5 packets transmitted, 0 received, 100% packet loss — PASS (rule blocks)

# From dmz -> app on port 22 — should NOT be allowed
sudo hping3 -S -p 22 -c 5 app.example.internal
# flags=SA ← FINDING: DMZ can reach SSH on the app server. Policy says it shouldn't.

# From partner-peering -> api on TCP/80 (HTTPS-only rule)
sudo hping3 -S -p 80 -c 5 api.example.internal
# flags=SA ← FINDING: legacy plain-HTTP listener reachable. Either close the listener
#           or confirm the rule truly intended to allow both 80 and 443.

# Fragmented probe — a classic way to bypass weak stateful firewalls
sudo hping3 -S -f -p 5432 -c 3 db.example.com
# Should behave identically to the unfragmented test.
```

### Step 4: Cross-Check with Nmap for Breadth and Service Identification

hping3 answers narrow questions with precision; Nmap answers broad questions with speed. Use both.

```bash
# From each source position, a full TCP sweep to the destinations in scope
sudo nmap -sS -Pn -p- --min-rate 1000 \
  -oA scans/dmz-to-app app.example.internal
# Compare the "open" ports against the declared policy.

# Service-version probes confirm what's actually listening
sudo nmap -sV -sC -p 22,80,443,5432,6379 \
  -oA scans/from-app-tier db.example.internal

# UDP sweep — most people forget this and miss exposed SNMP/NTP/DNS
sudo nmap -sU --top-ports 50 \
  -oA scans/dmz-to-app-udp app.example.internal
```

Diff the Nmap `-oG` output with the declared policy. Any `open` port that isn't in the policy matrix is a finding; any `allowed` row that shows `filtered` is either an outage or a stale rule.

### Step 5: Confirm on the Wire with tshark / Wireshark

Reachability tests are one-ended: you sent the packet, and you saw (or didn't see) a response. When the path crosses multiple firewalls, NAT devices, or cloud security groups, you want to confirm what actually arrived on the far side. Capture on the destination (or on a span port near it) while you rerun the probe.

```bash
# On the destination host, during the probe
sudo tshark -i eth0 -f "host <source-ip> and tcp" -w capture/pol-test.pcapng -a duration:60

# Back on the source, rerun
sudo hping3 -S -p 5432 -c 5 db.example.internal

# Inspect the capture
tshark -r capture/pol-test.pcapng -Y "tcp.flags.syn == 1 and tcp.flags.ack == 0" \
  -T fields -e frame.time -e ip.src -e ip.dst -e tcp.dstport

# Four useful patterns to look for:
# - SYN arrived, no SYN-ACK sent → host-local firewall or listener down
# - SYN arrived, SYN-ACK sent, but source never saw it → return-path broken (asymmetric)
# - No SYN arrived at all → upstream firewall dropped it (as intended for deny rules)
# - Retransmissions without RST → stateful firewall holding the flow open weirdly
```

### Step 6: Compile the Report

```markdown
# Firewall Policy Validation — 2026-04-11

| Source | Destination | Proto | Port | Expected | Observed | Status |
|---|---|---|---|---|---|---|
| app-tier | db.example.internal | TCP | 5432 | allow | SYN+ACK | PASS |
| app-tier | db.example.internal | TCP | 6379 | deny  | RST+ACK | FAIL (reachable; Redis listener still up) |
| dmz | app.example.internal | TCP | 443 | allow | SYN+ACK | PASS |
| dmz | app.example.internal | TCP | 22  | deny  | SYN+ACK | FAIL (SSH reachable from DMZ) |
| internet | db.example.com | any | any | deny | no reply | PASS |
| partner-peering | api.example.internal | TCP | 80 | deny | SYN+ACK | FAIL (plain HTTP reachable) |

## Findings
1. **Redis reachable from app-tier (was supposed to be migrated).** Close the listener
   or remove the app-tier → db:6379 rule from the SG.
2. **SSH open from the DMZ.** Restrict to jump host only; this has been the stated
   policy since 2024.
3. **HTTP reachable from partner peering.** Either redirect 80 → 443 at the edge or
   update the policy document to admit the plain-HTTP path.
```

## Real-World Example

Dimitri runs platform engineering for a B2B payments company. After a SOC 2 auditor asked "how do you prove your firewall policy matches your documentation?" he spent a week building an answer. From a handful of authorized source hosts — a DMZ utility box, an app-tier jump host, a VPN client, and a small cloud VM outside the org — he runs a 48-row policy matrix each quarter. Each row is a pair of `hping3` commands: one positive, one negative.

The first run surfaces three real findings. Redis, which was "migrated" six months earlier, is still reachable from the app tier because the old security-group rule was never removed. SSH on the web-facing app servers is reachable directly from the DMZ instead of being restricted to the jump host as the policy claims — a stateful firewall rule was authored in the wrong order and the broader allow was taking precedence. And the partner-peering link still permits plain HTTP to the API, which was documented as HTTPS-only.

Cross-checking with Nmap picks up a fourth finding that the targeted hping3 probes wouldn't have: an exposed UDP/161 SNMP service on a legacy appliance in the DMZ, running with the default community string. A one-line Wireshark capture on the destination confirms the SNMP packets actually arrive, ruling out a span-port artifact. All four issues are remediated within the quarter, and the policy matrix becomes the evidence Dimitri hands the auditor: documented policy, declared test, observed result, and a PCAP attached to each failed row. The auditor's next question is short.

## Related Skills

- [hping3](../skills/hping3/SKILL.md) — precise TCP/UDP/ICMP packet crafting for rule validation
- [nmap-recon](../skills/nmap-recon/SKILL.md) — broad reachability sweeps and service identification
- [wireshark](../skills/wireshark/SKILL.md) — confirm on the wire what actually traversed the path
