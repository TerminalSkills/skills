---
title: Package Repeated AI Agent Workflows into Skills
slug: package-repeated-ai-agent-workflows
description: Turn recurring AI coding-agent prompts and runbooks into reusable SKILL.md packages with triggers, guardrails, examples, and verification.
skills:
  - agent-workflow-packager
category: development
tags:
  - ai-agents
  - skills
  - codex
  - claude-code
  - developer-productivity
---

# Package Repeated AI Agent Workflows into Skills

## The Problem

An engineering team asks AI coding agents to do the same high-context tasks every week: review payment PRs, prepare releases, triage failing CI, or follow local edit rules. The working prompt lives in chat history or a long AGENTS.md section, so every new session starts by rediscovering triggers, constraints, edge cases, and verification commands.

## The Solution

Use `agent-workflow-packager` to convert the repeated workflow into a portable `SKILL.md`. The skill captures when to activate, what inputs are required, the exact steps to follow, safety boundaries, examples, and proof that the task is complete.

```bash
npx terminal-skills install agent-workflow-packager
```

## Step-by-Step Walkthrough

### 1. Collect the repeated workflow

Ask the agent to inspect the source material:

```text
Turn our payment PR review prompt into a reusable skill.

Inputs:
- AGENTS.md section "Payment review rules"
- Three recent PR review comments about Stripe webhook replay bugs
- Test command: pnpm test -- billing

Output:
- skills/payment-pr-reviewer/SKILL.md
- Two realistic examples
- Verification checklist
```

### 2. Extract triggers, inputs, and done criteria

The agent identifies that the workflow should trigger on PRs touching checkout, subscriptions, invoices, Stripe webhooks, or money movement. It records required inputs: PR diff, related payment tests, existing auth middleware, and webhook handler code. It defines the done condition as prioritized findings plus confirmation that replay, idempotency, auth, and test coverage were checked.

### 3. Generate the skill package

The agent writes:

```text
skills/payment-pr-reviewer/SKILL.md
```

The skill contains frontmatter, overview, step-by-step instructions, examples, and guidelines. The description includes concrete triggers:

```yaml
description: >-
  Reviews payment-related pull requests for authorization, idempotency, webhook
  replay safety, money movement bugs, and test coverage. Use when reviewing PRs
  that touch Stripe, billing, subscriptions, invoices, or checkout code.
```

### 4. Verify the package

Ask the agent to run the checklist:

```text
Check the generated skill against the Terminal Skills contribution format:
- YAML frontmatter parses
- name is kebab-case
- description says what and when
- examples use real-looking data
- verification steps are explicit
- public or destructive actions require approval
```

### 5. Install and reuse it

Install the skill into a project or agent profile:

```bash
curl -sL https://raw.githubusercontent.com/acme/agent-skills/main/skills/payment-pr-reviewer/SKILL.md -o .codex/skills/payment-pr-reviewer.md
```

The next time a payment PR appears, the agent can activate the workflow without another long prompt.

## Real-World Example

Mina leads a four-person SaaS team with Stripe subscriptions. Every billing PR needs the same review: auth checks, webhook replay safety, idempotency keys, invoice state transitions, and tests for failed payments. Before packaging the workflow, Mina pasted a 70-line prompt into each review session and still had to remind agents to inspect related tests.

She runs `agent-workflow-packager` on the existing prompt, two old review threads, and the repo's billing test command. The resulting `payment-pr-reviewer` skill is 140 lines, includes two examples, and requires the agent to inspect changed payment files before writing findings. The next three billing PR reviews use the same format and stop missing replay/idempotency checks.

## Related Skills

- [project-skill-audit](../skills/project-skill-audit/) -- Finds repeated project workflows worth turning into skills.
- [context-engineering](../skills/context-engineering/) -- Helps decide what persistent context belongs in rules files versus task-specific prompts.
- [code-reviewer](../skills/code-reviewer/) -- Provides a general review structure that specialized review skills can extend.
