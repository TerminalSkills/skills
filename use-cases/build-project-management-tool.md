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

Supabase provides the Postgres database, auth and Realtime; Prisma 7 (see the `prisma` skill) owns the schema and migrations and connects to that database directly with a driver adapter. The hierarchy is project → epic → task → subtask. Each level is the same `Task` model with a `parentId`, so nesting needs no separate table per level.

Install `prisma@7`, `@prisma/client@7` and `@prisma/adapter-pg@7` (npm `latest` is currently a Prisma 8 release candidate). Set up `prisma.config.ts` (the connection URL lives there in Prisma 7, not in `schema.prisma`; use the Supabase session pooler string from the dashboard Connect dialog as `DATABASE_URL`, because the direct connection is IPv6-only on the Free plan) and export a `PrismaClient` created with the `@prisma/adapter-pg` adapter as `src/lib/prisma.ts`, as the `prisma` skill shows.

```prisma
// prisma/schema.prisma — Task hierarchy and sprint model.
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
datasource db {
  provider = "postgresql"
}

model Project {
  id        String          @id @default(cuid())
  name      String
  slug      String          @unique
  tasks     Task[]
  sprints   Sprint[]
  members   ProjectMember[]
  createdAt DateTime        @default(now())
  @@map("projects")
}

// userId is the Supabase Auth user id (auth.users.id), stored as text.
model ProjectMember {
  projectId String  @map("project_id")
  userId    String  @map("user_id")
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@id([projectId, userId])
  @@map("project_members")
}

model Task {
  id          String     @id @default(cuid())
  title       String
  description String?
  status      TaskStatus @default(TODO)
  priority    String     @default("MEDIUM")  // LOW | MEDIUM | HIGH | URGENT
  type        String     @default("TASK")    // EPIC | STORY | TASK | BUG | SUBTASK
  projectId   String     @map("project_id")
  project     Project    @relation(fields: [projectId], references: [id])
  parentId    String?                       // epic -> task -> subtask
  parent      Task?      @relation("subtasks", fields: [parentId], references: [id])
  children    Task[]     @relation("subtasks")
  assigneeId  String?
  dueDate     DateTime?
  storyPoints Int?
  position    Float      @default(0)        // ordering within a column
  sprintId    String?
  sprint      Sprint?    @relation(fields: [sprintId], references: [id])
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  @@index([projectId, status])
  @@map("tasks")
}

model Sprint {
  id        String       @id @default(cuid())
  name      String
  startDate DateTime
  endDate   DateTime
  projectId String       @map("project_id")
  project   Project      @relation(fields: [projectId], references: [id])
  tasks     Task[]
  @@map("sprints")
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
}
```

Tables in `public` are reachable through Supabase's Data API with the publishable key, and Prisma tables start with Row Level Security off. Lock them down in the same migration (`npx prisma migrate dev --create-only`, then add this SQL to the generated file). Prisma connects as the table owner and bypasses RLS; browsers get only what the policies allow:

```sql
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.sprints enable row level security;

create policy "read own memberships" on public.project_members
  for select to authenticated using (user_id = (select auth.uid())::text);
create policy "members read tasks" on public.tasks for select to authenticated
  using (exists (select 1 from public.project_members m
                 where m.project_id = tasks.project_id
                   and m.user_id = (select auth.uid())::text));

-- Realtime only sends changes for tables in this publication; full replica identity lets DELETE events match the project filter.
alter publication supabase_realtime add table public.tasks;
alter table public.tasks replica identity full;
```

## Step 2 — Real-Time Updates with Supabase Realtime

When any team member moves a task, every member's board refreshes — no polling. Users sign in with Supabase Auth, so the browser client's `authenticated` role matches the policy above; Realtime applies the `select` policy to the changes each client receives.

```typescript
// src/lib/supabase.ts — browser client. Publishable key only; the secret key never ships to the browser.
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
```

The hook treats a Realtime event as a signal and re-reads the board from the API route, so the board always has the full, authorised shape (Realtime payloads carry raw snake_case columns, and a DELETE event contains only the primary key):

```typescript
// src/hooks/useTaskBoard.ts — subscribe to task changes in one project.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Task { id: string; title: string; status: string; priority: string; position: number }

export function useTaskBoard(projectId: string) {
  const [tasks, setTasks] = useState<Task[]>([]);

  const fetchTasks = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (res.ok) setTasks(await res.json());
  }, [projectId]);

  useEffect(() => {
    fetchTasks();

    const channel = supabase.channel(`project:${projectId}`)
      .on("postgres_changes",
          { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` },
          () => fetchTasks())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId, fetchTasks]);

  return { tasks };
}
```

The API routes run with Prisma, which bypasses RLS, so each one checks the caller itself: the browser sends its Supabase access token, and the server verifies it with `auth.getUser()` and checks project membership.

```typescript
// src/lib/auth.ts — used by every route handler below.
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
const supabaseServer = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

// Returns an error Response when the caller may not touch the project, otherwise null.
export async function requireMember(request: NextRequest, projectId: string) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabaseServer.auth.getUser(token);
  if (!data.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: data.user.id } },
  });
  return member ? null : Response.json({ error: "Forbidden" }, { status: 403 });
}
```

The board's initial load is `GET /api/projects/[id]/tasks`: call `requireMember`, then `prisma.task.findMany({ where: { projectId: id }, orderBy: { position: "asc" } })`.

## Step 3 — Kanban Board: Move a Card

Dragging a card calls this route; the UI updates optimistically and Realtime confirms for everyone else.

```typescript
// src/app/api/tasks/[id]/move/route.ts
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { TaskStatus } from "@/generated/prisma/enums";
import { NextRequest } from "next/server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await prisma.task.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing) return Response.json({ error: "Task not found" }, { status: 404 });
  const denied = await requireMember(request, existing.projectId);
  if (denied) return denied;

  const { status, position, sprintId } = await request.json();
  if (status !== undefined && !(status in TaskStatus)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }
  if (sprintId && !(await prisma.sprint.findFirst({ where: { id: sprintId, projectId: existing.projectId } }))) {
    return Response.json({ error: "Invalid sprint" }, { status: 400 }); // sprint of another project
  }

  const task = await prisma.task.update({
    where: { id },
    data: { ...(status !== undefined && { status }), ...(position !== undefined && { position }),
            ...(sprintId !== undefined && { sprintId }) },
  });
  return Response.json(task); // Realtime sees the row change and notifies subscribed clients
}
```

## Step 4 — Sprint Planning: Track Velocity

Backlog on the left, sprint on the right; moving a task into the sprint uses the route above with `sprintId`. Velocity is the story points completed in the sprint, used to predict capacity.

```typescript
// src/app/api/sprints/[id]/velocity/route.ts
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) return Response.json({ error: "Sprint not found" }, { status: 404 });
  const denied = await requireMember(request, sprint.projectId);
  if (denied) return denied;

  const groups = await prisma.task.groupBy({
    by: ["status"],
    where: { sprintId: id },
    _sum: { storyPoints: true },
  });
  const sum = (gs: typeof groups) => gs.reduce((n, g) => n + (g._sum.storyPoints ?? 0), 0);
  const totalPoints = sum(groups);
  const completedPoints = sum(groups.filter((g) => g.status === "DONE"));

  return Response.json({
    sprintId: id, name: sprint.name, totalPoints, completedPoints,
  });
}
```

## Step 5 — Timeline View (Gantt-lite)

Each task with a due date becomes a horizontal bar on a date axis.

```typescript
// src/app/api/projects/[id]/timeline/route.ts
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await requireMember(request, id);
  if (denied) return denied;

  const tasks = await prisma.task.findMany({
    where: { projectId: id, dueDate: { not: null } },
    orderBy: { dueDate: "asc" },
  });

  // Bar runs from creation to due date.
  return Response.json(tasks.map((t) => ({
    ...t, startDate: t.createdAt, endDate: t.dueDate,
    durationDays: Math.max(1, Math.ceil((t.dueDate!.getTime() - t.createdAt.getTime()) / 86_400_000)),
  })));
}
```

## Results

Sofia's team moved their open tickets over from a Jira CSV export in an afternoon. The numbers below are the example team's own, six months in:

- **Sprint planning: 2 hours → 20 minutes** — the planning board is fast and shows story points as tasks are moved into the sprint.
- **Ticket updates: daily vs. weekly** — status is one drag on the kanban board, not six Jira screens, and everyone's board refetches when a card moves.
- **Backlog: managed** — the simple hierarchy replaced the 12 custom fields. The backlog has 200 active items, not 4,000 stale ones, and the timeline gives the PM milestone dates without a separate tool.
- **Cost** — the database, auth and Realtime come from one Supabase project plus a small app host. The Free plan allows 2 active projects and pauses a project after a week of inactivity, so a team that depends on it daily moves to Pro (from $25 a month, per supabase.com/pricing).

## Related Skills

- **prisma**: schema, Prisma 7 config, driver adapter and migrations
- **supabase**: Postgres, Auth, RLS, Realtime and the publishable-key setup
