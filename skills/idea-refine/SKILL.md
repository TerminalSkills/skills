---
name: idea-refine
description: >-
  Refines raw ideas into sharp, actionable concepts through structured divergent
  and convergent thinking. Use when you have a vague idea that needs sharpening,
  want to stress-test a plan, or need to explore variations before committing
  to a direction. Produces a concrete markdown one-pager with problem statement,
  assumptions, MVP scope, and trade-offs.
license: MIT
compatibility: "Any AI coding agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: ["ideation", "refinement", "planning"]
---

# Idea Refine

## Overview

Refines raw ideas into sharp, actionable concepts worth building through structured divergent and convergent thinking. Three phases: Understand & Expand → Evaluate & Converge → Sharpen & Ship.

**Trigger phrases:** "Help me refine this idea", "Ideate on [concept]", "Stress-test my plan"

## Instructions

### Phase 1: Understand & Expand (Divergent)

**Goal:** Take the raw idea and open it up.

1. **Restate the idea** as a crisp "How Might We" problem statement.

2. **Ask 3-5 sharpening questions** — no more:
   - Who is this for, specifically?
   - What does success look like?
   - What are the real constraints (time, tech, resources)?
   - What's been tried before?
   - Why now?

   Do NOT proceed until you understand who this is for and what success looks like.

3. **Generate 5-8 idea variations** using these lenses:
   - **Inversion:** "What if we did the opposite?"
   - **Constraint removal:** "What if budget/time/tech weren't factors?"
   - **Audience shift:** "What if this were for [different user]?"
   - **Combination:** "What if we merged this with [adjacent idea]?"
   - **Simplification:** "What's the version that's 10x simpler?"
   - **10x version:** "What would this look like at massive scale?"
   - **Expert lens:** "What would domain experts find obvious?"

**If running inside a codebase:** Scan for relevant context — existing architecture, patterns, constraints, prior art. Ground variations in what actually exists.

### Phase 2: Evaluate & Converge

After the user reacts to Phase 1:

1. **Cluster** ideas that resonated into 2-3 distinct directions.

2. **Stress-test** each direction:
   - **User value:** Painkiller or vitamin?
   - **Feasibility:** Technical and resource cost? Hardest part?
   - **Differentiation:** What makes this genuinely different?

3. **Surface hidden assumptions** for each direction:
   - What you're betting is true (but haven't validated)
   - What could kill this idea
   - What you're choosing to ignore (and why that's okay for now)

**Be honest, not supportive.** If an idea is weak, say so with kindness. Push back on complexity, question real value.

### Phase 3: Sharpen & Ship

Produce a concrete markdown one-pager:

```markdown
# [Idea Name]

## Problem Statement
[One-sentence "How Might We" framing]

## Recommended Direction
[The chosen direction and why — 2-3 paragraphs max]

## Key Assumptions to Validate
- [ ] [Assumption 1 — how to test it]
- [ ] [Assumption 2 — how to test it]
- [ ] [Assumption 3 — how to test it]

## MVP Scope
[Minimum version that tests the core assumption. What's in, what's out.]

## Not Doing (and Why)
- [Thing 1] — [reason]
- [Thing 2] — [reason]

## Open Questions
- [Question that needs answering before building]
```

**The "Not Doing" list is arguably the most valuable part.** Focus is about saying no to good ideas.

Ask the user if they'd like to save to `docs/ideas/[idea-name].md`. Only save if confirmed.

### Philosophy

- Simplicity is the ultimate sophistication. Push toward the simplest version.
- Start with the user experience, work backwards to technology.
- Say no to 1,000 things. Focus beats breadth.
- Challenge every assumption. "How it's usually done" is not a reason.

## Examples

### Tone and Approach

Direct, thoughtful, slightly provocative. You're a sharp thinking partner, not a facilitator reading from a script. Channel the energy of "that's interesting, but what if..." — always pushing one step further.

### Anti-patterns

- Don't generate 20+ ideas. 5-8 well-considered variations beat 20 shallow ones.
- Don't skip "who is this for." Every good idea starts with a person and their problem.
- Don't produce a plan without surfacing assumptions.
- Don't just list ideas — tell a story. Each variation should have a reason it exists.

## Guidelines

### Red Flags

- Generating 20+ shallow variations instead of 5-8 considered ones
- Skipping the "who is this for" question
- No assumptions surfaced before committing to a direction
- Yes-machining weak ideas instead of pushing back
- Producing a plan without a "Not Doing" list
- Jumping straight to output without running exploration phases

### Verification

- [ ] A clear "How Might We" problem statement exists
- [ ] Target user and success criteria are defined
- [ ] Multiple directions were explored, not just the first idea
- [ ] Hidden assumptions are explicitly listed with validation strategies
- [ ] A "Not Doing" list makes trade-offs explicit
- [ ] Output is a concrete artifact, not just conversation
- [ ] User confirmed the final direction before implementation
