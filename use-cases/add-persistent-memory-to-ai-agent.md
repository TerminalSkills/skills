---
title: Add Persistent Memory to Your AI Coding Agent
slug: add-persistent-memory-to-ai-agent
description: Build a memory system that lets your AI agent remember project context, decisions, and preferences across sessions — from simple files to vector search.
skills:
  - agent-memory
  - supabase
  - hindsight
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

Start with the memory the agent already loads (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`). Add the three-tier file memory from agent-memory only for what those files cannot hold: daily logs for session continuity, entity files for project knowledge, and a curated `MEMORY.md`. When the notes outgrow grep, use supabase (Postgres with pgvector) for semantic search, or run hindsight when several agents or users must share one memory service.

## Step-by-Step Walkthrough

### Step 1: Use the memory your agent already has

Instruction files are loaded at the start of every session, reviewed in pull requests, and need no code:

| Agent | Persistent instructions |
|-------|-------------------------|
| Claude Code | `CLAUDE.md` (project and `~/.claude/CLAUDE.md`), `.claude/rules/*.md`; auto memory writes notes to `~/.claude/projects/<project>/memory/` (browse with `/memory`) |
| OpenAI Codex | `AGENTS.md`, combined size capped by `project_doc_max_bytes` (32 KiB) |
| Gemini CLI | `GEMINI.md` (`/memory show`, `/memory reload`) |

Put the facts that cost Riku the most time there: "Vitest, not Jest", "tRPC only", "run `prisma migrate deploy` before tests". Everything below is for memory that is too large, too dynamic, or must be searched by meaning.

### Step 2: Set up the memory file structure

Markdown files in a `memory/` directory are the simplest system and the easiest to debug: no database, no embeddings, no API keys.

```
workspace/
├── memory/
│   ├── MEMORY.md               # Curated long-term knowledge, kept short
│   ├── 2026-11-05.md           # Today's session log
│   └── entities/               # architecture.md, conventions.md, mistakes.md
```

```markdown
# MEMORY.md — Project Knowledge Base

## Architecture Decisions
- **ORM**: Prisma (not Drizzle) — chosen for type safety and migration tooling
- **API**: tRPC exclusively — no REST endpoints, no GraphQL
- **Testing**: Vitest + Testing Library — NOT Jest
- **Deployment**: Railway (not Vercel) — needs persistent workers

## Known Pitfalls
- CI breaks if migrations aren't run before tests (prisma migrate deploy)
```

Keep the always-loaded file short and put detail in topic files. Never store secrets or personal data here; the folder is plain text and usually committed.

### Step 3: Load and save memory at session boundaries

The agent needs a way to load context at session start and write notes during work. Point your agent's startup instruction at the output of this module.

```typescript
// session-memory.ts — load memory at session start, save notes during work
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MEMORY_DIR = join(process.cwd(), "memory");
const MEMORY_FILE = join(MEMORY_DIR, "MEMORY.md");

const today = (offsetDays = 0) =>
  new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Everything the agent should read before its first task. */
export function loadSessionContext() {
  const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf-8") : "");

  const recentLogs = [0, 1, 2]
    .map((i) => read(join(MEMORY_DIR, `${today(i)}.md`)))
    .filter(Boolean);

  const entitiesDir = join(MEMORY_DIR, "entities");
  const entities: Record<string, string> = {};
  if (existsSync(entitiesDir)) {
    for (const file of readdirSync(entitiesDir).filter((f) => f.endsWith(".md"))) {
      entities[file.replace(/\.md$/, "")] = read(join(entitiesDir, file));
    }
  }
  return { longTermMemory: read(MEMORY_FILE), recentLogs, entities };
}

/** Append a timestamped note under a section of today's log. */
export function logMemory(content: string, section = "Notes"): void {
  mkdirSync(MEMORY_DIR, { recursive: true });
  const logFile = join(MEMORY_DIR, `${today()}.md`);
  let text = existsSync(logFile) ? readFileSync(logFile, "utf-8") : `# ${today()}\n`;

  const header = `## ${section}`;
  if (!text.includes(header)) text += `\n${header}\n`;

  const time = new Date().toLocaleTimeString("en-GB"); // 24-hour HH:MM:SS
  const at = text.indexOf(header) + header.length + 1;
  writeFileSync(logFile, `${text.slice(0, at)}- [${time}] ${content}\n${text.slice(at)}`);
}
```

### Step 4: Consolidate daily logs into long-term knowledge

Raw session logs are noisy. Once a week, give the last seven days of logs and the current `MEMORY.md` to the agent (or a local model) with an instruction like: "Merge durable decisions and corrections into MEMORY.md, drop facts that are no longer true, date each change, keep it under 150 lines." Write the result back to `MEMORY.md` and review the diff. A wrong memory is worse than none, so the consolidation pass must also delete stale entries, not only add new ones.

### Step 5: Add semantic search with Supabase pgvector

When there are hundreds of logs, "that time the WebSocket reconnection kept failing" should find the entry about "realtime subscription kept dropping". Keep the files as the source of truth and index them in Postgres. Create the schema as a migration so it is reproducible:

Run `npx supabase init`, `npx supabase start` and `npx supabase migration new memory_embeddings`, then put this in the new file under `supabase/migrations/`. `text-embedding-3-small` returns 1536 dimensions; the column size must match the embedding model.

```sql
create extension if not exists vector with schema extensions;

create table public.memory_embeddings (
  id bigint generated always as identity primary key,
  file_path text not null,
  chunk_index int not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  updated_at timestamptz not null default now(),
  unique (file_path, chunk_index)
);

-- No policies: with RLS on, only the secret key (server side) can read or write.
alter table public.memory_embeddings enable row level security;

create index on public.memory_embeddings using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_memories(
  query_embedding extensions.vector(1536),
  match_threshold float,
  match_count int
)
returns table (content text, file_path text, similarity float)
language sql stable
set search_path = ''
as $$
  select m.content, m.file_path,
         1 - (m.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.memory_embeddings m
  where 1 - (m.embedding operator(extensions.<=>) query_embedding) > match_threshold
  order by m.embedding operator(extensions.<=>) query_embedding
  limit least(match_count, 50);
$$;
```

Apply it locally with `npx supabase db reset`, check it, then send it to the linked project with `npx supabase db push --remote --dry-run` followed by `npx supabase db push --remote` (the CLI asks first; add `--yes` in CI).

The indexer runs on a server or your laptop, never in a browser. It uses the **secret** key (`sb_secret_...`, which bypasses RLS) from the environment; the older `service_role` key still works but is being deprecated.

```typescript
// semantic-search.ts — index memory files and search them by meaning
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});
const openai = new OpenAI(); // reads OPENAI_API_KEY
const MODEL = "text-embedding-3-small"; // 1536 dimensions

async function embed(inputs: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({ model: MODEL, input: inputs });
  return res.data.map((d) => d.embedding);
}

function* markdownFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* markdownFiles(p);
    else if (name.endsWith(".md")) yield p;
  }
}

function splitIntoChunks(text: string, maxChars = 1000): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const para of text.split("\n\n")) {
    if (current && current.length + para.length > maxChars) {
      chunks.push(current.trim());
      current = "";
    }
    current += para + "\n\n";
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** Re-index every memory file. Safe to run at the end of each session. */
export async function indexMemoryFiles(memoryDir: string): Promise<number> {
  let indexed = 0;
  for (const file of markdownFiles(memoryDir)) {
    const path = relative(memoryDir, file);
    const chunks = splitIntoChunks(readFileSync(file, "utf-8"));
    if (chunks.length === 0) continue;
    const vectors = await embed(chunks); // one request per file

    const rows = chunks.map((content, i) => ({
      file_path: path,
      chunk_index: i,
      content,
      embedding: vectors[i],
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("memory_embeddings")
      .upsert(rows, { onConflict: "file_path,chunk_index" });
    if (error) throw error;

    // Drop chunks left over when the file got shorter.
    const { error: delError } = await supabase
      .from("memory_embeddings")
      .delete()
      .eq("file_path", path)
      .gte("chunk_index", chunks.length);
    if (delError) throw delError;
    indexed += chunks.length;
  }
  return indexed;
}

/** Most relevant chunks by cosine similarity. */
export async function searchMemory(query: string, limit = 5, threshold = 0.4) {
  const [queryEmbedding] = await embed([query]);
  const { data, error } = await supabase.rpc("match_memories", {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
  });
  if (error) throw error;
  return data as { content: string; file_path: string; similarity: number }[];
}
```

Set a similarity threshold from real queries (0.4 is a starting point for this model, not a rule) so weak matches are not injected into the prompt. Add the top three or four hits, with their file names, to the agent's instructions rather than to user messages. Every indexed chunk is sent to the embedding provider; use a local embedding model for sensitive notes, and change the column size if you switch models.

### Step 6: Share memory between agents with Hindsight

When several agents or users need one memory, or you want fact extraction instead of managing chunks yourself, run the hindsight server. It stores memories in isolated banks and answers `recall` (search) and `reflect` (reasoned answers):

```console
$ export OPENAI_API_KEY="$(cat ~/.secrets/openai-key)"
$ docker run -d --name hindsight --restart unless-stopped \
    -p 127.0.0.1:8888:8888 -p 127.0.0.1:9999:9999 \
    -e HINDSIGHT_API_LLM_API_KEY="$OPENAI_API_KEY" \
    -v hindsight-data:/home/hindsight/.pg0 \
    ghcr.io/vectorize-io/hindsight:latest
$ pip install -U hindsight-client
```

Keep the `127.0.0.1:` prefix: without it Docker publishes both ports on every network interface.

```python
from hindsight_client import Hindsight

client = Hindsight(base_url="http://127.0.0.1:8888")

client.retain(
    bank_id="riku-project",
    content="We switched CI to run `prisma migrate deploy` before Vitest; tests failed without it.",
)

for item in client.recall(bank_id="riku-project", query="Why did CI fail before tests?").results:
    print(item.type, item.text)

```

The server uses its configured LLM to extract facts, so memory contents leave your machine for that provider. Choose file memory for one project, pgvector when you want the data in your own Postgres, and Hindsight when many agents share it.

## The Outcome

Riku's agent now starts every session knowing the project: it writes Vitest tests, uses tRPC, and deploys to Railway. The facts that matter live in `CLAUDE.md` or `AGENTS.md`; the larger history lives in dated logs, consolidated weekly into `MEMORY.md`, and searchable by meaning once there is too much to grep.

## Related Skills

- [agent-memory](/skills/agent-memory) — the instruction-file, markdown, SQLite and ChromaDB memory patterns
- [supabase](/skills/supabase) — Postgres with pgvector, migrations, RLS and the CLI
- [hindsight](/skills/hindsight) — a self-hosted memory server with retain, recall and reflect, when file-based memory is no longer enough
