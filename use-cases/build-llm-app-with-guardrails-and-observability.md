---
title: Build a Production LLM App with Guardrails and Full Observability
slug: build-llm-app-with-guardrails-and-observability
description: Build a customer support AI that routes queries across multiple LLM providers via OpenRouter, enforces structured output with Outlines, tracks every call with Langtrace and Weave evaluations, and deploys on AWS Lambda with Powertools — creating a production-grade AI pipeline with cost optimization, quality monitoring, and automatic fallbacks.
skills: [openrouter, outlines, langtrace, weave, powertools-lambda]
category: AI & Machine Learning
tags: [llm, observability, guardrails, multi-model, production, monitoring]
---

# Build a Production LLM App with Guardrails and Full Observability

Ravi leads AI at a 30-person B2B SaaS company. They've built a customer support chatbot that handles 2,000 queries/day. The problem: GPT-4o works great but costs $800/month, responses sometimes hallucinate, there's no visibility into what's failing, and when OpenAI has an outage, the entire system goes down. Ravi needs multi-model routing, structured output guarantees, cost tracking, quality evaluation, and automatic fallbacks.

## Step 1: Multi-Model Routing with OpenRouter

```typescript
// lib/llm-router.ts — Smart model routing with automatic fallback
import OpenAI from "openai";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: { "HTTP-Referer": "https://supportai.example.com" },
});

type QueryComplexity = "simple" | "moderate" | "complex";

// Route to cheapest model that can handle the task
const MODEL_TIERS: Record<QueryComplexity, string[]> = {
  simple: [
    "meta-llama/llama-3.1-8b-instruct:free",   // Free — FAQ, greetings
    "google/gemini-2.0-flash-001",               // $0.10/M — fallback
  ],
  moderate: [
    "anthropic/claude-3-5-haiku-20241022",       // $0.25/M — most queries
    "openai/gpt-4o-mini",                        // $0.15/M — fallback
  ],
  complex: [
    "anthropic/claude-sonnet-4-20250514",               // $3/M — escalations, refunds
    "openai/gpt-4o",                             // $2.50/M — fallback
  ],
};

export async function routeQuery(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  complexity: QueryComplexity,
) {
  const models = MODEL_TIERS[complexity];

  for (const model of models) {
    try {
      return await openrouter.chat.completions.create({
        model,
        messages,
        max_tokens: 1024,
        temperature: 0.3,                  // Low temp for support accuracy
      });
    } catch (error: any) {
      if (error.status === 429 || error.status >= 500) continue;  // Try next model
      throw error;
    }
  }
  throw new Error("All models unavailable");
}
```

## Step 2: Structured Output with Outlines

```python
# services/classifier.py — Guaranteed structured output for intent classification
import outlines
from pydantic import BaseModel, Field
from enum import Enum

class Intent(str, Enum):
    billing = "billing"
    technical = "technical"
    account = "account"
    feature_request = "feature_request"
    complaint = "complaint"
    general = "general"

class TicketClassification(BaseModel):
    intent: Intent
    urgency: int = Field(ge=1, le=5, description="1=low, 5=critical")
    sentiment: float = Field(ge=-1.0, le=1.0, description="-1=angry, 1=happy")
    needs_human: bool
    suggested_tags: list[str] = Field(min_length=1, max_length=5)

# Local model for classification — fast, private, free
model = outlines.models.transformers("meta-llama/Llama-3.1-8B-Instruct")
classifier = outlines.generate.json(model, TicketClassification)

def classify_ticket(message: str) -> TicketClassification:
    """Classify support ticket. Output ALWAYS matches schema — guaranteed."""
    prompt = f"""Classify this support ticket:
Message: "{message}"

Respond with intent, urgency (1-5), sentiment (-1 to 1), needs_human flag, and tags."""
    return classifier(prompt)
    # Returns validated TicketClassification — never invalid JSON, never wrong types
```

## Step 3: Observability with Langtrace

```typescript
// lib/tracing.ts — Every LLM call traced automatically
import * as Langtrace from "@langtrase/typescript-sdk";

Langtrace.init({
  api_key: process.env.LANGTRACE_API_KEY,
  batch: true,
  instrumentations: { openai: true },     // Auto-instruments OpenRouter (OpenAI SDK)
});

// All routeQuery() calls now automatically traced:
// - Model used, tokens consumed, latency
// - Cost per query (by model tier)
// - Input/output for debugging
// - Error rates per model
```

## Step 4: Quality Evaluation with Weave

```python
# eval/evaluate_support.py — Systematic quality evaluation
import weave

weave.init("support-ai-eval")

eval_dataset = [
    {"query": "How do I cancel my subscription?", "expected_intent": "billing", "expected_human": False},
    {"query": "The API returns 500 errors since yesterday", "expected_intent": "technical", "expected_human": True},
    {"query": "I've been charged twice this month!", "expected_intent": "complaint", "expected_human": True},
]

@weave.op()
def accuracy_scorer(output: dict, expected_intent: str) -> dict:
    return {"intent_accuracy": 1.0 if output["intent"] == expected_intent else 0.0}

@weave.op()
def escalation_scorer(output: dict, expected_human: bool) -> dict:
    correct = output["needs_human"] == expected_human
    return {"escalation_accuracy": 1.0 if correct else 0.0}

evaluation = weave.Evaluation(
    dataset=eval_dataset,
    scorers=[accuracy_scorer, escalation_scorer],
)

# Run weekly — compare model versions, prompt changes
# Dashboard shows: intent accuracy, escalation precision, cost trends
```

## Step 5: Deploy on Lambda with Powertools

```typescript
// lambda/support-handler.ts
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import middy from "@middy/core";

const logger = new Logger({ serviceName: "support-ai" });
const metrics = new Metrics({ namespace: "SupportAI" });

const handler = async (event: APIGatewayProxyEvent) => {
  const { message, sessionId } = JSON.parse(event.body!);
  logger.appendKeys({ sessionId });

  // Classify (Outlines — local model, guaranteed structured)
  const classification = await classifyTicket(message);
  logger.info("Classified", { intent: classification.intent, urgency: classification.urgency });
  metrics.addMetric("QueryClassified", MetricUnit.Count, 1);
  metrics.addDimension("Intent", classification.intent);

  // Route to appropriate model (OpenRouter — multi-model)
  const complexity = classification.urgency >= 4 ? "complex" : classification.needs_human ? "moderate" : "simple";
  const response = await routeQuery(buildMessages(message, classification), complexity);

  metrics.addMetric("QueryCost", MetricUnit.None, estimateCost(response));
  metrics.addDimension("ModelTier", complexity);

  return {
    statusCode: 200,
    body: JSON.stringify({
      response: response.choices[0].message.content,
      classification,
      needsHuman: classification.needs_human,
    }),
  };
};

export const lambdaHandler = middy(handler)
  .use(injectLambdaContext(logger))
  .use(logMetrics(metrics));
```

## Results

After deploying the full pipeline, the support AI handles 2,000 queries/day with measurable improvements.

- **Cost reduction**: $800/mo → $180/mo (78% savings); simple queries routed to free/cheap models
- **Uptime**: 99.97% — automatic fallback caught 3 OpenAI outages; users never noticed
- **Structured output**: Zero parsing failures; Outlines guarantees valid classification on every query
- **Intent accuracy**: 94% measured via weekly Weave evaluations; improved from 87% by tuning prompts
- **Escalation precision**: 91% correct human escalation decisions; false negatives dropped from 15% to 4%
- **Observability**: Every query traced end-to-end; debug any issue in <2 minutes via Langtrace dashboard
- **Latency**: P50 = 340ms (simple), P50 = 890ms (complex); CloudWatch metrics via Powertools
- **Hallucination rate**: Tracked at 3.2% via Weave evaluations; down from unmeasured
