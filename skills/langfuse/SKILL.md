---
name: langfuse
description: >-
   You are an expert in Langfuse, the open-source LLM engineering platform.
  You help developers trace LLM calls, evaluate output quality, manage
  prompts, track costs and latency, run experiments, and build evaluation
  datasets — providing full observability into AI applications from
  development through production.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - observability
    - llm
    - tracing
    - evaluation
    - prompt-management
    - analytics
---

# Langfuse — Open-Source LLM Observability

You are an expert in Langfuse, the open-source LLM engineering platform. You help developers trace LLM calls, evaluate output quality, manage prompts, track costs and latency, run experiments, and build evaluation datasets — providing full observability into AI applications from development through production.

## Core Capabilities

### Tracing

```python
# Decorator-based tracing (Python)
from langfuse.decorators import observe, langfuse_context

@observe()
def answer_question(question: str, context: str) -> str:
    """Trace the entire RAG pipeline as a single trace."""

    # Step 1: Retrieve relevant docs
    docs = retrieve_docs(question)

    # Step 2: Generate answer
    answer = generate_answer(question, docs)

    # Add metadata to trace
    langfuse_context.update_current_trace(
        user_id="user-42",
        session_id="session-abc",
        tags=["production", "rag"],
        metadata={"model": "gpt-4o", "doc_count": len(docs)},
    )

    return answer

@observe()
def retrieve_docs(question: str) -> list[str]:
    """Traced as a span within the parent trace."""
    embeddings = openai.embeddings.create(model="text-embedding-3-small", input=question)
    results = vector_store.search(embeddings.data[0].embedding, top_k=5)
    return [r.text for r in results]

@observe(as_type="generation")
def generate_answer(question: str, docs: list[str]) -> str:
    """Traced as an LLM generation with token usage and cost."""
    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": f"Context:\n{chr(10).join(docs)}"},
            {"role": "user", "content": question},
        ],
    )
    return response.choices[0].message.content
```

```typescript
// TypeScript / Vercel AI SDK integration
import { Langfuse } from "langfuse";
import { AISDKExporter } from "langfuse-vercel";

const langfuse = new Langfuse();

// Wrap AI SDK calls
const result = await generateText({
  model: openai("gpt-4o"),
  prompt: question,
  experimental_telemetry: {
    isEnabled: true,
    functionId: "answer-question",
    metadata: { userId: "user-42" },
  },
});
```

### Prompt Management

```python
from langfuse import Langfuse

langfuse = Langfuse()

# Fetch versioned prompt from Langfuse
prompt = langfuse.get_prompt("rag-system-prompt", version=3)

# Use in generation
response = openai.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": prompt.compile(company_name="Acme", tone="professional")},
        {"role": "user", "content": user_question},
    ],
)

# Prompts managed via Langfuse UI — non-engineers can edit, version, A/B test
```

### Evaluation

```python
# Score traces for quality
langfuse.score(
    trace_id=trace.id,
    name="relevance",
    value=0.9,                            # 0-1 scale
    comment="Answer directly addressed the question",
)

# LLM-as-judge evaluation
langfuse.score(
    trace_id=trace.id,
    name="hallucination",
    value=0.0,                            # 0 = no hallucination
    data_type="NUMERIC",
)

# Create evaluation datasets
dataset = langfuse.create_dataset("rag-eval-v1")
for item in test_cases:
    langfuse.create_dataset_item(
        dataset_name="rag-eval-v1",
        input={"question": item["question"]},
        expected_output=item["expected_answer"],
    )
```

## Installation

```bash
pip install langfuse                      # Python
npm install langfuse                      # TypeScript
# Self-hosted: docker-compose up (Langfuse is open-source)
```

## Best Practices

1. **Trace everything** — Wrap all LLM calls with tracing; understand latency, cost, and quality per request
2. **Structured traces** — Use nested spans (retrieve → generate → format); identify bottlenecks in pipeline
3. **Cost tracking** — Langfuse auto-calculates token costs per model; track spending by user, feature, prompt version
4. **Prompt versioning** — Manage prompts in Langfuse UI; A/B test versions, rollback safely
5. **Evaluation datasets** — Create test sets from production traces; run regression tests on prompt changes
6. **LLM-as-judge** — Use automated scoring for hallucination, relevance, helpfulness at scale
7. **Session tracking** — Group traces by session for conversational AI; see full conversation flow
8. **Self-hosted** — Deploy with Docker for data sovereignty; same features as cloud, your infrastructure
