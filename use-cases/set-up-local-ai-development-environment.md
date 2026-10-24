---
title: "Set Up a Local AI Development Environment"
slug: set-up-local-ai-development-environment
description: "Configure a fully local LLM development setup using Ollama, LM Studio, and LangChain for private, offline AI application development without cloud API costs."
skills: [ollama, lm-studio-subagents, langchain]
category: data-ai
tags: [llm, local-ai, ollama, langchain, development-environment, privacy]
---

# Set Up a Local AI Development Environment

## The Problem

Dani works at a healthcare startup where patient data can never leave the company network. He needs to prototype an AI assistant that summarizes medical notes, but every cloud LLM API is off-limits because of the compliance team. He has a workstation with a 24GB GPU and needs a local environment where he can try different models, build a LangChain pipeline, and iterate quickly, all without any data leaving the machine.

Even with a BAA, the compliance team won't sign off on sending patient notes to a third-party endpoint. The prototype has to run entirely on-premises.

## The Solution

Use **ollama** to run and manage local models, **lm-studio-subagents** to run a second local server (LM Studio) so you can compare the same prompt across both, and **langchain** to build the retrieval-augmented pipeline. Everything binds to `127.0.0.1`. Until the pipeline is proven, develop with synthetic notes only; real notes belong on an encrypted disk with access controls, because the vector store is a copy of them.

## Step-by-Step Walkthrough

### Step 1: Install Ollama and Pull Models

```text
I'm on Ubuntu with an NVIDIA GPU (24GB VRAM). I need local LLMs for a medical
note summarization project. Help me install Ollama, pick models that fit in
24GB, and verify GPU acceleration is working.
```

The official install is a script piped into a shell. Instead, download the release archive and verify it against the checksum file published with the release:

```bash
curl -fsSLO https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tar.zst
curl -fsSL https://github.com/ollama/ollama/releases/latest/download/sha256sum.txt | grep ' ./ollama-linux-amd64.tar.zst$' | sha256sum -c -
sudo tar x -C /usr -f ollama-linux-amd64.tar.zst   # needs zstd installed
ollama serve &                                      # listens on 127.0.0.1:11434 by default
ollama -v
```

For a service that starts at boot, follow the systemd section of the [Linux install guide](https://docs.ollama.com/linux). Then pull models and check the GPU:

```bash
ollama pull llama3.1:8b
ollama pull qwen3:14b
ollama pull gemma3:12b
ollama pull nomic-embed-text          # embeddings for Step 3
ollama run llama3.1:8b "Summarize: pt c/o chest pain x2 days, no fever."
ollama ps                             # the PROCESSOR column should say 100% GPU
```

The default tag of each model is a 4-bit quantization, which is why a 12B to 14B model fits in 24GB with room for context. `ollama list` shows the real sizes; a model that shows a CPU/GPU split in `ollama ps` is too large or has too much context for the card. A 70B model will not fit.

Ollama's native API lives at `http://127.0.0.1:11434` (`/api/generate`, `/api/chat`, `/api/tags`) and it also serves an OpenAI-compatible API under `/v1`.

### Step 2: Run LM Studio as a Second Local Server

```text
I also want LM Studio so I can test the same prompts against a second runtime
and a different GGUF build, without port conflicts with Ollama.
```

Ollama uses 11434, LM Studio uses 1234. After installing LM Studio from lmstudio.ai, the `lms` CLI can do everything headless:

```bash
lms get qwen2.5-7b-instruct               # download; `lms get` alone lists recommended models
lms load qwen2.5-7b-instruct --identifier local-worker --context-length 16384
lms server start --port 1234              # binds to 127.0.0.1 unless you pass --bind
curl http://127.0.0.1:1234/v1/models      # the id values are what you pass as "model"
```

Now the same prompt can go to two backends. This script sends one synthetic note to both and prints the answer and the wall time:

```python
# compare.py
"""Send the same prompt to Ollama and LM Studio (both OpenAI-compatible) and time each."""
import time
from openai import OpenAI

SYSTEM = "You are a medical note summarizer. Produce: Chief Complaint, History, Assessment, Plan."
NOTE = open("eval/sample_note.txt").read()
BACKENDS = {
    "ollama": ("http://127.0.0.1:11434/v1", "llama3.1:8b"),
    "lmstudio": ("http://127.0.0.1:1234/v1", "local-worker"),  # the --identifier given to `lms load`
}
for name, (url, model) in BACKENDS.items():
    client = OpenAI(base_url=url, api_key="local")  # the key must be non-empty but is not checked
    t0 = time.time()
    out = client.chat.completions.create(
        model=model, temperature=0,
        messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": NOTE}],
    ).choices[0].message.content
    print(f"=== {name} ({time.time() - t0:.1f}s)\n{out}\n")
```

Read the two outputs next to each other. In a clinical setting the thing to look for is not style but invented facts: a dosage or a diagnosis that is not in the note.

### Step 3: Build a LangChain RAG Pipeline

```text
I have a directory of past notes as text files. Embed them, store them in a
local vector database, and let me query in natural language. Everything must
stay local, no external API calls.
```

LangChain 1.x moved the integrations into their own packages (`langchain-ollama`, `langchain-chroma`) and the old `RetrievalQA`, `ConversationalRetrievalChain` and `ConversationBufferWindowMemory` classes now live in the legacy `langchain-classic` package. The pipeline below uses the current packages:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install langchain-core langchain-ollama langchain-chroma langchain-text-splitters openai
```

```python
# medical_rag/ingest.py
from pathlib import Path
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma

docs = [Document(page_content=f.read_text(), metadata={"source": f.name}) for f in sorted(Path("notes").glob("*.txt"))]
chunks = RecursiveCharacterTextSplitter(
    chunk_size=1000, chunk_overlap=200, separators=["\n\n", "\n", ". ", " "]
).split_documents(docs)

# ollama pull nomic-embed-text   (small enough to run on CPU)
embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url="http://127.0.0.1:11434")
Chroma.from_documents(chunks, embeddings, persist_directory="./chroma_db")
print(f"{len(docs)} notes -> {len(chunks)} chunks")
```

Chroma stores the vectors on disk in `./chroma_db`; the chunk count and embedding time depend on your notes and hardware, so read them from the script's output rather than from a benchmark.

### Step 4: Add a Conversational Interface with Memory

```text
Make it conversational so I can ask follow-up questions. It should remember
context within a session but not between sessions.
```

The chat loop keeps the last 10 exchanges in a plain list. The list lives in process memory, so ending the session discards it:

```python
# medical_rag/chat.py
from langchain_chroma import Chroma
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_ollama import ChatOllama, OllamaEmbeddings

MODEL = "llama3.1:8b"
store = Chroma(persist_directory="./chroma_db",
               embedding_function=OllamaEmbeddings(model="nomic-embed-text", base_url="http://127.0.0.1:11434"))
retriever = store.as_retriever(search_kwargs={"k": 5})

prompt = ChatPromptTemplate.from_messages([
    ("system", "You summarize clinical notes. Answer only from the context. "
               "If the context does not contain the answer, say so.\n\nContext:\n{context}"),
    MessagesPlaceholder("history"),
    ("human", "{question}"),
])

def ask(question: str, history: list, model: str = MODEL) -> str:
    docs = retriever.invoke(question)
    context = "\n\n".join(f"[{d.metadata.get('source')}]\n{d.page_content}" for d in docs)
    llm = ChatOllama(model=model, temperature=0, base_url="http://127.0.0.1:11434")
    answer = (prompt | llm | StrOutputParser()).invoke(
        {"context": context, "history": history[-20:], "question": question})  # last 10 exchanges
    history += [HumanMessage(question), AIMessage(answer)]
    return answer

if __name__ == "__main__":
    history: list = []  # lives in memory only, so nothing carries over between sessions
    while (q := input("> ").strip()) not in ("/quit", ""):
        if q == "/clear":
            history.clear()
        else:
            print(ask(q, history))
```

`/clear` resets the history and `/quit` ends the session. To swap models without re-embedding, pass another model name to `ask`; the vectors do not depend on the chat model.

### Step 5: Evaluate Before Choosing a Model

```text
I need to decide which model gives the best summaries. Build a small eval that
runs test notes through each model and scores them.
```

Write 30 to 50 synthetic notes, each with a human-written reference summary, and run every candidate over them with `temperature=0`. Three checks are cheap and need no cloud service: whether the four required headings appear (Chief Complaint, History, Assessment, Plan), whether every number in the output (dose, vital sign, date) also appears in the source note, and the wall time per note. For overlap with the reference summary add ROUGE-L with the `rouge-score` package. Have a clinician read the lowest-scoring ten, because a metric will not catch a plausible but wrong plan.

## Real-World Example

Noa, a data scientist at a legal firm, could not send client contracts to any external API. She ran a local model through Ollama and used LangChain for retrieval: she embedded a few thousand contracts, built a query interface, and had lawyers testing it within a week. Her eval was the number-and-heading check from Step 5 plus a lawyer reading the worst outputs, and it showed her that a smaller model extracted clause boundaries as reliably as a larger one for her documents, so she kept the smaller one. No contract left the machine.

## Related Skills

- [ollama](../skills/ollama/) -- install, pull and serve local models
- [lm-studio-subagents](../skills/lm-studio-subagents/) -- LM Studio as a second local OpenAI-compatible server
- [langchain](../skills/langchain/) -- retrieval pipelines and chains
