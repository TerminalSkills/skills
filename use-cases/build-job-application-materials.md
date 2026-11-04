---
title: "Build Targeted Job Application Materials"
slug: build-job-application-materials
description: "Create tailored CVs and cover letters for specific job postings by analyzing role requirements, matching candidate experience, and optimizing for applicant tracking systems."
skills:
  - cv-builder
  - cover-letter
category: business
tags:
  - job-search
  - resume
  - career
  - hiring
---

# Build Targeted Job Application Materials

## The Problem

A senior software engineer with 8 years of experience is applying to 5-6 positions per week across different company types: startups, enterprise, and FAANG. Each role emphasizes different aspects of their background. Sending the same generic resume to every posting gets a 3% response rate.

Tailoring each application manually takes 2-3 hours per job, and they cannot sustain that volume alongside a full-time role. Their current CV lists every technology they have touched but buries the relevant achievements under a wall of bullet points. Their cover letters are generic enough that a recruiter could swap in any company name without noticing the difference.

## The Solution

Use the **cv-builder** skill to generate role-specific CVs, and the **cover-letter** skill to write concise letters that connect the candidate's background to the specific role requirements.

cv-builder works from a YAML file rendered with RenderCV (v2.x, needs Python 3.12+; `pip install "rendercv[full]"` bundles Typst, so no LaTeX is needed). One YAML file per target role is the unit of tailoring: the agent edits the file, `rendercv render` produces the PDF. Give the agent only facts and numbers you can defend in an interview; it should reorder and rephrase your experience, never invent employers, metrics or skills.

## Step-by-Step Walkthrough

### 1. Analyze the target job posting

Extract key requirements and priorities from the job description to guide both documents:

> Analyze this Senior Backend Engineer posting at Greenledger (a climate-accounting startup, Series B, 120 employees; the company is fictional, use your real posting). Extract the top 5 required skills, 3 preferred qualifications, and the key themes in the role description. Identify which of my experiences are most relevant: I have 4 years building distributed systems at a fintech startup, 2 years on infrastructure at a mid-size SaaS company, and 2 years as a full-stack engineer at an agency. I led a team of 4, reduced API latency by 60%, and migrated a monolith to microservices.

The analysis should rank requirements by emphasis in the posting. Skills mentioned in the first two paragraphs and repeated throughout carry more weight than those listed near the bottom.

### 2. Generate a tailored CV

Build a CV that leads with the most relevant experience for this specific posting:

> Generate a one-page CV for the Greenledger Senior Backend Engineer role. Lead with my distributed systems experience at Pinnacle Fintech since that matches their microservices architecture requirement. Quantify achievements: reduced P99 API latency from 1200ms to 480ms, designed event-driven architecture handling 2.3M daily transactions, led migration from monolith to 12 microservices over 6 months. Include my AWS and Kubernetes experience prominently since the posting mentions cloud infrastructure. Place my agency experience last and keep it to two lines. Use a clean, ATS-friendly format with no columns, tables, or graphics.

Every bullet point should follow the "accomplished X by doing Y, resulting in Z" pattern, and the first bullet under each role should be the strongest, because many readers skim.

The agent writes `Alex_Rivera_greenledger.yaml`. This is the shape RenderCV validates; unknown keys are rejected, and `end_date: present` marks the current job:

```yaml
cv:
  name: Alex Rivera
  headline: Senior Backend Engineer
  location: Austin, TX
  email: alex.rivera@example.com
  social_networks:
    - network: GitHub
      username: alexrivera
  sections:
    summary:
      - Backend engineer with 8 years in distributed systems and Kubernetes; led a team of 4 through a monolith-to-microservices migration.
    experience:
      - company: Pinnacle Fintech
        position: Senior Backend Engineer
        start_date: 2020-02
        end_date: present
        highlights:
          - Cut P99 API latency from 1200 ms to 480 ms by caching hot reads and batching writes
          - Designed an event-driven architecture handling 2.3M transactions per day on Kubernetes
    skills:
      - label: Infrastructure
        details: AWS, Kubernetes, Terraform, CI/CD
design:
  theme: engineeringresumes
```

Render it into its own folder so variants do not overwrite each other (RenderCV names the files after `cv.name`):

```console
$ rendercv render Alex_Rivera_greenledger.yaml -o out/greenledger
```

`engineeringresumes` and `classic` are single-column themes that suit applicant tracking systems. Look at the generated PNG before sending: dates that wrap or a spilled second page are the usual problems.

### 3. Write a targeted cover letter

Draft a cover letter that connects specific achievements to the role requirements:

> Write a cover letter for the Greenledger Senior Backend Engineer position. Open with genuine interest in climate tech, referencing their carbon accounting platform (details pasted below). Connect my monolith-to-microservices migration directly to their stated need for someone who can scale their data pipeline. Mention the latency optimization work as evidence of performance engineering skills. Keep it to 300-350 words. Address it to the hiring manager (name and title from the posting; if the posting has none, use "Dear Hiring Team at Greenledger"). Close with the engineering challenges of scaling a team from 120 to 300 employees. Use only the facts about Greenledger that I paste below; do not guess at their products or funding.

A cover letter should never restate the resume. Its job is to answer "why this company" and "why you should read my resume more carefully." Company-specific references show the candidate did research beyond reading the job posting.

### 4. Optimize for applicant tracking systems

Review both documents for keyword coverage and ATS compatibility:

> Review my CV and cover letter against the Greenledger job posting for ATS optimization. Check that these keywords from the posting appear in my materials where they are true: distributed systems, microservices, event-driven architecture, PostgreSQL, Kubernetes, CI/CD, data pipelines. Flag any important posting keywords I am missing. Verify the CV format uses standard section headers (Experience, Education, Skills) that ATS parsers expect. Ensure no critical information is in headers or footers where parsers might miss it.

Compare the agent's keyword list against the posting yourself; only add a keyword if you have actually done the work. ATS optimization means placing keywords in context, not stuffing them into a skills section. A bullet point that says "migrated data pipelines from batch to event-driven architecture on Kubernetes" covers three keywords naturally while also demonstrating experience.

### 5. Prepare variant for a different role type

Adapt the base materials for a contrasting role at an enterprise company:

> Using the same work history, copy the YAML to `Alex_Rivera_observa.yaml` and generate a CV variant for the Staff Platform Engineer role at Observa (also fictional). Reorder to emphasize infrastructure and observability experience. Elevate the Kubernetes cluster management work and the monitoring dashboards I built at SaaSGrid. Leave the full-stack agency job off. Render it to `out/observa`, then write a new cover letter that focuses on platform engineering at scale rather than climate impact.

The same experience tells different stories depending on what you emphasize. Infrastructure roles want to see scale numbers (requests per second, cluster size, uptime). Product roles want to see user impact (conversion improvements, feature adoption).

## Real-World Example

The engineer starts their weekly application batch on Sunday evening, with one YAML file and one cover letter per role. For the Greenledger role, the CV leads with the distributed systems work and the cover letter references their carbon accounting platform by name. For the Observa role, the same experience is reframed around infrastructure and observability. For a startup CTO role at a seed-stage company, a third variant leads with the team leadership experience and monolith migration.

Each application takes about 20 minutes, mostly spent checking the agent's draft against the facts, instead of 2.5 hours. In this engineer's own numbers, the targeted batch produced 4 interviews from 12 applications, compared with 1 from 30 with the generic resume. Results vary with the market and the role, but a CV that leads with what the posting asks for gives a recruiter less to dig through.
