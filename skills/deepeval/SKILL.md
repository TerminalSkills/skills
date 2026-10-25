---
name: deepeval
description: >-
  DeepEval is an open-source Python framework that unit-tests LLM applications with pytest-style test cases and LLM-as-a-judge metrics. Use when a user asks to evaluate a RAG chatbot, test LLM answers for relevancy, faithfulness or hallucination, write a custom metric, or run LLM quality checks in CI.
license: Apache-2.0
compatibility: "Python 3.9+; an API key for the judge model (OPENAI_API_KEY by default) or a local judge"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/confident-ai/deepeval
  category: data-ai
  tags: "llm-testing, evaluation, ai-quality, unit-testing, benchmarking"
---

# DeepEval — LLM Testing & Evaluation Framework


## Overview


DeepEval (4.3.1 as checked, October 2026) runs metrics over `LLMTestCase` objects, either under `deepeval test run` (a pytest wrapper) or through `evaluate()`. Most metrics call a judge LLM: `OPENAI_API_KEY` selects OpenAI by default, and `deepeval set-ollama`, `set-gemini` and similar commands switch the judge. Red teaming moved out into the separate DeepTeam package.


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
        context=[  # HallucinationMetric reads `context`, FaithfulnessMetric reads `retrieval_context`
            "Enterprise Plan: $499/month. Includes unlimited users, priority support, SSO, and custom integrations.",
        ],
    )

    faithfulness = FaithfulnessMetric(threshold=0.8)
    hallucination = HallucinationMetric(threshold=0.5)  # v4: 1.0 = no hallucination; passes when score >= threshold
    assert_test(test_case, [faithfulness, hallucination])


def test_response_is_not_toxic():
    """Guard against toxic or inappropriate responses."""
    test_case = LLMTestCase(
        input="Your product is terrible and I hate it",
        actual_output="I'm sorry to hear about your frustration. Let me help resolve your issue. Could you describe what went wrong?",
    )

    toxicity = ToxicityMetric(threshold=0.5)  # v4: 1.0 = clean; threshold is a minimum score, like every other metric
    assert_test(test_case, [toxicity])
```

### Conversational Testing

A multi-turn case is a list of `Turn(role=..., content=...)` objects (v4 replaced the old list of `LLMTestCase` turns; `ConversationRelevancyMetric` is now `TurnRelevancyMetric`):

```python
# tests/test_conversation.py — Multi-turn conversation quality
from deepeval import assert_test
from deepeval.test_case import ConversationalTestCase, Turn
from deepeval.metrics import TurnRelevancyMetric, ConversationCompletenessMetric

def test_multi_turn_conversation():
    """Verify the assistant maintains context across turns."""
    conversation = ConversationalTestCase(
        turns=[
            Turn(role="user", content="I want to upgrade to the Pro plan"),
            Turn(role="assistant", content="Happy to help. Your current plan is Basic; Pro is $29/month with advanced analytics and priority support. Shall I proceed?"),
            Turn(role="user", content="Yes, please proceed"),
            Turn(role="assistant", content="Done, your account is now on Pro ($29/month). The new features are available immediately."),
            Turn(role="user", content="What features did I just get?"),
            Turn(role="assistant", content="Advanced analytics dashboards, priority email support (4hr SLA), API access, and team collaboration for up to 10 seats."),
        ],
    )

    assert_test(conversation, [TurnRelevancyMetric(threshold=0.7), ConversationCompletenessMetric(threshold=0.7)])
```

### Custom Metrics

For a domain criterion judged by an LLM, use `GEval` instead of hand-parsing a score:

```python
# metrics/brand_voice.py — Brand consistency as a G-Eval metric
from deepeval.metrics import GEval
from deepeval.test_case import SingleTurnParams

brand_voice = GEval(
    name="Brand Voice",
    criteria=(
        "Judge whether the actual output follows our voice: friendly but professional, "
        "uses 'we' not 'I', explains technical terms, and always offers a next step."
    ),
    evaluation_params=[SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT],
    threshold=0.75,
)
```

For a rule-based check, subclass `BaseMetric`. In v4 both `measure` and `a_measure` are abstract, so define both (this one ran offline):

```python
from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase

class MaxLengthMetric(BaseMetric):
    def __init__(self, max_words: int = 40, threshold: float = 0.5):
        self.max_words = max_words
        self.threshold = threshold

    def measure(self, test_case: LLMTestCase) -> float:
        words = len(test_case.actual_output.split())
        self.score = 1.0 if words <= self.max_words else 0.0
        self.success = self.score >= self.threshold
        self.reason = f"{words} words"
        return self.score

    async def a_measure(self, test_case: LLMTestCase) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return self.success

    @property
    def __name__(self):
        return "Max Length"
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

dataset = EvaluationDataset()
for tc in test_cases:
    dataset.add_test_case(tc)

# Run evaluation — results are displayed in a table and optionally
# pushed to the DeepEval dashboard (Confident AI)
results = evaluate(
    test_cases=dataset.test_cases,
    metrics=[
        AnswerRelevancyMetric(threshold=0.7),
        FaithfulnessMetric(threshold=0.8),
    ],
)

# Access individual results programmatically
for result in results.test_results:
    if not result.success:
        print(f"FAILED: {result.name}: {(result.input or '')[:50]}...")
        for metric_result in result.metrics_data:
            if not metric_result.success:
                print(f"  {metric_result.name}: {metric_result.score:.2f} (reason: {metric_result.reason})")
```

### Red Teaming and Safety

`deepeval.red_teaming` no longer exists in DeepEval 4.x. Adversarial scans live in the sister package **DeepTeam** (`pip install -U deepteam`, 1.0.x). You pass a callback that wraps your app:

```python
# tests/red_team_support_bot.py
from deepteam import red_team
from deepteam.vulnerabilities import Bias
from deepteam.attacks.single_turn import PromptInjection

async def model_callback(input: str) -> str:
    return await support_bot.answer(input)   # your own application

risk_assessment = red_team(
    model_callback=model_callback,
    vulnerabilities=[Bias(types=["race"])],
    attacks=[PromptInjection()],
)
```

Run it with `python tests/red_team_support_bot.py`; it needs a judge/attacker model key like DeepEval does. For per-response safety checks inside normal tests, `ToxicityMetric` and `BiasMetric` remain in `deepeval.metrics`.

## Installation & CLI

```bash
# Install DeepEval (use a virtualenv)
pip install deepeval
export OPENAI_API_KEY="sk-..."   # default judge; or: deepeval set-ollama --model llama3.1

# Run tests with pytest (deepeval is a pytest plugin)
deepeval test run tests/test_chatbot.py

# Run with verbose output showing per-metric scores
deepeval test run tests/ -v

# Login to Confident AI dashboard (optional, for tracking); the key is saved to .env.local
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

The agent creates a structured experiment with the existing prompt set, configures both model providers, defines scoring criteria specific to customer support (accuracy, tone, completeness), runs the comparison, and generates a summary report.


## Guidelines

1. **Test the full pipeline** — Don't just test the LLM; test retrieval + generation + post-processing together
2. **Threshold tuning** — Start with low thresholds (0.5), measure baseline, then raise gradually
3. **CI/CD integration** — Run `deepeval test run` in your CI pipeline; fail builds on quality regressions
4. **Adversarial testing** — Red team your LLM before production; focus on prompt injection and PII leaks
5. **Version test sets** — Track test cases in git; add new cases when you find production failures
6. **Multiple metrics per test** — Combine faithfulness + relevancy + toxicity for comprehensive coverage
7. **Custom metrics for business** — Standard metrics miss domain needs (brand voice, compliance, format)
8. **Judge model selection** — Use GPT-4o or Claude as judge; cheaper models produce unreliable evaluations
