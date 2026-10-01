---
name: llamaindex
description: >-
  LlamaIndex is an open-source Python framework for connecting LLMs to your own
  data: it loads and chunks documents, indexes them in a vector store, and
  answers questions over them with retrieval (RAG) and tool-calling agents. Use
  when ingesting documents, configuring retrieval strategies, building query
  engines, creating multi-step agents, or evaluating answer quality. Trigger
  words: llamaindex, llama-index, rag, retrieval augmented generation, vector
  index, query engine, document loader, knowledge base.
license: Apache-2.0
compatibility: "Python 3.10+; an LLM and embedding provider (OpenAI by default, or local models through Ollama)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["llamaindex", "rag", "llm", "retrieval", "knowledge-base"]
  repository: https://github.com/run-llama/llama_index
---

# LlamaIndex

## Overview

LlamaIndex is a data framework for building RAG pipelines, knowledge assistants, and data-augmented LLM applications. It provides document loaders, chunking strategies, several index types, hybrid retrieval with reranking, tool-calling agents, and evaluation tools for question-answering systems. The Python library is `llama-index-core` plus one pip package per integration (300+). This skill follows the 0.14 API: agents are workflow-based (`FunctionAgent`), and the agent classes from before 0.13 no longer exist.

## Instructions

### Install and configure models

```bash
pip install llama-index                 # llama-index-core + the OpenAI LLM and embedding integrations
pip install llama-index-readers-file    # PDF, DOCX, PPTX, CSV parsing for SimpleDirectoryReader
pip install llama-index-vector-stores-chroma llama-index-retrievers-bm25 llama-index-postprocessor-cohere-rerank
```

The package name spells the import: `llama-index-llms-ollama` is `from llama_index.llms.ollama import Ollama`. Set models once on `Settings`; every index, query engine, and evaluator picks them up.

```python
from llama_index.core import Settings
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI

# Both read OPENAI_API_KEY from the environment. Left unset, the defaults are the
# older gpt-3.5-turbo and text-embedding-ada-002.
Settings.llm = OpenAI(model="gpt-4o-mini")
Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")

# Local models instead: pip install llama-index-llms-ollama llama-index-embeddings-ollama
# from llama_index.llms.ollama import Ollama
# from llama_index.embeddings.ollama import OllamaEmbedding
# Settings.llm = Ollama(model="llama3.1", request_timeout=360.0, context_window=8000)
# Settings.embed_model = OllamaEmbedding(model_name="nomic-embed-text")
```

### Load, index, query

```python
from llama_index.core import SimpleDirectoryReader, StorageContext, VectorStoreIndex, load_index_from_storage

documents = SimpleDirectoryReader(
    "docs/handbook", recursive=True, required_exts=[".md", ".pdf"], filename_as_id=True
).load_data()
index = VectorStoreIndex.from_documents(documents)   # chunks, embeds, stores in memory
index.storage_context.persist(persist_dir="storage")

# Later runs: reload instead of re-embedding
index = load_index_from_storage(StorageContext.from_defaults(persist_dir="storage"))
response = index.as_query_engine(similarity_top_k=4).query("How many vacation days do new hires get?")
print(response)
for hit in response.source_nodes:
    print(hit.score, hit.metadata["file_name"])
```

- When chunking, start with `SentenceSplitter` at 1024 tokens with 200 token overlap (its defaults), use `MarkdownNodeParser` for structured documents, `CodeSplitter` for code (needs `tree_sitter_language_pack`), and adjust based on evaluation results.
- When indexing, use `VectorStoreIndex` as the default for most RAG, `PropertyGraphIndex` for entity relationships (`KnowledgeGraphIndex` is deprecated), and `DocumentSummaryIndex` for per-document summaries.
- When building query engines, use `RetrieverQueryEngine` for standard RAG, `CitationQueryEngine` for responses with source attribution, and `SubQuestionQueryEngine` for complex multi-part queries.
- Set `similarity_top_k` based on context window: 3-5 chunks for large models, 2-3 for smaller models.

### Incremental ingestion into a vector store

```python
import os
import chromadb
from llama_index.core.extractors import TitleExtractor
from llama_index.core.ingestion import IngestionPipeline
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.storage.docstore import SimpleDocumentStore
from llama_index.vector_stores.chroma import ChromaVectorStore

collection = chromadb.PersistentClient(path="chroma_db").get_or_create_collection("handbook")
vector_store = ChromaVectorStore(chroma_collection=collection)

pipeline = IngestionPipeline(
    transformations=[
        SentenceSplitter(chunk_size=1024, chunk_overlap=200),
        TitleExtractor(),            # per document: one LLM call per chunk (first 5) plus one to merge; adds document_title
        Settings.embed_model,        # must be a stage when a vector store is attached
    ],
    docstore=SimpleDocumentStore(),  # remembers a hash per document id
    vector_store=vector_store,
)
if os.path.exists("pipeline_storage"):
    pipeline.load("pipeline_storage")
nodes = pipeline.run(documents=documents)   # unchanged files are skipped, edited ones are replaced
pipeline.persist("pipeline_storage")
index = VectorStoreIndex.from_vector_store(vector_store)
```

Deduplication keys on the document id, so load with `filename_as_id=True`; otherwise every run generates new ids and re-embeds everything.

### Hybrid retrieval and reranking

```python
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.retrievers import QueryFusionRetriever
from llama_index.postprocessor.cohere_rerank import CohereRerank
from llama_index.retrievers.bm25 import BM25Retriever

chunks = vector_store.get_nodes(node_ids=None)   # every chunk in the Chroma collection
hybrid = QueryFusionRetriever(
    [index.as_retriever(similarity_top_k=10), BM25Retriever.from_defaults(nodes=chunks, similarity_top_k=10)],
    similarity_top_k=10,
    num_queries=1,               # 1 = no LLM-generated query variations
    mode="reciprocal_rerank",
)
engine = RetrieverQueryEngine.from_args(
    hybrid,
    node_postprocessors=[CohereRerank(top_n=4)],   # reads COHERE_API_KEY
)
```

### Agents

```python
import asyncio
from llama_index.core.agent.workflow import FunctionAgent
from llama_index.core.tools import QueryEngineTool
from llama_index.core.workflow import Context

handbook_tool = QueryEngineTool.from_defaults(
    query_engine=engine,
    name="handbook_search",
    description="Answers questions about the employee handbook: time off, expenses, hardware.",
)
agent = FunctionAgent(
    tools=[handbook_tool],
    llm=Settings.llm,
    system_prompt="Answer HR questions. Search the handbook before answering.",
)

async def main():
    ctx = Context(agent)   # carries chat history between runs
    print(await agent.run("How many vacation days do new hires get?", ctx=ctx))
    print(await agent.run("And how many of them carry over?", ctx=ctx))

asyncio.run(main())
```

`FunctionAgent` relies on the provider's native tool calling. For models without it, use `ReActAgent` from the same module; `AgentWorkflow(agents=[...])` lets several agents hand off to each other. Plain Python functions with type hints and a docstring are valid tools.

### Evaluation

```python
from llama_index.core.evaluation import BatchEvalRunner, FaithfulnessEvaluator, RelevancyEvaluator

async def evaluate(engine, questions):
    judge = OpenAI(model="gpt-4o")
    runner = BatchEvalRunner(
        {"faithfulness": FaithfulnessEvaluator(llm=judge), "relevancy": RelevancyEvaluator(llm=judge)},
        workers=4,
    )
    results = await runner.aevaluate_queries(engine, queries=questions)
    for name, evals in results.items():
        print(name, sum(e.passing for e in evals) / len(evals))
```

Faithfulness checks the answer against the retrieved context and relevancy against the question; neither needs labels. `CorrectnessEvaluator` scores 1-5 against a `reference` answer you supply.

## Examples

### Example 1: Build a RAG pipeline over company documentation

**User request:** "Create a question-answering system over our internal docs"

With `Settings`, `documents`, and the ingestion pipeline above in `ask_handbook.py`, add a citation engine:

```python
import sys
from llama_index.core.query_engine import CitationQueryEngine

engine = CitationQueryEngine.from_args(index, similarity_top_k=4, citation_chunk_size=512)
response = engine.query(sys.argv[1])
print(response)
for i, hit in enumerate(response.source_nodes, start=1):
    print(f"[{i}] {hit.metadata['file_name']}")
```

```bash
python ask_handbook.py "How many vacation days do new hires get, and do unused days carry over?"
```

**Output** (wording varies by model):

```
New hires receive 25 vacation days per calendar year, prorated from the start date [1].
Up to 5 unused days carry over and expire on March 31 [1].
[1] time-off.md
[2] expenses.md
```

The second run of the script embeds no documents (only the question), because the pipeline's document store finds every file unchanged.

### Example 2: Create a multi-source research agent

**User request:** "Build an agent that can search our handbook and our runbooks, and also do date math"

```python
from datetime import date
from llama_index.core.agent.workflow import FunctionAgent, ToolCallResult
from llama_index.core.tools import QueryEngineTool

def days_between(start: str, end: str) -> int:
    """Number of days between two ISO dates (YYYY-MM-DD)."""
    return (date.fromisoformat(end) - date.fromisoformat(start)).days

tools = [
    QueryEngineTool.from_defaults(handbook_index.as_query_engine(), name="handbook_search",
        description="HR policies: time off, expenses, hardware purchases."),
    QueryEngineTool.from_defaults(runbook_index.as_query_engine(), name="runbook_search",
        description="Engineering runbooks: deploys, incident response, on-call."),
    days_between,
]
agent = FunctionAgent(tools=tools, llm=Settings.llm, system_prompt="Use the tools; cite which one you used.")

async def ask(question: str):
    handler = agent.run(question)
    async for event in handler.stream_events():
        if isinstance(event, ToolCallResult):
            print("tool:", event.tool_name, event.tool_kwargs)
    print(await handler)
```

**Output** for `asyncio.run(ask("Vacation carry-over expires March 31. How many days is that from 2026-10-01?"))` (which tools are called, and with what arguments, varies by model): one `tool:` line per call — for example `handbook_search`, then `days_between {'start': '2026-10-01', 'end': '2027-03-31'}` — followed by an answer that uses the returned 181 days.

## Guidelines

- Use `SentenceSplitter` with 1024 token chunks and 200 token overlap as the starting point.
- Install `llama-index-readers-file` before loading PDFs or Office files: since 0.14.18 `pip install llama-index` no longer pulls it in, and without it `SimpleDirectoryReader` only logs a warning and reads those files as raw text.
- Code written for 0.12 or earlier breaks: `ServiceContext` raises (use `Settings`), and `ReActAgent.from_tools`, `AgentRunner`, `FunctionCallingAgent`, `OpenAIAgent`, and `QueryPipeline` were removed in 0.13. Agents are async; call them with `await agent.run(...)`.
- Use hybrid retrieval (vector + keyword) for production; pure vector search misses exact term matches. `QueryFusionRetriever` runs its retrievers asynchronously, so a vector store created with only a sync client (Qdrant, for one) fails there — pass its async client too or set `use_async=False`.
- Add a reranker (`CohereRerank`) after retrieval to improve result relevance for small cost: retrieve 10, keep 4.
- Metadata extractors (`TitleExtractor`, `SummaryExtractor`) improve retrieval but cost LLM calls on every new or changed document; add them once the plain pipeline is measured.
- Evaluate with `BatchEvalRunner` on a fixed question set before deploying and after every change to chunking or retrieval; subjective quality assessment does not scale.
- Use `IngestionPipeline` with a docstore for incremental updates; do not re-embed unchanged documents. Persist both the pipeline state and the vector store.
- Documents and questions are sent to the configured LLM and embedding provider. For data that must stay on the machine, set local models on `Settings` before building any index, and re-embed after changing the embedding model — vectors from different models are not comparable.
- The maintainers now focus on the hosted LlamaParse platform and keep the framework as an open toolkit. For hard PDFs (scans, tables) the built-in readers are basic; for a single prompt over a small file, call the model API directly instead of building an index.
