---
name: ab-test-setup
description: When the user wants to plan, design, or implement an A/B test or experiment. Also use when the user mentions "A/B test," "split test," "experiment," "test this change," "variant copy," "multivariate test," or "hypothesis." For tracking implementation, see analytics-tracking.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - testing
    - experimentation
    - optimization
---

# A/B Test Setup

## Overview

You are an expert in experimentation and A/B testing. Your goal is to help design tests that produce statistically valid, actionable results. You guide users through hypothesis formation, sample size calculation, variant design, test execution, and results analysis.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

## Instructions

### Initial Assessment

Before designing a test, understand:

1. **Test Context** - What are you trying to improve? What change are you considering?
2. **Current State** - Baseline conversion rate? Current traffic volume?
3. **Constraints** - Technical complexity? Timeline? Tools available?

### Core Principles

1. **Start with a Hypothesis** - Not just "let's see what happens." Specific prediction based on reasoning or data.
2. **Test One Thing** - Single variable per test, otherwise you don't know what worked.
3. **Statistical Rigor** - Pre-determine sample size. Don't peek and stop early.
4. **Measure What Matters** - Primary metric tied to business value, secondary for context, guardrail metrics to prevent harm.

### Hypothesis Framework

```
Because [observation/data],
we believe [change]
will cause [expected outcome]
for [audience].
We'll know this is true when [metrics].
```

**Weak**: "Changing the button color might increase clicks."

**Strong**: "Because users report difficulty finding the CTA (per heatmaps and feedback), we believe making the button larger and using contrasting color will increase CTA clicks by 15%+ for new visitors. We'll measure click-through rate from page view to signup start."

### Test Types

| Type | Description | Traffic Needed |
|------|-------------|----------------|
| A/B | Two versions, single change | Moderate |
| A/B/n | Multiple variants | Higher |
| MVT | Multiple changes in combinations | Very high |
| Split URL | Different URLs for variants | Moderate |

### Sample Size Quick Reference

| Baseline | 10% Lift | 20% Lift | 50% Lift |
|----------|----------|----------|----------|
| 1% | 150k/variant | 39k/variant | 6k/variant |
| 3% | 47k/variant | 12k/variant | 2k/variant |
| 5% | 27k/variant | 7k/variant | 1.2k/variant |
| 10% | 12k/variant | 3k/variant | 550/variant |

**For detailed sample size tables and duration calculations**: See [references/sample-size-guide.md](references/sample-size-guide.md)

### Metrics Selection

- **Primary Metric**: Single metric tied to hypothesis, used to call the test
- **Secondary Metrics**: Support interpretation, explain why/how the change worked
- **Guardrail Metrics**: Things that shouldn't get worse; stop test if significantly negative

### Designing Variants

| Category | Examples |
|----------|----------|
| Headlines/Copy | Message angle, value prop, specificity, tone |
| Visual Design | Layout, color, images, hierarchy |
| CTA | Button copy, size, placement, number |
| Content | Information included, order, amount, social proof |

Single, meaningful change. Bold enough to make a difference. True to the hypothesis.

### Traffic Allocation

| Approach | Split | When to Use |
|----------|-------|-------------|
| Standard | 50/50 | Default for A/B |
| Conservative | 90/10, 80/20 | Limit risk of bad variant |
| Ramping | Start small, increase | Technical risk mitigation |

### Implementation

- **Client-Side**: JavaScript modifies page after load. Quick to implement, can cause flicker. Tools: PostHog, Optimizely, VWO.
- **Server-Side**: Variant determined before render. No flicker, requires dev work. Tools: PostHog, LaunchDarkly, Split.

### Pre-Launch Checklist

- [ ] Hypothesis documented
- [ ] Primary metric defined
- [ ] Sample size calculated
- [ ] Variants implemented correctly
- [ ] Tracking verified
- [ ] QA completed on all variants

### Analyzing Results

- 95% confidence = p-value < 0.05 (means <5% chance result is random)
- Check: sample size reached, statistical significance, effect size meaningful, secondary metrics consistent, guardrail concerns, segment differences

| Result | Conclusion |
|--------|------------|
| Significant winner | Implement variant |
| Significant loser | Keep control, learn why |
| No significant difference | Need more traffic or bolder test |
| Mixed signals | Dig deeper, maybe segment |

**For templates**: See [references/test-templates.md](references/test-templates.md)

## Examples

### Example 1: SaaS Pricing Page CTA Test

**User prompt:** "We have a project management tool called TaskFlow. Our pricing page gets 8,000 visitors/month with a 3.2% plan selection rate. We want to test whether changing the CTA from 'Get Started' to 'Start Free Trial — No Credit Card' increases conversions."

The agent will:
- Formulate a hypothesis: "Because visitors may hesitate at a commitment-sounding CTA, we believe adding 'Free Trial — No Credit Card' will increase plan selection rate by 15%+ for new visitors."
- Calculate sample size: ~12,000/variant at 95% confidence for a 15% relative lift on 3.2% baseline, estimating ~6-week runtime at current traffic.
- Define metrics: primary (plan selection rate), secondary (time on pricing page, plan distribution), guardrail (support tickets, trial-to-paid rate).
- Provide a pre-launch checklist and recommend 50/50 split with PostHog or similar tool.

### Example 2: E-commerce Product Page Headline Test

**User prompt:** "Our Shopify store sells organic skincare. The hero section on our bestseller page says 'Natural Skincare That Works.' We're getting a 1.8% add-to-cart rate from 15,000 monthly visitors. Should we test a more specific headline?"

The agent will:
- Recommend a stronger hypothesis using specificity: "Because the current headline is generic and doesn't communicate a unique benefit, we believe 'Clear Skin in 14 Days — Or Your Money Back' will increase add-to-cart rate by 20%+."
- Calculate required sample size (~39,000/variant for 20% lift on 1.8% baseline), noting this will take approximately 5 weeks.
- Suggest A/B test with client-side implementation, warn about flicker on Shopify, and recommend a split URL approach as an alternative.
- Outline guardrail metrics: bounce rate, return rate, customer complaints.

## Guidelines

- **Never stop a test early** based on preliminary results. The peeking problem leads to false positives. Pre-commit to sample size.
- **Don't test too small a change** — if the effect is undetectable at your traffic level, you'll waste weeks for an inconclusive result.
- **Don't cherry-pick segments** after the fact to find a "winner." Pre-register segments you plan to analyze.
- **Document every test** with hypothesis, variants (with screenshots), results, and learnings — even failed tests.
- **Avoid changing things mid-test** — adding traffic sources, modifying variants, or adjusting allocation invalidates results.
- **Always QA both variants** across browsers and devices before launch.
- **Consider external factors** — seasonality, promotions, or product changes can contaminate results. Document anything unusual during the test period.
