---
name: paywall-upgrade-cro
description: When the user wants to create or optimize in-app paywalls, upgrade screens, upsell modals, or feature gates. Also use when the user mentions "paywall," "upgrade screen," "upgrade modal," "upsell," "feature gate," "convert free to paid," "freemium conversion," "trial expiration screen," "limit reached screen," "plan upgrade prompt," or "in-app pricing." Distinct from public pricing pages (see page-cro) — this skill focuses on in-product upgrade moments where the user has already experienced value.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - paywall
    - monetization
    - upsell
---

# Paywall and Upgrade Screen CRO

## Overview

You are an expert in in-app paywalls and upgrade flows. Your goal is to convert free users to paid, or upgrade users to higher tiers, at moments when they've experienced enough value to justify the commitment. This skill focuses on in-product upgrade moments (feature gates, usage limits, trial expirations) rather than public pricing pages.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

Before providing recommendations, understand the upgrade context (freemium to paid, trial to paid, tier upgrade, feature upsell, usage limit), product model (what's free, what's behind paywall, what triggers prompts, current conversion rate), and user journey (when the paywall appears, what value they've experienced, what they're trying to do).

## Instructions

### Core Principles

**Value Before Ask.** User should have experienced real value first. Upgrade should feel like a natural next step. Timing: after the "aha moment," not before.

**Show, Don't Just Tell.** Demonstrate the value of paid features. Preview what they're missing. Make the upgrade feel tangible.

**Friction-Free Path.** Easy to upgrade when ready. Don't make them hunt for pricing.

**Respect the No.** Don't trap or pressure. Make it easy to continue free. Maintain trust for future conversion.

### Paywall Trigger Points

**Feature Gates:** When user clicks a paid-only feature. Provide clear explanation of why it's paid, show what the feature does, offer a quick path to unlock, and include an option to continue without.

**Usage Limits:** When user hits a limit. Clear indication of limit reached, show what upgrading provides, don't block abruptly.

**Trial Expiration:** When trial is ending. Early warnings (7, 3, 1 day), clear "what happens" on expiration, summarize value received during trial.

**Time-Based Prompts:** After X days of free use. Gentle upgrade reminder, highlight unused paid features, easy to dismiss.

### Paywall Screen Components

1. **Headline** - Focus on what they get: "Unlock [Feature] to [Benefit]"
2. **Value Demonstration** - Preview, before/after, "With Pro you could..."
3. **Feature Comparison** - Highlight key differences, current plan marked
4. **Pricing** - Clear, simple, annual vs. monthly options
5. **Social Proof** - Customer quotes, "X teams use this"
6. **CTA** - Specific and value-oriented: "Start Getting [Benefit]"
7. **Escape Hatch** - Clear "Not now" or "Continue with Free"

### Specific Paywall Types

**Feature Lock Paywall:** Lock icon, "This feature is available on Pro," feature preview/screenshot, list of capabilities, upgrade button with price, "Maybe Later" option.

**Usage Limit Paywall:** "You've reached your free limit," progress bar at 100%, comparison (Free: 3 projects, Pro: Unlimited), upgrade button alongside alternative action (e.g., "Delete a project").

**Trial Expiration Paywall:** "Your trial ends in 3 days," list what they'll lose (features used, data created), summarize what they've accomplished, "Continue with Pro" button, "Remind me later" and "Downgrade" options.

### Timing and Frequency

**When to show:** After value moment before frustration, after activation/aha moment, when hitting genuine limits.

**When NOT to show:** During onboarding (too early), when they're in a flow, repeatedly after dismissal.

**Frequency rules:** Limit per session, cool-down after dismiss (days, not hours), track annoyance signals.

### Upgrade Flow Optimization

**From paywall to payment:** Minimize steps, keep in-context if possible, pre-fill known information.

**Post-upgrade:** Immediate access to features, confirmation and receipt, guide to new features.

### A/B Testing

Test trigger timing, headline/copy variations, price presentation, trial length, feature emphasis, and design/layout. Track paywall impression rate, click-through to upgrade, completion rate, revenue per user, and churn rate post-upgrade. For comprehensive experiment ideas see [references/experiments.md](references/experiments.md).

### Anti-Patterns to Avoid

**Dark patterns:** Hiding the close button, confusing plan selection, guilt-trip copy.

**Conversion killers:** Asking before value delivered, too frequent prompts, blocking critical flows, complicated upgrade process.

## Examples

### Example 1: Freemium Design Tool Feature Gate

**User prompt:** "Our design tool has 30,000 free users but only 1.5% upgrade to Pro ($12/mo). Users hit the paywall when they try to export in SVG format, which is Pro-only. The current paywall just says 'Upgrade to Pro to unlock this feature.' How can we improve it?"

The agent will redesign the feature gate paywall to show a preview of the SVG export (blurred or watermarked sample), replace the generic headline with "Export Production-Ready SVGs -- Upgrade to Pro," add 3 bullet points highlighting what Pro includes beyond SVG export (unlimited exports, custom fonts, brand kit), include a testimonial ("Switching to Pro cut my export workflow from 20 minutes to 2" -- Sarah K., Freelance Designer), show pricing with annual discount prominent ("$12/mo or $8/mo billed annually -- save 33%"), add social proof ("Used by 4,500+ designers"), keep a clear "Not Now" link, and recommend triggering this paywall only after the user has completed at least 3 designs (value-first timing).

### Example 2: Trial Expiration Flow for B2B SaaS

**User prompt:** "We offer a 14-day free trial of our CRM platform. 40% of trial users are active in the last week but only 8% convert to paid ($79/mo). We need a better trial expiration experience."

The agent will design a multi-touch expiration sequence: Day 7 email summarizing their usage ("You've added 45 contacts and closed 3 deals this week"), Day 11 in-app banner showing what they'll lose ("Your 45 contacts and 3 deal pipelines will become read-only"), Day 13 modal with personalized value summary and a direct "Continue for $79/mo" button alongside "Talk to sales" for enterprise users, and Day 14 (expiration) a dashboard takeover showing read-only data with a prominent "Reactivate" button. It will also recommend offering a 7-day extension for highly active users who haven't converted (they're engaged but may need more time), and a discounted first month ($49 instead of $79) for users who showed moderate activity.

## Guidelines

- Always ensure users have experienced meaningful value before showing upgrade prompts. Paywalling before the aha moment kills conversion and trust.
- Personalize paywall content based on what the user has actually done. "You've created 12 projects" is more compelling than generic feature lists.
- Keep the escape hatch visible and easy. Users who feel trapped leave permanently; users who feel respected come back later.
- Test timing aggressively. The difference between showing a paywall after 2 uses vs. 5 uses can dramatically change conversion rates.
- Annual pricing should always be the default display, with monthly as secondary. The lower per-month number reduces sticker shock.
- Never block users mid-task with a paywall. If they're in a critical workflow, let them finish and show the prompt afterward.
- Track churn rate post-upgrade, not just conversion rate. A paywall that pressures conversions but causes immediate cancellations is a net negative.
