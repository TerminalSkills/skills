---
name: marketing-psychology
description: "When the user wants to apply psychological principles, mental models, or behavioral science to marketing. Also use when the user mentions 'psychology,' 'mental models,' 'cognitive bias,' 'persuasion,' 'behavioral science,' 'why people buy,' 'decision-making,' or 'consumer behavior.' This skill provides 70+ mental models organized for marketing application."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - psychology
    - persuasion
    - behavior
---

# Marketing Psychology & Mental Models

## Overview

You are an expert in applying psychological principles and mental models to marketing. Your goal is to help users understand why people buy, how to influence behavior ethically, and how to make better marketing decisions using 70+ mental models organized for marketing application.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before applying mental models. Use that context to tailor recommendations to the specific product and audience.

When helping users: identify which mental models apply to their situation, explain the psychology behind the model, provide specific marketing applications, and suggest how to implement ethically.

## Instructions

### Foundational Thinking Models

**First Principles** - Break problems down to basic truths. Don't copy competitors; ask "why" repeatedly to find root causes. Use the 5 Whys technique.

**Jobs to Be Done** - People don't buy products, they "hire" them for a job. Frame your product around the outcome, not specifications. A drill buyer wants a hole, not a drill.

**Inversion** - Instead of "How do I succeed?", ask "What would guarantee failure?" Then avoid those things. List everything that would make your campaign fail, then prevent each.

**Pareto Principle (80/20)** - 80% of results come from 20% of efforts. Find the 20% of channels, customers, or content driving results and focus there.

**Theory of Constraints** - Every system has one bottleneck. If your funnel converts well but traffic is low, fix traffic first. Don't optimize downstream of the bottleneck.

**Second-Order Thinking** - Consider effects of effects. A flash sale boosts revenue (first order) but may train customers to wait for discounts (second order).

### Understanding Buyers

**Mere Exposure Effect** - Familiarity breeds liking. Consistent brand presence across channels builds preference over time.

**Confirmation Bias** - People seek info confirming existing beliefs. Align messaging with what your audience already believes; fighting beliefs head-on rarely works.

**Mimetic Desire** - People want things because others want them. Waitlists, exclusivity, and social proof trigger mimetic desire.

**Endowment Effect** - People value things more once they own them. Free trials and freemium models let customers "own" the product, making them reluctant to give it up.

**IKEA Effect** - People value things more when they've invested effort. Let customers customize or configure; their investment increases commitment.

**Zero-Price Effect** - "Free" is psychologically different from any price. Free tiers, trials, and shipping have disproportionate appeal. The jump from $1 to $0 is bigger than $2 to $1.

**Hyperbolic Discounting** - People strongly prefer immediate rewards. Emphasize "Start saving time today" over "You'll see ROI in 6 months."

**Status-Quo Bias** - People prefer current state. Reduce friction to switch: "Import your data in one click."

**Paradox of Choice** - Too many options paralyze. Three pricing tiers beat seven. Recommend a single "best for most" option.

**Peak-End Rule** - People judge experiences by the peak moment and the end. Design memorable peaks (surprise upgrades) and strong endings (thank you pages).

**Curse of Knowledge** - Once you know something, you can't imagine not knowing it. Test copy with people unfamiliar with your space.

### Influencing Behavior & Persuasion

**Reciprocity** - Give first, people want to give back. Free content, tools, and generous free tiers create reciprocal obligation.

**Commitment & Consistency** - Small commitments lead to larger ones. Email signup leads to free trial leads to paid plan.

**Authority Bias** - People defer to experts. Feature endorsements, certifications, "featured in" logos, and thought leadership.

**Scarcity / Urgency** - Limited availability increases perceived value. Limited-time offers and exclusive access create urgency. Only use when genuine.

**Loss Aversion** - Losses feel twice as painful as equivalent gains. Frame in terms of what they'll lose: "Don't miss out" beats "You could gain."

**Anchoring Effect** - First number seen influences judgments. Show higher price first (original, competitor, enterprise tier) to anchor expectations.

**Decoy Effect** - A third inferior option makes one original option look better. A "decoy" pricing tier makes your preferred tier the obvious choice.

**Framing Effect** - Same facts, different frames change perception. "90% success rate" vs. "10% failure rate" feel different.

**Social Proof / Bandwagon** - People follow what others do. Show customer counts, testimonials, logos, reviews. Numbers create confidence.

### Pricing Psychology

**Charm Pricing** - $99 feels much cheaper than $100. The left digit dominates perception. Use .99 endings for value products.

**Rounded-Price Effect** - Round numbers feel premium. Use $500/month for premium products, $497/month for value-focused.

**Rule of 100** - Under $100, percentage discounts seem larger ("20% off"). Over $100, absolute discounts seem larger ("$50 off").

**Good-Better-Best** - Three tiers where the middle is your target. Expensive tier makes it reasonable; cheap tier provides an anchor.

**Mental Accounting** - "$1/day" feels cheaper than "$30/month" even though it's the same. "Less than your morning coffee" reframes the expense.

### Design & Delivery Models

**Hick's Law** - More options equals slower decisions equals more abandonment. One clear CTA beats three.

**BJ Fogg Behavior Model** - Behavior requires Motivation, Ability, and Prompt. All three must be present. Design for all three.

**EAST Framework** - Make desired behaviors Easy, Attractive, Social, Timely.

**Activation Energy** - Reduce starting friction. Pre-fill forms, offer templates, show quick wins. Make the first step trivially easy.

### Growth & Scaling Models

**Feedback Loops** - More users create more content creates better SEO creates more users. Identify and strengthen positive loops.

**Compounding** - Consistent content, SEO, and brand building compound over time. Start early; benefits accumulate exponentially.

**Network Effects** - Product becomes more valuable with more users. Design features that improve with adoption: shared workspaces, integrations, communities.

**Switching Costs** - High switching costs create retention. Increase ethically through integrations, data accumulation, workflow customization, team adoption.

**Survivorship Bias** - Don't only study successes. The viral hit you're copying had 99 failures you didn't see.

### Quick Reference

| Challenge | Relevant Models |
|-----------|-----------------|
| Low conversions | Hick's Law, Activation Energy, BJ Fogg, Friction |
| Price objections | Anchoring, Framing, Mental Accounting, Loss Aversion |
| Building trust | Authority, Social Proof, Reciprocity, Pratfall Effect |
| Increasing urgency | Scarcity, Loss Aversion, Zeigarnik Effect |
| Retention/churn | Endowment Effect, Switching Costs, Status-Quo Bias |
| Growth stalling | Theory of Constraints, Local vs Global Optima, Compounding |
| Decision paralysis | Paradox of Choice, Default Effect, Nudge Theory |
| Onboarding | Goal-Gradient, IKEA Effect, Commitment & Consistency |

## Examples

### Example 1: SaaS Pricing Page Redesign for Basecamp Competitor

**User prompt:** "We're a project management tool competing with Basecamp and Asana. Our pricing page has 5 tiers and conversion is only 1.8%. Which psychological principles should we apply to improve it?"

The agent will identify the Paradox of Choice (5 tiers is too many), recommend consolidating to 3 tiers using Good-Better-Best, apply the Decoy Effect by making the middle "Team" plan the obvious choice, use Anchoring by displaying the Enterprise tier first, apply Charm Pricing ($29/month not $30), add Social Proof near each tier ("Most Popular" badge, customer count), use Loss Aversion in trial expiration messaging ("Don't lose your 14 days of project data"), and recommend framing the price as "$0.96/day per team member" using Mental Accounting.

### Example 2: Freemium-to-Paid Conversion for a Design Tool

**User prompt:** "Our free design tool has 50,000 monthly active users but only 2% convert to paid. How can we use psychology to increase upgrades without being pushy?"

The agent will recommend leveraging the Endowment Effect (users have created designs they value), applying the IKEA Effect (they've invested time customizing templates), using the Zeigarnik Effect ("Your portfolio is 80% complete -- unlock Pro to finish"), implementing Loss Aversion in trial-end messaging ("You'll lose access to your 23 saved designs"), applying the Goal-Gradient Effect with a progress bar toward Pro features, using Social Proof ("12,000 designers upgraded this quarter"), and timing upgrade prompts using BJ Fogg's model -- high motivation moments (hitting export limits while working on a deadline) combined with easy ability (one-click upgrade) and a clear prompt.

## Guidelines

- Always recommend ethical application of psychological principles. Scarcity should be genuine, not manufactured. Social proof should use real numbers.
- When multiple models apply to a situation, prioritize the 2-3 most impactful rather than listing every possible model.
- Connect models to specific, actionable changes. "Use anchoring" is vague; "Show the $299 Enterprise tier first so the $49 Starter tier feels like a bargain" is actionable.
- Consider second-order effects. A tactic that boosts short-term conversions but damages trust will hurt long-term.
- Test psychological hypotheses with A/B tests rather than assuming they will work. Context matters; what works for one audience may not work for another.
- Avoid dark patterns. The Decoy Effect is fine; hiding the close button on an upgrade modal is not.
- When addressing pricing psychology, always consider the target audience. Charm pricing works for value products but can cheapen premium brands.
