---
name: cohere-api
description: >-
  Cohere API for enterprise NLP — embeddings, reranking, RAG, and text generation.
  Use when building RAG pipelines, semantic search, document reranking, or enterprise
  NLP applications. The Command A models handle tool use and retrieval-augmented
  generation with citations; Embed and Rerank models improve search quality.
license: Apache-2.0
compatibility: "Python 3.10+ (cohere 7.x) or Node.js 18+ (cohere-ai 8.x)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/cohere-ai/cohere-python
  tags: ["cohere", "embeddings", "rerank", "rag", "enterprise-nlp"]
  use-cases:
    - "Build a semantic search engine with Cohere Embed"
    - "Improve RAG pipeline accuracy by reranking retrieved documents with Cohere Rerank"
    - "Build an enterprise knowledge base Q&A system with Command A"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Cohere API

## Overview

Cohere provides enterprise-grade NLP models purpose-built for production use cases. Their main offerings are the **Command A** family for RAG and agentic tasks, **Embed** models for semantic embeddings, and **Rerank** models for improving search result relevance. Models are available through Cohere's API and through AWS, Azure and Oracle platforms.

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
| `command-a-plus-05-2026` | Generation | Newest; vision input, agents, reasoning, translation (128k context) |
| `command-a-03-2025` | Generation | Tool use, RAG, multilingual (256k context) |
| `command-r7b-12-2024` | Generation | Small, fast RAG and tool use |
| `command-r-08-2024`, `command-r-plus-08-2024` | Generation | Older but live; dated names only |
| `embed-v5.0-pro`, `embed-v5.0-fast` | Embedding | Text and images, 2048 dims by default |
| `embed-v4.0` | Embedding | Text and images, 1536 dims by default |
| `embed-english-v3.0`, `embed-multilingual-v3.0` | Embedding | Text, 1024 dims, 512-token context |
| `rerank-v5.0-pro`, `rerank-v5.0-fast` | Reranking | Multilingual, 32k context, relevant spans |
| `rerank-v3.5` | Reranking | Older multilingual reranker |

The bare aliases `command-r` and `command-r-plus`, plus `command-r-03-2024`, `command-r-plus-04-2024`, `command-light` and `command`, were deprecated on 2025-09-15, and all `embed-*-v2.0` models were retired on 2026-04-04. The v2 rerank models were shut down on 2025-04-30. Check the [model list](https://docs.cohere.com/docs/models) and the [deprecations page](https://docs.cohere.com/docs/deprecations) before pinning a model.

## Instructions

### Chat / Text Generation

```python
import cohere

co = cohere.ClientV2()  # reads COHERE_API_KEY from the environment

response = co.chat(
    model="command-a-plus-05-2026",
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
    model="embed-v4.0",
    input_type="search_document",  # "search_document" for indexing
    embedding_types=["float"],
)  # at most 96 texts per call

embeddings = response.embeddings.float_
print(f"Embedding shape: {len(embeddings)} x {len(embeddings[0])}")  # 3 x 1536 for embed-v4.0 (output_dimension picks 256/512/1024/1536)
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
    model="embed-v4.0",
    input_type="search_query",  # Different from "search_document"!
    embedding_types=["float"],
)

query_vector = query_response.embeddings.float_[0]

# Find most similar documents using cosine similarity
def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

similarities = [cosine_similarity(query_vector, doc_emb) for doc_emb in doc_embeddings]
top_idx = np.argsort(similarities)[::-1][:5]
```

### Reranking for RAG Improvement

```python
import cohere

co = cohere.ClientV2()

query = "What are the benefits of renewable energy?"

documents = [
    "Solar panels convert sunlight into electricity efficiently.",
    "Wind energy reduces carbon emissions significantly.",
    "The history of fossil fuels dates back centuries.",
    "Renewable energy creates jobs in local communities.",
    "Nuclear power is debated as a clean energy source.",
    "Oil prices fluctuate based on global demand.",
]

rerank_response = co.rerank(
    model="rerank-v5.0-pro",
    query=query,
    documents=documents,
    top_n=3,  # Return top 3 most relevant
)

for rank, result in enumerate(rerank_response.results, start=1):
    print(f"#{rank} (document {result.index}): score {result.relevance_score:.3f}")
    print(f"  {documents[result.index]}\n")
```

## Examples

### RAG with Citations

```python
import cohere

co = cohere.ClientV2()

# RAG with grounding documents — the model returns cited answers
documents = [
    {"id": "doc1", "data": {"title": "Renewable Energy", "snippet": "Solar energy capacity grew 25% in 2024, reaching 1.5 TW globally."}},
    {"id": "doc2", "data": {"title": "Climate Policy", "snippet": "The EU Green Deal targets 55% emissions reduction by 2030."}},
]

response = co.chat(
    model="command-a-plus-05-2026",
    messages=[{"role": "user", "content": "What is the current state of renewable energy?"}],
    documents=documents,
)

print(response.message.content[0].text)

# Each citation gives the cited span (start/end/text) and the source documents
for citation in response.message.citations or []:
    print(citation.text, [source.id for source in citation.sources])
```

### Tool Use

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
    model="command-a-plus-05-2026",
    messages=messages,
    tools=tools,
)

if response.message.tool_calls:
    tool_call = response.message.tool_calls[0]
    args = json.loads(tool_call.function.arguments)
    print(f"Tool: {tool_call.function.name}, Args: {args}")

    # Execute tool and return result
    messages.append(response.message)  # keeps tool_plan and tool_calls
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": [{"type": "document", "document": {"data": json.dumps({"price": 189.84, "change": "+1.2%"})}}],
    })

    final = co.chat(model="command-a-plus-05-2026", messages=messages, tools=tools)
    print(final.message.content[0].text)
```

### Complete RAG Pipeline

```python
import cohere
import numpy as np

co = cohere.ClientV2()

def build_rag_pipeline(documents: list[str]):
    response = co.embed(
        texts=documents,
        model="embed-v4.0",
        input_type="search_document",
        embedding_types=["float"],
    )
    return response.embeddings.float_

def retrieve_and_rerank(query: str, documents: list[str], doc_embeddings, top_k=10, top_n=3):
    # Step 1: Embed query
    q_resp = co.embed(
        texts=[query],
        model="embed-v4.0",
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
        model="rerank-v5.0-pro",
        query=query,
        documents=candidates,
        top_n=top_n,
    )

    return [candidates[r.index] for r in reranked.results]

def answer_with_rag(query: str, context_docs: list[str]) -> str:
    docs = [{"data": {"snippet": doc}} for doc in context_docs]
    response = co.chat(
        model="command-a-plus-05-2026",
        messages=[{"role": "user", "content": query}],
        documents=docs,
    )
    return response.message.content[0].text
```

## Guidelines

- Use `input_type="search_document"` when embedding documents and `input_type="search_query"` for queries; v3 and newer embed models require `input_type`.
- Embeddings from different models are not comparable: re-embed the whole corpus when you change the embed model or `output_dimension`.
- Embed accepts at most 96 texts per call; loop over larger corpora in batches. For very large corpora, look at Embed Jobs in the API reference.
- Rerank only reorders candidates you already retrieved; send up to about 1,000 documents per request and use `top_n` to cut the list. Long documents are truncated to `max_tokens_per_doc` (default 4096).
- Pass grounding data through `documents` in `co.chat` to get citations in `response.message.citations`; keep each snippet short (about 300 words).
- Pin models by their dated names; aliases such as `command-r-plus` point to models deprecated on 2025-09-15, which are closed to new customers.
- Do not put `COHERE_API_KEY` in source files; read it from the environment.
