---
name: agent-memory
description: >-
  Add persistent memory to AI coding agents — file-based, vector, and semantic
  search memory systems that survive between sessions. Use when a user asks to
  "remember this", "add memory to my agent", "persist context between sessions",
  "build a knowledge base for my agent", "set up agent memory", or "make my AI
  remember things". Covers file-based memory (MEMORY.md), SQLite with embeddings,
  vector databases (ChromaDB, Pinecone), semantic search, memory consolidation,
  and automatic context injection.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.10+. Optional: ChromaDB 1.x, better-sqlite3, OpenAI API key for embeddings."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["memory", "embeddings", "vector-search", "context", "rag"]
---

# Agent Memory

## Overview

Coding agents start every session with an empty context window. This skill gives them memory that survives: first the file-based memory the agents themselves read (CLAUDE.md, AGENTS.md, GEMINI.md), then a small memory module you own (markdown files, SQLite with embeddings, or ChromaDB) for what instruction files cannot hold, such as thousands of past tickets or conversations searched by meaning.

## Instructions

### Step 0: Use the memory your agent already has

Check this before building anything. Instruction files are loaded at the start of every session:

| Agent | Persistent instructions | Notes |
|-------|------------------------|-------|
| Claude Code | `CLAUDE.md` (project, `~/.claude/CLAUDE.md`), `CLAUDE.local.md`, `.claude/rules/*.md` | Imports with `@docs/api.md`. Auto memory is on by default: Claude writes notes to `~/.claude/projects/<project>/memory/`, `MEMORY.md` is loaded at start (first 200 lines or 25KB). Browse or toggle with `/memory`; disable with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. |
| OpenAI Codex | `AGENTS.md` (`~/.codex` and each directory from the repo root down), `AGENTS.override.md` | Combined size capped by `project_doc_max_bytes` (32 KiB). |
| Gemini CLI | `GEMINI.md` (`~/.gemini/` and project directories) | `/memory show` and `/memory reload`; the file name can be changed with `context.fileName` (for example `AGENTS.md`). |

If the request is "make the agent remember our conventions", write or extend those files and stop. Build the strategies below only for memory that is too large, too dynamic or must be searched semantically.

### Strategy 1: File-based memory (no dependencies)

```
memory/
  MEMORY.md          # curated long-term facts, kept short
  2026-10-02.md      # daily session logs
  decisions.md       # key decisions and the reasoning
```

```markdown
# MEMORY.md
## Projects
- Billing API: Node 22, Fastify, Postgres 16; deploys from the release branch
## Preferences
- TypeScript strict mode; Vitest, not Jest; pnpm, not npm
## Lessons
- Integration tests need Redis on localhost:6379 (docker compose up redis)
```

```python
# agent_memory.py
from datetime import datetime, timedelta
from pathlib import Path


class FileMemory:
    def __init__(self, memory_dir: str = "memory"):
        self.dir = Path(memory_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.long_term = self.dir / "MEMORY.md"

    def log_today(self, content: str, section: str = "Notes") -> Path:
        daily = self.dir / f"{datetime.now():%Y-%m-%d}.md"
        if not daily.exists():
            daily.write_text(f"# {daily.stem}\n")
        with daily.open("a") as f:
            f.write(f"\n## {section}\n{content}\n")
        return daily

    def remember(self, key: str, value: str, category: str = "General") -> None:
        text = self.long_term.read_text() if self.long_term.exists() else "# MEMORY.md\n"
        header = f"## {category}"
        if header not in text:
            text += f"\n{header}\n"
        pos = text.index(header) + len(header) + 1
        self.long_term.write_text(text[:pos] + f"- **{key}**: {value}\n" + text[pos:])

    def search(self, query: str, limit: int = 10) -> list[dict]:
        terms = query.lower().split()
        hits = []
        for path in self.dir.rglob("*.md"):
            for n, line in enumerate(path.read_text().splitlines(), 1):
                score = sum(t in line.lower() for t in terms) / len(terms)
                if score:
                    hits.append({"file": path.name, "line": n, "text": line.strip(), "score": score})
        return sorted(hits, key=lambda h: h["score"], reverse=True)[:limit]

    def recent_context(self, days: int = 3) -> str:
        parts = []
        for i in range(days):
            day = datetime.now() - timedelta(days=i)
            f = self.dir / f"{day:%Y-%m-%d}.md"
            if f.exists():
                parts.append(f.read_text())
        return "\n---\n".join(parts)
```

Consolidation: once a week, give `recent_context(days=7)` and the current `MEMORY.md` to the agent (or a local model) and ask it to merge durable facts, drop stale ones, and keep the file short enough to load fully each session.

### Strategy 2: SQLite plus embeddings (semantic search, one file)

```bash
npm install better-sqlite3 openai
export OPENAI_API_KEY="sk-proj-..."   # from your secret manager, never committed
```

```typescript
// memory-store.ts
import Database from "better-sqlite3";
import OpenAI from "openai";

export class MemoryStore {
  private db = new Database("agent-memory.db");
  private openai = new OpenAI(); // reads OPENAI_API_KEY
  private model = "text-embedding-3-small";

  constructor() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      embedding BLOB NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  private async embed(text: string): Promise<Float32Array> {
    const res = await this.openai.embeddings.create({ model: this.model, input: text });
    return new Float32Array(res.data[0].embedding);
  }

  async store(content: string, category = "general"): Promise<number> {
    const v = await this.embed(content);
    const blob = Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    return Number(this.db.prepare(
      "INSERT INTO memories (content, category, embedding) VALUES (?, ?, ?)"
    ).run(content, category, blob).lastInsertRowid);
  }

  async search(query: string, limit = 5, minScore = 0.3) {
    const q = await this.embed(query);
    const rows = this.db.prepare(
      "SELECT content, category, embedding, created_at FROM memories ORDER BY id DESC LIMIT 5000"
    ).all() as { content: string; category: string; embedding: Buffer; created_at: string }[];
    return rows
      .map((r) => {
        // a Buffer from SQLite can sit at a non-aligned offset inside a shared pool: copy the exact bytes
        const bytes = r.embedding.buffer.slice(r.embedding.byteOffset, r.embedding.byteOffset + r.embedding.byteLength);
        return { content: r.content, category: r.category, created_at: r.created_at, score: cosine(q, new Float32Array(bytes)) };
      })
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

This scans rows in JavaScript, fine up to a few thousand memories. Beyond that, use an index (the `sqlite-vec` extension or Strategy 3). Store vectors from one model only; changing the embedding model means re-embedding everything.

### Strategy 3: ChromaDB (filtering and scale)

```bash
python3 -m pip install chromadb      # 1.x; the default embedder downloads a small ONNX model on first use
```

```python
# chroma_memory.py
from datetime import datetime, timezone
import chromadb


class ChromaMemory:
    def __init__(self, path: str = "./chroma_db", name: str = "agent_memory"):
        self.client = chromadb.PersistentClient(path=path)
        self.col = self.client.get_or_create_collection(
            name, configuration={"hnsw": {"space": "cosine"}}  # older code used metadata={"hnsw:space": ...}
        )

    def store(self, memory_id: str, content: str, category: str = "general") -> None:
        # upsert: the same id overwrites instead of duplicating
        self.col.upsert(ids=[memory_id], documents=[content], metadatas=[
            {"category": category, "created_at": datetime.now(timezone.utc).isoformat()}])

    def recall(self, query: str, n: int = 5, category: str | None = None) -> list[dict]:
        r = self.col.query(query_texts=[query], n_results=n,
                           where={"category": category} if category else None,
                           include=["documents", "metadatas", "distances"])
        return [{"content": d, "category": m["category"], "similarity": 1 - dist}
                for d, m, dist in zip(r["documents"][0], r["metadatas"][0], r["distances"][0])]

    def forget(self, memory_id: str) -> None:
        self.col.delete(ids=[memory_id])
```

With cosine space, `distance = 1 - similarity`. A managed vector service (Pinecone, Qdrant Cloud) is the alternative when several machines or services must share one memory; the shape of `store` and `recall` stays the same.

### Injecting memory

At session start, load `MEMORY.md` and `recent_context()`; before a task, run `recall(task_description)` and add the top three or four hits to the system prompt or the agent's instruction file, not to user messages. Show the source of each memory so the agent can judge how old it is.

## Examples

### Example 1: Remember project decisions between sessions

**User prompt:** "My Codex and Claude Code agents keep forgetting that we use pnpm and that integration tests need Redis. Make them remember."

The agent adds the two facts to `AGENTS.md` (read by Codex) and `CLAUDE.md` with `@AGENTS.md` imported, or runs `/memory` to confirm Claude's auto memory is on. It does not build a database. In a new session, asking "how do I run the tests?" answers with `pnpm test` and the Redis prerequisite without being told again.

### Example 2: Search past support tickets by meaning

**User prompt:** "Our support bot has 40,000 resolved tickets. When a customer writes 'my invoice PDF is blank', it should find the earlier 'billing export renders empty' tickets."

The agent creates a ChromaDB collection, loads each ticket with `store(f"ticket-{id}", text, category="billing")`, and calls `recall("my invoice PDF is blank", n=5, category="billing")`. The top results are the three earlier blank-export tickets each with its similarity score and resolution text, which the bot cites in its reply.

## Guidelines

- Prefer the agent's own instruction files; they are loaded for free and humans review them in pull requests.
- Keep always-loaded memory short (Claude Code loads about 200 lines of `MEMORY.md`, Codex 32 KiB of AGENTS.md); put detail in topic files and search it on demand.
- Never store secrets, tokens or personal data in memory files or vector stores; memory is plain text and often committed or synced.
- Memory goes stale: date entries, consolidate weekly, delete what is no longer true. A wrong memory is worse than none.
- Test recall with real queries and set a minimum similarity so weak matches are not injected.
- Embedding cost is small (text-embedding-3-small is priced per million tokens; check the current price) but every embedded memory is sent to the provider; use a local embedder for sensitive content.
- Do not use vector search for fewer than a few hundred memories; grep over markdown is faster to debug.
