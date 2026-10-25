---
name: agent-workflow-packager
description: >-
  Turns a workflow a team keeps repeating with a coding agent (a pasted prompt,
  runbook, review checklist or AGENTS.md section) into a spec-valid Agent Skill
  folder with SKILL.md, triggers, approval gates and a done check. Use when asked
  to "turn this into a skill", "package our release checklist as a skill" or
  "convert this runbook to SKILL.md".
license: Apache-2.0
compatibility: "Needs Python 3 and pip to run the optional skills-ref validator"
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: "agent-skills, skill-authoring, workflow, claude-code, codex"
---

# Agent Workflow Packager

## Overview

A skill is a folder holding a `SKILL.md` that an agent loads when a task matches it. This skill takes a procedure that people currently paste into chats over and over, and converts it into such a folder that works in any host that implements the Agent Skills format (Claude Code, Codex and others). The result is one focused skill with a description that triggers reliably, steps with a clear end state, approval gates for risky actions, and a validator run as proof.

Hosts read skills in three layers, per the Agent Skills specification: `name` and `description` are loaded at startup for every skill (about 100 tokens), the full `SKILL.md` body loads only when the skill activates (under 5000 tokens recommended), and files in `scripts/`, `references/` and `assets/` load on demand. Design every packaging decision around that.

## Instructions

### 1. Decide whether it deserves a skill

Collect evidence of repetition: past chat prompts, a runbook, merged PRs, an AGENTS.md section. A candidate has (a) inputs that look the same each time, (b) steps that mostly do not change, (c) a way to tell it is finished. If the user describes a one-off or a taste ("write cleaner code"), say so and offer a short checklist in AGENTS.md or CLAUDE.md instead. If it is a rule that must hold in every session, that also belongs in those files, not in a skill.

### 2. Write down the workflow as facts

Fill in six lines before drafting: who runs it, the trigger phrase they actually type, the input artifacts (PR URL, failing log, ticket, repo path), the output artifact (patch, report, file), the corrections users keep making to the agent, and the command or check that proves it is done. Ask for any line you cannot fill from the evidence; do not invent it.

### 3. Write the description last-mile first

The description is the only text used to decide activation. State what the skill does, then "Use when" with two or three phrases lifted from real requests. Put the key use case first: Claude Code truncates the combined `description` and `when_to_use` text at 1,536 characters in its skill listing, and the specification caps `description` at 1024 anyway. Avoid generic wording ("helps with code") that makes the skill fire on unrelated tasks.

### 4. Choose name, folder and frontmatter

The specification constrains the fields:

- `name` (required): at most 64 characters, lowercase letters, digits and hyphens, no leading or trailing hyphen. The folder must carry the same name.
- `description` (required): 1 to 1024 characters.
- `license`, `compatibility` (1 to 500 characters, environment needs), `metadata` (string keys to string values) and `allowed-tools` (space-separated, experimental) are optional. Treat `allowed-tools` as a convenience only; keep approval rules in the body because host support differs.

Place the folder where the target host scans it:

| Host | Project scope | Personal scope |
|------|---------------|----------------|
| Claude Code | `.claude/skills/<name>/SKILL.md` | `~/.claude/skills/<name>/SKILL.md` |
| Codex | `.agents/skills/<name>/SKILL.md` | `$HOME/.agents/skills/<name>/SKILL.md` |

```
.claude/skills/changelog-release-notes/
  SKILL.md
  scripts/merged-since-tag.sh
  references/format.md
```

Claude Code also walks up from the working directory to the repository root; Codex scans `.agents/skills` in each directory from the working directory to the repository root. Commit project-scope skills so the whole team gets them. For cross-host teams, keep one copy and symlink or copy it into the other path.

### 5. Draft the body

Use imperative steps, each one an action with an observable result. Include:

- Inputs to collect, and which ones to ask the user for when missing.
- The ordered procedure, with exact commands only where they are stable across the team.
- Hard limits: what the skill must not touch, and which steps need explicit user approval first (writes outside the repo, deploys, pushes, paid or public actions).
- The done check: the command or inspection whose output decides success, and what to report if it fails.

Move long tables, API notes or templates to `references/`, and deterministic helpers to `scripts/`, and link them with relative paths from `SKILL.md`. Keep the main file well under the 500-line ceiling the specification recommends.

### 6. Control activation on the host

Claude Code supports `disable-model-invocation: true` in frontmatter for steps with side effects, so only the user can start the skill by name. Codex reads `agents/openai.yaml`; setting `policy.allow_implicit_invocation: false` there stops implicit matching while `$skill-name` still works. ```yaml
# agents/openai.yaml (Codex)
policy:
  allow_implicit_invocation: false
```

Use these for release, deploy and migration skills.

### 7. Validate and test

1. Install the reference validator in a virtual environment and run it on the folder:

   ```
   python3 -m venv .venv
   .venv/bin/pip install skills-ref
   .venv/bin/agentskills validate path/to/<name>
   ```

   Version 0.1.1 provides the `agentskills` command (subcommands `validate` and `read-properties`). It rejects uppercase or mismatched names and flow-style lists inside `metadata`, so write `metadata` values as plain strings if the validator must pass.
2. Start a fresh agent session in the target repo and send the exact phrase from the description. Confirm the skill activates and the done check runs.
3. Send an unrelated request and confirm the skill stays quiet.
4. Fix the description or steps where either test failed, bump `metadata.version`, repeat.

## Examples

### Example 1: Weekly release notes from merged pull requests

**Request:** "Every Friday I paste the same prompt: list PRs merged since the last tag, group by label, write the CHANGELOG entry. Make it a skill for our repo `acme/billing-api`."

**Plan:**

1. Evidence is repeated weekly, with known input (last git tag) and output (CHANGELOG.md section), so it qualifies.
2. Create `.claude/skills/changelog-release-notes/` (and `.agents/skills/...` as a copy, since the team uses Codex too).
3. Description: "Drafts a CHANGELOG.md entry from pull requests merged since the last git tag. Use when asked to 'write release notes', 'draft the changelog for v2.4.0' or 'summarise what shipped since the last tag'."
4. Body steps: find the tag with `git describe --tags --abbrev=0`; run `scripts/merged-since-tag.sh`; group by label per `references/format.md`; write the entry; show the diff and stop. Committing and tagging are left to the user.
5. Validate:

```
$ .venv/bin/agentskills validate .claude/skills/changelog-release-notes
Valid skill: .claude/skills/changelog-release-notes
```

**Done check in the skill:** `git diff --stat` shows only `CHANGELOG.md` changed.

### Example 2: Rejecting a non-candidate, packaging a real one

**Request:** "Make a skill from my rule 'always write tests'. And one from our migration runbook for `orders-db` (backup, run Alembic, verify row counts, roll back on mismatch)."

**Plan:**

1. The first has no inputs, steps or end state. Reply that it is a standing rule, and propose adding one line to AGENTS.md.
2. The second qualifies. Create `db-migration-runner` with `disable-model-invocation: true` (Claude Code) and an `agents/openai.yaml` with `allow_implicit_invocation: false` (Codex), because it changes a database.
3. Body gates: ask for the target environment; refuse `production` unless the user types the migration revision id; take a `pg_dump` into `backups/` before `alembic upgrade head`; compare `SELECT count(*)` of `orders` and `order_items` before and after; if counts differ, run `alembic downgrade -1` and report.
4. Put the runbook's long failure table in `references/failures.md` and link it.
5. Validate with `agentskills validate`, then test in a scratch clone with the staging config.

## Guidelines

- One skill, one job. If the draft needs "and also", split it.
- Evidence beats memory: derive steps from the prompts and runbooks people already use.
- Never put secrets, tokens or machine-specific absolute paths inside a skill; read them from the environment.
- Every irreversible or public action needs an approval step written in the body, not only in `allowed-tools`.
- Do not duplicate a rule that already lives in AGENTS.md or CLAUDE.md; reference it.
- Skills in a personal folder are not seen by cloud or scheduled sessions that start from a clean checkout; commit project skills instead.
- Re-run the validator and the activation test after every edit to the description.
