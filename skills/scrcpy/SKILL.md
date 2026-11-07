---
name: scrcpy
description: >-
  scrcpy shows an Android phone or tablet screen on the computer and lets you control it with the keyboard and mouse over USB or Wi-Fi, with no app on the device and no root. Use it when the user asks to "mirror my Android phone", "record the Android screen", "control the phone from my computer", "connect to the phone over Wi-Fi", "record a demo of my app", "use the phone camera as a video source", or needs scrcpy flags. Covers install, adb connection, wireless mode, recording, audio, camera, headless runs and tuning. Only for devices the user owns or may use.
license: Apache-2.0
compatibility: "Linux, macOS or Windows; Android 5.0+ (API 21) device with USB debugging enabled; audio needs Android 11+, camera needs Android 12+; adb (bundled in release archives)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "scrcpy, android, adb, screen-recording, mirroring"
  repository: https://github.com/Genymobile/scrcpy
---

# scrcpy — mirror, control and record an Android device

## Overview

scrcpy ("screen copy") talks to the device through `adb`, starts a small server on it for the duration of the session, and streams the encoded screen (and audio) back to the computer. Nothing is installed permanently and no root is needed. It can mirror and control the device, record the stream to a file straight from the device encoder, mirror the camera instead of the screen, work over Wi-Fi, or run without any window.

Everything here assumes the user owns the device or is explicitly allowed to use it; scrcpy needs USB debugging, which the owner must switch on, and the device shows an authorization prompt the first time a computer connects. An agent should never try to work around that prompt.

## Instructions

### Installation

Use the official release; the project warns against downloading it from anywhere else (https://github.com/Genymobile/scrcpy). Package-manager versions on Debian, Ubuntu and Snap are marked obsolete by the project.

```bash
brew install scrcpy                  # macOS (Homebrew); also needs: brew install --cask android-platform-tools
sudo pacman -S scrcpy                # Arch Linux
```

Linux and Windows static builds include `adb`. Linux example with the checksum published in the project's `doc/linux.md`:

```bash
curl -fLO https://github.com/Genymobile/scrcpy/releases/download/v5.0.1/scrcpy-linux-x86_64-v5.0.1.tar.gz
echo "9f969d30cc574816077edecda65719c1c70b0aee1df1ba5fa00779ac07b8fd6e  scrcpy-linux-x86_64-v5.0.1.tar.gz" | sha256sum --check
tar -xzf scrcpy-linux-x86_64-v5.0.1.tar.gz
./scrcpy-linux-x86_64-v5.0.1/scrcpy --version
```

Run it from that folder or add the folder to PATH. Check the latest tag on the releases page before copying the version number and checksum.

### Prepare the device and connect over USB

1. On the phone: Settings, About phone, tap Build number seven times; then Developer options, enable USB debugging.
2. Plug in the USB cable and accept the "Allow USB debugging?" prompt on the phone.
3. Check that the device is listed as `device` (not `unauthorized`):

```bash
adb devices
scrcpy
```

If several devices are attached, pick one with `--serial` (`-s`), `--select-usb` (`-d`) or `--select-tcpip` (`-e`); the `ANDROID_SERIAL` environment variable works too.

On some devices (notably Xiaomi) keyboard and mouse input fails with an `INJECT_EVENTS` error until the separate option "USB debugging (Security settings)" is enabled and the device is rebooted.

### Wireless connection

With the phone on the same network as the computer:

```bash
scrcpy --tcpip                       # while connected by USB: finds the IP, enables adb over TCP/IP, connects
scrcpy --tcpip=192.168.1.42          # a device already listening on port 5555
scrcpy --tcpip=+192.168.1.42:5555    # "+" forces a reconnection
```

After the first successful `--tcpip`, the cable can be removed. On Android 11+, wireless debugging in Developer options can replace the USB step; pair and connect with `adb pair` / `adb connect` first, then run `scrcpy -e`.

### Recording

`--record` (`-r`) muxes on the computer the stream encoded on the device; the container is chosen from the file extension or `--record-format` (mp4, mkv, m4a, mka, opus, aac, flac, wav).

```bash
scrcpy --record=login-flow.mp4
scrcpy --no-audio --record=login-flow.mp4          # video only
scrcpy --no-video --record=voice-note.opus         # audio only
scrcpy --record=demo.mkv --time-limit=90           # stop after 90 seconds
```

Timestamps are taken on the device, so a flaky Wi-Fi link does not leave stutter in the file.

### Headless: record with no window

`--no-window` hides the window and implies no video playback; `--no-playback` (`-N`) disables video and audio playback on the computer. Use them for unattended recording and combine with `--no-control` to make sure nothing is sent to the device.

```bash
scrcpy --no-window --no-control --record=nightly-smoke.mp4 --time-limit=120
```

Because there is no window, always set `--time-limit` or stop the process yourself, and run it with a shell timeout.

### Audio

Audio forwarding is on by default on Android 11+ (on Android 11 the device screen must be unlocked when scrcpy starts). Useful options: `--no-audio`, `--require-audio` (fail instead of silently falling back to video only), `--audio-codec` (opus, aac, flac, raw), and `--audio-source` (`output` by default; `playback`, `mic` and other microphone variants). `--audio-dup` keeps the sound playing on the phone while it is captured (only with `--audio-source=playback`).

### Camera mirroring (Android 12+)

```bash
scrcpy --list-cameras
scrcpy --list-camera-sizes
scrcpy --video-source=camera --camera-facing=back --camera-size=1920x1080
scrcpy --video-source=camera --camera-id=0 --no-audio --record=door.mp4
```

Camera mode switches the audio source to the microphone unless `--no-audio` is given. `--camera-facing` takes `front`, `back` or `external`.

### Quality, speed and device behavior

```bash
scrcpy --max-size=1024 --video-bit-rate=4M --max-fps=30   # lighter stream for slow links
scrcpy --video-codec=h265                                  # h264 (default), h265, av1, vp8, vp9
scrcpy --stay-awake --turn-screen-off                      # keep the phone on, screen dark while mirroring
scrcpy --show-touches                                      # draw touch points (physical touches only)
scrcpy --power-off-on-close
scrcpy --list-encoders                                     # what the device can encode
```

`--stay-awake` only works while the device is plugged in. Other useful flags: `--window-title`, `--crop=width:height:x:y`, `--new-display` for a separate virtual display, `--otg` to act as a physical keyboard/mouse without adb, and `--pause-on-exit=if-error` so a double-clicked terminal does not vanish before the error is read.

### Shortcuts

The modifier `MOD` defaults to left Alt or left Super and can be changed with `--shortcut-mod`. The full list is in `doc/shortcuts.md` of the repository. Right-click sends Back (or turns the screen on if it was off); middle-click sends Home.

## Examples

### Example 1 — Record a 60-second bug reproduction

**Request:** "Record the checkout crash on my Pixel while I tap through it, and save it as a video I can attach to the ticket."

```bash
adb devices
scrcpy --record=checkout-crash-2026-10-28.mp4 --time-limit=60 --show-touches --stay-awake
```

**Result:** `adb devices` lists one device in state `device`. scrcpy opens a window, the user reproduces the crash, and after 60 seconds (or when the window is closed) `checkout-crash-2026-10-28.mp4` contains the screen with touch dots and the device audio. If `adb devices` shows `unauthorized`, ask the user to accept the prompt on the phone.

### Example 2 — Mirror over Wi-Fi from across the desk

**Request:** "Plug the phone in once, then let me use it wirelessly while I record the screen."

```bash
scrcpy --tcpip --max-size=1280 --video-bit-rate=4M
```

**Result:** scrcpy finds the phone's IP (for example 192.168.1.42), enables TCP/IP mode, connects and opens the mirror. After unplugging, `scrcpy --tcpip=192.168.1.42 --max-size=1280` starts it again. The reduced size and bit rate keep latency low on ordinary Wi-Fi.

### Example 3 — Unattended recording with no window

**Request:** "Record the kiosk app on the test tablet for two minutes while the test script runs, nobody will be looking at the screen."

```bash
timeout 150 scrcpy --serial=R52W30XYZAB --no-window --no-control --record=kiosk-run.mkv --time-limit=120
```

**Result:** no window appears, nothing is injected into the tablet, and `kiosk-run.mkv` is written for two minutes. The outer `timeout` guards against a hung connection, and `--serial` makes sure the right tablet is chosen when two are attached.

## Guidelines

- Only connect to devices the user owns or is authorized to use. Never enable USB debugging, accept authorization prompts or bypass a lock screen on someone else's device.
- scrcpy is interactive by default. In an agent session run it with a time limit (`--time-limit` plus a shell `timeout`) or hand the command to the user; do not leave a window open waiting.
- Mirroring is not hidden: the device keeps its normal indicators, and recordings include whatever is on screen, such as notifications, one-time codes and passwords. Review recordings before sharing them.
- A second `adb` version on the PATH can kill the other's server (`adb server version doesn't match`). Use the `adb` shipped with scrcpy or make sure only one is installed.
- Wi-Fi mirroring leaves adb listening on the device (port 5555) until the device reboots or `adb disconnect` / USB debugging is turned off. Disable it on shared networks.
- scrcpy cannot automate the UI by itself; it only mirrors and injects input. For scripted UI testing use an automation tool and use scrcpy to watch or record the run.
- If control works but text input does not, or the opposite, check the `--keyboard` and `--mouse` modes (`sdk`, `uhid`, `aoa`, `disabled`) before reinstalling anything.
