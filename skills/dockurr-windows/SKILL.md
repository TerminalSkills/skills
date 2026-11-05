---
name: dockurr-windows
description: >-
  Runs a real Windows desktop or server inside a Docker container on a Linux host with KVM, using a QEMU virtual machine that installs itself and is viewed in a browser or over RDP. Use when someone asks to "run Windows in Docker", "spin up a disposable Windows 11 test machine", "test a Windows installer from Linux", "get a Windows VM with RDP", "dockur windows", or "unattended Windows install with a compose file". Covers image setup, VERSION values, resources, shared folders, first-boot scripts, RDP access and licensing.
license: Apache-2.0
compatibility: "Linux host with Docker or Podman and /dev/kvm (hardware virtualization), 2 GB+ free RAM, 32 GB+ free disk; Docker Desktop on macOS or Windows 10 is not supported"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "windows, docker, qemu, kvm, rdp"
  repository: https://github.com/dockur/windows
---
# dockurr/windows — Windows in a Docker container

## Overview

The `dockurr/windows` image (source repository `dockur/windows`, image name with two r's on Docker Hub) starts a QEMU/KVM virtual machine inside a container, downloads the Windows edition you ask for, installs it without prompts, and then serves the desktop through a web viewer on port 8006 and Remote Desktop on port 3389. State lives in a bind-mounted `/storage` folder, so deleting that folder gives you a fresh machine and keeping it keeps the installed system.

It is a virtual machine, not a Windows-compatibility layer: it needs hardware virtualization (`/dev/kvm`) on the host. It suits disposable test machines, running a Windows-only tool from a Linux box, or giving CI a Windows target. It does not give you containerised Windows processes or GPU gaming.

This skill is documentation-driven: configuration comes from the project README and `docs/environment.md`. The first start downloads several GB from Microsoft, so plan for time and bandwidth.

## Instructions

### Check the host first

KVM is mandatory. Verify before pulling anything:

```bash
ls -l /dev/kvm
sudo apt install cpu-checker && sudo kvm-ok     # expect: KVM acceleration can be used
```

If `/dev/kvm` is missing: enable Intel VT-x / AMD-V in BIOS or UEFI, and on a VPS enable nested virtualization (many providers do not offer it). Docker Desktop on Linux, macOS and Windows 10 gives containers no KVM and is not supported; Windows 11 with Docker Desktop or Podman needs nested virtualization turned on.

### Minimal compose file (loopback only)

Create a folder for the machine and write `compose.yml`. Every published port is bound to 127.0.0.1 so the VM is not reachable from the network:

```yaml
services:
  windows:
    image: dockurr/windows:6.06
    container_name: windows
    environment:
      VERSION: "11"
      RAM_SIZE: "8G"
      CPU_CORES: "4"
      DISK_SIZE: "64G"
      USERNAME: "tester"
      PASSWORD: "${WIN_PASSWORD}"
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
    restart: unless-stopped
    stop_grace_period: 2m
```

Pin the tag (`6.06` was the latest release tag on Docker Hub when this was written; check `https://hub.docker.com/r/dockurr/windows/tags`). The project's own example uses `dockurr/windows` without a tag, which follows `latest`.

Set the password from the environment and start:

```bash
export WIN_PASSWORD="$(openssl rand -hex 12)"      # keep it, you need it for RDP
docker compose up -d
docker compose logs -f windows                     # progress of download and install
```

Open http://127.0.0.1:8006 and watch the installer. When the desktop appears the machine is ready. Without `USERNAME` and `PASSWORD` the account is `Docker` with password `admin`, so always set both.

### One-off docker run

For a throwaway session (taken from the README, with the port bound to loopback):

```bash
docker run -it --rm --name windows -e "VERSION=11" -p 127.0.0.1:8006:8006 \
  --device=/dev/kvm --device=/dev/net/tun --cap-add NET_ADMIN \
  -v "${PWD:-.}/windows:/storage" --stop-timeout 120 docker.io/dockurr/windows:6.06
```

### Choose the Windows version

Set `VERSION` to one of the documented values; the README lists approximate download sizes:

| Value | Edition | Value | Edition |
|---|---|---|---|
| `11`, `11l`, `11e` | Windows 11 Pro, LTSC, Enterprise | `2025`, `2022`, `2019` | Windows Server |
| `10`, `10l`, `10e` | Windows 10 Pro, LTSC, Enterprise | `2016`, `2012`, `2008`, `2003` | older Windows Server |
| `8e`, `7u`, `vu`, `xp` | 8.1 Ent., 7 Ultimate, Vista, XP | `tiny11`, `core11`, `tiny10` | trimmed community builds |

`LANGUAGE: "French"` selects another display language; `REGION` and `KEYBOARD` (for example `en-US`) override locale and keyboard. For a custom ISO, set `VERSION` to its URL, or bind a local file with `- ./win.iso:/custom.iso` (then `VERSION` is ignored). ARM64 hosts use the separate `dockur/windows-arm` project.

### Resources and disks

- `RAM_SIZE` (default `4G`) and `CPU_CORES` (default `2`) accept numbers, `half` or `max`.
- `DISK_SIZE` sets the primary disk (default `64G`). Raising it later grows the disk, but you must extend the partition inside Windows.
- Extra disks: `DISK2_SIZE: "32G"` plus a `./disk2:/storage2` volume.
- `AUDIO: "Y"` streams sound to the web viewer (enable it under Settings, Advanced in the viewer).

### Connect with RDP

The web viewer is meant for installation; RDP is faster and supports clipboard sharing. With FreeRDP on Linux:

```bash
xfreerdp3 /v:127.0.0.1:3389 /u:tester /p:"$WIN_PASSWORD" /cert:ignore /size:1600x900
```

`/cert:ignore` is acceptable only because the target is your own loopback VM. On older FreeRDP packages the binary is `xfreerdp`. Any Microsoft Remote Desktop client works the same way.

### Exchange files and run first-boot scripts

- `./shared:/shared` shows up inside Windows as a `Shared` folder on the desktop and as drive `Z:`.
- `COMMAND` runs one command at the last step of the unattended install.
- For a script plus its files, bind a folder: `- ./oem:/oem`. It is copied to `C:\OEM` and `install.bat` inside it runs at the end of installation. Set `LOG: "Y"` to write its output to `C:\OEM\install.log`.

```yaml
    environment:
      LOG: "Y"
    volumes:
      - ./oem:/oem
```

Both hooks run once, during the first installation. Changing them later has no effect on an installed machine; delete `./windows` and start again.

### Networking choices

Default is NAT behind the container, which is enough for loopback RDP and web viewer. To give Windows its own LAN address, create a Docker macvlan network and set `DHCP: "Y"` with `devices: [/dev/vhost-net]` and `device_cgroup_rules: ['c *:* rwm']`; the README notes the macvlan address is not reachable from the Docker host itself.

### Stop, reset and remove

```bash
docker compose stop            # graceful ACPI shutdown, may take up to 2 minutes
docker compose down            # remove container, keep ./windows
sudo rm -rf ./windows          # destroy the machine and start over from a clean install
```

## Examples

### Example 1: Windows 11 test machine for an installer

**Request:** "I build a CLI on Linux and need a clean Windows 11 box to try the MSI. Set it up with 8 GB RAM and expose it only locally."

Commands the agent runs in `~/win-lab`:

```bash
ls -l /dev/kvm
export WIN_PASSWORD="$(openssl rand -hex 12)"
docker compose up -d
docker compose logs --tail 20 windows
```

With the compose file from Instructions this downloads Windows 11 Pro (about 7.9 GB), installs it, and finishes at a desktop on http://127.0.0.1:8006. Result: `docker compose ps` shows `windows` running, `ss -ltn` lists 8006 and 3389 only on 127.0.0.1, and `xfreerdp3 /v:127.0.0.1:3389 /u:tester /p:"$WIN_PASSWORD" /cert:ignore` opens the session. Drop the MSI into `./shared`; it appears on `Z:`.

### Example 2: Unattended install of a tool at first boot

**Request:** "Every time the VM is rebuilt, install our agent MSI and write a marker file."

Files the agent creates:

```bat
rem ./oem/install.bat
msiexec /i C:\OEM\freightctl-1.8.0-x64.msi /qn /norestart
echo installed > C:\OEM\done.txt
```

```bash
cp ~/builds/freightctl-1.8.0-x64.msi ./oem/
# add to the service in compose.yml:  LOG: "Y"  and volume  ./oem:/oem
docker compose down && sudo rm -rf ./windows && docker compose up -d
```

Result: after the unattended install finishes, `C:\OEM\install.log` shows the script output and `C:\OEM\done.txt` exists. The rebuild is repeatable because the script sits in version control next to the compose file.

## Guidelines

- **KVM is required.** Without `/dev/kvm` the VM is extremely slow or will not start. `KVM: "N"` exists in the variable list but is a last resort, not a supported fast path. If `kvm-ok` passes but the container still reports no KVM, the README suggests trying `privileged: true` temporarily to rule out device permissions.
- **Licensing.** The project contains open-source code only and does not distribute Windows; it fetches the installation media. The product keys in its code are generic installation keys published by Microsoft for trial use and are not activation licences. Per the README, you are responsible for holding a valid Windows licence and following Microsoft's terms; a licence key can be passed with `KEY`. The project is not affiliated with Microsoft. Do not treat an unactivated test VM as a production system.
- **Security.** Keep all ports on 127.0.0.1 unless you have put a VPN or authenticated tunnel in front. The defaults `Docker` / `admin` are public knowledge, and an exposed RDP port is scanned within minutes. Set `PASSWORD` through an environment variable, not a literal in a committed file. For remote access use an SSH tunnel (`ssh -L 3389:127.0.0.1:3389 host`).
- **Credentials apply at install.** `USERNAME` and `PASSWORD` are written into the unattended install; changing them in compose after the first run does not change the existing Windows account. Joining a domain (`DOMAIN`) requires a non-default `PASSWORD` and DNS that reaches the domain controller.
- **Disk and time.** The first run downloads the ISO (0.1 GB for ReactOS up to about 8 GB for Windows 11 Pro) and needs at least 32 GB free; the ISO is deleted afterwards (`REMOVE` defaults to `Y`).
- **Never connect a USB mass-storage device before first setup finishes.** The README warns it can be formatted as the system disk.
- **Give it time to stop.** Keep `stop_grace_period: 2m` (or `--stop-timeout 120`), otherwise Windows is killed mid-shutdown and the disk can corrupt.
- **Not for:** macOS or Windows 10 Docker Desktop hosts, GPU-heavy workloads, running many Windows VMs on one small host (each reserves its full `RAM_SIZE` unless ballooning is enabled), or macOS guests (the same authors publish `dockur/macos`).
