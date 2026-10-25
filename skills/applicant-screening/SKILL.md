---
name: applicant-screening
description: >-
  Screen job applications against requirements and score candidates
  objectively. Use when a user asks to review applications, evaluate
  candidates, screen resumes, rank applicants, assess qualifications
  against a job description, shortlist candidates, or build a hiring
  scorecard.
license: Apache-2.0
compatibility: "No external dependencies. Optionally uses Python for batch processing and scoring."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: "hiring, screening, recruitment, hr, candidates"
  use-cases: "Screen a batch of resumes against job requirements and rank candidates, Create an objective scoring rubric for a specific role, Generate shortlist recommendations with justification"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Applicant Screening

## Overview

Screen job applications objectively by evaluating candidates against defined requirements. Build scoring rubrics from job descriptions, assess each candidate's qualifications, and produce ranked shortlists with clear justifications. Reduce bias by applying consistent criteria across all applicants.

## Instructions

When a user asks you to screen candidates or review applications, follow these steps:

### Step 1: Define the scoring rubric

Extract requirements from the job description and assign weights:

```yaml
rubric:
  role: Senior Backend Engineer
  total_points: 100

  required_criteria:
    - name: "Python experience (5+ years)"
      max_points: 20
      scoring:
        - { range: "7+ years", points: 20 }
        - { range: "5-7 years", points: 15 }
        - { range: "3-5 years", points: 8 }
        - { range: "<3 years", points: 0 }

    - name: "Distributed systems experience"
      max_points: 15
      scoring:
        - { range: "Led design of distributed systems", points: 15 }
        - { range: "Contributed to distributed systems", points: 10 }
        - { range: "Basic understanding", points: 5 }
        - { range: "No experience", points: 0 }

    - name: "Cloud platform experience (AWS/GCP/Azure)"
      max_points: 15
      scoring:
        - { range: "3+ years production experience", points: 15 }
        - { range: "1-3 years", points: 10 }
        - { range: "Certification only", points: 5 }
        - { range: "None", points: 0 }

  preferred_criteria:
    - name: "Team leadership/mentoring"
      max_points: 10
      scoring:
        - { range: "Managed team of 3+", points: 10 }
        - { range: "Mentored individuals", points: 6 }
        - { range: "None mentioned", points: 0 }

    - name: "System design skills"
      max_points: 10
      scoring:
        - { range: "Designed large-scale systems", points: 10 }
        - { range: "Some design experience", points: 5 }
        - { range: "None mentioned", points: 0 }

  education:
    - name: "Relevant degree"
      max_points: 10
      scoring:
        - { range: "MS/PhD in CS or related", points: 10 }
        - { range: "BS in CS or related", points: 7 }
        - { range: "Bootcamp or self-taught with strong portfolio", points: 5 }

  culture_fit:
    - name: "Communication quality"
      max_points: 10
      scoring:
        - { range: "Clear, well-structured application", points: 10 }
        - { range: "Adequate", points: 5 }
        - { range: "Poorly written", points: 2 }

    - name: "Role alignment"
      max_points: 10
      scoring:
        - { range: "Clear interest in this specific role", points: 10 }
        - { range: "Generic application", points: 4 }
```

Present the rubric to the user for approval before screening.

### Step 2: Screen each candidate

For each application, evaluate against every criterion:

```
Candidate: Alice Chen
Resume: alice_chen_resume.pdf

Evaluation:
  Python experience: 20/20 - 8 years of Python at two companies
  Distributed systems: 15/15 - Led redesign of event-driven architecture
  Cloud platform: 10/15 - 2 years AWS, no multi-cloud experience
  Team leadership: 10/10 - Managed team of 5 engineers
  System design: 10/10 - Designed payment processing system at scale
  Relevant degree: 7/10 - BS Computer Science, Stanford
  Communication: 10/10 - Well-structured resume, clear achievements
  Role alignment: 8/10 - Cover letter references specific team projects

  TOTAL: 90/100
  Recommendation: STRONG YES - Advance to interview
```

### Step 3: Generate the ranked shortlist

```
SCREENING RESULTS - Senior Backend Engineer
============================================
Screened: 15 candidates
Date: 2026-10-13

SHORTLIST (Score >= 70):
  1. Alice Chen        - 90/100 - STRONG YES
  2. Marcus Johnson    - 85/100 - STRONG YES
  3. Priya Patel       - 78/100 - YES
  4. David Kim         - 72/100 - YES

MAYBE (Score 50-69):
  5. Sarah Williams    - 65/100 - Lacks distributed systems exp
  6. Tom Brown         - 58/100 - Junior for role level

DECLINE (Score < 50):
  7-15. [8 candidates below threshold]

NOTES:
  - Top 4 candidates meet all required criteria
  - Alice Chen and Marcus Johnson are standout candidates
  - Consider Sarah Williams if pipeline needs expansion
```

### Step 4: Save results

Save the full screening report:

```bash
# Save detailed report
cat > screening_report.md << 'EOF'
# Screening report: Senior Backend Engineer (15 candidates)
Alice Chen: 90/100, strong yes. Python 20/20, distributed systems 15/15 ...
EOF

# Save summary CSV for tracking
cat > screening_summary.csv << 'EOF'
candidate,score,recommendation,top_strength,gap
Alice Chen,90,Strong Yes,Distributed systems,None
Marcus Johnson,85,Strong Yes,Python expertise,Limited cloud
EOF
```

## Examples

### Example 1: Screen a batch of resumes

**User request:** "I have 20 resumes for our frontend developer role. Help me create a shortlist."

**Steps:**
1. Read the job description to build the rubric
2. Present the rubric for user approval
3. Read each resume file
4. Score each candidate against the rubric
5. Generate ranked shortlist with top 5-7 candidates
6. Save the report as `screening_report.md`

### Example 2: Create a custom scoring rubric

**User request:** "Build me a screening rubric for a product manager role that weighs user research experience heavily."

**Output:**
```yaml
rubric:
  role: Product Manager
  total_points: 100
  required_criteria:
    - name: "User research experience"
      max_points: 25  # Heavily weighted per request
    - name: "Product lifecycle management"
      max_points: 20
    - name: "Data-driven decision making"
      max_points: 15
    - name: "Stakeholder management"
      max_points: 15
  preferred_criteria:
    - name: "Technical background"
      max_points: 10
    - name: "Industry experience"
      max_points: 10
    - name: "Communication quality"
      max_points: 5
```

### Example 3: Re-evaluate with adjusted criteria

**User request:** "We decided Kubernetes experience is now required. Re-screen the candidates."

**Steps:**
1. Add Kubernetes as a required criterion (15 points)
2. Rebalance other criteria to maintain 100-point total
3. Re-evaluate all candidates against updated rubric
4. Generate updated shortlist and highlight ranking changes

## Guidelines

- Always present the scoring rubric to the user for approval before screening candidates.
- Apply the same rubric consistently to every candidate. Do not adjust mid-screening.
- Base scores only on evidence present in the application. Do not infer or assume qualifications.
- Note when a candidate's experience is ambiguous and flag it for the hiring manager to clarify.
- Remove identifying information (name, gender, age, photo) from the evaluation if the user requests blind screening.
- Check the rules where you hire before using automated scoring on real candidates: for example New York City Local Law 144 requires a bias audit and notice for automated employment decision tools, and the EU AI Act classes AI used for recruitment as high-risk. Keep a human reviewer on every decision.
- Never make final hiring decisions. Present scored recommendations and let the hiring team decide.
- Flag potential biases: if all top candidates share a background, note this for the user's awareness.
- Keep individual evaluations factual. Use "Resume does not mention X" rather than "Candidate lacks X."
- Save all screening artifacts so the process is auditable and repeatable.
- For large batches (20+ candidates), do a quick pre-screen first to eliminate clearly unqualified applicants before detailed scoring.
