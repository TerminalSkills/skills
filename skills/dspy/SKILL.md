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
    - rag
---

# DSPy

Build LLM pipelines that optimize themselves. DSPy replaces hand-written prompts with declarative signatures and uses optimizers to find the best prompting strategy automatically.

## Core Concept

Traditional approach: manually write and tweak prompts, hope they work, iterate by hand.

DSPy approach: define WHAT you want (input → output signature), let the optimizer figure out HOW to prompt the LLM.

```
Traditional:  prompt engineering → manual iteration → fragile prompts
DSPy:         signature → module → optimizer → robust pipeline
```

## Installation

```bash
pip install dspy-ai
# or
pip install dspy  # v2.5+
```

## Signatures

A signature declares the input/output contract — what goes in, what comes out:

```python
# signatures.py
# DSPy signatures define the contract between you and the LLM

import dspy

# Simple signature — just input and output field names
# DSPy infers the prompt from field names and descriptions
classify = dspy.Predict("text -> sentiment: str")

# Signature with descriptions for better optimization
class ExtractEntities(dspy.Signature):
    """Extract named entities from text."""
    
    text: str = dspy.InputField(desc="Raw text to analyze")
    entities: list[str] = dspy.OutputField(desc="List of named entities found")

# Multi-step signature
class AnswerWithEvidence(dspy.Signature):
    """Answer a question with supporting evidence."""
    
    context: str = dspy.InputField(desc="Background information")
    question: str = dspy.InputField(desc="Question to answer")
    reasoning: str = dspy.OutputField(desc="Step-by-step reasoning")
    answer: str = dspy.OutputField(desc="Final answer")
    confidence: float = dspy.OutputField(desc="Confidence score 0-1")
```

## Modules

Modules are the building blocks — each one wraps a signature with a strategy (predict, chain-of-thought, react, etc.):

```python
# modules.py
# DSPy modules wrap signatures with prompting strategies

import dspy

# Basic prediction — just answer
predictor = dspy.Predict("question -> answer")

# Chain of Thought — reason step by step before answering
cot = dspy.ChainOfThought("question -> answer")

# ReAct — reason + act (use tools) in a loop
react = dspy.ReAct("question -> answer", tools=[search, calculate])

# Program of Thought — generate and execute code to answer
pot = dspy.ProgramOfThought("question -> answer")
```

### Building a pipeline

```python
# pipeline.py
# Multi-step DSPy pipeline for RAG (Retrieval-Augmented Generation)

import dspy

class RAGPipeline(dspy.Module):
    """Retrieve relevant context and answer questions.
    
    Steps:
    1. Generate search queries from the question
    2. Retrieve relevant documents
    3. Answer using retrieved context with chain-of-thought
    """
    
    def __init__(self, num_passages: int = 3):
        super().__init__()
        self.num_passages = num_passages
        
        # Module 1: Generate search query from question
        self.generate_query = dspy.ChainOfThought(
            "question -> search_query: str"
        )
        
        # Module 2: Retrieve documents (uses configured retriever)
        self.retrieve = dspy.Retrieve(k=num_passages)
        
        # Module 3: Answer with evidence
        self.answer = dspy.ChainOfThought(
            "context, question -> reasoning, answer"
        )
    
    def forward(self, question: str):
        """Run the full RAG pipeline.
        
        Args:
            question: User's question
        
        Returns:
            Prediction with answer and reasoning
        """
        # Step 1: Generate optimized search query
        query = self.generate_query(question=question)
        
        # Step 2: Retrieve relevant passages
        passages = self.retrieve(query.search_query)
        context = "\n\n".join(passages.passages)
        
        # Step 3: Answer with chain-of-thought reasoning
        result = self.answer(context=context, question=question)
        
        return result
```

## Optimizers

Optimizers automatically improve your pipeline by finding the best prompts, few-shot examples, or fine-tuning parameters:

```python
# optimization.py
# Use DSPy optimizers to automatically improve pipeline quality

import dspy
from dspy.evaluate import Evaluate

# Configure LLM
lm = dspy.LM("openai/gpt-4o-mini")
dspy.configure(lm=lm)

# Define your pipeline
rag = RAGPipeline(num_passages=3)

# Define evaluation metric
def answer_quality(example, prediction, trace=None):
    """Score answer quality.
    
    Args:
        example: Gold standard example with expected answer
        prediction: Model's prediction
        trace: Optional execution trace
    
    Returns:
        Float score 0-1
    """
    # Simple exact match (use semantic similarity for production)
    return float(prediction.answer.lower().strip() == 
                 example.answer.lower().strip())

# Load training examples
trainset = [
    dspy.Example(
        question="What is the capital of France?",
        answer="Paris"
    ).with_inputs("question"),
    # ... more examples (10-50 is usually enough)
]

# Option 1: BootstrapFewShot — finds the best few-shot examples
optimizer = dspy.BootstrapFewShot(
    metric=answer_quality,
    max_bootstrapped_demos=4,  # Max few-shot examples to include
    max_labeled_demos=4,       # Max labeled examples to try
    max_rounds=2               # Optimization rounds
)
optimized_rag = optimizer.compile(rag, trainset=trainset)

# Option 2: MIPROv2 — optimizes prompts + examples jointly
optimizer = dspy.MIPROv2(
    metric=answer_quality,
    num_candidates=10,   # Prompt candidates to try
    init_temperature=0.7 # Exploration temperature
)
optimized_rag = optimizer.compile(rag, trainset=trainset)

# Option 3: BootstrapFewShotWithRandomSearch
optimizer = dspy.BootstrapFewShotWithRandomSearch(
    metric=answer_quality,
    max_bootstrapped_demos=4,
    num_candidate_programs=16,  # Random search candidates
    num_threads=4               # Parallel evaluation
)
optimized_rag = optimizer.compile(rag, trainset=trainset)
```

## Evaluation

```python
# evaluation.py
# Systematic evaluation of DSPy pipelines

from dspy.evaluate import Evaluate

# Create evaluator
evaluator = Evaluate(
    devset=testset,          # Held-out test examples
    metric=answer_quality,
    num_threads=4,
    display_progress=True,
    display_table=5          # Show 5 example results
)

# Evaluate baseline
baseline_score = evaluator(rag)
print(f"Baseline: {baseline_score:.1%}")

# Evaluate optimized version
optimized_score = evaluator(optimized_rag)
print(f"Optimized: {optimized_score:.1%}")

# Compare different optimizers
for name, program in [("baseline", rag), ("bootstrap", opt1), ("mipro", opt2)]:
    score = evaluator(program)
    print(f"{name}: {score:.1%}")
```

## Saving and Loading

```python
# persistence.py
# Save optimized pipelines for production deployment

# Save the optimized program
optimized_rag.save("optimized_rag_v1.json")

# Load it later
loaded_rag = RAGPipeline(num_passages=3)
loaded_rag.load("optimized_rag_v1.json")

# The loaded program has all the optimized prompts and examples
result = loaded_rag(question="What is quantum computing?")
```

## Common Patterns

### Classification pipeline

```python
class TextClassifier(dspy.Module):
    """Multi-label text classifier with explanation."""
    
    def __init__(self, categories: list[str]):
        super().__init__()
        self.categories = categories
        self.classify = dspy.ChainOfThought(
            "text, categories -> reasoning, label: str, confidence: float"
        )
    
    def forward(self, text: str):
        return self.classify(
            text=text,
            categories=", ".join(self.categories)
        )
```

### Multi-hop question answering

```python
class MultiHopQA(dspy.Module):
    """Answer complex questions that require multiple retrieval steps."""
    
    def __init__(self, num_hops: int = 2, passages_per_hop: int = 3):
        super().__init__()
        self.num_hops = num_hops
        self.generate_query = [
            dspy.ChainOfThought("context, question -> search_query")
            for _ in range(num_hops)
        ]
        self.retrieve = dspy.Retrieve(k=passages_per_hop)
        self.answer = dspy.ChainOfThought("context, question -> answer")
    
    def forward(self, question: str):
        context = []
        for i in range(self.num_hops):
            query = self.generate_query[i](
                context="\n".join(context),
                question=question
            )
            passages = self.retrieve(query.search_query)
            context.extend(passages.passages)
        
        return self.answer(
            context="\n\n".join(context),
            question=question
        )
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
