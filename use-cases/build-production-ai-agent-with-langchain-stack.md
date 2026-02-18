---
title: "Build a Production AI Agent with the LangChain Stack"
slug: build-production-ai-agent-with-langchain-stack
description: "Create a multi-step RAG agent with LangGraph, trace and debug with LangSmith, and evaluate quality before shipping to production."
skills: [langchain, langgraph, langsmith]
category: data-ai
tags: [langchain, langgraph, langsmith, rag, agents, production, evaluation]
---

# Build a Production AI Agent with the LangChain Stack

## The Problem

Dani is the lead engineer at a 15-person B2B SaaS company that sells project management software. Their support team handles 400 tickets a day, and 60% are questions that could be answered from existing documentation — API guides, changelogs, troubleshooting pages, and knowledge base articles spread across 1,200 pages.

They tried a basic RAG chatbot: embed docs, retrieve top-k, prompt GPT. It worked for demos. In production, it hallucinated pricing that changed two months ago, gave irrelevant answers when questions needed multi-step reasoning ("How do I migrate from v2 webhooks to v3 and update my auth?"), and there was no way to tell which answers were good and which were garbage.

The numbers: 35% of AI answers required human correction. Support agents stopped trusting the bot and started ignoring it. The $2,400/month in API costs produced negative ROI because bad answers increased ticket resolution time instead of reducing it.

Dani needs an agent that can reason through multi-step questions, knows when to search vs. ask for clarification, gets evaluated before every deployment, and has full observability so the team can debug failures in minutes instead of days.

## The Solution

Build a stateful RAG agent with LangGraph for multi-step reasoning, LangChain for retrieval and tool integration, and LangSmith for tracing, evaluation, and monitoring.

### Prompt for Your AI Agent

```text
I need to build a production support agent for our SaaS documentation. Here's the setup:

**Documentation:**
- 1,200 pages across API docs, changelogs, troubleshooting guides, KB articles
- Docs are in a /docs folder as markdown files
- Docs update weekly (new features, deprecations, version changes)

**Requirements:**
1. Multi-step reasoning: agent should break complex questions into sub-queries
2. Source attribution: every answer must cite which doc pages it used
3. Confidence scoring: agent should flag low-confidence answers for human review
4. Evaluation pipeline: automated quality checks before deployment
5. Full observability: trace every query, monitor latency, track accuracy

**Architecture:**
- Use LangGraph for the agent workflow with these nodes:
  - `classify`: Determine if the question needs simple retrieval, multi-step reasoning, or human escalation
  - `retrieve`: Search vector store with the query (or sub-queries)
  - `generate`: Produce answer with citations from retrieved docs
  - `evaluate`: Self-check the answer quality and confidence
  - `escalate`: Route low-confidence answers to human support

- Use LangChain for:
  - Document loading (markdown files from /docs)
  - Text splitting with RecursiveCharacterTextSplitter (chunk_size=800, overlap=200)
  - Embeddings with OpenAI text-embedding-3-small
  - Chroma vector store with metadata filters (doc_type, version, last_updated)
  - Structured output for confidence scores and citations

- Use LangSmith for:
  - Automatic tracing of all agent runs
  - Evaluation dataset from 200 real support tickets with expected answers
  - Custom evaluators: correctness, citation accuracy, helpfulness
  - CI/CD integration: block deployment if accuracy drops below 90%
  - Production monitoring: alert on latency > 10s or error rate > 2%

**State Schema:**
```python
class SupportState(TypedDict):
    messages: Annotated[list, add_messages]
    question_type: str  # "simple", "multi_step", "escalate"
    sub_queries: list[str]
    retrieved_docs: list[Document]
    answer: str
    citations: list[str]
    confidence: float
    needs_human: bool
```

Start with the LangGraph agent, then add the evaluation pipeline, then set up monitoring.
```text

### What Your Agent Will Do

1. **Read the skill files** for `langchain`, `langgraph`, and `langsmith` to understand the full stack
2. **Set up the project** — install dependencies, configure environment variables, initialize vector store
3. **Build the document pipeline** — load markdown docs, split into chunks, embed with metadata, store in Chroma
4. **Create the LangGraph agent** with classify → retrieve → generate → evaluate → escalate nodes
5. **Add conditional routing** — simple questions go straight to generate, complex ones get sub-query decomposition, unclear ones escalate
6. **Implement persistence** — SQLite checkpointing so conversations maintain state across messages
7. **Wire up LangSmith tracing** — automatic for all LangChain calls, manual `@traceable` for custom logic
8. **Build the evaluation dataset** — 200 question/answer pairs from real support tickets
9. **Create evaluators** — correctness (does the answer match?), citation accuracy (are sources real?), confidence calibration (does the confidence score correlate with actual quality?)
10. **Set up CI/CD quality gate** — pytest runs evaluation suite, fails the build if accuracy < 90%
11. **Configure production monitoring** — dashboards for latency, token usage, error rate, confidence distribution

### Expected Outcome

- **Agent accuracy**: 91% correct answers (up from 65% with basic RAG)
- **Multi-step handling**: Complex questions decomposed into 2-4 sub-queries, each retrieving relevant context
- **Confidence calibration**: 94% correlation between confidence score and actual correctness
- **Escalation rate**: 12% of questions routed to humans (down from 35% needing correction)
- **Observability**: Every query traceable in LangSmith with full node-by-node breakdown
- **Deployment safety**: Automated eval blocks bad deployments; last 3 regressions caught before production
- **Latency**: p50 = 2.1s, p95 = 5.8s (acceptable for support use case)
- **Monthly cost**: $1,800 in API calls serving 12,000 queries — $0.15/query vs $4.20/ticket for human support
