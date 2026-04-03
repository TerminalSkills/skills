---
name: prompts-chat
description: >-
  Browse, use, and self-host Prompts.chat — a community-driven library of 1000+
  curated prompts for ChatGPT, Claude, and other LLMs. Organize prompts by
  category, build team libraries, and deploy your own instance. Use when tasks
  involve finding effective prompts, building prompt collections, or setting up
  a prompt management system for a team.
license: MIT
compatibility: "Node.js 18+, Docker (for self-hosting)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["prompts", "prompt-library", "community", "self-hosted"]
---

# Prompts.chat

Community-curated library of 1000+ prompts for LLMs. Browse by category, contribute your own, or self-host for your team.

## Browse Online

Visit [prompts.chat](https://prompts.chat) to browse the full library. Categories include:

- **Writing** — blog posts, essays, copywriting, storytelling
- **Coding** — code review, debugging, architecture, refactoring
- **Business** — marketing, strategy, sales, finance
- **Education** — tutoring, lesson plans, explanations
- **Creative** — art direction, music, game design
- **Productivity** — summarization, analysis, decision-making
- **Role-play** — act as expert, interviewer, advisor
- **Technical** — DevOps, security, data science, DBA

## Fetching Prompts Programmatically

```bash
# The underlying data is from awesome-chatgpt-prompts
curl -s https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.json \
  | jq '.[0:3]'
```

### Python Integration

```python
import json
import urllib.request

url = "https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.json"
with urllib.request.urlopen(url) as response:
    prompts = json.loads(response.read())

def find_prompts(keyword, prompts_list):
    kw = keyword.lower()
    return [
        p for p in prompts_list
        if kw in p["act"].lower() or kw in p["prompt"].lower()
    ]

# Find coding-related prompts
for p in find_prompts("code", prompts)[:5]:
    print(f"📌 {p['act']}")
    print(f"   {p['prompt'][:100]}...\n")
```

### Node.js Integration

```javascript
const prompts = require("./prompts.json");

function searchPrompts(query) {
  const q = query.toLowerCase();
  return prompts.filter(
    (p) => p.act.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q)
  );
}

function randomPrompt(category) {
  const matches = searchPrompts(category);
  return matches[Math.floor(Math.random() * matches.length)];
}

console.log(randomPrompt("marketing"));
```

## Self-Hosting

### Docker

```bash
git clone https://github.com/f/awesome-chatgpt-prompts.git
cd awesome-chatgpt-prompts

docker build -t prompts-chat .
docker run -d -p 3000:3000 --name prompts-chat prompts-chat
# Access at http://localhost:3000
```

### Manual Setup

```bash
git clone https://github.com/f/awesome-chatgpt-prompts.git
cd awesome-chatgpt-prompts

npm install
npm run dev      # development
npm run build && npm start  # production
```

### Docker Compose with Persistence

```yaml
# docker-compose.yml
version: "3.8"
services:
  prompts:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./custom-prompts:/app/data/custom
    environment:
      - NODE_ENV=production
      - SITE_TITLE=Our Team Prompts
      - ENABLE_AUTH=true
      - AUTH_SECRET=your-secret-key
    restart: unless-stopped
```

## Building Team Libraries

### Prompt File Format

```json
[
  {
    "act": "Code Reviewer",
    "prompt": "Act as a senior code reviewer. Review the following code for bugs, performance issues, security vulnerabilities, and style. Provide line-by-line feedback with severity levels (critical, warning, suggestion).\n\nCode:\n{{code}}",
    "category": "engineering",
    "tags": ["code-review", "quality"],
    "author": "team"
  },
  {
    "act": "Architecture Advisor",
    "prompt": "Act as a software architect. Given the following requirements, propose a system architecture including: tech stack, service boundaries, data flow, scaling strategy, and trade-offs.\n\nRequirements:\n{{requirements}}",
    "category": "engineering",
    "tags": ["architecture", "design"],
    "author": "team"
  }
]
```

### Organizing by Team

```
custom-prompts/
├── engineering/
│   ├── code-review.json
│   ├── debugging.json
│   └── architecture.json
├── marketing/
│   ├── copywriting.json
│   ├── seo.json
│   └── social-media.json
├── support/
│   ├── ticket-response.json
│   └── escalation.json
└── shared/
    ├── summarization.json
    └── analysis.json
```

### Version Control for Prompts

```bash
cd custom-prompts
git init
git add .
git commit -m "Initial prompt library"

# Use PRs for prompt review and approval
# Add CI that validates JSON format and checks for duplicates
```

## Categories Reference

| Category       | Count | Examples                                     |
|----------------|-------|----------------------------------------------|
| Role-play      | 200+  | Act as Linux Terminal, Interviewer, Chef      |
| Writing        | 150+  | Blog Writer, Copywriter, Poet                 |
| Coding         | 180+  | Code Reviewer, Debugger, SQL Expert           |
| Business       | 120+  | Marketing Strategist, Financial Advisor       |
| Education      | 100+  | Tutor, Lesson Planner, Quiz Generator         |
| Creative       | 90+   | Story Teller, Game Designer, Art Director     |
| Productivity   | 80+   | Summarizer, Decision Maker, Planner           |
| Technical      | 100+  | DevOps Engineer, Security Analyst, DBA        |

## Tips

- **Template variables**: Use `{{variable}}` placeholders for reusable prompts
- **Prompt chaining**: Combine prompts for complex workflows (analyze → plan → execute)
- **Version prompts**: Track changes — small wording tweaks can significantly affect output
- **Test across LLMs**: Same prompt can behave differently on GPT-4, Claude, Gemini
- **Rate prompts**: Track which prompts work best for your team over time
- **Export/import**: JSON format makes migration between platforms trivial
- **API access**: Build internal tools that pull prompts from your self-hosted instance
