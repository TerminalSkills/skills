# Contributing to Terminal Skills

Thank you for your interest in contributing. This guide explains how to create new skills and use cases, and submit them for inclusion in the library.

## Creating a New Skill

### 1. Choose a Real Problem

Every skill should solve a concrete problem that developers encounter regularly. Before creating a skill, ask:

- What task does this automate or improve?
- Would a developer use this at least weekly?
- Can an AI agent actually perform this task well?

### 2. Create the Directory

```bash
mkdir -p skills/your-skill-name
```

Skill names use lowercase kebab-case (e.g., `pdf-analyzer`, `code-reviewer`).

### 3. Write the SKILL.md

Create `skills/your-skill-name/SKILL.md` following this format:

```yaml
---
name: your-skill-name
description: >-
  What it does and when to use it. Include trigger words so the AI knows
  when to activate. Max 1024 characters.
license: Apache-2.0
compatibility: Any system requirements (e.g., "Requires Python 3.9+")
metadata:
  author: your-github-username
  version: "1.0.0"
  category: one-of [documents, development, data-ai, devops, business, design, automation, research, productivity, content]
  tags: ["tag1", "tag2", "tag3"]
---

# Skill Name

## Overview
Brief description of what this skill enables (2-3 sentences).

## Instructions
Step-by-step instructions for the AI agent. Be specific and actionable.

## Examples
At least 2 concrete input/output examples.

## Guidelines
Best practices, edge cases, and common pitfalls.
```

### 4. Create a Use-Case Article (recommended)

Create a matching use-case article in `use-cases/` to demonstrate the skill in a real workflow. See the [Creating a Use Case](#creating-a-use-case) section below for the full guide.

## Skill Quality Guidelines

### SKILL.md Requirements

- **Description**: Must include WHAT it does and WHEN to use it with clear trigger words
- **Instructions**: Must be actionable and specific, not vague or generic
- **Examples**: At least 2 concrete input/output examples with realistic data
- **Length**: Keep under 300 lines total (use progressive disclosure)
- **Tone**: Write as if teaching a very capable AI assistant how to perform the task properly

### What Makes a Good Skill

- Solves a real, recurring problem
- Instructions are precise enough that an AI can follow them without guessing
- Examples use realistic data, not lorem ipsum
- Handles edge cases and error scenarios
- Works across different AI tools (not vendor-specific)

### What to Avoid

- Vague instructions like "analyze the data" without explaining how
- Skills that duplicate built-in tool capabilities
- Placeholder content or generic examples
- Skills that require proprietary APIs with no free tier
- Instructions longer than 300 lines (split into multiple skills instead)

---

## Creating a Use Case

Use cases are problem-first guides that show how a skill solves a real challenge. They live in the `use-cases/` directory and are published on [terminalskills.io/use-cases](https://terminalskills.io/use-cases).

### 1. Pick a Real Problem

Every use case starts with a pain point someone actually has. Ask:

- Is this a problem people search for solutions to?
- Can I describe a specific persona who faces this problem?
- Does the walkthrough lead to a concrete, measurable outcome?

### 2. Create the File

```bash
touch use-cases/your-use-case-slug.md
```

Filenames use lowercase kebab-case matching the `slug` field (e.g., `analyze-pdf-documents.md`).

### 3. Write the Use Case

Create `use-cases/your-use-case-slug.md` following this format:

```markdown
---
title: "Action-Oriented Title with AI"
slug: your-use-case-slug
description: "One sentence explaining the use case."
skill: skill-name
category: documents
tags: [tag1, tag2, tag3]
---

# Action-Oriented Title with AI

## The Problem

Describe the specific pain point. Be concrete — mention file types, team sizes,
time wasted, or error rates. The reader should think "yes, that's exactly my problem."

## The Solution

Name the skill and explain the approach in 2-3 sentences. Include the install command:

\`\`\`bash
npx terminal-skills install skill-name
\`\`\`

## Step-by-Step Walkthrough

### 1. First step title

Tell the reader exactly what to say to the AI agent:

\`\`\`
The exact prompt the user would type.
\`\`\`

### 2. What happens next

Explain what the agent does, with realistic output:

\`\`\`
Expected output with real data, not placeholders.
\`\`\`

### 3. Continue the workflow

Show the full journey from problem to solution, typically 3-5 steps.

## Real-World Example

Tell a story: a specific persona (e.g., "an operations manager"), a specific situation
(e.g., "receives 50 vendor invoices as PDFs monthly"), and a specific outcome
(e.g., "produces a single searchable spreadsheet in under 2 minutes").

1. Numbered steps the persona takes
2. What the agent does at each step
3. The concrete result they get

## Related Skills

- [complementary-skill](../skills/complementary-skill/) -- What it adds to this workflow
- [another-skill](../skills/another-skill/) -- Another useful combination
```

### Use Case Frontmatter Reference

| Field | Required | Rules |
|-------|----------|-------|
| `title` | Yes | Action-oriented, starts with a verb, max 100 chars |
| `slug` | Yes | Lowercase kebab-case, matches filename, max 64 chars |
| `description` | Yes | One sentence, max 200 chars |
| `skill` | Yes | Must reference an existing skill name from `skills/` |
| `category` | Yes | One of the 10 categories (see table below) |
| `tags` | Yes | Array of 3-5 relevant tags |

## Use Case Quality Guidelines

### What Makes a Good Use Case

- **Specific problem**: "Extracting tables from PDF reports is tedious" not "working with documents is hard"
- **Concrete steps**: A reader can follow the walkthrough immediately without guessing
- **Realistic data**: Examples use real-looking data (actual file names, realistic output)
- **Clear persona**: The real-world example features a specific role and situation
- **Measurable outcome**: The story ends with a tangible result (time saved, errors eliminated, data produced)

### What to Avoid

- Generic problems like "data analysis is complex"
- Steps that skip over what the agent actually does
- Placeholder data (lorem ipsum, foo/bar, test123)
- Real-world examples without a specific persona or outcome
- Articles longer than 150 lines (keep it focused)
- Referencing skills that don't exist in the repository

---

## Submitting a Pull Request

### For a New Skill

1. Fork the repository
2. Create a branch: `git checkout -b add-skill/your-skill-name`
3. Add your `skills/your-skill-name/SKILL.md`
4. Add a use-case file in `use-cases/` (recommended)
5. Update the skills table in `README.md`
6. Submit a PR with:
   - A clear title: "Add skill: your-skill-name"
   - A description of the problem this skill solves
   - An example of the skill in action
   - Use the **skill** PR template

### For a New Use Case

1. Fork the repository
2. Create a branch: `git checkout -b add-use-case/your-use-case-slug`
3. Add your `use-cases/your-use-case-slug.md`
4. Update the use cases list in `README.md` (recommended)
5. Submit a PR with:
   - A clear title: "Add use case: your-use-case-slug"
   - The problem this use case addresses
   - Which skill it showcases
   - Use the **use-case** PR template

## Categories

Use one of these category values in the metadata:

| Category | Description |
|----------|-------------|
| `documents` | PDF, Word, document processing |
| `development` | Code review, testing, refactoring |
| `data-ai` | Data analysis, ML, visualization |
| `devops` | Docker, CI/CD, infrastructure |
| `business` | Spreadsheets, reports, email |
| `design` | UI/UX, design systems |
| `automation` | Web scraping, workflow automation |
| `research` | Search, summarization, analysis |
| `productivity` | Git, documentation, tooling |
| `content` | Writing, markdown, documentation |

## Questions

Open an issue on GitHub or visit [terminalskills.io](https://terminalskills.io) for more information.
