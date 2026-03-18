# Build a Production RAG Pipeline with Cohere Embeddings and Reranking

**Persona:** Developer building an enterprise knowledge base Q&A system that needs accurate, cited answers from a large internal document corpus.

You have thousands of internal documents — product manuals, support tickets, engineering runbooks — and you need users to get accurate answers with source citations. A naive RAG approach (embed → nearest-neighbor search → generate) gives mediocre results because vector similarity doesn't always match semantic relevance. Adding Cohere's Rerank 3 between retrieval and generation dramatically improves answer quality without changing your vector database.

---

## Architecture

```
Documents
    │
    ▼
Cohere Embed v3            ← embed-english-v3.0
    │                         (1024-dim vectors)
    ▼
Vector DB (pgvector / Qdrant / Pinecone)
    │
    ▼
User Query
    │
    ├─ Embed query (search_query input_type)
    │
    ▼
Vector Search (top-K=20 candidates)
    │
    ▼
Cohere Rerank 3            ← rerank-english-v3
    │                         (re-score → top-3)
    ▼
Command R+                 ← command-r-plus
    │                         (RAG with citations)
    ▼
Answer + Sources
```

---

## Step 1: Install Dependencies

```bash
pip install cohere qdrant-client python-dotenv tqdm
```

```bash
# .env
COHERE_API_KEY=your_key_here
QDRANT_URL=http://localhost:6333  # or Qdrant Cloud URL
```

---

## Step 2: Set Up the Vector Store

We'll use Qdrant (run locally with Docker):

```bash
docker run -p 6333:6333 qdrant/qdrant
```

```python
# vector_store.py
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import uuid

COLLECTION_NAME = "knowledge_base"
EMBEDDING_DIM = 1024  # Cohere embed-english-v3.0 dimension

def get_qdrant_client(url: str = "http://localhost:6333") -> QdrantClient:
    return QdrantClient(url=url)

def create_collection(client: QdrantClient):
    """Create vector collection if it doesn't exist."""
    existing = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME not in existing:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )
        print(f"Created collection: {COLLECTION_NAME}")
    else:
        print(f"Collection {COLLECTION_NAME} already exists")

def upsert_documents(client: QdrantClient, documents: list[dict]):
    """Insert documents with their embeddings into the vector store."""
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=doc["embedding"],
            payload={
                "text": doc["text"],
                "source": doc.get("source", "unknown"),
                "title": doc.get("title", ""),
                "chunk_index": doc.get("chunk_index", 0),
            },
        )
        for doc in documents
    ]
    client.upsert(collection_name=COLLECTION_NAME, points=points)
    print(f"Upserted {len(points)} documents")

def search(client: QdrantClient, query_vector: list[float], top_k: int = 20) -> list[dict]:
    """Retrieve top-K candidate documents by vector similarity."""
    results = client.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        limit=top_k,
        with_payload=True,
    )
    return [
        {
            "text": r.payload["text"],
            "source": r.payload["source"],
            "title": r.payload["title"],
            "score": r.score,
        }
        for r in results
    ]
```

---

## Step 3: Build the Embedding Pipeline

```python
# embedder.py
import cohere
import os
from typing import Literal

co = cohere.ClientV2(api_key=os.environ["COHERE_API_KEY"])

def embed_documents(texts: list[str], batch_size: int = 96) -> list[list[float]]:
    """
    Embed documents for indexing. Uses 'search_document' input type.
    Processes in batches to respect API limits.
    """
    all_embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        response = co.embed(
            texts=batch,
            model="embed-english-v3.0",
            input_type="search_document",
            embedding_types=["float"],
        )
        all_embeddings.extend(response.embeddings.float_)
        print(f"Embedded {min(i + batch_size, len(texts))}/{len(texts)} documents")
    return all_embeddings

def embed_query(query: str) -> list[float]:
    """Embed a search query. Uses 'search_query' input type (IMPORTANT: different from documents!)."""
    response = co.embed(
        texts=[query],
        model="embed-english-v3.0",
        input_type="search_query",
        embedding_types=["float"],
    )
    return response.embeddings.float_[0]
```

---

## Step 4: Chunk and Index Documents

```python
# indexer.py
import os
import re
from pathlib import Path
from embedder import embed_documents
from vector_store import get_qdrant_client, create_collection, upsert_documents

def chunk_text(text: str, chunk_size: int = 512, overlap: int = 64) -> list[str]:
    """Split text into overlapping chunks for better retrieval coverage."""
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        if chunk:
            chunks.append(chunk)
    return chunks

def index_documents(docs_path: str = "./docs"):
    """Index all .txt and .md files from a directory."""
    qdrant = get_qdrant_client()
    create_collection(qdrant)

    documents = []
    for file_path in Path(docs_path).rglob("*.{txt,md}"):
        text = file_path.read_text(encoding="utf-8")
        chunks = chunk_text(text)
        for idx, chunk in enumerate(chunks):
            documents.append({
                "text": chunk,
                "source": str(file_path),
                "title": file_path.stem,
                "chunk_index": idx,
            })

    print(f"Indexing {len(documents)} chunks from {docs_path}")

    # Batch embed all chunks
    texts = [doc["text"] for doc in documents]
    embeddings = embed_documents(texts)

    # Attach embeddings
    for doc, emb in zip(documents, embeddings):
        doc["embedding"] = emb

    upsert_documents(qdrant, documents)
    print("Indexing complete!")

if __name__ == "__main__":
    index_documents("./docs")
```

---

## Step 5: Retrieval with Reranking

```python
# retriever.py
import cohere
import os
from embedder import embed_query
from vector_store import get_qdrant_client, search

co = cohere.ClientV2(api_key=os.environ["COHERE_API_KEY"])
qdrant = get_qdrant_client()

def retrieve(
    query: str,
    vector_top_k: int = 20,
    rerank_top_n: int = 5,
) -> list[dict]:
    """
    Two-stage retrieval:
    1. Vector search for broad recall (top-K candidates)
    2. Reranking for precise relevance (top-N results)
    """
    # Stage 1: Vector similarity search
    query_vector = embed_query(query)
    candidates = search(qdrant, query_vector, top_k=vector_top_k)

    if not candidates:
        return []

    # Stage 2: Rerank with Cohere Rerank 3
    candidate_texts = [c["text"] for c in candidates]
    rerank_response = co.rerank(
        model="rerank-english-v3",
        query=query,
        documents=candidate_texts,
        top_n=rerank_top_n,
    )

    # Map reranked results back to full document metadata
    reranked = []
    for result in rerank_response.results:
        doc = candidates[result.index]
        doc["rerank_score"] = result.relevance_score
        reranked.append(doc)

    return reranked
```

---

## Step 6: Generate Answer with Command R+

```python
# generator.py
import cohere
import os
from retriever import retrieve

co = cohere.ClientV2(api_key=os.environ["COHERE_API_KEY"])

def answer(question: str, top_n: int = 5) -> dict:
    """
    Full RAG pipeline: retrieve → rerank → generate with citations.
    Returns answer text, source citations, and retrieved context.
    """
    # Retrieve and rerank relevant documents
    docs = retrieve(question, vector_top_k=20, rerank_top_n=top_n)

    if not docs:
        return {
            "answer": "I couldn't find relevant information in the knowledge base.",
            "sources": [],
            "context_used": 0,
        }

    # Format documents for Command R+ grounding
    grounding_docs = [
        {
            "id": f"doc_{i}",
            "data": {
                "title": doc.get("title", f"Document {i}"),
                "snippet": doc["text"],
                "source": doc.get("source", ""),
            },
        }
        for i, doc in enumerate(docs)
    ]

    # Generate grounded response
    response = co.chat(
        model="command-r-plus",
        messages=[{"role": "user", "content": question}],
        documents=grounding_docs,
    )

    # Extract answer and citations
    answer_text = response.message.content[0].text

    sources = list({
        doc.get("source", "") for doc in docs
        if doc.get("source")
    })

    return {
        "answer": answer_text,
        "sources": sources,
        "context_used": len(docs),
        "top_doc_scores": [
            {"title": d.get("title", ""), "rerank_score": d.get("rerank_score", 0)}
            for d in docs[:3]
        ],
    }
```

---

## Step 7: Run the Pipeline

```python
# main.py
from indexer import index_documents
from generator import answer
import json

# First run: index your documents
# index_documents("./docs")

# Query the knowledge base
queries = [
    "How do I reset my password?",
    "What is the refund policy for enterprise plans?",
    "How do I configure SSO with Okta?",
]

for query in queries:
    print(f"\n{'='*60}")
    print(f"Q: {query}")
    result = answer(query)
    print(f"A: {result['answer'][:400]}...")
    print(f"\nSources ({result['context_used']} docs used):")
    for src in result["sources"]:
        print(f"  - {src}")
    print(f"\nTop reranked docs:")
    for doc in result["top_doc_scores"]:
        print(f"  {doc['title']}: {doc['rerank_score']:.3f}")
```

---

## Step 8: Evaluate Retrieval Quality

```python
# evaluate.py — Compare vector-only vs vector+rerank
from embedder import embed_query
from vector_store import get_qdrant_client, search
import cohere, os

co = cohere.ClientV2(api_key=os.environ["COHERE_API_KEY"])
qdrant = get_qdrant_client()

test_cases = [
    {
        "query": "password reset steps",
        "relevant_title": "user-authentication",
    },
    {
        "query": "cancel subscription",
        "relevant_title": "billing-policy",
    },
]

for case in test_cases:
    query_vec = embed_query(case["query"])
    candidates = search(qdrant, query_vec, top_k=10)

    reranked = co.rerank(
        model="rerank-english-v3",
        query=case["query"],
        documents=[c["text"] for c in candidates],
        top_n=3,
    )

    vector_top1 = candidates[0]["title"] if candidates else "none"
    rerank_top1 = candidates[reranked.results[0].index]["title"] if reranked.results else "none"
    expected = case["relevant_title"]

    print(f"Query: {case['query']}")
    print(f"  Vector top-1: {vector_top1} {'✓' if expected in vector_top1 else '✗'}")
    print(f"  Rerank top-1: {rerank_top1} {'✓' if expected in rerank_top1 else '✗'}")
```

---

## Performance Expectations

| Stage | Latency | Quality Impact |
|---|---|---|
| Embed query (Cohere) | ~50ms | — |
| Vector search (Qdrant) | ~10ms | Broad recall |
| Rerank top-20 → top-5 | ~100ms | +20–40% answer accuracy |
| Command R+ generation | ~800ms | — |
| **Total** | **~960ms** | High-quality, cited answers |

---

## Extensions

- **Hybrid search**: Combine vector search with BM25 keyword search, then rerank the merged results for even better recall.
- **Metadata filtering**: Pre-filter by document type, department, or date before reranking.
- **Streaming**: Stream Command R+ responses with `co.chat_stream()` for better UX.
- **Evaluation**: Use RAGAS or TruLens to measure faithfulness, relevance, and groundedness.
- **Multi-language**: Switch to `embed-multilingual-v3.0` and `rerank-multilingual-v3` for non-English corpora.
