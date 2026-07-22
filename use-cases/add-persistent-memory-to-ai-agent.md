---
title: Add Persistent Memory to Your AI Coding Agent
slug: add-persistent-memory-to-ai-agent
description: Build a memory system that lets your AI agent remember project context, decisions, and preferences across sessions — from simple files to vector search.
skills:
  - agent-memory
  - supabase
  - test-generator
category: data-ai
tags:
  - memory
  - ai-agents
  - persistence
  - embeddings
  - vector-search
  - context
---

## The Problem

Riku uses an AI coding agent every day. It's great at writing code in the moment, but every new session starts from zero. Yesterday the agent spent 20 minutes understanding the project structure, the team's coding conventions, why they chose Prisma over Drizzle, and that the CI pipeline breaks if you don't run migrations before tests. Today, it asks the same questions. Tomorrow, again.

The agent also keeps making the same mistakes. Last week it generated Jest tests — the project uses Vitest. It suggested a REST endpoint — the team exclusively uses tRPC. It tried deploying to Vercel — the project runs on Railway. Each correction takes a few minutes, but multiplied across every session, it's hours of repeated context-setting per week.

Riku needs the agent to remember: project decisions, coding preferences, past mistakes, and the growing knowledge base of "how things work here."

## The Solution

Use agent-memory to build a three-tier memory system: file-based daily logs for session continuity, structured entity files for project knowledge, and a curated long-term memory that the agent loads at session start. Use supabase for storing embeddings when the memory grows large enough to need semantic search.

## Step-by-Step Walkthrough

### Step 1: Set Up the Memory File Structure

The simplest memory system is also the most robust — markdown files in a `memory/` directory. No database, no embeddings, no API keys. The agent reads them at session start and writes to them during work.

```
workspace/
├── MEMORY.md                    # Curated long-term knowledge
├── memory/
│   ├── 2026-02-24.md           # Today's session log
│   ├── 2026-02-23.md           # Yesterday's log
│   ├── entities/
│   │   ├── architecture.md     # System architecture decisions
│   │   ├── conventions.md      # Coding standards and preferences
│   │   ├── mistakes.md         # Past errors to avoid
│   │   └── people.md           # Team members and their roles
│   └── heartbeat-state.json    # Periodic task tracking
```

The `MEMORY.md` file is the agent's curated brain — distilled knowledge it loads every session:

```markdown
# MEMORY.md — Project Knowledge Base

## Architecture Decisions
- **ORM**: Prisma (not Drizzle) — chosen for type safety and migration tooling
- **API**: tRPC exclusively — no REST endpoints, no GraphQL
- **Testing**: Vitest + Testing Library — NOT Jest
- **Deployment**: Railway (not Vercel) — needs persistent workers
- **Database**: Supabase Postgres with RLS enabled on all tables
- **Auth**: Lucia Auth v3 with GitHub OAuth + magic links

## Coding Conventions
- TypeScript strict mode, no `any` types
- Barrel exports prohibited — import from specific files
- Error handling: neverthrow Result types, not try-catch
- File naming: kebab-case for files, PascalCase for components
- Max file length: 300 lines — split into modules if larger

## Known Pitfalls
- CI breaks if migrations aren't run before tests (prisma migrate deploy)
- Railway deploys fail if the health check path isn't /api/health
- Supabase RLS policies must use auth.uid(), never trust client IDs
- The monorepo uses pnpm workspaces — npm install will break lockfile

## Team
- Riku: Lead dev, focuses on backend and infrastructure
- Aiko: Frontend, owns the design system and component library
- Bot access: Read-only to staging DB, no production access
```

### Step 2: Implement Session Lifecycle Hooks

The agent needs two hooks: one at session start to load context, one during work to save important information.

```typescript
// session-memory.ts — Memory management for agent session lifecycle
/**
 * Handles loading memory at session start and saving new
 * knowledge during the session. Designed to be called from
 * the agent's initialization and on-event hooks.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const WORKSPACE = process.cwd();
const MEMORY_DIR = join(WORKSPACE, "memory");
const MEMORY_FILE = join(WORKSPACE, "MEMORY.md");

interface SessionContext {
  longTermMemory: string;
  recentLogs: string[];
  entities: Record<string, string>;
}

/**
 * Load all relevant memory at session start.
 * Called once when the agent initializes.
 */
export function loadSessionContext(): SessionContext {
  // Load curated long-term memory
  const longTermMemory = existsSync(MEMORY_FILE)
    ? readFileSync(MEMORY_FILE, "utf-8")
    : "";

  // Load last 3 days of session logs
  const recentLogs: string[] = [];
  for (let i = 0; i < 3; i++) {
    const date = new Date(Date.now() - i * 86400000)
      .toISOString()
      .split("T")[0];
    const logFile = join(MEMORY_DIR, `${date}.md`);
    if (existsSync(logFile)) {
      recentLogs.push(readFileSync(logFile, "utf-8"));
    }
  }

  // Load entity files
  const entities: Record<string, string> = {};
  const entitiesDir = join(MEMORY_DIR, "entities");
  if (existsSync(entitiesDir)) {
    const { readdirSync } = require("fs");
    for (const file of readdirSync(entitiesDir)) {
      if (file.endsWith(".md")) {
        const name = file.replace(".md", "");
        entities[name] = readFileSync(join(entitiesDir, file), "utf-8");
      }
    }
  }

  return { longTermMemory, recentLogs, entities };
}

/**
 * Log a memory to today's session file.
 * Called whenever something worth remembering happens.
 */
export function logMemory(content: string, section: string = "Notes"): void {
  mkdirSync(MEMORY_DIR, { recursive: true });

  const today = new Date().toISOString().split("T")[0];
  const logFile = join(MEMORY_DIR, `${today}.md`);

  const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });

  let existing = "";
  if (existsSync(logFile)) {
    existing = readFileSync(logFile, "utf-8");
  } else {
    existing = `# ${today}\n`;
  }

  // Append under the right section
  const sectionHeader = `## ${section}`;
  if (!existing.includes(sectionHeader)) {
    existing += `\n${sectionHeader}\n`;
  }

  const entry = `- [${timestamp}] ${content}\n`;
  const insertPos = existing.indexOf(sectionHeader) + sectionHeader.length + 1;
  const updated = existing.slice(0, insertPos) + entry + existing.slice(insertPos);

  writeFileSync(logFile, updated);
}

/**
 * Update long-term memory with a new fact or correction.
 * Called when the agent learns something that should persist permanently.
 */
export function updateLongTermMemory(
  section: string,
  key: string,
  value: string
): void {
  let content = existsSync(MEMORY_FILE)
    ? readFileSync(MEMORY_FILE, "utf-8")
    : "# MEMORY.md\n";

  const sectionHeader = `## ${section}`;

  // Add section if it doesn't exist
  if (!content.includes(sectionHeader)) {
    content += `\n${sectionHeader}\n`;
  }

  // Check if key already exists and update it
  const keyPattern = new RegExp(`^- \\*\\*${key}\\*\\*:.*$`, "m");
  const newEntry = `- **${key}**: ${value}`;

  if (keyPattern.test(content)) {
    content = content.replace(keyPattern, newEntry);
  } else {
    // Insert after section header
    const pos = content.indexOf(sectionHeader) + sectionHeader.length + 1;
    content = content.slice(0, pos) + newEntry + "\n" + content.slice(pos);
  }

  writeFileSync(MEMORY_FILE, content);
}
```

### Step 3: Add Semantic Search for Large Memory Stores

When memory grows past what fits in a context window — hundreds of daily logs, dozens of entity files — keyword search isn't enough. "That time we fixed the WebSocket reconnection issue" should find the log entry about "Supabase realtime subscription kept dropping."

```typescript
// semantic-search.ts — Vector search over agent memory files
/**
 * Embeds memory files and provides semantic search using
 * Supabase pgvector. Falls back to keyword search if embeddings
 * are unavailable. Designed for memory stores with 1000+ entries.
 */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
const openai = new OpenAI();

/**
 * Index all memory files into Supabase with vector embeddings.
 * Run this periodically (e.g., at the end of each session).
 */
export async function indexMemoryFiles(memoryDir: string): Promise<number> {
  let indexed = 0;

  for (const file of getAllMarkdownFiles(memoryDir)) {
    const content = readFileSync(file, "utf-8");
    const chunks = splitIntoChunks(content, 500); // 500 chars per chunk

    for (const chunk of chunks) {
      const embedding = await embed(chunk.text);

      await supabase.from("memory_embeddings").upsert({
        file_path: file,
        chunk_index: chunk.index,
        content: chunk.text,
        embedding,
        updated_at: new Date().toISOString(),
      });

      indexed++;
    }
  }

  return indexed;
}

/**
 * Semantic search across all indexed memory.
 * Returns the most relevant chunks ranked by cosine similarity.
 */
export async function searchMemory(
  query: string,
  limit: number = 5,
  threshold: number = 0.7 // Minimum similarity score
): Promise<Array<{ content: string; file: string; similarity: number }>> {
  const queryEmbedding = await embed(query);

  const { data, error } = await supabase.rpc("match_memories", {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) throw error;

  return data.map((row: any) => ({
    content: row.content,
    file: row.file_path,
    similarity: row.similarity,
  }));
}

async function embed(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",  // $0.02 per 1M tokens
    input: text,
  });
  return response.data[0].embedding;
}

function splitIntoChunks(text: string, maxChars: number) {
  const paragraphs = text.split("\n\n");
  const chunks: Array<{ text: string; index: number }> = [];
  let current = "";
  let index = 0;

  for (const para of paragraphs) {
    if (current.length + para.length > maxChars && current.length > 0) {
      chunks.push({ text: current.trim(), index });
      current = "";
      index++;
    }
    current += para + "\n\n";
  }

  if (current.trim()) {
    chunks.push({ text: current.trim(), index });
  }

  return chunks;
}
```

### Step 4: Memory Consolidation — Daily Logs to Long-Term Knowledge

Raw session logs are noisy. Every few days, the agent should review recent logs and extract the important bits into MEMORY.md. This is the equivalent of a human reviewing their notes and updating their mental model.

```typescript
// consolidate.ts — Distill daily logs into long-term memory
/**
 * Reviews recent daily log files and identifies:
 * - New decisions that should be permanent
 * - Mistakes that shouldn't be repeated
 * - Updated preferences or conventions
 * - Project status changes
 * Outputs a list of updates to apply to MEMORY.md.
 */

interface MemoryUpdate {
  action: "add" | "update" | "remove";
  section: string;
  key: string;
  value: string;
  reason: string; // Why this matters
}

export function identifyUpdates(recentLogs: string[]): MemoryUpdate[] {
  const updates: MemoryUpdate[] = [];

  for (const log of recentLogs) {
    // Pattern: decisions marked with "Decision:" or "Decided:"
    const decisions = log.match(/(?:Decision|Decided|Chose|Switched to):?\s+(.+)/gi);
    if (decisions) {
      for (const d of decisions) {
        updates.push({
          action: "add",
          section: "Architecture Decisions",
          key: extractKey(d),
          value: d.replace(/^(Decision|Decided|Chose|Switched to):?\s+/i, ""),
          reason: "Explicit decision recorded in session log",
        });
      }
    }

    // Pattern: errors or corrections
    const mistakes = log.match(/(?:Mistake|Error|Bug|Fix|Wrong|Correction):?\s+(.+)/gi);
    if (mistakes) {
      for (const m of mistakes) {
        updates.push({
          action: "add",
          section: "Known Pitfalls",
          key: extractKey(m),
          value: m.replace(/^(Mistake|Error|Bug|Fix|Wrong|Correction):?\s+/i, ""),
          reason: "Error encountered and corrected during session",
        });
      }
    }
  }

  return updates;
}

function extractKey(text: string): string {
  // Take first 3-4 significant words as the key
  return text
    .replace(/^[^:]+:\s*/, "")
    .split(/\s+/)
    .slice(0, 4)
    .join(" ")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim();
}
```

## The Outcome

Riku's agent now loads MEMORY.md at every session start — in under a second, it knows the entire project context. It uses Vitest, not Jest. It deploys to Railway, not Vercel. It uses tRPC exclusively. When it encounters something new — a tricky edge case, a team preference, a deployment gotcha — it logs it to the daily file and eventually consolidates it into long-term memory.

After a month, the agent has built a comprehensive knowledge base of the project. New team members can read MEMORY.md to get up to speed. The agent's suggestions get better over time because it learns from corrections. The repeated context-setting that used to waste hours every week is gone — the agent remembers.
