---
name: anthropic-sdk
description: >-
  Integrate Claude AI into applications with the Anthropic SDK. Use when a user
  asks to add Claude to an app, use Claude for text generation, build a chatbot
  with Claude, use Claude's long context window, implement tool use with Claude,
  stream Claude responses, use Claude for code generation, document analysis,
  or reasoning tasks. Covers Messages API, streaming, tool use, vision,
  system prompts, extended thinking, and batch processing.
license: Apache-2.0
compatibility: 'Node.js 18+, Python 3.8+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ai
  tags:
    - anthropic
    - claude
    - llm
    - ai
    - tool-use
    - reasoning
---

# Anthropic SDK

## Overview

The Anthropic SDK provides access to Claude models (Opus, Sonnet, Haiku) for text generation, analysis, coding, and reasoning. Claude excels at long-context understanding (200K tokens), careful instruction following, code generation, and complex reasoning. This skill covers the Messages API, streaming, tool use (function calling), vision, extended thinking, system prompts, and best practices for prompt engineering with Claude.

## Instructions

### Step 1: Installation

```bash
# Node.js
npm install @anthropic-ai/sdk

# Python
pip install anthropic
```

```typescript
// lib/anthropic.ts — Client initialization
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})
```

### Step 2: Messages API

```typescript
// chat.ts — Basic message creation
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  system: 'You are a senior software engineer. Provide clear, production-ready code with comments.',
  messages: [
    { role: 'user', content: 'Write a rate limiter middleware for Express.js using a sliding window algorithm.' },
  ],
})

console.log(message.content[0].type === 'text' ? message.content[0].text : '')
// message.usage: { input_tokens: 42, output_tokens: 512 }
```

```python
# Python equivalent
import anthropic

client = anthropic.Anthropic()

message = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    system="You are a senior software engineer.",
    messages=[
        {"role": "user", "content": "Write a rate limiter for Express.js."}
    ],
)
print(message.content[0].text)
```

### Step 3: Streaming

```typescript
// stream.ts — Stream responses for real-time UI
const stream = anthropic.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Explain how B-trees work.' }],
})

for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text)
  }
}

// Or using the helper
const stream2 = anthropic.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Explain B-trees.' }],
})

stream2.on('text', (text) => process.stdout.write(text))
await stream2.finalMessage()
```

### Step 4: Tool Use (Function Calling)

```typescript
// tools.ts — Let Claude call your functions
const tools: Anthropic.Tool[] = [
  {
    name: 'get_stock_price',
    description: 'Get the current stock price for a ticker symbol. Use when the user asks about stock prices.',
    input_schema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Stock ticker symbol (e.g., AAPL, GOOGL)' },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'execute_sql',
    description: 'Execute a read-only SQL query against the analytics database.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL SELECT query to execute' },
      },
      required: ['query'],
    },
  },
]

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  tools,
  messages: [{ role: 'user', content: 'What is Apple stock at right now?' }],
})

// Process tool use
if (response.stop_reason === 'tool_use') {
  const toolUse = response.content.find(b => b.type === 'tool_use')!
  const result = await executeFunction(toolUse.name, toolUse.input)

  // Send result back to Claude
  const finalResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    tools,
    messages: [
      { role: 'user', content: 'What is Apple stock at right now?' },
      { role: 'assistant', content: response.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) }] },
    ],
  })
}
```

### Step 5: Vision

```typescript
// vision.ts — Analyze images with Claude
import { readFileSync } from 'fs'

// URL-based image
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'url', url: 'https://example.com/chart.png' } },
      { type: 'text', text: 'Analyze this chart. What trends do you see?' },
    ],
  }],
})

// Base64 image (from file)
const imageData = readFileSync('screenshot.png').toString('base64')
const response2 = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageData } },
      { type: 'text', text: 'Extract all text and data from this screenshot.' },
    ],
  }],
})
```

### Step 6: Extended Thinking

```typescript
// thinking.ts — Enable extended thinking for complex reasoning tasks
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 16000,
  thinking: {
    type: 'enabled',
    budget_tokens: 10000,    // tokens allocated for internal reasoning
  },
  messages: [{
    role: 'user',
    content: 'Analyze this codebase for security vulnerabilities and provide a prioritized remediation plan.',
  }],
})

// Response contains both thinking blocks and text blocks
for (const block of response.content) {
  if (block.type === 'thinking') {
    console.log('Reasoning:', block.thinking)
  } else if (block.type === 'text') {
    console.log('Response:', block.text)
  }
}
```

### Step 7: Multi-Turn Conversations

```typescript
// conversation.ts — Maintain conversation history
const messages: Anthropic.MessageParam[] = []

async function chat(userMessage: string): Promise<string> {
  messages.push({ role: 'user', content: userMessage })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: 'You are a helpful assistant for a project management app.',
    messages,
  })

  const assistantContent = response.content
  messages.push({ role: 'assistant', content: assistantContent })

  return assistantContent.filter(b => b.type === 'text').map(b => b.text).join('')
}
```

## Examples

### Example 1: Build a code review bot
**User prompt:** "Build a bot that reviews pull requests. It should analyze the diff, check for bugs, security issues, and style problems, then post inline comments."

The agent will:
1. Fetch PR diff via GitHub API.
2. Send the diff to Claude with a system prompt tuned for code review.
3. Use structured output to get file-specific comments with line numbers.
4. Post comments back to GitHub using the PR review API.

### Example 2: Document analysis pipeline with tool use
**User prompt:** "Build a system where users upload contracts and ask questions about them. The AI should be able to search across multiple documents and cite specific sections."

The agent will:
1. Store document chunks with embeddings in a vector database.
2. Define a `search_documents` tool that Claude can call.
3. Claude formulates search queries, retrieves relevant chunks, and synthesizes answers with citations.
4. Use Claude's 200K context window for full-document analysis when documents are small enough.

## Guidelines

- Claude Sonnet is the best default for most tasks — it balances quality, speed, and cost. Use Opus for the most complex reasoning and Haiku for high-volume, simple tasks.
- Write detailed system prompts — Claude follows instructions carefully. Specify output format, constraints, tone, and edge case handling in the system prompt.
- Use extended thinking for complex reasoning (math, multi-step analysis, code architecture). The thinking budget controls how much Claude reasons before responding.
- Claude supports 200K token context windows — use this for long document analysis, large codebases, and conversations with extensive history.
- For tool use, provide clear descriptions and examples in the tool definition. Claude uses descriptions (not just parameter names) to decide when and how to call tools.
- Always handle the `stop_reason` field: `end_turn` means done, `tool_use` means Claude wants to call a function, `max_tokens` means the response was truncated.
