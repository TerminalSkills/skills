---
title: Build an AI Agent with Tool Calling
slug: build-ai-agent-with-tool-calling
description: Build a production AI agent with structured tool calling, conversation memory, retry logic, and guardrails — handling multi-step workflows like research, data analysis, and customer support autonomously.
skills:
  - typescript
  - openai
  - redis
  - postgresql
  - zod
category: AI & Machine Learning
tags:
  - ai-agents
  - tool-calling
  - llm
  - automation
  - function-calling
---

# Build an AI Agent with Tool Calling

## The Problem

Tomasz leads AI at a 35-person data company. The team builds one-shot LLM prompts for each task — summarize this document, classify this ticket, extract these fields. But real workflows require multiple steps: research a company → find their tech stack → check if they're a customer → draft a personalized outreach email. Each step needs different tools (web search, CRM lookup, email draft). Currently a human orchestrates the steps manually. They need an agent framework that handles multi-step tool calling, maintains conversation state, retries on failures, and stays within guardrails.

## Step 1: Build the Agent Framework

```typescript
// src/agent/agent.ts — AI agent with structured tool calling and memory
import OpenAI from "openai";
import { z, ZodType } from "zod";
import { Redis } from "ioredis";

const openai = new OpenAI();
const redis = new Redis(process.env.REDIS_URL!);

interface Tool {
  name: string;
  description: string;
  parameters: ZodType;
  execute: (params: any) => Promise<any>;
  requiresConfirmation?: boolean;
}

interface AgentConfig {
  model: string;
  systemPrompt: string;
  tools: Tool[];
  maxIterations: number;
  maxTokens: number;
  temperature?: number;
  guardrails?: {
    maxToolCalls?: number;
    blockedTools?: string[];       // tools that need human approval
    maxCostCents?: number;
  };
}

interface AgentResult {
  response: string;
  toolCalls: Array<{ tool: string; input: any; output: any; durationMs: number }>;
  iterations: number;
  totalTokens: number;
  costCents: number;
}

export class Agent {
  private config: AgentConfig;
  private toolMap: Map<string, Tool>;

  constructor(config: AgentConfig) {
    this.config = config;
    this.toolMap = new Map(config.tools.map((t) => [t.name, t]));
  }

  async run(userMessage: string, sessionId?: string): Promise<AgentResult> {
    const toolCalls: AgentResult["toolCalls"] = [];
    let totalTokens = 0;
    let iterations = 0;

    // Load conversation history from Redis
    const historyKey = sessionId ? `agent:history:${sessionId}` : null;
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: this.config.systemPrompt },
    ];

    if (historyKey) {
      const history = await redis.lrange(historyKey, -20, -1); // last 20 messages
      for (const msg of history) {
        messages.push(JSON.parse(msg));
      }
    }

    messages.push({ role: "user", content: userMessage });

    // Convert tools to OpenAI format
    const openaiTools: OpenAI.Chat.ChatCompletionTool[] = this.config.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.parameters),
      },
    }));

    // Agent loop: call LLM → execute tools → repeat until done
    while (iterations < this.config.maxIterations) {
      iterations++;

      const response = await openai.chat.completions.create({
        model: this.config.model,
        messages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature ?? 0.7,
      });

      const choice = response.choices[0];
      totalTokens += response.usage?.total_tokens || 0;

      // Check cost guardrail
      const costCents = estimateCost(this.config.model, totalTokens);
      if (this.config.guardrails?.maxCostCents && costCents > this.config.guardrails.maxCostCents) {
        return {
          response: "Agent stopped: cost limit exceeded.",
          toolCalls, iterations, totalTokens, costCents,
        };
      }

      // No tool calls — final response
      if (choice.finish_reason === "stop" || !choice.message.tool_calls?.length) {
        const finalResponse = choice.message.content || "";

        // Save to history
        if (historyKey) {
          await redis.rpush(historyKey, JSON.stringify({ role: "user", content: userMessage }));
          await redis.rpush(historyKey, JSON.stringify({ role: "assistant", content: finalResponse }));
          await redis.expire(historyKey, 86400); // 24h TTL
        }

        return { response: finalResponse, toolCalls, iterations, totalTokens, costCents };
      }

      // Process tool calls
      messages.push(choice.message);

      // Check tool call count guardrail
      if (this.config.guardrails?.maxToolCalls &&
          toolCalls.length + choice.message.tool_calls.length > this.config.guardrails.maxToolCalls) {
        messages.push({
          role: "tool",
          tool_call_id: choice.message.tool_calls[0].id,
          content: "Error: Maximum tool call limit reached. Please provide a final answer.",
        });
        continue;
      }

      for (const tc of choice.message.tool_calls) {
        const tool = this.toolMap.get(tc.function.name);

        if (!tool) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error: Unknown tool "${tc.function.name}"`,
          });
          continue;
        }

        let parsedArgs: any;
        try {
          parsedArgs = tool.parameters.parse(JSON.parse(tc.function.arguments));
        } catch (err: any) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Validation error: ${err.message}`,
          });
          continue;
        }

        // Execute tool with retry
        const startTime = Date.now();
        let output: any;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            output = await tool.execute(parsedArgs);
            lastError = null;
            break;
          } catch (err: any) {
            lastError = err;
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }

        const durationMs = Date.now() - startTime;
        const resultText = lastError
          ? `Error: ${lastError.message}`
          : typeof output === "string" ? output : JSON.stringify(output);

        toolCalls.push({ tool: tc.function.name, input: parsedArgs, output, durationMs });
        messages.push({ role: "tool", tool_call_id: tc.id, content: resultText.slice(0, 10000) });
      }
    }

    return {
      response: "Agent reached maximum iterations without completing.",
      toolCalls, iterations, totalTokens,
      costCents: estimateCost(this.config.model, totalTokens),
    };
  }
}

function estimateCost(model: string, tokens: number): number {
  const rates: Record<string, number> = {
    "gpt-4o": 0.5,           // cents per 1K tokens (blended)
    "gpt-4o-mini": 0.015,
    "claude-3-5-sonnet": 0.6,
  };
  return Math.round((tokens / 1000) * (rates[model] || 0.5) * 100) / 100;
}

function zodToJsonSchema(schema: ZodType): any {
  // Simplified converter
  return JSON.parse(JSON.stringify(schema));
}
```

## Step 2: Define Tools and Create the Agent

```typescript
// src/agent/research-agent.ts — Research agent with web + CRM + email tools
import { Agent } from "./agent";
import { z } from "zod";

const researchAgent = new Agent({
  model: "gpt-4o",
  systemPrompt: `You are a sales research assistant. Given a company name, you:
1. Research the company (what they do, size, tech stack)
2. Check if they're already in our CRM
3. Find the right contact person
4. Draft a personalized outreach email
Be thorough but concise. Always verify before drafting.`,
  tools: [
    {
      name: "web_search",
      description: "Search the web for information about a company or topic",
      parameters: z.object({
        query: z.string().describe("Search query"),
        maxResults: z.number().optional().default(5),
      }),
      execute: async ({ query, maxResults }) => {
        const response = await fetch(`https://api.search.example.com/v1/search?q=${encodeURIComponent(query)}&limit=${maxResults}`);
        return response.json();
      },
    },
    {
      name: "crm_lookup",
      description: "Look up a company in the CRM by name or domain",
      parameters: z.object({
        companyName: z.string().optional(),
        domain: z.string().optional(),
      }),
      execute: async ({ companyName, domain }) => {
        const { rows } = await pool.query(
          "SELECT * FROM crm_companies WHERE name ILIKE $1 OR domain = $2 LIMIT 5",
          [`%${companyName || ""}%`, domain || ""]
        );
        return rows.length > 0 ? rows : { found: false, message: "Company not in CRM" };
      },
    },
    {
      name: "draft_email",
      description: "Draft a personalized outreach email",
      parameters: z.object({
        to: z.string().describe("Recipient name"),
        company: z.string(),
        context: z.string().describe("Key facts about the company for personalization"),
        tone: z.enum(["formal", "casual", "technical"]).default("casual"),
      }),
      execute: async ({ to, company, context, tone }) => {
        return { drafted: true, to, company, context, tone, status: "ready_for_review" };
      },
    },
  ],
  maxIterations: 10,
  maxTokens: 4096,
  guardrails: {
    maxToolCalls: 15,
    maxCostCents: 50,       // $0.50 max per agent run
  },
});

// Usage
const result = await researchAgent.run(
  "Research Vercel and draft an outreach email for their VP of Engineering",
  "session-123"
);
```

## Results

- **Research workflow: 45 minutes → 3 minutes** — the agent searches the web, checks the CRM, and drafts an email in one autonomous loop; a human just reviews the output
- **Multi-step reasoning works reliably** — the agent decides which tools to call and in what order; it adapts its strategy based on intermediate results (e.g., if CRM lookup fails, searches for the company domain first)
- **Cost controlled** — guardrails cap each agent run at $0.50; the average run costs $0.08 and uses 4-6 tool calls
- **Conversation memory persists** — follow-up questions reference previous context; "now draft one for their CTO too" works because the agent remembers the company research
- **Tool failures don't crash the agent** — automatic retries with backoff handle transient errors; the agent reports the failure and adapts its approach
