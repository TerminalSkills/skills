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
  category: ai-tools
  tags: [offline, local-ai, ollama, knowledge-base, self-contained, edge-ai]
  use-cases:
    - "Build a self-contained AI assistant that works without internet"
    - "Create an offline knowledge base with local LLM for field work"
    - "Deploy AI tools in air-gapped or low-connectivity environments"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Offline AI Toolkit — Self-Contained AI Systems

## Overview

Build AI systems that work completely offline — local LLMs via Ollama, embedded vector search with SQLite, knowledge bases from pre-downloaded content, and a PWA interface that runs without connectivity. Ideal for field work, air-gapped environments, or privacy-first deployments. Inspired by [project-nomad](https://github.com/nicholasgasior/project-nomad) (16k+ stars).

## Instructions

### Step 1: Install Ollama for Local LLMs

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull models (do this while online)
ollama pull llama3.1:8b       # General purpose (4.7GB)
ollama pull phi3:mini          # Lightweight (2.3GB)
ollama pull nomic-embed-text   # Embeddings (274MB)
ollama pull codellama:7b       # Code generation (3.8GB)

# Verify
ollama list
```

**Model selection guide:**

| Use Case | Model | RAM Needed | Quality |
|----------|-------|------------|---------|
| General Q&A | llama3.1:8b | 8GB | Good |
| Quick answers | phi3:mini | 4GB | Decent |
| Code help | codellama:7b | 8GB | Good |
| Embeddings | nomic-embed-text | 2GB | Good |
| Advanced reasoning | llama3.1:70b | 48GB | Excellent |

### Step 2: Build the Offline Knowledge Base

Pre-download and embed knowledge while you have internet:

```python
import requests
import json
import sqlite3
import os

def init_knowledge_db(db_path='knowledge.db'):
    """Initialize SQLite database for knowledge storage."""
    conn = sqlite3.connect(db_path)
    conn.execute('''CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        source TEXT,
        content TEXT,
        category TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY,
        doc_id INTEGER REFERENCES documents(id),
        chunk_text TEXT,
        embedding BLOB,
        chunk_index INTEGER
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
            title = data.get('title', topic)
            content = data.get('extract', '')
            if content:
                conn.execute(
                    'INSERT INTO documents (title, source, content, category) VALUES (?, ?, ?, ?)',
                    (title, f'wikipedia:{topic}', content, 'encyclopedia')
                )
                conn.execute(
                    'INSERT INTO fts_documents (title, content, category) VALUES (?, ?, ?)',
                    (title, content, 'encyclopedia')
                )
        except Exception as e:
            print(f"Failed to download {topic}: {e}")
    conn.commit()

def ingest_local_files(directory, conn, category='local'):
    """Ingest markdown/text files from a local directory."""
    for root, _, files in os.walk(directory):
        for fname in files:
            if not fname.endswith(('.md', '.txt', '.rst')):
                continue
            path = os.path.join(root, fname)
            with open(path, 'r', errors='ignore') as f:
                content = f.read()
            conn.execute(
                'INSERT INTO documents (title, source, content, category) VALUES (?, ?, ?, ?)',
                (fname, path, content, category)
            )
    conn.commit()
```

### Step 3: Generate Embeddings with Ollama

```python
import struct

def get_embedding(text, model='nomic-embed-text'):
    """Get embedding vector from Ollama."""
    response = requests.post('http://localhost:11434/api/embeddings', json={
        'model': model,
        'prompt': text
    })
    return response.json()['embedding']

def embedding_to_blob(embedding):
    """Convert float list to binary blob for SQLite storage."""
    return struct.pack(f'{len(embedding)}f', *embedding)

def blob_to_embedding(blob):
    """Convert binary blob back to float list."""
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
            blob = embedding_to_blob(emb)
            conn.execute(
                'INSERT INTO embeddings (doc_id, chunk_text, embedding, chunk_index) VALUES (?, ?, ?, ?)',
                (doc_id, chunk, blob, i // chunk_size)
            )
    conn.commit()
    print(f"Embedded all documents")
```

### Step 4: Offline Vector Search

```python
import math

def cosine_similarity(a, b):
    """Calculate cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0
    return dot / (norm_a * norm_b)

def search_knowledge(query, conn, top_k=5):
    """Search the knowledge base using vector similarity."""
    query_emb = get_embedding(query)

    # Vector search
    cursor = conn.execute('SELECT id, doc_id, chunk_text, embedding FROM embeddings')
    results = []
    for row in cursor.fetchall():
        emb = blob_to_embedding(row[3])
        sim = cosine_similarity(query_emb, emb)
        results.append({
            'chunk_text': row[2],
            'doc_id': row[1],
            'similarity': sim
        })

    results.sort(key=lambda x: x['similarity'], reverse=True)
    return results[:top_k]

def search_fts(query, conn, limit=10):
    """Full-text search fallback (no embeddings needed)."""
    cursor = conn.execute(
        'SELECT title, content, category FROM fts_documents WHERE fts_documents MATCH ? LIMIT ?',
        (query, limit)
    )
    return [{'title': r[0], 'content': r[1][:500], 'category': r[2]} for r in cursor.fetchall()]
```

### Step 5: RAG with Local LLM

```python
def ask_offline(question, conn, model='llama3.1:8b'):
    """Answer questions using local RAG pipeline."""
    # Retrieve relevant context
    results = search_knowledge(question, conn, top_k=3)
    context = '\n\n'.join([r['chunk_text'] for r in results])

    # Generate answer with Ollama
    response = requests.post('http://localhost:11434/api/generate', json={
        'model': model,
        'prompt': f"""Answer the question using ONLY the context provided.
If the context doesn't contain the answer, say "I don't have information about that."

Context:
{context}

Question: {question}

Answer:""",
        'stream': False
    })
    answer = response.json()['response']

    return {
        'answer': answer,
        'sources': [r['chunk_text'][:100] for r in results],
        'model': model
    }
```

### Step 6: PWA Interface for Offline UI

Create a Progressive Web App that works without internet:

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Offline AI Assistant</title>
    <link rel="manifest" href="manifest.json">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 20px; }
        .chat { height: 70vh; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 8px; }
        .msg { margin: 8px 0; padding: 10px; border-radius: 8px; }
        .user { background: #007bff; color: white; margin-left: 20%; }
        .ai { background: #f0f0f0; margin-right: 20%; }
        .input-row { display: flex; gap: 8px; margin-top: 10px; }
        input { flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; }
        button { padding: 12px 24px; background: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; }
        .status { font-size: 12px; color: #666; padding: 4px 0; }
    </style>
</head>
<body>
    <h1>🧠 Offline AI Assistant</h1>
    <div class="status" id="status">Connecting to Ollama...</div>
    <div class="chat" id="chat"></div>
    <div class="input-row">
        <input id="input" placeholder="Ask anything..." autofocus>
        <button onclick="send()">Send</button>
    </div>
    <script>
        const OLLAMA_URL = 'http://localhost:11434';
        const API_URL = 'http://localhost:8080';  // your Python backend

        async function send() {
            const input = document.getElementById('input');
            const q = input.value.trim();
            if (!q) return;
            addMsg(q, 'user');
            input.value = '';

            try {
                const res = await fetch(`${API_URL}/ask`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({question: q})
                });
                const data = await res.json();
                addMsg(data.answer, 'ai');
            } catch (e) {
                addMsg('Error: ' + e.message, 'ai');
            }
        }

        function addMsg(text, role) {
            const chat = document.getElementById('chat');
            const div = document.createElement('div');
            div.className = `msg ${role}`;
            div.textContent = text;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
        }

        document.getElementById('input').addEventListener('keypress', e => {
            if (e.key === 'Enter') send();
        });

        // Check Ollama status
        fetch(`${OLLAMA_URL}/api/tags`)
            .then(() => document.getElementById('status').textContent = '✅ Ollama connected — fully offline')
            .catch(() => document.getElementById('status').textContent = '❌ Ollama not running — start with: ollama serve');
    </script>
</body>
</html>
```

```json
// manifest.json
{
    "name": "Offline AI Assistant",
    "short_name": "OfflineAI",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#007bff"
}
```

### Step 7: Sync When Connectivity Returns

```python
def sync_knowledge(conn, new_topics=None):
    """Sync knowledge base when internet is available."""
    import socket

    def is_online():
        try:
            socket.create_connection(("8.8.8.8", 53), timeout=3)
            return True
        except OSError:
            return False

    if not is_online():
        print("Still offline — skipping sync")
        return

    print("Online! Syncing knowledge base...")
    if new_topics:
        download_wikipedia_articles(new_topics, conn)
        embed_all_documents(conn)

    # Pull model updates
    os.system("ollama pull llama3.1:8b")
    print("Sync complete")
```

## Hardware Requirements

| Setup | RAM | Storage | GPU | Models |
|-------|-----|---------|-----|--------|
| Minimal (Raspberry Pi 5) | 8GB | 16GB | None | phi3:mini |
| Standard (Laptop) | 16GB | 32GB | Optional | llama3.1:8b |
| Power (Workstation) | 64GB | 100GB | RTX 3090+ | llama3.1:70b |

## Preparation Checklist (Do While Online)

1. ☐ Install Ollama + pull models
2. ☐ Download knowledge content (Wikipedia, manuals, docs)
3. ☐ Generate all embeddings
4. ☐ Test full pipeline offline (disconnect WiFi)
5. ☐ Package as portable (USB drive or Docker image)

## References

- [project-nomad](https://github.com/nicholasgasior/project-nomad) — original inspiration (16k stars)
- [Ollama](https://ollama.ai/) — local LLM runtime
- [SQLite FTS5](https://www.sqlite.org/fts5.html) — full-text search
- [PWA docs](https://web.dev/progressive-web-apps/) — offline-first web apps
