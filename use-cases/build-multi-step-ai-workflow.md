---
title: "Build a Multi-Step AI Workflow with LangGraph"
description: "Chain multiple AI agents into a DAG-based workflow with parallel execution, state management, and human-in-the-loop approvals."
skills: [langchain, langgraph, anthropic-sdk]
difficulty: advanced
time_estimate: "5 hours"
tags: [ai, agents, langgraph, workflow, automation, langchain, anthropic]
---

# Build a Multi-Step AI Workflow with LangGraph

> **Persona:** You're automating a research-to-article pipeline: find sources, analyze them, draft content, fact-check, then publish — all orchestrated without babysitting each step.

Single LLM calls are fine. But real tasks need coordination: steps that depend on each other, steps that can run in parallel, human checkpoints before irreversible actions. LangGraph gives you a proper execution graph for all of this.

## What You're Building

```
[Search] → [Scrape URLs] ──┐
                           ├→ [Analyze] → [Draft] → [Human Review] → [Publish]
[Fetch DB Context] ────────┘
```

## Setup

```bash
npm install @langchain/langgraph @langchain/anthropic @langchain/core zod
```

## Define the Workflow State

```typescript
// workflow/state.ts
import { Annotation } from '@langchain/langgraph';

export const ResearchState = Annotation.Root({
  topic: Annotation<string>(),
  searchResults: Annotation<string[]>({ default: () => [] }),
  scrapedContent: Annotation<string[]>({ default: () => [] }),
  dbContext: Annotation<string>({ default: () => '' }),
  analysis: Annotation<string>({ default: () => '' }),
  draft: Annotation<string>({ default: () => '' }),
  humanApproved: Annotation<boolean>({ default: () => false }),
  publishedUrl: Annotation<string | null>({ default: () => null }),
  errors: Annotation<string[]>({ default: () => [] }),
});

export type WorkflowState = typeof ResearchState.State;
```

## Step Nodes

```typescript
// workflow/nodes.ts
import { ChatAnthropic } from '@langchain/anthropic';

const model = new ChatAnthropic({ model: 'claude-opus-4-5' });

// Parallel: search web for sources
export async function searchNode(state: WorkflowState) {
  const results = await webSearch(state.topic, { maxResults: 10 });
  return { searchResults: results.map(r => r.url) };
}

// Parallel: fetch internal DB context
export async function dbContextNode(state: WorkflowState) {
  const context = await db.query(
    `SELECT summary FROM knowledge_base WHERE topic_match($1) LIMIT 5`,
    [state.topic]
  );
  return { dbContext: context.rows.map(r => r.summary).join('\n') };
}

// Runs after search: scrape content from URLs
export async function scrapeNode(state: WorkflowState) {
  const content = await Promise.allSettled(
    state.searchResults.slice(0, 5).map(url => fetchAndExtract(url))
  );
  const scraped = content
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<string>).value);
  return { scrapedContent: scraped };
}

// Synthesize all gathered info
export async function analyzeNode(state: WorkflowState) {
  const response = await model.invoke([{
    role: 'user',
    content: `Analyze these sources about "${state.topic}":

INTERNAL CONTEXT:
${state.dbContext}

WEB SOURCES:
${state.scrapedContent.join('\n\n---\n\n')}

Identify key themes, data points, controversies, and gaps.`
  }]);
  return { analysis: response.content as string };
}

// Write the article
export async function draftNode(state: WorkflowState) {
  const response = await model.invoke([{
    role: 'user',
    content: `Write a 800-word article about "${state.topic}" based on this analysis:
${state.analysis}

Include specific data points and cite sources inline.`
  }]);
  return { draft: response.content as string };
}

// Human checkpoint — pause and wait
export async function humanReviewNode(state: WorkflowState) {
  // In production: send Slack/email with draft, wait for webhook
  console.log('\n=== DRAFT FOR REVIEW ===\n', state.draft);
  const approved = await promptUser('Approve this draft? (y/n): ');
  return { humanApproved: approved === 'y' };
}

// Publish only if approved
export async function publishNode(state: WorkflowState) {
  if (!state.humanApproved) return { publishedUrl: null };
  const url = await cms.publish({ content: state.draft, topic: state.topic });
  return { publishedUrl: url };
}
```

## Build the Graph

```typescript
// workflow/graph.ts
import { StateGraph, START, END } from '@langchain/langgraph';

export function buildWorkflow() {
  const graph = new StateGraph(ResearchState)
    // Add all nodes
    .addNode('search', searchNode)
    .addNode('dbContext', dbContextNode)
    .addNode('scrape', scrapeNode)
    .addNode('analyze', analyzeNode)
    .addNode('draft', draftNode)
    .addNode('humanReview', humanReviewNode)
    .addNode('publish', publishNode)

    // Parallel start: kick off search + DB fetch simultaneously
    .addEdge(START, 'search')
    .addEdge(START, 'dbContext')

    // Scrape waits for search results
    .addEdge('search', 'scrape')

    // Analyze waits for BOTH scrape and dbContext
    .addEdge('scrape', 'analyze')
    .addEdge('dbContext', 'analyze')

    // Linear from analysis onward
    .addEdge('analyze', 'draft')
    .addEdge('draft', 'humanReview')

    // Conditional: only publish if approved
    .addConditionalEdges('humanReview', (state) => {
      return state.humanApproved ? 'publish' : END;
    })
    .addEdge('publish', END);

  return graph.compile();
}
```

## Error Handling and Retries

```typescript
// Wrap nodes with retry logic
function withRetry<T>(fn: (state: T) => Promise<Partial<T>>, maxRetries = 3) {
  return async (state: T): Promise<Partial<T>> => {
    let lastError: Error;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn(state);
      } catch (err) {
        lastError = err as Error;
        if (i < maxRetries - 1) {
          await sleep(1000 * 2 ** i); // exponential backoff
        }
      }
    }
    // Fallback: record error in state, continue workflow
    return { errors: [...(state as any).errors, lastError!.message] } as Partial<T>;
  };
}

// Apply to unreliable nodes
.addNode('scrape', withRetry(scrapeNode))
.addNode('search', withRetry(searchNode, 2))
```

## Stream Execution with Progress

```typescript
// main.ts
const workflow = buildWorkflow();

const stream = await workflow.stream(
  { topic: 'quantum computing breakthroughs 2025' },
  { streamMode: 'updates' }
);

for await (const update of stream) {
  const [nodeName, state] = Object.entries(update)[0];
  console.log(`✓ Completed: ${nodeName}`);

  if (nodeName === 'draft') {
    console.log('Draft preview:', (state as any).draft?.slice(0, 200) + '...');
  }
}

const finalState = await workflow.invoke({ topic: 'quantum computing breakthroughs 2025' });
console.log('Published at:', finalState.publishedUrl);
```

## Checkpointing for Long-Running Workflows

```typescript
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
await checkpointer.setup();

const workflow = buildWorkflow().compile({ checkpointer });

// Resume interrupted workflows by thread ID
const threadId = 'research-quantum-2025-03';
await workflow.invoke(
  { topic: 'quantum computing' },
  { configurable: { thread_id: threadId } }
);
```

## What to Build Next

- **Dynamic branching:** Use LLM to decide which steps to run based on topic type
- **Sub-graphs:** Encapsulate the research loop as a reusable sub-workflow
- **Webhook-based human review:** Replace CLI prompt with Slack approval button
- **Cost tracking:** Log token usage per node to optimize expensive steps
