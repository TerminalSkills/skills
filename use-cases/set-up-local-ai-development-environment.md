---
title: "Set Up a Local AI Development Environment"
slug: set-up-local-ai-development-environment
description: "Configure a fully local LLM development setup using Ollama, LM Studio, and LangChain for private, offline AI application development without cloud API costs."
skills: [ollama-local, lm-studio-subagents, langchain]
category: data-ai
tags: [llm, local-ai, ollama, langchain, development-environment, privacy]
---

# Set Up a Local AI Development Environment

## The Problem

Dani works at a healthcare startup where patient data can never leave the company network. He needs to prototype an AI assistant that summarizes medical notes, but every cloud LLM API is off-limits due to HIPAA compliance. He has a workstation with a 24GB GPU and needs a local development environment where he can experiment with different models, build LangChain pipelines, and iterate quickly — all without any data leaving the machine.

The cloud API route is a dead end. Even with a BAA, the compliance team won't sign off on sending patient notes to a third-party endpoint. The prototype needs to run entirely on-premises.

## The Solution

Use **ollama-local** to run and manage local LLM models, **lm-studio-subagents** to test and compare multiple models side by side through a GUI, and **langchain** to build the actual application pipeline with retrieval-augmented generation. All three run entirely on the local machine.

## Step-by-Step Walkthrough

### Step 1: Install Ollama and Pull the Right Models

```text
I'm on Ubuntu 22.04 with an NVIDIA RTX 4090 (24GB VRAM). I need to run
local LLMs for a medical note summarization project. Help me set up Ollama,
pick appropriate models that fit in 24GB VRAM, and verify GPU acceleration
is working.
```

Installation is straightforward:

```bash
curl -fsSL https://ollama.ai/install.sh | sh
systemctl status ollama  # verify running
ollama run llama3.2 "hello"  # quick GPU test
journalctl -u ollama | grep -i gpu  # should show "using CUDA" and "VRAM: 24576 MiB"
```

Model selection matters here — 24GB of VRAM is generous but not unlimited. The sweet spot for summarization:

| Model | Size | Purpose |
|-------|------|---------|
| `llama3.1:8b-instruct-q8_0` | 8.5GB | Primary summarization, best quality at 8B |
| `mistral:7b-instruct-v0.3-q8_0` | 8.2GB | Strong instruction following, good for comparison |
| `gemma2:9b-instruct-q6_K` | 7.3GB | Strong reasoning, worth testing |
| `phi3:14b-instruct-q5_K_M` | 10GB | Good for structured output |

Two 8B models can be loaded simultaneously for A/B testing at around 17GB total. The 70B variants won't fit — skip those.

Ollama exposes an API at `http://localhost:11434` with three key endpoints: `/api/generate` for single completions, `/api/chat` for multi-turn conversations, and `/api/tags` to list installed models.

### Step 2: Set Up LM Studio for Model Comparison

```text
I also want LM Studio so I can quickly test prompts with different models
through a visual interface before committing to one. Help me configure it
alongside Ollama without port conflicts, and set up a workflow for
comparing model outputs on the same medical note prompts.
```

LM Studio provides what Ollama doesn't: a visual side-by-side comparison interface. The key is avoiding port conflicts — Ollama runs on 11434, so LM Studio goes on 1234. This gives two OpenAI-compatible endpoints:

- **Ollama:** `http://localhost:11434/v1`
- **LM Studio:** `http://localhost:1234/v1`

The comparison workflow that saves the most time:

1. Download the same model variants in GGUF format inside LM Studio
2. Create a "Medical Summary" preset with the system prompt: *"You are a medical note summarizer. Given raw clinical notes, produce a structured summary with: Chief Complaint, History, Assessment, and Plan."*
3. Load two models in split-view (LM Studio supports dual pane)
4. Paste the same clinical note into both, compare outputs side by side
5. Adjust temperature, top_p, and context length per model

This visual comparison step saves hours of guessing. Dani can see immediately that one model hallucinates medication dosages while another reliably extracts them.

### Step 3: Build a LangChain RAG Pipeline for Medical Notes

```text
Now build the actual application. I have ~2,000 past medical notes as
text files in a directory. I need a RAG pipeline: embed the notes,
store in a local vector database, and let me query with natural language.
Everything must stay local — no external API calls.
```

The ingestion pipeline reads all 2,000 notes, splits them into searchable chunks, and embeds them locally:

```python
# medical_rag/ingest.py
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import OllamaEmbeddings
from langchain_community.vectorstores import Chroma

loader = DirectoryLoader("./notes/", glob="*.txt", loader_cls=TextLoader)
splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000, chunk_overlap=200,
    separators=["\n\n", "\n", ". ", " "]
)
embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url="http://localhost:11434")
# Pull the embedding model first: ollama pull nomic-embed-text (274MB, runs fine on CPU)

docs = loader.load()
chunks = splitter.split_documents(docs)
vectorstore = Chroma.from_documents(chunks, embeddings, persist_directory="./chroma_db")
```

Ingestion stats for 2,000 notes: roughly 8,500 chunks after splitting, about 12 minutes to embed on CPU (nomic-embed-text is fast), and 180MB on disk for the ChromaDB.

The query interface wires the vector store to a local LLM:

```python
# medical_rag/query.py
from langchain.chains import RetrievalQA
from langchain_community.llms import Ollama

llm = Ollama(model="llama3.1:8b-instruct-q8_0", temperature=0.1)
retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
chain = RetrievalQA.from_chain_type(
    llm=llm, retriever=retriever, chain_type="stuff",
    return_source_documents=True
)

# Example: "Summarize all visits for patient ID 4821"
# Returns: structured summary + source document references
```

Every query stays on the machine. The LLM never sees data it shouldn't, and nothing hits the network.

### Step 4: Add a Conversational Interface with Memory

```text
Make it conversational so I can ask follow-up questions. It should
remember context within a session but not leak information between
sessions. Add a simple terminal UI.
```

The conversational chain adds session memory that tracks the last 10 exchanges — enough for natural follow-ups like "what about their blood pressure?" without restating the patient ID:

```python
# medical_rag/chat.py
from langchain.memory import ConversationBufferWindowMemory
from langchain.chains import ConversationalRetrievalChain

memory = ConversationBufferWindowMemory(
    k=10, memory_key="chat_history",
    return_messages=True, output_key="answer"
)

chain = ConversationalRetrievalChain.from_llm(
    llm=Ollama(model="llama3.1:8b-instruct-q8_0", temperature=0.1),
    retriever=vectorstore.as_retriever(search_kwargs={"k": 5}),
    memory=memory, return_source_documents=True
)
```

The terminal UI (built with the `rich` library) color-codes user input in green, AI responses in white, and source references in dim. Three commands keep things simple: `/clear` resets memory, `/model mistral:7b-instruct-v0.3-q8_0` swaps the LLM without re-embedding documents, and `/quit` ends the session. Memory dies on quit — no data persists between sessions.

### Step 5: Create a Testing and Evaluation Harness

```text
I need to evaluate which model gives the best summaries before deploying
internally. Create a simple eval script that runs 50 test notes through
each model and scores the outputs for completeness, accuracy against
a reference summary, and response time.
```

The eval harness runs 50 test notes (each with a human-written reference summary) through three models and scores them:

| Metric | llama3.1:8b-q8 | mistral:7b-v0.3-q8 | gemma2:9b-q6 |
|--------|----------------|--------------------:|-------------:|
| Completeness (0-4) | 3.8 | 3.6 | 3.9 |
| ROUGE-L | 0.62 | 0.58 | 0.65 |
| Avg response time | 4.2s | 3.8s | 5.1s |

Completeness checks for the four required sections (Chief Complaint, History, Assessment, Plan). ROUGE-L measures overlap with the reference summary. Results are reproducible — temperature is set to 0 with fixed seeds where supported.

```bash
python eval.py --notes-dir ./eval/test_notes --models all
# Output: eval/results.json and eval/results_summary.md
```

Gemma 2 wins on accuracy but takes longer. Llama 3.1 is the best balance of quality and speed. Mistral is fastest but scores lowest. The numbers make the decision easy — no more guessing.

## Real-World Example

Noa, a data scientist at a legal firm, used this same local setup to prototype a contract clause extractor. She couldn't send client contracts to any external API. With Ollama running Llama 3.1 locally and LangChain for the RAG pipeline, she embedded 5,000 contracts, built a query interface, and had lawyers testing it within a week. The eval harness helped her pick the right model — Gemma 2 turned out to extract clause boundaries more reliably. Total cloud API cost: zero. Total data leaked: zero.
