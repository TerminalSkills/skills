---
name: prompts-chat
description: >-
  Browse, search, and self-host a community prompt library with 1000+ curated prompts.
  Use when: finding proven prompts for specific tasks, building a team prompt library,
  learning prompt patterns from community-tested examples.
license: MIT
compatibility: "Any AI agent, Docker for self-hosting"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: ["prompts", "prompt-library", "community"]
---

# Prompts.chat

## Overview

Prompts.chat (formerly Awesome ChatGPT Prompts) is a self-hostable platform with 1000+ community-curated prompts organized by category. Browse online or deploy privately for your team.

## Instructions

### Browse Online

Visit [prompts.chat](https://prompts.chat) to search and copy prompts immediately.

### Self-Host for Teams

```bash
git clone https://github.com/f/prompts.chat.git
cd prompts.chat
docker compose up -d
```

Access at `http://localhost:3000`. Your team gets a private prompt library.

### Search by Category

Prompts are organized into categories:
- **Coding**: Debug code, write tests, refactor, code review, architecture
- **Writing**: Blog posts, emails, copy, social media, documentation
- **Analysis**: Data analysis, research, summarization, comparison
- **Business**: Strategy, marketing plans, sales scripts, financial models
- **Creative**: Brainstorming, storytelling, design briefs

### Use a Prompt

1. Search for your task (e.g., "code review")
2. Copy the prompt template
3. Replace placeholders with your specifics
4. Paste into your AI tool

### Build Team Collections

Create curated collections for your organization:

1. Fork the repository
2. Add prompts to the `prompts/` directory following the format
3. Deploy your fork — team members access shared prompts
4. Version control improvements over time

## Examples

**Example 1: Code review prompt**

Search "code review" → find the "Senior Code Reviewer" prompt:

```
Act as a senior software engineer reviewing a pull request.
Review this code for: bugs, security issues, performance,
readability, and adherence to best practices.
Code: [paste code]
```

**Example 2: Business strategy prompt**

Search "market analysis" → find the "Market Analyst" prompt:

```
Analyze the market opportunity for [product] targeting [audience].
Include: market size, competitors, differentiation opportunities,
pricing strategy, and go-to-market recommendations.
```

## Guidelines

- Test prompts with your specific AI model — some work better with Claude vs GPT
- Customize prompts for your domain (replace generic terms with your industry specifics)
- Contribute back — submit prompts that work well for you to help the community
- For team use, add company-specific context to prompts (coding standards, brand voice)
- Review prompts periodically — AI capabilities change, prompts should evolve
