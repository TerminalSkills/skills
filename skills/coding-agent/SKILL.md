---
name: coding-agent
description: >-
  Run Codex CLI, Claude Code, or other coding agents as background processes
  for programmatic control. Use when a user asks to run a coding agent,
  delegate a task to another AI, spawn a sub-agent, run Claude Code in the
  background, or orchestrate multiple coding agents on separate tasks.
license: Apache-2.0
compatibility: "Requires at least one coding agent CLI installed (claude, codex, etc.)"
metadata:
  author: terminal-skills
  version: "1.2.0"
  category: development
  tags: "coding-agent, automation, sub-agent, background-process, orchestration"
  use-cases: "Delegate a well-defined subtask to a background coding agent, Run multiple agents in parallel on independent tasks, Automate repetitive coding tasks with agent orchestration"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Coding Agent

## Overview

Run coding agents (Claude Code, Codex CLI, Gemini CLI, or others) as background processes for programmatic task delegation. Spawn sub-agents to handle well-scoped tasks, monitor their progress, and collect results. Useful for parallel task execution, complex multi-step workflows, and automated coding pipelines.

## Instructions

When a user asks you to delegate work to a coding agent or run one in the background, follow this process:

### Step 1: Verify the agent CLI is available

Check which coding agent CLIs are installed:

```bash
# Check for Claude Code
claude --version 2>/dev/null && echo "claude available" || echo "claude not found"

# Check for Codex CLI
codex --version 2>/dev/null && echo "codex available" || echo "codex not found"

# Check for Gemini CLI
gemini --version 2>/dev/null && echo "gemini available" || echo "gemini not found"
```

If none are available, instruct the user to install one:

```bash
# Claude Code (npm installs the same native binary as the standalone installer)
npm install -g @anthropic-ai/claude-code

# Codex CLI
npm install -g @openai/codex

# Gemini CLI
npm install -g @google/gemini-cli
```

Each CLI needs its own sign-in or API key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) before it can run non-interactively; check this before you promise the user a background run.

### Step 2: Define the task clearly

Before spawning an agent, ensure the task is:
- **Well-scoped:** A single, clear objective (not "fix everything")
- **Self-contained:** The agent can complete it without interactive input
- **Verifiable:** You can check the output or result when done

Write a clear prompt that includes:
- What to do (specific action)
- Where to do it (file paths, directories)
- Constraints (do not modify other files, follow conventions)
- Expected output format

### Step 3: Run the agent

**Claude Code (background, non-interactive).** `-p` (`--print`) runs one prompt and exits. In print mode nobody can answer permission prompts, so pre-approve exactly the tools the task needs:

```bash
LOG=$(mktemp /tmp/claude-agent.XXXXXX)
claude -p "Refactor the function parseConfig in src/config.ts to use zod validation. Do not modify other files." \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Edit" "Bash(npx tsc --noEmit)" \
  --max-budget-usd 2 \
  --output-format text > "$LOG" 2>&1 &

AGENT_PID=$!     # the PID of claude itself (no pipe, so $! is not tee's PID)
echo "Agent running with PID: $AGENT_PID, log: $LOG"
```

`--output-format json` returns one JSON object; `stream-json` (needs `--verbose`) streams events. `--permission-mode` accepts `manual`, `acceptEdits`, `plan`, `auto`, `dontAsk` and `bypassPermissions`; `--permission-prompts none` makes anything that would prompt get denied instead of waiting; `--dangerously-skip-permissions` disables all checks, so use it only in a throwaway container. Claude Code also has its own background sessions: `claude --bg "investigate the flaky test" --name flaky-test` starts one and returns immediately, and `claude agents` lists and manages them.

**Codex CLI.** `codex exec` is the non-interactive entry point; it is read-only by default, streams progress to stderr and prints only the final message to stdout:

```bash
LOG=$(mktemp /tmp/codex-agent.XXXXXX)
codex exec --sandbox workspace-write --ephemeral \
  "Write unit tests for src/auth/login.ts covering success, failure, and timeout cases" \
  -o "$LOG.last" > "$LOG" 2>&1 &
AGENT_PID=$!
```

`-o <file>` writes the last message to a file, `--json` gives a JSONL event stream, `--output-schema schema.json` forces a structured final answer, and `--skip-git-repo-check` allows a non-git directory. `--full-auto` is no longer supported; use `--sandbox workspace-write` for edits, and `--worktree` to run in a fresh git worktree.

**Gemini CLI:**

```bash
gemini -p "Summarize the TODO comments in src/ as a markdown list" \
  --approval-mode auto_edit --output-format json > /tmp/gemini-todos.json 2>&1 &
```

Approval modes are `default`, `auto_edit`, `yolo` and `plan`; exit code 42 means bad input and 53 means the turn limit was hit.

### Step 4: Monitor and collect results

```bash
# Check if the agent is still running
ps -p $AGENT_PID > /dev/null 2>&1 && echo "Still running" || echo "Finished"

# Wait for completion (only works in the same shell that started it)
wait $AGENT_PID
EXIT_CODE=$?
echo "Agent exited with code: $EXIT_CODE"

# Read the output
cat "$LOG"

# Stop a runaway agent by PID, never by name
kill $AGENT_PID
```

### Step 5: Validate the results

After the agent finishes:
- Check the exit code (0 = success)
- Review the output for errors or warnings
- Verify the changes by reading modified files
- Run any relevant tests to confirm correctness
- Report the results to the user

## Examples

### Example 1: Delegate test writing to a background agent

**User request:** "Write tests for the auth module while I work on the API"

**Actions:**

```bash
# Spawn Claude Code to write tests in the background
claude -p "Write comprehensive unit tests for all functions in src/auth/. \
Use vitest as the test framework. Create test files next to source files \
with .test.ts extension. Cover success, failure, and edge cases. \
Do not modify any source files." \
  --permission-mode acceptEdits --allowedTools "Read" "Write" "Edit" "Bash(npx vitest *)" \
  --output-format text > /tmp/test-agent.txt 2>&1 &

TEST_PID=$!
echo "Test writing agent started (PID: $TEST_PID)"
```

After completion, review the generated test files and run the test suite:

```bash
wait $TEST_PID
npx vitest run src/auth/
```

### Example 2: Run parallel agents for independent tasks

**User request:** "Add types to the utils folder and add docs to the components folder"

**Actions:**

```bash
# Agent 1: Add TypeScript types
claude -p "Add strict TypeScript types to all functions in src/utils/. \
Replace any 'any' types with proper types. Do not modify files outside src/utils/." \
  --permission-mode acceptEdits --allowedTools "Read" "Edit" \
  --output-format text > /tmp/types-agent.txt 2>&1 &
PID1=$!

# Agent 2: Add documentation
claude -p "Add JSDoc documentation to all React components in src/components/. \
Include @param, @returns, and @example tags. Do not modify logic." \
  --permission-mode acceptEdits --allowedTools "Read" "Edit" \
  --output-format text > /tmp/docs-agent.txt 2>&1 &
PID2=$!

# Wait for both
wait $PID1 $PID2
echo "Both agents finished"
cat /tmp/types-agent.txt
cat /tmp/docs-agent.txt
```

### Example 3: Agent with structured output

**User request:** "Analyze the codebase and list all TODO comments with suggested fixes"

**Actions:**

```bash
claude -p "Search the entire src/ directory for TODO, FIXME, and HACK comments. \
For each one, output a JSON array with objects containing: file, line, comment, \
and suggestedFix. Only output the JSON, no other text." \
  --allowedTools "Read" "Grep" "Glob" \
  --output-format text > /tmp/todos.json 2>/tmp/todos.err

# Parse and display (fails loudly if the agent added prose around the JSON)
python3 -m json.tool /tmp/todos.json
```

## Guidelines

- Always scope tasks narrowly. Agents work best with focused, well-defined objectives.
- Use `--output-format text` or `--output-format json` for programmatic consumption; for Codex use `--json` or `-o`, for Gemini `--output-format json`.
- Pre-approve only the tools the task needs (`--allowedTools`, `--sandbox workspace-write`, `--approval-mode auto_edit`). Reserve `--dangerously-skip-permissions`, `--yolo` and `danger-full-access` for disposable containers.
- Cap runaway runs with `--max-budget-usd` (Claude Code print mode) and wrap every command in `timeout 900`; Claude Code has no turn-limit flag in `claude --help`.
- Set reasonable timeouts for background processes to avoid runaway agents.
- Never spawn agents for tasks involving secrets, credentials, or destructive operations.
- Review all agent output before presenting it to the user or applying changes.
- For parallel agents, ensure they work on non-overlapping files, or give each its own git worktree (`claude --worktree <name>`) so edits cannot collide.
- Capture both stdout and stderr to diagnose failures.
- Prefer spawning one agent per well-defined task over one agent for many tasks.
- If an agent fails, read its output, diagnose the issue, and either retry with a refined prompt or handle the task directly.
