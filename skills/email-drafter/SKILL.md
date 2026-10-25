---
name: email-drafter
description: >-
  Draft professional emails for various business scenarios with appropriate tone
  and structure. Use when a user asks to write an email, compose a message,
  draft a reply, write a follow-up, create an outreach email, respond to a
  client, write a cold email, or craft any professional correspondence.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: productivity
  tags: "email, writing, communication, business, outreach"
  use-cases: "Draft professional emails for client communication and follow-ups, Write cold outreach emails for sales, partnerships, or recruiting, Compose internal emails for team updates, requests, and announcements"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Email Drafter

## Overview

Draft clear, professional emails for any business scenario. Handles client communication, internal updates, cold outreach, follow-ups, apologies, requests, and announcements. Adapts tone from formal to casual based on context, audience, and relationship.

## Instructions

When a user asks you to draft an email, follow these steps:

### Step 1: Determine the email type and tone

| Type | Tone | Key Characteristics |
|------|------|-------------------|
| Client communication | Professional, warm | Clear expectations, polite, solution-oriented |
| Cold outreach | Concise, compelling | Short, value-focused, clear CTA |
| Internal update | Direct, informative | Scannable, action items highlighted |
| Follow-up | Polite, persistent | Reference previous context, add value |
| Apology/issue | Empathetic, accountable | Acknowledge problem, provide solution, timeline |
| Request | Respectful, specific | Clear ask, context for why, easy to say yes |
| Introduction | Friendly, professional | Brief background, purpose of connection |
| Announcement | Enthusiastic, clear | Key info upfront, details below |

### Step 2: Gather context

Before drafting, identify:
- **Recipient:** Who are they? What is the relationship?
- **Purpose:** What is the single main goal of this email?
- **Context:** Any previous conversations, meetings, or events to reference?
- **Desired action:** What should the recipient do after reading?
- **Constraints:** Urgency, sensitivity, formality level?

### Step 3: Write using email structure

```
Subject: [Specific, actionable subject line - under 60 characters]

[Greeting appropriate to relationship],

[Opening: 1 sentence of context or connection]

[Body: 2-4 short paragraphs covering the main points]
- Use bullet points for lists or multiple items
- Bold key dates, numbers, or action items
- Keep paragraphs to 2-3 sentences max

[Clear call to action: What do you need from them?]

[Closing],
[Name]
```

### Step 4: Apply tone rules

**Formal:** Full sentences, no contractions, titles (Mr./Ms./Dr.), "I would appreciate", "Please find attached"

**Professional:** Contractions OK, first names, "Thanks for", "Let me know if", "Happy to discuss"

**Casual:** Short sentences, friendly openers, "Hey", "Quick note", "Cheers"

### Step 5: Review checklist

- [ ] Subject line is specific and under 60 characters
- [ ] Purpose is clear within the first 2 sentences
- [ ] Only one main ask or CTA per email
- [ ] No wall of text (break into short paragraphs)
- [ ] Proofread for tone consistency
- [ ] Removed unnecessary qualifiers ("just", "I think maybe")

## Examples

### Example 1: Client follow-up after a meeting

**User request:** "Write a follow-up email to a client after a product demo"

**Output:**
```
Subject: Next Steps from Today's Demo

Hi Priya,

Thanks for taking the time to see Ledgerline in action today. It was great
hearing about your team's month-end reconciliation backlog, especially the
three days your analysts spend matching bank feeds by hand.

Based on our conversation, here's what I'd suggest as next steps:

- **Trial setup:** I can have a sandbox workspace ready for your finance
  team by June 17. No commitment needed.
- **Bank feed integration:** Our engineers can scope the connection to your
  Chase and Wells Fargo accounts. I'll send a short questionnaire on the
  account formats you use.
- **Pricing:** I'll put together a proposal for the 50-seat plan we discussed.

Would June 19 at 2pm work for a 15-minute call to walk through the
proposal? Happy to work around your schedule.

Best,
Daniel
```

### Example 2: Cold outreach email

**User request:** "Write a cold email to a VP of Engineering about our dev tool"

**Output:**
```
Subject: Cut your team's PR review time by 40%

Hi Marcus,

I noticed Brightwell recently grew your platform team past 80 engineers.
Review queues usually become the first bottleneck at that size.

We built Reviewly to take over the repetitive parts of PR review: style
checks, secret scanning, and missing-test flags. Before a human opens the
diff, the bot has already commented on the mechanical issues.

Would you be open to a 15-minute call next week to see whether this fits
your team? No slides, just a live look at a sample pull request.

Best,
Daniel
```

### Example 3: Internal team announcement

**User request:** "Draft an email announcing a new deployment process to the engineering team"

**Output:**
```
Subject: New Deployment Process Starting March 1

Hi team,

Starting March 1, we're moving to a new deployment process. Here's
what changes and what stays the same.

**What's changing:**
- Deployments now go through the CI/CD pipeline (no more manual deploys)
- All PRs require passing staging tests before merge
- Rollbacks are automated — triggered if error rate exceeds 1%

**What stays the same:**
- Deploy schedule (daily at 2pm ET)
- Hotfix process for critical issues
- Your current branch naming conventions

**What you need to do:**
1. Read the updated runbook: [link]
2. Test your service in the new staging environment by February 27
3. Reach out in #deploy-help with any questions

I'll hold a 30-minute walkthrough on February 26 at 3pm ET. The
calendar invite is on its way.

Thanks,
Daniel
```

## Guidelines

- One email, one purpose. If there are multiple unrelated asks, suggest splitting into separate emails.
- Front-load the important information. Busy people read the first 2 sentences and scan the rest.
- Subject lines should tell the recipient what the email is about and what they need to do.
- Avoid passive voice where possible. "I'll send the report by Friday" beats "The report will be sent by Friday."
- Keep emails under 200 words when possible. Every sentence should earn its place.
- For cold emails, keep the body short enough to read on a phone without scrolling (roughly 125 words or fewer). Shorter is a style choice, not a measured result, so do not promise reply rates.
- Never use "per my last email" or other passive-aggressive phrases.
- Match the formality of the relationship. When in doubt, start slightly more formal and adjust.
- Always include a specific, easy-to-answer call to action. "Thoughts?" is vague. "Does Thursday at 2pm work?" is actionable.
- If the user provides context about the recipient or situation, weave it into the email naturally.
