---
name: triage-issue
description: >-
  Investigates a reported bug and turns it into a tracker issue that someone else can pick up:
  checks for duplicates, reproduces the problem, traces it to its cause in the code, rates
  severity, and writes a test-first fix plan. Use when someone says "triage this bug",
  "look into this error and file an issue", "why is this failing, write it up", "users report
  that...", or pastes a stack trace or a failing CI job and wants an issue rather than an
  immediate fix. Files on GitHub with the gh CLI, or writes the issue body to a file for any
  other tracker.
license: Apache-2.0
compatibility: "Git repository with read access to the code. Filing uses the GitHub CLI (gh 2.x, signed in by the user); without it the skill writes the issue body to a Markdown file."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["bug-triage", "github-issues", "root-cause-analysis", "debugging", "git-bisect"]
---

# Triage Issue

## Overview

Triage answers four questions about a reported problem: is it real, is it already known, why does it happen, and how bad is it. The output is one issue that a developer who was not in the conversation can act on: steps that reproduce the fault, the mechanism behind it with the evidence, a severity, and an ordered plan in which every step begins with a test that fails today.

The skill investigates and writes; it does not fix. Keeping the two apart is deliberate: the issue records what was learned even if the fix is done later, by someone else, or never.

## Instructions

### 1. Take in the report

Extract what the report already contains before asking anything: what was observed, what was expected, the steps, the environment (version, browser, OS, account type), how often it happens, when it was first seen, and any evidence such as an error message, stack trace or screenshot.

Then look up what the repository can answer: the current version, recent releases, the test command, and whether `.github/ISSUE_TEMPLATE/` defines headings an issue must follow. Ask the user only for what neither source gives, and no more than two questions. If the observed behaviour itself is unclear, ask that first; everything else can start without waiting.

### 2. Search for an existing issue

```bash
gh issue list --search "export missing rows in:title,body" --state all --limit 20 \
  --json number,title,state,url
```

Try two or three phrasings: the user's words, the error message, the function name. If an open issue covers it, do not create another; add what is new as a comment (`gh issue comment 412 --body-file triage/export-missing-rows.md`). If a closed issue matches, it is a regression: link it and continue.

### 3. Classify

| Class | Test | Outcome |
|---|---|---|
| Bug | behaviour contradicts documentation, tests or evident intent | continue |
| Regression | it worked in an earlier version | continue, and find the introducing change in step 5 |
| Works as designed | documented behaviour the reporter did not expect | no bug issue; propose a documentation fix or a feature request and say so |
| Feature request | asks for behaviour that never existed | write it as a request, without cause or fix plan |
| Environment | only on one machine, expired credential, wrong configuration | answer the reporter; file only if the product should guard against it |
| Security | lets someone read or change what they should not | stop: never open a public issue. Use the repository's private vulnerability reporting (the "Report a vulnerability" button under its security tab) or the contact in `SECURITY.md`, and tell the user |

### 4. Reproduce

Reduce the report to the shortest sequence that shows the fault, preferably a single command or a test. Record the exact command and its output. For a fault that comes and goes, run it repeatedly and record the rate:

```bash
for i in $(seq 1 20); do npx vitest run src/auth/refresh.test.ts >/dev/null 2>&1 || echo "run $i failed"; done
```

If it cannot be reproduced after a serious attempt, say so in the issue, list what was tried, and carry on with the evidence there is. An honest "not reproduced" is worth more than a guessed cause.

### 5. Trace the cause

Separate three things that reports blur together: the symptom (what the user sees), the trigger (the input or timing that sets it off), and the cause (the code that is wrong). Work from the symptom backwards:

- In a stack trace, start at the first frame that belongs to the project, not the library frame on top. The line that throws is rarely where the bad value was made; follow the value back to where it was created.
- Compare with a neighbouring code path that does the same job correctly. The difference is often the cause.
- For a regression, let history find the change:

```bash
git log --oneline --since="3 weeks ago" -- src/export/     # what changed in the area
git log -S"pageSize" --oneline -- src/export/              # commits that added or removed a string
git log -L :exportInvoices:src/export/invoices.ts          # history of one function
git bisect start v3.8.0 v3.7.2                             # bad revision first, then good
git bisect run node ../repro/export-count.mjs              # exit 0 = good, 1-127 = bad, 125 = skip
git bisect reset
```

Bisect checks out old commits, so run it only on a clean working tree, and keep the reproduction script outside the repository so that it exists at every commit.

State the cause as a mechanism: "X happens because Y, when Z". Then test it: predict something else that must be true if the mechanism is right (another input that fails, a log line that must exist) and check. Grade the result:

| Confidence | Meaning |
|---|---|
| Confirmed | reproduced, and a test or experiment shows the fault disappears when the suspected code path changes |
| Probable | the mechanism explains all evidence, but was not demonstrated |
| Unknown | symptoms documented, no mechanism yet; the plan starts with instrumentation |

Finally search for the same flaw elsewhere: other callers of the function, copies of the pattern.

### 6. Rate severity

| Level | Meaning |
|---|---|
| S1 | data loss or corruption, security exposure, or the product unusable for most users |
| S2 | a main workflow broken or giving wrong results, with no reasonable workaround |
| S3 | a workflow impaired but a workaround exists, or few users affected |
| S4 | cosmetic, or an edge case with negligible impact |

Give the reasoning in a sentence: who is affected, how many, since when, and the workaround. Map the level onto labels the repository already has (`gh label list --limit 100 --json name --jq '.[].name'`); do not create labels without asking.

### 7. Plan the fix, test first

Write an ordered list in which each step is a test that fails today followed by the smallest change that makes it pass. The first test is the reproduction itself, so the bug can never return unnoticed. Describe tests by observable behaviour (given, when, then) through public interfaces, and describe changes by what the code must do, leaving the exact edit to the implementer. End with any cleanup that becomes safe once the tests pass. With an Unknown cause the plan is an investigation: what to log, what to measure, and what result would confirm or rule out each theory.

### 8. Write the issue

Title: the symptom and its condition, in the user's vocabulary, with the version for a regression. "Invoice export stops after the first page that contains an archived invoice (since 3.8.0)", not "Bug in export".

```markdown
## Summary
What breaks, for whom, since when. Two sentences.

## Reproduction
Environment: version, runtime, relevant configuration
1. Step
2. Step
Expected: ...
Actual: ...
Frequency: always | 6 of 20 runs | not reproduced (what was tried)

## Cause
Confidence: Confirmed | Probable | Unknown
The mechanism, in terms of behaviour: X happens because Y, when Z.
Evidence: commit, test output, log lines
Location: file and function, with the commit they were read at

## Impact
Severity and why. Who is affected, the workaround, other places with the same flaw.

## Fix plan (test first)
| # | Test that fails today | Smallest change that makes it pass |
|---|---|---|

Afterwards: cleanup that becomes safe.

## Done when
- [ ] observable outcomes, one per line

## Not in scope
Related problems noticed and deliberately left out.
```

Explain the mechanism in words that survive a refactor, and give file locations as a pointer pinned to a commit, not as the explanation. Before posting, remove secrets and personal data from pasted logs: tokens, e-mail addresses, customer names.

### 9. File it and report back

If the user asked for an issue, create it; if they only asked what is wrong, show the draft and ask. An issue is visible to everyone with access to the repository.

```bash
gh issue create --title "Invoice export stops after the first page that contains an archived invoice (since 3.8.0)" \
  --body-file triage/export-missing-rows.md --label bug
```

Without `gh`, or on another tracker, save the body under `triage/` and give the user the path. Close with the issue URL, the cause in one sentence, the confidence, and the severity.

## Examples

### Example 1: A regression found by bisect

Request: "Customers say the invoice CSV export has been missing rows since last week. Triage it and file an issue." No duplicate turns up. The agent seeds 1,240 invoices, archives one on the first page, and gets an export of 499 rows. `git bisect` between `v3.7.2` and `v3.8.0` lands on commit `a41c9e7`, "hide archived invoices from export". The filed issue reads:

```markdown
## Summary
Since 3.8.0 the invoice CSV export ends early for any account that has an archived invoice, silently omitting later invoices. Accountants receive incomplete files with no error.

## Reproduction
Environment: 3.8.0, Node 22, PostgreSQL 16
1. Seed 1,240 invoices; archive invoice #37.
2. GET /api/export/invoices.csv
Expected: 1,239 rows
Actual: 499 rows
Frequency: always

## Cause
Confidence: Confirmed
The export reads pages of 500 and treats a page with fewer than 500 rows as the last one. Since `a41c9e7` archived invoices are removed from each page before that check, so the first page containing an archived invoice looks short and the loop ends.
Evidence: bisect between v3.7.2 and v3.8.0 ends at `a41c9e7`; with the filter moved after the check the same data exports 1,239 rows.
Location: `exportInvoices` in `src/export/invoices.ts`, read at `a41c9e7`

## Impact
S2: wrong results in a main workflow, no error shown. 212 of 1,900 accounts have an archived invoice. Workaround: export by date range under 500 invoices. The payments export uses the same loop but does not filter, so it is unaffected.

## Fix plan (test first)
| # | Test that fails today | Smallest change that makes it pass |
|---|---|---|
| 1 | Given 1,240 invoices with one archived on page 1, the export has 1,239 rows | decide "last page" from the unfiltered page size |
| 2 | Given 500 invoices that are all archived, the export is a header with no rows and no error | same check; assert the loop still ends |

Afterwards: move the archived filter into the query so pages are never short.

## Done when
- [ ] Export row count equals the number of non-archived invoices for 0, 1 and 3 pages of data
- [ ] Both new tests pass; existing export tests are unchanged
```

Reply to the user: the issue URL, then "Cause: archived invoices are filtered before the last-page check, so the export stops early (confirmed, S2)."

### Example 2: An intermittent fault that will not reproduce

Request: "Three users this week were logged out seconds after logging in. Look into it." Twenty local runs of the auth tests pass. The production logs for the three accounts each show two `POST /auth/refresh` calls carrying the same refresh token within 40 ms. The agent drafts and shows this, since the user asked for an investigation and not a ticket:

```markdown
## Cause
Confidence: Probable
Refresh tokens are single-use. When two browser tabs refresh at the same moment, the second request presents a token the first has already rotated, which is treated as theft and ends every session of that user.
Evidence: paired refresh calls 12-40 ms apart for all three reports (log excerpts below, tokens removed). Not reproduced: 20 sequential test runs pass, and no test sends concurrent refreshes.

## Fix plan (test first)
| # | Test that fails today | Smallest change that makes it pass |
|---|---|---|
| 1 | Two refresh requests with the same token sent concurrently both end with a valid session | accept the previous token for a short grace period after rotation |
| 2 | The previous token is rejected once the grace period has passed | expiry on the grace entry |
```

It tells the user that test 1 doubles as the missing reproduction: if it passes on the current code, the theory is wrong and the issue should be reopened as Unknown.

### Example 3: Not a bug

Report: "Search doesn't find archived projects." The documentation says archived projects are excluded and the tests assert it. The agent replies that this is designed behaviour, quotes the documentation line, and offers a feature request ("option to include archived projects in search") in place of a bug issue.

## Guidelines

- Do not fix while triaging. A change made halfway through hides the evidence and leaves an issue nobody can verify.
- Never present a guess as a finding. Confidence is part of the report, and "Probable" with the evidence listed is a legitimate result.
- One issue per cause. Two symptoms with one cause belong together; one symptom with two causes becomes two linked issues.
- Do not paste whole logs or files. Quote the lines that prove the point and say where the rest is.
- Leave the working tree as it was: finish every `git bisect` with `git bisect reset`, and remove seed data and temporary scripts.
- Severity is about users, not about how interesting the bug is. If the affected numbers are unknown, write "unknown" and say how to find out.
- Public repositories: anything in an issue is published. Security problems go through private reporting, and customer data never goes in.
- Not the right tool when the user wants the fix now and the cause is already plain (just fix it and describe the cause in the pull request), or for planning new features.
