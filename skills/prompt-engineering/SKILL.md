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
  version: "1.0.0"
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

## Core Techniques

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
- 3–5 examples usually optimal; more can hurt via distraction
- Put examples before the actual input

### Chain-of-Thought (CoT)

Ask the model to reason step-by-step before answering. Dramatically improves accuracy on math, logic, and multi-step tasks.

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

### Meta-Prompting

Use LLMs to generate or improve prompts for other LLMs.

```python
meta_prompt = """You are an expert prompt engineer. Create an optimized prompt for the following task.

Task: {task_description}
Target model: {model_name}
Desired output format: {output_format}

Generate a prompt that:
1. Clearly specifies the task
2. Includes necessary context
3. Defines output format precisely
4. Handles edge cases

Optimized prompt:"""
```

## Structured Prompting

### XML Tags (Claude-Optimized)

Claude responds especially well to XML-tagged content sections.

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

### Delimiter-Based Prompts

```python
prompt = """Summarize the text between triple backticks in 2-3 sentences.

```
{text_to_summarize}
```

Summary:"""
```

## Prompt Templates

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

## Evaluation: Testing Prompts Systematically

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

## Model-Specific Differences

### Claude (Anthropic)
- Responds very well to XML tags (`<task>`, `<context>`, `<format>`)
- Prefers explicit, detailed instructions over implicit expectations
- Honors "do not" instructions reliably
- Works well with `<thinking>` tags for CoT (extended thinking)
- System prompt sets persona/constraints; user prompt is the task

### GPT-4 (OpenAI)
- Works well with markdown headers and bullet lists in prompts
- Strong at following JSON schema when given explicit examples
- `response_format: { type: "json_object" }` enforces JSON output
- Temperature 0 for deterministic tasks; 0.7 for creative work

### Gemini (Google)
- Performs best with clear, concise instructions
- Multimodal: can process images/PDFs natively in prompts
- Use `generationConfig.responseMimeType = "application/json"` for JSON output
- Strong instruction-following with numbered steps

## Guidelines

- Start simple (zero-shot) and add complexity only if needed
- Be explicit about output format — show a JSON example if you want JSON
- Use system prompt for persona/constraints, user prompt for the actual task
- Test prompts on adversarial inputs (edge cases, contradictions, empty inputs)
- Version-control your prompts like code — track changes and metrics
- Shorter prompts are usually faster and cheaper; add length only when it helps accuracy
- For extraction tasks, always specify what to return when the field is not found
