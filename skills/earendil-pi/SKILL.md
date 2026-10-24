---
name: earendil-pi
description: >-
  Pi is a minimal, open-source terminal coding agent from Earendil Works that works with many model providers and is customised through extensions, skills and prompt templates. Use when the user asks to install Pi, run `pi` in a repository, log in to a provider, script Pi with `--print` or `--mode json`, point it at a local Ollama model, add MCP servers, or sandbox an agent that has no built-in permission prompts.
license: Apache-2.0
compatibility: "Node.js 22.19+, npm; an API key or subscription login for at least one model provider (or a local OpenAI-compatible server)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "pi, coding-agent, terminal, multi-provider, mcp"
  repository: https://github.com/earendil-works/pi
---

# Pi — a minimal terminal coding agent with any model provider

## Overview

Pi (`@earendil-works/pi-coding-agent`, command `pi`) is a coding agent that runs in your terminal. It ships with four tools by default (`read`, `bash`, `edit`, `write`) and a short system prompt, and leaves everything else (sub-agents, plan mode, permission gates) to extensions you add or ask Pi to write. It talks to many providers (Anthropic, OpenAI, Google, Mistral, Groq, OpenRouter, GitHub Copilot, and others) and to any OpenAI-compatible endpoint such as Ollama, LM Studio or vLLM.

It has four ways to run: the interactive terminal UI, print mode for scripts, a JSONL event stream, and an RPC mode for embedding. It also has a TypeScript SDK for building your own agent apps. Pi reads `AGENTS.md` or `CLAUDE.md` for project instructions and the Agent Skills layout (`.agents/skills/`, `.pi/skills/`), so an existing repository usually works without changes.

Pi has no permission system. It runs with the rights of the user who started it and does not ask before running commands. Treat it as you would a shell: sandbox it for unattended or untrusted work.

## Instructions

### Install

```bash
node --version   # must be v22.19 or newer
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi --version
```

The npm route does not pin transitive dependencies. The project also publishes an installer at pi.dev that pins them; if you want it, download the script to a file, read it, then run it as a separate step instead of piping it into a shell. Update later with `pi update` (Pi itself), `pi update --extensions` (packages) or `pi update --models` (model catalog).

### Connect a provider

Interactive: start `pi` in a project, type `/login`, pick a provider and follow the OAuth or API-key flow. The credential is stored in `auth.json` inside the agent directory (`~/.pi/agent` by default, override with `PI_CODING_AGENT_DIR`). Keep that file out of git.

Non-interactive (CI, containers): export the provider's key before starting Pi.

```bash
export ANTHROPIC_API_KEY="$(cat ~/.secrets/anthropic-key)"   # created in console.anthropic.com
pi auth check --provider anthropic --json
```

Variables per provider include `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` and `COPILOT_GITHUB_TOKEN`. `pi auth check` prints `ready`, `not_ready` or `invalid` and exits `0`, `1` or `2`, which makes it usable as a CI preflight. In `auth.json` a key can be fetched at runtime by prefixing a command with `!`, so no secret sits on disk.

### Work interactively

```bash
cd ~/work/billing-api
pi
```

Useful in-session commands: `/model` (or `Ctrl+L`) to pick a model, `/thinking` for reasoning level, `/settings`, `/new`, `/resume`, `/compact`, `/tree` and `/fork` to branch a session, `/export` to save it as HTML. Type `@` to attach a file, prefix a line with `!` to run a shell command and put its output into the conversation (`!!` keeps the output out of the model's context). `Escape` stops the current task; `Enter` while Pi is working steers it, `Alt+Enter` queues a follow-up. `pi --continue` resumes the last session in the folder.

### Choose a model

```bash
pi --list-models gemini                  # list models, optional fuzzy filter
pi --model google/gemini-2.5-pro:high    # provider/id with a thinking suffix
pi --models "gemini-2.5*" --thinking medium   # limit the models offered for cycling
```

`--model` accepts an exact ID, a fuzzy match, or `provider/id`, with an optional `:off|minimal|low|medium|high|xhigh|max` suffix. Run `pi --list-models` to see which IDs your installed version knows; the catalog changes often, so do not hard-code a name from this page.

### Use a local model through Ollama

Create `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [{ "id": "qwen2.5-coder:7b" }]
    }
  }
}
```

Then `pi --model ollama/qwen2.5-coder:7b`. The same file works for LM Studio, vLLM and SGLang with their own `baseUrl`. Use `$NAME` in `apiKey` to read a key from the environment. Add `"$schema": "https://pi.dev/schemas/models.schema.json"` for editor validation.

### Run Pi from scripts

```bash
# one-shot: final text on stdout, non-zero exit on error
pi --print "List the public functions in src/billing/invoice.ts"

# pipe context in
git diff origin/main...HEAD | pi --print "Review this change for bugs"

# structured events for another program (stdout is reserved for JSONL)
pi --mode json "Find dead code in src/" > events.jsonl

# read-only run: only these tools are declared to the model
pi --tools read,grep,find,ls --print "Where is the retry logic for failed payments?"

# bidirectional control from another process
pi --mode rpc --no-session
```

`--tools` with plain names replaces the whole tool selection, so name every tool you want. `--no-session` keeps the run in memory only. In JSON mode a failed model response appears in the event stream but does not by itself change the exit code; inspect the events when success matters.

### Configure a project

- Project instructions: `AGENTS.md` (or `CLAUDE.md`) in the repository; user-wide ones in `~/.pi/agent/AGENTS.md`.
- Project settings: `.pi/settings.json` (overrides `~/.pi/agent/settings.json`). Useful keys: `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `enabledModels`, `defaultTools`.
- Project skills: `.pi/skills/` or `.agents/skills/`; prompt templates in `.pi/prompts/` appear as slash commands.
- Project-local configuration only loads after you trust the folder. `pi -a` trusts it for one run, `pi -na` ignores it.

Add a tool without losing the defaults: `{"defaultTools": ["+codemode"]}` in settings, or `pi --tools +codemode` for one run. `codemode` lets the model run a JavaScript snippet that calls several tools in parallel and returns only the filtered output.

### Add MCP servers and packages

```bash
pi mcp add docs -- npx -y @upstash/context7-mcp   # stdio server; use --url for a streamable HTTP server
pi mcp list              # connects to each server and reports tools and errors
pi install npm:@scope/some-pi-package   # extensions, skills, prompts bundled as a package
pi list
```

`mcp add` writes `~/.pi/agent/mcp.json` (or `.pi/mcp.json` with `--local`) and does not connect, so always follow it with `pi mcp list`. Packages run code with your privileges: read a package before installing it.

## Examples

### Example 1: Nightly review of a branch in CI

A team wants a plain-text review attached to every pull request without a hosted service.

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
# OPENROUTER_API_KEY comes from the CI secret store (key created at openrouter.ai/keys)
pi auth check --provider openrouter || exit 1
git fetch origin main
git diff origin/main...HEAD | pi --tools read,grep,find,ls --no-session --print \
  "Review this diff for bugs, missing tests and unsafe SQL. Reply as a Markdown checklist." > review.md
```

Pi starts, reads the diff from stdin, may open files for context with the read-only tools, and writes the final checklist to `review.md`. A non-zero exit means the model call failed, so the job can stop before posting an empty comment.

### Example 2: Private coding agent on a laptop with Ollama

Dana cannot send the repository outside the company network.

```bash
ollama pull qwen2.5-coder:7b
mkdir -p ~/.pi/agent
# write the models.json shown above, then:
cd ~/work/ledger-service
pi --offline --model ollama/qwen2.5-coder:7b
```

Inside the session she types `Add input validation to src/api/transfer.ts and update its tests`. Pi edits the files through the local model, and `--offline` stops catalog refreshes. Smaller local models make more mistakes with tool calls; check the diff with `git diff` before committing.

### Example 3: Run Pi in a throwaway container

```bash
docker run --rm -it -v "$PWD":/work -w /work -e ANTHROPIC_API_KEY node:22 \
  sh -c 'npm install -g --ignore-scripts @earendil-works/pi-coding-agent && pi'
```

Only the mounted folder and the one environment variable are visible to the agent. The project documents this plain-Docker pattern along with a micro-VM extension (Gondolin) and OpenShell.

## Guidelines

- No built-in permission prompts: Pi will run any shell command the model proposes. Use a container or VM for unattended runs and keep real credentials out of the environment it can read.
- `auth.json` holds API keys and OAuth tokens, and session files and `/share` output can contain secrets seen during the run. Review before sharing; never commit them.
- `/share` uploads a session (a private GitHub gist through the `gh` CLI unless Radius is configured). Skip it for private code.
- Run `pi --help` and `pi <command> --help` for the exact flags of your version; this tool changes quickly.
- Pi deliberately omits sub-agents and plan mode. If you need those out of the box, a heavier agent such as opencode or kilo-code may fit better.
- Do not use `--api-key` on a shared machine (it shows in the process list); use environment variables.
