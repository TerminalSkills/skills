---
name: kilo-code
description: >-
  Kilo Code is an open-source AI coding agent that runs in the terminal, VS Code
  and JetBrains, reads and edits a codebase, runs commands, and works with 500+
  models from any provider, including local Ollama. Use it to script the `kilo`
  CLI: one-shot `kilo run` tasks, CI jobs with `--auto`, provider and model
  setup in `kilo.jsonc`, permission rules, and custom agents in `.kilo/agents/`.
  Triggers: "set up Kilo Code", "kilo run in CI", "use Kilo with Ollama",
  "Kilo custom agent", "open-source coding agent that works with any model".
license: Apache-2.0
compatibility: "Kilo CLI 7.x (npm @kilocode/cli, Homebrew, AUR or release binary) on macOS, Linux or Windows x64/arm64; an API key for a model provider, a Kilo account, or a local Ollama/LM Studio server"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["coding-agent", "cli", "ai-coding", "ollama", "ci-cd"]
  repository: https://github.com/Kilo-Org/kilocode
---

# Kilo Code — open-source coding agent for the terminal and the IDE

## Overview

Kilo Code is an MIT-licensed coding agent. The same engine runs as a terminal UI (`kilo`), a VS Code extension, a JetBrains plugin and a hosted Cloud Agent. The CLI is a fork of OpenCode, so it reads OpenCode-style config and adds Kilo's own agents, the Kilo Gateway (one account for many models, billed at provider price) and commands such as `kilo cloud`.

What an agent or a script usually needs from it:

- `kilo run "..."` for one-shot, non-interactive tasks, with `--auto` for CI.
- `kilo.jsonc` for the default model, provider credentials, permission rules and MCP servers.
- Built-in agents: `code` (default, full tools), `plan` (writes plans to `.kilo/plans/` only), `ask` (read-only), `debug`; plus custom agents as Markdown files.
- `AGENTS.md` at the repo root for project instructions.

Choose Kilo when you want one agent across terminal, VS Code and JetBrains with a free choice of model, including local ones. Choose `aider` for git-first pair programming with automatic commits, `cline` for a VS Code-only plan/act loop, `continue-dev` for IDE autocomplete and chat, `claude-code` when the team is standardised on Anthropic models, and upstream `opencode` if you want the terminal agent without Kilo's IDE plugins, gateway and cloud features.

## Instructions

### Installation

```bash
# npm (installs the `kilo` and `kilocode` commands)
npm install -g @kilocode/cli

# Homebrew (macOS / Linux)
brew install Kilo-Org/tap/kilo

# Arch Linux (AUR)
paru -S kilo-bin

kilo --version
```

pnpm (`pnpm add -g @kilocode/cli`) and bun (`bun add -g @kilocode/cli`) work too. Release binaries (`kilo-linux-x64.tar.gz`, `kilo-darwin-arm64.zip`, a `musl` build for Alpine) are on the GitHub Releases page; tags for the CLI look like `v7.8.1`, while `jetbrains/v...` tags are the IDE plugin. Update with `kilo upgrade` or `npm update -g @kilocode/cli`.

### Connect a model provider

Interactive: start `kilo` in a project and run `/connect`, or run `kilo auth login` and pick a provider. `kilo auth list` shows stored credentials and the provider keys it found in the environment.

Non-interactive (CI, containers): set the provider's standard variable, such as `ANTHROPIC_API_KEY` (created under API keys in console.anthropic.com) or `OPENROUTER_API_KEY` (openrouter.ai → Keys), from your secret store. Kilo detects it without any config.

```bash
kilo auth list          # "Environment" section lists the detected ANTHROPIC_API_KEY / OPENROUTER_API_KEY
kilo models anthropic   # model IDs to use with --model, e.g. anthropic/claude-sonnet-5-5
```

Models are always written `provider/model`.

### Configure with kilo.jsonc

Global config lives in `~/.config/kilo/kilo.jsonc`; project config in `./kilo.jsonc` or `./.kilo/`. Project settings win. `kilo debug config` prints the merged result.

```jsonc
{
  "$schema": "https://app.kilo.ai/config.json",
  "model": "anthropic/claude-sonnet-5-5",
  "default_agent": "code",
  "instructions": ["CONTRIBUTING.md"],
  "permission": {
    "bash": {
      "*": "ask",
      "npm test*": "allow",
      "npm run lint*": "allow",
      "git diff*": "allow",
      "rm *": "deny",
      "git push*": "deny"
    },
    "edit": "allow"
  }
}
```

Permission values are `allow`, `ask` and `deny`; within a tool, the last matching pattern wins, so put `"*"` first. `external_directory` rules control access outside the start directory.

`{env:VAR}` references only resolve in trusted config: the global file or `KILO_CONFIG_CONTENT`. This stops a cloned repo from sending your keys to its own `baseURL`. A project `kilo.jsonc` that contains any `{env:...}` reference is rejected as a whole (in 7.8.1 only a `ConfigInvalidError ... skipped config` warning in `--print-logs`), so its `model` and `deny` rules silently stop applying. Check with `kilo debug config` that your rules are in the merged output.

### Run one-shot tasks

```bash
kilo run "add input validation to src/routes/signup.ts and update its tests"
kilo run --agent ask "where is the retry logic for webhook delivery?"
kilo run --model anthropic/claude-sonnet-5-5 -f docs/rfc-042.md "implement the RFC"
kilo run --format json --agent ask "list every TODO in src/" > run.jsonl
kilo run --continue "now add a changelog entry"    # continue the last session
```

Without `--auto`, a non-interactive run auto-rejects any action whose rule is `ask` and exits `1` with "run ended with an auto-rejected permission". With `--auto`, everything not explicitly `deny` is approved. Exit codes: `0` the run finished, `1` error or rejection, `124` timeout. `0` does not mean the task was done: a model that lost the prompt and edited nothing also exits `0`, so verify the result (run the tests, check `git diff`) before acting on it.

`--format json` prints one JSON event per line (`step_start`, `tool_use`, `text`, `step_finish`); the answer is in `.part.text`:

```bash
jq -r 'select(.type=="text") | .part.text' run.jsonl
```

### Custom agents

Put a Markdown file in `.kilo/agents/` (project) or `~/.config/kilo/agent/` (global); the file name is the agent name.

```markdown
---
description: Reviews diffs for bugs and missing tests without editing files
mode: primary
permission:
  edit: deny
  bash:
    "*": deny
    "git diff*": allow
    "git log*": allow
steps: 20
---
You review code changes. Report concrete bugs with file and line, then missing tests.
Never modify files.
```

`kilo agent list` shows it next to `code`, `plan`, `ask` and `debug`; use it with `kilo run --agent reviewer "..."` or `Tab` in the TUI. `mode: subagent` makes it callable only by other agents; `steps` caps tool-call rounds.

### Local models with Ollama

Ollama serves models with a small context window (4096 tokens by default) and silently truncates Kilo's long system prompt, so the model never sees your task. `limit.context` in `kilo.jsonc` is only Kilo's own budget and does not change Ollama. Raise the window on the Ollama side, either for the whole server (`OLLAMA_CONTEXT_LENGTH=65536 ollama serve`) or as a model variant:

```bash
ollama pull gpt-oss:20b
printf 'FROM gpt-oss:20b\nPARAMETER num_ctx 65536\n' > Modelfile.gpt-oss-64k
ollama create gpt-oss:20b-64k -f Modelfile.gpt-oss-64k
ollama show gpt-oss:20b-64k --parameters   # num_ctx 65536
```

Then point Kilo at the variant:

```jsonc
{
  "model": "ollama/gpt-oss:20b-64k",
  "provider": {
    "ollama": {
      "options": { "baseURL": "http://localhost:11434/v1" },
      "models": {
        "gpt-oss:20b-64k": {
          "name": "gpt-oss 20B (64k context)",
          "tool_call": true,
          "limit": { "context": 65536, "output": 8192 }
        }
      }
    }
  }
}
```

`kilo models ollama` should list the model. The same steps work for other tool-calling models such as `qwen3-coder:30b`.

### Useful TUI commands

`/init` writes or updates `AGENTS.md`, `/review` reviews uncommitted changes (`/review branch main` for a branch), `/models` and `/agents` switch model or agent, `/undo` reverts the last message, `/compact` summarises a long session, `/resume-claude` and `/resume-codex` import a Claude Code or Codex session into an empty one. `kilo --worktree fix-auth` starts in a separate git worktree.

## Examples

### Example 1: Fix failing tests in GitHub Actions

Request: "When the nightly test job fails, have an agent try a fix and push it to a branch for review."

```yaml
name: nightly-autofix
on:
  workflow_run:
    workflows: ["nightly-tests"]
    types: [completed]
  workflow_dispatch:
jobs:
  autofix:
    if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'failure'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_branch || github.ref }}
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm install -g @kilocode/cli
      - name: Let Kilo fix failing tests
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          KILO_CONFIG_CONTENT: >-
            {"permission":{"bash":{"*":"deny","npm test*":"allow","npx vitest*":"allow"}}}
        run: |
          kilo run --auto --model anthropic/claude-sonnet-5-5 \
            "Run npm test. Fix the code (not the tests) until the suite passes. Summarise each fix."
      - name: Check the fix independently
        run: npm test
      - name: Push the fix to a review branch
        run: |
          git config user.name "kilo-bot"
          git config user.email "kilo-bot@users.noreply.github.com"
          git checkout -b kilo/nightly-${{ github.run_id }}
          git add -A
          git commit -m "fix: nightly test repairs by Kilo" && git push -u origin HEAD
```

The job runs when the `nightly-tests` workflow finishes with `failure` (or by hand). `--auto` approves edits and the two allowed test commands; every other shell command is denied by `KILO_CONFIG_CONTENT`. Kilo's exit `0` only means the run finished, so `npm test` runs again as its own step and the push happens only if it passes. `git add -A` includes new files the agent created, and `contents: write` lets the default `GITHUB_TOKEN` push (repositories created since 2023 default to read-only). A person reviews the branch. The Anthropic key is a repository secret created in the Anthropic Console.

### Example 2: Offline refactor with a local model

Request: "I can't send this code to a cloud API. Make slugify collapse spaces and trim hyphens, using my local Ollama."

After creating the `gpt-oss:20b-64k` variant as shown above, `kilo.jsonc` in the repo uses that Ollama block and adds `"permission": { "bash": { "*": "ask", "node *": "allow", "rm *": "deny" } }`.

```bash
kilo run "Update slugify in src/slug.mjs so runs of spaces become one hyphen and leading/trailing hyphens are trimmed. Then run: node -e \"import('./src/slug.mjs').then(m=>console.log(m.slugify('  Hello  World  ')))\""
```

Result: Kilo reads `src/slug.mjs`, prints the diff of its edit (a `\s+` → `-` replace plus a trim), runs the allowed `node` command and prints `hello-world`, then a one-line summary. Nothing leaves the machine; a request for any shell command other than `node` would be auto-rejected.

## Guidelines

- Treat `--auto` like giving the agent a shell: use it only in CI runners or containers, and pair it with `deny` rules for `git push`, `rm`, deploy and package-publish commands. `/auto-approve` in the TUI saves the same setting to global config.
- Without `--auto`, scripts fail fast on `ask` rules; allow exactly the commands the task needs instead of switching to `--auto`.
- Keep secrets in environment variables or `kilo auth`; never put `{env:...}` references in a project `kilo.jsonc`, because the whole file is then skipped, including its `deny` rules. Put them in global config or `KILO_CONFIG_CONTENT`.
- `AGENTS.md` and `AGENT.md` are write-protected; the agent asks before changing them.
- Local models need tool calling and a large context; small models loop or stop early. If a local run answers "No task was specified" or calls tools that do not exist, Ollama's context window is still too small. Test with `kilo roll-call "ollama/.*"` before a long job.
- `kilo --continue` (TUI) takes no prompt; to add a follow-up from a script, use `kilo run --continue "next step"`. It resumes the most recent session in that directory, whichever it was.
- Remote mode (`/remote`) lets anyone signed in to your Kilo account send prompts to your machine; leave it off on shared accounts.
- Telemetry is on by default; set `"experimental": { "openTelemetry": false }` in `kilo.jsonc` to turn it off.
- Skip Kilo if you only ever need one IDE and one vendor's models and already have that vendor's agent set up; its strength is model choice and the same agent in terminal, VS Code and JetBrains.
