---
name: documentation-and-adrs
description: >-
  Writes architecture decision records (ADRs) and keeps the rest of a project's
  documentation true after a change: README, reference comments on public
  interfaces and the changelog. Use when a user says "write an ADR", "record
  this decision", "document why we chose X", "set up a decision log",
  "supersede the old decision", "update the README", "add a changelog entry"
  or "document this API". Produces records in the Nygard or MADR format, a
  Keep a Changelog entry, and a script that checks the log for gaps and broken
  supersession links.
license: Apache-2.0
compatibility: "Any agent that can read and write files in a repository. The log check needs Python 3.8+; adr-tools (optional) needs Bash."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["adr", "architecture-decisions", "documentation", "changelog", "readme"]
---

# Documentation and ADRs

## Overview

An architecture decision record is a short, numbered file in the repository that captures one decision: the situation that forced it, the options that were on the table, what was chosen, and what the team now has to live with. Records are appended, never rewritten, so the log reads as the history of the design.

This skill writes those records in the two formats the field has settled on (Michael Nygard's 2011 layout and MADR 4.0), handles reversals, and brings the README, reference comments and changelog into line with the same change. It ends with a check that can fail, so the log stays trustworthy.

## Instructions

### 1. Read the repository before writing

Look for what already exists and follow it; a log with two formats is worse than either one.

- Decision log: `docs/decisions/`, `docs/adr/`, `doc/adr/`, `doc/architecture/decisions/`, or the directory named in a `.adr-dir` file. Note the format, the number width and the highest number in use.
- `CHANGELOG.md` and its heading style, the README's sections, the comment convention in code (TSDoc, JSDoc, docstrings), an OpenAPI file.

Then ask the user only for what the code cannot show: who took the decision and when, which alternatives were seriously considered and what ruled each one out, what downside was knowingly accepted, and whether the decision is still open (`proposed`) or settled (`accepted`). Never invent a rejected option or a reason. If the answer is unknown, write "not recorded" in that place.

### 2. Decide whether it deserves a record

| Write a record | Leave it to a commit message or code comment |
|---|---|
| Changes structure, a dependency, an interface, a data model or a quality attribute (speed, cost, security, availability) | Can be undone in one small commit |
| Undoing it later would take more than a day of work or a data migration | Is a formatting or naming rule a linter already enforces |
| It was argued over, or someone will ask "why is it like this?" in a year | Is a bug fix with one sensible solution |
| It binds another team or an external consumer | Is a spike that will be thrown away |

One decision per record. "Use PostgreSQL" and "host it on a managed service" are two records when they could have gone different ways.

### 3. Pick the format

| Format | Parts | Choose it when |
|---|---|---|
| Nygard | Title, Status, Context, Decision, Consequences | Small team, one clear choice; it is what `adr-tools` generates |
| MADR 4.0 | Front matter (`status`, `date`, `decision-makers`, `consulted`, `informed`), Context and Problem Statement, Considered Options, Decision Outcome with Consequences; optional: Decision Drivers, Confirmation, Pros and Cons of the Options, More Information | The comparison of options is the valuable part, or several people signed off |
| Y-statement | One sentence: "In the context of …, facing …, we decided for … and neglected …, to achieve …, accepting …, because …" | A small decision, a pull request description, or the opening line of a longer record |

### 4. Write it

- **File**: `NNNN-decision-in-kebab-case.md` with the next free four-digit number. Numbers are never reused. Default directory: `docs/decisions/`.
- **Title**: a noun phrase that names the choice, not the problem: "Tenant isolation with PostgreSQL row-level security", not "Multi-tenancy".
- **Context**: facts in neutral language, with numbers (traffic, team size, deadline, budget) and the date they were true. Name the forces that pull in different directions.
- **Options**: at least two real ones; "keep what we have" usually counts.
- **Decision**: active voice and full sentences, starting "We will …".
- **Consequences**: what gets easier, what gets harder, what work it creates. A record listing only benefits is not finished.
- **Confirmation** (MADR): the test, lint rule or review step that will show the decision is being followed.
- **Revisit when**: a measurable trigger, for example "more than 50 jobs per second sustained", so the next reader knows when the reasoning expires.
- **Length**: one to two pages. Link to a design document instead of pasting it.

With `adr-tools` installed (for example `brew install adr-tools`), the Nygard skeleton and the links are generated:

```bash
adr init docs/decisions      # writes 0001-record-architecture-decisions.md and .adr-dir
adr new Store money as integer cents
adr new -s 2 Store money as numeric with a currency code   # 0002 becomes "Superceded by" 0003
adr generate toc > docs/decisions/README.md
```

`adr new` opens the file in `$VISUAL`, or in `$EDITOR` when `VISUAL` is not set; run it with `VISUAL=true` when unattended, then fill the sections in. The tool spells the status "Superceded"; leave its spelling alone so its own links keep working.

### 5. Reverse a decision by adding, not editing

Statuses move in one direction: `proposed` → `accepted` or `rejected`; later `accepted` → `deprecated` (no longer applies, nothing replaces it) or `superseded by NNNN`.

1. Write the new record. Its context explains what changed since the old one.
2. In the new record, state "Supersedes 0004" with a link.
3. In the old record change only the status line to "Superseded by 0009" with a link. Leave its context, decision and consequences exactly as written.
4. Fix a typo in an accepted record freely; a change of meaning is a new record.

For a decision taken long ago and never written down, add a first line under the title: "Recorded retrospectively on 2026-10-01; decided around March 2025." and mark unknown reasoning as not recorded rather than reconstructing it.

### 6. Bring the other documents into line

| The change touched | Update |
|---|---|
| A command, environment variable, port, prerequisite or version | README: setup and run section |
| Behaviour of a public function, endpoint or CLI flag | Reference comment or OpenAPI `description` at the definition |
| Anything a user or integrator will notice | `CHANGELOG.md` under `## [Unreleased]` |
| A new or superseded record | The log's index and the README's architecture section |
| A constraint that looks wrong but is deliberate | A comment at that line linking to the record |

- **README**: one paragraph on what the project is, prerequisites with versions, install, run and test commands, a table of configuration variables, links to the decision log and changelog. Run every command you write there.
- **Reference comments** state the contract, not the implementation: meaning and units of each parameter, defaults, what is returned, which errors are raised and when, side effects. Comments that repeat the code are deleted.
- **Changelog** follows Keep a Changelog 1.1.0: newest release first, ISO dates, entries grouped under `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`, written for the person upgrading. Do not paste commit subjects. A removal or incompatible change means a major version under Semantic Versioning.
- Keep the four kinds of documentation apart (the Diátaxis split): tutorial, how-to guide, reference, explanation. A decision record is explanation; it does not replace the how-to in the README.

```ts
/**
 * Reserves stock for an order line and returns the reservation.
 *
 * @param sku - Stock keeping unit, for example "KB-104-ISO".
 * @param quantity - Units to hold. Must be a positive integer.
 * @param ttlSeconds - How long the hold lasts before it is released. Default 900.
 * @returns The reservation with its expiry time in UTC.
 * @throws {@link InsufficientStockError} When fewer than `quantity` units are free.
 * @remarks Writes to `stock_reservations`; safe to retry with the same order line (see ADR 0006).
 */
export async function reserveStock(sku: string, quantity: number, ttlSeconds = 900): Promise<Reservation> {
  return reservations.hold(sku, quantity, ttlSeconds);
}
```

### 7. Check the log

Save as `scripts/check_adrs.py` and run `python3 scripts/check_adrs.py docs/decisions` after every change to the log. It understands both formats and exits non-zero on a problem.

```python
#!/usr/bin/env python3
"""check_adrs.py DIR — numbering, status and supersession links of a decision log."""
import pathlib, re, sys

ALLOWED = ("proposed", "accepted", "rejected", "deprecated", "superseded", "superceded")
files = sorted(pathlib.Path(sys.argv[1]).glob("[0-9][0-9][0-9][0-9]-*.md"))
numbers = {int(f.name[:4]) for f in files}
problems = [] if files else [f"no records found in {sys.argv[1]}"]
for position, f in enumerate(files, start=1):
    number, text = int(f.name[:4]), f.read_text()
    if number != position:
        problems.append(f"{f.name}: expected {position:04d} (gap or duplicate)")
    # MADR keeps the status in front matter, the Nygard format under a "## Status" heading
    found = re.search(r'^status:\s*"?(.+?)"?\s*$', text, re.M) or re.search(r"^## Status\s+(.+?)\s*$", text, re.M)
    status = found.group(1).lower() if found else ""
    if not status.startswith(ALLOWED):
        problems.append(f"{f.name}: status is {status or 'missing'!r}")
    if status.startswith(("superseded", "superceded")):
        targets = {int(n) for n in re.findall(r"\d{4}", status)}  # a title may hold a year: accept any match
        if not any(n in numbers and n > number for n in targets):
            problems.append(f"{f.name}: superseded, but the newer record is not named or does not exist")
print("\n".join(problems) or f"{len(files)} records, no problems")
sys.exit(1 if problems else 0)
```

## Examples

### Example 1: a new decision, complete MADR record

Request: "We agreed yesterday to move the nightly cron scripts onto a job queue in Postgres. Write the ADR." The log is in `docs/decisions/`, MADR format, last number 0006. The user confirmed who decided and why Redis was ruled out.

`docs/decisions/0007-run-background-jobs-on-a-postgresql-queue.md`:

```markdown
---
status: accepted
date: 2026-09-30
decision-makers: Ines Okafor, Tomasz Lindqvist
consulted: Priya Raman (operations)
informed: support team
---

# Run background jobs on a PostgreSQL-backed queue

## Context and Problem Statement

Invoice emails, PDF rendering and the nightly ledger export run as cron scripts on the application server. In September three exports overlapped and produced duplicate ledger rows; a failed script is noticed only when a customer writes in. We run one PostgreSQL 16 instance and two application containers, and have two backend developers. How should we run about 4,000 background jobs a day with retries and visibility?

## Decision Drivers

* A job must not run twice at the same time.
* Failures must be retried and visible without reading server logs.
* No new service to operate before the team grows.

## Considered Options

* Keep cron and add lock files
* Queue in PostgreSQL using the pg-boss library
* Queue in Redis using BullMQ

## Decision Outcome

Chosen option: "Queue in PostgreSQL using the pg-boss library", because it is the only option that gives retries and exclusive execution without adding a service to run.

### Consequences

* Good, because a job is enqueued in the same transaction as the business write, so the two cannot disagree.
* Good, because failed jobs sit in a table we can query and alert on.
* Bad, because queue traffic shares the database's connection and I/O budget.
* Bad, because the scripts must be rewritten as idempotent handlers: about one week of work.

### Confirmation

An integration test starts two workers and asserts that one export job produces one ledger file. The cron entries are deleted in the same release.

## Pros and Cons of the Options

### Keep cron and add lock files

* Good, because it needs no new code path.
* Bad, because lock files do not work across two containers.
* Bad, because it adds no retries and no visibility.

### Queue in Redis using BullMQ

* Good, because it is built for high throughput.
* Bad, because it means running, backing up and monitoring Redis for 4,000 jobs a day.
* Bad, because enqueueing cannot share a transaction with the business write.

## More Information

Revisit when sustained load passes 50 jobs per second or queue queries show up in the slow-query log. Design notes: `docs/design/background-jobs.md`.
```

Then: add the record to `docs/decisions/README.md`, replace the README's "Scheduled tasks" paragraph, add "Changed: background tasks now run on a job queue and retry up to three times" under `[Unreleased]`, and run the check (`7 records, no problems`).

### Example 2: reversing a decision, Nygard format

Request: "We're replacing polling with webhooks. ADR 4 chose polling." The log uses the Nygard layout.

`doc/adr/0009-receive-carrier-updates-by-webhook.md`:

```markdown
# 9. Receive carrier updates by webhook

Date: 2026-10-01

## Status

Accepted

Supersedes [4. Poll the carrier API for shipment status](0004-poll-the-carrier-api-for-shipment-status.md)

## Context

Record 4 chose polling every five minutes because the carrier had no webhooks in 2025. Shipments have grown from 300 to 6,500 a day; polling now makes about 1.9 million requests a day and we were rate limited on 11 days in September. The carrier released signed webhooks in June 2026.

## Decision

We will register a webhook endpoint at `/hooks/carrier`, verify the signature of every delivery with the secret in `CARRIER_WEBHOOK_SECRET`, and stop the poller once webhooks have matched it for 14 days. A reconciliation poll stays once a day to catch missed deliveries.

## Consequences

Status changes arrive within seconds instead of up to five minutes, and request volume falls to one call per shipment per day. We now run a public endpoint that must stay available and reject forged requests. Local development needs a tunnel or recorded payloads. The poller is removed in the release after next.
```

In `0004-…md` only the status changes: `Superseded by [9. Receive carrier updates by webhook](0009-receive-carrier-updates-by-webhook.md)`. The pull request description carries the Y-statement: "In the context of shipment tracking, facing rate limits at 6,500 shipments a day, we decided for carrier webhooks and neglected faster polling, to achieve updates within seconds, accepting a public endpoint to secure, because polling cost grows with every open shipment." `CHANGELOG.md` gains:

```markdown
## [Unreleased]

### Changed

- Shipment status now updates within seconds of a carrier event instead of every five minutes.

### Deprecated

- `POLL_INTERVAL_SECONDS` is ignored from the next release and will be removed in 3.0.0.
```

## Guidelines

- A record written to justify a choice after the fact, with alternatives nobody weighed, misleads the next reader. Say what was really considered.
- Do not edit the reasoning of an accepted record, delete a record, or renumber the log. History that changes cannot be trusted.
- `proposed` is a temporary state. List proposed records older than a month and ask the user to accept, reject or withdraw them.
- Keep secrets, customer names and personal data out of records; they live as long as the repository does.
- Too many records is also a failure: if every library bump gets one, the important ones are buried. Use the table in step 2.
- The check script validates structure only. Whether the consequences are honest is for a human reviewer.
- Not the right tool for generating API reference at scale (use the language's documentation generator), for writing end-user guides, or for a design proposal that is still being debated: write the proposal first and record the outcome here once it is decided.
