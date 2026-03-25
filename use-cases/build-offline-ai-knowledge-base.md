---
title: Build an Offline AI Knowledge Base
description: >-
  Build a self-contained offline AI knowledge system for field work — local LLM,
  embedded vector search, pre-downloaded knowledge, and a PWA interface that
  works without internet.
persona: >-
  Field researcher needing AI assistance in remote areas with no internet —
  medical references, survival guides, technical manuals, and general knowledge
  accessible via a local AI assistant.
skills: [offline-ai-toolkit, ollama]
tags: [offline, knowledge-base, local-ai, field-work, ollama, self-contained]
---

# Build an Offline AI Knowledge Base

## Goal

Build a completely self-contained AI knowledge system that works without any internet connection. Pre-download and embed knowledge (Wikipedia, manuals, guides), run a local LLM via Ollama, search with vector similarity, and interact through a PWA that works offline. Everything runs on a single laptop or even a Raspberry Pi.

## Who This Is For

- Field researchers in remote areas (jungle, desert, Arctic)
- Emergency responders needing reference material without connectivity
- Military/government operators in air-gapped environments
- Travelers wanting AI assistance in areas with no cell service
- Privacy-conscious users who don't want data leaving their device

## Architecture

```
┌──────────────────────────────────────────┐
│              Your Laptop / Pi            │
│                                          │
│  ┌──────────┐    ┌───────────────────┐   │
│  │  Ollama   │    │  Knowledge DB     │   │
│  │ (LLM)    │◄──►│  (SQLite + FTS5)  │   │
│  │ llama3.1 │    │  + embeddings     │   │
│  └──────────┘    └───────────────────┘   │
│       ▲                    ▲             │
│       │                    │             │
│  ┌──────────────────────────────────┐    │
│  │     Python Backend (FastAPI)      │    │
│  │  RAG: query → search → prompt     │    │
│  └──────────────────────────────────┘    │
│       ▲                                  │
│       │                                  │
│  ┌──────────────────────────────────┐    │
│  │      PWA Interface (Browser)      │    │
│  │  Chat UI — works fully offline    │    │
│  └──────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

## Step-by-Step

### 1. Hardware Preparation

**Minimum requirements:**
- 8GB RAM laptop (16GB recommended)
- 50GB free storage
- Any modern CPU (Apple M1+ or Intel i5+ recommended)
- No GPU required (CPU inference is fine for 8B models)

**Portable setup:**
- All software + knowledge on a 128GB USB drive
- Boot from USB or run as portable apps
- Works on any laptop you can borrow in the field

### 2. Install Ollama and Models (While Online)

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull models — choose based on your RAM
ollama pull phi3:mini            # 2.3GB — minimal, fast, 4GB RAM
ollama pull llama3.1:8b          # 4.7GB — balanced, 8GB RAM
ollama pull nomic-embed-text     # 274MB — embeddings (required)

# Optional specialized models:
ollama pull medllama2            # Medical knowledge
ollama pull codellama:7b         # Programming help

# Verify everything works
ollama run phi3:mini "What is photosynthesis?"
```

### 3. Download Knowledge Content

```python
# Run this script WHILE YOU HAVE INTERNET

import requests
import json

# === Wikipedia: Top 10,000 articles ===
def download_wikipedia_vital(output_dir='./knowledge/wikipedia'):
    """Download Wikipedia's vital articles."""
    import os
    os.makedirs(output_dir, exist_ok=True)

    # Start with essential topics
    topics = [
        # Survival & Emergency
        'First_aid', 'Water_purification', 'Shelter_(building)',
        'Fire-making', 'Navigation', 'Knot', 'Hypothermia',
        'Dehydration', 'Snakebite', 'Fracture_(bone)',

        # Science & Nature
        'Human_body', 'Plant', 'Animal', 'Weather',
        'Geology', 'Astronomy', 'Physics', 'Chemistry',

        # Practical Skills
        'Agriculture', 'Fishing', 'Hunting', 'Cooking',
        'Sewing', 'Carpentry', 'Metalworking',

        # Geography & Culture
        'Earth', 'Continent', 'Ocean', 'Mountain',

        # Add hundreds more based on your field
    ]

    for topic in topics:
        url = f"https://en.wikipedia.org/api/rest_v1/page/html/{topic}"
        try:
            r = requests.get(url, timeout=15)
            if r.status_code == 200:
                filepath = f"{output_dir}/{topic}.html"
                with open(filepath, 'w') as f:
                    f.write(r.text)
                print(f"✅ {topic}")
        except Exception as e:
            print(f"❌ {topic}: {e}")

# === Technical Manuals ===
# Download PDFs of relevant manuals for your field
# Medical: WHO guidelines, first aid manuals
# Engineering: repair manuals, specifications
# Agriculture: farming guides, plant identification

# === Personal Documents ===
# Research papers, field notes, team protocols
# Copy to ./knowledge/personal/
```

### 4. Build and Populate the Knowledge Database

```python
# Use init_knowledge_db() from offline-ai-toolkit skill

from knowledge_db import init_knowledge_db, ingest_local_files

conn = init_knowledge_db('knowledge.db')

# Ingest all downloaded content
ingest_local_files('./knowledge/wikipedia', conn, category='encyclopedia')
ingest_local_files('./knowledge/manuals', conn, category='reference')
ingest_local_files('./knowledge/personal', conn, category='personal')

print(f"Total documents: {conn.execute('SELECT COUNT(*) FROM documents').fetchone()[0]}")
```

### 5. Generate Embeddings

```python
# Use embed_all_documents() from offline-ai-toolkit skill
# This takes time — 1-5 hours depending on content volume

from knowledge_db import embed_all_documents

embed_all_documents(conn, chunk_size=400)

total = conn.execute('SELECT COUNT(*) FROM embeddings').fetchone()[0]
print(f"Generated {total} embedding chunks")

# Database size check:
import os
size_mb = os.path.getsize('knowledge.db') / (1024 * 1024)
print(f"Knowledge DB: {size_mb:.1f} MB")
```

### 6. Build the Backend API

```python
# server.py — FastAPI backend for the PWA
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sqlite3

app = FastAPI()

# Serve PWA static files
app.mount("/app", StaticFiles(directory="pwa", html=True), name="pwa")

class Question(BaseModel):
    question: str
    model: str = "llama3.1:8b"

@app.post("/ask")
async def ask(q: Question):
    conn = sqlite3.connect('knowledge.db')
    result = ask_offline(q.question, conn, model=q.model)
    conn.close()
    return result

@app.get("/status")
async def status():
    """Check system health."""
    import requests
    try:
        r = requests.get('http://localhost:11434/api/tags', timeout=2)
        models = [m['name'] for m in r.json().get('models', [])]
    except:
        models = []

    conn = sqlite3.connect('knowledge.db')
    docs = conn.execute('SELECT COUNT(*) FROM documents').fetchone()[0]
    chunks = conn.execute('SELECT COUNT(*) FROM embeddings').fetchone()[0]
    conn.close()

    return {
        'ollama': len(models) > 0,
        'models': models,
        'documents': docs,
        'chunks': chunks
    }

# Run: uvicorn server:app --host 0.0.0.0 --port 8080
```

### 7. Set Up the PWA

Use the PWA from the `offline-ai-toolkit` skill. Add a service worker for true offline capability:

```javascript
// sw.js — Service Worker for offline caching
const CACHE_NAME = 'offline-ai-v1';
const URLS_TO_CACHE = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(URLS_TO_CACHE))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
```

### 8. Test Fully Offline

```bash
# Disconnect from internet
nmcli networking off  # or turn off WiFi

# Start Ollama
ollama serve &

# Start backend
uvicorn server:app --host 0.0.0.0 --port 8080 &

# Open browser to http://localhost:8080/app

# Test queries:
# "How do I purify water in the wild?"
# "What are the symptoms of hypothermia?"
# "How to set a broken bone?"
```

### 9. Package for Portability

```bash
# Option A: Docker (runs anywhere with Docker)
cat > Dockerfile << 'EOF'
FROM python:3.11-slim
RUN pip install fastapi uvicorn requests
COPY . /app
WORKDIR /app
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
EOF

# Option B: USB drive with everything
mkdir /media/usb/offline-ai
cp -r . /media/usb/offline-ai/
cp knowledge.db /media/usb/offline-ai/
# Include Ollama binary + model files
```

### 10. Sync When Back Online

```python
# When you return to connectivity:
# 1. Upload field notes for backup
# 2. Download new knowledge content
# 3. Update models to latest versions
# 4. Re-generate embeddings for new content

# Use sync_knowledge() from offline-ai-toolkit skill
```

## Storage Budget

| Content | Size | Documents |
|---------|------|-----------|
| Wikipedia (1,000 articles) | ~50MB | 1,000 |
| Technical manuals (PDFs) | ~200MB | 50 |
| Embeddings database | ~500MB | 10,000 chunks |
| Ollama models (phi3 + llama3.1) | ~7GB | 2 models |
| **Total** | **~8GB** | |

## Use Case Examples

| Scenario | Query | Knowledge Source |
|----------|-------|-----------------|
| Medical emergency | "Treating a deep cut without sutures" | First aid manual |
| Navigation | "How to find north without a compass" | Survival guides |
| Plant ID | "Edible plants in tropical forests" | Botany articles |
| Repair | "Fix a broken solar panel" | Technical manuals |
| Research | "Properties of local soil types" | Personal notes + geology |

## Limitations

- Model quality is lower than cloud APIs (8B vs 200B+ parameters)
- No real-time information (knowledge is frozen at download time)
- Embedding search can miss relevant content (supplement with FTS)
- First query is slow (model loading) — subsequent queries are fast

## Related Skills

- `offline-ai-toolkit` — core offline AI implementation
- `ollama` — local model management
- `opendataloader-pdf` — parse PDFs for knowledge ingestion
