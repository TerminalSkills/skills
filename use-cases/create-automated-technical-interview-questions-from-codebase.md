---
title: "Create Automated Technical Interview Questions from Codebase with AI"
slug: create-automated-technical-interview-questions-from-codebase
description: "Generate relevant technical interview questions based on your actual codebase so candidates solve problems they'd face on the job."
skills: [coding-agent, applicant-screening, markdown-writer]
category: business
tags: [hiring, interview, technical-assessment, codebase-analysis]
---

# Create Automated Technical Interview Questions from Codebase with AI

## The Problem

A 25-person startup is hiring three backend engineers, and their interview process is broken in a specific, measurable way. The technical interviews use generic LeetCode-style questions — reverse a linked list, find the shortest path in a graph — that have almost no correlation with the actual work. Candidates who ace algorithm puzzles sometimes struggle with the real codebase: event-driven architecture with RabbitMQ, complex multi-table SQL queries, and third-party webhook integrations with idempotency requirements.

Meanwhile, strong practical engineers who would thrive on the team fail the whiteboard rounds because they have not practiced competitive programming recently. The team has already lost two excellent candidates to this mismatch.

The engineering manager spends 5 hours per role crafting take-home assignments from scratch, and the questions go stale as the codebase evolves. By the time a question makes it through three hiring rounds, the code patterns it tests have been refactored out of existence. There is no systematic way to generate interview questions that reflect what the team actually builds every day.

## The Solution

Using the **coding-agent**, **applicant-screening**, and **markdown-writer** skills, the agent analyzes the codebase to identify the patterns that matter most (by commit frequency and architectural importance), structures questions at three difficulty tiers with scoring rubrics, and packages take-home assignments with automated test suites. The result is an interview process that tests what the job actually requires, not what a generic "backend engineer" job description says.

## Step-by-Step Walkthrough

### Step 1: Analyze the Codebase for Interview-Worthy Patterns

Specifying the role and level matters — questions for a mid-level backend engineer should test different patterns than questions for a senior frontend engineer or a junior full-stack developer.

```text
Analyze our codebase and generate technical interview questions for a
mid-level backend engineer. Focus on patterns they'd actually encounter:
our event-driven architecture, database query patterns, API design
conventions, and error handling approach. Generate questions at easy,
medium, and hard difficulty levels.
```

### Step 2: Identify the Patterns That Define the Job

The codebase analysis reveals what a backend engineer actually does all day — not what a textbook says they should know, but what the git log says they will work on:

**Architecture patterns:**
- Event-driven pub/sub with RabbitMQ (42 event handlers across the codebase)
- Repository pattern for database access (18 repositories)
- Middleware-based request validation (23 validators)

**Most common tasks** (ranked by commit frequency):
- Adding new API endpoints with input validation
- Writing event handlers with retry logic
- Complex SQL queries with joins across 3+ tables
- Third-party webhook processing with idempotency

**Error handling conventions:**
- Custom error classes with error codes
- Circuit breaker pattern for external API calls
- Structured logging with correlation IDs

These patterns become the foundation for questions. A candidate who can write an event handler with retry logic and implement idempotent webhook processing will be productive from week one. A candidate who can reverse a linked list but has never used a message queue will need months of ramp-up.

The analysis also flags what is not worth testing: the team uses a standard Express setup with no unusual middleware, and the deployment pipeline is handled by DevOps. Asking backend candidates about Docker or CI/CD configuration would test skills they will rarely use on this team.

### Step 3: Generate Tiered Interview Questions

The agent produces 9 questions based on real code patterns, organized by difficulty and time allocation:

**Easy (warm-up, 15 minutes each):**

1. "Given this API endpoint skeleton, add input validation for the user registration route using our middleware pattern" -- tests whether the candidate can read existing conventions and follow them.

2. "This database query returns duplicate rows. Find and fix the join issue" -- tests basic SQL debugging, a skill used weekly.

3. "Write a unit test for this event handler, mocking the message queue" -- tests testing practices and familiarity with async patterns.

**Medium (core assessment, 30 minutes each):**

4. "Implement a new webhook receiver that handles Stripe payment events with idempotency" -- tests the exact pattern the team implements most frequently.

5. "Refactor this N+1 query into an efficient batch query using our repository pattern" -- tests performance awareness and pattern adherence.

6. "Add circuit breaker logic to this third-party API client that currently fails silently" -- tests resilience thinking and error handling.

**Hard (senior signal, 45 minutes each):**

7. "Design an event-driven saga for our order fulfillment flow, handling partial failures" -- tests distributed systems thinking.

8. "This event handler processes messages out of order under load. Implement ordering guarantees" -- tests deep understanding of message queue semantics.

9. "Optimize this report query that times out on tables with 10M+ rows" -- tests database performance at scale.

Every question uses real patterns from the codebase with proprietary business logic stripped out. The domain is changed (a fintech order system becomes a generic order system) but the technical challenges — retry logic, idempotency, query optimization — are preserved exactly as they exist in the real code.

### Step 4: Generate Rubrics and Evaluation Guides

```text
Create scoring rubrics for each question. Include what a strong answer
looks like, common mistakes, and follow-up questions to probe deeper.
```

Each question gets a structured rubric so any interviewer on the team can evaluate consistently:

- **Expected approach:** what a strong candidate does first (reads existing patterns before writing code, asks clarifying questions, considers edge cases)
- **Key signals:** error handling, input validation, test coverage, idempotency awareness
- **Red flags:** ignoring validation, no error handling, hardcoded values, skipping edge cases
- **Follow-up questions:** 2-3 probing questions per problem to distinguish "memorized the pattern" from "understands the tradeoffs"
- **Time expectations:** how long each difficulty level should take a qualified candidate

The rubric transforms interviewing from "I liked this candidate's vibe" to "this candidate demonstrated 4 of 5 key competencies for the role." It also enables interviewers who are not experts in every area to evaluate effectively — a frontend-focused engineer can interview a backend candidate using the rubric because the expected answers and red flags are documented.

### Step 5: Create a Take-Home Assignment

```text
Create a simplified take-home assignment based on question #4. Strip
proprietary code, add a README with setup instructions, and include an
automated test suite that validates the submission.
```

The take-home packages question #4 (webhook processing with idempotency) into a self-contained repository:

- A README with clear setup instructions (one `docker-helper up` command)
- Boilerplate code with the webhook endpoint scaffolded
- A Stripe webhook simulator that sends test events
- An automated test suite (15 tests) that validates idempotency, error handling, and data consistency
- A time estimate: 2-3 hours for a mid-level candidate
- A `.env.example` with all required configuration pre-filled

The test suite runs with a single command and gives a clear pass/fail. Candidates who handle the happy path pass 8 tests. Candidates who also handle retries, duplicate events, and error recovery pass all 15. The score directly maps to the rubric.

The take-home is designed to be respectful of candidates' time. The README states the expected time (2-3 hours) and explicitly says not to spend more. The automated tests mean the team can evaluate submissions quickly — no more spending an hour per submission manually testing edge cases.

## Real-World Example

Aisha manages engineering at the startup and has been dreading the upcoming hiring round. Last time, she spent 15 hours writing interview materials that tested the wrong things. This time, she runs the agent against the codebase on a Monday and has a complete interview package by Tuesday: 9 questions, rubrics for every interviewer, and a take-home assignment with automated grading.

In the next hiring round, two candidates who would have failed LeetCode-style interviews excel on the practical questions. One implements the webhook handler with idempotency handling that is cleaner than the team's current implementation. The other spots a subtle race condition in the event handler question that a senior team member had missed.

Both candidates are hired. Both are productive within their first week because the interview problems mirrored the actual work — they already understood the patterns, the conventions, and the types of bugs that show up in production. The onboarding experience is noticeably different from previous hires who aced algorithm interviews but needed weeks to learn the event-driven architecture from scratch.

Aisha regenerates the questions quarterly as the codebase evolves — the team recently adopted a CQRS pattern for high-write endpoints, so the next batch of questions will include that pattern. She creates multiple variants of each question to prevent answer sharing between candidates, and calibrates difficulty by having existing team members time-test each question before using it in interviews.

The hiring process now has a data-driven feedback loop: every quarter, Aisha compares the interview scores of hired engineers against their performance reviews. The correlation between practical question scores and on-the-job performance is significantly stronger than the old LeetCode scores ever were.
