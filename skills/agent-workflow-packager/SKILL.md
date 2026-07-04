---
name: agent-workflow-packager
description: >-
  Converts repeated AI coding-agent workflows into reusable skill packages with
  triggers, guardrails, examples, and verification checks. Use when a user wants
  to turn a prompt, checklist, AGENTS.md section, Claude/Codex workflow, or
  recurring agent task into a portable SKILL.md.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: MemoAsh
  version: "1.0.0"
  category: development
  tags: ["ai-agents", "skills", "workflow", "codex", "claude-code"]
---

# Agent Workflow Packager

## Overview

Package a repeated coding-agent workflow into a reusable `SKILL.md` that another agent can follow without rediscovering context. The output should include clear activation triggers, bounded instructions, examples, and a verification checklist that proves the workflow worked.

## Instructions

When a user asks to turn a prompt, checklist, runbook, AGENTS.md section, or repeated agent task into a skill, follow this process.

### Step 1: Extract the recurring workflow

Identify:

- The user persona and recurring task.
- The input artifacts the agent needs, such as a PR URL, failing test output, issue, design screenshot, or repo path.
- The expected output artifact, such as a patch, review, migration plan, report, or generated file.
- The steps the user repeats manually.
- The failure modes the user keeps correcting.
- The command or inspection that proves the task is done.

If the workflow is a one-off request, say that it is not yet a good skill candidate and offer a shorter checklist instead.

### Step 2: Define activation triggers

Write a `description` that includes both what the skill does and when to use it. Include specific trigger phrases from the user's workflow, such as:

- "review this PR for security issues"
- "turn this runbook into an agent skill"
- "replay our release checklist"
- "debug failing GitHub Actions"
- "convert this AGENTS.md workflow into SKILL.md"

Do not use broad triggers like "help with code" or "improve productivity".

### Step 3: Bound the skill

Add constraints that prevent overreach:

- What the skill should do.
- What it should not do.
- When it must ask for missing inputs.
- Which files, commands, or tools are safe to use.
- Which user approvals are required before writes, deploys, purchases, or public posts.

Keep the skill focused on one reusable job. Split unrelated work into separate skills.

### Step 4: Write the package

Create a `SKILL.md` with:

```yaml
---
name: short-kebab-case-name
description: >-
  What the skill does and when to use it, including concrete trigger words.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: github-username
  version: "1.0.0"
  category: development
  tags: ["tag-one", "tag-two", "tag-three"]
---
```

Then add:

- `# Skill Name`
- `## Overview`
- `## Instructions`
- `## Examples`
- `## Guidelines`

Use imperative, step-by-step instructions. Avoid long background essays.

### Step 5: Add examples

Include at least two realistic examples. Each example should show:

- The user's input.
- The agent's action plan.
- The expected output shape.
- The verification step.

Use concrete repo names, files, commands, and outputs. Do not use placeholders like `foo`, `bar`, or lorem ipsum.

### Step 6: Add verification

End with a checklist the agent can run before claiming success:

- Frontmatter parses as YAML.
- The skill has clear triggers.
- The workflow has a bounded input and output.
- The examples are realistic.
- The verification commands or review checks are explicit.
- The skill stays under the target length for the host catalog.

## Examples

### Example 1: Package a PR review workflow

**User request:** "We always ask agents to review payment PRs for auth, idempotency, Stripe webhook replay, and tests. Turn that into a reusable skill."

**Agent output shape:**

```markdown
---
name: payment-pr-reviewer
description: >-
  Reviews payment-related pull requests for authorization, idempotency, webhook
  replay safety, money movement bugs, and test coverage. Use when reviewing PRs
  that touch Stripe, billing, subscriptions, invoices, or checkout code.
license: Apache-2.0
compatibility: "Any repository with payment code"
metadata:
  author: acme-dev
  version: "1.0.0"
  category: development
  tags: ["payments", "code-review", "stripe", "security"]
---
```

The skill includes a review checklist, severity format, and verification step: inspect changed payment files, read related tests, and confirm webhook replay cases are covered.

### Example 2: Package a release checklist

**User request:** "Every release we paste the same steps: update changelog, run tests, build Docker image, tag, push, and draft GitHub release."

**Agent output shape:**

```markdown
---
name: release-checklist-runner
description: >-
  Runs a project's release checklist from changelog update through tests, image
  build, git tag, push, and draft release notes. Use when preparing a versioned
  release or turning a manual release runbook into an agent workflow.
license: Apache-2.0
compatibility: "Requires git and the project's build toolchain"
metadata:
  author: acme-dev
  version: "1.0.0"
  category: devops
  tags: ["release", "changelog", "git", "ci"]
---
```

The skill requires the agent to detect the package manager, read existing release docs, run the repo's test and build commands, and stop before publishing unless the user approves.

## Guidelines

- Prefer evidence from past prompts, commits, issues, and runbooks over guessing.
- Keep one skill scoped to one recurring workflow.
- Use host-agnostic language unless the workflow truly depends on one agent.
- Make destructive, public, or paid actions approval-gated.
- Include exact file paths and commands only when they are stable for the target project.
- If the workflow needs extra templates or scripts, mention those files in the skill and keep them next to `SKILL.md`.
- Do not package a vague preference as a skill. A good skill has repeated inputs, repeated steps, and a clear done condition.
