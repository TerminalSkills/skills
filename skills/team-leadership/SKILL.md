---
name: team-leadership
description: >-
  Lead teams effectively using proven frameworks — set clear intent, reduce communication
  overhead, create psychological safety, and use forcing functions to drive results.
  Use when: managing teams, improving team collaboration, setting goals and accountability.
license: Apache-2.0
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: [leadership, team-management, communication, goals, culture]
  use-cases:
    - "Write a commander's intent document that aligns a remote team on priorities"
    - "Reduce meeting time by 50% by applying communication overhead principles"
    - "Create forcing functions that guarantee project milestones are hit"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Team Leadership

## Overview

Managing a team isn't about telling people what to do. It's about defining the desired outcome clearly, reducing the friction of working together, and creating structures that make success the default path.

This skill covers the most actionable leadership frameworks from the Personal MBA: Commander's Intent, Communication Overhead, the Golden Trifecta, Earned Regard, Forcing Functions, and Bystander Apathy.

## Instructions

When a user asks about team management, improving collaboration, setting goals, running meetings, or creating accountability, apply these frameworks.

### Framework 1: Commander's Intent

**Definition:** Define the desired END STATE and let the team figure out HOW to get there.

The military invented this concept because battle plans fall apart on first contact with the enemy. Instead of detailed step-by-step orders that become obsolete immediately, commanders communicate intent: "We need to control that bridge by dawn. Use your judgment on how to get there."

**Format for Commander's Intent:**
```
SITUATION: [What's happening and why this matters]
INTENT: [The end state we need to achieve]
SUCCESS LOOKS LIKE: [Measurable criteria — how we know we're done]
CONSTRAINTS: [What we must NOT do / non-negotiables]
RESOURCES: [What the team has available]
TIMELINE: [When this needs to be done]
```

**Example for a product launch:**
```
SITUATION: We're launching the new pricing page next week. Current page converts
at 2.1%. Marketing has already scheduled campaigns driving 50k visits.

INTENT: Maximize trial signups from the pricing page during launch week.

SUCCESS LOOKS LIKE:
  - Trial signup rate > 4% (double current)
  - Page load time < 2 seconds
  - Zero broken payment flows
  - All 3 plans clearly differentiated

CONSTRAINTS:
  - Don't change actual prices (already approved by leadership)
  - Don't remove the enterprise "Contact Us" option
  - Must be mobile-responsive

RESOURCES: 2 frontend devs, 1 designer, access to A/B testing tool

TIMELINE: Live by Monday 9 AM EST. Test on staging by Friday.
```

**Why this works:** The team has full context (why), clear success criteria (what), explicit boundaries (what not), and autonomy (how). They'll make better decisions than you could micromanage, because they're closer to the implementation details.

### Framework 2: Communication Overhead

**Definition:** Communication overhead grows with the formula n × (n-1) / 2, where n is team size.

| Team Size | Communication Channels | Complexity |
|-----------|----------------------|------------|
| 3 | 3 | Manageable |
| 5 | 10 | Getting complex |
| 8 | 28 | Significant overhead |
| 12 | 66 | Meeting hell |
| 20 | 190 | Bureaucratic paralysis |

**This is why adding people slows teams down.** Every new person adds channels to every existing person.

**Reducing communication overhead:**

1. **Small teams** — Amazon's "two-pizza rule." If a team can't be fed with two pizzas, it's too big. Ideal: 3-5 people per team.

2. **Async by default** — Most communication doesn't need to be real-time.
   - Use: Written docs, Slack threads, Loom videos, PRs with comments
   - Reserve sync (meetings) for: decisions that need debate, relationship building, complex problem-solving

3. **Reduce meeting count and size:**
   - Every meeting needs: agenda, owner, time limit, documented decisions
   - Max 5 people in a decision meeting. Others get the notes.
   - Cancel recurring meetings quarterly. Re-add only the ones people miss.
   - Standing meetings should be 15 minutes max unless they're workshops.

4. **Single source of truth** — One place for project status, one place for decisions, one place for specs. When information lives in 5 Slack channels and 3 docs, people spend more time searching than working.

5. **Communication protocols:**
   ```
   Urgent + important:    Call or direct message with "URGENT:" prefix
   Important, not urgent:  Email or Slack thread (24-hour response expectation)
   FYI / async update:    Doc update or async standup
   Discussion needed:      Schedule a 15-min meeting with agenda
   ```

### Framework 3: The Golden Trifecta

**Definition:** Every healthy team interaction is built on three things:
1. **Appreciation** — Acknowledge people's contributions genuinely
2. **Courtesy** — Treat people with basic respect, always
3. **Respect** — Value their expertise and autonomy

**This sounds obvious. It's not.** Under pressure, leaders:
- Skip appreciation ("we don't have time for pats on the back")
- Drop courtesy ("just fix it, I don't care how")
- Undermine respect ("let me just do it myself")

**Practical application:**
- Start every 1:1 with something specific the person did well. Not "good job" — "the way you structured the database migration plan saved us a week of work."
- Say "thank you" in public (team channel), give constructive feedback in private (DM or 1:1).
- When you disagree, say "help me understand your reasoning" not "that's wrong."
- Never take credit for team work. Always attribute it: "Sarah's idea for X led to Y result."

### Framework 4: Earned Regard

**Definition:** Respect and influence are earned through demonstrated competence, not title or authority.

**Two types of regard:**
1. **Competence-based** — "They're really good at what they do"
2. **Character-based** — "They always follow through on what they say"

**How leaders earn regard:**
- **Deliver on promises.** Say what you'll do, then do it. Every time. The fastest way to lose a team is broken promises.
- **Be competent at SOMETHING the team values.** You don't need to be the best engineer, but you need to understand what good looks like.
- **Protect the team.** Shield them from organizational politics, unreasonable requests, and scope creep. They'll notice.
- **Admit mistakes publicly.** "I made the wrong call on X. Here's what I learned. Here's what we'll do differently." This builds more trust than never being wrong.

### Framework 5: Forcing Functions

**Definition:** Structures that FORCE action to happen, removing the option to procrastinate or avoid.

**Examples of forcing functions:**

1. **Public demos** — Schedule a demo for Friday at 3 PM. The team will ship something by Thursday night. No demo scheduled? "We'll ship when it's ready" (never).

2. **Deadlines with consequences** — "The campaign launches March 1st, with or without the new feature." Real deadlines with external dependencies are more powerful than internal ones.

3. **Ship-or-kill meetings** — Monthly review: every project either shows measurable progress or gets killed. No zombie projects allowed.

4. **Standup check-ins** — "What did you finish yesterday? What will you finish today?" Emphasis on FINISH, not "worked on."

5. **Pre-mortems** — Before starting a project: "Imagine it's 3 months from now and this project failed. Why?" Forces the team to think about risks upfront.

6. **Budget constraints** — "You have $5,000 and 2 weeks." Constraints breed creativity. Unlimited resources breed bloat.

**Why forcing functions work:** They replace motivation (unreliable) with structure (reliable). You don't need the team to WANT to ship on time — you need a system that makes shipping the default outcome.

### Framework 6: Bystander Apathy

**Definition:** When responsibility isn't assigned to a specific person, nobody acts. "Someone should fix this" means nobody will fix this.

**The rule: Every task needs exactly ONE owner.**

Not a team, not a channel, not "whoever gets to it." One person's name attached to one outcome.

**Bad:**
```
Action items:
  - Improve onboarding flow
  - Fix the billing bug
  - Update the docs
```

**Good:**
```
Action items:
  - Sarah: Improve onboarding flow → new design by Wed
  - Marcus: Fix billing bug → PR merged by Thursday
  - Priya: Update API docs for v2 → published by Friday EOD
```

**In meetings:** End every meeting with: "Who owns this? By when?" If the answer isn't clear, the meeting was wasted.

## Examples

### Example 1: Write a Commander's Intent for a migration project

**User request:** "We need to migrate from Heroku to AWS. How do I communicate this to my team of 4?"

**Output:**
```
Commander's Intent: Heroku → AWS Migration

SITUATION:
Our Heroku costs have grown to $4,200/month. Equivalent AWS infrastructure
is estimated at $1,100/month. We also need auto-scaling for traffic spikes
that Heroku can't handle well. This migration is our Q2 priority.

INTENT:
Move our entire production stack from Heroku to AWS with zero customer
downtime and no data loss.

SUCCESS LOOKS LIKE:
  - All services running on AWS with health checks green
  - Response time equal or better than Heroku baseline (p95 < 200ms)
  - Zero customer-visible downtime during migration
  - Monthly infrastructure cost < $1,500
  - CI/CD pipeline deploys to AWS automatically
  - Rollback plan tested and documented

CONSTRAINTS:
  - No customer downtime (use blue-green deployment)
  - Don't change the API contracts — clients shouldn't notice
  - Keep Heroku running in parallel for 2 weeks post-migration (safety net)
  - Don't optimize infrastructure yet — mirror current setup first, optimize later

RESOURCES:
  - 4 engineers (full-time for 3 weeks)
  - $2,000 budget for parallel running costs
  - AWS credits: $5,000 available

TIMELINE:
  - Week 1: Staging environment on AWS, all services running
  - Week 2: Data migration strategy tested, blue-green deployment ready
  - Week 3: Production cutover (Wednesday, lowest traffic day)
  - Week 4-5: Monitoring period, Heroku decommission

OWNER: [Lead engineer name]
```

### Example 2: Reduce meeting overhead for a growing team

**User request:** "My team grew from 5 to 12 people. We now spend 3+ hours/day in meetings and nothing gets done."

**Output:**
```
Meeting Overhead Diagnosis:

  Problem: Communication channels went from 10 (5 people) to 66 (12 people).
  6.6x more channels but probably only 2.4x more meetings — meaning those
  meetings are larger, longer, and less productive.

  Immediate Actions (implement this week):

  1. SPLIT INTO SUB-TEAMS
     - 2 teams of 5-6 with clear ownership areas
     - Each team has their own standup, their own planning
     - Cross-team sync: 1 meeting per week, 30 min, leads only

  2. AUDIT ALL RECURRING MEETINGS
     For each meeting, ask: "If we cancel this forever, what breaks?"
     If the answer is "nothing" or "we'd just use Slack" — cancel it.

     Likely survivors:
       - Team standup: 15 min, per sub-team, async option available
       - Sprint planning: 1 hr, bi-weekly
       - Cross-team sync: 30 min, weekly, leads only
       - 1:1s: 30 min, weekly (don't cut these)

     Likely cuts:
       - All-hands standup with 12 people (replace with async update)
       - "Sync" meetings that are actually status updates (use a doc)
       - Meetings without an agenda (no agenda = no meeting)

  3. MEETING RULES
     - Max 5 people in any decision meeting. Others get notes.
     - Every meeting has a written agenda shared 1 hour before.
     - Meetings end with: action items, owners, deadlines — written down.
     - Default meeting: 25 min (not 30). Default longer meeting: 50 min (not 60).
     - No-meeting mornings (8 AM - 12 PM): deep work time.

  Expected result: 3+ hrs/day → ~1.5 hrs/day of meetings.
  That's 7.5 extra hours of productive work per person per week.
  For 12 people: 90 hours/week reclaimed.
```

## Guidelines

- Commander's Intent should always include CONSTRAINTS (what NOT to do). Autonomy without boundaries is chaos.
- When discussing communication overhead, always calculate the actual number of channels (n×(n-1)/2) to make the problem tangible.
- Forcing functions should feel natural, not punitive. Public demos are exciting, not stressful, when the scope is right.
- Every action item needs exactly ONE owner and a deadline. "The team will handle it" means nobody will handle it.
- The Golden Trifecta sounds soft but is the #1 predictor of team retention. People don't leave companies, they leave managers who don't appreciate, respect, or show courtesy.
- Prefer async communication for information sharing. Reserve sync (meetings) for decisions and debates.
