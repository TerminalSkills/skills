---
title: Execute Spec-Driven Development with Spec Kit
slug: execute-spec-driven-development-with-spec-kit
description: Build a feature from a reviewed specification, plan and task list so the coding agent delivers what was asked and proves it, for small product teams.
skills:
  - spec-kit
  - code-reviewer
category: development
tags:
  - spec-kit
  - spec-driven-development
  - requirements
  - planning
  - agent-workflow
---

## The Problem

Priya Raman leads a team of five developers at Larder Supply, which runs an ordering portal for restaurant wholesalers. The team writes most code with coding agents, and the pattern of the last quarter worries her. The last four features needed 3.2 review rounds on average. Two of them reached staging with regressions: a CSV export that ignored the user's active filters, and a price update that skipped customers with contract pricing. In both cases the agent built exactly what the ticket said. The ticket was three sentences long.

The next feature is larger: standing orders, so a restaurant can repeat the same order every week. It touches pricing, delivery slots and invoicing. Priya does not want to find out in review which questions nobody asked.

## The Solution

Use **spec-kit** to move the thinking in front of the code: a specification that product signs off, a plan the team reviews, a task list the agent executes, and a convergence check that compares the result with all three. Use **code-reviewer** for the final review of the diff against the specification before the pull request is opened.

```bash
npx terminal-skills install spec-kit code-reviewer
```

## Step-by-Step Walkthrough

### 1. Add Spec Kit to the existing repository

```text
Set up Spec Kit in this repo for Claude Code. Do it on a separate branch so I can review what it adds.
```

```bash
uv tool install specify-cli
git switch -c adopt-spec-kit
specify init --here --force --integration claude --script sh
specify integration status
```

```text
Integration status: OK
Default integration: claude
Installed integrations: claude
Missing managed files: 0
```

The diff contains only `.specify/` and `.claude/skills/speckit-*`. No application code is touched.

### 2. Write down the rules that are already true

Priya types the steps into the agent's chat, one at a time.

```text
/speckit-constitution Prices always come from the pricing service, never from cached order lines. Every change to order data is covered by an integration test. Public API responses stay backward compatible. Database migrations ship with a rollback.
```

The agent writes `.specify/memory/constitution.md`. Later steps are checked against it.

### 3. Specify the feature and resolve open questions

```text
/speckit-specify Restaurants can turn any past order into a standing order that repeats weekly on a chosen delivery day. They can pause, change quantities, or cancel up to 24 hours before the delivery slot closes. Each repeat uses the prices valid on the day it is placed.
```

```text
/speckit-clarify Focus on what happens when a product in a standing order is discontinued or out of stock.
```

The agent creates `specs/001-standing-orders/spec.md` and asks its questions. Two of Priya's answers change the scope:

```text
Q2: If one product is out of stock, is the whole repeat skipped or only that line?
A:  Only that line. The customer gets an email listing what was left out.

Q4: Does a standing order reserve a delivery slot in advance?
A:  No. It takes the first free slot on the chosen day and fails with a notification if none is left.
```

Both answers are written into `spec.md`. Priya sends the file to the product owner, who approves it the same afternoon.

### 4. Plan, break down, and check consistency

```text
/speckit-plan Use the existing NestJS order module and the PostgreSQL schema. Schedule repeats with the BullMQ queue we already run. No new services.
```

```text
/speckit-tasks
```

```text
/speckit-analyze
```

The feature directory now holds the design and the work breakdown:

```text
specs/001-standing-orders/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
├── checklists/requirements.md
└── tasks.md
```

`analyze` changes nothing and reports one gap: the specification requires an email when a line is left out, but no task sends it. Priya runs `/speckit-tasks` again instead of adding the task by hand, and the second analysis is clean.

### 5. Implement in stages and converge

```text
/speckit-implement Implement only the Setup and Foundational phases: the migration with its rollback, and the standing order model. Stop before the user-story phases.
```

After reviewing the migration she lets the agent continue:

```text
/speckit-implement
```

```text
/speckit-converge
```

The first convergence pass appends two tasks to `tasks.md`: the pause endpoint has no integration test, and cancelling inside the 24-hour window returns HTTP 500 instead of a validation error. One more `/speckit-implement` and `/speckit-converge` ends with:

```text
Converged — the implementation satisfies the spec, plan, and tasks.
```

### 6. Review the diff against the specification

```text
Review the changes on this branch against specs/001-standing-orders/spec.md and the constitution. List anything that breaks a rule or that the spec does not ask for.
```

The review reports one finding of medium severity: the repeat job reads the unit price from the original order line, which breaks the first rule of the constitution. The agent changes the job to call the pricing service and adds a test with a price change between two repeats.

```bash
npm run test:integration -- standing-orders
```

```text
Tests: 31 passed, 31 total
```

## Real-World Example

Standing orders is merged after one review round, six working days after Priya wrote the first sentence of the specification. About one of those days went into the specification, the clarification questions and the plan. The pull request links `spec.md`, so reviewers check behavior against a document the product owner has already approved, not against their own reading of the ticket.

The two problems that would have reached staging under the old process were both caught before review: the missing email by `analyze`, the wrong price source by the final review. Over the following two months the team builds five features this way. Review rounds fall from 3.2 to 1.4 on average and no regression reaches staging. They keep the short path without a specification for changes under half a day, and add the `bug` extension in the second month for production incidents.

## Related Skills

- [spec-kit](/skills/spec-kit) — provides the specify, plan, tasks, implement and converge steps and keeps their artifacts in the repository
- [code-reviewer](/skills/code-reviewer) — reviews the finished diff against the specification and the constitution before the pull request
