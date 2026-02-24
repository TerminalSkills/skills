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
compatibility: "Node.js 18+ or Python 3.10+. Optional: ChromaDB, Pinecone, OpenAI API for embeddings."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["memory", "persistence", "embeddings", "vector-search", "context", "rag"]
---

# Agent Memory

## Overview

AI agents forget everything between sessions. This skill builds persistent memory systems — from simple file-based approaches to full vector-search architectures — so agents retain context, learn from past interactions, and make better decisions over time.

## When to Use

- User wants the agent to remember decisions, preferences, or project context
- Building a coding assistant that needs to recall past conversations
- Creating a knowledge base the agent can query semantically
- Agent needs to learn from mistakes and not repeat them
- Implementing memory consolidation (daily notes → long-term memory)

## Instructions

### Strategy 1: File-Based Memory (Zero Dependencies)

The simplest approach — write memories to structured markdown files. No database, no embeddings, no API keys. Works with any agent that can read/write files.

#### Architecture

```
memory/
├── MEMORY.md              # Long-term curated knowledge
├── 2026-02-24.md          # Daily session logs
├── 2026-02-23.md
├── entities/
│   ├── projects.md        # Known projects and their state
│   ├── people.md          # People, preferences, relationships
│   └── decisions.md       # Key decisions and reasoning
└── heartbeat-state.json   # Periodic check state
```

#### Memory File Format

```markdown
# MEMORY.md — Long-Term Agent Memory

## Projects
### Terminal Skills
- Repo: https://github.com/TerminalSkills/skills
- Stack: Next.js, TypeScript
- Status: Active, 295 skills published
- Key decision: Use-cases always come first, skills serve use-cases

## Preferences
- Language: TypeScript over JavaScript
- Testing: Vitest over Jest
- Deployment: Vercel for frontend, Railway for backend

## Lessons Learned
- Sub-agents limited to 5-6 tasks max (context window overflow at 10+)
- Always check for duplicates before creating new content
- Git branches from upstream/main, never local main
```

#### Implementation

```python
# agent_memory.py — File-based agent memory with search
"""
File-based memory system for AI agents.
Stores memories as structured markdown, supports fuzzy search
across all memory files without any external dependencies.
"""
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

class FileMemory:
    """Persistent file-based memory for AI agents."""

    def __init__(self, memory_dir: str = "memory"):
        self.memory_dir = Path(memory_dir)
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.long_term_file = self.memory_dir / "MEMORY.md"
        self.entities_dir = self.memory_dir / "entities"
        self.entities_dir.mkdir(exist_ok=True)

    def log_today(self, content: str, section: str = "Notes") -> str:
        """Append to today's daily log file.

        Args:
            content: The memory content to log
            section: Section header within the daily file

        Returns:
            Path to the updated file
        """
        today = datetime.now().strftime("%Y-%m-%d")
        daily_file = self.memory_dir / f"{today}.md"

        if not daily_file.exists():
            daily_file.write_text(f"# {today}\n\n")

        with open(daily_file, "a") as f:
            f.write(f"\n## {section}\n{content}\n")

        return str(daily_file)

    def remember(self, key: str, value: str, category: str = "General") -> None:
        """Store a key-value memory in long-term storage.

        Args:
            key: Short identifier for the memory
            value: The content to remember
            category: Section to file it under (Projects, Preferences, etc.)
        """
        content = self.long_term_file.read_text() if self.long_term_file.exists() else "# Long-Term Memory\n"

        # Find or create category section
        section_header = f"## {category}"
        if section_header not in content:
            content += f"\n{section_header}\n"

        # Append the memory entry
        entry = f"- **{key}**: {value}\n"
        insert_pos = content.index(section_header) + len(section_header) + 1
        content = content[:insert_pos] + entry + content[insert_pos:]

        self.long_term_file.write_text(content)

    def search(self, query: str, max_results: int = 10) -> list[dict]:
        """Search all memory files for relevant content.

        Args:
            query: Search terms (supports multiple words)
            max_results: Maximum number of matching lines to return

        Returns:
            List of dicts with 'file', 'line_number', 'content', 'score'
        """
        terms = query.lower().split()
        results = []

        for md_file in self.memory_dir.rglob("*.md"):
            lines = md_file.read_text().splitlines()
            for i, line in enumerate(lines):
                line_lower = line.lower()
                score = sum(1 for term in terms if term in line_lower)
                if score > 0:
                    results.append({
                        "file": str(md_file.relative_to(self.memory_dir)),
                        "line_number": i + 1,
                        "content": line.strip(),
                        "score": score / len(terms),  # Normalize 0-1
                    })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:max_results]

    def get_recent_context(self, days: int = 3) -> str:
        """Load recent daily logs for context injection.

        Args:
            days: Number of recent days to include

        Returns:
            Combined content from recent daily files
        """
        context_parts = []
        for i in range(days):
            date = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            daily_file = self.memory_dir / f"{date}.md"
            if daily_file.exists():
                context_parts.append(daily_file.read_text())

        return "\n---\n".join(context_parts)

    def consolidate(self) -> str:
        """Review recent daily logs and extract key learnings into long-term memory.

        Returns:
            Summary of what was consolidated
        """
        recent = self.get_recent_context(days=7)
        # In practice, you'd send this to an LLM to extract key points
        # Here we return the raw content for manual review
        return f"Review these notes and update MEMORY.md:\n\n{recent}"
```

### Strategy 2: SQLite + Embeddings (Local Vector Search)

For agents that need semantic search — "find memories similar to X" rather than keyword matching. Uses SQLite for zero-infrastructure persistence and OpenAI embeddings for semantic similarity.

```typescript
// memory-store.ts — SQLite-backed semantic memory with vector search
/**
 * Semantic memory store using SQLite + OpenAI embeddings.
 * Stores memories with vector embeddings for similarity search.
 * No external database required — everything in a single .db file.
 */
import Database from "better-sqlite3";
import OpenAI from "openai";

interface Memory {
  id: number;
  content: string;
  category: string;
  embedding: number[];
  created_at: string;
  metadata: Record<string, unknown>;
}

interface SearchResult {
  content: string;
  category: string;
  similarity: number;
  created_at: string;
}

export class MemoryStore {
  private db: Database.Database;
  private openai: OpenAI;
  private model = "text-embedding-3-small"; // $0.02/1M tokens

  constructor(dbPath: string = "agent-memory.db") {
    this.db = new Database(dbPath);
    this.openai = new OpenAI();
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        embedding BLOB,                    -- Serialized float32 array
        metadata TEXT DEFAULT '{}',        -- JSON metadata
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_category ON memories(category);
      CREATE INDEX IF NOT EXISTS idx_created ON memories(created_at);
    `);
  }

  /**
   * Store a memory with its embedding vector.
   */
  async store(content: string, category: string = "general", metadata: Record<string, unknown> = {}): Promise<number> {
    const embedding = await this.embed(content);
    const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);

    const result = this.db.prepare(`
      INSERT INTO memories (content, category, embedding, metadata)
      VALUES (?, ?, ?, ?)
    `).run(content, category, embeddingBlob, JSON.stringify(metadata));

    return result.lastInsertRowid as number;
  }

  /**
   * Semantic search — find memories most similar to the query.
   * Uses cosine similarity between embedding vectors.
   */
  async search(query: string, limit: number = 5, category?: string): Promise<SearchResult[]> {
    const queryEmbedding = await this.embed(query);

    let rows = this.db.prepare(
      category
        ? `SELECT content, category, embedding, created_at FROM memories WHERE category = ? ORDER BY created_at DESC LIMIT 1000`
        : `SELECT content, category, embedding, created_at FROM memories ORDER BY created_at DESC LIMIT 1000`
    ).all(...(category ? [category] : [])) as Array<{
      content: string; category: string; embedding: Buffer; created_at: string;
    }>;

    // Calculate cosine similarity for each memory
    const scored = rows.map((row) => {
      const memoryEmbedding = Array.from(new Float32Array(row.embedding.buffer));
      const similarity = this.cosineSimilarity(queryEmbedding, memoryEmbedding);
      return { content: row.content, category: row.category, similarity, created_at: row.created_at };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  }

  private async embed(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: this.model,
      input: text,
    });
    return response.data[0].embedding;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
```

### Strategy 3: ChromaDB Vector Database (Production Scale)

For agents handling thousands of memories or needing advanced filtering. ChromaDB runs locally or as a service, handles embedding and search automatically.

```python
# chroma_memory.py — Production agent memory with ChromaDB
"""
Vector-based agent memory using ChromaDB.
Handles embedding generation, similarity search, and metadata filtering.
Scales to millions of memories with persistent storage.
"""
import chromadb
from chromadb.config import Settings
from datetime import datetime
from typing import Optional

class ChromaMemory:
    """Production-grade agent memory backed by ChromaDB."""

    def __init__(self, persist_dir: str = "./chroma_db", collection_name: str = "agent_memory"):
        self.client = chromadb.PersistentClient(
            path=persist_dir,
            settings=Settings(anonymized_telemetry=False)
        )
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}  # Cosine similarity for search
        )

    def store(self, content: str, category: str = "general",
              metadata: Optional[dict] = None) -> str:
        """Store a memory with automatic embedding.

        Args:
            content: Text content to remember
            category: Category for filtering (project, preference, lesson, etc.)
            metadata: Additional metadata (source, confidence, etc.)

        Returns:
            Generated memory ID
        """
        memory_id = f"mem_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        meta = {
            "category": category,
            "created_at": datetime.now().isoformat(),
            **(metadata or {})
        }

        self.collection.add(
            documents=[content],
            metadatas=[meta],
            ids=[memory_id]
        )
        return memory_id

    def recall(self, query: str, n_results: int = 5,
               category: Optional[str] = None) -> list[dict]:
        """Semantic search for relevant memories.

        Args:
            query: Natural language query
            n_results: Number of results to return
            category: Optional category filter

        Returns:
            List of matching memories with similarity scores
        """
        where_filter = {"category": category} if category else None

        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where_filter,
            include=["documents", "metadatas", "distances"]
        )

        memories = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0]
        ):
            memories.append({
                "content": doc,
                "category": meta.get("category"),
                "similarity": 1 - dist,  # Convert distance to similarity
                "created_at": meta.get("created_at"),
            })

        return memories

    def forget(self, memory_id: str) -> None:
        """Delete a specific memory.

        Args:
            memory_id: ID of the memory to remove
        """
        self.collection.delete(ids=[memory_id])

    def count(self) -> int:
        """Return total number of stored memories."""
        return self.collection.count()
```

## Examples

### Example 1: Add persistent memory to a Claude Code agent

**User prompt:** "Set up a memory system for my coding agent so it remembers project decisions, coding preferences, and lessons learned between sessions."

The agent will:

- Create a `memory/` directory structure with MEMORY.md, daily logs, and entity files
- Implement the FileMemory class with search and consolidation
- Add session start hook that loads recent context (last 3 days + long-term memory)
- Add session end hook that saves key decisions and new information
- Set up periodic consolidation from daily logs into long-term memory

### Example 2: Build semantic search over past conversations

**User prompt:** "I want my agent to search past conversations by meaning, not just keywords. It should find relevant memories even if the exact words don't match."

The agent will:

- Set up SQLite database with embedding storage
- Configure OpenAI text-embedding-3-small for low-cost vector generation
- Build search function with cosine similarity ranking
- Add automatic memory extraction from conversation turns
- Implement relevance threshold to avoid surfacing weak matches

### Example 3: Scale agent memory for a production chatbot

**User prompt:** "Build a memory system that can handle 100K+ memories for our customer support bot. It needs to remember past tickets, solutions, and customer preferences."

The agent will:

- Deploy ChromaDB with persistent storage
- Design memory schema: categories for tickets, solutions, customer prefs, product docs
- Implement metadata filtering for fast category-scoped queries
- Add memory deduplication to prevent storing near-identical entries
- Build memory aging — reduce relevance weight for old memories

## Guidelines

- **Start with file-based memory** — it works everywhere, has zero dependencies, and is human-readable
- **Use embeddings when keyword search fails** — "deployment issues" should find "CI/CD pipeline broken"
- **Consolidate regularly** — daily logs accumulate noise; distill into long-term memory weekly
- **Category separation matters** — searching "preferences" shouldn't return "bug reports"
- **Set memory limits** — without pruning, memory grows until it overwhelms context windows
- **Privacy by default** — never store API keys, passwords, or PII in memory files
- **Test recall quality** — bad embeddings return irrelevant results; validate with real queries
- **Embedding cost** — text-embedding-3-small is $0.02/1M tokens; budget ~1M tokens/month for active agents
- **ChromaDB vs Pinecone** — use ChromaDB for local/self-hosted, Pinecone for managed cloud at scale
- **Memory injection** — prepend relevant memories to agent system prompt, not user messages
