---
name: paperclip
description: >-
  Paperclip is a self-hosted Node.js server and web dashboard that runs a team of AI coding agents
  (Claude Code, Codex, Gemini CLI, OpenCode, OpenClaw) as a company, with an org chart, goals, tasks,
  monthly budgets and approval gates. Use when someone wants to install or run Paperclip, hire agents,
  assign tasks to them, cap agent spend, or script it through the paperclipai CLI or its REST API.
  Phrases: "set up Paperclip", "run my agents like a company", "too many Claude Code tabs",
  "give each agent a budget", "paperclipai onboard".
license: Apache-2.0
compatibility: "Node.js 24.11+ (npm/npx); pnpm 9.15+ only for source checkouts; agent CLIs such as claude or codex installed and signed in (or ANTHROPIC_API_KEY/OPENAI_API_KEY set) for local adapters"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["ai-agents", "agent-orchestration", "claude-code", "budgets", "self-hosted"]
  repository: https://github.com/paperclipai/paperclip
---
# Paperclip — Run a Team of AI Agents Like a Company

## Overview

Paperclip is an open-source (MIT) control plane for AI agents. One Node.js process serves a React
dashboard and a JSON API on port 3100 and manages an embedded PostgreSQL database, so a local install
needs no extra services. You create a company, set goals, hire agents with roles and reporting lines
(CEO, CTO, engineer, designer...), and hand them issues. Paperclip wakes an agent through its adapter
(`claude_local`, `codex_local`, `gemini_local`, `opencode_local`, `openclaw_gateway`, `http`,
`process`, and others) when work is assigned, locks each issue to one agent, records cost, and
pauses an agent whose billed API spend hits its monthly budget.

Paperclip does not build agents; it organises agents you already run. An AI coding agent can install
it, configure it, and drive it through the `paperclipai` CLI or the REST API. The web UI is for the
human who reviews work and approves hires.

## Instructions

### Install and start a local instance

```bash
node --version                           # must be v24.11.0 or newer
npx paperclipai@latest onboard --yes     # quickstart defaults, then starts the server
```

`onboard --yes` writes config under `~/.paperclip/instances/default/`, creates the embedded
database, and serves the UI and API at `http://localhost:3100` (health check:
`http://localhost:3100/api/health`). It runs in the foreground in trusted loopback mode: no login,
reachable only from this machine. Useful variations:

```bash
# Keep all state in a project folder instead of ~/.paperclip
npx paperclipai@latest onboard --yes --data-dir ./.paperclip-data

# Headless machine: do not open a browser tab
PAPERCLIP_NO_BROWSER=1 npx paperclipai@latest onboard --yes

# Start later with onboarding + health checks + server in one command
npx paperclipai run
npx paperclipai doctor --repair          # diagnose config, database, storage, secrets
```

Rerunning `onboard` keeps the existing config; change settings with
`npx paperclipai configure --section server` (also `secrets`, `storage`). For a persistent command,
`npm install -g paperclipai` works; the docs recommend `paperclipai install` (managed store with
`paperclipai update` and `paperclipai update --rollback`) and `paperclipai service install` to run
it as a background service.

### Throwaway demo instance

`test-drive` creates an isolated, already initialised instance with a company and a CEO agent. It
reads the provider key from `ANTHROPIC_API_KEY` (harness `claude`, default), `OPENAI_API_KEY`
(`codex`) or `OPENROUTER_API_KEY` (`opencode`), or from `--api-key-env`:

```bash
npx paperclipai test-drive --company-name "Northwind Notes" --no-browser
npx paperclipai test-drive --harness codex --data-dir ./pc-demo
```

Without `--data-dir` each run gets a new temporary directory (the path is printed at startup). It is
meant for evaluation, not for a company you intend to keep.

### Reach it from other devices (authenticated mode)

Loopback mode has no authentication. To use Paperclip from a phone or another machine, start with a
bind preset that switches to authenticated mode, and allow the hostname you will use:

```bash
npx paperclipai@latest onboard --yes --bind tailnet    # or --bind lan
npx paperclipai allowed-hostname notes-server.tail4c2e1.ts.net
```

For Docker, the repository ships `docker/docker-compose.quickstart.yml` (image with the `claude`,
`codex`, `opencode` and `gemini` CLIs). It refuses to start without `BETTER_AUTH_SECRET`, runs in
authenticated mode (sign in at the URL), and agents need at least one provider key:

```bash
cd paperclip/docker                       # inside a clone of paperclipai/paperclip
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
# ANTHROPIC_API_KEY (console.anthropic.com) or OPENAI_API_KEY must already be exported
export PAPERCLIP_PUBLIC_URL=http://notes-server.tail4c2e1.ts.net:3100   # only for other machines
export PAPERCLIP_ALLOWED_HOSTNAMES=notes-server,192.168.1.40            # extra aliases, optional
docker compose -f docker-compose.quickstart.yml up --build
```

Data persists in `../data/docker-paperclip` (override with `PAPERCLIP_DATA_DIR`).

### Point the CLI at the instance

Control-plane commands talk to the API. Save the base URL and company once in a context profile;
pass `-C`/`--company-id` explicitly anyway, because `issue create`, `goal create`, `agent list`,
`dashboard get`, `approval list` and `activity list` require it on the command line.

```bash
COMPANY_ID=$(npx paperclipai company create \
  --payload-json '{"name":"Northwind Notes","description":"AI note-taking app","budgetMonthlyCents":20000}' \
  --json | jq -r .id)
npx paperclipai context set --api-base http://localhost:3100 --company-id "$COMPANY_ID" --use
npx paperclipai context show
```

In authenticated mode the CLI needs a board credential first: the human runs
`npx paperclipai auth login` (it opens a sign-in flow) and `npx paperclipai auth whoami` confirms it.
For an API token read from the environment, use
`npx paperclipai context set --api-key-env-var-name PAPERCLIP_API_KEY` so the value never lands in
the context file. All commands accept `--json` for machine-readable output.

### Goals, agents and tasks

A `claude_local` agent needs `claude` on PATH plus credentials: `ANTHROPIC_API_KEY` or
`CLAUDE_CODE_OAUTH_TOKEN` in the server's environment or in `adapterConfig.env`, or an existing
Claude Code login on the host (`npx paperclipai agent claude-login "$AGENT_ID"` triggers one). With
no `model` set it runs `claude-opus-5`. Assigning a `todo` issue starts a real session within
seconds; it spends that login or key and auto-approves every tool call (it starts in `cwd` but is
not confined to it).

```bash
GOAL_ID=$(npx paperclipai goal create -C "$COMPANY_ID" \
  --title "Reach 500 paying users by March" --level company --json | jq -r .id)

# Hire a Claude Code agent that works in a dedicated checkout
AGENT_ID=$(npx paperclipai agent create -C "$COMPANY_ID" --payload-json '{
  "name": "Priya", "role": "cto", "title": "CTO",
  "capabilities": "TypeScript, Postgres, API design",
  "adapterType": "claude_local",
  "adapterConfig": {"cwd": "/srv/northwind/app", "model": "claude-sonnet-5",
                    "timeoutSec": 1800, "maxTurnsPerRun": 80},
  "budgetMonthlyCents": 5000
}' --json | jq -r .id)

# Assign work; assignment wakes the agent and starts a paid run immediately
npx paperclipai issue create -C "$COMPANY_ID" \
  --title "Add Stripe checkout to the pricing page" \
  --description "Monthly and yearly plans; webhook marks the user as paid." \
  --status todo --priority high --goal-id "$GOAL_ID" --assignee-agent-id "$AGENT_ID"
```

Roles: `ceo`, `cto`, `cmo`, `cfo`, `security`, `engineer`, `designer`, `pm`, `qa`, `devops`,
`researcher`, `general`. Set `reportsTo` to a manager's agent ID to build the org chart. Issues get
identifiers such as `NOR-1` from the company prefix; an issue created without `--status` lands in
`backlog`. Follow and steer the work:

```bash
npx paperclipai issue list -C "$COMPANY_ID" --status todo,in_progress
npx paperclipai issue get NOR-1
npx paperclipai issue comment NOR-1 --body "Use the tone from the March launch emails."
npx paperclipai issue update NOR-1 --status todo --comment "Unblocked: API keys are in secrets"
npx paperclipai agent pause "$AGENT_ID"     # stop heartbeats; agent resume restarts them
npx paperclipai approval list -C "$COMPANY_ID" --status pending
npx paperclipai activity list -C "$COMPANY_ID"
```

### Budgets and cost

Budgets are integer cents per calendar month (UTC). The docs describe a soft alert at 80% and an
automatic pause at 100%. Only billed API spend counts: a `claude_local` run on a Claude
subscription login (the default when no `ANTHROPIC_API_KEY` is set) is recorded as 0 cents and
never trips the budget. For a real dollar cap, give the agent an API key; otherwise limit runs
with `timeoutSec` and `maxTurnsPerRun`.

```bash
npx paperclipai budget agent:update "$AGENT_ID" --payload-json '{"budgetMonthlyCents":8000}'
npx paperclipai budget company:update -C "$COMPANY_ID" --payload-json '{"budgetMonthlyCents":30000}'
npx paperclipai cost summary -C "$COMPANY_ID" --json    # spendCents, budgetCents, utilizationPercent
npx paperclipai cost by-agent -C "$COMPANY_ID" --json
npx paperclipai dashboard get -C "$COMPANY_ID" --json   # agents, open tasks, month spend, approvals
```

### REST API

Everything the CLI does goes through `http://localhost:3100/api`. Loopback mode needs no token;
authenticated mode takes `Authorization: Bearer $PAPERCLIP_API_KEY`.

```bash
API=http://localhost:3100/api
curl -s "$API/companies/$COMPANY_ID/issues?status=todo,in_progress"
curl -s -X POST "$API/companies/$COMPANY_ID/issues" -H 'Content-Type: application/json' \
  -d '{"title":"Write pricing page copy","status":"todo","priority":"medium"}'
curl -s -X PATCH "$API/agents/$AGENT_ID" -H 'Content-Type: application/json' \
  -d '{"budgetMonthlyCents":6000}'
curl -s "$API/companies/$COMPANY_ID/costs/summary"
curl -s "$API/companies/$COMPANY_ID/org"
```

`npx paperclipai openapi` prints the full OpenAPI document.

## Examples

### Example 1: "I have too many Claude Code tabs. Put my agents in Paperclip."

Maya runs a two-person SaaS and wants her backend work handled by one Claude Code agent with a
$50 monthly cap, tracked in one dashboard on her laptop. Claude Code is installed, and the cap
must hold, so the server gets her Anthropic API key (a subscription login would bill 0 cents):

```bash
# ANTHROPIC_API_KEY exported from console.anthropic.com > Settings > API Keys
PAPERCLIP_NO_BROWSER=1 npx paperclipai@latest onboard --yes    # leave running in its own terminal
npx paperclipai context set --api-base http://localhost:3100 --use
COMPANY_ID=$(npx paperclipai company create \
  --payload-json '{"name":"Ledgerly","budgetMonthlyCents":15000}' --json | jq -r .id)
AGENT_ID=$(npx paperclipai agent create -C "$COMPANY_ID" --payload-json '{
  "name":"Backend","role":"engineer","title":"Backend Engineer",
  "adapterType":"claude_local","adapterConfig":{"cwd":"/Users/maya/code/ledgerly-api"},
  "budgetMonthlyCents":5000}' --json | jq -r .id)
npx paperclipai issue create -C "$COMPANY_ID" --title "Fix CSV export timezone bug" \
  --status todo --priority high --assignee-agent-id "$AGENT_ID"
```

Result: the issue appears as `LED-1` in the dashboard; within seconds the agent starts a Claude
session in `ledgerly-api`, checks the issue out (status `in_progress`) and edits files without
asking. `npx paperclipai cost by-agent -C "$COMPANY_ID" --json` shows API spend against the
5000-cent budget as runs finish. `agent pause` stops a run that goes the wrong way.

### Example 2: "How much did the agents spend this month, and who is stuck?"

```bash
npx paperclipai cost summary -C "$COMPANY_ID" --json
npx paperclipai issue list -C "$COMPANY_ID" --status blocked --json | jq -r '.[] | "\(.identifier) \(.title)"'
npx paperclipai dashboard get -C "$COMPANY_ID" --json | jq '{agents, tasks, costs}'
```

Result, from a company with a $200 budget:

```json
{"companyId":"aa880bc1-75ef-457f-8d46-9bf84586dd66","spendCents":13200,"budgetCents":20000,"utilizationPercent":66}
```

followed by lines such as `LED-14 Migrate invoices table to UUID keys` for blocked work, and counts of
active, paused and errored agents. The agent reads the blockers with `issue get` and reports which
need a human decision.

## Guidelines

- Always pass `-C "$COMPANY_ID"` on company-scoped commands; the context profile is not enough for
  `issue create`, `goal create`, `agent list`, `dashboard get`, `approval list` and `activity list`.
- `claude_local` defaults to the ACP engine (`claude-agent-acp`) with every tool call approved
  (`approve-all`); `command`, `extraArgs` and `dangerouslySkipPermissions` apply only to
  `"engine":"cli"`. Confinement (`filesystemScope: "workspace"`, `networkScope: "deny"` or
  `"allowlist"`) needs `engine: "cli"` and Bubblewrap on Linux. Point `cwd` at a dedicated
  checkout or worktree, never at a directory holding credentials, and review diffs before merging.
- Budgets count billed API cents only; subscription-billed runs show `costCents: 0` and are counted
  as `subscriptionRunCount`. In-flight runs can overshoot a hard stop slightly.
- A 409 on checkout means another agent owns the task; do not retry it. A @-mention in a comment
  does not wake another agent; assign the issue instead.
- Loopback mode has no authentication. Never expose port 3100 with a reverse proxy or `HOST=0.0.0.0`
  unless the instance runs in authenticated mode (`--bind lan`/`tailnet`).
- `paperclipai env` prints secret values such as the agent JWT secret; do not paste its output into
  issues or chat.
- Telemetry is on by default; disable it with `PAPERCLIP_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1`.
- `agent terminate` and `company delete` are irreversible; prefer `agent pause`.
- Source checkouts (`git clone`, `pnpm install`, `pnpm dev`) need pnpm 9.15+ and a Rust toolchain
  or a prebuilt runner binary (`PAPERCLIP_RUNNER_BINARY`); use npx unless you are changing Paperclip.
- When NOT to use it: a single agent on a single task (just run Claude Code), or building an agent's
  logic in code (use a framework such as CrewAI or Mastra). Paperclip earns its keep once several
  agents work continuously and someone needs to track ownership, cost and approvals.
