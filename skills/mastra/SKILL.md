---
name: mastra
description: Expert guidance for Mastra, the TypeScript-first framework for building AI agents, workflows, and RAG pipelines. Helps developers create production-ready AI applications with tool use, memory, and multi-step reasoning.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
  - ai-agents
  - typescript
  - workflows
  - rag
  - tool-use
---

# Mastra — TypeScript AI Agent Framework


## Overview


Mastra, the TypeScript-first framework for building AI agents, workflows, and RAG pipelines. Helps developers create production-ready AI applications with tool use, memory, and multi-step reasoning.


## Instructions

### Agent Creation

Build agents with system prompts, tools, and model configuration:

```typescript
// src/agents/researcher.ts — Research agent with web search tools
import { Agent } from '@mastra/core';
import { openai } from '@mastra/openai';

const researcher = new Agent({
  name: 'researcher',
  model: openai('gpt-4o'),
  instructions: `You are a research assistant. Use the provided tools
    to find accurate, up-to-date information. Always cite sources.
    Prefer primary sources over secondary ones.`,
  tools: {
    webSearch,      // Search the web for information
    readWebpage,    // Extract content from URLs
    saveNote,       // Persist findings to memory
  },
});

// Execute the agent with a user query
const result = await researcher.generate(
  'What are the latest trends in AI agent frameworks?'
);
```

### Tool Definition

Create type-safe tools that agents can invoke:

```typescript
// src/tools/web-search.ts — Tool for searching the web
import { createTool } from '@mastra/core';
import { z } from 'zod';

export const webSearch = createTool({
  id: 'web-search',
  description: 'Search the web for current information on any topic',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().default(5).describe('Number of results to return'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
    })),
  }),
  execute: async ({ context }) => {
    // context.query and context.maxResults are type-safe
    const response = await fetch(
      `https://api.search.example/v1?q=${encodeURIComponent(context.query)}&limit=${context.maxResults}`
    );
    const data = await response.json();
    return {
      results: data.items.map((item: any) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
      })),
    };
  },
});
```

### Workflow Orchestration

Define multi-step workflows with branching, parallel execution, and error handling:

```typescript
// src/workflows/content-pipeline.ts — Multi-step content creation workflow
import { Workflow, Step } from '@mastra/core';
import { z } from 'zod';

const contentPipeline = new Workflow({
  name: 'content-pipeline',
  triggerSchema: z.object({
    topic: z.string(),
    targetAudience: z.string(),
    format: z.enum(['blog', 'thread', 'newsletter']),
  }),
});

// Step 1: Research the topic
const research = new Step({
  id: 'research',
  execute: async ({ context }) => {
    const findings = await researcher.generate(
      `Research "${context.triggerData.topic}" for ${context.triggerData.targetAudience}`
    );
    return { findings: findings.text };
  },
});

// Step 2: Generate outline based on research
const outline = new Step({
  id: 'outline',
  execute: async ({ context }) => {
    const researchData = context.getStepResult('research');
    const draft = await writer.generate(
      `Create a ${context.triggerData.format} outline about: ${researchData.findings}`
    );
    return { outline: draft.text };
  },
});

// Step 3: Write final content
const write = new Step({
  id: 'write',
  execute: async ({ context }) => {
    const outlineData = context.getStepResult('outline');
    const content = await writer.generate(
      `Write the full content following this outline: ${outlineData.outline}`
    );
    return { content: content.text };
  },
});

// Chain steps: research → outline → write
contentPipeline
  .step(research)
  .then(outline)
  .then(write)
  .commit();
```

### RAG (Retrieval-Augmented Generation)

Set up document ingestion, embedding, and retrieval:

```typescript
// src/rag/knowledge-base.ts — RAG pipeline with vector storage
import { Mastra } from '@mastra/core';
import { PgVector } from '@mastra/pg';
import { openai } from '@mastra/openai';

const mastra = new Mastra({
  vectors: {
    pgVector: new PgVector(process.env.DATABASE_URL!),
  },
});

// Ingest documents into the vector store
async function ingestDocuments(docs: { content: string; metadata: Record<string, any> }[]) {
  const chunks = await mastra.rag.chunk(docs, {
    strategy: 'recursive',     // Split by paragraphs, then sentences
    chunkSize: 512,            // ~512 tokens per chunk
    chunkOverlap: 50,          // 50-token overlap for context continuity
  });

  const embeddings = await mastra.rag.embed(chunks, {
    provider: 'OPEN_AI',
    model: 'text-embedding-3-small',
  });

  await mastra.vectors.pgVector.upsert('knowledge-base', embeddings);
}

// Query the knowledge base with semantic search
async function queryKnowledge(question: string) {
  const queryEmbedding = await mastra.rag.embed([{ content: question }], {
    provider: 'OPEN_AI',
    model: 'text-embedding-3-small',
  });

  const results = await mastra.vectors.pgVector.query('knowledge-base', {
    vector: queryEmbedding[0].embedding,
    topK: 5,                   // Return top 5 most relevant chunks
    filter: {},                // Optional metadata filters
  });

  return results;
}
```

### Memory and Context

Persist conversation history and agent state:

```typescript
// src/memory/setup.ts — Configure agent memory with LibSQL
import { Agent } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';

const agent = new Agent({
  name: 'assistant',
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant with persistent memory.',
  memory: {
    store: new LibSQLStore({
      url: process.env.TURSO_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    }),
    // Memory configuration
    contextWindow: {
      maxTokens: 4000,         // Max tokens to include from history
      strategy: 'recent',      // Use most recent messages
    },
    semanticRecall: {
      topK: 3,                 // Include 3 semantically relevant past messages
      messageRange: {
        before: 2,             // Include 2 messages before each match for context
        after: 1,              // Include 1 message after each match
      },
    },
  },
});

// Conversations automatically persist across sessions
const response = await agent.generate('Remember that my name is Alex', {
  threadId: 'user-123',       // Thread ID groups related messages
  resourceId: 'user-123',     // Resource ID identifies the user
});
```

### Integration with External Services

Connect agents to APIs and third-party services:

```typescript
// src/integrations/setup.ts — Connect Mastra to external services
import { Mastra } from '@mastra/core';
import { GithubIntegration } from '@mastra/github';
import { SlackIntegration } from '@mastra/slack';

const mastra = new Mastra({
  integrations: [
    new GithubIntegration({
      config: {
        PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN!,
      },
    }),
    new SlackIntegration({
      config: {
        SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN!,
      },
    }),
  ],
});

// Integrations automatically provide tools to agents
// e.g., github_create_issue, slack_post_message
const devAgent = new Agent({
  name: 'dev-assistant',
  model: openai('gpt-4o'),
  instructions: 'Help developers manage their GitHub repos and Slack notifications.',
  tools: {
    ...mastra.getIntegration('github').getTools(),
    ...mastra.getIntegration('slack').getTools(),
  },
});
```

## Project Setup

Initialize a new Mastra project:

```bash
# Create new Mastra project with CLI
npx create-mastra@latest my-ai-app

# Or add to existing project
npm install @mastra/core @mastra/openai

# Start development server with hot reload
npx mastra dev
```

Mastra dev server provides:
- Agent playground UI at `localhost:4111`
- REST API endpoints for all agents and workflows
- Real-time logs and debugging tools
- Swagger documentation auto-generated


## Examples


### Example 1: Integrating Mastra into an existing application

**User request:**

```
Add Mastra to my Next.js app for the AI chat feature. I want streaming responses.
```

The agent installs the SDK, creates an API route that initializes the Mastra client, configures streaming, selects an appropriate model, and wires up the frontend to consume the stream. It handles error cases and sets up proper environment variable management for the API key.

### Example 2: Optimizing tool definition performance

**User request:**

```
My Mastra calls are slow and expensive. Help me optimize the setup.
```

The agent reviews the current implementation, identifies issues (wrong model selection, missing caching, inefficient prompting, no batching), and applies optimizations specific to Mastra's capabilities — adjusting model parameters, adding response caching, and implementing retry logic with exponential backoff.


## Guidelines

1. **Type everything** — Use Zod schemas for all tool inputs/outputs; Mastra infers types automatically
2. **Small, focused agents** — One agent per domain; compose them via workflows rather than building monoliths
3. **Tool descriptions matter** — LLMs choose tools based on descriptions; be specific and include examples
4. **Test with evals** — Use `@mastra/evals` to measure agent quality (faithfulness, relevance, completeness)
5. **Structured output** — Use `generate({ schema })` to get typed JSON responses instead of raw text
6. **Error boundaries** — Wrap tool executions in try/catch; return meaningful error messages the agent can reason about
7. **Observe everything** — Enable telemetry with OpenTelemetry for production debugging
8. **Version your prompts** — Store system instructions in separate files; track changes in git
