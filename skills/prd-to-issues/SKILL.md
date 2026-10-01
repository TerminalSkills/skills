---
name: prd-to-issues
description: >-
  Converts a product requirements document into a reviewed set of GitHub issues: end-to-end increments sized for one pull request, each with checkable acceptance criteria, traced back to the PRD's requirements and linked as sub-issues with blocked-by relationships. Use when the user says "break this PRD into issues", "create tickets from the PRD", "turn the spec into a backlog", "split this feature into work items", or asks which parts of a PRD can be built in parallel.
license: Apache-2.0
compatibility: "GitHub repository with Issues enabled and an authenticated GitHub CLI (gh). gh 2.94.0+ for the native sub-issue and blocked-by flags; older versions fall back to gh api. Works in Claude Code, Codex, Gemini CLI and Cursor."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["prd", "github-issues", "backlog", "work-breakdown", "gh-cli"]
---

# PRD to Issues

## Overview

A PRD describes what a feature must do; it is not something a developer or a coding agent can pick up and ship. This skill turns one into a backlog: a handful of GitHub issues that each put working behaviour in front of a user, fit in one pull request, and carry acceptance criteria precise enough to check. Every requirement is traced to an issue, the order of work is stored as real GitHub relationships (sub-issue of the PRD, blocked by its prerequisites), and nothing is created until the user has approved the breakdown.

## Instructions

### 1. Collect the inputs

Ask only for what cannot be looked up: where the PRD is (issue number, file, or pasted text) and which repository receives the issues. Then read the rest from the project:

```bash
gh --version                                   # 2.94.0+ has --parent / --blocked-by / --type
gh repo view --json nameWithOwner,hasIssuesEnabled
gh issue view 142 --json number,title,body,comments,labels,milestone,subIssues
gh label list --limit 200 --json name,description
gh api "repos/{owner}/{repo}/milestones" --jq '.[].title'
```

`gh` fills `{owner}` and `{repo}` from the current directory. Read the comments as well as the body: decisions made after the PRD was written usually live there. On gh older than 2.94.0 drop `subIssues` from the field list. If `subIssues.totalCount` is above zero, the PRD was already broken down once: list what exists and ask whether to extend it instead of creating a second set.

### 2. Build a requirement ledger

Number every requirement the PRD states (`R1`, `R2`, …), keeping the PRD's own numbering if it has one. Separately list the stated non-goals and every question the PRD leaves open. A requirement that cannot be verified as written ("search should be fast") gets a proposed measurable form, shown to the user as a question, not silently decided.

### 3. Survey the code

Find the route a request for this feature takes through the system: storage, domain logic, API, interface, tests. Note what already exists and can be reused, the test command, and any conventions an issue should point at. This is what makes an issue startable without a second investigation.

### 4. Cut the work into increments

Each issue is a vertical slice: one user-visible behaviour carried through every layer it needs, tests included. "Add the tables", "build the API", "build the UI" are layers, not increments; nobody can try a layer.

- **Start with the thinnest working path.** The first issue is the smallest version of the main scenario that runs from the interface to storage and back. Later issues widen it.
- **Size for one pull request.** If an issue needs more than about two days or more than six acceptance criteria, split it.
- **Ways to split:** by step of the workflow; by business rule or variation; main path before failure handling; one data type or integration at a time; correct first, fast later.
- **Check each one against INVEST:** independent, negotiable, valuable, estimable, small, testable. An issue that fails "valuable" is usually a layer in disguise.
- **Two exceptions are legitimate:** a decision issue (an open question that blocks work, with the person who decides) and an enabler (a migration or setup step with no visible behaviour). Keep an enabler only if a named increment cannot start without it.

Give every issue a readiness state. **Ready** means it can be built from the issue text and the PRD alone, including by an unattended agent. **Needs decision** means a named person must choose something first; say who and what.

### 5. Order the work

Record only true prerequisites, so the dependency graph stays shallow and work can run in parallel. No cycles. For each issue, write what it is blocked by; for the whole set, say which issues can start today.

### 6. Review before creating anything

Show the breakdown as a table (title, requirements covered, readiness, blocked by) followed by a coverage check: every `R` appears in at least one issue, every non-goal appears in none, every open question has a decision issue or an answer. Then ask what would change the plan: is any item too large to review in one pull request, is any dependency wrong, should anything be cut or deferred, which label and milestone should the set carry. Revise until the user approves. Creating issues notifies watchers and is tedious to undo, so do not create a draft set "to look at".

### 7. Create the issues

Write each body to a file in a temporary directory and create the issues in dependency order, so blockers have numbers before the issues that need them. `gh issue create` prints the new issue's URL on stdout; the number is its last path segment.

```bash
tmp=$(mktemp -d)
gh label create "prd:saved-searches" --description "Work items for PRD #142" --color 1D76DB --force

url=$(gh issue create --title "Save the current filter and reopen it from the sidebar" \
  --body-file "$tmp/01-save-and-reopen.md" --label "prd:saved-searches" --parent 142)
first=${url##*/}

gh issue create --title "Rename and delete a saved search" \
  --body-file "$tmp/02-rename-delete.md" --label "prd:saved-searches" \
  --parent 142 --blocked-by "$first"
```

`--force` makes label creation safe to repeat. `--blocked-by` takes one number or a comma-separated list. Add `--milestone "Q4 search"` or `--type Feature` only if that milestone or issue type exists in the repository. Use the title the user approved, written as an outcome, not as a task.

Body shape (plain Markdown, same headings in every issue):

- **Outcome** — two or three sentences on what a user can do when this is merged, then `Part of #142 · covers R1, R2`.
- **Scope** — what is included, and a "Not here" line naming the neighbouring issues' territory.
- **Acceptance criteria** — a task list; each item is an observation someone can make (input, action, expected result), including at least one failure case and the automated tests expected.
- **Notes for the implementer** — existing code to reuse, conventions, decisions already taken. Facts from the survey, not a design.
- **Depends on** — issue numbers, or "Nothing — can start now".

### 8. Verify and report

```bash
gh issue view 142 --json subIssues --jq '.subIssues.nodes[] | "#\(.number) \(.title) [\(.state)]"'
gh issue comment 142 --body-file "$tmp/summary.md"
```

The summary comment lists the created issues in suggested order, which can start now, and which wait on a decision. Leave the PRD's own body and state untouched. Finish by giving the user the same list with URLs.

## Examples

### Example 1: PRD in an issue, current gh

Repository `fernhill/tracker-web`, PRD in issue #142 "Saved searches with email alerts", gh 2.102.0. The ledger has seven requirements: R1 save the current ticket filter under a name; R2 saved searches appear in the sidebar and re-run on click; R3 rename and delete; R4 opt in to a daily email digest per search; R5 the digest lists tickets that newly match, and is not sent when nothing is new; R6 one-click unsubscribe in every digest; R7 at most 25 saved searches per user. Non-goals: sharing searches with teammates, instant alerts. Open question: when the digest is sent.

Breakdown shown to the user:

| # | Issue | Covers | Readiness | Blocked by |
|---|-------|--------|-----------|------------|
| 1 | Save the current filter and reopen it from the sidebar | R1, R2 | Ready | — |
| 2 | Rename and delete a saved search | R3 | Ready | 1 |
| 3 | Refuse a 26th saved search with a clear message | R7 | Ready | 1 |
| 4 | Decide digest send time and time-zone handling | R4 (open question) | Needs decision: Priya Nair | — |
| 5 | Daily digest email for a saved search | R4, R5 | Ready once 4 is answered | 1, 4 |
| 6 | One-click unsubscribe from a digest | R6 | Ready | 5 |

Coverage: R1–R7 all assigned; no issue touches sharing or instant alerts. Issues 1 and 4 can start today; 2 and 3 run in parallel after 1.

After approval the issues are created as #151–#156. Body of #151:

```markdown
## Outcome
A signed-in user can save the filter currently applied to the ticket list under a
name, sees it in the sidebar, and clicking it applies the same filter again.

Part of #142 · covers R1, R2

## Scope
- Store a saved search (name + serialized filter) per user
- `POST /api/saved-searches` and `GET /api/saved-searches`
- "Save search" button on the ticket list, "Saved searches" group in the sidebar
- Not here: rename and delete (#152), the 25-search limit (#153), digests (#155)

## Acceptance criteria
- [ ] With status=open and assignee=me applied, saving as "My open tickets" adds a
      sidebar entry without a page reload
- [ ] In a new session, clicking the entry shows the same tickets as setting the
      filter by hand
- [ ] A request made with another user's session returns none of my saved searches
- [ ] An empty name or one longer than 80 characters is rejected with a field error
- [ ] API tests cover both endpoints; a component test covers the sidebar group

## Notes for the implementer
`useTicketFilters` already serializes filters to the URL query string. Store that
string instead of introducing a second format.

## Depends on
Nothing — can start now.
```

The digest issue is created with both of its prerequisites:

```bash
gh issue create --title "Daily digest email for a saved search" \
  --body-file "$tmp/05-daily-digest.md" --label "prd:saved-searches" \
  --parent 142 --blocked-by 151,154
```

### Example 2: PRD in a file, older gh, no labels yet

Repository `marlowe-freight/dispatch`, PRD at `docs/prd/csv-import.md`, gh 2.63.0. There is no parent issue, so the user is asked whether to open a tracking issue that links to the file; they agree, and it becomes #210. The approved breakdown has four issues: upload a CSV and import valid rows (R1, R2), report rejected rows with line numbers (R3), map custom column names (R4), import files over 10,000 rows in the background (R5, blocked by the first).

This gh version has no `--parent` or `--blocked-by`, so the issues (#211–#214) are created with title, body file and label only, and linked through the REST API afterwards. Both endpoints want the issue's database `id`, not its number:

```bash
for n in 211 212 213 214; do
  id=$(gh api "repos/{owner}/{repo}/issues/$n" --jq .id)
  gh api "repos/{owner}/{repo}/issues/210/sub_issues" -F sub_issue_id="$id" --silent
done

blocker=$(gh api "repos/{owner}/{repo}/issues/211" --jq .id)
gh api "repos/{owner}/{repo}/issues/214/dependencies/blocked_by" -F issue_id="$blocker" --silent
```

`-F` sends the value as a JSON integer, which these endpoints require, and adding a field switches the request to POST. Report to the user: tracking issue #210 with four sub-issues; #211, #212 and #213 can start now; #214 waits for #211.

## Guidelines

- **Do not create before approval, and do not create twice.** Before step 7 list existing issues with the set's label (`gh issue list --label "prd:saved-searches" --state all --json number,title`) and skip titles that already exist.
- **A layer is not an issue.** If the titles read "schema", "endpoints", "frontend", go back to step 4: nothing can be demonstrated until the last one merges, and integration problems surface at the end.
- **Do not invent requirements.** An acceptance criterion that the PRD does not support becomes a question for the user. Gaps in the PRD are findings to report, not blanks to fill.
- **Reference, do not copy.** Link to the PRD's section instead of pasting it into six issues that will drift apart when the PRD is edited.
- **Keep file names and function names out of the outcome and criteria.** They belong, sparingly, in the implementer notes; criteria describe behaviour.
- **Labels, milestones and issue types must exist.** `gh issue create` fails on an unknown label or milestone. Create the label first; never create milestones or types without asking.
- **Relationship limits.** Sub-issues and issue types work on GitHub.com and GitHub Enterprise Server 3.18+, blocked-by relationships need 3.19+, and a sub-issue must belong to the same owner as its parent. Where they are unavailable, the "Depends on" section of each body is the record.
- **Authentication is the user's.** Use the session `gh` already has (or `GH_TOKEN` from the environment). If `gh auth status` reports no login, stop and ask; do not look for tokens on disk.
- **Other trackers.** For Jira, Linear or GitLab, stop after step 6 and hand over the approved table and the body files; do not guess another tool's commands.
- **When not to use it.** A PRD small enough for one pull request needs one issue, not a breakdown. A PRD whose open questions outnumber its requirements needs another round with its author first; offer the list of questions instead.
