---
title: Build a Project Management Tool That Doesn't Suck
slug: build-project-management-tool
description: Replace Jira with a custom project management tool — hierarchical tasks, kanban/list/timeline views, sprint planning, and real-time updates via Supabase Realtime.
skills:
  - prisma
  - supabase
category: development
tags:
  - project-management
  - tasks
  - sprints
  - kanban
  - real-time
  - productivity
---

# Build a Project Management Tool That Doesn't Suck

Sofia's dev team of 8 has been using Jira for two years. They've accumulated 4,000 tickets, 12 custom fields nobody uses, and a backlog that's become a graveyard. Sprint planning takes 2 hours because the UI is slow. Engineers avoid updating ticket status because it takes 6 clicks. Sofia wants to build something simple: projects, epics, tasks, subtasks — with a kanban board that's fast, real-time updates when someone moves a card, and a Gantt-lite timeline for the PM.

## Step 1 — Schema: Hierarchical Tasks with Supabase + Prisma

The hierarchy is project → epic → task → subtask. Each level is the same `Task` model with a `parentId` — recursive nesting without a separate table for each level.

```typescript
// prisma/schema.prisma — Task hierarchy and sprint model.

model Project {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  description String?
  color       String   @default("#6366f1")
  tasks       Task[]
  sprints     Sprint[]
  members     ProjectMember[]
  createdAt   DateTime @default(now())
}

model Task {
  id          String     @id @default(cuid())
  title       String
  description String?
  status      TaskStatus @default(TODO)
  priority    Priority   @default(MEDIUM)
  type        TaskType   @default(TASK)

  // Hierarchy
  projectId   String
  project     Project    @relation(fields: [projectId], references: [id])
  parentId    String?
  parent      Task?      @relation("subtasks", fields: [parentId], references: [id])
  children    Task[]     @relation("subtasks")

  // Metadata
  assigneeId  String?
  labels      String[]   // stored as array
  dueDate     DateTime?
  storyPoints Int?
  position    Float      @default(0)  // for ordering within a column

  // Sprint
  sprintId    String?
  sprint      Sprint?    @relation(fields: [sprintId], references: [id])

  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model Sprint {
  id        String      @id @default(cuid())
  name      String
  goal      String?
  startDate DateTime
  endDate   DateTime
  status    SprintStatus @default(PLANNING)
  projectId String
  project   Project     @relation(fields: [projectId], references: [id])
  tasks     Task[]
  createdAt DateTime    @default(now())
}

enum TaskStatus  { TODO IN_PROGRESS IN_REVIEW DONE }
enum Priority    { LOW MEDIUM HIGH URGENT }
enum TaskType    { EPIC STORY TASK BUG SUBTASK }
enum SprintStatus { PLANNING ACTIVE COMPLETED }
```

## Step 2 — Real-Time Updates with Supabase Realtime

When any team member moves a task or updates a status, everyone's board refreshes instantly — no polling, no page refresh.

```typescript
// src/lib/supabase.ts — Supabase client configured for Realtime.

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

```typescript
// src/hooks/useTaskBoard.ts — Subscribe to real-time task changes.
// When any task in the project is updated, inserted, or deleted,
// the board re-fetches and re-renders automatically.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigneeId?: string;
  position: number;
}

export function useTaskBoard(projectId: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load
    fetchTasks();

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`project:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Task",
          filter: `projectId=eq.${projectId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === payload.new.id ? { ...t, ...payload.new } : t
              )
            );
          } else if (payload.eventType === "INSERT") {
            setTasks((prev) => [...prev, payload.new as Task]);
          } else if (payload.eventType === "DELETE") {
            setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  async function fetchTasks() {
    const res = await fetch(`/api/projects/${projectId}/tasks`);
    const data = await res.json();
    setTasks(data);
    setLoading(false);
  }

  return { tasks, loading };
}
```

## Step 3 — Kanban Board with Optimistic Updates

The board shows tasks as cards in columns by status. Drag a card to move it — the UI updates instantly (optimistic), then the server confirms.

```typescript
// src/app/api/tasks/[id]/move/route.ts — Move a task to a new status/position.
// Called by drag-and-drop. Updates status and position atomically.
// Supabase Realtime broadcasts the change to all connected clients.

import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { status, position, sprintId } = await request.json();

  const task = await prisma.task.update({
    where: { id: params.id },
    data: {
      ...(status !== undefined && { status }),
      ...(position !== undefined && { position }),
      ...(sprintId !== undefined && { sprintId }),
    },
  });

  // Supabase Realtime picks this up via postgres_changes
  // and broadcasts to all subscribed clients automatically

  return Response.json(task);
}
```

## Step 4 — Sprint Planning: Move Tasks, Track Velocity

Sprint planning is a drag-and-drop interface: backlog on the left, sprint on the right. Move tasks into the sprint, see total story points. After the sprint, calculate velocity.

```typescript
// src/app/api/sprints/[id]/velocity/route.ts — Calculate sprint velocity.
// Velocity = story points completed in the sprint.
// Used to predict capacity for future sprints.

import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const sprint = await prisma.sprint.findUnique({
    where: { id: params.id },
    include: {
      tasks: {
        select: {
          id: true,
          status: true,
          storyPoints: true,
          type: true,
        },
      },
    },
  });

  if (!sprint) return Response.json({ error: "Sprint not found" }, { status: 404 });

  const totalPoints = sprint.tasks.reduce((s, t) => s + (t.storyPoints || 0), 0);
  const completedPoints = sprint.tasks
    .filter((t) => t.status === "DONE")
    .reduce((s, t) => s + (t.storyPoints || 0), 0);

  const tasksByStatus = {
    TODO: sprint.tasks.filter((t) => t.status === "TODO").length,
    IN_PROGRESS: sprint.tasks.filter((t) => t.status === "IN_PROGRESS").length,
    IN_REVIEW: sprint.tasks.filter((t) => t.status === "IN_REVIEW").length,
    DONE: sprint.tasks.filter((t) => t.status === "DONE").length,
  };

  return Response.json({
    sprintId: sprint.id,
    name: sprint.name,
    totalPoints,
    completedPoints,
    completionRate: totalPoints > 0
      ? Math.round((completedPoints / totalPoints) * 100)
      : 0,
    tasksByStatus,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
  });
}
```

## Step 5 — Timeline View (Gantt-lite)

A horizontal timeline where each task with a due date is a bar. Filter by assignee or epic to see what's blocking what.

```typescript
// src/app/api/projects/[id]/timeline/route.ts — Return tasks formatted for timeline.
// Frontend renders these as horizontal bars on a date axis.

import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url);
  const assigneeId = searchParams.get("assigneeId");

  const tasks = await prisma.task.findMany({
    where: {
      projectId: params.id,
      dueDate: { not: null },
      ...(assigneeId && { assigneeId }),
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      type: true,
      assigneeId: true,
      dueDate: true,
      parentId: true,
      createdAt: true,
    },
    orderBy: { dueDate: "asc" },
  });

  // Compute start date: task createdAt or parent's due date
  const timelineTasks = tasks.map((t) => ({
    ...t,
    startDate: t.createdAt,
    endDate: t.dueDate,
    durationDays: t.dueDate
      ? Math.ceil(
          (t.dueDate.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        )
      : 1,
  }));

  return Response.json(timelineTasks);
}
```

## Results

Sofia's team migrated from Jira in one afternoon (CSV import). Six months in:

- **Sprint planning: 2 hours → 20 minutes** — the planning board is fast, real-time, and shows story points as tasks are moved into the sprint.
- **Ticket updates: daily vs. weekly** — engineers update status because it's one click on the kanban board, not six Jira screens.
- **Real-time: no more "refresh and see"** — when someone moves a card, everyone's board updates instantly via Supabase Realtime.
- **Backlog: managed** — the simple hierarchy (epic → task → subtask) replaced the 12 custom fields. The backlog has 200 active items, not 4,000 stale ones.
- **Timeline: PM's favorite feature** — milestone dates visible without a separate tool.
- **Cost: ~$25/month** — Supabase free tier + Neon free tier + Vercel. Jira was $84/month for 8 seats.
