---
name: systems-thinking
description: >-
  Apply systems thinking to business problems — identify constraints, understand feedback loops,
  anticipate second-order effects, and improve processes. Use when: diagnosing why a business
  process is broken, optimizing operations, understanding complex system behavior.
license: Apache-2.0
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: "systems-thinking, operations, optimization, constraints, feedback-loops"
  use-cases: "Find the single biggest constraint limiting a business's growth, Map feedback loops in a SaaS business to understand churn dynamics, Predict second-order effects before making a major business change"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Systems Thinking

## Overview

Every business is a system — a collection of interconnected processes that produce outcomes. When something isn't working, most people try to fix symptoms. Systems thinkers find the root cause by understanding how the pieces connect.

This skill applies six systems thinking frameworks to diagnose business problems, find constraints, map feedback loops, and predict the consequences of changes before you make them. The sources are John Gall's *Systemantics* (1975), Eliyahu Goldratt's *The Goal* (1984), Frederick Brooks's *The Mythical Man-Month* (1975), and Lisanne Bainbridge's "Ironies of Automation" (*Automatica*, 1983). Frameworks 4 and 6 are practical heuristics, not measured results. The numbers in the examples are illustrative, not data from any real company.

## Instructions

When a user describes a business problem, process inefficiency, or asks why something isn't working, apply these systems thinking frameworks.

### Framework 1: Gall's Law — Start Simple

Gall's observation, in *Systemantics*: a working complex system almost always grows out of a simple system that already worked. A complex system designed from scratch tends to fail, and patching it rarely makes it work. (Gall never called this a law; the name is a later convention.)

**Application:**
- Don't design a complex solution upfront. Build the simplest version that works, then iterate.
- If a complex system is broken, don't try to fix it in-place. Strip it back to a simpler version that works, then add complexity gradually.
- Every feature, process, or tool you add creates new interactions and failure modes.

**Illustrative example (hypothetical numbers):** A team builds a 12-step onboarding flow with branching logic and personalization, and few users finish it. Replacing it with a 3-step version (import data, create first project, invite teammate) gives the team something that works. Then add complexity back one step at a time, measuring each change.

### Framework 2: Theory of Constraints — Find the Bottleneck

In Goldratt's Theory of Constraints, a system's throughput is limited by at least one constraint, usually a very small number. Treat the biggest one first. Improving anything that is NOT the constraint is waste.

**The 5 Focusing Steps:**
1. **IDENTIFY** the constraint — What single thing limits the system's output?
2. **EXPLOIT** the constraint — Get maximum output from the constraint as-is
3. **SUBORDINATE** everything else — All other processes serve the constraint
4. **ELEVATE** the constraint — Invest in expanding the constraint's capacity
5. **REPEAT** — Once this constraint is broken, go back to step 1 and find the NEW constraint; do not let inertia turn your old fix into the next constraint

**How to identify the constraint:**
- Where does work pile up? (Queue before the bottleneck)
- What are people waiting for most often?
- If you could magically make ONE thing faster, which would have the biggest impact?

**Business examples:**
| Business | Apparent Problem | Actual Constraint | Fix |
|----------|-----------------|-------------------|-----|
| SaaS | Slow growth | Onboarding activation (23% rate) | Simplify first-run experience |
| Agency | Can't take more clients | Founder does all sales calls | Hire a sales person or productize |
| E-commerce | Low revenue | Traffic is fine, 1.2% conversion rate | Fix product pages and checkout flow |
| Dev team | Slow delivery | Code review backlog (5-day avg wait) | Add reviewers or automate checks |

### Framework 3: Feedback Loops

Systems are driven by feedback loops — circular chains of cause and effect.

**Positive (reinforcing) feedback loops** — amplify change:
```
More users → More content → Better product → More users
(Growth flywheel — Instagram, YouTube, marketplaces)

More churn → Less revenue → Less investment in product → More churn
(Death spiral — the opposite direction)
```

**Negative (balancing) feedback loops** — resist change:
```
Price too high → Fewer customers → Revenue drops → Price lowered
(Market correction)

Team grows → Communication overhead increases → Productivity drops → Growth slows
(Brooks's Law: adding people to a late software project makes it later)
```

**How to use feedback loops:**
1. Map the loops in your business (draw them out)
2. Identify which loops are helping and which are hurting
3. Strengthen positive loops (invest in flywheels)
4. Break negative loops (intervene at the weakest link)

**SaaS feedback loop map:**
```
GROWTH FLYWHEEL (positive):
  Good product → Happy users → Word of mouth → New signups → More revenue → More dev → Better product

CHURN SPIRAL (negative):
  Poor onboarding → User confused → No value experienced → Churn → Less revenue → Less dev time → Worse product

SUPPORT OVERLOAD (negative):
  More customers → More support tickets → Slower response → Unhappy customers → Churn
  Break it: Self-serve docs, in-app guidance, FAQ automation
```

### Framework 4: Second-Order Effects

First-order effects are obvious. Second-order effects are what actually determine outcomes.

**How to think in second-order effects:**
For every decision, ask: "And then what?"

```
Decision: Offer a 50% discount to boost signups

First-order:  More signups (great!)
Second-order: Attracts price-sensitive customers who churn faster
Third-order:  Support costs increase, team morale drops from dealing with
              low-quality customers, NPS drops
Net result:   Negative. The discount hurt the business.

Better decision: Offer a free tier with usage limits → self-serve qualification
```

**Common second-order traps:**

| Decision | First-Order | Second-Order | Net |
|----------|-------------|--------------|-----|
| Hire fast to meet demand | More capacity | Cultural dilution, training overhead | Often negative |
| Cut prices to win deals | More customers | Lower LTV, attracts wrong segment | Negative |
| Add more features | More value | More complexity, harder onboarding, more bugs | Often negative |
| Eliminate all meetings | More focus time | Alignment breaks down, silos form | Mixed |
| Automate support | Lower cost | Some customers feel ignored, edge cases missed | Mixed |

### Framework 5: The Automation Paradox

Bainbridge (1983, "Ironies of Automation") argued that the more automated a system becomes, the more important the human operator's remaining contribution is. Humans are involved less often but face harder cases, with fewer chances to practice.

When you automate a process:
- The easy cases get handled automatically
- The remaining cases (handled by humans) are the HARDEST ones
- Humans become less practiced (fewer reps) but face harder problems
- Error rates on the human-handled cases increase

**Application:**
- Don't automate 100%. Keep humans in the loop for edge cases.
- Build monitoring and alerting, not just automation.
- When you automate, invest MORE in training for the humans handling exceptions.

### Framework 6: Resilience vs Optimization

Systems optimized for one scenario are fragile to all others.

- **Optimized system:** Zero inventory, just-in-time delivery, every process at max efficiency
  - Works perfectly... until one supplier is late, then everything stops

- **Resilient system:** Buffer inventory, multiple suppliers, slack in processes
  - Less efficient on paper, but survives disruptions

**The tradeoff:** Optimization maximizes output in KNOWN conditions. Resilience maximizes survival in UNKNOWN conditions.

**Business rule (heuristic):** Optimize processes you fully understand and control. Build resilience into processes affected by external factors (supply chain, market shifts, customer behavior).

## Examples

### Example 1: Diagnose a stalled SaaS

**User request:** "Our SaaS has been stuck at $12k MRR for 9 months. We get new signups but growth is flat. What's wrong?"

The figures below are a worked example with the user's numbers as given in the request, not research data. Replace each with the user's own measurements.

**Output:**
```
Systems Diagnosis: Flat MRR Despite New Signups

  This means: New customer revenue ≈ Churned customer revenue
  The system is in equilibrium — a balancing feedback loop is canceling growth.

  Step 1: Map the system
    Signups → Trial → Activation → Paid → Retained → Expansion
                                              ↓
                                           Churned

  Step 2: Find the constraint (where does the system leak?)
    - Signup rate: 200/month ✓ (not the bottleneck)
    - Trial → Activation: 23% ← THIS IS THE CONSTRAINT
    - Activation → Paid: 60% (acceptable)
    - Monthly churn: 7% (high, but secondary to activation)

  Step 3: Theory of Constraints — EXPLOIT the constraint
    77% of signups never experience the product's value.
    If you improve activation from 23% → 50%, paid customers per month
    go from 28 to 60 — more than doubling net growth.

  Step 4: Second-order check
    If more users activate, will support load break? Current support
    handles 200 tickets/month. More than doubling active users (46 → 100 a month) → roughly 430 tickets.
    Plan for this BEFORE fixing activation.

  Recommendation: 2-week sprint on onboarding. Simplify to 3 steps.
  Add template projects. Show value in under 3 minutes. Measure activation
  weekly. Ignore everything else until activation is above 40%.
```

### Example 2: Map feedback loops for a marketplace

**User request:** "We're building a freelancer marketplace. Help me understand the dynamics."

**Output:**
```
Marketplace Feedback Loop Map:

  CORE FLYWHEEL (positive — make this spin):
    More freelancers → More choice for clients → More clients join →
    More jobs posted → More freelancers attracted → ...

  QUALITY LOOP (positive — protect this):
    Good matches → Positive reviews → Trust increases →
    More transactions → Better data → Better matching → ...

  CHICKEN-AND-EGG PROBLEM (negative — break this first):
    No freelancers → No value for clients → No clients →
    No jobs → No freelancers → ...
    Break it: Seed one side. Recruit 50 freelancers first (supply).
    Offer them guaranteed minimum earnings for 30 days.

  RACE TO BOTTOM (negative — prevent this):
    Price competition → Lower rates → Good freelancers leave →
    Quality drops → Clients leave → ...
    Prevent it: Don't let clients sort by lowest price.
    Rank by quality/fit. Take a flat fee, not a percentage.

  SUPPORT SCALING (negative — plan for this):
    More transactions → More disputes → More support needed →
    Slower resolution → Lower trust → Fewer transactions
    Break it: Automated escrow, clear TOS, self-serve dispute resolution

  Priority order:
    1. Break chicken-and-egg (nothing works without supply)
    2. Build quality loop (this is your moat)
    3. Spin core flywheel (growth)
    4. Monitor and prevent race to bottom
```

## Guidelines

- Always start with the constraint. Everything else is secondary until the bottleneck is identified.
- Draw the system before trying to fix it. If you can't map it, you don't understand it.
- When suggesting changes, always run a second-order analysis: "And then what happens?"
- Favor simple solutions (Gall's Law). If the fix requires building something complex, find a simpler intervention first.
- Warn about the automation paradox when users want to "automate everything."
- Default to resilience over optimization unless the user explicitly needs maximum efficiency in a controlled environment.
- Use concrete numbers from the user's business, not theoretical examples, whenever possible.
