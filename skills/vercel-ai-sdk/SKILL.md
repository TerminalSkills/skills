---
name: vercel-ai-sdk
description: >-
  Assists with building AI-powered applications using the Vercel AI SDK. Use when streaming
  LLM responses, generating structured data with Zod, building chat interfaces, creating
  multi-step agents with tool calling, or implementing RAG. Trigger words: vercel ai sdk,
  ai sdk, streamText, generateObject, useChat, tool calling, ai agent.
license: Apache-2.0
compatibility: "Requires Node.js 18+ with React 18+ for UI hooks"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["vercel-ai-sdk", "ai", "llm", "streaming", "structured-output"]
---

# Vercel AI SDK

## Overview

The Vercel AI SDK provides a unified TypeScript API for building AI applications with streaming text generation, structured output via Zod schemas, multi-step tool-calling agents, and React hooks for chat interfaces. It supports swapping between OpenAI, Anthropic, Google, and other providers without changing application code.

## Instructions

- When generating text, use `streamText()` for chat and long responses so users see tokens immediately, and `generateText()` for single-shot non-streaming generation.
- When producing structured data, use `generateObject()` or `streamObject()` with Zod schemas for typed JSON output, and always set `maxTokens` to prevent runaway costs.
- When building agents, define tools with Zod input schemas and `execute()` functions, set `maxSteps` for multi-step reasoning loops, and use `onStepFinish` for logging agent actions.
- When creating chat UIs, use `useChat()` React hook for automatic message management, streaming, loading states, and error handling. For Server Components, use `createStreamableUI()`.
- When swapping providers, use the provider abstraction (`openai("gpt-4o")`, `anthropic("claude-4-sonnet")`) to change models in one line without altering application code.
- When implementing RAG, use `embed()` / `embedMany()` for vector embeddings and `cosineSimilarity()` for comparison, integrating with vector databases like Pinecone, Chroma, or pgvector.
- When streaming to the UI, always stream with `useChat()` or RSC; never buffer the entire response before displaying.

## Examples

### Example 1: Build a streaming chat interface

**User request:** "Create an AI chat interface with Next.js and the Vercel AI SDK"

**Actions:**
1. Set up a Server Action or API route with `streamText()` and the chosen provider
2. Implement the chat UI with `useChat()` hook for messages, input, and streaming
3. Add system prompt and configure `maxTokens` for cost control
4. Display streaming tokens in real-time with loading indicators

**Output:** A responsive chat interface with real-time streaming and automatic message history management.

### Example 2: Create a structured data extraction agent

**User request:** "Build an agent that extracts data from web pages using tools"

**Actions:**
1. Define tools for web fetching, data extraction, and validation with Zod schemas
2. Configure `streamText()` with `maxSteps: 5` for multi-step reasoning
3. Use `generateObject()` for final structured output validated against a schema
4. Add `onStepFinish` callbacks for logging and monitoring agent decisions

**Output:** A multi-step agent that fetches, analyzes, and structures web data into validated JSON.

## Guidelines

- Use `streamText()` for chat and long responses; users see tokens immediately instead of waiting.
- Always define Zod schemas for `generateObject()`; do not rely on prompt-based JSON.
- Set `maxTokens` on all generation calls to prevent runaway costs from long completions.
- Use the provider abstraction to swap models in one line without changing application code.
- Keep tool `execute()` functions focused: one API call or one database query per tool.
- Use `onStepFinish` to log agent actions; debugging multi-step agents without logs is impractical.
- Stream to the UI with `useChat()` or RSC; never buffer the entire response before displaying.
