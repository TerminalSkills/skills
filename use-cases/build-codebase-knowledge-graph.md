# Build an AI-Powered Codebase Knowledge Graph

**Persona:** A developer building internal tooling to help teams understand large, complex codebases.
You want to create a living knowledge graph of your project — one that maps every file, function, class,
and their relationships — so any developer can explore and understand the architecture in minutes, not days.

**Skills used:** `understand-chat`, `understand-dashboard`, `langchain`, `anthropic-sdk`

---

## The Problem

Your codebase has 200,000+ lines of code. New developers take weeks to onboard. Senior devs are
constantly interrupted to explain "how X works." Architecture docs go stale the moment they're written.
You need a system that *understands* your code and can answer questions about it — automatically.

---

## Step 1: Install Understand-Anything

```bash
# Install the Claude Code plugin
claude install understand-anything

# Or add it manually to your project
npm install -g understand-anything-cli
```

The plugin adds `/understand`, `/understand-chat`, `/understand-dashboard`, and other skills
to your Claude Code workspace.

---

## Step 2: Analyze Your Project Structure

Run the knowledge graph builder on your codebase:

```
/understand
```

Claude will:
1. **Scan all source files** — TypeScript, Python, Go, Rust, Java, and more
2. **Extract entities** — files, functions, classes, modules, and concepts
3. **Map relationships** — imports, function calls, inheritance, dependencies
4. **Assign complexity scores** — based on cyclomatic complexity and coupling
5. **Identify architectural layers** — UI, API, services, data, infrastructure
6. **Build a guided tour** — recommended reading order for newcomers

The result is saved to `.understand-anything/knowledge-graph.json`.

---

## Step 3: Explore the Graph Structure

The knowledge graph JSON follows this schema:

```json
{
  "project": {
    "name": "my-saas-app",
    "description": "B2B SaaS platform for team collaboration",
    "languages": ["TypeScript", "SQL"],
    "frameworks": ["Next.js", "tRPC", "Prisma"],
    "analyzedAt": "2024-01-15T10:30:00Z",
    "gitCommitHash": "abc123"
  },
  "nodes": [
    {
      "id": "file:src/auth/session.ts",
      "type": "file",
      "name": "session.ts",
      "filePath": "src/auth/session.ts",
      "summary": "JWT session management with refresh token rotation",
      "tags": ["auth", "jwt", "security"],
      "complexity": 7
    }
  ],
  "edges": [
    {
      "source": "func:src/api/users.ts:createUser",
      "target": "func:src/auth/session.ts:createSession",
      "type": "calls",
      "direction": "outgoing",
      "weight": 1
    }
  ],
  "layers": [
    {
      "id": "layer:auth",
      "name": "Authentication",
      "description": "Identity, sessions, and access control",
      "nodeIds": ["file:src/auth/session.ts", "file:src/auth/middleware.ts"]
    }
  ],
  "tour": [
    {
      "order": 1,
      "title": "Entry Point",
      "description": "Start with the main app router",
      "nodeIds": ["file:src/app/layout.tsx"]
    }
  ]
}
```

---

## Step 4: Chat with Your Codebase

Once the graph is built, use `/understand-chat` to ask architecture questions:

```
/understand-chat how does authentication work?
/understand-chat what calls the payment service?
/understand-chat where is rate limiting implemented?
/understand-chat which files are most critical to the API layer?
```

Claude will:
- Search the graph for relevant nodes using keyword matching
- Follow edges to find connected components
- Answer with specific file paths, function names, and relationships
- Explain the architectural context (which layer, why it exists)

---

## Step 5: Launch the Visual Dashboard

See the knowledge graph as an interactive visualization:

```
/understand-dashboard
```

This starts a local Vite server at `http://localhost:5173` with:
- **Node graph** — interactive force-directed graph of all components
- **Layer view** — components grouped by architectural layer
- **Dependency explorer** — click any node to see its connections
- **Complexity heatmap** — color-coded by complexity score
- **Search** — filter nodes by name, type, or tags

---

## Step 6: Build Custom Tooling with the Graph

Use the knowledge graph as a data source for your own tools:

```typescript
import { readFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const graph = JSON.parse(
  readFileSync('.understand-anything/knowledge-graph.json', 'utf-8')
);

const client = new Anthropic();

async function askAboutCode(question: string) {
  // Extract relevant nodes using simple search
  const relevantNodes = graph.nodes.filter(node =>
    node.summary.toLowerCase().includes(question.toLowerCase()) ||
    node.tags.some((tag: string) => question.toLowerCase().includes(tag))
  );

  const context = relevantNodes
    .slice(0, 10)
    .map(n => `${n.id}: ${n.summary}`)
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Given this codebase context:\n${context}\n\nAnswer: ${question}`
    }]
  });

  return response.content[0].text;
}
```

---

## Step 7: Integrate into CI/CD

Keep the knowledge graph fresh by regenerating on every merge to main:

```yaml
# .github/workflows/knowledge-graph.yml
name: Update Knowledge Graph

on:
  push:
    branches: [main]

jobs:
  update-graph:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate knowledge graph
        run: npx understand-anything analyze --output .understand-anything/
      - name: Commit updated graph
        run: |
          git config user.name "github-actions[bot]"
          git add .understand-anything/knowledge-graph.json
          git commit -m "chore: update knowledge graph" || true
          git push
```

---

## Results

Teams using knowledge graphs report:
- **70% faster onboarding** — new devs productive in days, not weeks
- **50% fewer interruptions** — senior devs answer architecture questions via chat
- **Better PRs** — reviewers understand impact before approving
- **Fresher docs** — graph regenerates automatically, never goes stale

---

## Related Skills

- [`understand-chat`](../skills/understand-chat/SKILL.md) — Ask questions about the codebase
- [`understand-dashboard`](../skills/understand-dashboard/SKILL.md) — Visual graph explorer
- [`understand-onboard`](../skills/understand-onboard/SKILL.md) — Generate onboarding guides
- [`understand-diff`](../skills/understand-diff/SKILL.md) — Analyze PRs with graph context
- [`langchain`](../skills/langchain/SKILL.md) — Build RAG pipelines over the graph
- [`anthropic-sdk`](../skills/anthropic-sdk/SKILL.md) — Query the graph with Claude API
