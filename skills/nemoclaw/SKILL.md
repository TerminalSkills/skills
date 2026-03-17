---
name: nemoclaw
description: >-
  Set up, configure, and manage NemoClaw — NVIDIA's open-source sandbox for
  running OpenClaw agents securely with policy-enforced network, filesystem,
  and inference controls. Use when the user mentions "nemoclaw," "openclaw
  sandbox," "openshell," "sandboxed agent," "agent security sandbox,"
  "nemotron sandbox," or wants to deploy an AI agent inside an isolated
  environment with egress control and inference routing.
license: Apache-2.0
compatibility: "Requires Linux Ubuntu 22.04+, Node.js 20+, Docker, and NVIDIA OpenShell"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["nemoclaw", "sandbox", "agent-security", "nvidia", "openclaw"]
---

# NemoClaw

## Overview

NemoClaw is an open-source stack by NVIDIA that installs and runs OpenClaw inside a sandboxed environment (OpenShell) with policy-enforced security controls. OpenShell provides Landlock, seccomp, and network namespace isolation. Sandboxes enforce strict egress control — all inference requests route through the OpenShell gateway, not directly to the internet. Network and inference policies are hot-reloadable; filesystem and process policies are locked at creation.

## Instructions

### 1. Install NemoClaw

Prerequisites: Linux Ubuntu 22.04+, Node.js 20+, Docker running, NVIDIA OpenShell installed, NVIDIA API key from build.nvidia.com.

```bash
curl -fsSL https://nvidia.com/nemoclaw.sh | bash
```

The installer runs the guided onboard wizard, creates a sandbox, configures inference (NVIDIA cloud), and applies security policies. After install you see:

```
──────────────────────────────────────────────────
Sandbox my-assistant (Landlock + seccomp + netns)
Model nvidia/nemotron-3-super-120b-a12b (NVIDIA Cloud API)
──────────────────────────────────────────────────
```

### 2. Manage sandboxes from the host

```bash
nemoclaw onboard                      # Interactive setup wizard
nemoclaw my-assistant connect         # Shell into sandbox
nemoclaw my-assistant status          # Sandbox health check
nemoclaw my-assistant logs --follow   # Stream logs
nemoclaw start                        # Start auxiliary services
nemoclaw stop                         # Stop services
nemoclaw deploy my-assistant          # Deploy via Brev to remote GPU instance
```

### 3. Work inside the sandbox

```bash
openclaw tui                          # Interactive chat TUI
openclaw agent --agent main --local -m "hello" --session-id test
openclaw nemoclaw launch              # Bootstrap OpenClaw in sandbox
openclaw nemoclaw status              # Show sandbox health
openclaw nemoclaw logs [-f]           # Stream logs
```

### 4. Security policies

- **Network**: All outbound blocked by default, allowlist-based egress, hot-reloadable. When agent requests unlisted host → blocked + surfaced in TUI for operator approval.
- **Filesystem**: Only `/sandbox` and `/tmp` writable, locked at creation.
- **Process**: Privilege escalation blocked, seccomp syscall filtering, locked at creation.
- **Inference**: All model API calls intercepted by OpenShell gateway, routed to NVIDIA cloud. Default model: `nvidia/nemotron-3-super-120b-a12b`.

### 5. Troubleshoot

```bash
nemoclaw my-assistant status                        # NemoClaw health
openshell sandbox list                              # OpenShell sandbox state
nemoclaw my-assistant logs --follow | grep inference # Check inference connectivity
```

Common issues: Docker not running → start daemon. API key invalid → re-run `nemoclaw onboard`. Sandbox conflicts → check `openshell sandbox list`. Network blocked → check egress allowlist.

## Examples

### Example 1: Set up a new sandboxed coding agent

**User request:** "I want to run an OpenClaw agent in a secure sandbox with NemoClaw on my Ubuntu server"

**Actions taken:**
1. Verify prerequisites: confirm Ubuntu 22.04+, Node.js 20+, Docker running
2. Install OpenShell from https://github.com/NVIDIA/OpenShell
3. Run the NemoClaw installer:
   ```bash
   curl -fsSL https://nvidia.com/nemoclaw.sh | bash
   ```
4. Follow onboard wizard — enter sandbox name `code-agent`, select Nemotron model, provide NVIDIA API key
5. Connect to sandbox:
   ```bash
   nemoclaw code-agent connect
   ```
6. Inside sandbox, start the agent TUI:
   ```bash
   openclaw tui
   ```

**Expected output:** Agent running inside isolated sandbox with Landlock filesystem protection, seccomp syscall filtering, network namespace isolation, and all inference routed through OpenShell gateway.

### Example 2: Deploy a sandboxed agent to a remote GPU instance

**User request:** "Deploy my NemoClaw sandbox to a remote GPU so I can run larger models"

**Actions taken:**
1. Confirm local sandbox `research-agent` is working:
   ```bash
   nemoclaw research-agent status
   ```
   Output: `research-agent: running (Landlock + seccomp + netns)`
2. Deploy to remote GPU via Brev:
   ```bash
   nemoclaw deploy research-agent
   ```
3. Monitor remote deployment:
   ```bash
   nemoclaw research-agent logs --follow
   ```

**Expected output:** Remote GPU instance provisioned, NemoClaw installed, sandbox `research-agent` running on remote with same security policies applied. All inference routed through NVIDIA cloud API.

## Guidelines

- NemoClaw requires a **fresh OpenClaw installation** — do not install on existing OpenClaw setups.
- **Alpha software** — APIs may change without notice; not production-ready yet.
- **Linux only** — Ubuntu 22.04+ required, no macOS or Windows support.
- The `curl | bash` installer is from nvidia.com (official NVIDIA source). For manual installation, clone the repo and follow the README at https://github.com/NVIDIA/NemoClaw.
- When the agent tries to reach a host not in the egress allowlist, the request is blocked and surfaced in the OpenShell TUI for operator approval. If approved, the host is added to the allowlist.
- Blueprint lifecycle: Resolve artifact → Verify digest → Plan resources → Apply through OpenShell CLI.
- Architecture: Host runs nemoclaw CLI (TypeScript) + Blueprint (Python) + OpenShell Runtime → Sandbox contains the OpenClaw agent with strict isolation.
