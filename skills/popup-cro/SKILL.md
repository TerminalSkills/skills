---
name: popup-cro
description: When the user wants to create or optimize popups, modals, overlays, slide-ins, or banners for conversion purposes. Also use when the user mentions "exit intent," "popup conversions," "modal optimization," "lead capture popup," "email popup," "announcement banner," or "overlay." For forms outside of popups, see form-cro. For general page conversion optimization, see page-cro.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - popups
    - modals
    - lead-capture
---

# Popup CRO

## Overview

You are an expert in popup and modal optimization. Your goal is to create popups that convert without annoying users or damaging brand perception.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

## Instructions

### Initial Assessment

Before providing recommendations, understand:

1. **Popup Purpose** - Email capture, lead magnet delivery, discount/promotion, announcement, exit intent save, feature promotion, or feedback/survey
2. **Current State** - Existing popup performance, triggers used, user complaints, mobile experience
3. **Traffic Context** - Traffic sources, new vs. returning visitors, page types where shown

### Core Principles

1. **Timing Is Everything** - Too early = annoying interruption. Too late = missed opportunity. Right time = helpful offer at moment of need.
2. **Value Must Be Obvious** - Clear immediate benefit, relevant to page context, worth the interruption.
3. **Respect the User** - Easy to dismiss, don't trap or trick, remember preferences.

### Trigger Strategies

| Trigger | When to Use | Details |
|---------|-------------|---------|
| Time-based | General visitors | Show after 30-60 seconds (not 5 seconds) |
| Scroll-based | Blog/long-form content | 25-50% scroll depth indicates engagement |
| Exit intent | E-commerce, lead gen | Detects cursor moving to close/leave |
| Click-triggered | Lead magnets, gated content | Zero annoyance, user-initiated |
| Page count | Multi-page journeys | After visiting X pages shows research behavior |
| Behavior-based | High-intent segments | Cart abandonment, pricing page visitors |

### Popup Types

**Email Capture** - Clear value prop (not just "Subscribe"), specific benefit, single field, consider incentive. CTA: "Get Weekly Tips" not "Submit."

**Lead Magnet** - Show what they get (cover image, preview), specific tangible promise, minimal fields, instant delivery expectation.

**Discount/Promotion** - Clear discount amount, deadline for urgency, single use per visitor, easy to apply code.

**Exit Intent** - Acknowledge they're leaving, different offer than entry popup, address common objections. Formats: "Wait! Before you go..." or "Get 10% off your first order."

**Announcement Banner** - Top of page (sticky or static), single clear message, dismissable, time-limited.

**Slide-In** - Enters from corner/bottom, doesn't block content, good for chat, support, or secondary CTAs.

### Design Best Practices

**Visual hierarchy:** Headline (largest) → Value prop → Form/CTA → Close option

**Sizing:** Desktop 400-600px wide. Mobile full-width bottom or center, not full-screen. Always leave space to close.

**Close button:** Always visible top-right, large enough to tap on mobile, "No thanks" text link as alternative, click outside to close.

**Mobile:** Can't detect exit intent (use alternatives), bottom slide-ups work well, larger touch targets.

### Copy Formulas

**Headlines:** Benefit-driven ("Get [result] in [timeframe]"), Question ("Want [outcome]?"), Social proof ("Join [X] people who..."), Curiosity hook.

**CTA Buttons:** First person ("Get My Discount"), specific over generic ("Send Me the Guide" vs "Submit"), value-focused ("Claim My 10% Off").

**Decline Options:** Polite, not guilt-trippy. Use "No thanks" / "Maybe later." Avoid manipulative: "No, I don't want to save money."

### Frequency and Targeting Rules

- Show maximum once per session, remember dismissals (cookie/localStorage), 7-30 days before reshowing
- Different popups for new vs. returning visitors, by traffic source, by page type
- Exclude checkout/conversion flows and recently dismissed or converted users

### Compliance and Accessibility

**GDPR/Privacy:** Clear consent language, link to privacy policy, don't pre-check opt-ins.

**Accessibility:** Keyboard navigable (Tab, Enter, Esc), focus trap while open, screen reader compatible, sufficient color contrast.

**Google Guidelines:** Intrusive interstitials hurt SEO. Mobile especially sensitive. Avoid full-screen before content on mobile.

### Measurement

**Key metrics:** Impression rate, conversion rate (impressions to submissions), close rate, engagement rate, time to close.

**Benchmarks:** Email popup 2-5% conversion, exit intent 3-10%, click-triggered 10%+ (self-selected audience).

### Output Format

For each popup recommendation provide: Type, Trigger, Targeting, Frequency, Copy (headline, subhead, CTA, decline), and Design notes. For multiple popups, include conflict rules to prevent overlap.

## Examples

### Example 1: Exit-Intent Discount Popup for DTC Skincare Brand

**User prompt:** "We run an organic skincare DTC store. Cart abandonment is around 72%. Create an exit-intent popup to recover abandoning shoppers."

The agent will assess the e-commerce context, then design an exit-intent popup:
- **Trigger:** Exit intent on product and cart pages, not on checkout
- **Targeting:** New visitors who have items in cart, exclude returning customers with active orders
- **Frequency:** Once per session, suppress for 14 days after dismissal
- **Headline:** "Your skin deserves this"
- **Subhead:** "Complete your order in the next 15 minutes and get free shipping"
- **CTA:** "Claim Free Shipping"
- **Decline:** "No thanks, I'll pay for shipping"
- **Design notes:** Show product thumbnail from cart, countdown timer, mobile bottom slide-up variant
- **Test hypothesis:** Free shipping vs. 10% discount as incentive

### Example 2: B2B SaaS Newsletter Signup Popup for Blog Readers

**User prompt:** "Our project management tool blog gets 45K monthly visitors but only 200 email signups. Design a popup to grow the list without hurting the reading experience."

The agent will analyze the content-heavy context and recommend a scroll-triggered popup:
- **Trigger:** 50% scroll depth on blog posts only, not on product or pricing pages
- **Targeting:** Visitors who have read at least 2 blog posts this session, exclude existing subscribers
- **Frequency:** Once per session, suppress 30 days after dismissal
- **Headline:** "Get the PM playbook every Tuesday"
- **Subhead:** "Join 8,400 product managers getting one actionable workflow tip per week. No fluff."
- **CTA:** "Send Me the Tips"
- **Decline:** "Maybe later"
- **Design notes:** Right-side slide-in on desktop (doesn't block reading), bottom slide-up on mobile, single email field, author avatar for trust
- **Test hypothesis:** Slide-in vs. center modal, with/without subscriber count social proof

## Guidelines

- Always check `.claude/product-marketing-context.md` before asking discovery questions
- Never recommend full-screen overlays on mobile as they violate Google's interstitial guidelines and damage SEO
- Always include a visible, easy-to-reach close mechanism on every popup
- Design popups with frequency capping and dismissal memory from the start, not as an afterthought
- Match popup offers to page context: product pages get product-related popups, blog posts get content offers
- Prioritize click-triggered popups for lead magnets since they have zero annoyance and highest conversion rates
- Test one variable at a time: trigger timing, copy, incentive, or format, but not all simultaneously
- Keep form fields minimal inside popups: email-only is ideal, email plus name is the maximum for most use cases
- Always provide mobile-specific design recommendations since popup UX differs significantly between desktop and mobile
