---
title: "Create Automated Technical Interview Questions from Codebase with AI"
slug: create-automated-technical-interview-questions-from-codebase
description: "Generate relevant technical interview questions based on your actual codebase so candidates solve problems they'd face on the job."
skills: [coding-agent, applicant-screening]
category: business
tags: [hiring, interview, technical-assessment, codebase-analysis]
---

# Create Automated Technical Interview Questions from Codebase with AI

## The Problem

A 25-person startup is hiring three backend engineers, and its technical interviews use generic LeetCode-style questions (reverse a linked list, find the shortest path in a graph) that have little to do with the actual work. The real codebase is event-driven with RabbitMQ, full of multi-table SQL queries and third-party webhook integrations that need idempotency. Candidates who ace the puzzles sometimes struggle with that; strong practical engineers fail the whiteboard because they have not practised competitive programming lately.

The engineering manager also spends hours per role writing take-home assignments from scratch, and the questions go stale as the code is refactored. There is no systematic way to produce questions that reflect what the team builds every day.

## The Solution

Using the **coding-agent** and **applicant-screening** skills, the agent surveys the codebase for the patterns that matter, writes tiered questions with the proprietary parts removed, and packages a take-home with an automated test suite. applicant-screening turns each question's rubric into a written scorecard, so every interviewer scores the same evidence the same way. People make every hiring decision: the scorecard informs the debrief, it does not reject anyone.

## Step-by-Step Walkthrough

### Step 1: Survey the codebase

```text
Survey our repository for a mid-level backend engineer interview. List the
architecture patterns in use (message handlers, repositories, validators),
the kinds of change that appear most often in the git log, and the error-
handling conventions. Do not print any secrets, customer data or business
rules; just describe patterns and give file paths.
```

The coding-agent skill runs a coding agent (Claude Code, Codex CLI or Gemini CLI) over the repository as a background task. Run it on a clean checkout without production credentials, and read its output before it goes anywhere else, because an agent summarising a repo can quote secrets from config files or comments.

A typical result for this team:

- Event-driven pub/sub with RabbitMQ (dozens of handlers) and a repository layer for database access
- Frequent tasks: new API endpoints with input validation, event handlers with retry logic, SQL joins across three or more tables, webhook processing with idempotency
- Conventions: custom error classes with codes, circuit breakers around external APIs, structured logs with correlation IDs

The git log is a better guide to the job than the job description. It also shows what is not worth testing: if deployment belongs to DevOps, do not ask backend candidates about CI configuration.

### Step 2: Generate tiered questions

```text
Write nine questions for a mid-level backend engineer from those patterns:
three easy (15 minutes), three medium (30), three hard (45). Replace the
business domain and rename identifiers so nothing proprietary remains, but
keep the technical difficulty (retries, idempotency, query shape) unchanged.
```

Examples of what comes back:

- **Easy:** add input validation to a registration route following the repo's middleware pattern; find the join that returns duplicate rows; write a unit test for an event handler with the queue mocked.
- **Medium:** implement a webhook receiver for payment events that is idempotent on the event id; refactor an N+1 query into a batch query through the repository layer; add a circuit breaker to a client that currently fails silently.
- **Hard:** design a saga for an order flow with partial failures; fix a handler that processes messages out of order under load; make a report query fast on a table with tens of millions of rows.

Have a human who knows the codebase read every question before use. A model can describe a pattern incorrectly, and a question with a flawed premise penalises the best candidates. Time-test each question with an engineer on the team before a candidate sees it.

### Step 3: Turn each question into a rubric and scorecard

```text
For each question write a rubric: what a strong answer does, common mistakes,
two follow-up questions, and the time it should take. Then build a scorecard
with weighted criteria that every interviewer fills in from what they
observed in the session.
```

applicant-screening's first step is defining a scoring rubric before looking at any candidate, and the same discipline applies to interviews. Write the criteria first (reads existing conventions before coding, handles retries and duplicates, tests edge cases, explains tradeoffs), score only evidence from the session ("did not handle a duplicate event" rather than "seems junior"), and apply the same rubric to every candidate. Show the rubric to the hiring manager for approval before the first interview.

The scorecard supports the discussion; it does not replace it. A person decides who advances, and no candidate is rejected because of a number alone. If you use software to score or rank candidates, check the rules where you hire first: New York City Local Law 144 requires a bias audit and notice for automated employment decision tools, and the EU AI Act treats AI used in recruitment as high-risk. Keep interviewers' notes and scores so the process can be audited.

### Step 4: Package a take-home

```text
Turn question 4 (idempotent payment webhook) into a self-contained take-home:
README with setup, scaffolded endpoint, a webhook simulator that sends signed
test events including duplicates and out-of-order deliveries, a test suite,
and a .env.example. It should take 2-3 hours.
```

The coding-agent builds the repository in a separate directory, never inside the company codebase. Check these before sending it to anyone:

- **Run the tests yourself.** Write a reference solution and confirm the suite passes it, then confirm a naive happy-path solution fails the duplicate and out-of-order tests. A test suite nobody has run against a solution is a guess.
- **Use `docker compose up` for services.** Pin image tags, publish ports on `127.0.0.1` only, and put placeholder values in `.env.example`, never real keys.
- **Make the signature requirement concrete.** Webhook verification should be a real HMAC over the raw body compared in constant time; the simulator signs its events with a documented test secret so candidates can implement it.
- **Respect the candidate's time.** State the expected 2-3 hours in the README and say not to spend more. Score the result with the same rubric and talk it through in a follow-up interview, where the candidate explains their choices.

## Real-World Example

Aisha manages engineering at the startup and has been dreading the hiring round. Last time she spent about 15 hours writing materials that tested the wrong things. This time she runs the survey on Monday, edits the nine questions on Tuesday, strips two that leaked internal naming, and has a teammate time-test the take-home on Wednesday.

In the interviews, two candidates who would have struggled with a whiteboard algorithm round do well on the practical questions. One writes an idempotent handler more cleanly than the team's own; the other notices a race condition in the event-handler question. The team debriefs on the scorecards, discusses the evidence, and decides together. Both candidates get offers.

Aisha regenerates the questions each quarter as the code changes, for example when the team adopts CQRS for write-heavy endpoints, and keeps two or three variants of each so answers do not circulate between candidates. She also compares scorecard results against how hired engineers perform after six months, and adjusts the rubric where the two disagree; with only a handful of hires a year this is a prompt for discussion, not a statistic.

## Related Skills

- [coding-agent](../skills/coding-agent/SKILL.md) -- survey the repository and build the take-home in the background
- [applicant-screening](../skills/applicant-screening/SKILL.md) -- rubric-first scorecards applied consistently, with a human making every decision
