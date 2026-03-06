---
title: Build an AI-Powered Team Knowledge Base
slug: build-ai-powered-team-knowledge-base
description: Build an internal knowledge base that ingests Notion docs, Confluence pages, Slack threads, and GitHub READMEs into a vector database, then lets team members ask natural language questions and get accurate answers with source citations — reducing "where is this documented?" questions from 30/day to near-zero.
skills: [pgvector, crawlee, openai-realtime, vercel-ai-sdk]
category: AI & Machine Learning
tags: [rag, knowledge-base, vector-search, embeddings, internal-tools, onboarding]
---

# Build an AI-Powered Team Knowledge Base

Nadia is VP of Engineering at a 50-person startup that's grown from 12 people in 18 months. Documentation is scattered across Notion (product specs), Confluence (engineering runbooks), Slack (decisions buried in threads), GitHub (READMEs and ADRs), and Google Docs (meeting notes). New hires take 3 weeks to become productive because they can't find anything. The engineering Slack channel gets 30+ "where is this documented?" questions daily.

Nadia builds an AI-powered knowledge base that ingests all documentation sources, chunks and embeds them, and exposes a chat interface where anyone can ask questions in plain English and get accurate answers with links to the source document.

## Step 1: Document Ingestion Pipeline

The system needs to continuously ingest documents from multiple sources, track changes, and re-embed updated content. Each source has its own connector.

```python
# ingest/notion_connector.py — Sync documents from Notion
from notion_client import AsyncClient
from datetime import datetime
import hashlib

class NotionConnector:
    """Ingests pages and databases from a Notion workspace.

    Handles pagination, nested blocks, and incremental sync
    (only re-processes pages modified since last sync).
    """

    def __init__(self, token: str, db: AsyncSession):
        self.notion = AsyncClient(auth=token)
        self.db = db

    async def sync(self, last_sync: datetime | None = None):
        """Sync all pages modified since last_sync.

        Args:
            last_sync: Only fetch pages modified after this timestamp.
                       None = full re-sync.
        """
        pages = await self._list_pages(last_sync)
        documents = []

        for page in pages:
            # Extract all blocks (text, code, callouts, toggles)
            content = await self._extract_page_content(page["id"])
            content_hash = hashlib.sha256(content.encode()).hexdigest()

            # Skip if content hasn't changed
            existing = await self.db.get_document(source_id=page["id"])
            if existing and existing.content_hash == content_hash:
                continue

            documents.append({
                "source": "notion",
                "source_id": page["id"],
                "title": self._get_title(page),
                "content": content,
                "content_hash": content_hash,
                "url": page["url"],
                "updated_at": page["last_edited_time"],
                "metadata": {
                    "workspace": "engineering",
                    "tags": self._extract_tags(page),
                    "author": page.get("created_by", {}).get("name"),
                },
            })

        return documents

    async def _extract_page_content(self, page_id: str) -> str:
        """Recursively extract all text content from a Notion page.

        Handles: paragraphs, headings, code blocks, bullet lists,
        numbered lists, toggles, callouts, and nested child pages.
        """
        blocks = []
        cursor = None

        while True:
            response = await self.notion.blocks.children.list(
                block_id=page_id, start_cursor=cursor, page_size=100
            )
            blocks.extend(response["results"])
            if not response["has_more"]:
                break
            cursor = response["next_cursor"]

        text_parts = []
        for block in blocks:
            block_type = block["type"]
            if block_type in ("paragraph", "heading_1", "heading_2", "heading_3",
                              "bulleted_list_item", "numbered_list_item", "callout"):
                rich_text = block[block_type].get("rich_text", [])
                text = "".join(t["plain_text"] for t in rich_text)
                if text:
                    prefix = "#" * int(block_type[-1]) + " " if "heading" in block_type else ""
                    text_parts.append(f"{prefix}{text}")
            elif block_type == "code":
                code = "".join(t["plain_text"] for t in block["code"]["rich_text"])
                lang = block["code"]["language"]
                text_parts.append(f"```{lang}\n{code}\n```")

            # Recurse into child blocks
            if block.get("has_children"):
                child_content = await self._extract_page_content(block["id"])
                text_parts.append(child_content)

        return "\n\n".join(text_parts)
```

```python
# ingest/slack_connector.py — Extract knowledge from Slack threads
class SlackConnector:
    """Ingests valuable Slack threads as knowledge documents.

    Not every Slack message is worth indexing. This connector focuses on:
    - Threads with 5+ replies (active discussions)
    - Messages with bookmarks or reactions (team-validated content)
    - Messages in designated channels (#decisions, #architecture, #runbooks)
    """

    KNOWLEDGE_CHANNELS = ["decisions", "architecture", "runbooks", "incidents", "announcements"]
    MIN_THREAD_REPLIES = 5                # Only index substantive threads
    KNOWLEDGE_REACTIONS = ["bookmark", "white_check_mark", "brain", "pushpin"]

    async def sync(self, last_sync: datetime | None = None):
        """Find and ingest knowledge-worthy Slack threads.

        Filters for threads that contain actual decisions or knowledge,
        not casual conversation.
        """
        documents = []

        for channel_name in self.KNOWLEDGE_CHANNELS:
            channel_id = await self._get_channel_id(channel_name)
            messages = await self._get_messages(channel_id, since=last_sync)

            for msg in messages:
                # Filter: must have enough engagement or a bookmark reaction
                if not self._is_knowledge_worthy(msg):
                    continue

                # Fetch full thread
                thread = await self._get_thread(channel_id, msg["ts"])
                content = self._format_thread(thread)

                documents.append({
                    "source": "slack",
                    "source_id": f"{channel_id}:{msg['ts']}",
                    "title": f"#{channel_name}: {self._extract_topic(thread)}",
                    "content": content,
                    "url": self._get_permalink(channel_id, msg["ts"]),
                    "updated_at": thread[-1]["ts"],
                    "metadata": {
                        "channel": channel_name,
                        "participants": list(set(m.get("user") for m in thread)),
                        "reaction_count": sum(len(m.get("reactions", [])) for m in thread),
                    },
                })

        return documents

    def _is_knowledge_worthy(self, msg: dict) -> bool:
        """Determine if a message thread contains indexable knowledge."""
        # Has enough replies to be a real discussion
        if msg.get("reply_count", 0) >= self.MIN_THREAD_REPLIES:
            return True
        # Has a "bookmark" or "pin" reaction (manually marked as valuable)
        reactions = msg.get("reactions", [])
        return any(r["name"] in self.KNOWLEDGE_REACTIONS for r in reactions)
```

## Step 2: Chunking and Embedding

Raw documents are too large for embedding. The chunker splits them into semantically meaningful pieces — respecting heading boundaries, keeping code blocks intact, and maintaining context through overlap.

```python
# embed/chunker.py — Semantic document chunking
from dataclasses import dataclass

@dataclass
class Chunk:
    """A single chunk of a document, ready for embedding.

    Each chunk includes:
    - The text content (500-1500 tokens)
    - Context from parent headings (for retrieval quality)
    - Source metadata for citation
    """
    document_id: str
    chunk_index: int
    content: str                          # The actual text to embed
    context: str                          # Parent headings for context
    token_count: int
    source_url: str
    source_title: str

def chunk_document(doc: dict, max_tokens: int = 1000, overlap_tokens: int = 100) -> list[Chunk]:
    """Split a document into overlapping chunks for embedding.

    Strategy:
    1. Split on headings first (natural semantic boundaries)
    2. If a section exceeds max_tokens, split on paragraphs
    3. Keep code blocks intact (never split mid-code)
    4. Add heading context to each chunk for better retrieval

    Args:
        doc: Document dict with content, title, url
        max_tokens: Maximum tokens per chunk (default 1000)
        overlap_tokens: Overlap between chunks for context continuity
    """
    sections = split_by_headings(doc["content"])
    chunks = []
    heading_stack = []                    # Track current heading hierarchy

    for section in sections:
        # Update heading context
        if section["heading"]:
            level = section["level"]
            heading_stack = heading_stack[:level - 1] + [section["heading"]]

        context = " > ".join(heading_stack)  # e.g., "Deployment > Docker > Environment Variables"

        if count_tokens(section["text"]) <= max_tokens:
            chunks.append(Chunk(
                document_id=doc["source_id"],
                chunk_index=len(chunks),
                content=section["text"],
                context=f"{doc['title']} > {context}",
                token_count=count_tokens(section["text"]),
                source_url=doc["url"],
                source_title=doc["title"],
            ))
        else:
            # Section too large — split on paragraphs with overlap
            paragraphs = section["text"].split("\n\n")
            current_chunk = []
            current_tokens = 0

            for para in paragraphs:
                para_tokens = count_tokens(para)

                if current_tokens + para_tokens > max_tokens and current_chunk:
                    chunks.append(Chunk(
                        document_id=doc["source_id"],
                        chunk_index=len(chunks),
                        content="\n\n".join(current_chunk),
                        context=f"{doc['title']} > {context}",
                        token_count=current_tokens,
                        source_url=doc["url"],
                        source_title=doc["title"],
                    ))
                    # Overlap: keep last paragraph for context
                    current_chunk = current_chunk[-1:]
                    current_tokens = count_tokens(current_chunk[0]) if current_chunk else 0

                current_chunk.append(para)
                current_tokens += para_tokens

            if current_chunk:
                chunks.append(Chunk(
                    document_id=doc["source_id"],
                    chunk_index=len(chunks),
                    content="\n\n".join(current_chunk),
                    context=f"{doc['title']} > {context}",
                    token_count=current_tokens,
                    source_url=doc["url"],
                    source_title=doc["title"],
                ))

    return chunks
```

```python
# embed/vectorize.py — Generate embeddings and store in pgvector
from openai import OpenAI
import numpy as np

client = OpenAI()

async def embed_and_store(chunks: list[Chunk], db: AsyncSession):
    """Generate embeddings for chunks and store in PostgreSQL with pgvector.

    Uses OpenAI's text-embedding-3-small (1536 dimensions, $0.02/1M tokens).
    Batches chunks in groups of 100 for efficient API usage.
    """
    batch_size = 100

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        texts = [f"{c.context}\n\n{c.content}" for c in batch]  # Include context in embedding

        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )

        for chunk, embedding_data in zip(batch, response.data):
            await db.execute("""
                INSERT INTO document_chunks (document_id, chunk_index, content, context,
                    source_url, source_title, embedding, token_count)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (document_id, chunk_index)
                DO UPDATE SET content = $3, context = $4, embedding = $7
            """, chunk.document_id, chunk.chunk_index, chunk.content,
                chunk.context, chunk.source_url, chunk.source_title,
                embedding_data.embedding, chunk.token_count)
```

## Step 3: Search and Answer Generation

When a team member asks a question, the system embeds the query, finds the most relevant chunks via cosine similarity, and passes them to GPT-4o as context for answer generation — with source citations.

```python
# search/answer.py — RAG search and answer generation
async def answer_question(question: str, db: AsyncSession) -> dict:
    """Answer a question using the knowledge base.

    Pipeline:
    1. Embed the question
    2. Find top-k similar chunks via pgvector cosine similarity
    3. Re-rank results for relevance
    4. Generate answer with GPT-4o using relevant chunks as context
    5. Return answer with source citations

    Args:
        question: Natural language question from team member
    """
    # Step 1: Embed the question
    q_embedding = client.embeddings.create(
        model="text-embedding-3-small", input=[question]
    ).data[0].embedding

    # Step 2: Vector similarity search (pgvector)
    results = await db.fetch_all("""
        SELECT content, context, source_url, source_title,
               1 - (embedding <=> $1::vector) as similarity
        FROM document_chunks
        WHERE 1 - (embedding <=> $1::vector) > 0.7
        ORDER BY embedding <=> $1::vector
        LIMIT 10
    """, q_embedding)

    if not results:
        return {"answer": "I couldn't find relevant documentation for this question.",
                "sources": [], "confidence": "low"}

    # Step 3: Build context from top results
    context = "\n\n---\n\n".join(
        f"Source: {r['source_title']} ({r['source_url']})\n"
        f"Section: {r['context']}\n\n{r['content']}"
        for r in results[:5]                  # Top 5 most relevant chunks
    )

    # Step 4: Generate answer with citations
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": """You are a helpful team knowledge assistant.
Answer questions based ONLY on the provided context. If the context doesn't
contain enough information, say so — never make things up.

Rules:
- Cite sources with [Source: title](url) for every claim
- If multiple sources agree, mention that
- If sources conflict, present both perspectives
- Use bullet points for clarity
- If the question is about a process, give step-by-step instructions"""},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
        ],
        temperature=0.3,                      # Low temperature for factual accuracy
    )

    return {
        "answer": response.choices[0].message.content,
        "sources": [{"title": r["source_title"], "url": r["source_url"],
                     "similarity": round(r["similarity"], 3)} for r in results[:5]],
        "confidence": "high" if results[0]["similarity"] > 0.85 else "medium",
    }
```

## Results After 30 Days

The knowledge base indexes 2,400 documents from 4 sources. It answers 85% of "where is this documented?" questions accurately on the first try.

Impact metrics:
- **Slack noise**: "Where is X documented?" dropped from 30/day to 4/day
- **Onboarding time**: New hire ramp-up from 3 weeks to 8 days
- **Answer accuracy**: 85% accurate with citations (verified by spot-checking)
- **Most-asked topics**: deployment process (18%), API conventions (14%), incident response (11%)
- **Document freshness**: Average document age in the index is 4.2 days (auto-syncs every 6 hours)
- **Cost**: ~$120/month (OpenAI embeddings + GPT-4o for ~200 questions/day)
