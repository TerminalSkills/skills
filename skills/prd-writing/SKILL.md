---
name: prd-writing
description: Expert guidance for writing Product Requirements Documents (PRDs), helping product managers create clear, actionable specs that align engineering, design, and stakeholders. The agent produce PRDs that define the problem, success metrics, scope, user stories, edge cases, and launch criteria — without over-specifying implementation details.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: business
  tags:
  - prd
  - requirements
  - specification
  - user-stories
  - acceptance-criteria
---

# PRD Writing — Product Requirements Documents


## Overview

You are an expert in writing Product Requirements Documents (PRDs), helping product managers create clear, actionable specs that align engineering, design, and stakeholders. You produce PRDs that define the problem, success metrics, scope, user stories, edge cases, and launch criteria — without over-specifying implementation details.

## Instructions

### PRD Template

```markdown
## PRD: [Feature Name]

**Author**: [PM name]
**Status**: Draft | Review | Approved
**Last updated**: [date]
**Engineering lead**: [name]
**Design lead**: [name]

---

### 1. Problem Statement

**What problem are we solving?**
[2-3 sentences. Describe the user pain point, not the solution.]

**Who has this problem?**
[Target user segment. Reference ICP or persona.]

**How do we know this is a problem?**
[Evidence: user interviews, support tickets, analytics data, competitor analysis]
- 42% of new users drop off at step 3 of onboarding (Mixpanel)
- 15 support tickets/week asking "how do I..." (Intercom)
- 3/5 interviewed users described this as their biggest frustration

**What happens if we don't solve this?**
[Business impact: churn risk, lost revenue, competitive disadvantage]

---

### 2. Goals and Success Metrics

**Primary metric**: [The one number that tells us if this worked]
- Reduce onboarding drop-off from 42% to 20% within 30 days of launch

**Secondary metrics**: [Supporting signals]
- Time-to-first-value decreases from 15 min to 5 min
- Support tickets for "how do I..." decrease by 50%

**Counter-metrics**: [Metrics we don't want to hurt]
- Activation quality stays constant (D30 retention doesn't drop)
- Page load time stays under 2 seconds

**Non-goals**: [Explicitly out of scope]
- We are NOT redesigning the entire onboarding flow
- We are NOT building a help center (separate initiative)
- We are NOT targeting enterprise users with this iteration

---

### 3. Solution Overview

[High-level description of the solution. 3-5 sentences.
Include a link to the design mockups/prototype.]

Design: [Figma link]
Prototype: [link]

---

### 4. User Stories

**As a** new user who just signed up,
**I want to** see a guided setup wizard,
**so that** I can configure my workspace without reading documentation.

**Acceptance criteria**:
- [ ] Wizard appears on first login only
- [ ] Wizard has 3 steps: profile, workspace, first project
- [ ] User can skip wizard at any step (but we track skip rate)
- [ ] Progress is saved — if user leaves mid-wizard, they resume where they left off
- [ ] Wizard completes in under 3 minutes for 90% of users

---

**As a** new user who skipped the wizard,
**I want to** access the wizard again from settings,
**so that** I can complete setup when I'm ready.

**Acceptance criteria**:
- [ ] "Complete setup" link visible in settings until wizard is done
- [ ] Resuming wizard starts from the first incomplete step

---

### 5. Detailed Requirements

#### 5.1 Step 1: Profile Setup
- Display name (required, max 50 chars)
- Avatar upload (optional, max 5MB, jpg/png/webp)
- Role selection: dropdown with "Developer", "Designer", "PM", "Other"
- "Other" shows a free-text field

#### 5.2 Step 2: Workspace Configuration
- Workspace name (required, auto-suggested from company email domain)
- Invite teammates (optional, email input, max 10 invites in wizard)
- Skip sends user to step 3 without inviting

#### 5.3 Step 3: First Project
- Offer 3 template options: "Blank", "Marketing Website", "SaaS App"
- Selecting a template creates a project with pre-configured tasks
- "Blank" creates an empty project

---

### 6. Edge Cases and Error Handling

| Scenario | Expected behavior |
|----------|------------------|
| User refreshes mid-wizard | Resume from current step |
| User has slow connection | Show loading state, retry on timeout |
| Avatar upload fails | Show error, allow retry, don't block progress |
| Email invite is invalid format | Inline validation, highlight field |
| User already has a workspace (re-signup) | Skip workspace step |
| Browser back button during wizard | Navigate to previous step |

---

### 7. Technical Considerations

- Wizard state stored in localStorage (offline-friendly) + synced to API
- Template creation is async — show optimistic UI, handle failure gracefully
- Track wizard events: step_viewed, step_completed, step_skipped, wizard_completed
- Feature flag: `onboarding_wizard_v2` (gradual rollout)

---

### 8. Launch Plan

**Rollout**:
1. Internal dogfood (1 week)
2. 10% of new signups (1 week, monitor metrics)
3. 50% → 100% if metrics look good

**Launch criteria (go/no-go)**:
- [ ] All acceptance criteria pass QA
- [ ] No P0/P1 bugs
- [ ] Analytics events firing correctly
- [ ] Support team briefed on changes
- [ ] Rollback plan documented

**Rollback plan**:
- Disable feature flag → users see old onboarding
- No data migration needed (wizard data is additive)

---

### 9. Open Questions

- [ ] Should we A/B test wizard vs no wizard, or just compare to historical baseline?
- [ ] Do we need wizard for mobile web or desktop only for V1?
- [ ] Should invited teammates also see the wizard?

---

### 10. Timeline

| Phase | Duration | Dates |
|-------|----------|-------|
| Design review | 1 week | Mar 10-14 |
| Engineering | 2 weeks | Mar 17-28 |
| QA | 3 days | Mar 31 - Apr 2 |
| Internal dogfood | 1 week | Apr 3-9 |
| Gradual rollout | 2 weeks | Apr 10-24 |
```

### User Story Writing

```markdown
## Write Effective User Stories

### Format
As a [persona], I want to [action], so that [outcome/value].

### Good vs Bad

❌ "As a user, I want a dashboard."
(No persona, no action, no outcome)

✅ "As a sales manager, I want to see my team's pipeline
in a single view, so that I can identify deals at risk
before the weekly forecast meeting."

### Acceptance Criteria Rules
- Testable (QA can verify pass/fail)
- Specific (numbers, not "fast" or "good")
- Independent of implementation ("shows error" not "returns 400")
- Include edge cases and error states

### INVEST Criteria
- **I**ndependent: Can be delivered without other stories
- **N**egotiable: Details can be discussed with engineering
- **V**aluable: Delivers value to the user
- **E**stimable: Team can estimate the effort
- **S**mall: Fits in a sprint
- **T**estable: Has clear acceptance criteria
```


## Examples

### Example 1

**User request:** "Help me set up Prd Writing"

The agent follows the instructions above to configure Prd Writing with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Prd Writing configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Problem before solution** — The first section of every PRD defines the problem with evidence; if you can't articulate the problem, you shouldn't build the solution
2. **One primary metric** — Every PRD has one number that defines success; secondary metrics support it but don't replace it
3. **Non-goals are critical** — Explicitly list what's NOT in scope; prevents scope creep and aligns stakeholders
4. **Acceptance criteria are testable** — Every criterion should be verifiable by QA with a pass/fail result
5. **Edge cases upfront** — Document error states and edge cases in the PRD, not during code review; saves engineering time
6. **Feature flags for rollout** — Always plan a gradual rollout with rollback; never launch to 100% on day one
7. **Counter-metrics** — Define metrics you don't want to hurt; optimization without constraints leads to gaming
8. **Living document** — PRDs evolve; update as you learn during development; the final PRD should reflect what was actually built
