---
name: offline-ai-toolkit
description: >-
  Build offline-capable AI systems with local models, embedded knowledge bases,
  and no internet dependency. Use when: building AI tools for offline use,
  creating self-contained knowledge systems, deploying AI in air-gapped
  environments.
license: MIT
compatibility: "Node.js 18+ or Python 3.10+, Ollama"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: [offline, local-ai, ollama, knowledge-base, edge-ai]
  use-cases:
    - "Build a self-contained AI assistant that works without internet"
    - "Create an offline knowledge base with local LLM for field work"
    - "Deploy AI tools in air-gapped or low-connectivity environments"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Offline AI Toolkit — Self-Contained AI Systems

## Overview

Build AI systems that work completely offline — local LLMs via Ollama, embedded vector search with SQLite, knowledge bases from pre-downloaded content, and a PWA interface that runs without connectivity. Ideal for field work, air-gapped environments, or privacy-first deployments.

## Instructions

### Step 1: Install Ollama for Local LLMs

```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.1:8b       # General purpose (4.7GB)
ollama pull nomic-embed-text   # Embeddings (274MB)
```

| Use Case | Model | RAM Needed |
|----------|-------|------------|
| General Q&A | llama3.1:8b | 8GB |
| Quick answers | phi3:mini | 4GB |
| Code help | codellama:7b | 8GB |
| Embeddings | nomic-embed-text | 2GB |

### Step 2: Build the Offline Knowledge Base

```python
import requests, sqlite3, os

def init_knowledge_db(db_path='knowledge.db'):
    """Initialize SQLite database for knowledge storage."""
    conn = sqlite3.connect(db_path)
    conn.execute('''CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT,
        source TEXT, content TEXT, category TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY, doc_id INTEGER REFERENCES documents(id),
        chunk_text TEXT, embedding BLOB, chunk_index INTEGER
    )''')
    conn.execute('''CREATE VIRTUAL TABLE IF NOT EXISTS fts_documents
        USING fts5(title, content, category)''')
    return conn

def download_wikipedia_articles(topics, conn):
    """Download Wikipedia articles for offline knowledge."""
    for topic in topics:
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{topic}"
        try:
            r = requests.get(url, timeout=10)
            data = r.json()
            content = data.get('extract', '')
            if content:
                conn.execute(
                    'INSERT INTO documents (title, source, content, category) VALUES (?, ?, ?, ?)',
                    (data.get('title', topic), f'wikipedia:{topic}', content, 'encyclopedia'))
        except Exception as e:
            print(f"Failed to download {topic}: {e}")
    conn.commit()
```

### Step 3: Generate Embeddings with Ollama

```python
import struct

def get_embedding(text, model='nomic-embed-text'):
    """Get embedding vector from Ollama."""
    response = requests.post('http://localhost:11434/api/embeddings',
                             json={'model': model, 'prompt': text})
    return response.json()['embedding']

def embedding_to_blob(embedding):
    return struct.pack(f'{len(embedding)}f', *embedding)

def blob_to_embedding(blob):
    n = len(blob) // 4
    return list(struct.unpack(f'{n}f', blob))

def embed_all_documents(conn, chunk_size=500):
    """Generate embeddings for all documents in the database."""
    cursor = conn.execute('SELECT id, content FROM documents')
    for doc_id, content in cursor.fetchall():
        words = content.split()
        for i in range(0, len(words), chunk_size):
            chunk = ' '.join(words[i:i + chunk_size])
            if len(chunk.strip()) < 20:
                continue
            emb = get_embedding(chunk)
            conn.execute(
                'INSERT INTO embeddings (doc_id, chunk_text, embedding, chunk_index) VALUES (?, ?, ?, ?)',
                (doc_id, chunk, embedding_to_blob(emb), i // chunk_size))
    conn.commit()
```

### Step 4: Offline Vector Search

```python
import math

def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0

def search_knowledge(query, conn, top_k=5):
    """Search the knowledge base using vector similarity."""
    query_emb = get_embedding(query)
    cursor = conn.execute('SELECT doc_id, chunk_text, embedding FROM embeddings')
    results = []
    for row in cursor.fetchall():
        sim = cosine_similarity(query_emb, blob_to_embedding(row[2]))
        results.append({'chunk_text': row[1], 'doc_id': row[0], 'similarity': sim})
    results.sort(key=lambda x: x['similarity'], reverse=True)
    return results[:top_k]
```

### Step 5: RAG with Local LLM

```python
def ask_offline(question, conn, model='llama3.1:8b'):
    """Answer questions using local RAG pipeline."""
    results = search_knowledge(question, conn, top_k=3)
    context = '\n\n'.join([r['chunk_text'] for r in results])
    response = requests.post('http://localhost:11434/api/generate', json={
        'model': model,
        'prompt': f"""Answer using ONLY the context provided.
If the context doesn't contain the answer, say "I don't have information about that."

Context:
{context}

Question: {question}
Answer:""",
        'stream': False
    })
    return {
        'answer': response.json()['response'],
        'sources': [r['chunk_text'][:100] for r in results],
        'model': model
    }
```

## Examples

### Example 1: Build an Offline Field Research Assistant

A wildlife researcher prepares an offline AI assistant before a 2-week trip to a remote area with no connectivity:

```python
# While online: download knowledge and build embeddings
conn = init_knowledge_db('field_research.db')

# Load species identification guides and park documentation
download_wikipedia_articles([
    'Grizzly_bear', 'Gray_wolf', 'Elk', 'Moose',
    'Yellowstone_National_Park', 'Wildlife_tracking',
    'Bear_safety', 'GPS_navigation'
], conn)

# Ingest local field manuals (markdown files on laptop)
for root, _, files in os.walk('./field-manuals'):
    for f in files:
        if f.endswith('.md'):
            with open(os.path.join(root, f)) as fh:
                conn.execute('INSERT INTO documents (title, source, content, category) VALUES (?,?,?,?)',
                             (f, os.path.join(root, f), fh.read(), 'field-manual'))
conn.commit()
embed_all_documents(conn)

# In the field (fully offline):
result = ask_offline("What are the signs of a nearby grizzly bear den?", conn)
# Answer: "Look for excavated hillside entrances, claw marks on nearby trees,
#  matted vegetation, and a strong musky odor. Dens are typically on north-facing
#  slopes at elevations above 6,000 feet..."
```

### Example 2: Air-Gapped Developer Documentation Server

A defense contractor sets up an offline coding assistant for a secure facility with no internet:

```python
conn = init_knowledge_db('dev_docs.db')

# Pre-load language and framework documentation
import os
for doc_dir in ['./docs/python-stdlib', './docs/react-docs', './docs/kubernetes']:
    for root, _, files in os.walk(doc_dir):
        for f in files:
            if f.endswith(('.md', '.txt', '.rst')):
                path = os.path.join(root, f)
                with open(path, 'r', errors='ignore') as fh:
                    conn.execute('INSERT INTO documents (title,source,content,category) VALUES (?,?,?,?)',
                                 (f, path, fh.read(), 'dev-docs'))
conn.commit()
embed_all_documents(conn)

# Developer queries the system (no internet needed):
result = ask_offline("How do I create a Kubernetes CronJob that runs every 6 hours?", conn)
# Answer: "Create a CronJob manifest with schedule '0 */6 * * *' and specify
#  your container image in the jobTemplate spec. Set restartPolicy to OnFailure..."
print(result['sources'])  # Shows which doc chunks were used as context
```

## Guidelines

- **Download everything while online** — models, knowledge content, and embeddings must be prepared beforehand
- **Test offline before deploying** — disconnect WiFi and verify the full pipeline works end-to-end
- **Choose models by hardware** — phi3:mini for 4GB RAM devices, llama3.1:8b for 8GB+, llama3.1:70b for workstations
- **Use FTS as fallback** — SQLite full-text search works when embeddings are unavailable or for exact matches
- **Package for portability** — bundle everything on a USB drive or Docker image for easy deployment
- **Keep knowledge fresh** — sync new content and re-embed when connectivity returns

## References

- [Ollama](https://ollama.ai/) — local LLM runtime
- [SQLite FTS5](https://www.sqlite.org/fts5.html) — full-text search
- [PWA docs](https://web.dev/progressive-web-apps/) — offline-first web apps
