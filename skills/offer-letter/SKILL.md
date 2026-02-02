---
name: offer-letter
description: >-
  Create formal employment offer letters with compensation details and
  terms. Use when a user asks to write an offer letter, draft an employment
  offer, create a job offer, compose a compensation letter, generate a
  formal hiring letter, or prepare an employment agreement for a candidate.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: ["hiring", "offer-letter", "hr", "employment", "compensation"]
  use-cases:
    - "Generate a formal offer letter for a new hire with full compensation details"
    - "Create offer letter templates for different role levels"
    - "Draft a revised offer with updated compensation terms"
  agents: ["claude-code", "openai-codex", "gemini-cli", "cursor"]
---

# Offer Letter

## Overview

Create professional, legally-informed employment offer letters that clearly communicate compensation, benefits, start date, and terms of employment. Generate properly structured documents that reflect the company's tone while covering all essential elements a candidate needs to make an informed decision.

## Instructions

When a user asks you to create an offer letter, follow these steps:

### Step 1: Collect offer details

Gather the following from the user:
- **Candidate name**: Full legal name
- **Job title**: Official title for the role
- **Department/team**: Where the candidate will work
- **Manager name and title**: Direct supervisor
- **Start date**: Proposed first day
- **Employment type**: Full-time, part-time, contract, at-will
- **Compensation**:
  - Base salary (annual) and pay frequency
  - Equity/stock options (shares, vesting schedule)
  - Signing bonus (amount, clawback terms)
  - Performance bonus (target percentage)
- **Benefits summary**: Health, dental, vision, 401k match, PTO
- **Location**: Office, hybrid schedule, or remote
- **Reporting structure**: Who they report to
- **Offer expiration date**: Deadline to accept
- **Contingencies**: Background check, references, etc.

### Step 2: Structure the offer letter

```markdown
[Company Letterhead / Logo]

[Date]

[Candidate Full Name]
[Candidate Address]

Dear [Candidate First Name],

We are thrilled to extend an offer of employment for the position of
**[Job Title]** at [Company Name]. After our interviews, we are
confident you will make a valuable contribution to our [Department] team.

## Position Details

- **Title:** [Job Title]
- **Department:** [Department]
- **Reports to:** [Manager Name], [Manager Title]
- **Location:** [Office location / Remote / Hybrid]
- **Start date:** [Proposed Start Date]
- **Employment type:** [Full-time, at-will]

## Compensation

- **Base salary:** $[Amount] per year, paid [biweekly/semi-monthly]
- **Signing bonus:** $[Amount], payable within 30 days of start date
  [Subject to repayment if you voluntarily leave within 12 months]
- **Annual bonus:** Target of [X]% of base salary, based on individual
  and company performance, prorated for your first year
- **Equity:** [X,XXX] stock options at a strike price of $[X.XX],
  vesting over 4 years with a 1-year cliff (25% after year 1,
  then monthly over remaining 3 years)

## Benefits

You will be eligible for our comprehensive benefits package, including:
- Medical, dental, and vision insurance (effective first day)
- [X] days of paid time off per year
- [X] paid holidays
- 401(k) plan with [X]% company match
- [Additional benefits: parental leave, learning stipend, etc.]

Full benefits details will be provided during onboarding.

## Contingencies

This offer is contingent upon:
- Successful completion of a background check
- Verification of your eligibility to work in [country]
- [Any other contingencies]

## At-Will Employment

Your employment with [Company Name] is at-will, meaning either party
may terminate the employment relationship at any time, with or without
cause or notice. This letter does not constitute an employment contract
for any specific duration.

## Next Steps

To accept this offer, please sign below and return this letter by
**[Expiration Date]**. If you have questions, please contact
[HR Contact Name] at [email] or [phone].

We are excited about the possibility of you joining our team and look
forward to your response.

Sincerely,

_________________________
[Signer Name]
[Signer Title]
[Company Name]

---

**Acceptance**

I, [Candidate Name], accept the offer of employment as described above.

Signature: _________________________

Date: _________________________
```

### Step 3: Customize tone and detail level

Adjust the letter based on:
- **Company stage**: Startups may be more casual; enterprises more formal
- **Role level**: Executive offers need more detail on equity and severance
- **Location**: International offers may need visa sponsorship language
- **Negotiation context**: If this is a revised offer, acknowledge the updates

### Step 4: Save and deliver

```bash
cat > offer_letter_[candidate_last_name].md << 'EOF'
[formatted offer letter]
EOF
```

Remind the user to have legal/HR review the letter before sending.

## Examples

### Example 1: Standard software engineer offer

**User request:** "Write an offer letter for Jane Smith, Senior Software Engineer, $190K base, 10K shares, starting March 3rd."

**Key elements:**
- Base salary: $190,000/year, paid semi-monthly
- Equity: 10,000 stock options, 4-year vest with 1-year cliff
- Standard benefits package
- At-will employment
- 5-day acceptance window

### Example 2: Executive offer with signing bonus

**User request:** "Draft an offer for our new VP of Engineering with a $50K signing bonus and accelerated vesting."

**Additional elements:**
- Signing bonus with 24-month clawback provision
- Accelerated vesting on change of control
- Severance terms (e.g., 6 months base salary)
- Detailed reporting structure and scope
- Board observer rights if applicable

### Example 3: Revised offer after negotiation

**User request:** "The candidate countered. Update the offer from $170K to $185K and add a $15K signing bonus."

**Approach:**
1. Read the original offer letter
2. Update base salary to $185,000
3. Add signing bonus of $15,000 with standard clawback terms
4. Add a line acknowledging the revision: "We are pleased to present this revised offer..."
5. Keep the same expiration date or extend by a few days
6. Save as a new file, preserving the original

## Guidelines

- Always remind the user to have legal counsel or HR review the offer letter before sending. This skill generates a draft, not legal advice.
- Include all material compensation terms. Ambiguity in an offer letter damages trust.
- Be explicit about at-will employment status where applicable.
- Clearly state all contingencies (background check, right-to-work verification).
- Set a reasonable acceptance deadline (typically 3-7 business days).
- Use warm, welcoming language. The offer letter is a key part of the candidate experience.
- For equity, specify: number of shares, strike price (if known), vesting schedule, and cliff period.
- For signing bonuses, always include clawback terms and payment timeline.
- Never include confidential company information like cap table details or specific revenue numbers.
- Include clear next steps so the candidate knows exactly what to do.
- Save both the markdown and suggest the user convert to PDF on company letterhead for the final version.
