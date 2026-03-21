---
title: "Build a Personal AI Assistant App"
description: "Replace multiple productivity apps with one AI that manages your tasks, calendar, and information — with memory across sessions."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "12 hours"
tags: [ai, productivity, calendar, tasks, memory, anthropic, prisma]
---

# Build a Personal AI Assistant App

## The Problem

You're juggling Todoist, Google Calendar, Notion, and three browser tabs just to stay on top of your day. Every tool is a separate context switch. What if one AI could handle all of it — and remember what you told it last week?

## What You'll Build

A personal AI assistant that:
- Answers questions and summarizes information via a chat interface
- Reads and writes your Google Calendar via OAuth
- Manages tasks with AI-powered prioritization
- Remembers your preferences and past conversations across sessions
- Sends proactive morning briefings and deadline alerts

## Persona

**Alex, Senior Product Manager** — manages 3 product lines, constantly in meetings, drowning in todos. Wants to ask "what's on my plate this week?" and get a real answer that includes calendar, tasks, and open threads.

---

## Architecture

```
┌─────────────────────────────────────────┐
│           Next.js Frontend               │
│  Chat UI + Task View + Calendar Widget  │
└──────────────┬──────────────────────────┘
               │ REST / WebSocket
┌──────────────▼──────────────────────────┐
│           API Server (Node.js)           │
│  - Claude SDK (claude-3-5-sonnet)        │
│  - Tool use: calendar, tasks, memory     │
│  - Cron: morning briefing @ 8am          │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│     Prisma + PostgreSQL                  │
│  Tasks | Memories | ConversationHistory  │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         Google Calendar API              │
│  OAuth 2.0 | Events CRUD                 │
└─────────────────────────────────────────┘
```

---

## Step 1: Database Schema

```prisma
// schema.prisma
model Task {
  id          String   @id @default(cuid())
  title       String
  description String?
  priority    Int      @default(3)  // 1=urgent, 5=low
  dueDate     DateTime?
  completed   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Memory {
  id        String   @id @default(cuid())
  key       String   @unique
  value     String
  updatedAt DateTime @updatedAt
}

model Message {
  id        String   @id @default(cuid())
  role      String   // user | assistant
  content   String
  createdAt DateTime @default(now())
}
```

```bash
npx prisma migrate dev --name init
```

---

## Step 2: AI with Tool Use

```typescript
// lib/assistant.ts
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { getCalendarEvents, createCalendarEvent } from "./calendar";

const client = new Anthropic();

const tools: Anthropic.Tool[] = [
  {
    name: "get_tasks",
    description: "Get the user's task list, optionally filtered by priority or due date",
    input_schema: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["all", "urgent", "today", "overdue"] },
      },
    },
  },
  {
    name: "create_task",
    description: "Create a new task with optional priority and due date",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        priority: { type: "number", minimum: 1, maximum: 5 },
        dueDate: { type: "string", description: "ISO 8601 date" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_calendar",
    description: "Get upcoming calendar events",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", default: 7 },
      },
    },
  },
  {
    name: "remember",
    description: "Store a preference or piece of information for the user",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        value: { type: "string" },
      },
      required: ["key", "value"],
    },
  },
];

async function executeTool(name: string, input: any) {
  switch (name) {
    case "get_tasks":
      const where = input.filter === "urgent" ? { priority: { lte: 2 } }
        : input.filter === "today" ? { dueDate: { lte: new Date() } }
        : {};
      return prisma.task.findMany({ where, orderBy: { priority: "asc" } });

    case "create_task":
      return prisma.task.create({ data: input });

    case "get_calendar":
      return getCalendarEvents(input.days ?? 7);

    case "remember":
      return prisma.memory.upsert({
        where: { key: input.key },
        update: { value: input.value },
        create: { key: input.key, value: input.value },
      });
  }
}

export async function chat(userMessage: string): Promise<string> {
  // Load memories as system context
  const memories = await prisma.memory.findMany();
  const memoryContext = memories.map(m => `${m.key}: ${m.value}`).join("\n");

  // Load recent history
  const history = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const messages: Anthropic.MessageParam[] = [
    ...history.reverse().map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  let response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: `You are a personal assistant. User preferences:\n${memoryContext}\n\nToday is ${new Date().toDateString()}.`,
    tools,
    messages,
  });

  // Agentic loop: handle tool calls
  while (response.stop_reason === "tool_use") {
    const toolResults: Anthropic.MessageParam = {
      role: "user",
      content: await Promise.all(
        response.content
          .filter(b => b.type === "tool_use")
          .map(async (b) => ({
            type: "tool_result" as const,
            tool_use_id: (b as Anthropic.ToolUseBlock).id,
            content: JSON.stringify(await executeTool(
              (b as Anthropic.ToolUseBlock).name,
              (b as Anthropic.ToolUseBlock).input
            )),
          }))
      ),
    };

    messages.push({ role: "assistant", content: response.content }, toolResults);
    response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: `You are a personal assistant. User preferences:\n${memoryContext}`,
      tools,
      messages,
    });
  }

  const reply = response.content.find(b => b.type === "text")?.text ?? "";

  // Persist conversation
  await prisma.message.createMany({
    data: [
      { role: "user", content: userMessage },
      { role: "assistant", content: reply },
    ],
  });

  return reply;
}
```

---

## Step 3: Morning Briefing Cron

```typescript
// cron/morning-briefing.ts
import { chat } from "../lib/assistant";
import { sendPushNotification } from "../lib/notify";

// Run at 8am via node-cron or Vercel Cron
export async function morningBriefing() {
  const briefing = await chat(
    "Give me my morning briefing: what's on my calendar today, " +
    "my 3 most urgent tasks, and any deadlines this week."
  );
  await sendPushNotification("Good morning! ☀️", briefing);
}
```

---

## What's Next

- Add voice input via Web Speech API
- Connect to email (Gmail API) for inbox summaries
- Build a mobile app with Expo
- Add recurring task patterns with AI scheduling
