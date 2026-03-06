---
title: Run a Local LLM Stack for Private AI Applications
slug: run-local-llm-stack-for-private-ai
description: Set up a completely private AI stack using LocalAI as the self-hosted OpenAI-compatible API server and llamafile for portable single-file model distribution, enabling chat, embeddings, and audio transcription without any data leaving your network.
skills:
  - localai
  - llamafilecategory: data-ai
tags:
- local-llm
- privacy
- self-hosted
- inference
- offline
---

# Run a Local LLM Stack for Private AI Applications

## The Problem

Kai is CTO at a 50-person fintech company handling sensitive customer financial data. The engineering team wants to use LLMs for internal tools — summarizing support tickets, analyzing contracts, generating code — but compliance rules prohibit sending customer data to external APIs. OpenAI, Anthropic, and Groq are all off the table. Every token must stay on their own infrastructure.

## The Solution

Use the skills listed above to implement an automated workflow. Install the required skills:

```bash
npx terminal-skills install localai llamafile
```

## Step-by-Step Walkthrough

### Step 1: Deploy LocalAI as the Central API Server

LocalAI provides an OpenAI-compatible API that runs entirely self-hosted. The team's existing code that uses the OpenAI SDK works unchanged — they just point it to a different URL.

```yaml
# docker-helper.yml — Production LocalAI with multiple models
version: "3.8"
services:
  localai:
    image: localai/localai:latest-gpu-nvidia-cuda-12
    ports:
      - "8080:8080"
    volumes:
      - ./models:/build/models
      - ./config:/build/config
    environment:
      - THREADS=16                         # Match server's physical CPU cores
      - CONTEXT_SIZE=8192                  # Default context window
      - DEBUG=false
      - CORS=true
      - CORS_ALLOW_ORIGINS=*
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/readyz"]
      interval: 30s
      timeout: 10s
      retries: 3
```

```yaml
# config/chat.yaml — Chat model (Llama 3.1 8B for general use)
name: llama-chat
backend: llama-cpp
parameters:
  model: Meta-Llama-3.1-8B-Instruct.Q5_K_M.gguf
  context_size: 8192
  threads: 8
  gpu_layers: 33                           # Offload all layers to GPU
  temperature: 0.7
  top_p: 0.9
  repeat_penalty: 1.1
template:
  chat_message: |
    <|start_header_id|>{{.RoleName}}<|end_header_id|>

    {{.Content}}<|eot_id|>
  chat: |
    <|begin_of_text|><|start_header_id|>system<|end_header_id|>

    {{.Input}}<|eot_id|>

---
# config/embedding.yaml — Embedding model for RAG and search
name: embedding
backend: sentencetransformers
parameters:
  model: all-MiniLM-L6-v2

---
# config/whisper.yaml — Audio transcription
name: whisper-1
backend: whisper
parameters:
  model: ggml-base.en.bin
  language: en
```

### Step 2: Download Models

```bash
# Create the models directory
mkdir -p models

# Download Llama 3.1 8B (quantized — 5.3 GB, runs on 8GB GPU)
wget -P models/ \
  "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf"

# Download embedding model (auto-downloaded by sentencetransformers)
# Just reference it in the config — LocalAI handles the rest

# Download Whisper base model
wget -P models/ \
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"

# Start the server
docker compose up -d

# Verify all models are loaded
curl http://localhost:8080/v1/models | python3 -m json.tool
```

### Step 3: Integrate with Existing Applications

The beauty of LocalAI's OpenAI compatibility: the team's existing code works with a one-line change.

```typescript
// src/lib/ai.ts — AI client that works with both OpenAI and LocalAI
import OpenAI from "openai";

// Switch between providers with an environment variable
const ai = new OpenAI({
  apiKey: process.env.AI_API_KEY || "not-needed",
  baseURL: process.env.AI_BASE_URL || "http://localhost:8080/v1",
});

// Chat — identical API whether it's OpenAI or LocalAI
export async function summarizeTicket(ticketContent: string): Promise<string> {
  const response = await ai.chat.completions.create({
    model: process.env.AI_CHAT_MODEL || "llama-chat",
    messages: [
      {
        role: "system",
        content: "You are a support ticket analyst. Summarize the customer's issue in 2-3 sentences, identify the severity (low/medium/high), and suggest the best team to handle it.",
      },
      { role: "user", content: ticketContent },
    ],
    temperature: 0.3,
    max_tokens: 300,
  });
  return response.choices[0].message.content ?? "";
}

// Embeddings — for semantic search over internal documents
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const response = await ai.embeddings.create({
    model: process.env.AI_EMBED_MODEL || "embedding",
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

// Transcription — for converting voice messages and call recordings
export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const file = new File([audioBuffer], "audio.wav", { type: "audio/wav" });
  const response = await ai.audio.transcriptions.create({
    model: "whisper-1",
    file,
  });
  return response.text;
}
```

### Step 4: Portable Models with llamafile for Developers

Not every developer needs the full LocalAI server. For individual use — running a model during code review, analyzing logs, or prototyping — llamafile provides a single-file solution that doesn't even need Docker.

```bash
# Create a company-standard llamafile for code review
# This is a single executable that any developer can download and double-click

# Download the llamafile runtime
wget https://github.com/Mozilla-Ocho/llamafile/releases/latest/download/llamafile
chmod +x llamafile

# Create the code review assistant llamafile
./llamafile \
  --model models/Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf \
  --system-prompt "You are a senior code reviewer at a fintech company. Review code for:
1. Security vulnerabilities (SQL injection, XSS, auth bypass)
2. Financial calculation accuracy (rounding, overflow, currency handling)
3. Error handling and edge cases
4. Compliance with SOC2 and PCI-DSS requirements
Be specific. Reference line numbers. Suggest fixes." \
  --create fintech-code-reviewer.llamafile

# Distribute to the team via internal file share
# Each developer runs it locally — no server, no Docker, no internet
```

Developers use the llamafile for quick, local AI tasks:

```bash
# Quick code review from the terminal
cat pull_request.diff | ./fintech-code-reviewer.llamafile --cli

# Analyze an error log
./fintech-code-reviewer.llamafile --cli \
  --system "Analyze this error log. Identify the root cause and suggest a fix." \
  < production_error.log

# Interactive mode — opens web UI at localhost:8080
./fintech-code-reviewer.llamafile
```

### Step 5: Internal RAG for Document Search

With embeddings running locally, the team builds a document search system that lets anyone query internal knowledge bases — compliance docs, runbooks, architecture decisions.

```typescript
// src/services/knowledge-search.ts — RAG with local embeddings
import { ai, embedDocuments } from "../lib/ai";

interface SearchResult {
  content: string;
  source: string;
  score: number;
}

async function searchAndAnswer(
  question: string,
  vectorStore: VectorStore
): Promise<{ answer: string; sources: SearchResult[] }> {
  // 1. Embed the question (runs on LocalAI)
  const [queryEmbedding] = await embedDocuments([question]);

  // 2. Find relevant documents
  const results = await vectorStore.search(queryEmbedding, { topK: 5 });

  // 3. Generate answer with context (runs on LocalAI)
  const context = results
    .map((r) => `[Source: ${r.source}]\n${r.content}`)
    .join("\n\n---\n\n");

  const response = await ai.chat.completions.create({
    model: "llama-chat",
    messages: [
      {
        role: "system",
        content: `Answer the question based ONLY on the provided context. If the context doesn't contain the answer, say "I don't have information about that in our documents." Always cite which source document you're referencing.`,
      },
      {
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 500,
  });

  return {
    answer: response.choices[0].message.content ?? "",
    sources: results.map((r) => ({
      content: r.content.slice(0, 200) + "...",
      source: r.source,
      score: r.score,
    })),
  };
}
```


## Real-World Example

After a month of running the local AI stack, Kai's team processes over 2,000 support ticket summaries per day, all without a single byte leaving the company network. The compliance team signed off because the entire inference pipeline runs on company-owned servers in their data center.

The LocalAI server runs on a single machine with an NVIDIA A10G GPU ($500/month on AWS). It handles 15-20 concurrent requests with an average latency of 800ms for chat completions — slower than Groq's 100ms, but fast enough for internal tools where privacy matters more than speed.

The llamafile distribution was an unexpected hit. Developers adopted the code review assistant because it required zero setup — download one file, double-click, and it works. Even on M1 MacBooks without GPU, the 8B model generates tokens fast enough for code review (~25 tok/s). Ten developers use it daily, saving the company roughly $200/month in what would have been OpenAI API costs.

The knowledge search system indexes 3,000 internal documents (compliance policies, engineering runbooks, product specs). The team reports finding answers 5x faster than the previous approach of searching Confluence. Since embeddings run locally, even the most sensitive documents — financial audits, security assessments, customer data handling procedures — are searchable without privacy concerns.

Total monthly cost: $500 for the GPU server. Compared to estimated OpenAI costs of $800-1,200/month for the same workload, plus the compliance risk that would have required a $50K/year DPA review — the local stack pays for itself immediately.

## Related Skills

- [localai](../skills/localai/) -- Self-hosted OpenAI-compatible API for running open-source models locally
- [llamafile](../skills/llamafile/) -- Single-file executable LLMs that run on any platform without dependencies
