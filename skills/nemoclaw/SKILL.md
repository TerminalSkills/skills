# NemoClaw

> NVIDIA's open-source sandbox for running OpenClaw agents securely with policy-enforced network, filesystem, and inference controls.

You are an expert in NemoClaw, NVIDIA OpenShell, sandboxed agent environments, and secure AI agent deployment.

## Core Concepts

- **NemoClaw** is an open-source stack by NVIDIA that installs and runs OpenClaw inside a sandboxed environment (OpenShell) with policy-enforced security controls
- **OpenShell** is the NVIDIA runtime that provides Landlock, seccomp, and network namespace isolation for agent containers
- **Blueprint** is a versioned Python artifact that orchestrates sandbox creation, security policy, and inference setup
- **Nemotron** is NVIDIA's inference model (nemotron-3-super-120b-a12b) served via NVIDIA cloud API
- Sandboxes enforce strict egress control — all inference requests route through the OpenShell gateway, not directly to the internet
- Network, filesystem, process, and inference layers each have separate security policies
- Policies are hot-reloadable for network and inference; locked at creation for filesystem and process

## Architecture

```
Host Machine
├── nemoclaw CLI (TypeScript)
│   ├── onboard — interactive setup wizard
│   ├── deploy — remote GPU instance via Brev
│   ├── <name> connect — shell into sandbox
│   └── start / stop / status — manage services
├── Blueprint (Python)
│   ├── resolve artifact → verify digest → plan → apply
│   └── orchestrates sandbox lifecycle
├── OpenShell Runtime
│   ├── Landlock filesystem isolation
│   ├── seccomp syscall filtering
│   ├── Network namespace (netns)
│   └── Inference gateway (intercepts model API calls)
└── Sandbox
    ├── OpenClaw agent (always-on)
    ├── /sandbox and /tmp only writable
    ├── Egress: blocked by default, allowlist-based
    └── Inference: routed through NVIDIA cloud
```

## Prerequisites

- Linux Ubuntu 22.04+ (required — no macOS/Windows support yet)
- Node.js 20+ and npm 10+ (Node.js 22 recommended)
- Docker installed and running
- NVIDIA OpenShell installed: https://github.com/NVIDIA/OpenShell
- NVIDIA API key from https://build.nvidia.com

## Installation

```bash
# Download and run the installer
curl -fsSL https://nvidia.com/nemoclaw.sh | bash
```

The installer:
1. Installs Node.js if not present
2. Runs the guided onboard wizard
3. Creates a sandbox
4. Configures inference (NVIDIA cloud)
5. Applies security policies

After install:
```
──────────────────────────────────────────────────
Sandbox my-assistant (Landlock + seccomp + netns)
Model nvidia/nemotron-3-super-120b-a12b (NVIDIA Cloud API)
──────────────────────────────────────────────────
Run: nemoclaw my-assistant connect
Status: nemoclaw my-assistant status
Logs: nemoclaw my-assistant logs --follow
──────────────────────────────────────────────────
```

## CLI Commands — Host

```bash
# Setup
nemoclaw onboard                      # Interactive setup wizard

# Sandbox management
nemoclaw my-assistant connect         # Shell into sandbox
nemoclaw my-assistant status          # Sandbox health check
nemoclaw my-assistant logs --follow   # Stream logs

# Service management
nemoclaw start                        # Start auxiliary services
nemoclaw stop                         # Stop services
nemoclaw status                       # Service health

# Deploy to remote GPU
nemoclaw deploy my-assistant          # Deploy via Brev to remote GPU instance
```

## CLI Commands — Inside Sandbox

```bash
# OpenClaw agent interaction
openclaw tui                          # Interactive chat TUI
openclaw agent --agent main --local -m "hello" --session-id test

# NemoClaw plugin (under active development)
openclaw nemoclaw launch [--profile ...]   # Bootstrap OpenClaw in sandbox
openclaw nemoclaw status                    # Show sandbox health
openclaw nemoclaw logs [-f]                 # Stream logs
```

## Security Policies

### Network Policy
- All outbound connections blocked by default
- Allowlist-based egress: only approved hosts reachable
- When agent requests unlisted host → blocked + surfaced in TUI for operator approval
- Hot-reloadable at runtime (no sandbox restart needed)

### Filesystem Policy
- Only `/sandbox` and `/tmp` are writable
- All other filesystem paths read-only or blocked
- Locked at sandbox creation (cannot be changed at runtime)

### Process Policy
- Privilege escalation blocked
- Dangerous syscalls filtered via seccomp
- Locked at sandbox creation

### Inference Policy
- All model API calls intercepted by OpenShell gateway
- Routed to NVIDIA cloud backend (never direct internet access from sandbox)
- Hot-reloadable at runtime
- Default model: `nvidia/nemotron-3-super-120b-a12b`

## Inference Configuration

```yaml
# Inference is configured during onboard
provider: nvidia-cloud
model: nvidia/nemotron-3-super-120b-a12b
api_key: <NVIDIA_API_KEY>  # from build.nvidia.com
```

- Agent code calls LLM API normally — OpenShell transparently intercepts and routes
- No code changes needed in the agent
- Model can be changed via inference profiles

## Blueprint Lifecycle

1. **Resolve** — download the versioned blueprint artifact
2. **Verify** — check artifact digest for integrity
3. **Plan** — determine resources needed (sandbox, network, inference)
4. **Apply** — execute through OpenShell CLI

## Troubleshooting

```bash
# NemoClaw-level health
nemoclaw my-assistant status

# OpenShell sandbox state
openshell sandbox list

# Check inference connectivity
nemoclaw my-assistant logs --follow | grep inference

# Common issues:
# - Docker not running → start Docker daemon
# - API key invalid → re-run nemoclaw onboard
# - Sandbox won't start → check openshell sandbox list for conflicts
# - Network blocked → check egress allowlist in policy
```

## Key Patterns

### Fresh Installation Required
NemoClaw currently requires a fresh OpenClaw installation. Don't install on existing OpenClaw setups.

### Operator Approval for Network Access
When the agent tries to reach a host not in the allowlist:
1. OpenShell blocks the request
2. Request appears in TUI for operator review
3. Operator approves or denies
4. If approved, host is added to allowlist

### Remote Deployment
```bash
# Deploy to a GPU instance through Brev
nemoclaw deploy my-assistant
# This provisions a remote instance, installs NemoClaw, and connects
```

### Monitoring
```bash
# Health check
nemoclaw my-assistant status

# Real-time logs
nemoclaw my-assistant logs --follow

# OpenShell TUI (monitoring + approvals)
openshell term
```

## Important Notes

- **Alpha software** — expect rough edges; APIs may change without notice
- **Linux only** — Ubuntu 22.04+ required; no macOS/Windows support
- **Fresh install** — don't install on existing OpenClaw
- **NVIDIA API key required** — get from build.nvidia.com
- **Not production-ready yet** — for experimentation and feedback

## References

- Repository: https://github.com/NVIDIA/NemoClaw
- NVIDIA Agent Toolkit: https://docs.nvidia.com/nemo/agent-toolkit/latest
- OpenShell: https://github.com/NVIDIA/OpenShell
- NVIDIA Build: https://build.nvidia.com
- Documentation: https://docs.nvidia.com/nemoclaw/latest
- License: Apache 2.0

author: terminal-skills
