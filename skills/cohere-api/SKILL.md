---
name: cohere-api
description: >-
  Cohere API for enterprise NLP — embeddings, reranking, RAG, and text generation.
  Use when building RAG pipelines, semantic search, document reranking, or enterprise
  NLP applications. Command R+ excels at tool use and retrieval-augmented generation;
  Embed v3 and Rerank 3 are best-in-class for search quality.
license: Apache-2.0
compatibility: "Python 3.9+ or Node.js 18+ with cohere SDK"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["cohere", "embeddings", "rerank", "rag", "enterprise-nlp"]
  use-cases:
    - "Build a semantic search engine with Cohere Embed v3"
    - "Improve RAG pipeline accuracy by reranking retrieved documents with Rerank 3"
    - "Build an enterprise knowledge base Q&A system with Command R+"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Cohere API

## Overview

Cohere provides enterprise-grade NLP models purpose-built for production use cases. Their flagship offerings are: **Command R+** for RAG and agentic tasks, **Embed v3** for state-of-the-art semantic embeddings, and **Rerank 3** for dramatically improving search result relevance. All models are available via API with enterprise SLAs and on-premise deployment options.

## Setup

```bash
# Python
pip install cohere

# TypeScript/Node
npm install cohere-ai
```

```bash
export COHERE_API_KEY=...
```

## Available Models

| Model | Type | Best For |
|---|---|---|
| `command-r-plus` | Generation | Complex RAG, tool use, long context |
| `command-r` | Generation | Efficient RAG, cost-effective |
| `command` | Generation | Simple text tasks |
| `embed-english-v3.0` | Embedding | English semantic search |
| `embed-multilingual-v3.0` | Embedding | 100+ language search |
| `rerank-english-v3` | Reranking | English document reranking |
| `rerank-multilingual-v3` | Reranking | Multilingual reranking |

## Instructions

### Chat / Text Generation

```python
import cohere

co = cohere.ClientV2(api_key="your_api_key")  # or reads COHERE_API_KEY

response = co.chat(
    model="command-r-plus",
    messages=[
        {"role": "user", "content": "Explain transformer architecture in plain English."},
    ],
)

print(response.message.content[0].text)
```

### Document Embeddings

```python
import cohere

co = cohere.ClientV2()

# Embed documents for indexing
docs = [
    "Cohere provides enterprise NLP solutions.",
    "Embeddings convert text into dense vectors.",
    "RAG improves LLM answers with retrieved context.",
]

response = co.embed(
    texts=docs,
    model="embed-english-v3.0",
    input_type="search_document",  # "search_document" for indexing
    embedding_types=["float"],
)

embeddings = response.embeddings.float_
print(f"Embedding shape: {len(embeddings)} x {len(embeddings[0])}")  # 3 x 1024
```

### Query Embeddings for Search

```python
import cohere
import numpy as np

co = cohere.ClientV2()

# Query embedding — use "search_query" for queries
query = "How do embeddings work?"

query_response = co.embed(
    texts=[query],
    model="embed-english-v3.0",
    input_type="search_query",  # Different from "search_document"!
    embedding_types=["float"],
)

query_vector = query_response.embeddings.float_[0]

# Find most similar documents using cosine similarity
def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# (assuming doc_embeddings is a list of previously embedded documents)
similarities = [cosine_similarity(query_vector, doc_emb) for doc_emb in doc_embeddings]
top_idx = np.argsort(similarities)[::-1][:5]
```

### Reranking for RAG Improvement

```python
import cohere

co = cohere.ClientV2()

query = "What are the benefits of renewable energy?"

# Initial candidates (from vector search or keyword search)
documents = [
    "Solar panels convert sunlight into electricity efficiently.",
    "Wind energy reduces carbon emissions significantly.",
    "The history of fossil fuels dates back centuries.",
    "Renewable energy creates jobs in local communities.",
    "Nuclear power is debated as a clean energy source.",
    "Oil prices fluctuate based on global demand.",
]

rerank_response = co.rerank(
    model="rerank-english-v3",
    query=query,
    documents=documents,
    top_n=3,  # Return top 3 most relevant
)

for result in rerank_response.results:
    print(f"Rank {result.index}: Score {result.relevance_score:.3f}")
    print(f"  {documents[result.index]}\n")
```

### Command R+ for RAG with Citations

```python
import cohere

co = cohere.ClientV2()

# RAG with grounding documents — Command R+ provides cited responses
documents = [
    {"id": "doc1", "data": {"title": "Renewable Energy", "snippet": "Solar energy capacity grew 25% in 2024, reaching 1.5 TW globally."}},
    {"id": "doc2", "data": {"title": "Climate Policy", "snippet": "The EU Green Deal targets 55% emissions reduction by 2030."}},
]

response = co.chat(
    model="command-r-plus",
    messages=[{"role": "user", "content": "What is the current state of renewable energy?"}],
    documents=documents,
)

print(response.message.content[0].text)

# Citations reference specific document sources
if hasattr(response.message, "citations") and response.message.citations:
    for citation in response.message.citations:
        print(f"Citation: {citation}")
```

### Tool Use with Command R+

```python
import cohere
import json

co = cohere.ClientV2()

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_stock_price",
            "description": "Get the current stock price for a ticker symbol",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "Stock ticker (e.g. AAPL)"},
                },
                "required": ["ticker"],
            },
        },
    }
]

messages = [{"role": "user", "content": "What's the current Apple stock price?"}]

response = co.chat(
    model="command-r-plus",
    messages=messages,
    tools=tools,
)

if response.message.tool_calls:
    tool_call = response.message.tool_calls[0]
    args = json.loads(tool_call.function.arguments)
    print(f"Tool: {tool_call.function.name}, Args: {args}")

    # Execute tool and return result
    messages.append({"role": "assistant", "tool_calls": response.message.tool_calls})
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": json.dumps({"price": 189.84, "change": "+1.2%"}),
    })

    final = co.chat(model="command-r-plus", messages=messages, tools=tools)
    print(final.message.content[0].text)
```

### Complete RAG Pipeline

```python
import cohere
import numpy as np

co = cohere.ClientV2()

def build_rag_pipeline(documents: list[str]):
    """Embed a corpus of documents."""
    response = co.embed(
        texts=documents,
        model="embed-english-v3.0",
        input_type="search_document",
        embedding_types=["float"],
    )
    return response.embeddings.float_

def retrieve_and_rerank(query: str, documents: list[str], doc_embeddings, top_k=10, top_n=3):
    """Vector search + rerank for best results."""
    # Step 1: Embed query
    q_resp = co.embed(
        texts=[query],
        model="embed-english-v3.0",
        input_type="search_query",
        embedding_types=["float"],
    )
    q_vec = q_resp.embeddings.float_[0]

    # Step 2: Cosine similarity search
    sims = [np.dot(q_vec, d) / (np.linalg.norm(q_vec) * np.linalg.norm(d)) for d in doc_embeddings]
    candidates_idx = np.argsort(sims)[::-1][:top_k]
    candidates = [documents[i] for i in candidates_idx]

    # Step 3: Rerank candidates
    reranked = co.rerank(
        model="rerank-english-v3",
        query=query,
        documents=candidates,
        top_n=top_n,
    )

    return [candidates[r.index] for r in reranked.results]

def answer_with_rag(query: str, context_docs: list[str]) -> str:
    """Generate answer grounded in retrieved documents."""
    docs = [{"data": {"snippet": doc}} for doc in context_docs]
    response = co.chat(
        model="command-r-plus",
        messages=[{"role": "user", "content": query}],
        documents=docs,
    )
    return response.message.content[0].text
```

## Guidelines

- Always use `input_type="search_document"` when embedding docs and `input_type="search_query"` for queries — this matters for retrieval quality.
- Reranking adds ~100ms latency but often improves RAG answer quality by 20–40% vs vector search alone.
- Command R+ is optimized for RAG with grounding documents; use `documents` parameter for best citation quality.
- The `embed-multilingual-v3.0` model supports 100+ languages with a single model.
- Cohere offers on-premise and private cloud deployment for enterprises requiring data isolation.
- For large corpora, use Cohere's batch embedding endpoint to process thousands of documents efficiently.
