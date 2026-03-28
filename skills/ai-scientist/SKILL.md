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
  category: ai-tools
  tags:
    - research
    - science
    - hypothesis
    - experiment
    - tree-search
    - automation
    - sakana
  use-cases:
    - "Build an agent that generates hypotheses and designs experiments to test them"
    - "Automate literature review and research synthesis"
    - "Create a research assistant that explores solution spaces via tree search"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# AI Scientist

Build AI agents that automate scientific research using [AI-Scientist-v2](https://github.com/SakanaAI/AI-Scientist-v2) — an agentic tree search framework for hypothesis generation, experiment design, data analysis, and paper writing.

## Core Concept: Agentic Tree Search

AI Scientist explores research problems as a tree:

```
         [Research Question]
        /        |          \
   [Hyp A]    [Hyp B]    [Hyp C]
   /    \        |        /    \
[Exp1] [Exp2]  [Exp3]  [Exp4] [Exp5]
  ↓      ↓       ↓       ↓      ↓
[Results → Evaluate → Expand best → Prune dead ends]
```

**Explore** → Generate candidate hypotheses  
**Evaluate** → Score based on evidence and feasibility  
**Expand** → Design experiments for promising hypotheses  
**Prune** → Discard low-potential branches early  

## Installation

```bash
pip install ai-scientist
```

Set up API key:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."  # or OPENAI_API_KEY
```

## Basic Usage

### Define a Research Problem

```python
from ai_scientist import Researcher

researcher = Researcher(
    model="claude-sonnet-4-20250514",
    domain="machine-learning",
)

result = researcher.investigate(
    question="How does data augmentation affect few-shot learning performance?",
    max_depth=3,        # Tree search depth
    max_hypotheses=5,   # Candidates per level
    budget_hours=2,     # Compute budget
)

print(result.best_hypothesis)
print(result.evidence_summary)
print(result.suggested_experiments)
```

## Hypothesis Generation

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
    print(f"Novelty score: {h.novelty:.2f}")
    print(f"Feasibility: {h.feasibility:.2f}")
    print(f"Predicted impact: {h.impact:.2f}")
    print(f"Test approach: {h.test_plan}")
    print()
```

## Experiment Design

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
print(experiment.variables)        # Independent, dependent, controlled
print(experiment.baseline)         # Control conditions
print(experiment.metrics)          # Evaluation metrics
print(experiment.statistical_tests)  # Proposed significance tests
print(experiment.code_outline)     # Skeleton code for the experiment
```

## Result Analysis

```python
from ai_scientist import ResultAnalyzer

analyzer = ResultAnalyzer(model="claude-sonnet-4-20250514")

analysis = analyzer.analyze(
    hypothesis="Symbolic reasoning layer improves compositional generalization",
    results_path="./experiment_results/",
    metrics=["accuracy", "generalization_gap", "training_time"],
)

print(analysis.supports_hypothesis)  # True/False with confidence
print(analysis.key_findings)
print(analysis.statistical_significance)
print(analysis.unexpected_observations)
print(analysis.next_steps)           # Suggested follow-up experiments
```

## Literature Review

```python
from ai_scientist import LiteratureReviewer

reviewer = LiteratureReviewer(model="claude-sonnet-4-20250514")

review = reviewer.review(
    topic="Compositional generalization in neural networks",
    sources=["arxiv", "semantic-scholar"],
    max_papers=50,
    focus_areas=["architecture", "training-methods", "benchmarks"],
)

print(review.summary)              # 2-page overview
print(review.key_papers)           # Most cited/relevant
print(review.research_gaps)        # Identified open questions
print(review.taxonomy)             # Categorization of approaches
print(review.timeline)             # Evolution of the field
```

## Paper Writing

```python
from ai_scientist import PaperWriter

writer = PaperWriter(model="claude-sonnet-4-20250514")

paper = writer.draft(
    title="Symbolic Reasoning Layers for Compositional Generalization",
    sections=[
        "abstract",
        "introduction",
        "related-work",
        "method",
        "experiments",
        "results",
        "discussion",
        "conclusion",
    ],
    results=analysis,
    literature=review,
    style="neurips",  # "neurips" | "icml" | "acl" | "nature"
)

paper.save("draft.tex")
paper.save("draft.md")

# Get revision suggestions
revisions = writer.review_draft(paper)
for r in revisions:
    print(f"Section: {r.section}")
    print(f"Issue: {r.issue}")
    print(f"Suggestion: {r.suggestion}")
```

## Full Research Pipeline

```python
from ai_scientist import ResearchPipeline

pipeline = ResearchPipeline(
    model="claude-sonnet-4-20250514",
    output_dir="./research_output/",
)

result = pipeline.run(
    question="Can retrieval-augmented generation reduce hallucination in code generation?",
    stages=[
        "literature-review",
        "hypothesis-generation",
        "experiment-design",
        "result-analysis",
        "paper-draft",
    ],
    config={
        "tree_search_depth": 3,
        "hypotheses_per_level": 4,
        "auto_prune_threshold": 0.3,
    },
)

# Access outputs from each stage
print(f"Hypotheses explored: {result.total_hypotheses}")
print(f"Experiments designed: {result.total_experiments}")
print(f"Best finding: {result.top_finding}")
print(f"Paper draft: {result.paper_path}")
```

## Tips

- Start with `max_depth=2` and `max_hypotheses=3` to get quick results before scaling up
- Use domain-specific constraints in hypothesis generation — unconstrained search wastes compute
- The pruning threshold (`auto_prune_threshold`) controls exploration vs exploitation — lower values explore more
- Literature review works best with `semantic-scholar` for ML papers and `pubmed` for bio/medical
- Always review generated hypotheses and papers — the agent is a research accelerator, not a replacement
- For reproducibility, set `seed` in the pipeline config
- Tree search depth beyond 4 rarely improves results but significantly increases cost
