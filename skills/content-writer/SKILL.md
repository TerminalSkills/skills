---
name: content-writer
description: >-
  Research topics and write content like blog posts, articles, and marketing
  copy. Use when a user asks to write a blog post, create an article, draft
  marketing copy, write website content, create a newsletter, produce
  thought leadership content, or write any long-form or short-form copy.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: ["writing", "blog", "marketing", "content", "copywriting"]
  use-cases:
    - "Write blog posts and articles on technical or business topics"
    - "Draft marketing copy for landing pages, ads, and campaigns"
    - "Create newsletter content and thought leadership pieces"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Content Writer

## Overview

Research topics and produce polished written content across formats: blog posts, articles, marketing copy, landing page text, newsletters, and more. Adapts writing style to audience, purpose, and brand voice. Focuses on clarity, engagement, and actionable value for the reader.

## Instructions

When a user asks you to write content, follow these steps:

### Step 1: Define the content brief

Clarify these elements before writing:

| Element | Question to Answer |
|---------|-------------------|
| Format | Blog post, article, landing page, ad copy, newsletter? |
| Audience | Who is reading this? What do they already know? |
| Goal | Inform, persuade, entertain, convert? |
| Tone | Technical, conversational, authoritative, playful? |
| Length | Short (300-500), medium (800-1200), long (1500-2500)? |
| Keywords | Any SEO terms or phrases to include? |
| CTA | What should the reader do after reading? |

If the user does not specify these, infer reasonable defaults and state your assumptions.

### Step 2: Research and outline

1. **Research the topic** — gather key facts, statistics, and angles
2. **Identify the hook** — what makes this worth reading right now?
3. **Create an outline:**

```
Title: [Compelling, specific headline]

Hook: [Opening that grabs attention - question, stat, or bold claim]

Section 1: [Setup - establish the problem or context]
Section 2: [Core content - main insights, steps, or arguments]
Section 3: [Evidence - examples, data, case studies]
Section 4: [Practical takeaway - what the reader can do now]

CTA: [Clear next step for the reader]
```

### Step 3: Write the content

**Opening (first 2-3 sentences):**
- Start with a hook: surprising statistic, provocative question, or relatable scenario
- Establish why the reader should care
- Preview what they will learn or gain

**Body paragraphs:**
- One idea per paragraph, 3-5 sentences each
- Use subheadings every 2-3 paragraphs for scannability
- Include concrete examples, numbers, and specifics
- Break up text with bullet points, bold key phrases, and short sentences

**Closing:**
- Summarize the key takeaway in 1-2 sentences
- End with a clear call to action
- Leave the reader with something to think about or do

### Step 4: Edit and polish

- Cut filler words ("very", "really", "basically", "actually")
- Replace passive voice with active voice
- Ensure every paragraph earns its place — if it does not advance the point, cut it
- Verify any claims or statistics are reasonable
- Read the opening — would you keep reading?

## Examples

### Example 1: Technical blog post

**User request:** "Write a blog post about why teams should adopt TypeScript"

**Output structure:**
```markdown
# Why Your Team Should Switch to TypeScript in 2025

Your JavaScript codebase is a ticking time bomb. Every `undefined is not
a function` error in production proves it. Here's why TypeScript is worth
the migration cost.

## The Problem with JavaScript at Scale

[2 paragraphs on pain points: runtime errors, refactoring fear,
onboarding friction]

## What TypeScript Actually Gives You

### Catch Bugs Before They Ship
[Example of a type error caught at compile time vs. production]

### Refactor with Confidence
[Example of renaming a field across 200 files safely]

### Self-Documenting Code
[Example of types replacing outdated JSDoc comments]

## The Migration Path

[3-step practical approach: strict mode off, gradual conversion,
enable strict]

## The Bottom Line

TypeScript is not about types. It is about building software you can
change without breaking. Start with one module. You will not go back.
```

### Example 2: Marketing landing page copy

**User request:** "Write copy for a project management tool landing page"

**Output:**
```markdown
# Hero Section
**Headline:** Ship projects on time. Every time.
**Subhead:** The project management tool that replaces your spreadsheets,
standups, and status meetings.
**CTA:** Start free trial

# Problem Section
**Headline:** Sound familiar?
- Tasks falling through the cracks
- "What's the status?" messages all day
- Deadlines that keep moving
- Spreadsheets no one updates

# Solution Section
**Headline:** One place for everything
[3 feature blocks with headline + 1-sentence description + icon]

# Social Proof
**Headline:** Trusted by 2,000+ teams
[3 short testimonials]

# Final CTA
**Headline:** Stop managing chaos. Start shipping.
**CTA:** Get started free — no credit card required
```

### Example 3: Newsletter edition

**User request:** "Write a weekly newsletter about AI for developers"

**Output structure:**
```markdown
Subject: [Specific hook about this week's top story]

# [Newsletter Name] — Issue #42

## The Big Story
[3-4 paragraph deep dive on the week's most important AI development]

## Quick Hits
- **[Tool/Launch]:** [1-sentence summary with link]
- **[Research]:** [1-sentence summary with link]
- **[Tutorial]:** [1-sentence summary with link]

## Code Corner
[Short practical tip or code snippet developers can use today]

## One More Thing
[Interesting aside, prediction, or question for readers]
```

## Guidelines

- Write for humans, not search engines. Good content ranks because people read and share it.
- Every piece needs a clear angle or thesis. "Here's everything about X" is not an angle. "Why X is broken and how to fix it" is.
- Use specific numbers and examples over vague claims. "Reduced load time by 2.3 seconds" beats "significantly faster."
- Front-load value. The reader should get something useful within the first 3 paragraphs.
- Avoid jargon unless writing for an expert audience. If you must use technical terms, explain them.
- Vary sentence length. Short sentences create urgency. Longer sentences provide explanation and nuance. Mix them.
- Subheadings should be informative, not clever. The reader scanning headings should understand the full article.
- Always end with a clear next step. Do not let the reader finish and wonder "so what?"
- Match the brand voice if the user provides examples or guidelines. Consistency matters more than flair.
