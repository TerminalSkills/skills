---
name: resume-tailor
description: >-
  Optimize your resume for specific job applications by matching keywords
  and highlighting relevant experience. Use when a user asks to tailor a
  resume, optimize a CV for a job, match a resume to a job description,
  improve ATS compatibility, customize a resume for a specific role, or
  align experience with job requirements.
license: Apache-2.0
compatibility: "No external dependencies required. Optionally uses Python for automated keyword analysis."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: ["resume", "ats", "job-search", "optimization", "keywords"]
  use-cases:
    - "Tailor an existing resume to match a specific job posting"
    - "Improve ATS keyword match rate for a target role"
    - "Rewrite bullet points to emphasize relevant experience"
  agents: ["claude-code", "openai-codex", "gemini-cli", "cursor"]
---

# Resume Tailor

## Overview

Optimize an existing resume for a specific job application by analyzing the job description, identifying keyword gaps, reordering sections for relevance, and rewriting bullet points to emphasize matching experience. Improve ATS (Applicant Tracking System) compatibility and increase interview callback rates.

## Instructions

When a user asks you to tailor their resume for a job, follow these steps:

### Step 1: Collect the inputs

You need two documents:
- **The resume**: The user's current resume (text, PDF, YAML, or markdown)
- **The job description**: The full job posting text

Read both documents and parse their content.

### Step 2: Extract job requirements

Analyze the job description and categorize requirements:

```
Required Skills:
  - Python (mentioned 3x)
  - AWS (mentioned 2x)
  - REST API design (mentioned 2x)
  - SQL (mentioned 1x)

Preferred Skills:
  - Kubernetes
  - GraphQL
  - Team leadership

Key Responsibilities:
  - Build scalable microservices
  - Mentor junior developers
  - Collaborate with product team

Soft Skills:
  - Communication
  - Problem-solving
  - Cross-functional collaboration
```

### Step 3: Analyze keyword match

Compare the resume against extracted requirements:

```python
import re

def analyze_keyword_match(resume_text, required_keywords, preferred_keywords):
    """Case-insensitive whole-word match. A plain substring test would count
    'Go' as found inside 'good' and 'R' inside 'React'."""
    results = []
    for priority, keywords in (("required", required_keywords), ("preferred", preferred_keywords)):
        for keyword in keywords:
            pattern = r"(?<![a-z0-9])" + re.escape(keyword.lower()) + r"(?![a-z0-9])"
            found = re.search(pattern, resume_text.lower()) is not None
            results.append({"keyword": keyword, "found": found, "priority": priority})

    match_rate = sum(r["found"] for r in results) / len(results)
    missing = [r["keyword"] for r in results if not r["found"]]
    return match_rate, missing
```

Present the analysis to the user:
```
Keyword Match Rate: 65% (target: 80%+)

Missing Required Keywords:
  - Kubernetes (add if you have experience)
  - GraphQL (add if you have experience)

Missing Preferred Keywords:
  - Team leadership (you have this - reword existing bullets)
```

### Step 4: Rewrite bullet points

For each experience entry, rewrite bullets to incorporate missing keywords where the user genuinely has that experience:

**Before:**
```
- Built backend services for the payments team
```

**After:**
```
- Designed and built scalable Python microservices for the payments platform,
  serving 100K+ daily transactions via REST APIs on AWS
```

Rules for rewriting:
- Only add keywords the candidate genuinely possesses
- Lead with action verbs matching the job description language
- Add quantifiable metrics where possible
- Mirror the terminology used in the job posting

### Step 5: Reorder sections

Prioritize sections based on what the job values most:
- If the role emphasizes skills: move Skills section above Experience
- If the role requires specific education: move Education up
- If the role values projects: add or promote a Projects section
- Always keep the most relevant experience entries first

### Step 6: Generate the tailored resume

Save the optimized resume and provide a comparison:

```
Tailored resume saved to: resume_tailored.md

Changes summary:
  - Keyword match rate: 65% -> 88%
  - Rewrote 6 bullet points to include target keywords
  - Moved Skills section above Experience
  - Added "Kubernetes" to skills (from your DevOps experience)
  - Reordered experience to lead with most relevant role
```

## Examples

### Example 1: Tailoring for a data engineering role

**User request:** "Optimize my software engineer resume for this data engineer position at Snowflake."

**Analysis output:**
```
Current match rate: 55%

Missing high-priority keywords:
  - Apache Spark (you mention PySpark - standardize to "Apache Spark")
  - Data pipelines (reword "ETL processes" to "data pipelines")
  - dbt (not in resume - add only if experienced)
  - Snowflake (add to skills if experienced)

Recommended changes:
  1. Rename "ETL processes" -> "data pipelines" in 2 bullet points
  2. Add "Apache Spark" alongside existing PySpark mentions
  3. Move data-related projects above web development experience
  4. Add a "Data Engineering" subsection to skills

Updated match rate: 82%
```

### Example 2: Career pivot resume optimization

**User request:** "I'm a frontend developer applying for a full-stack role. Help me emphasize my backend experience."

**Approach:**
1. Identify all backend-related experience currently buried in the resume
2. Rewrite the professional summary to position as full-stack
3. Promote any API, database, or server-side bullet points
4. Reorder skills to list backend technologies prominently
5. Add any backend side projects or contributions

### Example 3: ATS optimization pass

**User request:** "My resume keeps getting rejected by ATS systems. Help me fix it."

**Common ATS fixes:**
1. Replace creative section headers with standard ones ("Work Experience" not "My Journey")
2. Remove tables, columns, and graphics that ATS cannot parse
3. Spell out acronyms on first use ("Amazon Web Services (AWS)")
4. Use standard date formats (Jan 2020 - Present)
5. Include exact job title keywords from the posting
6. Save as plain text or simple formatted document

## Guidelines

- Never fabricate experience or skills. Only incorporate keywords the candidate genuinely possesses.
- Aim for an 80%+ keyword match rate with required skills from the job description.
- Preserve the candidate's authentic voice while aligning with job posting language.
- Use the exact terminology from the job description (e.g., if they say "CI/CD" don't write "continuous integration").
- Keep bullet points to 1-2 lines each. Dense paragraphs hurt both ATS parsing and human readability.
- Always show the user what changed with a before/after comparison.
- Suggest removing irrelevant experience that adds length without value for the target role.
- If the match rate is below 50%, honestly tell the user the role may not be a strong fit.
- Save both the original and tailored versions so the user can compare and revert.
