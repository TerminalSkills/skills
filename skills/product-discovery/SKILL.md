---
name: product-discovery
description: Expert guidance for product discovery, the continuous process of deciding what to build based on evidence rather than opinions. Helps product teams identify assumptions, design experiments, conduct user interviews, build opportunity solution trees, and prioritize what to validate next — following frameworks from Teresa Torres (Continuous Discovery Habits) and Alberto Savoia (The Right It).
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: business
  tags:
  - discovery
  - assumptions
  - experiments
  - user-research
  - teresa-torres
---

# Product Discovery — From Assumptions to Evidence


## Overview


Product discovery, the continuous process of deciding what to build based on evidence rather than opinions. Helps product teams identify assumptions, design experiments, conduct user interviews, build opportunity solution trees, and prioritize what to validate next — following frameworks from Teresa Torres (Continuous Discovery Habits) and Alberto Savoia (The Right It).


## Instructions

### Opportunity Solution Tree

```markdown
## Build an Opportunity Solution Tree (OST)

An OST connects a desired outcome to the opportunities, solutions, and experiments
that could achieve it. It prevents solution-first thinking by forcing you to
map the problem space before jumping to features.

### Step 1: Define the Desired Outcome
Start with a measurable business or product outcome:
- "Increase 7-day retention from 35% to 50%"
- "Reduce time-to-first-value from 15 min to 3 min"
- "Increase monthly expansion revenue by 20%"

### Step 2: Map Opportunities
Opportunities are unmet needs, pain points, or desires discovered through research.
They are NOT solutions.

❌ Bad opportunity: "Add onboarding wizard" (this is a solution)
✅ Good opportunity: "New users don't understand the core value in the first session"

Interview questions to discover opportunities:
- "Walk me through the last time you [did the thing]. What was hardest?"
- "What workarounds have you built?"
- "If you could wave a magic wand, what would change?"

### Step 3: Generate Solutions per Opportunity
For each opportunity, brainstorm multiple solutions (minimum 3).
Avoid anchoring on the first idea.

Opportunity: "Users don't understand core value in first session"
  → Solution A: Interactive product tour
  → Solution B: Template gallery with pre-built examples
  → Solution C: AI-assisted setup that auto-configures based on use case
  → Solution D: 2-minute video showing "aha moment" before signup

### Step 4: Design Assumption Tests
For each solution, identify the riskiest assumption and design
the cheapest experiment to test it.

Solution: "AI-assisted setup"
  Riskiest assumption: "Users will trust AI to configure their workspace"
  Experiment: Wizard of Oz — show AI suggestions but have a human generate them
  Success metric: >60% of users accept AI suggestions without modification
  Duration: 1 week, 50 users
```

### Assumption Mapping

```markdown
## Map and Prioritize Assumptions

Every product idea is a bundle of assumptions. Most teams build the whole thing
and discover which assumptions were wrong after launch. Discovery teams test
assumptions before building.

### Assumption Categories

**Desirability** (Do people want this?)
- Users have this problem frequently enough to pay for a solution
- The problem is painful enough that users will switch from their current solution
- Users are willing to change their workflow

**Viability** (Can the business sustain this?)
- We can acquire users at a CAC below $X
- Users will pay $Y/month for this
- This will generate enough revenue to justify development cost

**Feasibility** (Can we build this?)
- We can build this in <X weeks with current team
- The technology exists to do this at the required scale
- We can integrate with the required third-party APIs

**Usability** (Can people use this?)
- Users can complete the core workflow without training
- Users understand the terminology and interface
- Users can set up the product in <10 minutes

### Prioritize: Risk × Impact Matrix

Plot each assumption on a 2×2 matrix:
- X-axis: How confident are we? (high confidence → low risk)
- Y-axis: How critical is this? (if wrong, does the whole idea fail?)

Test the HIGH RISK + HIGH IMPACT assumptions first.
Don't waste time validating things you're already confident about.
```

### Experiment Design

```markdown
## Design Experiments (Cheapest Test First)

### Experiment Ladder (from cheapest to most expensive)

1. **Desk Research** (hours, $0)
   Search for existing data: analytics, support tickets, competitor reviews
   "Do users actually complain about this? What do Intercom tickets say?"

2. **One-Question Survey** (1 day, $0)
   Ask existing users a single question via in-app prompt
   "How do you currently handle [problem]?"

3. **Smoke Test / Fake Door** (2-3 days, $0)
   Add a button/link for the feature. Track clicks. Don't build the feature.
   Success: >5% click-through rate from relevant page

4. **Landing Page Test** (3-5 days, ~$200 ads)
   Build a landing page describing the solution. Drive traffic. Measure signups.
   Success: >3% conversion from visitor to signup

5. **Wizard of Oz** (1-2 weeks, $0)
   Deliver the experience manually behind the scenes. Users think it's automated.
   Test: "Will users actually use this if it exists?"

6. **Concierge MVP** (2-4 weeks, $0)
   Deliver the service manually, one customer at a time.
   Learn the workflow deeply before automating.

7. **Prototype Test** (1-2 weeks)
   Build a clickable prototype (Figma). Test with 5 users.
   Measure: task completion rate, time-on-task, confusion points

8. **Feature Flag MVP** (2-4 weeks)
   Build the simplest version. Release to 5% of users. Compare metrics.
   This is the first time you write production code.

### Experiment Brief Template

**Hypothesis**: We believe [solution] will [outcome] for [users]
**Riskiest assumption**: [what must be true for this to work]
**Experiment type**: [from the ladder above]
**Success metric**: [specific, measurable threshold]
**Sample size**: [how many users/responses needed]
**Duration**: [time to run the experiment]
**Decision**: If success → [next step]. If fail → [pivot/kill/iterate]
```

### User Interview Guide

```markdown
## Conduct Discovery Interviews

### Rules
1. Ask about past behavior, not future intentions
   ❌ "Would you use a feature that..."
   ✅ "Tell me about the last time you..."

2. Ask open questions, not leading ones
   ❌ "Don't you think it would be better if..."
   ✅ "How do you handle that today?"

3. Listen for workarounds — they reveal unmet needs
   "I export to Excel and then manually..." = opportunity

4. Get specific stories, not generalizations
   ❌ "Do you usually..."
   ✅ "Walk me through the most recent time you..."

### Interview Script Template

**Opening (2 min)**
"Thanks for joining. I'm researching how people [context]. There are no right
or wrong answers — I'm here to learn from your experience."

**Context (5 min)**
"Tell me about your role. How does [topic] fit into your day-to-day?"
"How often do you [activity]?"

**Story Mining (15 min)**
"Walk me through the last time you [did the thing]."
"What happened next?"
"What was the hardest part?"
"How did you work around that?"
"How much time did that take?"

**Pain Discovery (5 min)**
"If you could change one thing about this process, what would it be?"
"Have you tried any other tools/approaches? What happened?"

**Closing (3 min)**
"Is there anything I should have asked but didn't?"
"Would you be open to trying a prototype if we build something?"

### After the Interview
- Summarize within 1 hour (memory fades fast)
- Extract: opportunities, quotes, workarounds, emotional moments
- Tag by theme
- After 5 interviews: cluster opportunities, update OST
```

### Continuous Discovery Cadence

```markdown
## Weekly Discovery Rhythm

**Monday**: Review last week's experiment results. Update OST.
**Tuesday-Wednesday**: Conduct 2-3 user interviews (30 min each).
**Thursday**: Synthesize interviews. Identify new opportunities.
**Friday**: Design next experiment. Write experiment brief.

### Quarterly Review
- How many assumptions did we test? (target: 10-15/quarter)
- What did we learn that changed our roadmap?
- Which opportunities are validated vs invalidated?
- Update the OST with new evidence.
```


## Examples


### Example 1: Creating a opportunity solution tree for a new product

**User request:**

```
We're launching a project management tool for remote design teams. Help me create a opportunity solution tree.
```

The agent applies the Product Discovery framework, asking clarifying questions about target audience, market positioning, and business model. It produces a structured deliverable with specific, actionable recommendations tailored to the design-tools market, including competitive positioning and key metrics to track.

### Example 2: Designing experiments to test assumptions

**User request:**

```
We assume enterprise teams will pay $200/month for our reporting feature. Design experiments to validate this before we build it.
```

The agent analyzes the existing work against product discovery best practices, identifies missing elements, weak assumptions, and areas that need validation. It provides specific suggestions with reasoning, not generic advice, referencing the frameworks and patterns from the instructions above.


## Guidelines

1. **Talk to users weekly** — Continuous discovery means continuous contact; 2-3 interviews per week is the minimum cadence
2. **Test assumptions, not ideas** — Break every idea into assumptions; test the riskiest one first with the cheapest experiment
3. **Opportunity Solution Tree** — Map outcomes → opportunities → solutions → experiments; it prevents solution-first thinking
4. **Cheapest test first** — Start with desk research and surveys before building prototypes; most assumptions can be tested without code
5. **Compare, don't ask** — Show users alternatives instead of asking "would you use this?"; behavior reveals preferences better than opinions
6. **Time-box experiments** — Every experiment has a deadline and a success metric defined before it starts; no open-ended exploration
7. **Kill ideas fast** — If the riskiest assumption fails, kill the idea; don't rationalize sunk cost
8. **Document everything** — Record interviews, tag quotes, track experiment results; your discovery log is the evidence base for every product decision
