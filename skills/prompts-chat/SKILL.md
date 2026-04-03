---
name: prompts-chat
description: >-
  Community prompt library with 1000+ curated prompts — self-hostable. Use when: finding proven prompts, building team prompt libraries, learning prompt patterns.
license: Apache-2.0
compatibility: "Any AI agent, Docker for self-hosting"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: [prompts, prompt-library, community, chatgpt, claude, self-hosted]
  use-cases:
    - "Example use case 1"
    - "Example use case 2"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Prompts.chat

## Overview

Formerly Awesome ChatGPT Prompts — now a self-hostable platform with 1000+ community-curated prompts for any AI model.

## Browse Prompts

Visit https://prompts.chat or self-host.

## Categories

- **Coding**: Debug, refactor, generate tests, code review
- **Writing**: Blog posts, emails, copy, social media
- **Analysis**: Data analysis, research, summarization
- **Business**: Strategy, marketing, sales, finance
- **Creative**: Stories, poetry, brainstorming
- **Education**: Tutoring, explanations, quizzes

## Self-Hosting

```bash
git clone https://github.com/f/prompts.chat.git
cd prompts.chat
docker compose up -d
```

Perfect for teams that want a private prompt library.

## API

```typescript
// Search prompts
const results = await fetch(\"/api/prompts?q=code+review\");
const prompts = await results.json();

// Use a prompt
const prompt = prompts[0];
const response = await claude.messages.create({
  model: \"claude-sonnet-4-20250514\",
  messages: [{ role: \"user\", content: prompt.content }],
});
```

## Team Libraries

Create private collections for your team:
- Share proven prompts across the org
- Version control prompt improvements
- Track which prompts work best
