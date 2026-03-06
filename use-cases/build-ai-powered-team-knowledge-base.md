---
title: Build an AI-Powered Team Knowledge Base
slug: build-ai-powered-team-knowledge-base
description: >-
  Build an internal RAG knowledge base that ingests Notion, Confluence, Slack, and GitHub docs into pgvector, letting team members ask questions and get cited answers.
skills: [pgvector, crawlee, openai-sdk, vercel-ai-sdk]
category: data-ai
tags: [rag, knowledge-base, vector-search, embeddings, internal-tools]
---

# Build an AI-Powered Team Knowledge Base

Nadia is VP of Engineering at a 50-person startup that grew from 12 people in 18 months. Documentation is scattered across Notion, Confluence, Slack, GitHub, and Google Docs. New hires take 3 weeks to ramp up because they can't find anything, and the engineering Slack gets 30+ "where is this documented?" questions daily.

## The Problem

Knowledge is trapped in silos. Product specs live in Notion, runbooks in Confluence, architectural decisions are buried in Slack threads, and API docs are scattered across GitHub READMEs. No single search covers all sources. Engineers interrupt each other constantly to find information that exists somewhere but is effectively invisible. Every new hire rediscovers the same tribal knowledge the hard way.

## The Solution

Build a RAG-powered knowledge base that ingests all documentation sources, chunks and embeds them into pgvector, and exposes a chat interface where anyone can ask questions in plain English and get accurate, cited answers.

```bash
terminal-skills install pgvector crawlee openai-sdk vercel-ai-sdk
```

## Step-by-Step Walkthrough

### 1. Document Ingestion Pipeline

Each source gets its own connector that handles incremental sync — only re-processing documents modified since the last run. The Notion connector extracts all block types (paragraphs, headings, code, callouts) recursively, while the Slack connector filters for knowledge-worthy threads (5+ replies or bookmark reactions in designated channels like #decisions and #architecture).

```python
# ingest/notion_connector.py
class NotionConnector:
    async def sync(self, last_sync: datetime | None = None):
        pages = await self._list_pages(last_sync)
        documents = []
        for page in pages:
            content = await self._extract_page_content(page["id"])
            content_hash = hashlib.sha256(content.encode()).hexdigest()
            existing = await self.db.get_document(source_id=page["id"])
            if existing and existing.content_hash == content_hash:
                continue
            documents.append({
                "source": "notion", "source_id": page["id"],
                "title": self._get_title(page), "content": content,
                "url": page["url"], "updated_at": page["last_edited_time"],
            })
        return documents
```

### 2. Chunking and Embedding

Documents are split into semantically meaningful chunks (500-1500 tokens) that respect heading boundaries and keep code blocks intact. Each chunk carries parent heading context for better retrieval quality. Embeddings are generated with OpenAI's text-embedding-3-small and stored in pgvector.

```python
# embed/chunker.py
def chunk_document(doc: dict, max_tokens: int = 1000, overlap: int = 100):
    """Split on headings first, then paragraphs. Never split mid-code block.
    Each chunk gets heading context like 'Deployment > Docker > Env Variables'."""
    sections = split_by_headings(doc["content"])
    chunks = []
    for section in sections:
        context = " > ".join(heading_stack)
        if count_tokens(section["text"]) <= max_tokens:
            chunks.append(Chunk(content=section["text"], context=context))
        else:
            # Split on paragraphs with overlap for continuity
            for para_group in split_paragraphs(section["text"], max_tokens, overlap):
                chunks.append(Chunk(content=para_group, context=context))
    return chunks

# embed/vectorize.py — Batch embed and upsert to pgvector
async def embed_and_store(chunks, db):
    for batch in batched(chunks, 100):
        texts = [f"{c.context}\n\n{c.content}" for c in batch]
        response = client.embeddings.create(
            model="text-embedding-3-small", input=texts
        )
        for chunk, emb in zip(batch, response.data):
            await db.execute(
                "INSERT INTO document_chunks (..., embedding) VALUES (..., $1) "
                "ON CONFLICT DO UPDATE SET embedding = $1", emb.embedding
            )
```

### 3. Search and Answer Generation

When a team member asks a question, the system embeds the query, finds the top-k similar chunks via pgvector cosine similarity, and passes them to GPT-4o for answer generation with source citations.

```python
async def answer_question(question: str, db) -> dict:
    q_embedding = client.embeddings.create(
        model="text-embedding-3-small", input=[question]
    ).data[0].embedding

    results = await db.fetch_all("""
        SELECT content, context, source_url, source_title,
               1 - (embedding <=> $1::vector) as similarity
        FROM document_chunks
        WHERE 1 - (embedding <=> $1::vector) > 0.7
        ORDER BY embedding <=> $1::vector LIMIT 10
    """, q_embedding)

    context = "\n\n---\n\n".join(
        f"Source: {r['source_title']} ({r['source_url']})\n{r['content']}"
        for r in results[:5]
    )

    response = client.chat.completions.create(
        model="gpt-4o", temperature=0.3,
        messages=[
            {"role": "system", "content": "Answer based ONLY on provided context. "
             "Cite sources with [Source: title](url). Never make things up."},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
        ],
    )
    return {
        "answer": response.choices[0].message.content,
        "sources": [{"title": r["source_title"], "url": r["source_url"]} for r in results[:5]],
        "confidence": "high" if results[0]["similarity"] > 0.85 else "medium",
    }
```

## Real-World Example

Nadia, VP of Engineering at a 50-person startup, deploys the knowledge base indexing 4 sources.

1. She configures connectors for Notion (product specs), Confluence (runbooks), Slack (#decisions, #architecture), and GitHub (READMEs, ADRs)
2. Initial ingestion processes 2,400 documents, generating ~18,000 chunks
3. The system auto-syncs every 6 hours, only re-embedding changed documents
4. A new hire on day 2 asks: "How do we deploy to staging?" and gets step-by-step instructions cited from the Confluence runbook
5. Engineers stop interrupting each other — the bot answers in the #ask-docs Slack channel

**After 30 days:** "Where is X documented?" questions dropped from 30/day to 4/day. New hire ramp-up shortened from 3 weeks to 8 days. Answer accuracy hit 85% (verified by spot-checking). Most-asked topics: deployment (18%), API conventions (14%), incident response (11%). Cost: ~$120/month for embeddings + ~200 questions/day.

## Related Skills

- [pgvector](../skills/pgvector/) — Vector storage and cosine similarity search
- [crawlee](../skills/crawlee/) — Web crawling for ingesting external documentation
- [openai-sdk](../skills/openai-sdk/) — Embeddings and answer generation
- [vercel-ai-sdk](../skills/vercel-ai-sdk/) — Build the chat interface frontend
