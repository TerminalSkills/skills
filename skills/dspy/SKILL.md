---
name: dspy
description: >-
  Build self-optimizing LLM pipelines with DSPy — declarative prompt programming,
  automatic prompt optimization, and modular AI workflows. Use when tasks involve
  building LLM pipelines that self-improve, optimizing prompts systematically
  instead of manually, chaining LLM calls with typed signatures, evaluating and
  comparing prompt strategies, or building retrieval-augmented generation (RAG)
  systems with automatic tuning. Covers DSPy modules, optimizers, and evaluation.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags:
    - dspy
    - llm
    - prompt-engineering
    - optimization
    - ai-pipeline
---

# DSPy

## Overview

Build LLM pipelines that optimize themselves. DSPy replaces hand-written prompts with declarative signatures and uses optimizers to find the best prompting strategy automatically.

## Instructions

### Core concept

Traditional approach: manually write and tweak prompts, iterate by hand. DSPy approach: define WHAT you want (input → output signature), let the optimizer figure out HOW to prompt the LLM.

```bash
pip install dspy  # v2.5+
```

### Signatures

A signature declares the input/output contract:

```python
import dspy

# Simple inline signature
classify = dspy.Predict("text -> sentiment: str")

# Typed signature with descriptions
class AnswerWithEvidence(dspy.Signature):
    """Answer a question with supporting evidence."""
    context: str = dspy.InputField(desc="Background information")
    question: str = dspy.InputField(desc="Question to answer")
    reasoning: str = dspy.OutputField(desc="Step-by-step reasoning")
    answer: str = dspy.OutputField(desc="Final answer")
    confidence: float = dspy.OutputField(desc="Confidence score 0-1")
```

### Modules

Modules wrap signatures with prompting strategies:

```python
predictor = dspy.Predict("question -> answer")         # Basic
cot = dspy.ChainOfThought("question -> answer")        # Reason step-by-step
react = dspy.ReAct("question -> answer", tools=[...])  # Reason + act with tools
pot = dspy.ProgramOfThought("question -> answer")      # Generate + execute code
```

### Building a pipeline

```python
# RAG pipeline: retrieve context, then answer with chain-of-thought

class RAGPipeline(dspy.Module):
    def __init__(self, num_passages: int = 3):
        super().__init__()
        self.generate_query = dspy.ChainOfThought("question -> search_query: str")
        self.retrieve = dspy.Retrieve(k=num_passages)
        self.answer = dspy.ChainOfThought("context, question -> reasoning, answer")

    def forward(self, question: str):
        query = self.generate_query(question=question)
        passages = self.retrieve(query.search_query)
        context = "\n\n".join(passages.passages)
        return self.answer(context=context, question=question)
```

### Optimizers

Optimizers automatically improve your pipeline:

```python
import dspy

lm = dspy.LM("openai/gpt-4o-mini")
dspy.configure(lm=lm)

rag = RAGPipeline(num_passages=3)

def answer_quality(example, prediction, trace=None):
    return float(prediction.answer.lower().strip() == example.answer.lower().strip())

trainset = [
    dspy.Example(question="What is the capital of France?", answer="Paris").with_inputs("question"),
    # 10-50 examples is usually enough
]

# Option 1: BootstrapFewShot — finds best few-shot examples
optimizer = dspy.BootstrapFewShot(metric=answer_quality, max_bootstrapped_demos=4)
optimized = optimizer.compile(rag, trainset=trainset)

# Option 2: MIPROv2 — optimizes prompts + examples jointly
optimizer = dspy.MIPROv2(metric=answer_quality, num_candidates=10)
optimized = optimizer.compile(rag, trainset=trainset)

# Option 3: BootstrapFewShotWithRandomSearch
optimizer = dspy.BootstrapFewShotWithRandomSearch(
    metric=answer_quality, max_bootstrapped_demos=4, num_candidate_programs=16
)
optimized = optimizer.compile(rag, trainset=trainset)
```

### Evaluation

```python
from dspy.evaluate import Evaluate

evaluator = Evaluate(devset=testset, metric=answer_quality, num_threads=4)
baseline_score = evaluator(rag)
optimized_score = evaluator(optimized)
print(f"Baseline: {baseline_score:.1%} → Optimized: {optimized_score:.1%}")
```

### Saving and loading

```python
optimized.save("optimized_rag_v1.json")

loaded = RAGPipeline(num_passages=3)
loaded.load("optimized_rag_v1.json")
```

### Common patterns

**Classification pipeline:**

```python
class TextClassifier(dspy.Module):
    def __init__(self, categories: list[str]):
        super().__init__()
        self.categories = categories
        self.classify = dspy.ChainOfThought(
            "text, categories -> reasoning, label: str, confidence: float"
        )

    def forward(self, text: str):
        return self.classify(text=text, categories=", ".join(self.categories))
```

**Multi-hop question answering:**

```python
class MultiHopQA(dspy.Module):
    def __init__(self, num_hops: int = 2, passages_per_hop: int = 3):
        super().__init__()
        self.generate_query = [
            dspy.ChainOfThought("context, question -> search_query")
            for _ in range(num_hops)
        ]
        self.retrieve = dspy.Retrieve(k=passages_per_hop)
        self.answer = dspy.ChainOfThought("context, question -> answer")

    def forward(self, question: str):
        context = []
        for hop in self.generate_query:
            query = hop(context="\n".join(context), question=question)
            context.extend(self.retrieve(query.search_query).passages)
        return self.answer(context="\n\n".join(context), question=question)
```

## Examples

### Build a self-optimizing RAG system

```prompt
Build a RAG pipeline with DSPy that answers questions about our documentation. Use ChromaDB for retrieval, GPT-4o-mini as the LLM, and chain-of-thought reasoning. Create 20 evaluation examples, optimize with MIPROv2, and compare before/after accuracy. Save the optimized pipeline for production.
```

### Create an optimized text classifier

```prompt
Build a support ticket classifier with DSPy that categorizes tickets into: bug, feature_request, billing, account, and general. Use 50 labeled examples for optimization, compare BootstrapFewShot vs MIPROv2 optimizers, and deploy the best version. Include confidence scores and handle ambiguous cases.
```

### Build a multi-step research agent

```prompt
Create a DSPy pipeline that takes a research question, generates multiple search queries, retrieves information, synthesizes findings, and produces a structured research brief with citations. Optimize the pipeline to maximize factual accuracy and citation quality using 30 evaluation examples.
```

## Guidelines

- Start with ChainOfThought as the default module — it outperforms basic Predict in most cases
- Use 10-50 labeled examples for optimization; more isn't always better
- Compare multiple optimizers (BootstrapFewShot, MIPROv2) and pick the best for your task
- Always evaluate on a held-out test set, not the training set used for optimization
- Save optimized pipelines to JSON for reproducible production deployment
- Use typed signatures with field descriptions for better optimization results
- When building multi-hop pipelines, limit hops to 2-3 to avoid compounding errors
