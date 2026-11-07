---
title: "Ship a Landing Page That Actually Converts"
slug: ship-landing-page-that-converts
description: "Audit, redesign, and A/B test your landing page to raise conversion rates using CRO best practices."
skills: [page-cro, frontend-design]
category: business
tags: [conversion, landing-page, CRO, A/B-testing, marketing]
---

# Ship a Landing Page That Actually Converts

## The Problem

You're spending $4,200/month on Google Ads driving traffic to a landing page that converts at 0.9%. That's about $35 per lead against a target under $15. The page looks good, but "looks good" and "converts" are different things.

Analytics shows people leave after a few seconds, but you don't know why. Is it the headline? The form? The load time? You've A/B tested button colors and changed the headline once, and the result was worse. A CRO agency is out of budget for a bootstrapped startup, and opinions from the team don't settle anything.

The arithmetic is simple. At a fixed ad spend, cost per lead is spend divided by leads, so tripling the conversion rate cuts cost per lead to a third. The hard part is knowing which change moves the rate, and proving it.

## The Solution

The **page-cro** skill audits the page the way an analyst would: it measures conversion by device and traffic source first, checks speed against Google's published Core Web Vitals thresholds, reads what the visitor actually sees, and ranks findings as defects to fix, changes to ship, or hypotheses to test. It also works out whether your traffic is enough to test at all. The **frontend-design** skill writes the redesigned components (hero, form, proof bar) with a consistent spacing scale, accessible contrast and touch targets. Together they turn a subjective redesign into a measured, testable change.

## Step-by-Step Walkthrough

### Step 1: Run a CRO audit

```text
Audit our landing page at https://app.ourproduct.com/signup. The goal is a started
trial. Traffic is Google Ads. Break conversion down by device and source before
you comment on the design.
```

The skill starts with numbers rather than taste: conversion rate by device and campaign, clicks on the primary button against completed signups, and field Core Web Vitals (Chrome UX Report) or a Lighthouse run when the page has too little traffic for field data. The thresholds it checks against are Google's: [Largest Contentful Paint](https://web.dev/articles/lcp) is good at 2.5 seconds or less and poor above 4 seconds, and [Interaction to Next Paint](https://web.dev/articles/inp) is good at 200 milliseconds or less.

For this example page, the findings come back like this (the figures are the example team's own measurements):

- **Speed.** Mobile LCP is 6.2 seconds, well past the poor threshold. The hero is a 2.4MB PNG and the JavaScript bundle is 847KB.
- **Above the fold.** The headline, "The All-in-One Platform for Modern Teams", fits any SaaS product. The CTA sits below the fold on mobile, which is 68% of this page's paid traffic, and the hero is a stock photo rather than the product.
- **Form.** Five fields, including a required phone number. The audit flags this as a hypothesis to test, not a proven cause: field-count effects vary by audience, so the test in Step 4 decides it.
- **Trust.** No customer logos above the fold; testimonials sit three scrolls down.

The report ranks these by how many visitors each affects: speed and the mobile CTA position hit every paid mobile visitor, so they go first. Anything it cannot prove from your data it labels a hypothesis. It does not promise a percentage lift per fix, because a lift figure without a test behind it is a guess.

### Step 2: Redesign the hero section

```text
Redesign the hero with a specific headline, a 2-field form, customer logos and a
product screenshot. Next.js with Tailwind. Mobile first.
```

The headline changes from vague to concrete: **"Cut Your Reporting Time from 4 Hours to 15 Minutes."** The subheadline adds context: "Automated dashboards from Salesforce, HubSpot, and 50+ tools." The form drops to a work email and a button labelled "Start free trial". Under it sits one line addressing the usual objections, only if it is true for your product ("14-day trial, no credit card"), and a row of customer logos you have permission to show.

frontend-design produces component code, not a mockup. The pieces that matter for conversion:

```tsx
export function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
      <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
        Cut your reporting time from 4 hours to 15 minutes
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Automated dashboards from Salesforce, HubSpot, and 50+ tools.
      </p>
      <form action="/signup" method="post" className="mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
        <label htmlFor="email" className="sr-only">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required
               className="min-h-12 flex-1 rounded-lg border border-slate-300 px-4" />
        <button type="submit"
                className="min-h-12 rounded-lg bg-blue-700 px-6 font-semibold text-white hover:bg-blue-600">
          Start free trial
        </button>
      </form>
      {/* The LCP image: do not lazy-load it, give it a priority hint */}
      <img src="/hero-product.avif" width={1200} height={750} fetchPriority="high"
           alt="The reporting dashboard showing a weekly sales summary" className="mt-12 h-auto w-full rounded-xl" />
    </section>
  );
}
```

Choices worth keeping: the form and button fit in the first mobile screen, controls are at least 48px tall (WCAG 2.2 requires [at least 24 by 24 CSS pixels](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); 44px or more is safer on phones), the input has a real label and `autoComplete`, and the image has explicit dimensions so the layout doesn't shift.

### Step 3: Fix page speed

```text
Get mobile LCP under 2.5 seconds without losing visual quality.
```

The usual fixes for a page like this one:

| Asset | Before | After |
|-------|--------|-------|
| Hero image | 2.4MB PNG | 148KB AVIF/WebP with responsive `srcset` and `fetchpriority="high"` |
| JS bundle | 847KB loaded upfront | Split so only the hero and form load first; analytics and chat widgets deferred |
| CSS | All render-blocking | Critical rules inlined, the rest loaded after first paint |

Verify with Lighthouse in a mobile run rather than trusting the plan:

```console
$ npx lighthouse https://app.ourproduct.com/signup --only-categories=performance --form-factor=mobile --output=json --output-path=./lh.json
```

For the example page, the rerun showed LCP going from 6.2s to 1.8s and total weight from 3.6MB to 486KB. Lab numbers are a proxy; the field data in Chrome UX Report updates over the following 28 days, so judge the speed work on that, not on the lab run alone.

### Step 4: Set up the A/B test

```text
Plan an A/B test of the current page against the redesign. We get about 450 visits
a day. Tell me whether that is enough.
```

page-cro sizes the test before you launch it. The inputs are baseline rate, the smallest lift worth detecting, 95% confidence and 80% power. With a 0.9% baseline and a target of 2.5%, the standard two-proportion formula gives roughly 1,000 visitors per variant. At 450 visits a day split 50/50 that is about 5 days, but you run whole weeks so weekday and weekend behaviour both appear: two weeks, about 3,150 visitors per variant. If you only hoped for a smaller lift, say 0.9% to 1.35%, the same formula needs roughly 8,600 per variant, which is over five weeks at this traffic. At that point the honest answer is to ship the large changes (speed, CTA position, specific headline) together and test later, rather than run an underpowered test.

Fix the sample size and duration in advance and do not stop early because a graph looks good: repeatedly checking a fixed-horizon test inflates false positives. Track four events per variant: `page_view`, `form_start`, `form_submit` and `form_abandon`, and compare by device and source.

### Step 5: Analyze the results

```text
The test ran 16 days. Show me the results.
```

For the example team, the test returned:

| Metric | Control | Treatment |
|--------|---------|-----------|
| Visitors | 3,641 | 3,671 |
| Conversions | 34 | 112 |
| Conversion rate | 0.93% | 3.05% |
| Relative lift | | +227% |

A two-proportion z-test on these counts gives p well below 0.001, so the difference is not noise. Two cautions the audit repeats: this tests the redesign as a bundle (headline, form, speed, layout), so it does not tell you which change did the work, and a lift this large is unusual; it appears here because the old page was badly broken. At the same ad spend and 13,500 visits a month, 0.93% yields about 125 leads (about $34 each) and 3.05% yields about 412 (about $10 each).

## Real-World Example

A solo founder of a bootstrapped project management SaaS was paying about $38 a lead on $3,800/month of ad spend, nearly double his $20 target. The freelancer-designed page said "Project Management Reimagined", had six form fields including a required phone number, and took 5.1 seconds to load on mobile.

He ran the audit on a Monday. It reported conversion by device first, then ranked findings, separating the proven defects (slow mobile load, CTA below the fold) from the hypotheses (the phone field, the headline). The redesigned hero came out of frontend-design that afternoon. He launched the test on Tuesday and let it run 18 days without stopping early. His own result: 2.8% conversion against 0.7%, and cost per lead down from $38 to $9.50 at the same budget. With those economics he raised the budget, as his investor had been asking. These are one team's numbers on one badly broken page, not a benchmark for yours.

## Related Skills

- [page-cro](../skills/page-cro/SKILL.md): audits a page by device and source, ranks findings, and sizes the A/B test
- [frontend-design](../skills/frontend-design/SKILL.md): builds the redesigned hero and form components
