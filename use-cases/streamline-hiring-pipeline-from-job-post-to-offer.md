---
title: "Streamline the Hiring Pipeline from Job Post to Offer Letter"
slug: streamline-hiring-pipeline-from-job-post-to-offer
description: "Automate the full recruiting workflow by generating job descriptions, screening applicants, and producing offer letters in a single pipeline."
skills:
  - job-description
  - applicant-screening
  - offer-letter
  - resume-tailor
category: business
tags:
  - hiring
  - recruiting
  - hr
  - talent-acquisition
---

# Streamline the Hiring Pipeline from Job Post to Offer Letter

## The Problem

A growing startup needs to fill 6 engineering positions in 8 weeks. The HR manager writes each job description from scratch, reads 200+ resumes per role, and drafts each offer letter before sending it through legal review. That is 12-15 hours of administrative work per role. Job descriptions are inconsistent and attract the wrong candidates, resume screening depends on who happens to review, and offer letters take days because they shuttle between HR, legal and the hiring manager.

## The Solution

Four skills cover the drafting and sorting, while people keep every decision about a candidate:

- **job-description** drafts consistent postings, including the pay range.
- **resume-tailor** extracts the role's requirements into a short list, so the posting, the screening rubric and the interview plan all use the same terms.
- **applicant-screening** scores each application against an approved rubric and explains each score with evidence from the resume.
- **offer-letter** drafts the offer for legal and HR review.

The tools produce drafts and recommendations. A person reads every application that matters, decides who advances, who is declined and what is offered. No candidate is rejected automatically because of a score.

## Step-by-Step Walkthrough

### 1. Generate standardized job descriptions

> Use job-description to create a posting for Senior Backend Engineer. Requirements: 5+ years Python, PostgreSQL, distributed systems, AWS. The role reports to the VP of Engineering. Compensation: $165,000-$195,000 base plus 0.1-0.15% equity. Culture: code review rigor, on-call rotation, 20% time for technical exploration. Give me a full version for the careers page and a shorter one for job boards.

Keep the pay range in the posting: several US states and cities (for example Colorado, California, Washington and New York City) require it, and candidates filter on it. Have the hiring manager read the draft for requirements that are really preferences; every "required" item becomes a hard filter later.

### 2. Extract the requirements once

> Use resume-tailor's requirement-extraction step on the Senior Backend Engineer posting. List required skills, preferred skills, responsibilities and soft skills, using the posting's exact terms.

resume-tailor is built for candidates tailoring their own resume, and this pipeline uses only its analysis steps (requirement extraction and keyword matching), never its resume-rewriting steps. The output is a plain list the hiring manager approves. It becomes the input to the rubric in the next step and to the interview plan in step 4.

### 3. Screen applications against an approved rubric

> Use applicant-screening. Build a rubric for Senior Backend Engineer from the approved requirements: Python experience, distributed systems, cloud platform, system design, communication, and role alignment, with points per level. Show me the rubric before screening anyone.

Approve the rubric first; the skill applies the same one to every application and does not change it mid-run. Then run the batch:

> Screen the 214 applications in /hiring/backend-senior/applications/ against the approved rubric. For each, give the score per criterion with the evidence from the resume. Write /hiring/backend-senior/screening_summary.csv and a report.

The output is a ranked list in tiers, with the evidence next to each score. Treat it as a reading order, not a verdict:

- **The recruiter reads the evidence for the top tier** and decides who advances to a phone screen.
- **The middle tier and anyone flagged "ambiguous" are read by a person**, because a resume that does not mention a skill is not proof the candidate lacks it.
- **The bottom tier is sampled by a person before anyone is declined.** Read a sample of 20 to see whether the rubric is excluding people it should not, such as career changers, or candidates from non-traditional backgrounds. The skill also flags it when every top candidate shares the same background.

Check the rules where you hire before using automated scoring on real candidates. New York City Local Law 144 requires a bias audit and notice for automated employment decision tools, and the EU AI Act classes AI used for recruitment as high-risk. Blind screening (names, photos and ages removed) is available on request. Keep the rubric, scores and decisions, so the process can be audited and repeated.

### 4. Prepare the interview focus for shortlisted candidates

> For each shortlisted candidate, compare their resume with the approved requirements list from step 2: which required skills the resume shows evidence for, which it does not mention, and what the interview should ask to find out. Do not rank candidates here.

This is a reading aid for the interviewer. A gap in the list is a question to ask, not a mark against the candidate. Keep the comparison factual ("resume does not mention Kubernetes") and never infer qualifications that are not on the page.

### 5. Draft offers for the people the team chose

> Use offer-letter to draft an offer for Sarah Chen. Base salary $185,000, equity 0.12% over four years with a one-year cliff, signing bonus $15,000 with a clawback if she leaves within 12 months, start date January 11, 2027, reporting to the VP of Engineering. Contingent on background check and right-to-work verification. Acceptance deadline five business days from sending.

The skill writes a markdown draft with the compensation, benefits, contingencies and next steps. It is a draft, not legal advice: HR and counsel review it, convert it to PDF on letterhead and send it through your own e-signature tool. For stock options, the exercise price must be at least the fair market value set by the latest 409A valuation, so do not promise a number before counsel checks it. Put no cap-table details or revenue figures in the letter.

## Real-World Example

The startup runs this pipeline for all six engineering roles. The job descriptions are drafted in an afternoon instead of three days, each reviewed by its hiring manager. Across the roles the team receives a bit over a thousand applications. The recruiter, Dana, no longer starts from a blank pile: the screening report puts the strongest evidence first, and she spends her reading time on the top and middle tiers. She also reads a sample from the bottom tier of every role, and for one role she finds that the rubric's "5+ years of Python" cut-off is hiding two strong candidates who moved from Go; the hiring manager loosens that criterion and the screening is re-run with the new, re-approved rubric.

Hiring managers choose who to interview and who to hire, using the screening evidence, the interview focus notes and their own judgement. Offers go to legal as drafts the same day the manager decides, which removes the back-and-forth over missing terms. Dana keeps the rubrics and decisions in the hiring folder so the next round starts from a reviewed version.

## Tips

- Calibrate the rubric by having the hiring manager score 10 resumes by hand first, then compare with the tool and adjust the criteria (not the individual scores) until the reasons match.
- Keep hard requirements few. A candidate with 4 years of Python and exceptional distributed-systems work should still reach a human.
- Write a shorter board version of each posting, but check the pay range and requirements match the full version.

## Related Skills

- [job-description](../skills/job-description/SKILL.md) -- postings with consistent structure and a pay range
- [applicant-screening](../skills/applicant-screening/SKILL.md) -- approved rubric, evidence-based scores, human decisions
- [offer-letter](../skills/offer-letter/SKILL.md) -- offer drafts for legal and HR review
- [resume-tailor](../skills/resume-tailor/SKILL.md) -- requirement extraction and keyword matching (analysis steps only)
