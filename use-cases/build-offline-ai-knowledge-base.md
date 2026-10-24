---
title: Build an Offline AI Knowledge Base
slug: build-offline-ai-knowledge-base
description: >-
  Build a self-contained offline AI knowledge system for field work — local LLM,
  embedded vector search, pre-downloaded knowledge, and a PWA interface that
  works without internet.
category: data-ai
persona: >-
  Field researcher needing AI assistance in remote areas with no internet —
  medical references, survival guides, technical manuals, and general knowledge
  accessible via a local AI assistant.
skills: [offline-ai-toolkit, ollama, opendataloader-pdf]
tags: [offline, knowledge-base, local-ai, field-work, ollama, self-contained]
---

# Build an Offline AI Knowledge Base

## The Problem

Field researchers, emergency responders, and travelers in remote areas have no access to cloud AI services or internet search. When you need to look up medical procedures, identify plants, troubleshoot equipment, or reference technical manuals in the jungle, desert, or Arctic, there is no connectivity. Carrying printed manuals is impractical, and you cannot predict every question you will need answered.

## The Solution

Build a completely self-contained AI knowledge system that works without any internet connection. Pre-download and embed knowledge (Wikipedia, manuals, guides), run a local LLM via Ollama, search with vector similarity, and interact through a PWA that works offline. Everything runs on a single laptop or even a Raspberry Pi. Field researchers, emergency responders, military operators, travelers, and privacy-conscious users all benefit from AI assistance that never phones home.

## Architecture

```
Laptop / Pi (no network needed after setup)
  PWA chat UI (service worker)  ->  FastAPI backend (127.0.0.1:8080)
                                      |-- SQLite + FTS5 + embedding BLOBs (knowledge.db)
                                      '-- Ollama (127.0.0.1:11434): llama3.1:8b + nomic-embed-text
```

## Step-by-Step Walkthrough

### 1. Check the hardware

- 8 GB RAM minimum for an 8B model (16 GB is comfortable); `phi3:mini` runs in 4 GB.
- About 20 GB free disk for models plus content; no GPU needed, CPU inference is slower but works.
- For a second machine, put everything on a USB drive (step 9).

### 2. Install Ollama and pull models (while online)

Follow the `ollama` skill. On macOS `brew install ollama`; on Linux download `ollama-linux-amd64.tar.zst` (or the arm64 build) from the Ollama GitHub releases page, check it against the `sha256sum.txt` published with the release, and extract it under `/usr`. Do not pipe an install script into a shell.

```bash
ollama serve &                  # skip if the desktop app or the systemd service already runs it
ollama pull llama3.1:8b         # 4.9 GB, general answers
ollama pull phi3:mini           # 2.2 GB, fallback for 4 GB machines
ollama pull nomic-embed-text    # 274 MB, embeddings (required)
ollama list
```

Ollama listens on `127.0.0.1:11434` by default; leave `OLLAMA_HOST` alone so nothing is exposed on the field network.

### 3. Download the knowledge content (while online)

Wikipedia's REST `page/html` endpoint returns raw HTML, which is poor material for embeddings. The MediaWiki API returns plain-text articles; Wikipedia asks for a descriptive `User-Agent`, and `redirects=1` resolves renamed titles such as `Fracture_(bone)` to `Bone fracture`.

```python
# fetch_wikipedia.py
import os, requests

HEADERS = {"User-Agent": "offline-kb-builder (contact: you@example.org)"}
TOPICS = ["First aid", "Water purification", "Hypothermia", "Dehydration",
          "Snakebite", "Bone fracture", "Knot", "Navigation", "Shelter"]

os.makedirs("knowledge/wikipedia", exist_ok=True)
for topic in TOPICS:
    r = requests.get("https://en.wikipedia.org/w/api.php", headers=HEADERS, timeout=30, params={
        "action": "query", "prop": "extracts", "explaintext": 1, "redirects": 1,
        "format": "json", "formatversion": 2, "titles": topic})
    r.raise_for_status()
    page = r.json()["query"]["pages"][0]
    if page.get("extract"):
        name = page["title"].replace("/", "_")
        open(f"knowledge/wikipedia/{name}.txt", "w", encoding="utf-8").write(page["extract"])
        print("ok", page["title"])
    else:
        print("missing", topic)
```

For whole encyclopedias, bundle a Kiwix ZIM file and serve it with `kiwix-serve` next to this system instead of fetching article by article.

Manuals, WHO guidelines, papers: convert PDFs to Markdown with the `opendataloader-pdf` skill (needs Java 11+) and drop the output into `knowledge/manuals/`. Field notes go in `knowledge/personal/`.

```bash
pip install -U opendataloader-pdf
python3 -c "import opendataloader_pdf as o; o.convert(input_path=['pdfs/'], output_dir='knowledge/manuals', format='markdown', quiet=True)"
```

Then pull the Markdown/text into the database in the next step.

### 4. Build the database and embeddings

Create `knowledge_db.py` with `init_knowledge_db()`, `get_embedding()`, `embed_all_documents()`, `search_knowledge()` and `ask_offline()` from the `offline-ai-toolkit` skill (they use Ollama's `/api/embed` and `/api/generate`). The skill has no file importer, so add this one:

```python
# append to knowledge_db.py
from pathlib import Path

def ingest_local_files(folder, conn, category):
    for path in sorted(Path(folder).rglob("*")):
        if path.suffix.lower() not in {".txt", ".md"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if text.strip():
            conn.execute("INSERT INTO documents (title, source, content, category) VALUES (?, ?, ?, ?)",
                         (path.stem, str(path), text, category))
    conn.commit()
    conn.execute("INSERT INTO fts_documents(fts_documents) VALUES ('rebuild')")  # keep keyword search in sync
    conn.commit()
```

```python
from knowledge_db import init_knowledge_db, ingest_local_files, embed_all_documents

conn = init_knowledge_db("knowledge.db")
for folder, category in [("knowledge/wikipedia", "encyclopedia"),
                         ("knowledge/manuals", "reference"),
                         ("knowledge/personal", "personal")]:
    ingest_local_files(folder, conn, category)
embed_all_documents(conn, chunk_size=400)      # words per chunk; slow on CPU for big corpora
print(conn.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0], "chunks")
```

The skill's `search_knowledge()` compares the query against every stored chunk in pure Python, which is fine for tens of thousands of chunks; beyond that, load the vectors into a numpy matrix.

### 5. Build the backend API

```python
# server.py
import sqlite3
import requests
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from knowledge_db import ask_offline

app = FastAPI()

class Question(BaseModel):
    question: str
    model: str = "llama3.1:8b"

# Plain `def` routes: FastAPI runs them in a thread pool, so the blocking Ollama calls do not stall the server.
@app.post("/ask")
def ask(q: Question):
    conn = sqlite3.connect("knowledge.db")
    try:
        return ask_offline(q.question, conn, model=q.model)
    finally:
        conn.close()

@app.get("/status")
def status():
    try:
        tags = requests.get("http://127.0.0.1:11434/api/tags", timeout=2).json()
        models = [m["name"] for m in tags.get("models", [])]
    except requests.RequestException:
        models = []
    conn = sqlite3.connect("knowledge.db")
    docs = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    chunks = conn.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0]
    conn.close()
    return {"ollama": bool(models), "models": models, "documents": docs, "chunks": chunks}

app.mount("/app", StaticFiles(directory="pwa", html=True), name="pwa")
```

```bash
pip install fastapi uvicorn requests
uvicorn server:app --host 127.0.0.1 --port 8080
```

Binding to `127.0.0.1` keeps the assistant private to the laptop. If teammates must use it over a local hotspot, bind to that interface's address deliberately, since the API has no authentication.

### 6. Build the PWA

Create `pwa/index.html` with a chat box that POSTs `{question}` to `/ask`, and a `pwa/manifest.json`. Register a service worker so the UI itself loads with no network. The worker lives at `pwa/sw.js` so its scope is `/app/`; service workers run on `localhost` without HTTPS.

```javascript
// pwa/sw.js
const CACHE = 'offline-ai-v1';
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;            // /ask is a POST and must reach the backend
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
```

In `index.html`: `navigator.serviceWorker.register('./sw.js')`. Open `http://127.0.0.1:8080/app/` once while the backend runs so the worker installs.

### 7. Test fully offline

Turn Wi-Fi off (`nmcli networking off` on NetworkManager systems, or the OS toggle), start Ollama and uvicorn, and ask:

```bash
curl -s http://127.0.0.1:8080/status
curl -s http://127.0.0.1:8080/ask -H 'content-type: application/json' \
  -d '{"question": "What are the symptoms of hypothermia?"}'
```

Check that the answer's `sources` come from your corpus. The skill's prompt tells the model to answer only from the context, so a question outside the corpus should return "I don't have information about that."

### 8. Package for portability

Copy the project folder, `knowledge.db`, the Ollama tarball and the model store (`~/.ollama/models`) to a USB drive. On the target machine extract Ollama, copy the models directory to `~/.ollama/models`, run `ollama list` to confirm both models appear, and start uvicorn. Test once on that machine before you leave.

### 9. Sync when back online

Back up field notes, refresh the downloaded articles, run `ollama pull` for newer model versions, then re-run steps 3 and 4. If you change the embedding model, re-embed everything: vectors from different models are not comparable.

## Storage Budget

| Content | Size |
|---------|------|
| Wikipedia, 1,000 plain-text articles | about 30-100 MB |
| 50 technical manuals as Markdown | tens of MB |
| Embeddings (nomic-embed-text, 768 floats = 3 KB per chunk) | about 3 MB per 1,000 chunks, plus the chunk text |
| Ollama models: llama3.1:8b + phi3:mini | about 7.1 GB |

## Real-World Example

A marine biologist prepares for a 3-month expedition to an atoll with no cell service. Before leaving she fetches 2,000 Wikipedia articles on reef species and oceanography, converts 30 PDF field guides with `opendataloader-pdf`, adds her team's 500 pages of notes, and builds the database on her laptop. On the atoll she asks, "Which reef fish have vertical blue stripes and a yellow tail?" Retrieval returns passages from her field guides and the model summarizes them with the sources listed, which she then confirms against the guide's photos before logging a species. She treats the model as a fast index into her own library, not as an authority.

## Limitations

- An 8B model reasons less well than large cloud models, and the answers are only as good as the corpus. Do not rely on it for medical decisions; use it to find the relevant passage in the first-aid manual and read the passage.
- Knowledge is frozen at download time.
- Vector search can miss exact terms (drug names, part numbers); the FTS5 table gives you keyword search as a complement.
- The first query after start-up is slow while the model loads.

## Related Skills

- `offline-ai-toolkit` - SQLite knowledge base, embeddings, vector search and RAG functions
- `ollama` - installing and managing the local models
- `opendataloader-pdf` - converting PDF manuals to Markdown for ingestion
