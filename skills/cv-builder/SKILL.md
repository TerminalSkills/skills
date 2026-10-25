---
name: cv-builder
description: >-
  Generate professional CVs and resumes from structured YAML data using
  rendercv. Use when a user asks to create a CV, build a resume, generate a
  PDF resume, format a curriculum vitae, make a professional CV from their
  experience, or convert career data into a polished resume document.
  Supports multiple templates and PDF output.
license: Apache-2.0
compatibility: "Requires Python 3.12+ with rendercv v2 installed (pip install \"rendercv[full]\")"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/rendercv/rendercv
  category: business
  tags: "cv, resume, pdf, career, rendercv"
  use-cases: "Generate a polished PDF resume from structured career data, Switch between multiple professional CV templates, Maintain a version-controlled resume in YAML format"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# CV Builder

## Overview

Generate professional, well-formatted CVs and resumes from structured YAML input using RenderCV (v2, Typst-based). Define your experience, education, skills, and projects in a YAML file and produce publication-ready PDF output with consistent formatting. Choose from nine built-in themes or create a custom one with `rendercv create-theme`.

## Instructions

When a user asks you to create or update a CV/resume, follow these steps:

### Step 1: Gather career information

Ask the user for or extract the following details:
- **Personal info**: Full name, email, phone, location, LinkedIn/GitHub URLs
- **Summary**: A brief professional summary or objective (2-3 sentences)
- **Experience**: Job titles, companies, dates, bullet-point accomplishments
- **Education**: Degrees, institutions, graduation dates, GPA (optional)
- **Skills**: Technical skills, languages, tools, frameworks
- **Projects** (optional): Notable projects with descriptions
- **Certifications** (optional): Professional certifications with dates

### Step 2: Create the YAML input file

Install RenderCV (v2.x, needs Python 3.12+) and let it scaffold a valid starting file:

```bash
pip install "rendercv[full]"
rendercv new "Jane Smith"        # writes Jane_Smith_CV.yaml
```

Then fill it with the user's data. The schema is strict: unknown keys are rejected, so keep to these names:

```yaml
cv:
  name: Jane Smith
  headline: Senior Software Engineer
  location: San Francisco, CA
  email: jane.smith@gmail.com
  phone: "+14155550123"          # must be a valid phone number, E.164 style is safest
  website: https://janesmith.dev
  social_networks:
    - network: LinkedIn
      username: janesmith
    - network: GitHub
      username: janesmith
  sections:                       # section titles are free text; order is kept
    summary:
      - Senior software engineer with 8 years of experience building scalable web applications in Python, TypeScript, and cloud infrastructure.
    experience:
      - company: Northwind Systems
        position: Senior Software Engineer
        location: San Francisco, CA
        start_date: 2021-03
        end_date: present
        highlights:
          - Led migration of a monolith to microservices, cutting deploy time by 70%
          - Designed a real-time pipeline processing 2M events/day
    education:
      - institution: University of California, Berkeley
        area: Computer Science
        degree: BS
        start_date: 2014-09
        end_date: 2018-05
        highlights:
          - "GPA: 3.8/4.0"
    skills:
      - label: Languages
        details: Python, TypeScript, Go, SQL
      - label: Infrastructure
        details: AWS, Docker, Kubernetes, Terraform

design:
  theme: sb2nov
  page:
    size: us-letter               # or a4
    top_margin: 2cm
    bottom_margin: 2cm
    left_margin: 2cm
    right_margin: 2cm
  typography:
    font_size:
      body: 10pt
```

A plain string in a section is a text paragraph; a mapping with `company`/`position` is an experience entry, `institution`/`area` an education entry, and `label`/`details` a one-line skills entry. The older v1 keys (`design.font_size`, `design.page_size`, `design.margins`) no longer exist.

### Step 3: Choose a theme

Built-in themes in v2.8: `classic`, `sb2nov`, `moderncv`, `engineeringresumes`, `engineeringclassic`, `harvard`, `ink`, `opal`, `ember`. Set one in `design.theme`. `classic` and `engineeringresumes` are safe choices for conservative or ATS-parsed applications; render the same file with two or three themes and compare the PNGs when the user is undecided.

### Step 4: Generate the PDF

```bash
rendercv render Jane_Smith_CV.yaml
```

RenderCV compiles with Typst (no LaTeX needed) and writes `rendercv_output/`:
- `Jane_Smith_CV.pdf` - the final resume
- `Jane_Smith_CV.typ` - Typst source for manual tweaks
- `Jane_Smith_CV_1.png` - one PNG per page, useful for a quick visual check
- `Jane_Smith_CV.md` and `Jane_Smith_CV.html` - text versions

Useful flags: `-o <folder>` changes the output folder, `-nopng` / `-nomd` / `-nohtml` skip files, `-w` re-renders whenever the YAML changes, and `--cv.phone "+14155550123"` overrides a single field without editing the file.

### Step 5: Validate and iterate

Validation runs on every render and prints a table of field, value and explanation for each problem, so fix the listed fields and re-run. Then review the PDF with the user:
- Check for text overflow, wrapped dates and a spilled second page
- Verify dates and details are correct
- Adjust theme, `design.page` margins or `design.typography.font_size` if needed

## Examples

### Example 1: Create a new resume from scratch

**User request:** "Help me create a professional resume. I'm a data scientist with 5 years of experience."

**Steps:**
1. Ask the user for their full career details
2. Run `rendercv new "Priya Raman"`, then fill `Priya_Raman_CV.yaml` using the `sb2nov` theme
3. Run `rendercv render Priya_Raman_CV.yaml`
4. Present the PDF output path and offer to adjust formatting

**Output:**
```
Created Priya_Raman_CV.yaml with your career data
Generated PDF: rendercv_output/Priya_Raman_CV.pdf
Also available: .typ, .md, .html and a PNG preview per page

The resume uses the sb2nov theme.
Would you like to adjust the template, font size, or content?
```

### Example 2: Update an existing CV with a new job

**User request:** "Add my new position at Google to my existing CV"

**Steps:**
1. Read the existing `Priya_Raman_CV.yaml`
2. Close the previous job (`end_date: 2026-09`) and add the new entry at the top of `experience` with `start_date: 2026-10`, `end_date: present`
3. Re-run `rendercv render Priya_Raman_CV.yaml`
4. Confirm the update with the user

**Output:** `Generated PDF: rendercv_output/Priya_Raman_CV.pdf`, still two pages.

### Example 3: Switch template theme

**User request:** "Change my resume to a more traditional format for a finance role"

**Steps:**
1. Read the existing `Priya_Raman_CV.yaml`
2. Change `design.theme` from `sb2nov` to `classic`
3. Optionally set `design.typography.font_size.body: 11pt` for readability
4. Re-run `rendercv render Priya_Raman_CV.yaml`

**Output:** a regenerated PDF in the classic layout; the content is untouched.

## Guidelines

- Always use quantifiable achievements in bullet points (numbers, percentages, metrics).
- Keep the resume to 1 page for candidates with under 10 years of experience; 2 pages maximum for senior professionals.
- Use action verbs to start each bullet point (Led, Built, Designed, Implemented, Reduced).
- Order experience entries reverse-chronologically (most recent first).
- Tailor the skills section to match the target role when the user specifies one.
- RenderCV validates the whole file on render; quote values that YAML could misread (`"GPA: 3.8/4.0"`, phone numbers).
- If rendercv is not installed, guide the user: `pip install "rendercv[full]"` (Python 3.12+; the `full` extra bundles Typst and fonts).
- Files written for RenderCV v1 (`design.font_size`, `design.page_size`, `.tex` output) fail validation on v2: migrate them rather than pinning an old version.
- Store the YAML file in version control so the user can track resume changes over time.
- Avoid including personal photos, age, or marital status unless the user explicitly requests it and it is customary for their region.
