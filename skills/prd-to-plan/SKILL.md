---
name: prd-to-plan
description: >-
  Turns a product requirements document into a phased implementation plan saved as a Markdown file in the repository: a requirement ledger, the decisions every phase depends on, and an ordered list of phases that each end in something demonstrable, with checks and verification commands. Use when the user says "make an implementation plan from this PRD", "plan the phases for this feature", "how should we build this spec", "write a plan file before we start coding", or wants a roadmap an agent can execute phase by phase.
license: Apache-2.0
compatibility: "Any repository an agent can read and write files in; no external services. Works in Claude Code, Codex, Gemini CLI and Cursor."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["prd", "implementation-plan", "planning", "phased-delivery", "requirements"]
---

# PRD to Plan

## Overview

This skill reads a PRD and the codebase it will be built in, and writes one plan file that a developer or a coding agent can follow from the first commit to the last. The plan names the choices that would be expensive to reverse, splits the work into phases that each leave the product in a working, demonstrable state, and says how each phase is verified. It differs from a ticket breakdown: the output is a single living document for sequential work, kept next to the code and updated as the build teaches something new.

## Instructions

### 1. Establish the inputs

Ask where the PRD is (file, issue, pasted text), who will execute the plan (one developer, a team, an agent working unattended), and any fixed constraint: a date, a release freeze, a platform that must be supported first. Find where plans live in this repository: an existing `plans/`, `docs/plans/` or `docs/rfcs/` directory wins; otherwise use `plans/` at the root. Name the file after the feature in kebab case, for example `plans/team-invitations.md`.

### 2. Build the requirement ledger

Give every requirement an id (`R1`, `R2`, …), reusing the PRD's numbering when it exists. List non-goals and open questions separately. Sort the open questions: one that changes the order or the shape of the phases must be answered before planning continues; the rest go into the plan with an owner and the phase that needs the answer.

### 3. Read the code the feature will touch

Record facts, each one verified by opening the file:

- where a comparable feature enters the system and how it is layered (routing, domain logic, storage, interface)
- the data model the feature extends and the migration tool in use
- how the project is tested, linted and type-checked: the real commands from `package.json`, `Makefile`, `pyproject.toml` or CI configuration
- how unfinished work is hidden in production (feature flags, settings), and how releases happen

For a new project with no code yet, this section states the stack the user has chosen and what must exist before phase 1 can be demonstrated.

### 4. Record the decisions every phase depends on

Before slicing, settle what later phases will build on and what would be costly to change: public contracts (routes, events, commands), the shape of new data and how existing data is migrated, the authorization rule, boundaries with external services, and how the feature is switched on. For each decision write the choice, the reason, and the alternative rejected. Leave out helper names, file layout and other details that are cheap to change; a plan that pins them is out of date after the first refactor.

### 5. Shape the phases

- **Every phase ends in a demonstration.** After it merges, a person can do something they could not do before, even if only behind a flag. A phase that is "the database part" or "the frontend part" cannot be demonstrated; fold it into a phase that crosses the layers.
- **Phase 1 is the thinnest end-to-end path** through the main scenario, with every layer present and deliberately minimal. Later phases widen it: more cases, failure handling, limits, polish.
- **Order by risk, then by value.** Put the part most likely to invalidate the plan early. If an unknown is large enough, phase 0 is a time-boxed spike whose output is a decision, not shipped code.
- **Size.** One to three days of work or one to three pull requests per phase; three to seven phases for a typical PRD. More than seven usually means the PRD covers two features.
- **Keep the main branch releasable.** Hide incomplete behaviour behind the project's flag mechanism. Change existing schemas and contracts by expand, migrate, contract: add the new form, move readers and writers, remove the old form in a later phase.
- **Mark the cut line.** Say which phase completes the minimum the PRD needs, so later phases can be dropped or deferred without replanning.

Each phase states: goal (one sentence a stakeholder would recognise), requirements covered, what is built, what is deliberately left for later, checks that prove it is done, the commands that verify it, and its main risk.

### 6. Review the outline before writing the file

Show a table of phases (goal, requirements, size, risk) and ask about what the user can judge quickly: is the order right, is the cut line where they want it, is any phase too big to review, is anything missing. Revise, then write the file.

### 7. Write the plan file

Use this section order: title with source PRD, status and date; Requirements (ledger table with the phase that covers each); Current state; Decisions; Phases; Not planned; Open questions; Change log. Write `Covers:` as a plain line in each phase so coverage can be checked mechanically:

```bash
plan=plans/team-invitations.md
for id in R1 R2 R3 R4 R5 R6; do
  grep '^Covers:' "$plan" | grep -qw "$id" || echo "no phase covers $id"
done
grep -c '^### Phase' "$plan"
```

Before handing the plan over, confirm that every requirement is covered or listed under Not planned with a reason, every phase has at least one check a person can perform and one command that can be run, no check depends on a later phase, and no decision contradicts the PRD.

### 8. Keep the plan current during the build

When a phase finishes, set its status and tick its checks. When the work contradicts the plan, edit the plan first, add a dated line to the change log saying what changed and why, then continue. A plan that is quietly ignored is worse than none.

## Examples

### Example 1: a complete plan file

A Django project, `brightloom/studio`, with the PRD at `docs/prd/team-invitations.md`. The ledger has six requirements; the user confirmed that phase 3 is the cut line. The file written to `plans/team-invitations.md`:

```markdown
# Plan: Team invitations by email

Source: docs/prd/team-invitations.md (v3, 2026-09-22) · Status: not started · Updated: 2026-10-01

## Requirements
| Id | Requirement | Phase |
|----|-------------|-------|
| R1 | A workspace admin invites a person by email and picks a role | 1 |
| R2 | The invitee gets an email with a link valid for 7 days | 1 |
| R3 | The link lets a new person sign up and join; an existing user joins after signing in | 1, 2 |
| R4 | Admins see pending invitations and can revoke or resend them | 3 |
| R5 | A used, revoked or expired link shows an explanation, never an error page | 2 |
| R6 | The plan's seat limit is enforced when an invitation is accepted | 4 |

## Current state
- Membership lives in `workspaces.Membership` (user, workspace, role); roles are `admin` and `member`.
- Outgoing mail goes through `notifications.send_template()`; templates are in `templates/email/`.
- Tests: `python manage.py test`; lint: `ruff check .`; migrations: Django migrations, checked in CI.
- Unreleased work is gated with `settings.FEATURES`, read through `features.enabled()`.

## Decisions
- D1. An invitation is its own table (`Invitation`: workspace, email, role, token hash, expires_at,
  accepted_at, revoked_at). Reason: pending invitations must be listed and revoked (R4).
  Rejected: a signed stateless link, which cannot be revoked.
- D2. Only a SHA-256 hash of the token is stored; the token itself appears only in the email.
- D3. Routes: `POST /workspaces/{id}/invitations/`, `GET /invitations/{token}/`,
  `POST /invitations/{token}/accept/`. The accept step is a POST so mail scanners that prefetch
  links cannot consume an invitation.
- D4. Everything ships behind `FEATURES["invitations"]` until phase 3 is merged.

## Phases

### Phase 1 — An admin invites a new person, who joins
Status: not started · Size: 3 days
Covers: R1, R2, R3 (new person only)
Build: Invitation model and migration; invite form on the members page; invitation email;
landing page with sign-up; acceptance creates the Membership.
Later: existing users (phase 2), any failure state other than "link not found".
Done when:
- [ ] An admin enters dana@harborlane.dev with role member; the address receives one email.
- [ ] Opening the link in a private window, signing up and accepting lands in the workspace as member.
- [ ] A non-admin gets 403 from the invite endpoint.
Verify: `python manage.py test invitations` · `python manage.py makemigrations --check --dry-run`
Risk: sign-up currently redirects to onboarding; acceptance must survive that redirect.

### Phase 2 — Existing users and dead links
Status: not started · Size: 2 days
Covers: R3 (existing user), R5
Build: sign-in path that returns to the invitation; pages for used, revoked and expired links;
a second accept on the same token is refused.
Done when:
- [ ] A signed-out existing user follows the link, signs in, and is asked to accept.
- [ ] An invitation older than 7 days shows the "expired" page with a hint to ask for a new one.
- [ ] Posting accept twice creates one Membership.
Verify: `python manage.py test invitations`
Risk: signed in as a different email than the one invited (see Q1).

### Phase 3 — Admins manage pending invitations (cut line)
Status: not started · Size: 2 days
Covers: R4
Build: pending list on the members page; revoke; resend; remove the feature flag.
Done when:
- [ ] A revoked invitation leaves the list and its link shows the "revoked" page.
- [ ] Resend delivers a new email and the earlier link stops working.
Verify: `python manage.py test invitations workspaces`
Risk: low.

### Phase 4 — Seat limits
Status: not started · Size: 1 day
Covers: R6
Build: seat check at acceptance; message for the invitee; notice to the admins.
Done when:
- [ ] In a workspace at its limit, accepting shows "this workspace is full" and creates no Membership.
Verify: `python manage.py test invitations billing`
Risk: seat counting during concurrent accepts; needs a row lock on the workspace.

## Not planned
- Bulk invitations from CSV and domain-based auto-join: non-goals in the PRD.

## Open questions
- Q1. May an invitation be accepted while signed in under another email? Owner: Tomasz Zielinski. Needed before phase 2.

## Change log
- 2026-10-01 Plan created.
```

### Example 2: an unknown that reorders the plan

A Node service, `ostrava-metering/usage-api`, with a PRD for exporting monthly usage to the customer's accounting system. The code survey finds no existing integration with that system, and the PRD assumes one invoice line per usage record, which could mean 40,000 requests per customer. The outline shown to the user puts the unknown first:

| Phase | Goal | Covers | Size | Risk |
|-------|------|--------|------|------|
| 0 | Spike: confirm batch size, rate limit and idempotency of the accounting API (2 days, output is a decision) | — | 2d | High |
| 1 | One customer's month is exported by a command and appears in the accounting sandbox | R1, R2 | 3d | Medium |
| 2 | Scheduled export for all customers, safe to re-run | R3, R5 | 3d | Medium |
| 3 | Failures are visible to support and can be retried (cut line) | R4 | 2d | Low |
| 4 | Customers preview the export in the dashboard | R6 | 2d | Low |

The user moves the cut line to phase 2 and asks for phase 4 to be dropped; R6 moves to Not planned with the reason "deferred by Lucie Marek, 2026-10-01". Three days later the spike shows the API accepts 500 lines per request and offers no idempotency key, so the plan is edited before any export code exists:

```markdown
- 2026-10-04 Phase 0 done. Batches of 500 lines; no idempotency key on the API. Added D5: the
  export stores a per-batch checksum and skips batches already sent. Phase 2 grows from 3 to 4 days.
```

## Guidelines

- **Plan only as far as you can see.** Detail phases 1 and 2 fully; later phases may carry less detail and are revised when they come up. False precision in phase 5 costs credibility when it turns out wrong.
- **Checks are observations, not activities.** "Endpoint implemented" proves nothing; "a non-admin gets 403" can be tried. Each phase needs at least one check for a failure case.
- **Commands must be real.** Copy test, lint and migration commands from the project's own scripts and run them once before writing them into the plan.
- **Do not fill gaps in the PRD silently.** A missing rule becomes an open question with an owner, or a decision the user has explicitly approved.
- **Phases are not layers and not a schedule.** Do not attach calendar dates unless the user gives them; sizes are for comparing phases, not commitments.
- **Schema and contract changes that cannot be undone** (dropping a column, removing an endpoint) get their own late phase, after the new form has run in production.
- **One plan per PRD.** If the outline exceeds seven phases or two teams, propose splitting the PRD instead of writing a longer plan.
- **When not to use it.** A change that fits in one pull request needs a task list, not a plan file. If the user wants separately assignable tickets with dependencies, produce issues instead; a plan can still be the source they are cut from.
