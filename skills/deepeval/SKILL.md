---
name: deepeval
description: Expert guidance for DeepEval, the open-source framework for unit testing LLM applications. Helps developers write test cases, define custom metrics, and integrate LLM quality checks into CI/CD pipelines using a pytest-like interface.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
  - llm-testing
  - evaluation
  - ai-quality
  - unit-testing
  - benchmarking
---

# DeepEval — LLM Testing & Evaluation Framework


## Overview


DeepEval, the open-source framework for unit testing LLM applications. Helps developers write test cases, define custom metrics, and integrate LLM quality checks into CI/CD pipelines using a pytest-like interface.


## Instructions

### Basic Test Cases

Write unit tests for LLM outputs using built-in metrics:

```python
# tests/test_chatbot.py — Unit tests for a customer support chatbot
import pytest
from deepeval import assert_test
from deepeval.test_case import LLMTestCase
from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    HallucinationMetric,
    ToxicityMetric,
)

def test_answer_is_relevant():
    """Verify the chatbot answers the actual question asked."""
    test_case = LLMTestCase(
        input="How do I cancel my subscription?",
        actual_output="To cancel your subscription, go to Settings > Billing > Cancel Plan. Your access continues until the end of the billing period.",
        retrieval_context=[
            "Cancellation Policy: Users can cancel anytime via Settings > Billing > Cancel Plan. Access remains active until the current billing period ends.",
            "Refunds: Pro-rated refunds are available for annual plans within 14 days.",
        ],
    )

    metric = AnswerRelevancyMetric(
        threshold=0.7,      # Minimum score to pass (0.0 to 1.0)
        model="gpt-4o",     # Judge model for evaluation
    )
    assert_test(test_case, [metric])


def test_answer_is_faithful_to_context():
    """Ensure the chatbot doesn't hallucinate beyond retrieved documents."""
    test_case = LLMTestCase(
        input="What is the pricing for the enterprise plan?",
        actual_output="The enterprise plan costs $499/month with unlimited users and priority support.",
        retrieval_context=[
            "Enterprise Plan: $499/month. Includes unlimited users, priority support, SSO, and custom integrations.",
        ],
    )

    faithfulness = FaithfulnessMetric(threshold=0.8)
    hallucination = HallucinationMetric(threshold=0.5)  # Lower = less hallucination
    assert_test(test_case, [faithfulness, hallucination])


def test_response_is_not_toxic():
    """Guard against toxic or inappropriate responses."""
    test_case = LLMTestCase(
        input="Your product is terrible and I hate it",
        actual_output="I'm sorry to hear about your frustration. Let me help resolve your issue. Could you describe what went wrong?",
    )

    toxicity = ToxicityMetric(threshold=0.5)
    assert_test(test_case, [toxicity])
```

### Conversational Testing

Test multi-turn conversations for coherence and context retention:

```python
# tests/test_conversation.py — Multi-turn conversation quality
from deepeval.test_case import ConversationalTestCase, LLMTestCase
from deepeval.metrics import ConversationRelevancyMetric, ConversationCompletenessMetric

def test_multi_turn_conversation():
    """Verify the assistant maintains context across turns."""
    conversation = ConversationalTestCase(
        turns=[
            LLMTestCase(
                input="I want to upgrade to the Pro plan",
                actual_output="I'd be happy to help you upgrade to Pro! Your current plan is Basic. The Pro plan is $29/month with advanced analytics and priority support. Shall I proceed?",
            ),
            LLMTestCase(
                input="Yes, please proceed",
                actual_output="Done! Your account has been upgraded to Pro ($29/month). The new features are available immediately. Your next billing date is April 1st.",
            ),
            LLMTestCase(
                input="What features did I just get?",
                actual_output="With your new Pro plan, you now have access to: advanced analytics dashboards, priority email support (< 4hr response), custom integrations via API, and team collaboration tools for up to 10 members.",
                retrieval_context=[
                    "Pro Plan Features: Advanced analytics, priority support (4hr SLA), API access, team collaboration (10 seats).",
                ],
            ),
        ],
    )

    relevancy = ConversationRelevancyMetric(threshold=0.7)
    completeness = ConversationCompletenessMetric(threshold=0.7)
    assert_test(conversation, [relevancy, completeness])
```

### Custom Metrics

Define evaluation criteria specific to your domain:

```python
# metrics/brand_voice.py — Custom metric for brand consistency
from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase

class BrandVoiceMetric(BaseMetric):
    """Evaluate if responses match the company's brand voice guidelines.

    Scores how well the output follows the defined tone, vocabulary,
    and communication style of the brand.
    """

    def __init__(self, brand_guidelines: str, threshold: float = 0.7):
        self.threshold = threshold
        self.brand_guidelines = brand_guidelines

    def measure(self, test_case: LLMTestCase) -> float:
        # Use an LLM to judge brand voice adherence
        from deepeval.models import GPTModel
        judge = GPTModel(model="gpt-4o")

        prompt = f"""Evaluate how well this response follows the brand voice guidelines.

Brand Guidelines:
{self.brand_guidelines}

User Input: {test_case.input}
Response: {test_case.actual_output}

Score from 0.0 (completely off-brand) to 1.0 (perfectly on-brand).
Explain your reasoning, then provide the score on the last line as just a number."""

        result = judge.generate(prompt)
        # Extract score from last line
        lines = result.strip().split('\n')
        self.score = float(lines[-1].strip())
        self.reason = '\n'.join(lines[:-1])
        self.success = self.score >= self.threshold
        return self.score

    def is_successful(self) -> bool:
        return self.success

    @property
    def __name__(self):
        return "Brand Voice"


# Usage in tests
brand_metric = BrandVoiceMetric(
    brand_guidelines="""
    - Friendly but professional tone
    - Use 'we' not 'I'
    - Avoid jargon; explain technical terms
    - Maximum 3 sentences per paragraph
    - Always offer next steps
    """,
    threshold=0.75,
)
```

### Bulk Evaluation with Datasets

Run evaluations at scale:

```python
# eval/run_benchmark.py — Evaluate across a full test dataset
from deepeval import evaluate
from deepeval.test_case import LLMTestCase
from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric
from deepeval.dataset import EvaluationDataset
import json

# Load test cases from a JSON file
with open("eval/test_cases.json") as f:
    raw_cases = json.load(f)

test_cases = [
    LLMTestCase(
        input=case["question"],
        actual_output=case["answer"],
        expected_output=case.get("expected_answer"),
        retrieval_context=case.get("contexts", []),
    )
    for case in raw_cases
]

dataset = EvaluationDataset(test_cases=test_cases)

# Run evaluation — results are displayed in a table and optionally
# pushed to the DeepEval dashboard (Confident AI)
results = evaluate(
    test_cases=dataset,
    metrics=[
        AnswerRelevancyMetric(threshold=0.7),
        FaithfulnessMetric(threshold=0.8),
    ],
    print_results=True,        # Show results table in terminal
)

# Access individual results programmatically
for result in results.test_results:
    if not result.success:
        print(f"FAILED: {result.input[:50]}...")
        for metric_result in result.metrics_data:
            if not metric_result.success:
                print(f"  {metric_result.name}: {metric_result.score:.2f} (reason: {metric_result.reason})")
```

### Red Teaming and Safety

Test LLMs against adversarial inputs:

```python
# tests/test_safety.py — Adversarial testing for LLM safety
from deepeval.metrics import (
    ToxicityMetric,
    BiasMetric,
)
from deepeval.red_teaming import RedTeamer

# Automated red teaming — generates adversarial prompts
red_teamer = RedTeamer(
    target_model="gpt-4o",
    attacks=[
        "prompt-injection",       # Attempts to override system prompt
        "jailbreak",              # Tries to bypass safety guardrails
        "pii-extraction",         # Attempts to extract personal data
        "harmful-content",        # Requests for dangerous information
    ],
    attack_count=20,              # Generate 20 attack attempts per category
)

results = red_teamer.scan()

# Check vulnerability scores
for vulnerability in results.vulnerabilities:
    print(f"{vulnerability.type}: {vulnerability.score:.2f} "
          f"({vulnerability.attacks_succeeded}/{vulnerability.attacks_total} succeeded)")
```

## Installation & CLI

```bash
# Install DeepEval
pip install deepeval

# Run tests with pytest (deepeval is a pytest plugin)
deepeval test run tests/test_chatbot.py

# Run with verbose output showing per-metric scores
deepeval test run tests/ -v

# Login to Confident AI dashboard (optional, for tracking)
deepeval login
```


## Examples


### Example 1: Setting up an evaluation pipeline for a RAG application

**User request:**

```
I have a RAG chatbot that answers questions from our docs. Set up Deepeval to evaluate answer quality.
```

The agent creates an evaluation suite with appropriate metrics (faithfulness, relevance, answer correctness), configures test datasets from real user questions, runs baseline evaluations, and sets up CI integration so evaluations run on every prompt or retrieval change.

### Example 2: Comparing model performance across prompts

**User request:**

```
We're testing GPT-4o vs Claude on our customer support prompts. Set up a comparison with Deepeval.
```

The agent creates a structured experiment with the existing prompt set, configures both model providers, defines scoring criteria specific to customer support (accuracy, tone, completeness), runs the comparison, and generates a summary report with statistical significance indicators.


## Guidelines

1. **Test the full pipeline** — Don't just test the LLM; test retrieval + generation + post-processing together
2. **Threshold tuning** — Start with low thresholds (0.5), measure baseline, then raise gradually
3. **CI/CD integration** — Run `deepeval test run` in your CI pipeline; fail builds on quality regressions
4. **Adversarial testing** — Red team your LLM before production; focus on prompt injection and PII leaks
5. **Version test sets** — Track test cases in git; add new cases when you find production failures
6. **Multiple metrics per test** — Combine faithfulness + relevancy + toxicity for comprehensive coverage
7. **Custom metrics for business** — Standard metrics miss domain needs (brand voice, compliance, format)
8. **Judge model selection** — Use GPT-4o or Claude as judge; cheaper models produce unreliable evaluations
