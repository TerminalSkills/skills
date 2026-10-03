---
name: dspy
description: >-
  DSPy is a Python framework from Stanford NLP that replaces hand-written prompts with
  code: you declare LLM tasks as typed signatures, compose them into modules, and let
  optimizers (BootstrapFewShot, MIPROv2, GEPA) tune the prompts and few-shot examples against
  your metric. Use when the user asks about DSPy, signatures, ChainOfThought, ReAct,
  teleprompters or optimizers, or wants to stop hand-tuning prompts.
license: Apache-2.0
compatibility: "Python 3.10+; an API key for the LM provider (or a local model); checked against dspy 3.4.0"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags:
    - llm
    - prompts
    - optimization
    - python
  repository: https://github.com/stanfordnlp/dspy
---

# DSPy — Programming (Not Prompting) LLMs

## Overview

DSPy lets you describe what an LLM step takes in and returns (a signature), pick how it should run (`Predict`, `ChainOfThought`, `ReAct`), compose steps in a `dspy.Module`, and then optimize the whole program with a metric and a few examples. Models are called through LiteLLM-style identifiers such as `openai/gpt-4o-mini` or `gemini/gemini-2.5-flash`, so the same code moves between providers. This skill covers the current 3.x API; code written for 2.x (`dspy.Assert`, `dspy.Suggest`, `dspy.OpenAI(...)`, `dspy.settings.configure`) needs porting.

## Instructions

### Install and configure

```bash
pip install -U dspy
export OPENAI_API_KEY=...   # or the key of whichever provider you use
```

```python
import dspy
dspy.configure(lm=dspy.LM("openai/gpt-4o-mini"))   # global default
```

Use `with dspy.context(lm=other_lm):` to override the model for one call.

### Signatures and predictors

A signature is either a string (`"question -> answer"`) or a class with typed fields. Use `Literal[...]` or other Python types to constrain outputs. Predictors: `dspy.Predict`, `dspy.ChainOfThought` (adds a `reasoning` output field), `dspy.ReAct` (tool-using agent), `dspy.ProgramOfThought`.

### Modules

Subclass `dspy.Module`, call `super().__init__()`, create predictors in `__init__`, and write the logic in `forward`. For retrieval, `dspy.retrievers.Embeddings(embedder=..., corpus=[...], k=3)` is a local in-process retriever (needs `numpy`); `dspy.Retrieve` only works after you configure a retrieval model such as `dspy.ColBERTv2` via `dspy.configure(rm=...)`.

### Evaluate and optimize

1. Build `dspy.Example(...).with_inputs("question")` objects (inputs marked, other fields are labels).
2. Write a metric `(example, prediction, trace=None) -> bool | float`.
3. Measure the baseline with `dspy.Evaluate(devset=devset, metric=metric, num_threads=8)(program)`.
4. Optimize with a teleprompter: `BootstrapFewShot` (small data, a few dozen examples), `MIPROv2` (instructions and demos, `auto="light"|"medium"|"heavy"`), `GEPA` (reflective prompt evolution; its metric may return feedback text), `BootstrapFinetune` for weights.
5. Persist: `optimized.save("program.json")` and later `program.load("program.json")` on a freshly constructed module.

### Runtime constraints

`dspy.Assert` and `dspy.Suggest` were removed in 3.x. Use `dspy.Refine(module=..., N=3, reward_fn=fn, threshold=1.0)` (retry with feedback until the reward passes) or `dspy.BestOfN` (sample N, keep the best) instead; `reward_fn(inputs_dict, prediction)` returns a float.

## Examples

### Example 1: Sentiment classifier with typed output

**User request:** "Classify product reviews as positive, negative or neutral with a confidence score."

```python
from typing import Literal
import dspy

dspy.configure(lm=dspy.LM("openai/gpt-4o-mini"))

class ReviewSentiment(dspy.Signature):
    """Classify the sentiment of a customer review."""
    review: str = dspy.InputField()
    sentiment: Literal["positive", "negative", "neutral"] = dspy.OutputField()
    confidence: float = dspy.OutputField(desc="0.0 to 1.0")

classify = dspy.ChainOfThought(ReviewSentiment)
out = classify(review="It works but the manual is confusing")
print(out.reasoning, out.sentiment, out.confidence)
```

**Result:** a `Prediction` whose `sentiment` is one of the three literals (for example `neutral`), `confidence` is a float, and `reasoning` holds the model's step-by-step text. Prompt formatting is handled by DSPy.

### Example 2: Question answering over your docs, then optimize

**User request:** "Build a QA module over our docs and tune it on 30 labeled questions."

```python
import dspy
from dspy.teleprompt import MIPROv2

dspy.configure(lm=dspy.LM("openai/gpt-4o-mini"))
corpus = open("docs/faq.txt").read().split("\n\n")
search = dspy.retrievers.Embeddings(
    embedder=dspy.Embedder("openai/text-embedding-3-small"), corpus=corpus, k=3)

class DocsQA(dspy.Module):
    def __init__(self):
        super().__init__()
        self.answer = dspy.ChainOfThought("context, question -> answer")
    def forward(self, question):
        return self.answer(context=search(question).passages, question=question)

def metric(example, pred, trace=None):
    return example.answer.lower() in pred.answer.lower()

trainset = [dspy.Example(question=q, answer=a).with_inputs("question") for q, a in labeled[:20]]
devset = [dspy.Example(question=q, answer=a).with_inputs("question") for q, a in labeled[20:]]

evaluate = dspy.Evaluate(devset=devset, metric=metric, num_threads=8)
print("baseline", evaluate(DocsQA()).score)
tuned = MIPROv2(metric=metric, auto="light").compile(DocsQA(), trainset=trainset)
print("tuned", evaluate(tuned).score)
tuned.save("docs_qa.json")
```

**Result:** two scores (percent on the dev set) so you can see whether optimization helped, and a `docs_qa.json` holding the tuned instructions and demos.

## Guidelines

- Define the metric and a held-out dev set before optimizing; without them there is nothing to optimize against and no way to detect overfitting.
- Optimizers make many LM calls. Start with `auto="light"`, set `num_threads` carefully against rate limits, and expect a real API bill on large trainsets.
- Never hard-code API keys; DSPy reads provider variables such as `OPENAI_API_KEY`, or pass `api_key=os.environ[...]` to `dspy.LM`.
- Calls are cached on disk by default; pass `cache=False` to `dspy.LM` when benchmarking or sampling several times.
- Loading a saved program needs the same module class definition; save the code in version control with the JSON.
- Do not use DSPy for a single fixed prompt that already works; it pays off when you have a metric, data, and a pipeline of several LM steps.
- Pin the `dspy` version in production: the API moved noticeably between 2.x and 3.x.
