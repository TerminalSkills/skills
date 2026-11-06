---
title: "Build an LLM Evaluation and Model Comparison Pipeline"
slug: build-llm-evaluation-and-comparison-pipeline
description: "Systematically test prompts across multiple models to find the best cost-quality tradeoff before committing to a provider for production."
skills:
  - langgraph
  - langsmith
category: data-ai
tags:
  - llm-evaluation
  - langgraph
  - langsmith
  - model-comparison
  - prompt-testing
---

# Build an LLM Evaluation and Model Comparison Pipeline

## The Problem

A startup building an AI-powered legal document reviewer has used the same model for a year. They chose it because it was the best option at the time, but several providers have shipped newer models since, and the model they use may be retired on the provider's schedule anyway. Switching is risky: they do not know whether another model will handle their edge cases (contract clauses with nested conditions, ambiguous liability language, multi-jurisdiction compliance). They need to run the same test suite against several models, compare quality, latency and cost side by side, and catch regressions before they reach users, without a month of manual comparison.

## The Solution

Use the **langsmith** skill to hold the evaluation dataset, trace every model call and store each run as an experiment, and the **langgraph** skill to build one graph that sends each test case to every candidate model in parallel. Model ids are read from environment variables, so the same pipeline works when the provider lineup changes.

## Step-by-Step Walkthrough

### 1. Build the evaluation dataset in LangSmith

Create a curated test suite from real (redacted) legal documents with known-correct outputs that cover normal cases, edge cases and adversarial inputs.

> Set `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` from the environment. Create a LangSmith dataset called "legal-doc-review-v2" with `client.create_dataset` and `client.create_examples`, using 150 cases from our production data: standard clauses (80), edge cases such as ambiguous language, nested conditions and multi-party agreements (50), and adversarial inputs designed to trigger confident wrong answers (20). Pass them as `examples=[{"inputs": {"document": ...}, "outputs": {"classification": ..., "key_terms": [...]}, "split": "edge"}, ...]` to `create_examples`, with `split` set to `standard`, `edge` or `adversarial`.

Overweighting edge cases (a third of the dataset here, a smaller share of production) stresses the models on the cases that matter most. A model that scores 95% on easy cases but 60% on edge cases is worse in practice than one scoring 90% on both.

### 2. Build the multi-model evaluation graph with LangGraph

Create a LangGraph graph with one node per candidate model. Several edges out of `START` make the nodes run in parallel, and a reducer on `answers` merges what each node returns.

> Build a LangGraph `StateGraph` with a node for each model in `MODELS`, all started from `START` and ending at `END`, using the same system prompt and temperature 0. Create each model with `init_chat_model("provider:model")`. Wrap the graph in a `target` function, write one evaluator that returns an `accuracy_<model>` score per model, and run it with `langsmith.evaluate`.

```python
import os
from typing import Annotated, TypedDict
from langchain.chat_models import init_chat_model
from langgraph.graph import StateGraph, START, END
from langsmith import evaluate

# "provider:model" ids come from the environment, so nothing is pinned to a retired model name
MODELS = {
    "model_a": os.environ.get("EVAL_MODEL_A", "openai:placeholder"),
    "model_b": os.environ.get("EVAL_MODEL_B", "anthropic:placeholder"),
    "model_c": os.environ.get("EVAL_MODEL_C", "google_genai:placeholder"),
}
SYSTEM = "Classify the contract clause and list its key terms. Reply as JSON."

def merge(left: dict, right: dict) -> dict:  # reducer: parallel nodes each add one key
    return {**left, **right}

class EvalState(TypedDict):
    document: str
    answers: Annotated[dict[str, str], merge]

def make_node(name: str, model_id: str):
    llm = init_chat_model(model_id, temperature=0)
    def node(state: EvalState) -> dict:
        reply = llm.invoke([("system", SYSTEM), ("human", state["document"])])
        return {"answers": {name: reply.content}}
    node.__name__ = name
    return node

builder = StateGraph(EvalState)
for name, model_id in MODELS.items():
    builder.add_node(name, make_node(name, model_id))
    builder.add_edge(START, name)   # several edges out of START = parallel branches
    builder.add_edge(name, END)
graph = builder.compile()

def target(inputs: dict) -> dict:
    return graph.invoke({"document": inputs["document"], "answers": {}})["answers"]

def accuracy(outputs: dict, reference_outputs: dict) -> dict:
    expected = reference_outputs["classification"].lower()
    return {"results": [
        {"key": f"accuracy_{name}", "score": float(expected in str(text).lower())}
        for name, text in outputs.items()
    ]}

if __name__ == "__main__":
    evaluate(target, data="legal-doc-review-v2", evaluators=[accuracy],
             experiment_prefix="model-comparison", max_concurrency=4)
```

Every model gets the same prompt, so differences in output reflect the model, not prompt tuning. Set `EVAL_MODEL_A`, `EVAL_MODEL_B` and `EVAL_MODEL_C` to the `provider:model` ids you want to compare (the provider packages, such as `langchain-openai`, `langchain-anthropic` or `langchain-google-genai`, must be installed). Check the model ids against each provider's current model list before a run, since retired ids fail at call time.

### 3. Run the evaluation and compare in LangSmith

Run `python evalgraph.py`. LangSmith records one experiment with a trace per test case; each model node is a child run with its own latency and token usage.

> Run the graph against the full dataset. In LangSmith, open the experiment and compare the `accuracy_*` feedback columns per model, compare the dataset splits (or re-run on `splits=["edge"]`) to get edge-case accuracy, and read latency and token cost from the per-node runs. Add a second evaluator for hallucination if you need one (an LLM-as-judge evaluator with temperature 0; spot-check its verdicts by hand). Open the test cases where the models' scores differ: those are the most informative.

The disagreement cases are the most valuable part of the dataset for later prompt work. To compare two experiments (for example the same model before and after a prompt change), use the compare view in the UI, or `evaluate_comparative` from `langsmith.evaluation`, which takes a pair of experiments and a pairwise evaluator you write.

### 4. Catch regressions in CI

Run the same evaluation from your CI system and fail the build when a score drops. LangSmith's alerts watch tracing projects (error rate, latency, feedback scores on live traffic), not experiments, so the experiment check lives in CI.

> Add a pytest test that runs `evaluate` on the dataset, reads `results.to_pandas()`, and asserts that each `feedback.accuracy_<model>` mean for the model you ship is at or above an agreed floor and run it a second time with `data=client.list_examples(dataset_name="legal-doc-review-v2", splits=["edge"])` for a separate edge-case floor. Trigger it from CI on every pull request that touches prompts or model configuration, and on a weekly `schedule:` cron so a silent change in a provider's model alias shows up. Pin model versions where the provider offers dated ids, since an alias can change underneath you.

Track cost and latency next to accuracy: a model update that improves accuracy but doubles token usage may not be an overall win.

## Real-World Example

The example legal-tech team runs the 150-case suite across three candidate models plus the incumbent. The overall scores are close, but the split comparison shows the models split on different clause types: one is better on nested conditions, another on multi-jurisdiction cases. The team picks the best overall model as primary, routes the clause types where another model is clearly ahead to it, and keeps the weekly CI run so a changed alias or a new release is caught by the numbers instead of by a customer. (All figures from such a run are the team's own and depend on the models, prompt and data; do not reuse them.)

## Tips

- Overweight edge cases in the dataset; they are where models diverge most and where failures matter most.
- Run every model with the same prompt, temperature and few-shot examples.
- Track the disagreement cases separately over time; when a model update resolves one, the provider improved on that capability.
- Keep model ids in configuration, not code, so swapping a retired model is a one-line change.

## Related Skills

- **langsmith** -- stores the dataset, traces every model call and records each run as an experiment for comparison
- **langgraph** -- fans each test case out to all candidate models in parallel
