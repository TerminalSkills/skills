---
name: form-cro
description: When the user wants to optimize any form that is NOT signup/registration — including lead capture forms, contact forms, demo request forms, application forms, survey forms, or checkout forms. Also use when the user mentions "form optimization," "lead form conversions," "form friction," "form fields," "form completion rate," or "contact form." For signup/registration forms, see signup-flow-cro. For popups containing forms, see popup-cro.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - forms
    - conversion
    - optimization
---

# Form CRO

## Overview

You are an expert in form optimization. Your goal is to maximize form completion rates while capturing the data that matters. This skill covers lead capture, contact, demo request, application, survey, quote request, and checkout forms.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

Before providing recommendations, identify the form type, current state (field count, completion rate, mobile vs. desktop split, abandonment points), and business context (what happens with submissions, which fields are used in follow-up, compliance requirements).

## Instructions

### Core Principles

**Every Field Has a Cost.** Each additional field reduces completion rate. Rule of thumb: 3 fields is baseline, 4-6 fields cause 10-25% reduction, 7+ fields cause 25-50%+ reduction. For each field ask: Is this necessary before we can help them? Can we get this another way? Can we ask later?

**Value Must Exceed Effort.** Place a clear value proposition above the form, make what they get obvious, and reduce perceived effort through field count and labels.

**Reduce Cognitive Load.** One question per field, clear conversational labels, logical grouping and order, smart defaults where possible.

### Field-by-Field Optimization

- **Email**: Single field, no confirmation. Inline validation with typo detection. Proper mobile keyboard.
- **Name**: Test single "Name" vs. First/Last. Single field reduces friction; split only if personalization requires it.
- **Phone**: Make optional if possible. If required, explain why. Auto-format and handle country codes.
- **Company**: Auto-suggest for faster entry. Consider enrichment after submission or inferring from email domain.
- **Job Title/Role**: Dropdown if categories matter, free text if wide variation. Consider making optional.
- **Message/Comments**: Make optional. Reasonable character guidance. Expand on focus.
- **Dropdowns**: Use "Select one..." placeholder, searchable if many options, radio buttons if fewer than 5.

### Form Layout

**Field Order:** Start with easiest fields (name, email), build commitment before asking more, sensitive fields last (phone, company size), logical grouping if many fields.

**Labels and Placeholders:** Labels should always be visible (not just placeholder text). Placeholders show examples, not labels. Help text only when genuinely helpful.

**Visual Design:** Sufficient spacing between fields, clear visual hierarchy, CTA button stands out, mobile-friendly tap targets (44px+). Single column layout is higher completion and mobile-friendly; multi-column only for short related fields like First/Last name.

### Multi-Step Forms

Use multi-step when you have more than 5-6 fields, logically distinct sections, or conditional paths. Best practices: progress indicator (step X of Y), start easy and end with sensitive, one topic per step, allow back navigation, save progress, clear required vs. optional indication.

**Progressive Commitment Pattern:** Low-friction start (just email) then more detail (name, company) then qualifying questions then contact preferences.

### Error Handling

Validate as users move to next field, not while typing. Error messages should be specific, suggest how to fix, be positioned near the field, and never clear user input. On submit: focus first error field, summarize errors if multiple, preserve all entered data.

### Submit Button

**Copy:** Replace weak "Submit" or "Send" with action plus benefit: "Get My Free Quote," "Download the Guide," "Request Demo." Place immediately after last field, left-aligned with fields, sufficient size and contrast.

**Post-Submit:** Loading state with disabled button and spinner, success confirmation with clear next steps, error handling with clear message.

### Trust and Friction Reduction

Near the form: privacy statement ("We'll never share your info"), security badges if collecting sensitive data, testimonial or social proof, expected response time.

Reduce perceived effort: "Takes 30 seconds," field count indicator, remove visual clutter, generous white space. Address objections: "No spam, unsubscribe anytime," "We won't share your number," "No credit card required."

### Form Type-Specific Guidance

- **Lead Capture (Gated Content):** Minimum viable fields (often just email), clear value proposition, consider asking enrichment questions post-download.
- **Contact Form:** Essential: Email/Name + Message. Phone optional. Set response time expectations. Offer alternatives (chat, phone).
- **Demo Request:** Name, Email, Company required. Phone optional with "preferred contact" choice. Use case question helps personalize. Calendar embed increases show rate.
- **Quote/Estimate Request:** Multi-step often works well. Start easy, technical details later, save progress.
- **Survey Forms:** Progress bar essential, one question per screen, skip logic for relevance, consider incentive.

### Mobile Optimization

Larger touch targets (44px minimum), appropriate keyboard types (email, tel, number), autofill support, single column only, sticky submit button, minimal typing with dropdowns and buttons.

### Measurement

Track form start rate, completion rate, field drop-off, error rate by field, time to complete, and mobile vs. desktop completion. Instrument: form views, first field focus, each field completion, errors by field, submit attempts, and successful submissions.

### Output Format

**Form Audit:** For each issue provide Issue, Impact (estimated effect on conversions), Fix (specific recommendation), Priority (High/Medium/Low).

**Recommended Form Design:** Required fields with justified list, optional fields with rationale, recommended field order, copy (labels, placeholders, button), error messages for each field, layout guidance.

**Test Hypotheses:** A/B test ideas with expected outcomes for layout/flow, field optimization, copy/design, and form type-specific changes.

## Examples

### Example 1: B2B Demo Request Form Audit

**User prompt:** "Our demo request form has 12 fields and a 4% completion rate. Here's the URL: acme.com/request-demo. Can you audit it and recommend improvements?"

The agent will read the page, identify unnecessary fields (e.g., company revenue, employee count, industry that could be enriched post-submission via Clearbit), and provide a prioritized audit. It will recommend cutting to 5 core fields (Name, Work Email, Company, Job Title, "What challenge are you looking to solve?"), switching from a single-step layout to a 2-step progressive form, replacing the "Submit" button with "Book My Demo," adding a privacy note and expected response time, and estimating the completion rate improvement from 4% to 10-15%.

### Example 2: Newsletter Lead Capture Optimization

**User prompt:** "We have a lead capture form on our blog sidebar asking for name, email, company, and job title to download our State of DevOps 2025 report. Only 1.2% of visitors fill it out."

The agent will recommend reducing to email-only for the initial capture (since the report value should justify an email but 4 fields creates too much friction for a free download), moving enrichment questions to a post-download "thank you" page, rewriting the CTA from "Download" to "Get the Free Report," adding social proof ("Downloaded by 5,000+ DevOps leaders"), and testing a sticky bottom bar form vs. the sidebar placement. It will project a 3-5x improvement in capture rate with the reduced-friction approach.

## Guidelines

- Always justify every field. If you cannot explain why a field is needed before the first interaction, remove it.
- Never recommend clearing form data on validation errors.
- Prefer progressive profiling (collecting data over multiple interactions) over long single forms.
- Test single "Name" field vs. First/Last before assuming either approach.
- Mobile optimization is not optional. Over 50% of traffic is mobile for most sites.
- Be specific in audit recommendations. "Improve the form" is not actionable; "Remove the phone field and make company name auto-suggest" is.
- When recommending multi-step forms, always include a progress indicator and back navigation.
- Respect compliance requirements (GDPR consent checkboxes, required legal disclosures) even when they add friction.
