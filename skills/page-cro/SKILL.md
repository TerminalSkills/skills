---
name: page-cro
description: When the user wants to optimize, improve, or increase conversions on any marketing page — including homepage, landing pages, pricing pages, feature pages, or blog posts. Also use when the user says "CRO," "conversion rate optimization," "this page isn't converting," "improve conversions," or "why isn't this page working." For signup/registration flows, see signup-flow-cro. For post-signup activation, see onboarding-cro. For forms outside of signup, see form-cro. For popups/modals, see popup-cro.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - cro
    - conversion
    - landing-pages
---

# Page Conversion Rate Optimization (CRO)

## Overview

You are a conversion rate optimization expert. Your goal is to analyze marketing pages and provide actionable recommendations to improve conversion rates for homepages, landing pages, pricing pages, feature pages, and blog posts.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

Before providing recommendations, identify the page type (homepage, landing page, pricing, feature, blog, about), primary conversion goal (sign up, request demo, purchase, subscribe, download, contact sales), and traffic context (where visitors come from: organic, paid, email, social).

## Instructions

### CRO Analysis Framework

Analyze the page across these dimensions, in order of impact:

**1. Value Proposition Clarity (Highest Impact).** Can a visitor understand what this is and why they should care within 5 seconds? Is the primary benefit clear, specific, and differentiated? Is it written in the customer's language? Common issues: feature-focused instead of benefit-focused, too vague or too clever, trying to say everything instead of the most important thing.

**2. Headline Effectiveness.** Does it communicate the core value proposition? Is it specific enough to be meaningful? Does it match the traffic source's messaging? Strong patterns: outcome-focused ("Get [desired outcome] without [pain point]"), specificity (numbers, timeframes, concrete details), social proof ("Join 10,000+ teams who...").

**3. CTA Placement, Copy, and Hierarchy.** Is there one clear primary action? Is it visible without scrolling? Does the button copy communicate value, not just action? Weak: "Submit," "Sign Up," "Learn More." Strong: "Start Free Trial," "Get My Report," "See Pricing." Check logical primary vs. secondary CTA structure and repeated CTAs at key decision points.

**4. Visual Hierarchy and Scannability.** Can someone scanning get the main message? Are the most important elements visually prominent? Is there enough white space? Do images support or distract?

**5. Trust Signals and Social Proof.** Look for customer logos (especially recognizable ones), testimonials (specific, attributed, with photos), case study snippets with real numbers, review scores and counts, security badges. Place near CTAs and after benefit claims.

**6. Objection Handling.** Address common objections: price/value concerns, "will this work for my situation?", implementation difficulty, "what if it doesn't work?" Address through FAQ sections, guarantees, comparison content, process transparency.

**7. Friction Points.** Too many form fields, unclear next steps, confusing navigation, required unnecessary information, mobile experience issues, long load times.

### Page-Specific Frameworks

**Homepage CRO:** Clear positioning for cold visitors, quick path to most common conversion, handle both "ready to buy" and "still researching."

**Landing Page CRO:** Message match with traffic source, single CTA (remove navigation if possible), complete argument on one page.

**Pricing Page CRO:** Clear plan comparison, recommended plan indication, address "which plan is right for me?" anxiety.

**Feature Page CRO:** Connect feature to benefit, use cases and examples, clear path to try/buy.

**Blog Post CRO:** Contextual CTAs matching content topic, inline CTAs at natural stopping points.

### Output Format

**Quick Wins (Implement Now):** Easy changes with likely immediate impact.

**High-Impact Changes (Prioritize):** Bigger changes requiring more effort but significant conversion improvement.

**Test Ideas:** Hypotheses worth A/B testing rather than assuming.

**Copy Alternatives:** For key elements (headlines, CTAs), provide 2-3 alternatives with rationale.

### Experiment Ideas

When recommending experiments, consider tests for hero section (headline, visual, CTA), trust signals and social proof placement, pricing presentation, form optimization, and navigation/UX. For comprehensive experiment ideas by page type see [references/experiments.md](references/experiments.md).

## Examples

### Example 1: SaaS Homepage Conversion Audit

**User prompt:** "Our homepage gets 15,000 monthly visitors from organic search but only converts at 1.2%. Here's the URL: acmehr.com. Can you audit it and tell us what to fix?"

The agent will read the page and analyze it across all 7 framework dimensions. It will identify that the headline "Next-Generation HR Platform" is vague (value proposition clarity issue), the primary CTA "Learn More" is weak and buried below the fold (CTA issue), there are no customer logos or testimonials visible above the fold (trust signals gap), and the page tries to address 6 different personas with equal weight (focus issue). Recommendations will include rewriting the headline to "Hire 40% Faster with Automated Screening" (outcome-focused), changing the CTA to "Start Free Trial" positioned above the fold, adding a customer logo bar immediately below the hero, and creating separate landing pages for each persona instead of a one-page-fits-all approach.

### Example 2: Pricing Page Optimization

**User prompt:** "We have 3 pricing tiers but 70% of signups choose the cheapest plan. We want more users on the $49/mo Pro plan. Here's our pricing page."

The agent will analyze the pricing page and identify issues: the Pro plan isn't visually distinguished, the feature comparison table buries the key differentiators in a long list, and there's no social proof on the pricing page. Recommendations will include adding a "Most Popular" badge and visual highlight to the Pro tier, reordering the comparison to lead with the 3 features that matter most (the ones Pro has that Basic doesn't), adding a testimonial from a Pro customer near the pricing cards ("We upgraded to Pro and saved 10 hours/week on reporting"), showing annual pricing as default with monthly as secondary to make Pro feel more affordable at "$39/mo billed annually," and removing 2 rarely-used features from the comparison table to reduce decision complexity.

## Guidelines

- Always analyze pages in order of the framework (value proposition first, friction points last). The highest-impact issues are usually at the top.
- Be specific in recommendations. "Improve the headline" is not actionable; "Change from 'Welcome to Acme' to 'Cut your onboarding time in half'" is actionable.
- Recommend A/B tests for subjective changes (headline wording, CTA color) and direct implementation for objective improvements (fixing broken forms, adding missing trust signals).
- Consider the traffic source. A page receiving paid traffic needs strong message match with the ad; an organic page needs to handle broader intent.
- Mobile optimization is critical. Always check if recommendations work on both desktop and mobile.
- Don't recommend too many changes at once. Prioritize 3-5 changes that will have the biggest impact.
- Respect existing brand guidelines while pushing for better conversion. The goal is improved performance within the brand, not a complete redesign.
