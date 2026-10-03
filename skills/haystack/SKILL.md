---
name: haystack
description: >-
  Haystack is an open-source Python framework by deepset for building RAG pipelines,
  search systems and LLM agents from composable components (document stores, retrievers,
  prompt builders, chat generators, agents). Use when the user wants to build or debug a
  Haystack pipeline, write a custom component, index documents for retrieval, build an agent
  with tools, or migrate code from Haystack 2.x to 3.x.
license: Apache-2.0
compatibility: "Python 3.10+; pip install haystack-ai; checked against haystack-ai 3.3.0"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags:
    - rag
    - pipeline
    - search
    - retrieval
    - python
  repository: https://github.com/deepset-ai/haystack
---

# Haystack — LLM Application Framework by deepset

## Overview

Haystack models an application as a `Pipeline` of components connected by typed inputs and outputs. Typical building blocks are an `InMemoryDocumentStore` (or a vector database integration), embedders, retrievers, a `ChatPromptBuilder`, and a chat generator such as `OpenAIChatGenerator`. Since 3.0 (2026) the framework is leaner: the legacy text Generators are removed in favour of Chat Generators, `AsyncPipeline` is merged into `Pipeline`, and many local-model components live in separately installed integration packages. Code written for 2.x commonly breaks on these points, see the migration notes below.

## Instructions

### Install

```bash
pip install haystack-ai
export OPENAI_API_KEY=...       # for the OpenAI components
export HAYSTACK_TELEMETRY_ENABLED=False   # optional: disable anonymous telemetry
```

Integrations are separate packages (`pip install qdrant-haystack`, `sentence-transformers-haystack`, `transformers-haystack`, ...) imported from `haystack_integrations.*`.

### Build a pipeline

1. Create a document store and an indexing `Pipeline` (converter -> `DocumentSplitter` -> document embedder -> `DocumentWriter`).
2. Create a query `Pipeline`: text embedder -> retriever -> `ChatPromptBuilder` -> chat generator. Connect with `pipeline.connect("sender.output", "receiver.input")`.
3. Run with a dict keyed by component name: `pipeline.run({"text_embedder": {"text": q}, "prompt_builder": {"question": q}})`. Use `include_outputs_from={"retriever"}` to see intermediate results.
4. `ChatPromptBuilder` takes a list of `ChatMessage` objects with Jinja2 templates; the generator's output is `result["llm"]["replies"][0]`, a `ChatMessage` whose text is `.text`.

### Custom components

Decorate a class with `@component`, declare outputs with `@component.output_types(...)`, and implement `run`. Build the class in a module you control; the loader needs to trust it (see Guidelines).

### Agents

`haystack.components.agents.Agent(chat_generator=..., tools=[...], system_prompt=...)` runs the tool loop itself (the standalone `ToolInvoker` is gone in 3.x). Define tools with `from haystack.tools import tool` on a typed, documented function. Behavior hooks (`before_tool`, `after_tool`, `on_exit` ...) go in `hooks={...}`.

### Save, test, stream

- `pipeline.dumps()` / `Pipeline.loads(yaml_text)`, and `dump`/`load` for files.
- For tests without an API key, use `MockChatGenerator`, `MockTextEmbedder` and `MockDocumentEmbedder`.
- Streaming: pass `streaming_callback=print_streaming_chunk` (from `haystack.components.generators.utils`) to the chat generator.
- Async serving: `await pipeline.run_async(data)` on the same `Pipeline` class.

### Migrating from 2.x to 3.x

| 2.x | 3.x |
|---|---|
| `OpenAIGenerator`, `HuggingFaceAPIGenerator` | `OpenAIChatGenerator` etc.; reply is a `ChatMessage`, use `.text` |
| `PromptBuilder` with optional variables | all template variables required; pass `required_variables=None` for the old behavior |
| `AsyncPipeline` | `Pipeline` (`run_async`, `stream`) |
| `from haystack.components.readers import ExtractiveReader` | `transformers-haystack` package, `TransformersExtractiveReader` |
| `SentenceTransformers*Embedder` in core | `sentence-transformers-haystack` package |
| Agent `confirmation_strategies` | `ConfirmationHook` registered under `before_tool` |

The full table is in `MIGRATION.md` of the repository.

## Examples

### Example 1: RAG over a handful of release notes

**User request:** "Index these notes and answer questions about them with OpenAI."

```python
from haystack import Pipeline, Document
from haystack.components.embedders import OpenAIDocumentEmbedder, OpenAITextEmbedder
from haystack.components.writers import DocumentWriter
from haystack.components.retrievers.in_memory import InMemoryEmbeddingRetriever
from haystack.components.builders import ChatPromptBuilder
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.dataclasses import ChatMessage
from haystack.document_stores.in_memory import InMemoryDocumentStore

store = InMemoryDocumentStore()
indexing = Pipeline()
indexing.add_component("embedder", OpenAIDocumentEmbedder())
indexing.add_component("writer", DocumentWriter(document_store=store))
indexing.connect("embedder.documents", "writer.documents")
indexing.run({"embedder": {"documents": [
    Document(content="Release 3.0 removed OpenAIGenerator in favour of OpenAIChatGenerator."),
    Document(content="Release 3.0 merged AsyncPipeline into Pipeline."),
]}})

template = [ChatMessage.from_user(
    "Answer from the documents only.\n"
    "{% for doc in documents %}- {{ doc.content }}\n{% endfor %}\nQuestion: {{ question }}")]

rag = Pipeline()
rag.add_component("embedder", OpenAITextEmbedder())
rag.add_component("retriever", InMemoryEmbeddingRetriever(document_store=store, top_k=2))
rag.add_component("prompt_builder", ChatPromptBuilder(template=template))
rag.add_component("llm", OpenAIChatGenerator(model="gpt-4o-mini"))
rag.connect("embedder.embedding", "retriever.query_embedding")
rag.connect("retriever.documents", "prompt_builder.documents")
rag.connect("prompt_builder.prompt", "llm.messages")

q = "What happened to AsyncPipeline?"
out = rag.run({"embedder": {"text": q}, "prompt_builder": {"question": q}})
print(out["llm"]["replies"][0].text)
```

**Result:** a sentence saying AsyncPipeline was merged into Pipeline in 3.0, generated from the retrieved notes.

### Example 2: Custom filter component, tested without an API key

**User request:** "Add a step that keeps only documents of one category, and test the pipeline offline."

```python
from haystack import component, Document, Pipeline

@component
class CategoryFilter:
    @component.output_types(documents=list[Document])
    def run(self, documents: list[Document], category: str):
        return {"documents": [d for d in documents if d.meta.get("category") == category]}

p = Pipeline()
p.add_component("filter", CategoryFilter())
result = p.run({"filter": {"documents": [
    Document(content="Refund policy", meta={"category": "billing"}),
    Document(content="Reset password", meta={"category": "account"})],
    "category": "billing"}})
print([d.content for d in result["filter"]["documents"]])   # ['Refund policy']
```

**Result:** `['Refund policy']`. For the full query pipeline in CI, use `MockChatGenerator()`, `MockTextEmbedder()` and `MockDocumentEmbedder()` (from `haystack.components.generators.chat` and `haystack.components.embedders`) instead of the OpenAI ones.

## Guidelines

- Missing API keys now fail at `warm_up()` (the first `run`), not at construction.
- Pipeline loading is allowlisted: `Pipeline.loads` refuses classes from modules outside `haystack` and `haystack_integrations`. For your own components pass `allowed_modules=["my_app.components"]` or set `HAYSTACK_DESERIALIZATION_ALLOWLIST`; never use `unsafe=True` on YAML you did not write.
- `InMemoryDocumentStore` is for development; use a vector database integration (Qdrant, Pinecone, Weaviate, pgvector, ...) in production, with the same embedder at index and query time.
- `Document.id` hashing changed in 3.0 for documents with metadata, so re-indexing 2.x data can create duplicates; clear and rebuild the store.
- Pin `haystack-ai` and integration versions together; integrations release independently.
- Do not use Haystack for a single prompt-and-response call; the pipeline abstraction pays off with retrieval, branching or several models.
