---
name: company-values
description: >-
  Define authentic company values that guide decisions and culture — not generic corporate
  platitudes but actionable principles. Use when: defining company culture, creating a values
  document, aligning a team around shared principles.
license: MIT
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: [company-values, culture, leadership, startup, team]
  use-cases:
    - "Define 5 actionable company values for a growing startup"
    - "Create a values document that actually influences daily decisions"
    - "Align a remote team around shared principles"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Company Values

## Overview

Help founders and leaders define authentic company values — the foundation of culture. Based on the philosophy of The Minimalist Entrepreneur by Sahil Lavingia. Values are not generic two-word commandments; they state the non-obvious in non-obvious ways. Focus on culture before hiring: before you hire anyone, define what kind of company people want to work for.

## Instructions

### Why Values Matter

- Values tell employees how to behave every day AND in extreme situations
- They're more efficient than 1,000-page manuals — good values stick in the brain
- They attract the right people and repel the wrong ones — both are valuable
- They let you hold yourself AND your team accountable
- Values supersede you. They allow the company to scale beyond your personal involvement.

### How to Create Values

Walk the user through these questions:

1. **What do you believe that most people don't?** Values should be non-obvious and sometimes polarizing.
2. **How should people behave when no one is watching?** Values are for the moments without a manager present.
3. **What would you fire someone for, even if they're performing well?** That reveals your true values.
4. **What would you celebrate, even if it didn't directly help the bottom line?** That's also a value.
5. **Write them as stories, not slogans.** "Focus on the user" is a slogan. Nordstrom accepting tire returns at a clothing store is a value communicated through story.

### Reference: Gumroad's Values

Use these as inspiration, not templates:

1. **Judged by the Work** — What matters is the experience creators and customers have. "It should be considered a failure to receive feedback on something that could have made a creator's life better AFTER you shipped."
2. **Seek Superlinearities** — Every day you are producing superlinear returns on your time investment. People may outgrow their role and leave to start their own company — that's great.
3. **Everyone is a CEO** — "Think like a CEO asking for approval from their board, not like an employee asking their manager for direction."
4. **Dare to Be Open** — Aim for complete information symmetry. Share financials, disclose salaries, make onboarding documents public.

### Operationalizing Values

- Communicate them publicly — in job posts, on your website, in your onboarding
- Use them in feedback: "This aligns with our value of X" or "This doesn't reflect our value of Y"
- Revisit them regularly — values evolve as your company grows

### Output Format

Help the user draft:
1. 3-5 company values with descriptions and example stories
2. How each value should show up in hiring decisions
3. How each value should show up in day-to-day work
4. Anti-patterns for each value (what it does NOT mean)

## Examples

### Example 1: Values for a Developer Tools Startup

**User prompt:** "We're a 6-person remote team building an open-source database tool. We need company values before we start hiring. We believe in transparency and shipping fast."

**Expected output:**

**Value 1: Ship It, Then Polish It**
We'd rather ship something imperfect today than something perfect next month. Our users are developers — they understand iteration. But "ship fast" doesn't mean "ship broken." Every release should work; it just doesn't need every feature.
- *In hiring:* Ask candidates about a time they chose speed over perfection. Look for thoughtfulness about the tradeoff, not recklessness.
- *In daily work:* PRs should be small and frequent. If a PR sits open for 3+ days, something is wrong.
- *Anti-pattern:* Shipping untested code or ignoring bug reports because "we'll fix it later."

**Value 2: Default to Public**
Code is open source. Roadmaps are public. Salaries are shared internally. If you're wondering whether to share something, share it. The only exceptions: user data and security vulnerabilities.
- *In hiring:* Candidates should be comfortable with public code reviews and open discussions.
- *In daily work:* Use public channels over DMs. Write decisions down in the open.
- *Anti-pattern:* Hoarding information to maintain power or influence.

**Value 3: Builders Over Managers**
Everyone writes code, talks to users, or creates content. We don't have people whose only job is to coordinate other people. If a process requires a full-time manager, the process is wrong.
- *In hiring:* Every role involves hands-on building. There is no "pure management" track.
- *In daily work:* Meetings are rare and short. Async updates replace standups.
- *Anti-pattern:* Creating layers of approval or requiring sign-off from multiple people.

### Example 2: Values for a Wedding Planning Service

**User prompt:** "I run Simply Eloped, a small wedding elopement company. We have 12 employees across 5 states. I want values that reflect our customer-first approach and adaptability."

**Expected output:**

**Value 1: Customer-Centric (the C in CACAO)**
Every decision starts with: "How does this affect the couple?" We exist to make the most important day of someone's life feel effortless. That means we answer texts at 9pm if a bride is anxious. It means we rebook a photographer when weather changes.
- *In hiring:* Ask "Tell me about a time you went beyond what was expected for someone." Look for genuine empathy, not rehearsed answers.
- *In daily work:* Respond to all customer inquiries within 2 hours during business hours.
- *Anti-pattern:* Hiding behind policy when a customer needs flexibility.

**Value 2: Adaptable (the second A in CACAO)**
Elopements happen on mountaintops, in city halls, and on beaches. No two are alike. We don't follow rigid playbooks — we read the room and adjust. When COVID hit, we pivoted to virtual witnesses within a week.
- *In hiring:* Look for people who thrive in ambiguity. Ask "What do you do when the plan falls apart?"
- *In daily work:* Coordinators have full authority to make on-the-spot decisions up to $500 without approval.
- *Anti-pattern:* Saying "that's not how we do it" without considering the specific situation.

## Guidelines

- Values should be non-obvious and specific to the company — if any company could claim the same value, it's too generic
- Each value needs a story or concrete example, not just a slogan
- 3-5 values is the sweet spot; more than 5 and nobody remembers them
- Values should sometimes be polarizing — if everyone agrees, the value isn't saying anything meaningful
- For remote teams, emphasize values around communication, autonomy, and accountability
- Revisit values annually — they should evolve as the company grows
- Values are useless if not operationalized in hiring, feedback, and daily decisions
