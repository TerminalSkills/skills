# Contributing to Terminal Skills

Thank you for your interest in contributing. This guide explains how to create a new skill and submit it for inclusion in the library.

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

### 4. Create a Use-Case Article

Create a matching file in `use-cases/` that demonstrates the skill in a real workflow. Use this format:

```markdown
# Title: Action-Oriented Description

## The Problem
What pain point does this address?

## The Solution
Which skill to use and a brief overview.

## Step-by-Step Walkthrough
Numbered steps with code examples.

## Real-World Example
A concrete scenario from start to finish.

## Related Skills
Links to complementary skills.
```

## Quality Guidelines

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

## Submitting a Pull Request

1. Fork the repository
2. Create a branch: `git checkout -b add-skill/your-skill-name`
3. Add your `skills/your-skill-name/SKILL.md`
4. Add a use-case file in `use-cases/`
5. Update the skills table in `README.md`
6. Submit a PR with:
   - A clear title: "Add skill: your-skill-name"
   - A description of the problem this skill solves
   - An example of the skill in action

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
