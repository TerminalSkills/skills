---
name: cover-letter
description: >-
  Create compelling, personalized cover letters that help you stand out in
  job applications. Use when a user asks to write a cover letter, draft a
  job application letter, create a letter of interest, compose a motivation
  letter, or personalize an application for a specific company and role.
license: Apache-2.0
compatibility: "No external dependencies. Works with any text editor or document format."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: ["cover-letter", "job-application", "career", "writing", "hiring"]
  use-cases:
    - "Write a tailored cover letter for a specific job posting"
    - "Adapt an existing cover letter for a different role or company"
    - "Generate multiple cover letter variants for A/B testing applications"
  agents: ["claude-code", "openai-codex", "gemini-cli", "cursor"]
---

# Cover Letter

## Overview

Create polished, personalized cover letters tailored to specific job postings, companies, and roles. Analyze the job description, match the candidate's experience to requirements, and produce a compelling narrative that highlights relevant qualifications while demonstrating genuine interest in the role.

## Instructions

When a user asks you to write or improve a cover letter, follow these steps:

### Step 1: Collect inputs

Gather the following information from the user:
- **Job posting**: The full job description text or URL
- **Resume/CV**: The candidate's resume or key experience details
- **Company name**: The target company
- **Hiring manager** (optional): Name and title if known
- **Specific points** (optional): Anything the user wants to emphasize or avoid
- **Tone preference** (optional): Formal, conversational, enthusiastic, etc.

### Step 2: Analyze the job description

Extract from the job posting:
- **Key requirements**: Must-have skills and qualifications
- **Preferred qualifications**: Nice-to-have skills
- **Company values**: Mission, culture, and values mentioned
- **Role responsibilities**: Core duties and expectations
- **Keywords**: Technical terms, tools, and frameworks mentioned

### Step 3: Map candidate strengths to requirements

Create a mapping between the candidate's experience and job requirements:

```
Requirement: "5+ years Python experience"
  -> Match: "7 years building Python microservices at Shopify"

Requirement: "Experience with distributed systems"
  -> Match: "Designed event-driven architecture processing 2M events/day"

Requirement: "Team leadership"
  -> Match: "Mentored 4 junior engineers, led cross-functional projects"
```

Identify the 3-4 strongest matches to feature in the letter.

### Step 4: Write the cover letter

Structure the letter with these sections:

**Header:**
- Candidate name and contact info
- Date
- Hiring manager name and company address (if known)

**Opening paragraph (2-3 sentences):**
- State the specific role you are applying for
- Include a compelling hook: a relevant achievement, shared connection, or genuine enthusiasm for the company
- Mention how you found the role

**Body paragraph 1 (3-4 sentences):**
- Highlight your most relevant experience matching the top requirement
- Use a specific accomplishment with quantifiable results
- Connect this directly to what the role needs

**Body paragraph 2 (3-4 sentences):**
- Address 1-2 additional key requirements
- Demonstrate knowledge of the company's products, mission, or recent news
- Show how your skills solve their specific challenges

**Closing paragraph (2-3 sentences):**
- Reaffirm enthusiasm for the role and company
- Include a clear call to action (interview request)
- Thank the reader for their time

**Sign-off:**
- "Sincerely," or "Best regards,"
- Full name

### Step 5: Save the output

Save the cover letter in the user's preferred format:

```bash
# As a text file
cat > cover_letter.txt << 'EOF'
[cover letter content]
EOF

# As a markdown file for further formatting
cat > cover_letter.md << 'EOF'
[cover letter content with markdown formatting]
EOF
```

## Examples

### Example 1: Software engineer applying to a startup

**User request:** "Write a cover letter for this senior backend engineer role at Stripe. Here's the job posting and my resume."

**Output structure:**
```
Dear Hiring Team at Stripe,

[Opening: Mention the specific role, reference Stripe's payment
infrastructure mission, and lead with a relevant achievement]

[Body 1: Highlight experience building high-throughput APIs that
aligns with Stripe's scale requirements, include metrics]

[Body 2: Connect distributed systems experience to Stripe's
technical challenges, mention familiarity with their developer
tools and API design philosophy]

[Closing: Express enthusiasm for Stripe's mission to increase
the GDP of the internet, request an interview]

Best regards,
[Name]
```

### Example 2: Career changer entering a new field

**User request:** "I'm transitioning from teaching to UX design. Help me write a cover letter that addresses the career change."

**Approach:**
1. Identify transferable skills: communication, curriculum design, user empathy, presenting complex information clearly
2. Reframe teaching experience as UX-relevant: "Designing lesson plans for diverse learners parallels designing user experiences for diverse audiences"
3. Highlight any UX-specific training, bootcamps, or portfolio projects
4. Address the transition directly and positively in the opening

### Example 3: Refreshing an existing cover letter for a new role

**User request:** "I have a cover letter I used for a PM role at Google. Adapt it for a similar role at Microsoft."

**Steps:**
1. Read the existing cover letter
2. Replace all Google-specific references with Microsoft equivalents
3. Research Microsoft's current priorities and products
4. Adjust the company-knowledge paragraph to reference Microsoft-specific initiatives
5. Update the opening hook to reflect Microsoft's mission
6. Save as a new file preserving the original

## Guidelines

- Keep the letter to one page (300-400 words). In a 2023 Resume Genius survey of 625 U.S. hiring managers, 84% said they spend two minutes or less on a cover letter.
- Never use generic phrases like "I am writing to apply for..." as an opener. Start with something specific and engaging.
- Every sentence should either demonstrate a qualification or show knowledge of the company. Remove filler.
- Use the same keywords from the job description naturally in the letter to pass ATS screening.
- Include at least one quantifiable achievement (percentage, dollar amount, user count, time saved).
- Do not repeat the resume verbatim. The cover letter should complement the resume by adding context and narrative.
- Match the tone to the company culture: formal for finance/law, conversational for startups, balanced for tech.
- If the hiring manager's name is unknown, use "Dear Hiring Team at [Company]" rather than "To Whom It May Concern."
- Proofread for spelling of the company name, hiring manager name, and role title. Getting these wrong is an immediate rejection.
- Always save the output file and confirm the path to the user.
