---
title: "Set Up a Local AI Development Environment"
slug: set-up-local-ai-development-environment
description: "Configure a fully local LLM development setup using Ollama, LM Studio, and LangChain for private, offline AI application development without cloud API costs."
skills: [ollama-local, lm-studio-subagents, langchain]
category: ai
tags: [llm, local-ai, ollama, langchain, development-environment, privacy]
---

# Set Up a Local AI Development Environment

## The Problem

Dani works at a healthcare startup where patient data can never leave the company network. He needs to prototype an AI assistant that summarizes medical notes, but every cloud LLM API is off-limits due to compliance. He has a workstation with a 24GB GPU and needs a local development environment where he can experiment with different models, build LangChain pipelines, and iterate quickly — all without any data leaving the machine.

## The Solution

Use **ollama-local** to run and manage local LLM models, **lm-studio-subagents** to test and compare multiple models side by side through a GUI, and **langchain** to build the actual application pipeline with retrieval-augmented generation. All three run entirely on the local machine.

## Step-by-Step Walkthrough

### 1. Install Ollama and pull the right models

```text
I'm on Ubuntu 22.04 with an NVIDIA RTX 4090 (24GB VRAM). I need to run
local LLMs for a medical note summarization project. Help me set up Ollama,
pick appropriate models that fit in 24GB VRAM, and verify GPU acceleration
is working.
```

```text
Setup guide for Ollama on Ubuntu 22.04 + RTX 4090:

Install Ollama:
  curl -fsSL https://ollama.ai/install.sh | sh
  systemctl status ollama  # verify running

Verify GPU detection:
  ollama run llama3.2 "hello"  # quick test
  Check logs: journalctl -u ollama | grep -i gpu
  Should see: "using CUDA" and "VRAM: 24576 MiB"

Recommended models for 24GB VRAM:
  Primary (summarization):
    ollama pull llama3.1:8b-instruct-q8_0     # 8.5GB, best quality 8B
    ollama pull llama3.1:70b-instruct-q4_K_M   # 40GB — won't fit, skip
    ollama pull mistral:7b-instruct-v0.3-q8_0  # 8.2GB, good at following instructions

  For comparison/experimentation:
    ollama pull gemma2:9b-instruct-q6_K        # 7.3GB, strong reasoning
    ollama pull phi3:14b-instruct-q5_K_M        # 10GB, good for structured output

  You can load two 8B models simultaneously for A/B testing (~17GB total).

Ollama API available at: http://localhost:11434
  POST /api/generate — single completion
  POST /api/chat — multi-turn conversation
  GET /api/tags — list installed models
```

### 2. Set up LM Studio for model comparison

```text
I also want LM Studio so I can quickly test prompts with different models
through a visual interface before committing to one. Help me configure it
alongside Ollama without port conflicts, and set up a workflow for
comparing model outputs on the same medical note prompts.
```

```text
LM Studio setup alongside Ollama:

Install: Download from lmstudio.ai — AppImage for Linux
  chmod +x LM-Studio-*.AppImage && ./LM-Studio-*.AppImage

Port configuration (avoid conflict with Ollama on 11434):
  LM Studio → Settings → Server → Port: 1234
  This gives you two OpenAI-compatible endpoints:
    Ollama:    http://localhost:11434/v1  (OpenAI-compatible mode)
    LM Studio: http://localhost:1234/v1

Model comparison workflow:
  1. In LM Studio, download the same model variants in GGUF format
  2. Create a "Medical Summary" preset with your system prompt:
     "You are a medical note summarizer. Given raw clinical notes,
      produce a structured summary with: Chief Complaint, History,
      Assessment, and Plan."
  3. Load two models in split-view (LM Studio supports dual pane)
  4. Paste the same clinical note, compare outputs side by side
  5. Adjust temperature, top_p, and context length per model

Recommended GGUF models to download in LM Studio:
  TheBloke/Llama-3.1-8B-Instruct-GGUF (Q8_0)
  TheBloke/Mistral-7B-Instruct-v0.3-GGUF (Q8_0)
  Compare outputs on 10 sample notes → pick the best performer
```

### 3. Build a LangChain RAG pipeline for medical notes

```text
Now build the actual application. I have ~2,000 past medical notes as
text files in a directory. I need a RAG pipeline: embed the notes,
store in a local vector database, and let me query with natural language.
Everything must stay local — no external API calls.
```

```text
Created medical_rag/ingest.py — Document ingestion pipeline:

  from langchain_community.document_loaders import DirectoryLoader, TextLoader
  from langchain.text_splitter import RecursiveCharacterTextSplitter
  from langchain_community.embeddings import OllamaEmbeddings
  from langchain_community.vectorstores import Chroma

  Loader: DirectoryLoader("./notes/", glob="*.txt", loader_cls=TextLoader)
  Splitter: RecursiveCharacterTextSplitter(
    chunk_size=1000, chunk_overlap=200,
    separators=["\n\n", "\n", ". ", " "]
  )
  Embeddings: OllamaEmbeddings(model="nomic-embed-text", base_url="http://localhost:11434")
    Pull the model first: ollama pull nomic-embed-text  # 274MB, runs on CPU fine
  Vector store: Chroma(persist_directory="./chroma_db")

  Ingestion stats (2,000 notes):
    ~8,500 chunks after splitting
    Embedding time: ~12 minutes on CPU (nomic-embed-text is fast)
    ChromaDB size on disk: ~180MB

Created medical_rag/query.py — Query interface:

  from langchain.chains import RetrievalQA
  from langchain_community.llms import Ollama

  llm = Ollama(model="llama3.1:8b-instruct-q8_0", temperature=0.1)
  retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
  chain = RetrievalQA.from_chain_type(
    llm=llm, retriever=retriever, chain_type="stuff",
    return_source_documents=True
  )

  Example query: "Summarize all visits for patient ID 4821"
  Returns: structured summary + source document references
```

### 4. Add a conversational interface with memory

```text
Make it conversational so I can ask follow-up questions. It should
remember context within a session but not leak information between
sessions. Add a simple terminal UI.
```

```text
Created medical_rag/chat.py — Conversational RAG with memory:

  from langchain.memory import ConversationBufferWindowMemory
  from langchain.chains import ConversationalRetrievalChain

  memory = ConversationBufferWindowMemory(
    k=10,  # remember last 10 exchanges
    memory_key="chat_history",
    return_messages=True,
    output_key="answer"
  )

  chain = ConversationalRetrievalChain.from_llm(
    llm=Ollama(model="llama3.1:8b-instruct-q8_0", temperature=0.1),
    retriever=vectorstore.as_retriever(search_kwargs={"k": 5}),
    memory=memory,
    return_source_documents=True,
    verbose=False
  )

  Terminal UI (rich library):
    - Color-coded: user input in green, AI response in white, sources in dim
    - Shows retrieved document IDs below each answer
    - Commands: /clear (reset memory), /model (switch model), /quit
    - Session memory dies on /quit — no persistence between sessions

  Model switching at runtime:
    /model mistral:7b-instruct-v0.3-q8_0
    → Swaps the LLM in the chain without re-embedding documents
    → Useful for comparing answer quality mid-session
```

### 5. Create a testing and evaluation harness

```text
I need to evaluate which model gives the best summaries before deploying
internally. Create a simple eval script that runs 50 test notes through
each model and scores the outputs for completeness, accuracy against
a reference summary, and response time.
```

```text
Created medical_rag/eval.py — Model evaluation harness:

  Test set: 50 notes with human-written reference summaries in eval/ground_truth/

  Models to evaluate:
    - llama3.1:8b-instruct-q8_0 (via Ollama)
    - mistral:7b-instruct-v0.3-q8_0 (via Ollama)
    - gemma2:9b-instruct-q6_K (via Ollama)

  Metrics per response:
    Completeness: checks presence of required sections
      (Chief Complaint, History, Assessment, Plan) → 0-4 score
    ROUGE-L: overlap with reference summary (using rouge-score library)
    Response time: wall-clock seconds from request to full response
    Token count: output tokens (estimated from word count × 1.3)

  Output: eval/results.json and eval/results_summary.md

  Sample results (50 notes):
    Model                    | Completeness | ROUGE-L | Avg Time
    llama3.1:8b-q8           | 3.8/4        | 0.62    | 4.2s
    mistral:7b-v0.3-q8       | 3.6/4        | 0.58    | 3.8s
    gemma2:9b-q6             | 3.9/4        | 0.65    | 5.1s

  Run with: python eval.py --notes-dir ./eval/test_notes --models all
  Results are reproducible (temperature=0, fixed seed where supported)
```

## Real-World Example

Noa, a data scientist at a legal firm, used this same local setup to prototype a contract clause extractor. She couldn't send client contracts to any external API. With Ollama running Llama 3.1 locally and LangChain for the RAG pipeline, she embedded 5,000 contracts, built a query interface, and had lawyers testing it within a week. The eval harness helped her pick the right model — Gemma 2 turned out to extract clause boundaries more reliably. Total cloud API cost: zero. Total data leaked: zero.
