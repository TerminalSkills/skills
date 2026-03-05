---
title: Build a Production RAG System with Automated Evaluation
slug: build-production-rag-with-evaluation-pipeline
description: Build a customer support RAG chatbot using Mastra for agent orchestration, Ragas and DeepEval for quality evaluation, Braintrust for experiment tracking, and Portkey as the AI gateway with fallback routing and caching.
skills: [mastra, ragas, deepeval, braintrust, portkey]
category: AI & Machine Learning
tags: [rag, evaluation, ai-agents, observability, production, llm-testing]
---

# Build a Production RAG System with Automated Evaluation

Marta leads AI engineering at a 40-person B2B SaaS company. Their support team drowns in repetitive questions — password resets, billing inquiries, feature explanations — that could be answered from existing documentation. She needs a RAG chatbot that's actually reliable: grounded in real docs, evaluated continuously, and resilient to provider outages.

The challenge isn't building a demo. It's building something that doesn't hallucinate billing policy, stays online when OpenAI has an incident, and gets measurably better over time.

## Step 1: Set Up the AI Gateway

Before writing any agent logic, Marta configures Portkey as the gateway layer. Every LLM call routes through it — this gives her fallback routing, caching, and cost tracking from day one.

```typescript
// src/llm/gateway.ts — Centralized LLM gateway configuration
// All LLM calls go through Portkey, regardless of which provider serves them
import Portkey from "portkey-ai";

export const llmClient = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY!,
  config: {
    strategy: {
      mode: "fallback",            // Try providers in order on failure
    },
    targets: [
      {
        virtual_key: process.env.OPENAI_VK!,
        override_params: { model: "gpt-4o" },
        weight: 1,
      },
      {
        virtual_key: process.env.ANTHROPIC_VK!,
        override_params: { model: "claude-3-5-sonnet-20241022" },
        weight: 1,
      },
    ],
    retry: {
      attempts: 2,
      on_status_codes: [429, 500, 502, 503],
    },
    cache: {
      mode: "semantic",           // Cache similar questions (FAQ-heavy traffic)
      max_age: 1800,              // 30-minute TTL — docs don't change hourly
    },
  },
});
```

The semantic cache is critical for support bots. "How do I reset my password?" and "I forgot my password, help" are different strings but the same question. Portkey serves the cached response in ~50ms instead of making a $0.01 API call each time. For a bot handling 500 questions/day, that's real savings.

## Step 2: Build the Support Agent with Mastra

Marta uses Mastra to wire together the RAG pipeline — retrieval, generation, and tool use in a type-safe TypeScript framework.

```typescript
// src/agents/support.ts — Customer support agent with RAG and tool use
import { Agent, createTool } from "@mastra/core";
import { PgVector } from "@mastra/pg";
import { z } from "zod";
import { llmClient } from "../llm/gateway";

// Tool: Search the knowledge base for relevant documentation
const searchDocs = createTool({
  id: "search-docs",
  description: "Search the support knowledge base for articles relevant to the customer's question",
  inputSchema: z.object({
    query: z.string().describe("The search query derived from the customer question"),
    category: z.enum(["billing", "technical", "account", "general"]).optional()
      .describe("Optional category filter to narrow results"),
  }),
  outputSchema: z.object({
    documents: z.array(z.object({
      content: z.string(),
      title: z.string(),
      url: z.string(),
      score: z.number(),
    })),
  }),
  execute: async ({ context }) => {
    const vector = new PgVector(process.env.DATABASE_URL!);
    const embedding = await getEmbedding(context.query);

    const results = await vector.query("support-docs", {
      vector: embedding,
      topK: 5,
      filter: context.category ? { category: context.category } : {},
    });

    return {
      documents: results.map((r) => ({
        content: r.metadata.content,
        title: r.metadata.title,
        url: r.metadata.url,
        score: r.score,
      })),
    };
  },
});

// Tool: Create a support ticket when the bot can't resolve the issue
const createTicket = createTool({
  id: "create-ticket",
  description: "Create a support ticket for issues that require human agent intervention",
  inputSchema: z.object({
    summary: z.string().describe("Brief summary of the customer's issue"),
    priority: z.enum(["low", "medium", "high"]).describe("Issue urgency"),
    category: z.string().describe("Issue category for routing"),
  }),
  outputSchema: z.object({ ticketId: z.string(), estimatedResponse: z.string() }),
  execute: async ({ context }) => {
    const ticket = await ticketingSystem.create({
      summary: context.summary,
      priority: context.priority,
      category: context.category,
    });
    return {
      ticketId: ticket.id,
      estimatedResponse: context.priority === "high" ? "2 hours" : "24 hours",
    };
  },
});

// The support agent — combines retrieval, generation, and escalation
export const supportAgent = new Agent({
  name: "customer-support",
  model: llmClient,                // Routes through Portkey gateway
  instructions: `You are a customer support assistant for a B2B SaaS platform.

RULES:
- ONLY answer based on information from the knowledge base (search-docs tool)
- If the knowledge base doesn't contain the answer, say so and offer to create a ticket
- Never fabricate pricing, policies, or feature details
- Include relevant documentation links in your responses
- For billing disputes or account access issues, always create a ticket

TONE: Professional, concise, empathetic. One paragraph max per point.`,
  tools: { searchDocs, createTicket },
  memory: {
    store: new LibSQLStore({ url: process.env.TURSO_URL! }),
    contextWindow: { maxTokens: 3000, strategy: "recent" },
    semanticRecall: { topK: 2, messageRange: { before: 1, after: 0 } },
  },
});
```

The key design decision: the agent's instructions explicitly prohibit fabrication and mandate tool use. LLMs will confidently make up pricing details if you don't constrain them. The `searchDocs` tool forces grounding in actual documentation, and `createTicket` provides a graceful escape hatch for questions outside the knowledge base.

## Step 3: Build the Evaluation Test Suite

Before deploying, Marta builds a comprehensive test suite. She uses DeepEval for unit-style tests that run in CI, catching regressions on every code change.

```python
# tests/test_support_quality.py — Unit tests for the support agent
import pytest
from deepeval import assert_test
from deepeval.test_case import LLMTestCase, ConversationalTestCase
from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    HallucinationMetric,
    ToxicityMetric,
)

# --- Single-turn tests ---

def test_billing_question_is_faithful():
    """The agent must not invent pricing details."""
    test_case = LLMTestCase(
        input="What happens if I downgrade from Pro to Basic?",
        actual_output="When you downgrade from Pro to Basic, your Pro features remain active until the end of your current billing period. After that, you'll lose access to advanced analytics and priority support. Your data is retained for 90 days.",
        retrieval_context=[
            "Downgrade Policy: Pro features remain active until billing period ends. Basic plan does not include advanced analytics or priority support. Data retention: 90 days after downgrade.",
        ],
    )
    faithfulness = FaithfulnessMetric(threshold=0.85, model="gpt-4o")
    hallucination = HallucinationMetric(threshold=0.4)
    assert_test(test_case, [faithfulness, hallucination])


def test_unknown_question_escalates():
    """When the answer isn't in docs, the agent should offer to create a ticket."""
    test_case = LLMTestCase(
        input="Can you integrate with our custom ERP system built in 2019?",
        actual_output="I don't have specific information about custom ERP integrations in our knowledge base. I'd recommend creating a support ticket so our integrations team can assess compatibility. Would you like me to create one?",
        retrieval_context=[
            "Integrations: Native connectors for Salesforce, HubSpot, Slack, and Zapier. Custom integrations available via REST API.",
        ],
    )
    relevancy = AnswerRelevancyMetric(threshold=0.7)
    assert_test(test_case, [relevancy])


def test_angry_customer_gets_empathetic_response():
    """Even with hostile input, responses should remain professional."""
    test_case = LLMTestCase(
        input="This is the worst product I've ever used. Nothing works and your support is useless!",
        actual_output="I understand your frustration and I'm sorry you're having a bad experience. Let me help resolve this — could you tell me which specific features aren't working? I'll either find a solution or escalate to our senior support team right away.",
    )
    toxicity = ToxicityMetric(threshold=0.3)      # Very low tolerance for toxic responses
    relevancy = AnswerRelevancyMetric(threshold=0.6)
    assert_test(test_case, [toxicity, relevancy])


# --- Multi-turn conversation test ---

def test_context_maintained_across_turns():
    """The agent should remember what was discussed earlier in the conversation."""
    conversation = ConversationalTestCase(
        turns=[
            LLMTestCase(
                input="I'm having trouble with the API rate limits",
                actual_output="Our API rate limits depend on your plan. Basic: 100 req/min, Pro: 1000 req/min, Enterprise: custom. Which plan are you on?",
                retrieval_context=["Rate Limits: Basic 100/min, Pro 1000/min, Enterprise custom."],
            ),
            LLMTestCase(
                input="I'm on Pro but still getting 429 errors at 500 requests",
                actual_output="That's unusual — Pro allows 1000 req/min. The 429 errors at 500/min suggest the issue might be burst limiting. Our API enforces a 100 req/second burst limit within the per-minute quota. Try spacing your requests more evenly. If that doesn't help, I can create a ticket for the API team.",
                retrieval_context=[
                    "Rate Limits: Pro plan allows 1000 req/min with 100 req/sec burst limit.",
                    "Troubleshooting 429: Check burst limits, implement exponential backoff.",
                ],
            ),
        ],
    )
    from deepeval.metrics import ConversationRelevancyMetric
    assert_test(conversation, [ConversationRelevancyMetric(threshold=0.7)])
```

## Step 4: RAG-Specific Evaluation with Ragas

DeepEval catches individual failures. Ragas measures systemic quality — how well the entire retrieval + generation pipeline performs across hundreds of questions.

```python
# eval/rag_benchmark.py — Comprehensive RAG pipeline evaluation
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
    answer_correctness,
)
from ragas.testset import TestsetGenerator
from ragas.testset.evolutions import simple, reasoning, multi_context
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.document_loaders import DirectoryLoader
from datasets import Dataset

# Generate a diverse test set from the actual support documentation
def generate_eval_dataset():
    """Create synthetic Q&A pairs from support docs.

    Generates three types of questions:
    - Simple: direct factual lookups ("What is the rate limit for Pro?")
    - Reasoning: requires inference ("If I'm on Basic and need 500 req/min, what should I do?")
    - Multi-context: combines multiple docs ("Compare the security features across all plans")
    """
    loader = DirectoryLoader("./docs/support/", glob="**/*.md")
    documents = loader.load()
    print(f"Loaded {len(documents)} support documents")

    generator = TestsetGenerator.from_langchain(
        generator_llm=ChatOpenAI(model="gpt-4o"),
        critic_llm=ChatOpenAI(model="gpt-4o"),
        embeddings=OpenAIEmbeddings(),
    )

    testset = generator.generate_with_langchain_docs(
        documents,
        test_size=100,
        distributions={
            simple: 0.4,           # 40% straightforward questions
            reasoning: 0.35,       # 35% require reasoning
            multi_context: 0.25,   # 25% need multiple documents
        },
    )
    return testset.to_pandas()


def run_evaluation(rag_pipeline, test_df):
    """Run the full RAG pipeline and evaluate results.

    Args:
        rag_pipeline: The support agent with retrieval
        test_df: DataFrame with question, ground_truth columns
    """
    answers = []
    contexts = []

    for _, row in test_df.iterrows():
        result = rag_pipeline.query(row["question"])
        answers.append(result["answer"])
        contexts.append(result["retrieved_docs"])

    dataset = Dataset.from_dict({
        "question": test_df["question"].tolist(),
        "answer": answers,
        "contexts": contexts,
        "ground_truth": test_df["ground_truth"].tolist(),
    })

    results = evaluate(
        dataset=dataset,
        metrics=[
            faithfulness,          # Are answers grounded in context?
            answer_relevancy,      # Do answers address the question?
            context_precision,     # Is retrieval returning relevant docs?
            context_recall,        # Is retrieval finding all needed info?
            answer_correctness,    # Are answers factually correct?
        ],
    )

    print("\n=== RAG Evaluation Results ===")
    for metric, score in results.items():
        status = "✅" if score >= 0.80 else "⚠️" if score >= 0.65 else "❌"
        print(f"{status} {metric}: {score:.3f}")

    return results
```

## Step 5: Experiment Tracking with Braintrust

Every prompt change, model swap, or retrieval tweak is an experiment. Braintrust tracks them all so Marta can compare results and confidently ship improvements.

```typescript
// eval/experiments.ts — Track prompt and model experiments
import { Eval } from "braintrust";
import { supportAgent } from "../src/agents/support";

// Experiment: Compare different system prompts
Eval("support-agent-prompt-v4", {
  data: () => loadGoldenDataset("support-golden-set-v2"),

  task: async (input) => {
    const response = await supportAgent.generate(input.question, {
      threadId: `eval-${Date.now()}`,    // Isolated thread per eval
    });
    return response.text;
  },

  scores: [
    // Built-in: factual consistency check
    Factuality,

    // Custom: Does the response cite a documentation link?
    (args) => ({
      name: "cites_source",
      score: /https?:\/\//.test(args.output) ? 1.0 : 0.0,
    }),

    // Custom: Is the response concise enough for support?
    (args) => {
      const sentences = args.output.split(/[.!?]+/).filter(Boolean).length;
      return {
        name: "conciseness",
        score: sentences <= 5 ? 1.0 : Math.max(0, 1 - (sentences - 5) / 10),
      };
    },

    // Custom: Did it correctly escalate when it should?
    (args) => ({
      name: "correct_escalation",
      score: args.metadata?.should_escalate
        ? args.output.toLowerCase().includes("ticket") ? 1.0 : 0.0
        : 1.0,  // No escalation needed — auto-pass
    }),
  ],
});
```

## Step 6: Production Monitoring

With the agent deployed, Marta adds production observability. Every customer interaction is logged, scored, and monitored for quality degradation.

```typescript
// src/api/support.ts — Production endpoint with full observability
import braintrust from "braintrust";
import { supportAgent } from "../agents/support";

const logger = braintrust.init_logger({ project: "customer-support-bot" });

export async function handleSupportRequest(req: Request) {
  const { question, userId, sessionId } = await req.json();
  const startTime = Date.now();

  // Run the agent — Portkey handles routing, caching, fallback
  const response = await supportAgent.generate(question, {
    threadId: sessionId,
    resourceId: userId,
  });

  const latencyMs = Date.now() - startTime;

  // Log to Braintrust for monitoring and future evaluation
  logger.log({
    input: question,
    output: response.text,
    metadata: {
      user_id: userId,
      session_id: sessionId,
      latency_ms: latencyMs,
      tools_used: response.toolCalls?.map((t) => t.name) ?? [],
      cache_hit: response.headers?.["x-portkey-cache-status"] === "HIT",
    },
    scores: {
      // Lightweight heuristic scores (no LLM call, zero cost)
      response_length: Math.min(response.text.length / 1000, 1.0),
      has_link: /https?:\/\//.test(response.text) ? 1.0 : 0.0,
      used_tools: response.toolCalls?.length > 0 ? 1.0 : 0.0,
    },
    tags: ["production"],
  });

  return new Response(JSON.stringify({
    answer: response.text,
    sources: response.toolCalls
      ?.filter((t) => t.name === "search-docs")
      .flatMap((t) => t.result.documents.map((d) => ({ title: d.title, url: d.url }))),
  }));
}
```

## Results

After two weeks in production, Marta's dashboard shows:

The support bot handles 73% of incoming questions without human escalation. Faithfulness score sits at 0.91 — meaning 91% of answers are fully grounded in documentation, with the remaining 9% being partial matches that still get the gist right. Portkey's semantic cache serves 34% of requests from cache, cutting average latency from 2.1s to 890ms and saving roughly $180/month in API costs.

The evaluation pipeline catches problems early. When someone updated the pricing page without updating the support docs, context_recall dropped from 0.88 to 0.71 in the nightly Ragas run. The team spotted the discrepancy within a day and synced the docs.

The Braintrust experiment history shows clear improvement: prompt v1 scored 0.72 on faithfulness, v2 hit 0.84 after adding explicit "don't fabricate" instructions, and v4 reached 0.91 with better retrieval chunking. Each change is documented, comparable, and reversible.
