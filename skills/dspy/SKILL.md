---
name: dspy
description: >-
   You are an expert in DSPy, the Stanford framework that replaces prompt
  engineering with programming. You help developers define LLM tasks as typed
  signatures, compose them into modules, and automatically optimize
  prompts/few-shot examples using teleprompters — so instead of manually
  crafting prompts, you write Python code and DSPy finds the best prompts for
  your task.
category: AI & Machine Learning
tags: [llm, programming, prompts, optimization, stanford, python]
version: 1.0.0
author: terminal-skills
---

# DSPy — Programming (Not Prompting) LLMs

You are an expert in DSPy, the Stanford framework that replaces prompt engineering with programming. You help developers define LLM tasks as typed signatures, compose them into modules, and automatically optimize prompts/few-shot examples using teleprompters — so instead of manually crafting prompts, you write Python code and DSPy finds the best prompts for your task.

## Core Capabilities

### Signatures and Modules

```python
import dspy

lm = dspy.LM("openai/gpt-4o-mini")
dspy.configure(lm=lm)

# Define task as a signature (not a prompt)
class SentimentAnalysis(dspy.Signature):
    """Classify the sentiment of a review."""
    review: str = dspy.InputField()
    sentiment: str = dspy.OutputField(desc="positive, negative, or neutral")
    confidence: float = dspy.OutputField(desc="0.0 to 1.0")

# Use it
classify = dspy.Predict(SentimentAnalysis)
result = classify(review="Great product, fast shipping!")
print(result.sentiment)     # "positive"
print(result.confidence)    # 0.95

# Chain of Thought (automatic reasoning)
classify_cot = dspy.ChainOfThought(SentimentAnalysis)
result = classify_cot(review="It works but the manual is confusing")
print(result.reasoning)     # Shows step-by-step reasoning
print(result.sentiment)     # "neutral"
```

### Composable Modules

```python
class RAGModule(dspy.Module):
    def __init__(self, num_passages=3):
        self.retrieve = dspy.Retrieve(k=num_passages)
        self.generate = dspy.ChainOfThought("context, question -> answer")

    def forward(self, question):
        context = self.retrieve(question).passages
        return self.generate(context=context, question=question)

rag = RAGModule()
answer = rag(question="What is DSPy?")

# Multi-hop reasoning
class MultiHop(dspy.Module):
    def __init__(self):
        self.generate_query = dspy.ChainOfThought("context, question -> search_query")
        self.retrieve = dspy.Retrieve(k=3)
        self.generate_answer = dspy.ChainOfThought("context, question -> answer")

    def forward(self, question):
        context = []
        for _ in range(2):  # 2 hops
            query = self.generate_query(context=context, question=question).search_query
            passages = self.retrieve(query).passages
            context = deduplicate(context + passages)
        return self.generate_answer(context=context, question=question)
```

### Automatic Optimization

```python
from dspy.teleprompt import BootstrapFewShot

# Training data
trainset = [
    dspy.Example(question="What is Python?", answer="A programming language").with_inputs("question"),
    dspy.Example(question="Who created Linux?", answer="Linus Torvalds").with_inputs("question"),
]

# Metric
def accuracy(example, prediction, trace=None):
    return example.answer.lower() in prediction.answer.lower()

# Optimize — finds best few-shot examples and instructions
teleprompter = BootstrapFewShot(metric=accuracy, max_bootstrapped_demos=4)
optimized_rag = teleprompter.compile(RAGModule(), trainset=trainset)

# optimized_rag now has automatically selected few-shot examples
# that maximize accuracy — no manual prompt engineering
```

## Installation

```bash
pip install dspy
```

## Best Practices

1. **Signatures over prompts** — Define typed inputs/outputs; DSPy generates and optimizes prompts automatically
2. **ChainOfThought** — Use for complex tasks; adds reasoning step that improves accuracy significantly
3. **Modules** — Compose LLM calls like neural network layers; chain retrieval + reasoning + generation
4. **Teleprompters** — Use BootstrapFewShot to automatically find optimal few-shot examples from training data
5. **Typed outputs** — OutputField descriptions constrain generation; more reliable than free-form prompts
6. **Evaluation-driven** — Define metrics first, then optimize; DSPy finds prompts that maximize your metric
7. **Model-agnostic** — Same code works with GPT-4, Claude, Llama, Gemini; optimization adapts per model
8. **Assertions** — Use `dspy.Assert` and `dspy.Suggest` for runtime output validation and self-correction
