---
name: ragas
description: >-
  Ragas is an open-source Python framework for evaluating RAG pipelines and
  LLM applications with metrics such as faithfulness, response relevancy,
  context precision and context recall. Use when asked to evaluate or score a
  RAG system, generate a synthetic test set from documents, add RAG quality
  checks to CI, or write a custom LLM-judged metric.
license: Apache-2.0
compatibility: "Python 3.9+; an LLM judge (OpenAI key by default, other providers supported); network access for LLM calls"
metadata:
  author: terminal-skills
  version: "1.1.1"
  category: data-ai
  tags: ["rag", "evaluation", "llm-testing", "retrieval", "ai-quality"]
  repository: https://github.com/vibrantlabsai/ragas
---

# Ragas — RAG Evaluation Framework

## Overview

Ragas scores the output of a retrieval-augmented generation system with LLM-judged metrics: is the answer grounded in the retrieved text (faithfulness), does it address the question (response relevancy), did retrieval return the right passages (context precision and recall), and is it factually close to a reference answer. It can also generate a synthetic test set from your documents. Checked against ragas 0.4.3 (latest on PyPI, January 2026; the repository moved from explodinggradients to vibrantlabsai, the old URL redirects).

The API changed a lot between 0.1 and 0.4, and most online snippets use the old one. Old names you will see in outdated code and should not write: `Dataset.from_dict` with `question`/`answer`/`contexts`/`ground_truth` columns, lowercase metric objects (`faithfulness`, `context_precision`), `TestsetGenerator.from_langchain`, `simple`/`reasoning`/`multi_context` evolutions, `test_size=`. Current names are below.

## Instructions

### Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install ragas langchain-openai
export OPENAI_API_KEY=sk-...   # judge LLM; every metric costs LLM calls
```

Pitfall seen on a fresh install of 0.4.3 with the newest LangChain (1.x, `langchain-community` 0.4.x): `import ragas` fails with `ModuleNotFoundError: No module named 'langchain_community.chat_models.vertexai'`. Pinning `pip install "langchain-community<0.4" "langchain<1" "langchain-core<1" "langchain-openai<1"` made the import work. Check the release notes before pinning, as a newer ragas may already fix it.

### Data format

Each row is a single-turn sample with these fields (not the old `question`/`contexts` names):

| Field | Meaning |
|-------|---------|
| `user_input` | the question |
| `retrieved_contexts` | list of retrieved passages (strings) |
| `response` | the answer your pipeline produced |
| `reference` | the ground-truth answer (needed by recall, correctness) |

### Evaluate a dataset

`evaluate()` takes `EvaluationDataset` and metric objects from `ragas.metrics`. In 0.4 these classic metrics still work but import with a `DeprecationWarning`, because new-style metrics live in `ragas.metrics.collections` and are scored one sample at a time (next section). `evaluate()` rejects collections metrics.

```python
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from ragas import EvaluationDataset, evaluate
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.metrics import (
    Faithfulness, ResponseRelevancy,
    LLMContextPrecisionWithReference, LLMContextRecall,
)

rows = [{
    "user_input": "What is the refund policy for annual subscriptions?",
    "retrieved_contexts": [
        "Refund Policy: Annual plans are eligible for a full refund within 30 days. Monthly plans are non-refundable.",
        "Billing FAQ: Contact billing@northwind-saas.io for invoice questions.",
    ],
    "response": "Annual subscriptions can be refunded within 30 days of purchase.",
    "reference": "Annual plans get a full refund within 30 days; monthly plans cannot be refunded.",
}]

result = evaluate(
    dataset=EvaluationDataset.from_list(rows),
    metrics=[Faithfulness(), ResponseRelevancy(),
             LLMContextPrecisionWithReference(), LLMContextRecall()],
    llm=LangchainLLMWrapper(ChatOpenAI(model="gpt-4o-mini")),
    embeddings=LangchainEmbeddingsWrapper(OpenAIEmbeddings()),  # ResponseRelevancy needs embeddings
)
print(result)                    # {'faithfulness': 1.0, 'answer_relevancy': 0.97, ...} means over rows
df = result.to_pandas()          # one row per sample, one column per metric
```

`result["faithfulness"]` returns the per-row list. Column names follow each metric's `name` (for example `answer_relevancy`, `context_recall`).

### Score one sample with the newer collections API

```python
import asyncio
from openai import AsyncOpenAI
from ragas.llms import llm_factory
from ragas.metrics.collections import Faithfulness

llm = llm_factory("gpt-4o-mini", client=AsyncOpenAI())
scorer = Faithfulness(llm=llm)
res = asyncio.run(scorer.ascore(
    user_input="When was the first Super Bowl?",
    response="The first Super Bowl was played on January 15, 1967.",
    retrieved_contexts=["The first AFL-NFL World Championship Game was played on January 15, 1967."],
))
print(res.value)   # float 0..1; scorer.score(...) is the sync form
```

Each collections metric has its own argument list (`AnswerRelevancy` also takes `embeddings`; `ContextRecall` takes `reference`). Other providers go through `llm_factory(model, provider=..., client=...)`.

### Generate a test set from documents

```python
from langchain_community.document_loaders import DirectoryLoader
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.testset import TestsetGenerator

docs = DirectoryLoader("./docs/", glob="**/*.md").load()
generator = TestsetGenerator(
    llm=LangchainLLMWrapper(ChatOpenAI(model="gpt-4o")),
    embedding_model=LangchainEmbeddingsWrapper(OpenAIEmbeddings()),
)
testset = generator.generate_with_langchain_docs(docs, testset_size=50)
testset.to_pandas().to_csv("eval_testset.csv", index=False)
```

The default mix is single-hop specific (50%), multi-hop abstract (25%) and multi-hop specific (25%) queries; pass `query_distribution=` (built from `ragas.testset.synthesizers`) to change it. The output has `user_input`, `reference`, `reference_contexts` and `synthesizer_name`. It contains questions and references only: run each question through your own pipeline to fill `response` and `retrieved_contexts` before evaluating.

### Evaluate retriever and generator separately

- Retriever: `LLMContextPrecisionWithReference`, `LLMContextRecall`, `ContextEntityRecall` using only `user_input`, `retrieved_contexts`, `reference`.
- Generator with retrieval held fixed: `Faithfulness`, `ResponseRelevancy`, `FactualCorrectness`, `SemanticSimilarity` (the last two compare `response` with `reference`).

### Quality gate in CI

```python
# tests/test_rag_quality.py
import pytest
from ragas import EvaluationDataset, evaluate
from ragas.metrics import Faithfulness, LLMContextRecall

THRESHOLDS = {"faithfulness": 0.85, "context_recall": 0.75}

@pytest.fixture(scope="session")
def scores(rag_pipeline, golden_rows):
    rows = []
    for item in golden_rows:   # {"user_input": ..., "reference": ...}
        out = rag_pipeline.query(item["user_input"])
        rows.append({**item, "response": out["answer"], "retrieved_contexts": out["sources"]})
    result = evaluate(EvaluationDataset.from_list(rows),
                      metrics=[Faithfulness(), LLMContextRecall()], llm=judge_llm)
    return result.to_pandas()[list(THRESHOLDS)].mean()

@pytest.mark.parametrize("metric,minimum", THRESHOLDS.items())
def test_metric_above_threshold(scores, metric, minimum):
    assert scores[metric] >= minimum, f"{metric}={scores[metric]:.2f} < {minimum}"
```

### Custom metric

`NumericMetric` and `DiscreteMetric` wrap a prompt and return a validated value; the prompt placeholders become the keyword arguments of `score`.

```python
from openai import OpenAI
from ragas.llms import llm_factory
from ragas.metrics import DiscreteMetric

tone = DiscreteMetric(
    name="support_tone",
    prompt="Judge whether this support reply is professional and empathetic: {response}. Answer 'pass' or 'fail'.",
    allowed_values=["pass", "fail"],
)
llm = llm_factory("gpt-4o-mini", client=OpenAI())
print(tone.score(llm=llm, response="I'm sorry about the double charge. I refunded it just now.").value)
```

`ragas quickstart rag_eval -o ./rag-eval-demo` scaffolds a runnable example project.

## Examples

### Example 1: "Set up Ragas for my docs chatbot"

Request: "I have a RAG chatbot over our Markdown docs. Give me a baseline quality score."

Run `pip install ragas langchain-openai`, generate 50 questions with the test-set snippet above from `./docs/`, call the chatbot for each `user_input` to collect `response` and `retrieved_contexts`, then run `evaluate()` with the four metrics. Expected output is a one-line mean per metric, for example `{'faithfulness': 0.91, 'answer_relevancy': 0.88, 'llm_context_precision_with_reference': 0.79, 'context_recall': 0.83}`, plus `df.sort_values('faithfulness').head(10)` to read the ten worst answers first.

### Example 2: "Fail the build when answers start hallucinating"

Request: "Add a CI check so prompt changes cannot lower faithfulness below 0.85."

Commit a 40-row `golden.jsonl`, add `tests/test_rag_quality.py` from the CI section, and run `pytest tests/test_rag_quality.py` in the pipeline with `OPENAI_API_KEY` as a CI secret. A prompt change that makes the bot invent details fails with `faithfulness=0.78 < 0.85`.

## Guidelines

- Establish a baseline before changing prompts, chunking or retrievers, and compare against it.
- Metrics are LLM-judged: they cost tokens, vary between runs and depend on the judge model. Pin the judge model and average over 40+ samples; treat 0.02 differences as noise.
- Missing `reference` silently limits you to reference-free metrics (faithfulness, response relevancy); recall and correctness need it.
- Synthetic test sets are a start, not ground truth: review a sample, and mix in real user questions.
- `evaluate()` swallows per-row errors by default (`raise_exceptions=False`) and records NaN: check `df.isna().sum()` and rate limits before trusting a mean.
- Sending documents to a hosted judge LLM shares that data with the provider; use a local or private model for confidential text.
- Ragas collects anonymous usage analytics by default; set `RAGAS_DO_NOT_TRACK=true` to opt out.
- Not a fit for load testing or latency measurement; it only scores quality.
