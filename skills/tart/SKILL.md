---
name: tart
description: >-
  Runs macOS and Linux virtual machines on Apple Silicon Macs from the command line, pulling and pushing VM images through any OCI registry. Use when the user wants a disposable macOS build VM, a clean iOS or Xcode CI runner on a Mac mini, a Linux VM on an M-series Mac, or says "tart clone", "tart run", "macOS VM for CI", "ephemeral Mac runner", "push a VM image to ghcr.io". Needs an Apple Silicon Mac; it cannot run on Linux or Intel.
license: Apache-2.0
compatibility: "Apple Silicon Mac, macOS 13+ (tart exec needs macOS 14+), Homebrew, over 100 GB free disk"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "macos-vm, apple-silicon, ci-runner, virtualization, oci-registry"
  repository: https://github.com/openai/tart
---

# Tart — macOS and Linux VMs on Apple Silicon

## Overview

Tart is a command-line VM manager built on Apple's `Virtualization.Framework`. It creates, runs and stores macOS and Linux guests on Apple Silicon, and it distributes VM disks as OCI images, so `ghcr.io` or a private registry doubles as the image store. The typical job is CI: clone a golden image, boot it headless, run one build inside, delete the clone. Every build then starts from a clean macOS install, which is the thing a long-lived self-hosted Mac runner cannot give you.

This guide covers release 2.41.1. The repository now lives at `github.com/openai/tart` (earlier `cirruslabs/tart`); the public base images are still published under `ghcr.io/cirruslabs/`. The tool's own license is the Functional Source License 1.1 with an Apache-2.0 future license (`FSL-1.1-ALv2`, see the repository `LICENSE`). It is source-available, not an OSI open-source license, so read the permitted-purpose clause before embedding Tart in a product you sell. That is separate from the license of this skill.

Tart only runs images that Tart created and pushed. A Docker or OCI container image cannot be pulled and booted. For Linux containers on a Mac, use the `apple-container` or `docker-helper` skills instead.

## Instructions

### Installation

```bash
brew install openai/tools/tart
tart --version
```

Install through Homebrew rather than the bare release archive: the binary has to run from inside its `tart.app` bundle so macOS applies the bundled provisioning profile, and the formula handles that. VM disks live under `~/.tart/vms/`; pulled remote images are cached in `~/.tart/cache/OCIs/`.

### Get a VM and boot it

The maintained images carry user `admin` with password `admin`:

- macOS: `ghcr.io/cirruslabs/macos-tahoe-vanilla:latest`, `macos-tahoe-base:latest`, `macos-tahoe-xcode:latest`; the same three flavours exist for `sequoia`, `sonoma` and `ventura`. The `vanilla` images have no Tart Guest Agent; the project's Packer templates (`cirruslabs/macos-image-templates`) show what `base` and `xcode` add.
- Linux: `ghcr.io/cirruslabs/ubuntu:latest`, `debian:latest`, `fedora:latest`.

```bash
tart clone ghcr.io/cirruslabs/macos-tahoe-xcode:latest tahoe-xcode   # about 25 GB download
tart run tahoe-xcode                                                  # opens a window
```

Pin a specific tag in CI so the toolchain does not change under you. The `xcode` images carry tags named after the Xcode version, for example `ghcr.io/cirruslabs/macos-sequoia-xcode:16.2` and `:16.3`; the full list is on the `cirruslabs` package pages of GitHub. `tart clone` and `tart pull` delete the least recently used cached images when the disk is nearly full; disable that with `TART_NO_AUTO_PRUNE=` or cap it per clone with `--prune-limit 50 (gigabytes)`.

### Size the VM

The default is 2 CPUs, 4 GB RAM, a 1024x768 display. Change it while the VM is stopped:

```bash
tart set tahoe-xcode --cpu 6 --memory 12288 --display 1920x1080
tart set tahoe-xcode --disk-size 120        # disks can only grow
```

`--memory` is in megabytes, `--disk-size` in gigabytes. On Linux guests: cloud-ready distributions grow the filesystem at boot, others need `growpart` or `resize2fs`. macOS guests need an extra resize step inside the guest (see the FAQ).

### Run headless and reach the guest

```bash
tart run --no-graphics tahoe-xcode &        # keep the process in the background
tart ip tahoe-xcode --resolver agent --wait 60   # waits up to 60 s until the guest agent answers
tart exec tahoe-xcode uname -a              # needs the guest agent, macOS 14+ host
ssh admin@$(tart ip tahoe-xcode)
```

`tart exec` runs a command inside a running guest through the Tart Guest Agent. All Cirrus Labs images except `vanilla` ship the agent. It accepts `-i` (keep stdin open) and `-t` (allocate a TTY). The default `dhcp` resolver does not work with bridged networking; `--resolver arp` does, and `--resolver agent` works in all cases but needs the agent (it also waits for the agent, which makes it the safe choice before `tart exec`). Other useful `run` flags: `--dir=build:~/src/app:ro` (share a host folder, mounted at `/Volumes/My Shared Files/build` in macOS guests), `--vnc`, `--net-softnet` (isolated networking with `--net-softnet-allow` and `--net-softnet-block` CIDR lists), `--no-audio`, `--suspendable` (lets `tart suspend` save state).

### Ephemeral job pattern

```bash
JOB=ios-build-$(date +%s)
tart clone ghcr.io/cirruslabs/macos-sequoia-xcode:16.2 "$JOB"
tart run --no-graphics --dir=repo:"$PWD":ro "$JOB" &
VM_PID=$!
tart ip "$JOB" --resolver agent --wait 120
tart exec "$JOB" xcodebuild -version
tart stop "$JOB"
wait "$VM_PID"
tart delete "$JOB"
```

A clone shares nothing mutable with the source, so destroying it leaves the golden image untouched. On macOS 27 and newer, `tart clone --stacked` keeps writes in a private overlay on top of a shared read-only base (see the FAQ section "Stacked disk images").

### Make your own image and push it

```bash
tart create --from-ipsw=latest tahoe-vanilla     # downloads the latest IPSW
tart create --linux ubuntu-dev                   # empty Linux VM, then boot with --disk <iso>
tart run tahoe-vanilla                           # finish Setup Assistant by hand
```

Convention for macOS images: user `admin`/`admin`, automatic login, Remote Login (SSH) on, lock screen and screen saver off, passwordless sudo. After that:

```bash
tart login ghcr.io --username ci-bot --password-stdin < ~/.secrets/ghcr-token
tart push tahoe-xcode ghcr.io/acme-mobile/macos-xcode:16.2 ghcr.io/acme-mobile/macos-xcode:latest
tart pull ghcr.io/acme-mobile/macos-xcode:16.2
```

For CI secrets, set `TART_REGISTRY_USERNAME` and `TART_REGISTRY_PASSWORD` (add `TART_REGISTRY_HOSTNAME` to limit them to one registry) instead of `tart login`. Credentials otherwise go to the macOS Keychain or a Docker credential helper from `~/.docker/config.json`. `tart push` takes several remote names to apply multiple tags in one upload.

### Housekeeping

```bash
tart list                  # local and cached VMs
tart list --format json    # machine-readable
tart stop tahoe-xcode      # graceful, 30 s timeout by default
tart delete tahoe-xcode
```

## Examples

### Example 1: A clean Xcode VM for each pull request

Request: "My Mac mini keeps failing builds because old derived data and simulators pile up. Run each build in a fresh macOS VM."

```bash
JOB=pr-1842
tart clone ghcr.io/cirruslabs/macos-sequoia-xcode:16.2 "$JOB"
tart set "$JOB" --cpu 4 --memory 12288
tart run --no-graphics "$JOB" &
tart ip "$JOB" --resolver agent --wait 120
tart exec "$JOB" xcodebuild -version
tart stop "$JOB" && tart delete "$JOB"
```

Result: `xcodebuild -version` prints the Xcode release baked into the `16.2` tag, the VM is gone afterwards, and nothing from the job survives on the host. `tart exec` needs the Tart Guest Agent; on a `vanilla` image drop `--resolver agent` from `tart ip` and use `ssh admin@$(tart ip "$JOB")` instead.

### Example 2: Publish the team's golden image

Request: "Bake Xcode 16.2 and our Ruby toolchain into a VM and let every runner pull it."

```bash
tart clone ghcr.io/cirruslabs/macos-sequoia-xcode:16.2 team-golden
tart run team-golden            # install tools, then shut the guest down
tart login ghcr.io --username ci-bot --password-stdin < ~/.secrets/ghcr-token
tart push team-golden ghcr.io/acme-mobile/macos-golden:xcode-16.2
```

On each runner: `tart clone ghcr.io/acme-mobile/macos-golden:xcode-16.2 job-$BUILD_ID`. The first clone downloads the image; later clones reuse the local cache.

## Guidelines

- Apple Silicon only. This skill was written from the official documentation and source; none of the commands were run on a Linux machine, which cannot host Tart.
- The quick start warns of a 25 GB download for one macOS image. Keep well over 100 GB free for a runner that holds a couple of image versions plus clones.
- Do not rely on `admin`/`admin` outside a private network. Rotate it in your own golden image before exposing SSH or VNC beyond the host.
- Containers (Docker images) cannot be booted by Tart; only VM images pushed by Tart can.
- Install through Homebrew or the release archive from the project's own GitHub releases. Do not pipe a downloaded script into a shell.
- Never put registry tokens on a command line; use `--password-stdin` or the `TART_REGISTRY_*` variables.
- Clean up with `tart stop` then `tart delete` in a `trap` handler in CI scripts; killed jobs otherwise leave large clones behind.
- For managing a fleet of Macs, the project documents Orchard; this skill does not cover it.
