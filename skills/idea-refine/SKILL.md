---
name: idea-refine
description: >-
  Turns a rough product or feature idea into a one-page concept brief: the problem stated as a job to be done, a handful of real alternatives, an evidence-weighted comparison, the riskiest assumptions with the cheapest test for each, and a first version small enough to build. Use when a user says "help me refine this idea", "is this worth building", "stress-test my plan", "poke holes in this", "which of these directions should I pick" or "what is the smallest version of this".
license: Apache-2.0
compatibility: "No tools required. Reads the repository when the idea is a feature of an existing product, and uses web search to look for existing alternatives when the agent has it."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: productivity
  tags: ["ideation", "product-discovery", "assumption-testing", "prioritization", "mvp"]
---

# Idea Refine

## Overview

Most ideas arrive as a solution ("an app that…") with the problem, the user and the evidence left implicit. Refining an idea means making those explicit, widening the set of options before judging any of them, judging on evidence instead of enthusiasm, and cutting the result down to something that can be tested in days.

The work alternates between opening up and narrowing down, the shape the Design Council's Double Diamond describes: discover the problem, define it, develop options, then deliver by testing them small and keeping what works. It borrows a few standard tools along the way: a job story to state the problem, SCAMPER to generate alternatives, a desirability / feasibility / viability score or RICE to compare them, and a pre-mortem to find the weak points.

The deliverable is a concept brief of about one page. A conversation without that page is not finished.

## Instructions

### 1. Get the facts before giving opinions

Ask these in one message and wait for the answers. Do not generate options first.

1. Who has this problem? A person in a situation ("a freelance translator at month end"), not a segment ("SMBs").
2. What do they do about it today? Doing nothing, a spreadsheet and a competitor all count.
3. What have you seen that makes you believe this? Say how many people, and whether it was something they did or something they said.
4. What result would make this a success, as a number with a date?
5. What is fixed: time, people, money, technology, anything already promised?

If the idea is a feature of an existing product, read the repository before asking: the README, the data model, the routes or screens nearest to the idea, and any usage numbers the user can share. Ask only what the code does not answer. When web search is available, look for existing products that do the same job and list them with links; never state a market size or a competitor's numbers from memory.

An unanswered question 1 or 2 is not a blocker. It becomes the first assumption to test in step 5.

### 2. State the problem as a job story

Write one sentence and get the user's agreement before continuing:

```text
When [situation], [who] wants to [motivation], so they can [outcome].
Today they [current alternative], which falls short because [gap].
```

The sentence must not contain the solution. "When a project ends, a freelance translator wants to bill it the same day, so she is paid within the month" is a problem. "Translators need an invoicing app" is a solution.

### 3. Widen: five to seven different options

Always include the user's original idea, the smallest thing that could serve the job, and a version with no software (a manual service, a template, a checklist). Fill the rest by running the original idea through SCAMPER and keeping only results that are different in kind:

| Prompt | Question to ask of the idea |
|---|---|
| Substitute | What if a different person, channel or data source did this part? |
| Combine | Which tool the user already opens every day could this live inside? |
| Adapt | Who solved the same job in another field, and how? |
| Modify | What if it ran ten times more often, or once a year? |
| Put to another use | Who else has this job and is easier to reach? |
| Eliminate | Which step can go entirely, including the interface? |
| Reverse | What if the other party did the work, or the order were flipped? |

Give each option one line: what it is, who it serves best, and the one thing that must be true for it to work. Then stop and let the user react; they often add the option that wins.

### 4. Judge on evidence

For a new product, score every option from 1 to 5 on three questions and note what each score rests on:

- **Desirability**: do people want it enough to change what they do today?
- **Feasibility**: can this team build and run it with what it has?
- **Viability**: does it pay for itself, or serve the stated goal, at this scale?

A score that rests on an assumption instead of something observed cannot be higher than 3. Add the three numbers; treat differences of one point as a tie and decide ties by which option is cheapest to test.

For a feature in a product that has usage data, use RICE instead: Reach (people or events per quarter) × Impact (3 massive, 2 high, 1 medium, 0.5 low, 0.25 minimal) × Confidence (100%, 80% or 50%) ÷ Effort (person-months). Take reach from real counts, not estimates.

Then run a pre-mortem on the leading option: "It is six months from now and this failed. What are the three to five most likely reasons?" Each reason becomes either an assumption to test or a change to the scope. Say plainly when an option is weak, when the original idea loses to a simpler one, or when nothing on the table is worth building. Agreement the evidence does not support is a defect in the output.

### 5. Find the riskiest assumptions and the cheapest tests

Write each belief the chosen direction depends on as "We believe that …". Rank by how much breaks if it is false and how little evidence there is. Test the top one to three before building, and fix the pass mark before running the test.

| The assumption is about | Cheapest honest test | Example pass mark |
|---|---|---|
| The problem exists | Five conversations about the last time it happened | 4 of 5 describe it unprompted and have tried a workaround |
| People want this solution | A page describing it with a sign-up, or a button for the feature that records clicks and says "coming soon" | 8% of 400 visitors leave an email |
| People will pay | A price on the page, a pre-order, a signed letter of intent | 5 deposits at the planned price |
| We can deliver the value | Do it by hand for three customers before automating | All three get the result within 48 hours |
| It is technically possible | A time-boxed spike on the hardest part | Works on real data within two days |

What people did (signed up, paid, built a workaround) outweighs what they say they would do. In conversations ask about the last specific occasion, never "would you use this?".

### 6. Cut the first version

One user, one job, one path from start to finish. Sort everything else into Later (wanted, not needed to learn) and Left out (with the reason). Give the first version a time box; if it does not fit, cut scope, not quality of the one path. Add stop conditions: the result that would make the user drop or change the idea.

### 7. Write the brief

Produce this as Markdown in the reply. Save it to a file only when asked, in the place the project already keeps product notes.

```markdown
# Concept brief: [name]

Date: [today, YYYY-MM-DD] · Status: draft · Owner: [person]

## Problem
[Job story, two sentences.]

## Evidence
| Claim | Source | Seen or assumed |
|---|---|---|

## Options compared
| Option | D | F | V | Total | Rests on |
|---|---|---|---|---|---|

## Direction
[The chosen option and the reason, in under 120 words. Name what lost and why.]

## Assumptions and tests
| We believe that | Test | Pass mark | Cost | By |
|---|---|---|---|---|

## First version
In: … Later: … Left out: … (reason)

## Success and stop conditions
Success: [number by date]. Stop or rethink if: [observable result].

## Unknowns
[What nobody in the conversation could answer, and who can.]
```

## Examples

### Example 1: a product idea with thin evidence

Request: "I want to build an app that reminds freelancers to send invoices. Help me refine it."

Answers to step 1: freelance translators like the user, Mira; today they scroll back through their calendar at month end; she and three colleagues each forgot to bill at least one job last quarter; success is 30 paying users at €6 a month by 31 March 2027; she can spend evenings for eight weeks and writes Python.

```markdown
# Concept brief: Unbilled

Date: 2026-10-01 · Status: draft · Owner: Mira Halloran

## Problem
When a job is delivered, a freelance translator wants to bill it the same day, so she is paid within the month. Today she rebuilds the list from her calendar at month end, which falls short because small jobs get missed and invoices go out weeks late.

## Evidence
| Claim | Source | Seen or assumed |
|---|---|---|
| Jobs go unbilled | Mira and 3 colleagues each missed at least one last quarter | Seen (4 people) |
| Translators would pay €6 a month | None | Assumed |
| Calendar entries identify billable work | Mira's own calendar | Seen (1 person) |

## Options compared
| Option | D | F | V | Total | Rests on |
|---|---|---|---|---|---|
| Reminder app with push notifications | 3 | 4 | 2 | 9 | Assumed: people install an app for this |
| Friday email listing calendar events with no invoice | 4 | 5 | 3 | 12 | Seen: the calendar is already the record |
| Plug-in inside the invoicing tool they use | 3 | 2 | 3 | 8 | Four colleagues use three different tools |
| Done-for-you: a person sends the invoices | 4 | 5 | 2 | 11 | Does not reach 30 users on evenings alone |
| Do nothing | 1 | 5 | 1 | 7 | The problem already costs money |

## Direction
The Friday email. It needs no app, no new habit and no invoicing features, and it can be delivered by hand first. The reminder app loses because it asks for an install and a daily habit to fix a monthly problem. The done-for-you service is within a point; use it as the test, not the product.

## Assumptions and tests
| We believe that | Test | Pass mark | Cost | By |
|---|---|---|---|---|
| Translators outside Mira's circle miss jobs too | Ask 5 translators from the regional association about their last month end | 4 of 5 name a missed or late invoice | 3 evenings | 15 Oct |
| A weekly list makes them bill sooner | Send the list by hand to 5 people for 4 weeks | 4 of 5 invoice within 3 days of the email | 1 hour a week | 15 Nov |
| They will pay €6 a month | Ask the 5 for a €6 payment to continue | 3 of 5 pay | None | 22 Nov |

## First version
In: connect one Google calendar, mark events as billable, Friday email of unbilled events, "billed" link. Later: other calendars, invoice drafts. Left out: sending invoices (every user already has a tool), mobile app (email reaches them already).

## Success and stop conditions
Success: 30 paying users by 31 March 2027. Stop or rethink if: fewer than 4 of 5 interviewees have the problem, or fewer than 3 of 5 pay after the hand-run month.

## Unknowns
Whether agencies, not freelancers, are the buyer. Ask the two agency owners Mira works for.
```

### Example 2: a feature in an existing product, compared with RICE

Request: "We want to add AI summaries to the support inbox. Stress-test it." The agent read the repository (`tickets`, `messages` and `macros` tables) and asked for last quarter's counts: 3,600 tickets, 22% of them longer than six messages, 35% matching one of ten repeated questions.

| Option | Reach per quarter | Impact | Confidence | Effort (person-months) | Score |
|---|---|---|---|---|---|
| A. Summary at the top of long threads | 792 | 1 | 80% | 1.5 | 422 |
| B. Drafted reply on every ticket | 3,600 | 2 | 50% | 4 | 900 |
| C. Saved replies for the ten repeated questions | 1,260 | 2 | 80% | 1 | 2,016 |

```text
Verdict: build C first. It is not the idea you brought, and it uses no model at all, but it removes the
most work per month of effort and the macros table already exists. A helps only on the 22% of tickets that are long.
B has the largest reach and the least evidence: nobody has measured whether agents accept drafted replies.

Pre-mortem on C, six months out:
1. Agents do not find the saved reply in time -> suggest it from the ticket subject (in scope).
2. The ten questions drift -> review the list monthly from ticket tags (process, not code).
3. Replies sound canned and satisfaction drops -> track CSAT on tickets answered with a saved reply.

Riskiest assumption: agents will use a suggested reply instead of typing.
Test: hand three agents a document with the ten replies for one week. Pass mark: used on half of matching tickets.
Revisit A and B after C ships, with the acceptance data in hand.
```

## Guidelines

- Never invent evidence. Market sizes, conversion rates and competitor facts are either cited with a link, supplied by the user, or labelled as assumptions.
- Scores are a way to expose reasoning, not a calculation of truth. Show what each number rests on, and do not let a total decide when the inputs are guesses.
- Keep the option list to seven or fewer. Twenty shallow variations hide the two that matter.
- A test without a pass mark set in advance will be read as a success whatever happens.
- Do not polish the brief past one page. Detail belongs in the specification that follows a passed test.
- Two rounds of questions is the limit before producing something. If the user cannot say who the idea is for, write the brief with that as the first assumption.
- Not the right tool when the decision is already made and the user needs a specification or task breakdown, when the question is purely technical (which database, which framework), or for naming and branding work.
