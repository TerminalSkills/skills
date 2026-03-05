---
name: ragas
description: Expert guidance for Ragas, the framework for evaluating Retrieval-Augmented Generation pipelines. Helps developers measure and improve the quality of their RAG systems across retrieval accuracy, answer faithfulness, and response relevance.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
  - rag
  - evaluation
  - llm-testing
  - retrieval
  - ai-quality
---

# Ragas — RAG Evaluation Framework


## Overview


Ragas, the framework for evaluating Retrieval-Augmented Generation pipelines. Helps developers measure and improve the quality of their RAG systems across retrieval accuracy, answer faithfulness, and response relevance.


## Instructions

### Basic Evaluation

Evaluate a RAG pipeline with standard metrics:

```python
# evaluate_rag.py — Run Ragas evaluation on a RAG pipeline
from ragas import evaluate
from ragas.metrics import (
    faithfulness,          # Is the answer grounded in retrieved context?
    answer_relevancy,      # Does the answer address the question?
    context_precision,     # Are retrieved docs relevant and well-ranked?
    context_recall,        # Did retrieval find all necessary information?
)
from datasets import Dataset

# Prepare evaluation dataset — each row is one question with ground truth
eval_data = {
    "question": [
        "What is the refund policy for annual subscriptions?",
        "How do I reset my password?",
        "What integrations are available with Slack?",
    ],
    "answer": [
        "Annual subscriptions can be refunded within 30 days of purchase.",
        "Click 'Forgot Password' on the login page and follow the email link.",
        "We offer native Slack integration with channel notifications and slash commands.",
    ],
    "contexts": [
        # Retrieved documents for each question
        [
            "Refund Policy: Annual plans are eligible for a full refund within 30 days. Monthly plans are non-refundable.",
            "Billing FAQ: Contact support@example.com for billing inquiries.",
        ],
        [
            "Password Reset: Navigate to login page, click 'Forgot Password', enter your email.",
            "Security: All password reset links expire after 24 hours.",
        ],
        [
            "Integrations: Connect with Slack, Teams, and Discord. Slack supports notifications and /commands.",
            "API: Use webhooks for custom integrations with any platform.",
        ],
    ],
    "ground_truth": [
        "Annual subscriptions are eligible for a full refund within 30 days of purchase. Monthly plans cannot be refunded.",
        "Go to the login page, click 'Forgot Password', enter your email address, and follow the reset link sent to your inbox.",
        "Slack integration includes channel notifications, slash commands, and is available as a native integration.",
    ],
}

dataset = Dataset.from_dict(eval_data)

# Run evaluation across all metrics
results = evaluate(
    dataset=dataset,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
)

# Results are a dict of metric_name → score (0.0 to 1.0)
print(results)
# {'faithfulness': 0.95, 'answer_relevancy': 0.88, 'context_precision': 0.92, 'context_recall': 0.85}

# Convert to pandas DataFrame for per-question analysis
df = results.to_pandas()
print(df[['question', 'faithfulness', 'answer_relevancy']].to_string())
```

### Custom Test Sets with Synthetic Data

Generate evaluation datasets from your own documents:

```python
# generate_testset.py — Create synthetic Q&A pairs from documents
from ragas.testset import TestsetGenerator
from ragas.testset.evolutions import simple, reasoning, multi_context
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.document_loaders import DirectoryLoader

# Load your knowledge base documents
loader = DirectoryLoader("./docs/", glob="**/*.md")
documents = loader.load()

# Configure the generator with an LLM
generator = TestsetGenerator.from_langchain(
    generator_llm=ChatOpenAI(model="gpt-4o"),
    critic_llm=ChatOpenAI(model="gpt-4o"),
    embeddings=OpenAIEmbeddings(),
)

# Generate test set with different question complexities
# simple: straightforward factual questions
# reasoning: questions requiring inference across a single document
# multi_context: questions needing information from multiple documents
testset = generator.generate_with_langchain_docs(
    documents,
    test_size=50,                      # Generate 50 Q&A pairs
    distributions={
        simple: 0.4,                   # 40% simple factual
        reasoning: 0.3,               # 30% reasoning required
        multi_context: 0.3,           # 30% multi-document synthesis
    },
)

# Export for reuse across evaluation runs
test_df = testset.to_pandas()
test_df.to_csv("eval_testset.csv", index=False)
print(f"Generated {len(test_df)} test questions")
print(f"Distribution: {test_df['evolution_type'].value_counts().to_dict()}")
```

### Evaluating Specific Components

Isolate and measure individual RAG components:

```python
# eval_retriever.py — Evaluate retrieval quality independently
from ragas.metrics import (
    context_precision,     # Are top results relevant? (ranking quality)
    context_recall,        # Are all relevant docs retrieved? (coverage)
    context_entity_recall, # Are key entities from ground truth in context?
)
from ragas import evaluate
from datasets import Dataset

def evaluate_retriever(retriever, test_questions, ground_truths):
    """Evaluate retriever independently from the generator.

    Args:
        retriever: Your retrieval function that takes a query and returns docs
        test_questions: List of test queries
        ground_truths: List of expected answers for recall measurement
    """
    contexts = []
    for question in test_questions:
        # Your retriever returns a list of document strings
        docs = retriever.retrieve(question, top_k=5)
        contexts.append([doc.page_content for doc in docs])

    dataset = Dataset.from_dict({
        "question": test_questions,
        "contexts": contexts,
        "ground_truth": ground_truths,
    })

    results = evaluate(
        dataset=dataset,
        metrics=[context_precision, context_recall, context_entity_recall],
    )

    return results


# eval_generator.py — Evaluate answer generation quality
from ragas.metrics import (
    faithfulness,          # Hallucination detection
    answer_relevancy,      # Does it answer the question?
    answer_similarity,     # Semantic similarity to ground truth
    answer_correctness,    # Factual correctness vs ground truth
)

def evaluate_generator(rag_pipeline, test_questions, contexts, ground_truths):
    """Evaluate the generation component with fixed retrieval context.

    Args:
        rag_pipeline: Your generation function
        test_questions: List of test queries
        contexts: Pre-retrieved contexts (fixed to isolate generator)
        ground_truths: Expected correct answers
    """
    answers = []
    for question, ctx in zip(test_questions, contexts):
        answer = rag_pipeline.generate(question, context=ctx)
        answers.append(answer)

    dataset = Dataset.from_dict({
        "question": test_questions,
        "answer": answers,
        "contexts": contexts,
        "ground_truth": ground_truths,
    })

    return evaluate(
        dataset=dataset,
        metrics=[faithfulness, answer_relevancy, answer_correctness],
    )
```

### CI Integration

Run Ragas evaluations in your CI pipeline:

```python
# tests/test_rag_quality.py — Pytest integration for continuous RAG evaluation
import pytest
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision
from datasets import Dataset
import json

# Load the pre-generated test set (created by generate_testset.py)
QUALITY_THRESHOLDS = {
    "faithfulness": 0.85,          # Minimum acceptable faithfulness
    "answer_relevancy": 0.80,     # Minimum answer relevance
    "context_precision": 0.75,    # Minimum retrieval precision
}

@pytest.fixture(scope="session")
def eval_results(rag_pipeline, test_dataset):
    """Run evaluation once per test session and share results."""
    questions, ground_truths = test_dataset

    # Run the full RAG pipeline on test questions
    answers, contexts = [], []
    for q in questions:
        result = rag_pipeline.query(q)
        answers.append(result["answer"])
        contexts.append(result["sources"])

    dataset = Dataset.from_dict({
        "question": questions,
        "answer": answers,
        "contexts": contexts,
        "ground_truth": ground_truths,
    })

    results = evaluate(
        dataset=dataset,
        metrics=[faithfulness, answer_relevancy, context_precision],
    )

    # Save results for reporting
    with open("rag_eval_results.json", "w") as f:
        json.dump(dict(results), f, indent=2)

    return results


def test_faithfulness_above_threshold(eval_results):
    """Ensure answers are grounded in retrieved context (no hallucinations)."""
    score = eval_results["faithfulness"]
    assert score >= QUALITY_THRESHOLDS["faithfulness"], (
        f"Faithfulness {score:.2f} below threshold {QUALITY_THRESHOLDS['faithfulness']}"
    )


def test_answer_relevancy_above_threshold(eval_results):
    """Ensure answers actually address the questions asked."""
    score = eval_results["answer_relevancy"]
    assert score >= QUALITY_THRESHOLDS["answer_relevancy"], (
        f"Answer relevancy {score:.2f} below threshold {QUALITY_THRESHOLDS['answer_relevancy']}"
    )


def test_no_regression(eval_results):
    """Compare against previous run to catch regressions."""
    try:
        with open("rag_eval_baseline.json") as f:
            baseline = json.load(f)
    except FileNotFoundError:
        pytest.skip("No baseline found — first run")

    for metric, score in eval_results.items():
        if metric in baseline:
            regression = baseline[metric] - score
            assert regression < 0.05, (   # Allow max 5% regression
                f"{metric} regressed by {regression:.2f} "
                f"(baseline: {baseline[metric]:.2f}, current: {score:.2f})"
            )
```

### Custom Metrics

Define domain-specific evaluation criteria:

```python
# custom_metrics.py — Create metrics specific to your use case
from ragas.metrics.base import MetricWithLLM
from dataclasses import dataclass, field

@dataclass
class ToneConsistency(MetricWithLLM):
    """Evaluate if the answer maintains the expected brand tone.

    Useful for customer-facing RAG applications where tone matters
    as much as factual accuracy.
    """
    name: str = "tone_consistency"
    expected_tone: str = "professional and empathetic"

    async def _ascore(self, row, callbacks=None):
        prompt = f"""Rate how well this answer maintains a {self.expected_tone} tone.

        Question: {row['question']}
        Answer: {row['answer']}

        Score from 0.0 (completely wrong tone) to 1.0 (perfect tone).
        Return ONLY the numeric score."""

        result = await self.llm.agenerate_text(prompt)
        try:
            return float(result.generations[0][0].text.strip())
        except ValueError:
            return 0.0


# Use custom metric alongside standard ones
tone_metric = ToneConsistency(expected_tone="friendly and technical")
results = evaluate(
    dataset=dataset,
    metrics=[faithfulness, answer_relevancy, tone_metric],
)
```

## Installation

```bash
pip install ragas

# With LangChain integration for testset generation
pip install ragas[langchain]

# With all optional dependencies
pip install ragas[all]
```


## Examples


### Example 1: Setting up an evaluation pipeline for a RAG application

**User request:**

```
I have a RAG chatbot that answers questions from our docs. Set up Ragas to evaluate answer quality.
```

The agent creates an evaluation suite with appropriate metrics (faithfulness, relevance, answer correctness), configures test datasets from real user questions, runs baseline evaluations, and sets up CI integration so evaluations run on every prompt or retrieval change.

### Example 2: Comparing model performance across prompts

**User request:**

```
We're testing GPT-4o vs Claude on our customer support prompts. Set up a comparison with Ragas.
```

The agent creates a structured experiment with the existing prompt set, configures both model providers, defines scoring criteria specific to customer support (accuracy, tone, completeness), runs the comparison, and generates a summary report with statistical significance indicators.


## Guidelines

1. **Evaluate before optimizing** — Establish baseline scores before changing retrieval or generation parameters
2. **Test set diversity** — Include simple, reasoning, and multi-context questions; real user queries are best
3. **Component isolation** — Evaluate retriever and generator separately to identify which part needs improvement
4. **Track over time** — Store results in CI; catch regressions before they reach production
5. **Custom metrics for domain** — Standard metrics miss domain-specific quality requirements (tone, compliance, format)
6. **Sufficient test size** — Use 50+ questions for stable metrics; small sets produce noisy scores
7. **Ground truth quality** — Evaluation is only as good as your reference answers; invest in accurate ground truths
8. **Multiple LLM judges** — Cross-validate with different judge models to reduce evaluation bias
