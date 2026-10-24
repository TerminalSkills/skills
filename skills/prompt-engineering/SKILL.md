---
name: prompt-engineering
description: >-
  Prompt engineering techniques for LLMs — zero-shot, few-shot, chain-of-thought,
  ReAct, and structured prompting. Use when designing prompts for AI features,
  improving LLM output quality, building reliable AI pipelines, or getting
  consistent structured responses from language models.
license: Apache-2.0
compatibility: "Works with any LLM API (OpenAI, Anthropic, Google Gemini, etc.)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["prompt-engineering", "llm", "ai", "claude", "gpt"]
  use-cases:
    - "Design zero-shot prompts for classification or extraction tasks"
    - "Build few-shot examples to improve LLM accuracy"
    - "Use chain-of-thought prompting for complex reasoning tasks"
    - "Create ReAct agents that reason and act in a loop"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Prompt Engineering

## Overview

Prompt engineering is the practice of crafting inputs to language models to reliably produce desired outputs. Good prompts reduce hallucinations, increase consistency, and unlock model capabilities. This skill covers the key techniques: zero-shot, few-shot, chain-of-thought (CoT), Tree-of-Thought (ToT), ReAct, self-consistency, and meta-prompting.

## Instructions

### Core Techniques

### Zero-Shot Prompting

No examples — rely on the model's training. Works well for clear, simple tasks.

```python
prompt = """Classify the sentiment of the following review as POSITIVE, NEGATIVE, or NEUTRAL.

Review: "The delivery was fast but the packaging was damaged."

Sentiment:"""
```

### Few-Shot Prompting

Provide 2–5 examples to guide the model's output format and style.

```python
prompt = """Classify sentiment. Examples:

Review: "Amazing product, works perfectly!" → POSITIVE
Review: "Arrived broken, waste of money." → NEGATIVE
Review: "It's okay, nothing special." → NEUTRAL

Review: "The battery life is shorter than advertised."
Sentiment:"""
```

**Tips:**
- Use diverse, representative examples
- Keep examples consistent in format
- Anthropic's guide suggests 3–5 examples as a starting point; test whether more help or hurt on your own cases
- Put examples before the actual input

### Chain-of-Thought (CoT)

Ask the model to reason step-by-step before answering. Often helps on math, logic and multi-step tasks; measure it on your own cases, because it costs more output tokens.

```python
# Zero-shot CoT — just add "Let's think step by step"
prompt = """A store sells apples for $0.50 each and oranges for $0.75 each.
Alice buys 4 apples and 3 oranges. How much does she spend?

Let's think step by step."""

# Few-shot CoT — include reasoning in examples
prompt = """Q: Roger has 5 tennis balls. He buys 2 more cans of tennis balls.
Each can has 3 balls. How many tennis balls does he have now?
A: Roger starts with 5 balls. 2 cans × 3 balls = 6 balls. 5 + 6 = 11. The answer is 11.

Q: Alice has 10 apples. She gives 3 to Bob and 2 to Charlie. How many does she have?
A:"""
```

### Tree-of-Thought (ToT)

Generate multiple reasoning paths, evaluate them, and pick the best. Useful for creative or open-ended problems.

```python
prompt = """Think of 3 different approaches to solve this problem, evaluate each briefly,
then pick the best one and execute it.

Problem: Design a caching strategy for an API that has both frequently-accessed
stable data and rapidly-changing user-specific data.

Approach 1:
Approach 2:
Approach 3:

Best approach and implementation:"""
```

### ReAct (Reason + Act)

Interleave reasoning (Thought) with actions (Action/Observation) in a loop. Foundation of tool-using agents.

```python
system = """You solve tasks by alternating between Thought, Action, and Observation.
Available actions: search(query), calculate(expression), done(answer)

Format:
Thought: [your reasoning]
Action: [action to take]
Observation: [result of action]
... (repeat as needed)
Thought: I now have the answer.
Action: done([final answer])"""

user = "What is the square root of the population of Tokyo?"
```

### Self-Consistency

Generate multiple independent answers, then pick the most common one. Improves reliability on reasoning tasks.

```python
import asyncio

async def self_consistent_answer(question, n=5):
    """Generate N answers and pick by majority vote."""
    prompts = [f"{question}\n\nThink step by step and give your final answer." for _ in range(n)]
    answers = await asyncio.gather(*[call_llm(p) for p in prompts])
    # Extract final answers and find most common
    final_answers = [extract_answer(a) for a in answers]
    return max(set(final_answers), key=final_answers.count)
```

### Structured Prompting

### XML Tags (Claude-Optimized)

Anthropic's prompting guide recommends wrapping each type of content (for example `<instructions>`, `<context>`, `<input>`) in its own tag so Claude does not misread a prompt that mixes instructions, context, examples and inputs. There are no required tag names.

```python
prompt = """<task>
Extract all product names and prices from the following receipt text.
</task>

<format>
Return a JSON array: [{"name": "...", "price": 0.00}]
</format>

<receipt>
{receipt_text}
</receipt>

JSON output:"""
```

### Role Assignment

```python
system = """You are a senior Python engineer specializing in performance optimization.
You write clean, well-documented code with O(n) complexity analysis.
When reviewing code, always:
1. Identify bottlenecks
2. Suggest specific optimizations
3. Provide rewritten examples"""
```

### Prompt Templates

### Reusable Template Class

```python
class PromptTemplate:
    def __init__(self, template: str, required_vars: list[str]):
        self.template = template
        self.required_vars = required_vars

    def format(self, **kwargs) -> str:
        missing = [v for v in self.required_vars if v not in kwargs]
        if missing:
            raise ValueError(f"Missing variables: {missing}")
        return self.template.format(**kwargs)

# Example usage
extraction_template = PromptTemplate(
    template="""Extract {field} from the following {doc_type}.

<document>
{document}
</document>

Return only the extracted {field}, nothing else.""",
    required_vars=["field", "doc_type", "document"]
)

prompt = extraction_template.format(
    field="email addresses",
    doc_type="email thread",
    document=email_text
)
```

### Evaluation: Testing Prompts Systematically

```python
import json
from dataclasses import dataclass

@dataclass
class TestCase:
    input: str
    expected: str
    description: str

def evaluate_prompt(prompt_template: str, test_cases: list[TestCase], llm_fn):
    results = []
    for tc in test_cases:
        prompt = prompt_template.format(input=tc.input)
        actual = llm_fn(prompt)
        passed = tc.expected.lower() in actual.lower()
        results.append({
            "description": tc.description,
            "passed": passed,
            "expected": tc.expected,
            "actual": actual
        })

    accuracy = sum(r["passed"] for r in results) / len(results)
    print(f"Accuracy: {accuracy:.0%} ({sum(r['passed'] for r in results)}/{len(results)})")

    failed = [r for r in results if not r["passed"]]
    if failed:
        print("\nFailed cases:")
        for f in failed:
            print(f"  - {f['description']}: expected '{f['expected']}', got '{f['actual'][:100]}'")

    return results
```

### Model-Specific Differences

### Claude (Anthropic)
- XML tags (`<task>`, `<context>`, `<format>`) separate sections cleanly (common practice)
- Explicit instructions work better than implicit expectations (heuristic); say what to do, not only what to avoid
- Extended thinking is an API setting, not a prompt tag. On models that support it, use `thinking: {type: "adaptive"}` with `output_config: {effort: ...}` for depth (adaptive returns a 400 on Claude 4.5 and earlier, which keep `type: "enabled"` with `budget_tokens`) (Anthropic extended-thinking docs). `thinking: {type: "enabled", budget_tokens: N}` is deprecated on Claude Opus 4.6 and Sonnet 4.6 and returns a 400 error on 4.7 and later models; `budget_tokens` has a 1,024 minimum
- Prefilled assistant messages on the last turn return a 400 error on Claude 4.6 and later models; use direct instructions, structured outputs or tool calling instead
- On Claude Fable 5.x, Opus 5.x and Sonnet 5.5, rely on the thinking setting rather than asking the model to write out its reasoning (for example in `<thinking>` tags); such a prompt may be declined. The step-by-step CoT prompts above suit models or settings with thinking off
- System prompt sets persona/constraints; user prompt is the task

### GPT (OpenAI)
- Markdown headers and bullet lists in prompts are a common pattern (heuristic)
- Prefer Structured Outputs: `text: { format: { type: "json_schema", name: "...", strict: true, schema: ... } }` in the Responses API. OpenAI recommends it over JSON mode: "We recommend always using Structured Outputs instead of JSON mode when possible." (developers.openai.com structured-outputs)
- `response_format: { type: "json_object" }` (Chat Completions) is JSON mode; it does not enforce a schema
- Lower temperature is common for deterministic tasks; no source here sets specific values

### Gemini (Google)
- Multimodal: can process images and PDFs natively in prompts
- For JSON output, use the structured-output setting in the current Gemini API docs (ai.google.dev). The exact field name was not confirmed in this round, so do not copy one from older snippets

## Examples

### Example 1: Sentiment labels for product reviews
**User request:** "Classify 200 product reviews as POSITIVE, NEGATIVE or NEUTRAL. Give me the prompt and a way to check it."

Use the few-shot template above with three labelled reviews, then run the evaluation harness on 30 reviews you labelled by hand. Expected result: one label per review, an accuracy line such as `Accuracy: 90% (27/30)`, and a list of the failed cases. Rewrite the examples that the failed cases point to, then rerun.

### Example 2: Receipt items as JSON with missing prices
**User request:** "Pull product names and prices from a receipt into JSON. Some lines have no price; I want null there, not a guess."

Use the XML-tag template above with `<task>`, `<format>` and `<receipt>` sections, and state in `<format>` that a missing price is `null`. Expected result for a receipt with one unpriced line: `[{"name": "Oat milk", "price": 3.49}, {"name": "Paper towels", "price": null}]`. Parse the output with `json.loads` and reject any response that fails to parse. With the OpenAI API, Structured Outputs (`json_schema`) enforces the shape instead.

## Guidelines

- Start simple (zero-shot) and add complexity only if needed
- Be explicit about output format — show a JSON example if you want JSON
- Use system prompt for persona/constraints, user prompt for the actual task
- Test prompts on adversarial inputs (edge cases, contradictions, empty inputs)
- Version-control your prompts like code — track changes and metrics
- Shorter prompts are usually faster and cheaper; add length only when it helps accuracy
- For extraction tasks, always specify what to return when the field is not found
