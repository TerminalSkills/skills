---
name: nemoclaw
description: >-
  NemoClaw is NVIDIA's open-source reference stack that installs and runs an AI
  agent (OpenClaw by default; Hermes and LangChain Deep Agents Code also
  supported) inside an NVIDIA OpenShell sandbox with deny-by-default network
  policy, managed inference and credential isolation. Use when the user mentions
  "nemoclaw", "openclaw sandbox", "openshell", "sandboxed agent", "agent
  security sandbox", or wants to run an autonomous agent in an isolated
  environment with egress control and inference routing.
license: Apache-2.0
compatibility: "Linux (primary), macOS and Windows WSL2 with limits. Node.js 22.19+, npm 10+, Docker Engine/Desktop/Colima (or rootless Podman), 4 vCPU, 8 GB RAM (16 recommended), 20 GB disk."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/NVIDIA/NemoClaw
  tags: "nemoclaw, sandbox, agent-security, nvidia, openclaw"
---

# NemoClaw

## Overview

NemoClaw (github.com/NVIDIA/NemoClaw, Apache-2.0, alpha) is a host CLI plus a versioned blueprint that creates agent sandboxes on top of NVIDIA OpenShell. OpenShell enforces the filesystem, process and network rules and holds the inference credentials, so the agent inside the sandbox never sees your API key. Supported agents: OpenClaw (default), Hermes, and LangChain Deep Agents Code (`nemohermes` and `nemo-deepagents` are aliases for the latter two).

Baseline sandbox rules (from the NemoClaw network-policy docs): only `/sandbox`, `/tmp` and a few device paths are writable, the process runs as a dedicated `sandbox` user with a process limit, Landlock is applied best-effort, and every outbound destination not in the policy is blocked and surfaced to the operator for approval. The project says plainly that it is alpha: interfaces change and maintainers answer issues on a best-effort basis.

## Instructions

### 1. Check prerequisites

Node.js 22.19 or later, npm 10+, a running container runtime (Docker by default), 8 GB RAM (the sandbox image is about 2.4 GB compressed, and low-memory hosts can hit the OOM killer; add swap if needed), and an inference credential for the provider you choose (NVIDIA Endpoints, OpenAI, Anthropic, Gemini, OpenRouter, or a local server such as Ollama or vLLM). The installer can install Docker and adds your user to the `docker` group, which gives root-equivalent control of the daemon; on shared machines use your organization's Docker access path instead.

### 2. Install

The hosted installer is a shell script that is the repository's `install.sh`. Download it, read it, then run it, rather than piping it into a shell. NVIDIA does not publish a checksum for it, so reading it (or checking out a tagged release of the repository) is the verification step.

```bash
curl -fsSLo nemoclaw-install.sh https://www.nvidia.com/nemoclaw.sh
less nemoclaw-install.sh
export NEMOCLAW_DISABLE_TELEMETRY=1      # optional: the installer and CLI send anonymous completion telemetry by default
bash nemoclaw-install.sh
```

The installer asks you to accept a third-party software notice, then starts the onboarding wizard: choose the agent (OpenClaw), an inference provider and model, the credential, a sandbox name (default `my-assistant`), and a network policy tier. Tiers: Restricted (baseline only), Balanced (default; adds the `npm`, `pypi`, `huggingface`, `brew-balanced` and `brave` presets), Open (adds messaging and many SaaS endpoints), Personal. On DGX Spark, qualifying DGX Station and WSL hosts an express install prompt can accept recommended settings. Use `nemoclaw onboard --resume` if onboarding stops partway.

### 3. Use the sandbox from the host

```bash
nemoclaw list                              # registered sandboxes
nemoclaw my-assistant status               # health, agent runtime, inference route (--json for scripts)
nemoclaw launch my-assistant               # preflight, then the OpenClaw TUI in your terminal
nemoclaw my-assistant connect              # shell inside the sandbox; run "openclaw tui" there
nemoclaw my-assistant dashboard-url --quiet
nemoclaw my-assistant logs --follow        # agent gateway output plus OpenShell audit events (policy denials)
nemoclaw my-assistant logs --since 10m
nemoclaw my-assistant doctor               # focused health check
```

### 4. Network policy

Policy presets extend the baseline. `policy add` shows which endpoints a preset opens and asks for confirmation.

```bash
nemoclaw my-assistant policy list
nemoclaw my-assistant policy add pypi --yes       # positional name + --yes for scripts
nemoclaw my-assistant policy remove pypi
```

GitHub, messaging services and similar hosts are not in the baseline; add the matching preset (`github`, `slack`, `telegram`, ...) or enable the channel at onboarding. Requests to unlisted hosts are held for operator approval in the OpenShell TUI (`openshell term`).

### 5. Inference, MCP and skills

```bash
nemoclaw inference get
nemoclaw inference set                # switch provider or model (flags --provider and --model); warns if other sandboxes share the route
nemoclaw my-assistant skill install ./skills/code-review
nemoclaw credentials list
```

Provider credentials stay in OpenShell, not inside the sandbox. `nemoclaw <name> mcp add` registers an authenticated Streamable HTTP MCP server, and `channels add` connects Telegram, Discord, Slack and others.

### 6. Update, rebuild, remove

```bash
nemoclaw update                      # update the host CLI
nemoclaw my-assistant rebuild        # rebuild the sandbox, preserving supported state
nemoclaw my-assistant destroy        # delete one sandbox
nemoclaw backup-all                  # back up before upgrades
nemoclaw uninstall                   # remove NemoClaw; asks what to preserve
```

## Examples

### Example 1: Run a coding agent in a locked-down sandbox

**User request:** "Set up OpenClaw in a sandbox on my Ubuntu server, with only npm and PyPI reachable."

```bash
docker info > /dev/null && node --version        # v22.19 or later
curl -fsSLo nemoclaw-install.sh https://www.nvidia.com/nemoclaw.sh && less nemoclaw-install.sh
bash nemoclaw-install.sh                          # choose OpenClaw, NVIDIA Endpoints, name "code-agent", tier Restricted
nemoclaw code-agent policy add npm --yes
nemoclaw code-agent policy add pypi --yes
nemoclaw code-agent status
nemoclaw launch code-agent
```

Result: `status` reports the sandbox running with its agent runtime and inference route, and `launch` opens the OpenClaw TUI. Inside it, `pip install` works through the `pypi` preset while a request to any other host is denied and appears in `nemoclaw code-agent logs --follow`.

### Example 2: Let the agent reach GitHub, then review denials

**User request:** "My agent needs to clone from GitHub, but nothing else."

```bash
nemoclaw code-agent policy add github
nemoclaw code-agent policy list
nemoclaw code-agent logs --since 30m
```

`policy add` prints the endpoints the `github` preset opens and waits for confirmation. After approval `policy list` shows the preset; the log call shows any other destinations the agent tried and that were blocked. Remove the preset with `policy remove github` when the task is done.

## Guidelines

- NemoClaw is alpha software. Check the docs (docs.nvidia.com/nemoclaw) for the current release before relying on a command, and pin what you tested.
- Use `nemoclaw onboard` to create or recreate sandboxes and the OpenShell gateway. Avoid running `openshell sandbox create` or updating OpenShell by hand unless you manage OpenShell separately.
- Start from Restricted or Balanced and add presets one at a time. The Open and Personal tiers allow broad egress and weaken the point of the sandbox.
- Filesystem and process rules are fixed in the sandbox image; change them by rebuilding, not at runtime. Network policy and inference routes can change on a running sandbox.
- Do not paste API keys into chat or the command line; give them to the wizard, or export them in the environment and register them with `nemoclaw credentials add <PROVIDER> --credential ENV_NAME`.
- Linux is the primary platform; macOS and WSL2 have documented limitations. For a plain isolated container without managed inference, OpenShell alone may be enough.
