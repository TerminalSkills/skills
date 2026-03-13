---
name: haystack
description: >-
   You are an expert in Haystack, the open-source framework by deepset for
  building production RAG pipelines and LLM applications. You help developers
  create composable pipelines with document stores, retrievers, readers,
  generators, and custom components — connecting to 20+ LLM providers and
  vector databases with a pipeline-as-code approach.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - rag
    - pipeline
    - nlp
    - search
    - retrieval
    - deepset
    - python
---

# Haystack — LLM Application Framework by deepset

You are an expert in Haystack, the open-source framework by deepset for building production RAG pipelines and LLM applications. You help developers create composable pipelines with document stores, retrievers, readers, generators, and custom components — connecting to 20+ LLM providers and vector databases with a pipeline-as-code approach.

## Core Capabilities

### RAG Pipeline

```python
from haystack import Pipeline
from haystack.components.embedders import OpenAIDocumentEmbedder, OpenAITextEmbedder
from haystack.components.writers import DocumentWriter
from haystack.components.retrievers.in_memory import InMemoryEmbeddingRetriever
from haystack.components.generators import OpenAIGenerator
from haystack.components.builders import PromptBuilder
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack import Document

store = InMemoryDocumentStore()

# Indexing pipeline
indexing = Pipeline()
indexing.add_component("embedder", OpenAIDocumentEmbedder())
indexing.add_component("writer", DocumentWriter(document_store=store))
indexing.connect("embedder", "writer")

docs = [Document(content="Haystack supports 20+ LLM providers..."), Document(content="Pipelines are composable...")]
indexing.run({"embedder": {"documents": docs}})

# Query pipeline
template = """Given these documents, answer the question.
Documents: {% for doc in documents %}{{ doc.content }}{% endfor %}
Question: {{ question }}
Answer:"""

rag = Pipeline()
rag.add_component("embedder", OpenAITextEmbedder())
rag.add_component("retriever", InMemoryEmbeddingRetriever(document_store=store))
rag.add_component("prompt", PromptBuilder(template=template))
rag.add_component("llm", OpenAIGenerator(model="gpt-4o"))
rag.connect("embedder.embedding", "retriever.query_embedding")
rag.connect("retriever", "prompt.documents")
rag.connect("prompt", "llm")

result = rag.run({"embedder": {"text": "What providers does Haystack support?"}, "prompt": {"question": "What providers?"}})
print(result["llm"]["replies"][0])
```

### Custom Components

```python
from haystack import component

@component
class MetadataFilter:
    @component.output_types(documents=list[Document])
    def run(self, documents: list[Document], category: str):
        return {"documents": [d for d in documents if d.meta.get("category") == category]}
```

## Installation

```bash
pip install haystack-ai
```

## Best Practices

1. **Pipeline-as-code** — Connect components explicitly; clear data flow, easy debugging
2. **Document stores** — InMemory for dev, Qdrant/Pinecone/Weaviate for production
3. **PromptBuilder** — Jinja2 templates for dynamic prompts; inject documents, history, metadata
4. **Custom components** — Use `@component` decorator; define inputs/outputs, Haystack handles wiring
5. **Branching** — Pipelines support conditional routing; different paths based on query type
6. **Serialization** — `pipeline.dumps()` / `Pipeline.loads()` for saving/loading pipeline configs
7. **Evaluation** — Built-in eval components for faithfulness, relevance, answer correctness
8. **Streaming** — Use `OpenAIGenerator(streaming_callback=...)` for real-time token delivery
