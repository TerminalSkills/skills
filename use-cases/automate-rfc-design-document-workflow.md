---
title: "Automate RFC and Design Document Workflow with AI"
slug: automate-rfc-design-document-workflow
description: "Streamline the creation, review, and tracking of RFC and design documents using AI-powered templates and automation."
skills: [markdown-writer, github, template-engine, openspec]
category: productivity
tags: [rfc, design-docs, workflow, documentation, engineering-process]
---

# Automate RFC and Design Document Workflow with AI

## The Problem

A 35-person engineering org uses RFCs to make technical decisions, but the process is inconsistent and slow. Some engineers write 10-page documents, others write a single paragraph. There is no standard template, no list of which RFCs are waiting for review, and no way to find past decisions. Half the RFCs live in Google Docs, a quarter in Notion, and the rest in GitHub issues.

The cost shows up six months later. A new engineer asks "why did we pick Postgres over DynamoDB?" and nobody can find the document. The team relitigates a choice that was already made, and reviewers forget pending RFCs because nothing reminds them.

## The Solution

- **template-engine** renders every new RFC from one Jinja2 template, and renders the decision log from the front matter of merged RFCs.
- **markdown-writer** turns an engineer's rough notes into the template's sections.
- **github** (the `gh` CLI) opens the pull request, requests reviewers, and lists RFCs that are waiting.
- **openspec** takes over when the RFC describes a change to one codebase that an agent will implement.

The RFCs live as Markdown files in the repository (`rfcs/`), so the review, the approval and the final text are in one place.

## Step-by-Step Walkthrough

### Step 1: One template for every RFC

Keep `rfcs/_template.md.j2` in the repo. The front matter is what the decision log reads later:

```text
---
title: "{{ title }}"
status: draft          # draft | in-review | approved | rejected | deferred
author: {{ author }}
created: {{ date }}
---
## Problem statement
## Proposed solution
## Alternatives considered
## Migration plan
## Cost and risks
## Success criteria
## Open questions
```

Ask the agent to write `tools/new_rfc.py` once (a short Jinja2 script, per the template-engine skill; `autoescape` off is fine for Markdown, but never render templates built from untrusted strings). Then every new RFC is one command:

```console
$ python3 tools/new_rfc.py --title "Migrate session storage from Redis to DynamoDB" --author priya
created rfcs/2026-11-session-storage-migration.md
```

### Step 2: Expand rough notes into the sections

```text
Write an RFC for migrating our session storage from Redis to DynamoDB. My notes: Redis hits its memory limit at about 50k concurrent sessions, DynamoDB would auto-scale, estimated cost increase $200/month, migration by dual-writing for 2 weeks. Risk: single-key lookups are slower on DynamoDB. Fill rfcs/2026-11-session-storage-migration.md.
```

markdown-writer organises the notes under the template's headings: the problem from the memory limit, a proposed table design (session ID as partition key, a TTL attribute for expiry), alternatives to weigh (Redis Cluster, Memcached, Valkey or a larger Redis node), a day-by-day dual-write plan with rollback triggers, and success criteria such as "p99 session lookup under 20 ms".

The agent only has the engineer's notes, so every number it needs but was not given (current memory use, growth rate, measured latencies) is written as `TODO(author): measure` instead of being made up. Reviewers should see which figures are measured and which are still open. The engineer fills those in before the PR leaves draft.

### Step 3: Open the pull request and request reviewers

```console
$ gh pr create --draft --title "RFC: Migrate session storage from Redis to DynamoDB" \
    --body-file rfcs/pr-body.md --label rfc --reviewer my-org/backend,my-org/infra
```

Labels must already exist (`gh label list`; create `rfc` once with `gh label create rfc`). Team reviewers are written `org/team-slug`. GitHub has no review-deadline field, so the PR body states it ("Review by Friday 2026-11-20") and the tracker below makes it visible. Mark the PR ready with `gh pr ready` when the TODOs are gone, and use branch protection with required approvals so that "approved" means something.

### Step 4: Track RFCs waiting for review

```text
Show all open RFC pull requests, how long each has been open, their review decision, and who still has to review.
```

The agent runs a query it can repeat on a schedule:

```console
$ gh pr list --label rfc --state open --json number,title,createdAt,reviewDecision,reviewRequests \
    --jq '.[] | [.number, .title, .createdAt[:10], (.reviewDecision | if . == "" or . == null then "NONE" else . end), ([.reviewRequests[] | (.login // .name)] | join(","))] | @tsv'
247  RFC: Migrate session storage ...   2026-11-07  REVIEW_REQUIRED  my-org/backend,my-org/infra
231  RFC: API rate limiting strategy    2026-11-03  REVIEW_REQUIRED  chen
218  RFC: Event sourcing for audit log  2026-10-27  REVIEW_REQUIRED  my-org/backend
```

The agent turns it into a table with age in days and flags anything open longer than the team's limit (say 7 days) as stale, so a reminder goes to the people still in `reviewRequests`, for example with `gh pr comment 218 --body "Review requested 11 days ago; please approve or comment."`. Run it from a scheduled job or ask for it before the weekly engineering meeting.

### Step 5: Archive decisions for future reference

When the PR merges, the author sets `status: approved` (or `rejected`, `deferred`) in the front matter, and the same merge updates the index. The decision log is rendered from the files by a second small Jinja2 script (`tools/render_decision_log.py`, written the same way), so it is never edited by hand:

```console
$ python3 tools/render_decision_log.py rfcs/ > rfcs/README.md
```

Each row shows date, title, status and a one-line trade-off pulled from the RFC's "Proposed solution" first sentence or a `summary:` front-matter field. Because the files are in the repo, `git log -- rfcs/` and a plain `grep -ril "dynamodb" rfcs/` answer "why did we pick X?" in seconds, with the original reasoning attached.

### Step 6: When the RFC leads to code, hand it to OpenSpec

If the approved RFC becomes an implementation task for an AI coding agent, create an OpenSpec change so the plan lives next to the code and is reviewed before anything is written:

```console
$ openspec new change migrate-session-storage \
    --description "Dual-write sessions to DynamoDB behind a flag, then cut over"
$ openspec validate migrate-session-storage --strict
```

The RFC explains why and what was decided; the OpenSpec proposal, delta specs and task list say exactly what will be built. Archive the change after the merge with `openspec archive migrate-session-storage --yes`. Do not use it for decisions that do not touch a single codebase.

### Step 7: Summarize for all-hands

```text
Summarize the RFCs whose status changed to approved this month into two paragraphs for the engineering all-hands notes. Say what changed and why it matters for the product; skip implementation details.
```

The agent reads the merged RFC files and writes outcomes in plain language, so product and design learn what is changing without reading ten pages.

## Real-World Example

Priya leads backend engineering at a 35-person SaaS company, where the last few "why did we..." questions each cost a senior engineer half a day. She adds the template and the two small scripts to the repository, and the first RFC comes from rough notes in a few minutes, with the unmeasured numbers marked as TODOs for her to fill in. The PR goes up with team reviewers and a stated deadline, and a weekly stale-RFC list goes to the engineering channel. After a month the `rfcs/` folder holds a dozen decided RFCs and a generated index, and the answer to "why did we pick X?" is a link to the file. (The team and its figures are illustrative.)

## Related Skills

- **markdown-writer**: structures the engineer's rough notes into the RFC's sections.
- **github**: opens the RFC pull request, requests team reviewers and lists RFCs still waiting.
- **template-engine**: renders new RFCs and the decision log from Jinja2 templates.
- **openspec**: turns an approved RFC for one codebase into a reviewed change plan for the coding agent.
