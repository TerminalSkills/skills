---
title: Test Windows Installers from Linux with dockurr/windows
slug: test-windows-installers-from-linux-with-dockurr-windows
description: Give a Linux developer a disposable, scripted Windows 11 machine in Docker to test installers and Windows-only behaviour without a second computer.
skills:
  - dockurr-windows
  - docker-helper
  - ssh
category: devops
tags:
  - windows
  - docker
  - qemu
  - installer-testing
  - rdp
  - qa
---

## The Problem

Priya Nair maintains a command-line tool that ships as a Linux binary and a Windows MSI. She develops on a Linux workstation and has no Windows machine. Every release she borrows a colleague's laptop for an afternoon, clicks through the installer, and finds out too late that the PATH change or the service registration fails on a clean system. A hosted Windows VM costs money and is never clean twice. Her workstation has hardware virtualization, but a classic VM tool means hand-installing Windows from an ISO, and nobody remembers the exact steps.

## The Solution

Run Windows 11 as a container with `dockurr/windows`. It downloads and installs Windows unattended inside a QEMU/KVM virtual machine, exposes the desktop on a loopback-only web viewer and RDP port, and keeps everything in one folder. A first-boot script installs the MSI and writes the log to a shared folder. Throwing away the folder returns the machine to a clean state in one command, so each release is tested on a fresh install. The agent handles the compose file, the first-boot script and the RDP connection; Docker conventions come from `docker-helper`, remote access from `ssh` when the lab host is a different machine.

## Step-by-Step Walkthrough

### Step 1: Confirm the host can run it

The person asks: "Can this box run a Windows VM in Docker? I want to test our MSI on Windows 11."

```bash
ls -l /dev/kvm
sudo apt install cpu-checker && sudo kvm-ok
docker --version
df -h ~ | tail -1
```

The agent checks for `KVM acceleration can be used` and at least 32 GB free disk. If `/dev/kvm` is missing it stops and reports the BIOS or nested-virtualization setting to change; without KVM this approach is not usable.

### Step 2: Write the compose file with loopback-only ports

Prompt: "Set up a Windows 11 test machine in `~/win-lab`, 8 GB RAM, 4 cores, reachable only from this computer."

```bash
mkdir -p ~/win-lab/oem ~/win-lab/shared && cd ~/win-lab
export WIN_PASSWORD="$(openssl rand -hex 12)"
```

```yaml
services:
  windows:
    image: dockurr/windows:6.06
    container_name: win-lab
    environment:
      VERSION: "11"
      RAM_SIZE: "8G"
      CPU_CORES: "4"
      USERNAME: "tester"
      PASSWORD: "${WIN_PASSWORD}"
      LOG: "Y"
    devices:
      - /dev/kvm
      - /dev/net/tun
    cap_add:
      - NET_ADMIN
    ports:
      - "127.0.0.1:8006:8006"
      - "127.0.0.1:3389:3389/tcp"
      - "127.0.0.1:3389:3389/udp"
    volumes:
      - ./windows:/storage
      - ./shared:/shared
      - ./oem:/oem
    stop_grace_period: 2m
```

The password is generated per session and never written into the file. The agent saves it in the person's password manager or a `.env` file that is git-ignored.

### Step 3: Add the first-boot install script

Prompt: "On first boot, install `freightctl-2.4.0-x64.msi` silently and record the installer exit code."

```bat
rem ~/win-lab/oem/install.bat
msiexec /i C:\OEM\freightctl-2.4.0-x64.msi /qn /norestart /l*v C:\OEM\msi.log
echo exit code %ERRORLEVEL% > C:\OEM\result.txt
```

```bash
cp ~/dist/freightctl-2.4.0-x64.msi ~/win-lab/oem/
```

The `oem` folder is copied to `C:\OEM` and `install.bat` runs at the end of the unattended install. `LOG: "Y"` writes the script output to `C:\OEM\install.log`.

### Step 4: Start and watch the install

```bash
docker compose up -d
docker compose logs -f windows
```

The first run downloads about 7.9 GB for Windows 11 Pro and takes a while. The agent opens `http://127.0.0.1:8006` for the person and waits until the desktop appears, then confirms with `docker compose ps`.

### Step 5: Run smoke tests over RDP

Prompt: "Connect and check that `freightctl --version` works from a new terminal."

```bash
xfreerdp3 /v:127.0.0.1:3389 /u:tester /p:"$WIN_PASSWORD" /cert:ignore /size:1600x900
```

The person (or a scripted RDP session) opens PowerShell, runs `freightctl --version`, and checks `C:\OEM\result.txt`. Files to carry out go into `Z:` (the `shared` folder), where the agent reads them on the host.

### Step 6: Reset to a clean machine for the next release

```bash
docker compose down
sudo rm -rf ~/win-lab/windows
docker compose up -d
```

Deleting the `windows` folder discards the installed system; the next start reinstalls Windows from scratch with the same script. If the lab runs on a separate Linux server, the agent uses `ssh -L 3389:127.0.0.1:3389 priya@lab-server` so RDP never leaves the loopback interface.

## Real-World Example

Priya's team ships release 2.4.0 on a Thursday. The agent builds the lab in 10 minutes of her time and about 25 minutes of unattended install and download. The first clean run shows `result.txt` containing `exit code 1603`; the MSI log in `C:\OEM\msi.log` points to a custom action that expects a folder created by a previous version. She fixes the installer, rebuilds the MSI and resets the lab. The second run returns `exit code 0`, and `freightctl --version` prints `2.4.0` in a fresh terminal. Previously this check happened on a colleague's laptop after release; now it takes 20 minutes before tagging.

The Windows licence is her responsibility: the project does not provide one, and an unactivated trial machine is used here only for short-lived testing.

## Related Skills

- [dockurr-windows](/skills/dockurr-windows) — runs the Windows VM, the first-boot script and the RDP access.
- [docker-helper](/skills/docker-helper) — Docker and Compose conventions for the lab folder, ports and cleanup.
- [ssh](/skills/ssh) — tunnels RDP and the web viewer when the lab sits on a remote Linux server.
