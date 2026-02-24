---
name: langfuse
description: |
  Open-source LLM observability and analytics platform. Trace LLM calls, score outputs,
  manage prompts, and monitor cost/latency across your AI application. Integrates with
  OpenAI, LangChain, LlamaIndex, and other LLM frameworks.
license: Apache-2.0
compatibility:
  - python 3.8+
  - typescript/node 18+
  - langfuse-python 2.0+
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ai-ml
  tags:
    - llm-observability
    - tracing
    - prompt-management
    - monitoring
    - analytics
---

# Langfuse

## Installation

```bash
# Install Python SDK
pip install langfuse

# Or for Node.js
npm install langfuse
```

```bash
# Set environment variables
export LANGFUSE_PUBLIC_KEY="pk-lf-xxxx"
export LANGFUSE_SECRET_KEY="sk-lf-xxxx"
export LANGFUSE_HOST="https://cloud.langfuse.com"  # or self-hosted URL
```

## Basic Tracing with Decorator

```python
# trace_decorator.py — Trace LLM calls automatically with the @observe decorator
from langfuse.decorators import observe, langfuse_context
from openai import OpenAI

client = OpenAI()

@observe()
def answer_question(question: str) -> str:
    # Add metadata to the current trace
    langfuse_context.update_current_trace(
        user_id="user-123",
        session_id="session-abc",
        tags=["production", "support"],
    )

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": question},
        ],
    )
    return response.choices[0].message.content

@observe()
def process_request(question: str):
    # Nested observations create parent-child spans automatically
    answer = answer_question(question)
    langfuse_context.score_current_trace(name="user-feedback", value=1)
    return answer

result = process_request("What is Langfuse?")
langfuse_context.flush()
```

## OpenAI Integration

```python
# openai_tracing.py — Drop-in OpenAI wrapper that traces all calls automatically
from langfuse.openai import openai

# Use exactly like the OpenAI SDK — all calls are traced
response = openai.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}],
    metadata={"feature": "chat"},  # Extra metadata for Langfuse
    trace_id="custom-trace-id",    # Optional custom trace ID
)
print(response.choices[0].message.content)
```

## LangChain Integration

```python
# langchain_tracing.py — Trace LangChain chains and agents with CallbackHandler
from langfuse.callback import CallbackHandler
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

langfuse_handler = CallbackHandler(
    user_id="user-456",
    session_id="session-xyz",
    tags=["langchain", "rag"],
)

llm = ChatOpenAI(model="gpt-4")
prompt = ChatPromptTemplate.from_messages([
    ("system", "Answer concisely."),
    ("user", "{question}"),
])

chain = prompt | llm
result = chain.invoke(
    {"question": "What is RAG?"},
    config={"callbacks": [langfuse_handler]},
)
```

## Manual Tracing with Low-Level SDK

```python
# manual_trace.py — Fine-grained control over traces, spans, and generations
from langfuse import Langfuse

langfuse = Langfuse()

# Create a trace
trace = langfuse.trace(
    name="support-ticket",
    user_id="user-789",
    metadata={"ticket_id": "T-1234"},
)

# Add a retrieval span
retrieval = trace.span(
    name="knowledge-retrieval",
    input={"query": "refund policy"},
)
retrieval.end(output={"documents": ["Doc 1", "Doc 2"], "count": 2})

# Add an LLM generation
generation = trace.generation(
    name="answer-generation",
    model="gpt-4",
    input=[{"role": "user", "content": "What is the refund policy?"}],
    model_parameters={"temperature": 0.7, "max_tokens": 500},
)
generation.end(
    output="Our refund policy allows returns within 30 days...",
    usage={"input": 150, "output": 45},
)

# Score the trace
trace.score(name="helpfulness", value=0.9, comment="Accurate response")

langfuse.flush()
```

## Prompt Management

```python
# prompt_management.py — Version and manage prompts through Langfuse
from langfuse import Langfuse

langfuse = Langfuse()

# Fetch a managed prompt (versioned in Langfuse UI)
prompt = langfuse.get_prompt("support-answer", version=2)

# Use the prompt template
compiled = prompt.compile(
    customer_name="Alice",
    question="How do I reset my password?",
)

# Link prompt to a generation for tracking which prompt version produced what
trace = langfuse.trace(name="prompt-test")
generation = trace.generation(
    name="answer",
    model="gpt-4",
    prompt=prompt,  # Links this generation to the prompt version
    input=[{"role": "user", "content": compiled}],
)
```

## Scoring and Evaluation

```python
# scoring.py — Score traces for quality evaluation and monitoring
from langfuse import Langfuse

langfuse = Langfuse()

# Score an existing trace by ID
langfuse.score(
    trace_id="trace-id-from-production",
    name="accuracy",
    value=1,  # Numeric score
    comment="Correct answer provided",
)

# Categorical scoring
langfuse.score(
    trace_id="trace-id-from-production",
    name="toxicity",
    value="none",  # String categories
)

# Boolean scoring
langfuse.score(
    trace_id="trace-id-from-production",
    name="hallucination",
    value=0,  # 0 = no hallucination, 1 = hallucination
)
```

## Self-Hosting with Docker

```yaml
# docker-compose.yml — Self-host Langfuse with PostgreSQL
version: "3.9"
services:
  langfuse:
    image: langfuse/langfuse:2
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://langfuse:langfuse@db:5432/langfuse
      NEXTAUTH_SECRET: mysecret
      SALT: mysalt
      NEXTAUTH_URL: http://localhost:3000
    depends_on:
      - db
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: langfuse
      POSTGRES_PASSWORD: langfuse
      POSTGRES_DB: langfuse
    volumes:
      - langfuse_data:/var/lib/postgresql/data
volumes:
  langfuse_data:
```

## Key Concepts

- **Traces**: Top-level unit representing one request/interaction through your system
- **Spans**: Sub-units within a trace for non-LLM operations (retrieval, processing)
- **Generations**: LLM-specific spans with model, token usage, and cost tracking
- **Scores**: Numeric, boolean, or categorical quality metrics attached to traces
- **Sessions**: Group multiple traces from the same user conversation
- **Prompt Management**: Version prompts in the UI, fetch them in code, track which version produced which output
