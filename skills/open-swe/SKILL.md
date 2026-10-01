---
name: open-swe
description: >-
  Open SWE is LangChain's open-source asynchronous coding agent: a self-hosted
  service that takes tasks from a dashboard, GitHub, Slack or Linear, works in
  an isolated sandbox and opens pull requests. Use when a user asks to deploy
  or run Open SWE, set up its GitHub App and Slack bot, trigger it with
  @openswe, have it review pull requests, call it from CI with the oswe CLI,
  or customize its model, sandbox and prompts.
license: MIT
compatibility: "Self-hosted: Python 3.14+, uv, Node.js 22.22.2+, pnpm, Docker (PostgreSQL), a LangSmith API key and a GitHub App"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: [swe-agent, coding-agent, langchain, async, automation]
  repository: https://github.com/langchain-ai/open-swe
  use-cases:
    - "Build a bot that picks up GitHub issues and submits PRs automatically"
    - "Create an async coding agent that works on tasks while you sleep"
    - "Automate bug fixes and code improvements with SWE agent patterns"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Open SWE

## Overview

Open SWE (by LangChain, MIT) is an application you deploy, not a library you import. One deployment contains a LangGraph server with the agent graphs, a FastAPI app for webhooks and the dashboard API, and a web dashboard. It is built on Deep Agents and LangGraph.

```
Dashboard task · @openswe on a GitHub issue or PR · Slack mention · Linear comment
    ↓
Plan and investigate → implement in a per-thread sandbox → validate → open a PR
    ↓
Review, CI monitoring (/baby-sit), follow-up messages in the same thread
```

There is no `open-swe` package on PyPI and no `SWEAgent` class: you clone the repository, configure it with environment variables and run it. The project is under active development, expects breaking changes and does not accept external issues or contributions.

## Instructions

### Step 1: Clone and install

```bash
git clone https://github.com/langchain-ai/open-swe.git
cd open-swe
uv venv
source .venv/bin/activate
uv sync --all-extras          # also installs the LangGraph CLI
```

### Step 2: Create a GitHub App

Open SWE authenticates as a GitHub App to clone, push, open pull requests and sign users in. In GitHub → Settings → Developer settings → GitHub Apps → New GitHub App:

- **Callback URL**: `http://localhost:2024/dashboard/api/auth/callback` (for a deployment, the deployment URL with the same path)
- **Webhook URL**: the public URL plus `/webhooks/github` (locally, the ngrok domain from Step 5); **Webhook secret**: output of `openssl rand -hex 32`
- **Repository permissions**: Contents, Pull requests, Issues, Checks and Workflows read & write; Commit statuses and Metadata read-only
- **Organization permissions**: Members read-only (needed when `ALLOWED_GITHUB_ORGS` is set)
- **Events**: Issue comment, Pull request review, Pull request review comment, Check run, Check suite, Workflow run

Install the App on the repositories the agent may work in. The number at the end of the installation URL is `GITHUB_APP_INSTALLATION_ID`.

### Step 3: Write `.env` in the repository root

```bash
LANGSMITH_API_KEY=""            # tracing, sandboxes and trace links
LANGSMITH_TRACING="true"
ANTHROPIC_API_KEY=""            # any one provider key: OPENAI_API_KEY, GOOGLE_API_KEY, ...

GITHUB_APP_ID=""
GITHUB_APP_CLIENT_ID=""
GITHUB_APP_CLIENT_SECRET=""
GITHUB_APP_PRIVATE_KEY=""       # the whole .pem as one double-quoted line, \n between PEM lines
GITHUB_WEBHOOK_SECRET=""
GITHUB_APP_INSTALLATION_ID=""
ALLOWED_GITHUB_USERS="mlindqvist"   # or ALLOWED_GITHUB_ORGS; one of the two is required

TOKEN_ENCRYPTION_KEY=""         # openssl rand -base64 32
DASHBOARD_JWT_SECRET=""         # openssl rand -hex 32
CONFIGURED_ADMINS="mlindqvist"  # GitHub logins or emails that see the Admin pages
```

Slack is optional locally; add `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_USER_ID` and `SLACK_BOT_USERNAME` after creating a Slack app from the manifest in `docs/INSTALLATION.md`. `agent/config.py` lists every variable with its default.

### Step 4: Run

```bash
make build-dashboard    # pnpm install + build of the web UI
make dev                # langgraph dev on http://localhost:2024; starts a postgres:16 container first
```

Open `http://localhost:2024`, sign in with GitHub, set **Admin → Global defaults → Default Repository**, then start a task from the composer. `GET /ok` is the health check. After editing `.env`, restart `make dev` — it reloads on code changes only.

### Step 5: Receive webhooks through a tunnel

GitHub and Slack cannot reach `localhost`. Claim a static ngrok domain and run:

```bash
make tunnel NGROK_DOMAIN=swift-otter-openswe.ngrok-free.dev
```

`make tunnel` applies a traffic policy that exposes only `/webhooks/*`. Keep it that way: under `langgraph dev` the LangGraph API (`/threads`, `/runs`, `/assistants`, `/store`) has no authentication.

### Step 6: Start work

| Surface | How |
|---------|-----|
| Dashboard | Type the task in the composer |
| GitHub | Comment `@openswe` plus the request on an issue or pull request |
| Slack | Mention the bot in a channel, or `/oswe` with a request for a private answer |
| Linear | Comment `@openswe` on an issue (needs the Linear webhook and MCP connection) |

Mention handles default to `@openswe`, `@open-swe` and `@openswe-dev`; change them with `OPEN_SWE_MENTION_TAGS`. A GitHub commenter must have signed in to the dashboard once, otherwise the comment is skipped.

### Step 7: Customize

```bash
LLM_MODEL_ID="anthropic:claude-opus-5-5"    # provider:model
LLM_REASONING_EFFORT="high"                 # low | medium | high | max
SANDBOX_TYPE="langsmith"                    # langsmith (default) | daytona | runloop | e2b | modal | local
DEFAULT_PROMPT_PATH="/srv/open-swe/org-prompt.md"   # org-wide instructions for every run
```

- Put an `AGENTS.md` in the root of a target repository for repository-specific conventions; the agent reads it from the sandbox at startup.
- Third-party sandbox providers need their extra, for example `uv sync --extra sandbox-e2b`.
- The agent is assembled in `get_agent()` in `agent/server.py`; tools live in `agent/tools/`, middleware in `agent/middleware/`.

### Step 8: Use the `oswe` CLI

`oswe` starts an agent on a deployment and bridges it to the current directory. Every desktop release ships standalone binaries with a checksum file:

```bash
curl -fsSLO https://github.com/langchain-ai/open-swe/releases/latest/download/oswe-linux-x64.tar.gz
curl -fsSLO https://github.com/langchain-ai/open-swe/releases/latest/download/oswe-SHA256SUMS
sha256sum --ignore-missing -c oswe-SHA256SUMS    # must print "oswe-linux-x64.tar.gz: OK"
tar -xzf oswe-linux-x64.tar.gz && install -D -m 755 oswe ~/.local/bin/oswe   # -D creates ~/.local/bin; it must be on PATH
oswe --version

oswe login --backend https://northwind-open-swe-4f2a9c.us.langgraph.app
oswe auth status
```

Other builds: `oswe-darwin-arm64`, `oswe-darwin-x64`, `oswe-linux-arm64`. Credentials are tried in this order: `OPEN_SWE_API_KEY` (a workspace key minted by an admin), a GitHub Actions OIDC token, then the session stored by `oswe login`. The backend comes from `OPEN_SWE_BACKEND_URL`, then `~/.open-swe/config.json`, then `http://localhost:2024`.

### Step 9: Deploy for a team

Connect the repository to a new deployment in LangSmith → Deployments (LangGraph Platform), or build the root `Dockerfile`:

```bash
make build-dashboard
docker build -t open-swe .
docker run --env-file .env.docker -p 8123:8000 \
  -e LANGGRAPH_AUTH_TYPE="langsmith" \
  -e LANGSMITH_AUTH_ENDPOINT="https://api.smith.langchain.com" \
  open-swe
```

`docker run --env-file` passes values literally, so quotes and trailing `# comments` become part of the value: write `.env.docker` (also excluded from the image by `.dockerignore`) as bare `KEY=value` lines instead of reusing the `.env` from Step 3. Add to it: `DATABASE_URI` and `POSTGRES_URI` (the same PostgreSQL database), `REDIS_URI`, `LANGSMITH_TENANT_ID` (the LangSmith workspace id), `LANGGRAPH_CLOUD_LICENSE_KEY` (a standalone Agent Server needs a license key) and `LANGGRAPH_URL` (the public URL). Register that URL's callback and webhook paths on the GitHub App.

## Examples

### Example 1: Fix a GitHub issue from a comment

**User request:** "We run Open SWE locally. Have it fix issue #482 in `northwind/billing-api` — sessions expire after 5 minutes instead of 30."

With `make dev` and `make tunnel` running and the App installed on the repository, comment on the issue:

```
@openswe Sessions expire after 5 minutes instead of 30. Find where the session TTL is set,
fix it, add a regression test, and open a PR.
```

Within a few seconds the comment gets a 👀 reaction and a run appears in the LangSmith project. The agent clones the repository into a sandbox, makes the change, runs the tests, opens a pull request and replies on the issue. Follow-up comments that mention `@openswe` continue the same thread and sandbox. If nothing happens, check the App's **Advanced** tab for the webhook delivery and the server log for `No email mapping for GitHub user` (the commenter has not signed in to the dashboard).

### Example 2: Ask the agent a yes/no question in CI

**User request:** "In our GitHub Actions workflow, have Open SWE review the diff and fail the job if it finds missing error handling."

```yaml
permissions:
  contents: read
  id-token: write          # lets the job authenticate with its OIDC token
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - name: Install oswe (checksum-verified)
    run: |
      curl -fsSLO https://github.com/langchain-ai/open-swe/releases/latest/download/oswe-linux-x64.tar.gz
      curl -fsSLO https://github.com/langchain-ai/open-swe/releases/latest/download/oswe-SHA256SUMS
      sha256sum --ignore-missing -c oswe-SHA256SUMS
      tar -xzf oswe-linux-x64.tar.gz && sudo install -m 755 oswe /usr/local/bin/oswe
  - name: Review the diff
    run: |
      git diff origin/main...HEAD | oswe run "Review this diff. Answer no if any new network call lacks error handling." > review.txt
    env:
      OPEN_SWE_BACKEND_URL: https://northwind-open-swe-4f2a9c.us.langgraph.app
```

`oswe run` prints the thread's dashboard URL to stderr, writes only the agent's final result to stdout (here into `review.txt`) and exits with the code the agent reports: `0` done or yes, `1` failed or no, `2` could not tell. Piped input is attached below the prompt. An admin must first allow the repository to start threads in its workspace settings; machine callers always get `system` threads that act as the GitHub App, not as a person.

## Guidelines

- **`oswe run` is not sandboxed.** The remote agent's shell commands and file writes execute on the machine running the CLI, as the invoking user, in the current directory. Run it in a disposable checkout or CI runner. Variables ending in `_API_KEY`, `_TOKEN`, `_SECRET` or `PASSWORD` are stripped from the agent's shell, except `GITHUB_TOKEN` and `GH_TOKEN`.
- **`SANDBOX_TYPE="local"` has no isolation.** It runs commands on the host; use it only for development.
- **Never expose port 2024 or a `noop`-auth container.** With `langgraph dev`, or a standalone image without `LANGGRAPH_AUTH_TYPE="langsmith"`, anyone who can reach the port can read and create threads and runs.
- **Webhook secrets are mandatory.** Without `GITHUB_WEBHOOK_SECRET`, `SLACK_SIGNING_SECRET` or `LINEAR_WEBHOOK_SECRET` every request to that endpoint is rejected with 401. A changed secret takes effect only after a restart.
- **Login needs an allowlist.** The server refuses to start unless `ALLOWED_GITHUB_ORGS` or `ALLOWED_GITHUB_USERS` is set.
- **Scope the GitHub App.** Sandboxes normally receive installation-wide App access, so install the App only on repositories the agent should touch, and do not store personal GitHub tokens as deployment variables.
- **Do not use scale-to-zero hosting** for the Docker deployment; background runs rely on the Redis- and Postgres-backed workers staying up.
- **Give each deployment its own GitHub App and Slack app**, or at least distinct mention handles, when several share an organization.
- **Rotate `TOKEN_ENCRYPTION_KEY` by prepending** a new key to a comma-separated list. Tokens still encrypted under a removed key cannot be decrypted, and those users must sign in again.
- **When not to use it:** for a single developer working interactively, a local coding agent is simpler. Open SWE pays off when a team wants shared, asynchronous runs triggered from GitHub and Slack.
