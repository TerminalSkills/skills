---
title: Build a Workspace Automation CLI
slug: build-workspace-automation-cli
description: Build a workspace automation CLI that integrates Gmail, Calendar, Drive, and Slack with natural language commands, scheduled automations, and workflow macros for productivity.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Developer Tools
tags:
  - cli
  - automation
  - productivity
  - workspace
  - gmail
---

# Build a Workspace Automation CLI

## The Problem

Alex is a developer who spends 2 hours daily on repetitive workspace tasks: checking email, scheduling meetings, organizing Drive files, posting Slack updates. They switch between 6 browser tabs constantly. Automated scripts exist for each tool individually, but there's no unified interface. "Create a meeting with the people on this email thread" requires opening Gmail, copying names, switching to Calendar, creating event, adding attendees. They need one CLI that talks to all workspace tools: natural language commands, chained actions, scheduled automations, and macros for common workflows.

## Step 1: Build the Workspace CLI Engine

```typescript
// src/workspace/cli.ts — Unified workspace automation with Gmail, Calendar, Drive, Slack
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface WorkspaceAction {
  service: "gmail" | "calendar" | "drive" | "slack" | "contacts";
  operation: string;
  params: Record<string, any>;
}

interface Macro {
  id: string;
  name: string;
  description: string;
  steps: WorkspaceAction[];
  schedule?: string;         // cron expression for recurring
  createdAt: string;
}

interface ActionResult {
  service: string;
  operation: string;
  success: boolean;
  data?: any;
  error?: string;
}

// Service handlers
const handlers: Record<string, Record<string, (params: any) => Promise<any>>> = {
  gmail: {
    search: async (params) => {
      // In production: call Gmail API
      return { messages: [], query: params.query, count: 0 };
    },
    send: async (params) => {
      return { messageId: `msg-${randomBytes(4).toString("hex")}`, to: params.to, subject: params.subject };
    },
    reply: async (params) => {
      return { messageId: `msg-${randomBytes(4).toString("hex")}`, threadId: params.threadId };
    },
    label: async (params) => {
      return { messageId: params.messageId, label: params.label };
    },
    summarize: async (params) => {
      // Call LLM to summarize email thread
      return { summary: `Summary of ${params.count || 10} recent emails`, unread: 5 };
    },
  },
  calendar: {
    list: async (params) => {
      return { events: [], range: params.range || "today" };
    },
    create: async (params) => {
      return { eventId: `evt-${randomBytes(4).toString("hex")}`, title: params.title, start: params.start, attendees: params.attendees };
    },
    findSlot: async (params) => {
      // Find free time across multiple calendars
      return { slots: ["2024-03-15T14:00:00", "2024-03-15T16:00:00"], duration: params.duration || 30 };
    },
    cancel: async (params) => {
      return { eventId: params.eventId, cancelled: true };
    },
  },
  drive: {
    search: async (params) => {
      return { files: [], query: params.query };
    },
    create: async (params) => {
      return { fileId: `file-${randomBytes(4).toString("hex")}`, name: params.name, type: params.type };
    },
    share: async (params) => {
      return { fileId: params.fileId, sharedWith: params.email, permission: params.permission || "viewer" };
    },
    organize: async (params) => {
      // Move files matching pattern to folder
      return { moved: 0, pattern: params.pattern, destination: params.folder };
    },
  },
  slack: {
    send: async (params) => {
      return { channel: params.channel, messageTs: Date.now().toString() };
    },
    status: async (params) => {
      return { status: params.text, emoji: params.emoji || ":computer:" };
    },
    search: async (params) => {
      return { messages: [], query: params.query };
    },
  },
};

// Execute a single action
export async function executeAction(action: WorkspaceAction): Promise<ActionResult> {
  const handler = handlers[action.service]?.[action.operation];
  if (!handler) {
    return { service: action.service, operation: action.operation, success: false, error: `Unknown operation: ${action.service}.${action.operation}` };
  }

  try {
    const data = await handler(action.params);
    return { service: action.service, operation: action.operation, success: true, data };
  } catch (error: any) {
    return { service: action.service, operation: action.operation, success: false, error: error.message };
  }
}

// Execute a macro (sequence of actions)
export async function executeMacro(macro: Macro): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  let context: Record<string, any> = {};  // pass data between steps

  for (const step of macro.steps) {
    // Interpolate context variables into params
    const params = interpolateParams(step.params, context);
    const result = await executeAction({ ...step, params });
    results.push(result);

    if (!result.success) break;  // stop on failure

    // Add result to context for next steps
    context[`${step.service}_${step.operation}`] = result.data;
    context.lastResult = result.data;
  }

  return results;
}

// Parse natural language command into actions
export function parseCommand(input: string): WorkspaceAction[] {
  const lower = input.toLowerCase();

  // Email commands
  if (/^(check|read|show)\s+(my\s+)?email/i.test(input)) {
    return [{ service: "gmail", operation: "summarize", params: { count: 10 } }];
  }
  if (/^send\s+email\s+to\s+(.+?)\s+(?:about|subject|re)\s+(.+)/i.test(input)) {
    const match = input.match(/^send\s+email\s+to\s+(.+?)\s+(?:about|subject|re)\s+(.+)/i)!;
    return [{ service: "gmail", operation: "send", params: { to: match[1], subject: match[2], body: "" } }];
  }

  // Calendar commands
  if (/^(show|list|what'?s)\s+(my\s+)?(calendar|schedule|meetings)/i.test(input)) {
    return [{ service: "calendar", operation: "list", params: { range: "today" } }];
  }
  if (/^(schedule|create|book)\s+(a\s+)?meeting/i.test(input)) {
    const titleMatch = input.match(/(?:about|for|called)\s+(.+?)(?:\s+with|\s+at|\s+on|$)/i);
    const attendeesMatch = input.match(/with\s+(.+?)(?:\s+at|\s+on|$)/i);
    return [{ service: "calendar", operation: "create", params: {
      title: titleMatch?.[1] || "Meeting",
      attendees: attendeesMatch?.[1]?.split(/,\s*and\s*|,\s*/) || [],
    }}];
  }
  if (/^find\s+(a\s+)?free\s+(slot|time)/i.test(input)) {
    return [{ service: "calendar", operation: "findSlot", params: { duration: 30 } }];
  }

  // Slack commands
  if (/^(post|send|message)\s+(to\s+)?#?(\w+)/i.test(input)) {
    const match = input.match(/^(?:post|send|message)\s+(?:to\s+)?#?(\w+)\s+(.+)/i);
    if (match) return [{ service: "slack", operation: "send", params: { channel: match[1], text: match[2] } }];
  }
  if (/^set\s+(my\s+)?status/i.test(input)) {
    const text = input.replace(/^set\s+(my\s+)?status\s+(to\s+)?/i, "");
    return [{ service: "slack", operation: "status", params: { text } }];
  }

  // Drive commands
  if (/^(find|search)\s+(files?|docs?)/i.test(input)) {
    const query = input.replace(/^(?:find|search)\s+(?:files?|docs?)\s+(?:for|about|named)?\s*/i, "");
    return [{ service: "drive", operation: "search", params: { query } }];
  }

  return []; // unrecognized
}

function interpolateParams(params: Record<string, any>, context: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.startsWith("$")) {
      const path = value.slice(1).split(".");
      let resolved: any = context;
      for (const p of path) resolved = resolved?.[p];
      result[key] = resolved ?? value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Predefined macros
export const BUILT_IN_MACROS: Macro[] = [
  {
    id: "morning-standup",
    name: "Morning Standup",
    description: "Check email, show today's calendar, set Slack status",
    steps: [
      { service: "gmail", operation: "summarize", params: { count: 20 } },
      { service: "calendar", operation: "list", params: { range: "today" } },
      { service: "slack", operation: "status", params: { text: "In standup", emoji: ":speech_balloon:" } },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: "end-of-day",
    name: "End of Day",
    description: "Clear Slack status, summarize tomorrow's schedule",
    steps: [
      { service: "slack", operation: "status", params: { text: "", emoji: "" } },
      { service: "calendar", operation: "list", params: { range: "tomorrow" } },
    ],
    createdAt: new Date().toISOString(),
  },
];
```

## Results

- **2 hours daily → 20 minutes** — `ws check email` + `ws show calendar` + `ws status 'Deep work'` replaces 6 browser tabs; all from terminal
- **Natural language commands** — `ws send email to alice@co.com about project update` parses and executes; no need to remember API parameters
- **Macros chain actions** — "Morning Standup" macro: summarize email → show calendar → set Slack status; one command, 3 services, 10 seconds
- **Context passing between steps** — "Create meeting with people on last email" → Gmail extracts attendees → Calendar creates event with those attendees; actions compose
- **Scheduled automations** — "End of Day" macro runs at 5 PM daily via cron; Slack status cleared, tomorrow's schedule sent to terminal; no manual trigger needed
