---
name: ai-scientist
description: >-
  Build AI agents that automate scientific research — hypothesis generation, experiment design,
  data analysis, and paper writing using agentic tree search. Use when: automating research
  workflows, generating and testing hypotheses, building AI-powered research assistants.
license: Apache-2.0
compatibility: "Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: research
  tags:
    - research
    - science
    - hypothesis
    - experiment
    - automation
---

# AI Scientist

Build AI agents that automate scientific research using [AI-Scientist-v2](https://github.com/SakanaAI/AI-Scientist-v2) — an agentic tree search framework for hypothesis generation, experiment design, data analysis, and paper writing.

## Overview

AI Scientist explores research problems as a tree search: generate candidate hypotheses, evaluate them based on evidence and feasibility, design experiments for promising branches, and prune dead ends. It covers the full research lifecycle from literature review through paper drafting.

## Instructions

### Installation

```bash
pip install ai-scientist
```

Set up API key:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."  # or OPENAI_API_KEY
```

### Define a Research Problem

```python
from ai_scientist import Researcher

researcher = Researcher(
    model="claude-sonnet-4-20250514",
    domain="machine-learning",
)

result = researcher.investigate(
    question="How does data augmentation affect few-shot learning performance?",
    max_depth=3,
    max_hypotheses=5,
    budget_hours=2,
)

print(result.best_hypothesis)
print(result.evidence_summary)
print(result.suggested_experiments)
```

### Hypothesis Generation

```python
from ai_scientist import HypothesisGenerator

generator = HypothesisGenerator(model="claude-sonnet-4-20250514")

hypotheses = generator.generate(
    context="Recent work shows transformers struggle with compositional generalization",
    num_hypotheses=5,
    constraints=[
        "Must be testable with existing benchmarks",
        "Should suggest a concrete architectural modification",
    ],
)

for h in hypotheses:
    print(f"Hypothesis: {h.statement}")
    print(f"Novelty: {h.novelty:.2f}, Feasibility: {h.feasibility:.2f}")
    print(f"Test approach: {h.test_plan}")
```

### Experiment Design

```python
from ai_scientist import ExperimentDesigner

designer = ExperimentDesigner(model="claude-sonnet-4-20250514")

experiment = designer.design(
    hypothesis="Adding a symbolic reasoning layer improves compositional generalization",
    resources={
        "compute": "4x A100 GPUs",
        "time": "48 hours",
        "datasets": ["COGS", "SCAN", "CFQ"],
    },
)

print(experiment.methodology)
print(experiment.variables)
print(experiment.metrics)
print(experiment.code_outline)
```

### Result Analysis

```python
from ai_scientist import ResultAnalyzer

analyzer = ResultAnalyzer(model="claude-sonnet-4-20250514")

analysis = analyzer.analyze(
    hypothesis="Symbolic reasoning layer improves compositional generalization",
    results_path="./experiment_results/",
    metrics=["accuracy", "generalization_gap", "training_time"],
)

print(analysis.supports_hypothesis)
print(analysis.key_findings)
print(analysis.next_steps)
```

### Literature Review

```python
from ai_scientist import LiteratureReviewer

reviewer = LiteratureReviewer(model="claude-sonnet-4-20250514")

review = reviewer.review(
    topic="Compositional generalization in neural networks",
    sources=["arxiv", "semantic-scholar"],
    max_papers=50,
)

print(review.summary)
print(review.research_gaps)
print(review.taxonomy)
```

### Paper Writing

```python
from ai_scientist import PaperWriter

writer = PaperWriter(model="claude-sonnet-4-20250514")

paper = writer.draft(
    title="Symbolic Reasoning Layers for Compositional Generalization",
    sections=["abstract", "introduction", "related-work", "method",
              "experiments", "results", "discussion", "conclusion"],
    results=analysis,
    literature=review,
    style="neurips",
)

paper.save("draft.tex")
```

## Examples

### Example 1: End-to-End Research on RAG for Code Generation

```python
from ai_scientist import ResearchPipeline

pipeline = ResearchPipeline(
    model="claude-sonnet-4-20250514",
    output_dir="./research_output/",
)

result = pipeline.run(
    question="Can retrieval-augmented generation reduce hallucination in code generation?",
    stages=["literature-review", "hypothesis-generation", "experiment-design",
            "result-analysis", "paper-draft"],
    config={"tree_search_depth": 3, "hypotheses_per_level": 4, "auto_prune_threshold": 0.3},
)

print(f"Hypotheses explored: {result.total_hypotheses}")
print(f"Experiments designed: {result.total_experiments}")
print(f"Best finding: {result.top_finding}")
print(f"Paper draft: {result.paper_path}")
```

### Example 2: Quick Hypothesis Screening for Few-Shot Learning

```python
from ai_scientist import Researcher

researcher = Researcher(model="claude-sonnet-4-20250514", domain="machine-learning")

result = researcher.investigate(
    question="Does contrastive pre-training improve few-shot classification on medical images?",
    max_depth=2,
    max_hypotheses=3,
    budget_hours=1,
)

for h in result.all_hypotheses:
    print(f"{h.statement} — score: {h.score:.2f}, pruned: {h.pruned}")
print(f"Best: {result.best_hypothesis.statement}")
```

## Guidelines

- Start with `max_depth=2` and `max_hypotheses=3` to get quick results before scaling up
- Use domain-specific constraints in hypothesis generation — unconstrained search wastes compute
- The pruning threshold (`auto_prune_threshold`) controls exploration vs exploitation — lower values explore more
- Literature review works best with `semantic-scholar` for ML papers and `pubmed` for bio/medical
- Always review generated hypotheses and papers — the agent is a research accelerator, not a replacement
- For reproducibility, set `seed` in the pipeline config
- Tree search depth beyond 4 rarely improves results but significantly increases cost
