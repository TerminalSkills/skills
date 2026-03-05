---
name: braintrust
description: Expert guidance for Braintrust, the platform for evaluating, monitoring, and improving AI applications. Helps developers set up experiments, track prompt performance, compare models, and debug production LLM issues with detailed tracing.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
  - ai-observability
  - evaluation
  - llm-monitoring
  - prompt-management
  - experiments
---

# Braintrust — AI Observability & Evaluation Platform


## Overview


Braintrust, the platform for evaluating, monitoring, and improving AI applications. Helps developers set up experiments, track prompt performance, compare models, and debug production LLM issues with detailed tracing.


## Instructions

### Running Experiments

Compare prompt variations and model configurations:

```typescript
// eval/experiment.ts — Compare two prompt strategies for a summarizer
import { Eval } from "braintrust";

Eval("Summarizer", {
  data: () => [
    {
      input: "The quarterly revenue increased by 15% to $2.3M, driven primarily by enterprise adoption. Customer churn decreased to 3.2% from 4.8% last quarter. The sales team closed 47 new accounts, exceeding their target of 40.",
      expected: "Revenue up 15% to $2.3M from enterprise growth. Churn improved to 3.2%. 47 new accounts closed (target: 40).",
    },
    {
      input: "The new feature release caused a 2-hour outage affecting 12% of users. Root cause was a database migration that wasn't backwards compatible. Team implemented rollback within 45 minutes of detection.",
      expected: "2-hour outage from incompatible DB migration affected 12% of users. Rollback completed in 45 minutes.",
    },
  ],

  task: async (input) => {
    // Your LLM call — Braintrust wraps and traces it automatically
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Summarize the following text in 2-3 concise sentences. Focus on key metrics and outcomes.",
        },
        { role: "user", content: input },
      ],
    });
    return response.choices[0].message.content;
  },

  scores: [
    // Built-in scorers
    Factuality,      // Is the summary factually consistent with the input?
    Summary,         // Overall summary quality score
    // Custom scorer
    (args) => {
      const wordCount = args.output.split(" ").length;
      return {
        name: "Conciseness",
        score: wordCount <= 40 ? 1.0 : Math.max(0, 1 - (wordCount - 40) / 40),
      };
    },
  ],
});
```

### Logging and Tracing

Instrument production code for observability:

```python
# app/service.py — Production RAG service with Braintrust tracing
import braintrust

# Initialize logging — all LLM calls are automatically captured
braintrust.login(api_key="your-api-key")
logger = braintrust.init_logger(project="customer-support-bot")

@braintrust.traced          # Automatically creates a span for this function
async def handle_query(user_id: str, question: str):
    """Handle a customer support query with RAG.

    Braintrust traces the full execution: retrieval → generation → response,
    capturing latency, token usage, and intermediate results.
    """
    # Retrieval step — logged as a child span
    with braintrust.current_span().start_span(name="retrieval") as span:
        docs = await retriever.search(question, top_k=5)
        span.log(
            input=question,
            output=[d.page_content[:200] for d in docs],  # Log truncated for readability
            metadata={"doc_count": len(docs)},
        )

    # Generation step — OpenAI call is auto-instrumented
    context = "\n".join(d.page_content for d in docs)
    response = await openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": f"Answer based on this context:\n{context}"},
            {"role": "user", "content": question},
        ],
    )
    answer = response.choices[0].message.content

    # Log the complete interaction for later analysis
    logger.log(
        input=question,
        output=answer,
        metadata={
            "user_id": user_id,
            "model": "gpt-4o",
            "doc_count": len(docs),
            "context_length": len(context),
        },
        scores={
            # Online scoring — compute lightweight quality signals
            "answer_length": min(len(answer) / 500, 1.0),
        },
        tags=["production", "customer-support"],
    )

    return answer
```

### Prompt Management

Version and manage prompts across environments:

```typescript
// app/prompts.ts — Use managed prompts from Braintrust
import { loadPrompt } from "braintrust";

async function generateResponse(userMessage: string) {
  // Load the latest published version of the prompt
  // Prompts are versioned in Braintrust UI — no code deploy needed to update
  const prompt = await loadPrompt({
    project: "customer-support-bot",
    slug: "support-response",        // Prompt identifier
    defaults: {
      model: "gpt-4o",              // Fallback if not set in prompt config
      temperature: 0.3,
    },
  });

  // The prompt includes model, temperature, system message, and tools
  const response = await openai.chat.completions.create({
    ...prompt,                       // Spreads model, messages template, params
    messages: [
      ...prompt.messages,            // System prompt from Braintrust
      { role: "user", content: userMessage },
    ],
  });

  return response.choices[0].message.content;
}
```

### Dataset Management

Build and maintain evaluation datasets:

```python
# eval/manage_datasets.py — Create and update evaluation datasets
import braintrust

client = braintrust.init(project="customer-support-bot")

# Create a dataset from production logs
dataset = client.create_dataset(
    name="support-golden-set-v2",
    description="Curated Q&A pairs from top-rated support interactions",
)

# Add entries — each becomes a test case for experiments
dataset.insert([
    {
        "input": "How do I export my data?",
        "expected": "Go to Settings > Data > Export. Choose CSV or JSON format. The export includes all your projects and their history.",
        "metadata": {"category": "data-management", "difficulty": "simple"},
    },
    {
        "input": "Why was I charged twice this month?",
        "expected": "I can see the duplicate charge. This happens when a payment retry occurs after a timeout. I've initiated a refund for the extra charge — it will appear in 3-5 business days.",
        "metadata": {"category": "billing", "difficulty": "complex"},
    },
])

# Use the dataset in experiments
Eval("support-bot-v2", {
    data: lambda: client.get_dataset("support-golden-set-v2"),
    task: support_bot.generate,
    scores: [Factuality, Helpfulness],
})
```

### Online Scoring

Evaluate production traffic in real-time:

```python
# app/scoring.py — Score production responses asynchronously
import braintrust

@braintrust.traced
async def score_response(question: str, answer: str, context: list[str]):
    """Score a production response after serving it to the user.

    Runs asynchronously so it doesn't add latency to the user request.
    Results appear in the Braintrust dashboard for monitoring.
    """
    span = braintrust.current_span()

    # Lightweight heuristic scores (fast, no LLM call)
    span.log_scores({
        "has_greeting": 1.0 if any(g in answer.lower() for g in ["hi", "hello", "hey"]) else 0.0,
        "cites_source": 1.0 if "according to" in answer.lower() or "based on" in answer.lower() else 0.0,
        "response_length": min(len(answer.split()) / 100, 1.0),
    })

    # LLM-based score (runs async, higher quality)
    faithfulness_score = await judge_model.evaluate(
        question=question,
        answer=answer,
        context=context,
        criteria="Is the answer fully supported by the provided context?",
    )
    span.log_scores({"faithfulness": faithfulness_score})
```

## Installation

```bash
# Python
pip install braintrust

# TypeScript/JavaScript
npm install braintrust

# Auto-instrument OpenAI calls
# Python: braintrust wraps openai automatically when initialized
# JS: import { wrapOpenAI } from "braintrust"; const client = wrapOpenAI(new OpenAI());
```


## Examples


### Example 1: Setting up an evaluation pipeline for a RAG application

**User request:**

```
I have a RAG chatbot that answers questions from our docs. Set up Braintrust to evaluate answer quality.
```

The agent creates an evaluation suite with appropriate metrics (faithfulness, relevance, answer correctness), configures test datasets from real user questions, runs baseline evaluations, and sets up CI integration so evaluations run on every prompt or retrieval change.

### Example 2: Comparing model performance across prompts

**User request:**

```
We're testing GPT-4o vs Claude on our customer support prompts. Set up a comparison with Braintrust.
```

The agent creates a structured experiment with the existing prompt set, configures both model providers, defines scoring criteria specific to customer support (accuracy, tone, completeness), runs the comparison, and generates a summary report with statistical significance indicators.


## Guidelines

1. **Experiment before deploying** — Run offline evals comparing prompt changes; never ship untested prompts
2. **Version everything** — Prompts, datasets, and scoring functions should all be versioned and reproducible
3. **Score in production** — Lightweight heuristic scores on every request; LLM-based scores on a sample
4. **Build golden datasets** — Curate the best production examples into evaluation datasets; update quarterly
5. **Compare models** — Use experiments to compare GPT-4o vs Claude vs local models on your specific use case
6. **Alert on regressions** — Set up score thresholds; alert when production quality drops below baseline
7. **Trace complex chains** — Use nested spans for multi-step agents; makes debugging 10x faster
8. **Separate eval from app code** — Keep evaluation logic in `eval/` directory; don't mix with production code
