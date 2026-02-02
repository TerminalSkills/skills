---
name: job-description
description: >-
  Create compelling job postings with requirements, responsibilities, and
  qualifications. Use when a user asks to write a job description, create a
  job posting, draft a job listing, build a role specification, define job
  requirements, or compose a hiring ad for a position.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: ["hiring", "job-posting", "recruitment", "hr", "writing"]
  use-cases:
    - "Write a complete job description for a new role"
    - "Rewrite an existing job posting to be more inclusive and appealing"
    - "Generate multiple job description variants for different job boards"
  agents: ["claude-code", "openai-codex", "gemini-cli", "cursor"]
---

# Job Description

## Overview

Create clear, compelling job descriptions that attract qualified candidates. Structure postings with role summaries, responsibilities, requirements, and company information. Optimize for both human readers and job board search algorithms while using inclusive language.

## Instructions

When a user asks you to write a job description, follow these steps:

### Step 1: Gather role details

Ask the user for:
- **Job title**: The official title and any alternate titles candidates might search
- **Department/team**: Where the role sits in the organization
- **Level**: Junior, mid, senior, lead, manager, director, etc.
- **Location**: On-site, hybrid, remote, or specific city
- **Compensation range** (optional): Salary band, equity, bonus
- **Reporting structure**: Who this role reports to and any direct reports
- **Key objectives**: What success looks like in the first 6-12 months
- **Must-have skills**: Non-negotiable requirements
- **Nice-to-have skills**: Preferred but not required qualifications

### Step 2: Structure the job description

Use this proven format:

```markdown
# [Job Title]

**Location:** [Location] | **Type:** [Full-time/Part-time/Contract]
**Department:** [Department] | **Reports to:** [Title]
[**Compensation:** $X - $Y + benefits]

## About [Company Name]

[2-3 sentences about the company, mission, and what makes it a great
place to work. Focus on impact and culture, not just what you do.]

## About the Role

[3-4 sentences describing the role, its impact on the team and company,
and why it exists. Paint a picture of what the day-to-day looks like.
This is your chance to excite candidates.]

## What You'll Do

- [Responsibility 1 - start with action verb, be specific]
- [Responsibility 2 - explain impact, not just task]
- [Responsibility 3]
- [Responsibility 4]
- [Responsibility 5]
- [Responsibility 6 - aim for 5-8 bullets]

## What We're Looking For

**Required:**
- [X+ years of experience in Y]
- [Specific technical skill]
- [Specific domain knowledge]
- [Keep to 4-6 truly required items]

**Nice to Have:**
- [Preferred skill 1]
- [Preferred skill 2]
- [Preferred skill 3]

## What We Offer

- [Compensation and equity]
- [Health/dental/vision benefits]
- [PTO and flexibility]
- [Learning and development]
- [Other perks]

## How to Apply

[Application instructions, what to include, timeline expectations]

---
*[Company Name] is an equal opportunity employer. We celebrate diversity
and are committed to creating an inclusive environment for all employees.*
```

### Step 3: Optimize the content

**For candidates:**
- Lead with impact, not requirements
- Use "you" language: "You'll build..." not "The candidate will build..."
- Show growth opportunities and learning potential
- Be transparent about compensation when possible

**For search/SEO:**
- Use the most common job title candidates search for
- Include relevant technical keywords naturally
- Add location keywords for local search

**For inclusivity:**
- Avoid gendered language ("rockstar", "ninja", "he/she")
- Separate required from nice-to-have to avoid discouraging qualified candidates
- Focus on skills and outcomes rather than specific degree requirements
- Use "X+ years of experience with Y" rather than arbitrary year counts when possible

### Step 4: Save the output

```bash
cat > job_description.md << 'EOF'
[formatted job description]
EOF
```

Provide the file path and offer to create variants for different job boards.

## Examples

### Example 1: Senior software engineer posting

**User request:** "Write a job description for a senior backend engineer on our payments team."

**Output structure:**
```markdown
# Senior Backend Engineer, Payments

**Location:** Remote (US) | **Type:** Full-time
**Department:** Engineering - Payments | **Reports to:** Engineering Manager
**Compensation:** $180,000 - $220,000 + equity

## About [Company]
[Mission-driven description of the company and payments team impact]

## About the Role
You'll design and build the core payment processing infrastructure
that handles millions of transactions daily. This is a high-impact
role where your work directly affects revenue and customer trust...

## What You'll Do
- Design and implement scalable payment processing services in Python
- Own the reliability of systems processing $X in daily transactions
- Lead technical design reviews and mentor junior engineers
- Collaborate with product and compliance teams on new payment methods
- Improve observability and reduce incident response time
- Contribute to API design standards and engineering best practices

## What We're Looking For
**Required:**
- 5+ years building production backend systems
- Strong Python and SQL experience
- Experience with distributed systems and message queues
- Understanding of payment processing or financial systems

**Nice to Have:**
- Experience with PCI-DSS compliance
- Kubernetes and infrastructure-as-code
- Previous fintech or payments industry experience
```

### Example 2: Rewriting an existing posting for inclusivity

**User request:** "Our developer job posting only gets male applicants. Help me rewrite it."

**Common fixes:**
1. Replace "rockstar developer" with "skilled engineer"
2. Change "must have CS degree" to "degree in CS or equivalent experience"
3. Reduce required qualifications list (research shows women apply when meeting 100% of requirements vs men at 60%)
4. Add explicit diversity statement
5. Highlight mentorship, collaboration, and growth over individual heroics
6. Remove unnecessary years-of-experience requirements

### Example 3: Multiple variants for different platforms

**User request:** "Create versions of this job posting for LinkedIn, our careers page, and Hacker News."

**Variants:**
- **LinkedIn:** Full structured format with company branding language
- **Careers page:** Detailed version with benefits, team info, and application form
- **Hacker News (Who's Hiring):** Concise 150-word version with key details, tech stack, and salary range upfront

## Guidelines

- Keep the total posting between 400-700 words. Longer postings have lower completion rates.
- Always separate required from nice-to-have qualifications. Mixing them discourages strong candidates.
- Include compensation ranges when the user permits it. Postings with salary ranges get significantly more applications.
- Use active voice and present tense throughout: "You'll build" not "Will be responsible for building."
- Limit required qualifications to 4-6 items. Each additional requirement reduces the applicant pool.
- Avoid jargon and internal terminology that external candidates will not understand.
- Include a clear equal opportunity statement.
- Describe what the person will accomplish, not just what they will do. "Reduce checkout latency by 50%" is more compelling than "Optimize backend performance."
- Review for unconscious bias: tools like Textio or Gender Decoder can help, but manual review of language is also important.
- Always save the output and confirm the file path.
