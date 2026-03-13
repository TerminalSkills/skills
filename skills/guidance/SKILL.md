---
name: guidance
description: >-
   You are an expert in Guidance, Microsoft's library for controlling LLM
  output with constrained generation. You help developers write programs that
  interleave text generation with control flow (loops, conditionals, regex
  constraints, JSON schemas, function calls) — ensuring LLM output always
  matches the expected format by constraining the token generation process
  itself, not just prompting.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - llm
    - constrained-generation
    - grammar
    - structured-output
    - microsoft
---

# Guidance — Constrained LLM Generation

You are an expert in Guidance, Microsoft's library for controlling LLM output with constrained generation. You help developers write programs that interleave text generation with control flow (loops, conditionals, regex constraints, JSON schemas, function calls) — ensuring LLM output always matches the expected format by constraining the token generation process itself, not just prompting.

## Core Capabilities

### Constrained Generation

```python
import guidance
from guidance import models, gen, select, regex, one_or_more, zero_or_more

# Load model (local or API)
lm = models.OpenAI("gpt-4o")
# Or local: models.Transformers("meta-llama/Llama-3.1-8B-Instruct")

# Simple constrained generation
lm += f"""
Classify this review sentiment.
Review: "The product arrived damaged but customer service was great"

Sentiment: {select(["positive", "negative", "mixed", "neutral"], name="sentiment")}
Confidence: {gen(regex=r"0\.\d{2}", name="confidence")}
"""
print(lm["sentiment"])     # "mixed" — constrained to exactly these options
print(lm["confidence"])    # "0.82" — matches regex pattern exactly

# Structured extraction with loops
lm += f"""Extract all people mentioned:
Text: "Alice met Bob at the cafe. Charlie joined them later."

People:
{one_or_more(f'''
- Name: {gen(regex=r"[A-Z][a-z]+", name="names", list_append=True)}
''')}
"""
print(lm["names"])         # ["Alice", "Bob", "Charlie"]
```

### JSON Generation

```python
# Guaranteed valid JSON output
from guidance import json as gen_json
from pydantic import BaseModel

class ProductReview(BaseModel):
    product_name: str
    rating: int                           # Constrained to int
    pros: list[str]
    cons: list[str]
    recommendation: bool

lm += f"""Analyze this review and extract structured data:
Review: "The XPS 15 has an amazing display and battery life, but runs hot under load. Would buy again."

{gen_json(schema=ProductReview, name="review")}
"""

review = lm["review"]
# {"product_name": "XPS 15", "rating": 4, "pros": ["amazing display", "battery life"],
#  "cons": ["runs hot under load"], "recommendation": true}
# GUARANTEED valid JSON matching the Pydantic schema
```

### Control Flow

```python
# Branching based on LLM output
lm += f"""
Task: {user_input}

First, determine the task type: {select(["question", "command", "chitchat"], name="task_type")}
"""

if lm["task_type"] == "question":
    lm += f"""
Answer the question with evidence:
Answer: {gen(max_tokens=200, name="answer")}
Sources: {gen(regex=r"https?://\S+", name="source")}
"""
elif lm["task_type"] == "command":
    lm += f"""
Generate the command:
```bash
{gen(stop="```", name="command")}
```
Explanation: {gen(max_tokens=100, name="explanation")}
"""
else:
    lm += f"Response: {gen(max_tokens=50, name="response")}"

# Multi-step reasoning
lm += f"""
Problem: {math_problem}

Let me solve this step by step:
{one_or_more(f'''
Step {gen(regex=r"\d+", name="step_num")}: {gen(stop="\n", name="steps", list_append=True)}
''')}

Final answer: {gen(regex=r"-?\d+\.?\d*", name="answer")}
"""
```

## Installation

```bash
pip install guidance
```

## Best Practices

1. **Select for classification** — Use `select()` instead of free-form text; LLM can only output valid options
2. **Regex for format** — Use `regex=` for dates, numbers, IDs; output always matches the pattern
3. **JSON schema** — Use `gen_json(schema=...)` for structured data; impossible to generate invalid JSON
4. **Local models** — Guidance works best with local models (full token control); API models use prompt-based constraints
5. **Control flow** — Mix Python logic with generation; branch on LLM output, loop for extraction
6. **Named captures** — Use `name=` parameter to capture generated values; access with `lm["name"]`
7. **Stop tokens** — Use `stop=` to control generation boundaries; prevent runaway output
8. **List extraction** — Use `one_or_more()` with `list_append=True` for extracting variable-length lists
