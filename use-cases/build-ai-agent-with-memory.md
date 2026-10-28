---
title: "Build an AI Agent with Persistent Memory"
slug: build-ai-agent-with-memory
description: "Create a long-running AI agent that remembers you across sessions using episodic, semantic, and procedural memory stores."
skills: [anthropic-sdk, langchain, agent-memory, hindsight]
difficulty: advanced
time_estimate: "6 hours"
tags: [ai, agents, memory, vector-db, postgres, langchain, anthropic]
---

# Build an AI Agent with Persistent Memory

## The Problem

Most AI assistants forget everything when the session ends. You say you prefer TypeScript and short answers, and next week you say it again. You want an assistant that picks up where you left off without stuffing every old conversation into the prompt.

## The Solution

Split memory into three stores, all in one PostgreSQL database, and retrieve from them before every reply:

- **Episodic** (what happened): the turns of a session, plus a rolling summary of older turns so the prompt stays small.
- **Semantic** (what is true): short facts about the user, stored as embeddings in pgvector and recalled by meaning.
- **Procedural** (how to behave): explicit rules such as "keep answers under five sentences", edited by the user, not inferred.

Claude answers with all three in the prompt, then a cheaper model extracts new durable facts and writes them back. Every row carries a `user_id`, so users never see each other's memories. For file-based and SQLite variants, see the [agent-memory](/skills/agent-memory) skill.

## Step-by-Step Walkthrough

### Step 1: Install and create the schema

Use PostgreSQL with the pgvector extension (for example the `pgvector/pgvector` Docker image, bound to `127.0.0.1`). Embeddings come from OpenAI because Anthropic offers no embeddings model; any LangChain embeddings class works instead.

```bash
npm init -y && npm pkg set type=module
npm install @anthropic-ai/sdk "@langchain/core@^1.1.38" @langchain/community @langchain/openai pg
npm install -D typescript tsx @types/pg @types/node
export ANTHROPIC_API_KEY=... OPENAI_API_KEY=...   # your own keys, never committed
export DATABASE_URL=postgresql://postgres:$PGPASSWORD@127.0.0.1:5432/postgres
```

```sql
CREATE TABLE episodic_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  summarized BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON episodic_memory (user_id, session_id, created_at);
CREATE TABLE session_summaries (
  user_id TEXT NOT NULL, session_id TEXT NOT NULL,
  summary TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id)
);
CREATE TABLE procedural_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, behavior TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- semantic_memory is created by PGVectorStore.initialize()
```

### Step 2: Episodic memory

```typescript
// memory/db.ts — one pool for everything
import pg from "pg";
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// memory/episodic.ts — what happened: raw turns plus a rolling summary of older ones
import type { Pool } from "pg";
import Anthropic from "@anthropic-ai/sdk";

export interface Turn { role: "user" | "assistant"; content: string }
export class EpisodicStore {
  private client = new Anthropic();
  constructor(private db: Pool) {}

  async save(userId: string, sessionId: string, role: Turn["role"], content: string) {
    await this.db.query(
      `INSERT INTO episodic_memory (user_id, session_id, role, content) VALUES ($1, $2, $3, $4)`,
      [userId, sessionId, role, content],
    );
  }

  async context(userId: string, sessionId: string, limit = 20) {
    const { rows } = await this.db.query(
      `SELECT role, content FROM episodic_memory
       WHERE user_id = $1 AND session_id = $2 AND NOT summarized
       ORDER BY created_at DESC, id DESC LIMIT $3`,
      [userId, sessionId, limit],
    );
    const { rows: s } = await this.db.query(
      `SELECT summary FROM session_summaries WHERE user_id = $1 AND session_id = $2`,
      [userId, sessionId],
    );
    return { turns: rows.reverse() as Turn[], summary: (s[0]?.summary as string | undefined) ?? "" };
  }

  async consolidate(userId: string, sessionId: string, keepLast = 10) {
    const { rows: old } = await this.db.query(
      `SELECT id, role, content FROM episodic_memory
       WHERE user_id = $1 AND session_id = $2 AND NOT summarized
       ORDER BY created_at ASC, id ASC`,
      [userId, sessionId],
    );
    const fold = old.slice(0, Math.max(0, old.length - keepLast));
    if (fold.length === 0) return;

    const { summary: previous } = await this.context(userId, sessionId, 0);
    const res = await this.client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `Update this running summary of a conversation with the new turns. Keep decisions, open questions and commitments. Reply with the summary only.\n\nCurrent summary:\n${previous || "(none)"}\n\nNew turns:\n${fold.map((t) => `${t.role}: ${t.content}`).join("\n")}`,
      }],
    });
    const summary = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");

    await this.db.query(
      `INSERT INTO session_summaries (user_id, session_id, summary) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, session_id) DO UPDATE SET summary = EXCLUDED.summary, updated_at = now()`,
      [userId, sessionId, summary],
    );
    await this.db.query(`UPDATE episodic_memory SET summarized = true WHERE id = ANY($1::uuid[])`, [fold.map((t) => t.id)]);
  }
}
```

### Step 3: Semantic memory with pgvector

`PGVectorStore` comes from `@langchain/community` and manages its own table. Filtering by `userId` in the search keeps users apart.

```typescript
// memory/semantic.ts — what is true about the user, retrieved by meaning
import { OpenAIEmbeddings } from "@langchain/openai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { Pool } from "pg";

export class SemanticStore {
  private constructor(private store: PGVectorStore) {}

  static async create(pool: Pool, embeddings: EmbeddingsInterface = new OpenAIEmbeddings({ model: "text-embedding-3-small" })) {
    const store = await PGVectorStore.initialize(embeddings, {
      pool,
      tableName: "semantic_memory",
      distanceStrategy: "cosine",
    });
    return new SemanticStore(store);
  }

  async remember(userId: string, fact: string, source = "conversation") {
    await this.store.addDocuments([{ pageContent: fact, metadata: { userId, source, createdAt: new Date().toISOString() } }]);
  }

  async recall(userId: string, query: string, k = 5): Promise<string[]> {
    const docs = await this.store.similaritySearch(query, k, { userId });
    return docs.map((d) => d.pageContent);
  }
}
```

### Step 4: Procedural memory

```typescript
// memory/procedural.ts — how to behave: explicit rules the user (or you) can edit
import type { Pool } from "pg";

export class ProceduralStore {
  constructor(private db: Pool) {}
  async add(userId: string, behavior: string, priority = 0) {
    await this.db.query(`INSERT INTO procedural_memory (user_id, behavior, priority) VALUES ($1, $2, $3)`, [userId, behavior, priority]);
  }

  async getAll(userId: string): Promise<string[]> {
    const { rows } = await this.db.query(
      `SELECT behavior FROM procedural_memory WHERE user_id = $1 ORDER BY priority DESC, created_at`, [userId]);
    return rows.map((r) => r.behavior as string);
  }
}
```

### Step 5: The agent

The reply uses `claude-sonnet-5-5`; fact extraction uses `claude-haiku-5-5` with a JSON schema in `output_config.format`, so the result always parses and you do not strip code fences by hand.

```typescript
// agent.ts — retrieve, answer, then write back
import Anthropic from "@anthropic-ai/sdk";
import type { EpisodicStore } from "./memory/episodic.js";
import type { SemanticStore } from "./memory/semantic.js";
import type { ProceduralStore } from "./memory/procedural.js";
const FACTS_SCHEMA = {
  type: "object",
  properties: { facts: { type: "array", items: { type: "string" } } },
  required: ["facts"],
  additionalProperties: false,
} as const;
const text = (res: Anthropic.Message) => res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
export class MemoryAgent {
  private client = new Anthropic(); // reads ANTHROPIC_API_KEY
  private pending: Promise<void> = Promise.resolve(); // background fact write-back

  constructor(
    private episodic: EpisodicStore,
    private semantic: SemanticStore,
    private procedural: ProceduralStore,
    private userId: string,
    private sessionId: string,
  ) {}

  async chat(userMessage: string): Promise<string> {
    const [{ turns, summary }, facts, rules] = await Promise.all([
      this.episodic.context(this.userId, this.sessionId),
      this.semantic.recall(this.userId, userMessage),
      this.procedural.getAll(this.userId),
    ]);

    const system = `You are a personal assistant with persistent memory.

Facts you know about the user (retrieved by relevance, may be outdated):
${facts.map((f) => `- ${f}`).join("\n") || "- none yet"}

Rules to follow:
${rules.map((r) => `- ${r}`).join("\n") || "- none"}

Earlier in this conversation: ${summary || "nothing summarized yet"}

Use memories naturally. Do not recite them.`;
    const res = await this.client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 1024,
      system,
      messages: [...turns, { role: "user", content: userMessage }],
    });
    const reply = text(res);
    await this.episodic.save(this.userId, this.sessionId, "user", userMessage);
    await this.episodic.save(this.userId, this.sessionId, "assistant", reply);

    this.pending = this.learn(userMessage, reply).catch((err) => console.error("memory write-back failed", err));
    return reply;
  }
  flush() { return this.pending; } // wait for the write-back before exiting or starting another session

  private async learn(user: string, assistant: string) {
    const res = await this.client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 400,
      output_config: { format: { type: "json_schema", schema: FACTS_SCHEMA } },
      messages: [{
        role: "user",
        content: `List durable facts about the user stated in this exchange (preferences, projects, constraints). Return an empty list if there are none.\n\nUser: ${user}\nAssistant: ${assistant}`,
      }],
    });
    const { facts } = JSON.parse(text(res)) as { facts: string[] };
    for (const fact of facts) await this.semantic.remember(this.userId, fact);
  }
}
```

### Step 6: Run it
```typescript
// main.ts
import { pool } from "./memory/db.js";
import { EpisodicStore } from "./memory/episodic.js";
import { SemanticStore } from "./memory/semantic.js";
import { ProceduralStore } from "./memory/procedural.js";
import { MemoryAgent } from "./agent.js";
const procedural = new ProceduralStore(pool);
await procedural.add("user-123", "Keep answers under five sentences unless asked for detail.");
const make = async (sessionId: string) =>
  new MemoryAgent(new EpisodicStore(pool), await SemanticStore.create(pool), procedural, "user-123", sessionId);

const s1 = await make("2026-10-24");
await s1.chat("I prefer TypeScript over Python for backend work.");
await s1.chat("My current project is a B2B SaaS for logistics.");
await s1.flush(); // facts are written in the background

// weeks later, new session id: facts come back from semantic memory
const s2 = await make("2026-11-12");
console.log(await s2.chat("What stack should I use for the new microservice?"));
```

Run it with `npx tsx main.ts`. Once a session passes about 20 turns, call `episodic.consolidate(userId, sessionId)` from a background job.

## Real-World Example

A solo founder runs this for her logistics SaaS. It stores "prefers TypeScript" and "building a B2B logistics product". Three weeks later, a question about a new microservice gets a TypeScript answer that mentions her logistics context, although the session started empty.

## Keep memory honest
- **Let users see and delete memories.** List `semantic_memory` rows by `userId` and expose delete.
- **Facts go stale.** The prompt calls them "may be outdated"; ask the user when a new fact contradicts a recalled one.
- **Cost and privacy.** Every exchange adds a Haiku call and embeddings; skip extraction on trivial messages. Never store secrets as facts, and tell users what is remembered.

## Related Skills
- [anthropic-sdk](/skills/anthropic-sdk) — the Messages API calls and structured outputs
- [langchain](/skills/langchain) — the pgvector store and embeddings interface
- [agent-memory](/skills/agent-memory) — file-based, SQLite and Chroma memory patterns, consolidation
- [hindsight](/skills/hindsight) — a standalone memory server (retain, recall, reflect over per-user banks) to use instead of building the stores yourself
