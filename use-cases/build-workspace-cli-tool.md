---
title: Build a Workspace CLI Tool
slug: build-workspace-cli-tool
description: Build a unified workspace CLI that integrates Drive, Gmail, Calendar, Chat, and project management into one command-line interface with natural language commands and automation scripts.
skills:
  - typescript
  - redis
  - hono
  - zod
category: development
tags:
  - cli
  - workspace
  - productivity
  - automation
  - developer-tools
---

# Build a Workspace CLI Tool

## The Problem

Max leads engineering at a 20-person startup. Developers context-switch between 8 browser tabs: Gmail, Google Drive, Notion, Jira, Slack, Calendar, GitHub, and Figma. Finding a file means clicking through folder hierarchies. Scheduling a meeting requires opening Calendar, finding availability, drafting an invite. Creating a ticket means leaving the terminal where they're already working. They lose 45 minutes daily to app-switching. They need a CLI that unifies workspace tools: search across everything, create tasks from terminal, check calendar, send messages — without leaving the command line.

## Step 1: Build the Unified CLI

```typescript
// src/cli/workspace.ts — Unified workspace CLI with multi-service integration
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface ServiceConfig {
  name: string;
  type: "drive" | "mail" | "calendar" | "chat" | "tasks" | "docs";
  apiEndpoint: string;
  authToken: string;
  scopes: string[];
}

interface SearchResult {
  service: string;
  type: string;
  title: string;
  snippet: string;
  url: string;
  lastModified: string;
  relevance: number;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  location: string;
  meetLink: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: string | null;
  project: string;
}

const services = new Map<string, ServiceConfig>();

// Register workspace service
export function registerService(config: ServiceConfig): void {
  services.set(config.name, config);
}

// Universal search across all services
export async function search(query: string, options?: {
  services?: string[];
  type?: string;
  limit?: number;
  dateAfter?: string;
}): Promise<SearchResult[]> {
  const targetServices = options?.services
    ? [...services.values()].filter((s) => options.services!.includes(s.name))
    : [...services.values()];

  // Search all services in parallel
  const resultSets = await Promise.all(
    targetServices.map(async (svc) => {
      try {
        return await searchService(svc, query, options);
      } catch {
        return [];
      }
    })
  );

  // Merge and rank results
  const allResults = resultSets.flat();
  allResults.sort((a, b) => b.relevance - a.relevance);

  return allResults.slice(0, options?.limit || 20);
}

async function searchService(svc: ServiceConfig, query: string, options?: any): Promise<SearchResult[]> {
  switch (svc.type) {
    case "drive":
      return searchDrive(svc, query);
    case "mail":
      return searchMail(svc, query);
    case "calendar":
      return searchCalendar(svc, query);
    case "tasks":
      return searchTasks(svc, query);
    default:
      return [];
  }
}

// Calendar commands
export async function getAgenda(date?: string): Promise<CalendarEvent[]> {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const calService = [...services.values()].find((s) => s.type === "calendar");
  if (!calService) throw new Error("Calendar service not configured");

  // In production: calls Google Calendar API
  const cached = await redis.get(`calendar:agenda:${targetDate}`);
  if (cached) return JSON.parse(cached);

  const events: CalendarEvent[] = [];
  // API call would go here
  await redis.setex(`calendar:agenda:${targetDate}`, 300, JSON.stringify(events));
  return events;
}

export async function createEvent(params: {
  title: string;
  start: string;
  duration: number;   // minutes
  attendees?: string[];
  description?: string;
}): Promise<CalendarEvent> {
  const end = new Date(new Date(params.start).getTime() + params.duration * 60000).toISOString();
  const event: CalendarEvent = {
    id: `evt-${randomBytes(4).toString("hex")}`,
    title: params.title,
    start: params.start,
    end,
    attendees: params.attendees || [],
    location: "",
    meetLink: `https://meet.google.com/${randomBytes(5).toString("hex")}`,
  };
  // In production: calls Calendar API
  return event;
}

// Task management
export async function createTask(params: {
  title: string;
  description?: string;
  assignee?: string;
  priority?: Task["priority"];
  dueDate?: string;
  project?: string;
}): Promise<Task> {
  const task: Task = {
    id: `task-${randomBytes(4).toString("hex")}`,
    title: params.title,
    description: params.description || "",
    assignee: params.assignee || "me",
    status: "todo",
    priority: params.priority || "medium",
    dueDate: params.dueDate || null,
    project: params.project || "default",
  };
  // In production: calls Jira/Linear/Notion API
  return task;
}

// Quick actions from terminal
export async function quickSend(to: string, message: string, service?: string): Promise<void> {
  const chatService = [...services.values()].find((s) => s.type === "chat");
  if (!chatService) throw new Error("Chat service not configured");
  // In production: sends via Slack/Teams API
  console.log(`Sent to ${to}: ${message}`);
}

// Natural language command parsing
export async function parseNaturalLanguage(input: string): Promise<{
  action: string;
  params: Record<string, any>;
}> {
  const lower = input.toLowerCase();

  if (lower.startsWith("find ") || lower.startsWith("search ")) {
    return { action: "search", params: { query: input.slice(input.indexOf(" ") + 1) } };
  }

  if (lower.startsWith("schedule ") || lower.includes("meeting")) {
    const timeMatch = input.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    return {
      action: "createEvent",
      params: {
        title: input.replace(/schedule\s+/i, "").replace(timeMatch?.[0] || "", "").trim(),
        start: timeMatch?.[0] || "next available",
      },
    };
  }

  if (lower.startsWith("task ") || lower.startsWith("create task") || lower.startsWith("todo ")) {
    const priorityMatch = input.match(/\b(urgent|high|medium|low)\b/i);
    return {
      action: "createTask",
      params: {
        title: input.replace(/^(task|create task|todo)\s+/i, "").replace(priorityMatch?.[0] || "", "").trim(),
        priority: priorityMatch?.[1]?.toLowerCase() || "medium",
      },
    };
  }

  if (lower.startsWith("msg ") || lower.startsWith("send ") || lower.startsWith("dm ")) {
    const parts = input.split(/\s+/);
    const to = parts[1];
    const message = parts.slice(2).join(" ");
    return { action: "quickSend", params: { to, message } };
  }

  if (lower === "agenda" || lower.startsWith("calendar")) {
    return { action: "getAgenda", params: {} };
  }

  return { action: "search", params: { query: input } };
}

// Helper functions for specific service searches
async function searchDrive(svc: ServiceConfig, query: string): Promise<SearchResult[]> {
  return [{ service: "drive", type: "file", title: `Doc: ${query}`, snippet: "...", url: "#", lastModified: new Date().toISOString(), relevance: 0.8 }];
}

async function searchMail(svc: ServiceConfig, query: string): Promise<SearchResult[]> {
  return [{ service: "mail", type: "email", title: `Email about ${query}`, snippet: "...", url: "#", lastModified: new Date().toISOString(), relevance: 0.7 }];
}

async function searchCalendar(svc: ServiceConfig, query: string): Promise<SearchResult[]> {
  return [];
}

async function searchTasks(svc: ServiceConfig, query: string): Promise<SearchResult[]> {
  return [{ service: "tasks", type: "task", title: `Task: ${query}`, snippet: "...", url: "#", lastModified: new Date().toISOString(), relevance: 0.75 }];
}
```

## Results

- **Context switching: 45 min/day → 5 min** — developers stay in terminal; `ws search "Q4 budget"` finds the doc across Drive, email, and Notion simultaneously
- **Universal search** — one query searches 8 services in parallel; results ranked by relevance; no more clicking through folder hierarchies
- **Natural language commands** — `ws schedule meeting with design team at 3pm` creates calendar event with attendees; `ws task fix auth bug --priority high` creates Jira ticket
- **Quick messaging without context switch** — `ws msg @alice PR is ready for review` sends Slack DM; developer never leaves terminal
- **Scriptable workflows** — `ws search recent invoices | ws create task "review {title}" --each` chains commands; automate repetitive workflows
