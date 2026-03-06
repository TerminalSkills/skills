---
title: Prototype a SaaS UI with AI in One Weekend
slug: prototype-saas-ui-with-ai-in-one-weekend
description: Go from idea to deployed SaaS prototype in 48 hours using v0 for AI-generated UI components, Bolt for full-page scaffolding, Cursor for backend integration, and Vercel for instant deployment — building a project management dashboard that would normally take a team 2-3 weeks.
skills: [v0-dev, cursor-ai, vercel-ai-sdk, shadcn-ui]
category: Developer Tools
tags: [ai-prototyping, rapid-development, vibe-coding, v0, ui-generation, saas, weekend-project]
---

# Prototype a SaaS UI with AI in One Weekend

Kai has an idea for a project management tool targeted at freelancers — simpler than Jira, more structured than a spreadsheet. He has a design in his head: a Kanban board with time tracking, client invoicing, and a clean dashboard. Building this traditionally would take his 3-person team two sprints (4 weeks).

Instead, Kai uses AI prototyping tools to go from idea to deployed demo in one weekend. The prototype won't be production-ready, but it will be polished enough to show investors, get user feedback, and validate whether the idea is worth building properly.

## Saturday Morning: UI Components with v0

v0 by Vercel generates React components from natural language descriptions. Kai starts by generating the core UI blocks — each one takes 30-60 seconds instead of 2-3 hours of manual coding.

```markdown
## v0 Prompts That Generated the Core UI

### Prompt 1: Dashboard overview
"A project management dashboard for freelancers. Show 4 stat cards at the top:
active projects (12), hours this week (34.5h), pending invoices ($4,200),
upcoming deadlines (3). Below that, a two-column layout: left side has a
list of recent projects with status badges (active/paused/completed) and
client names; right side has a weekly time chart (bar chart, Mon-Sun).
Use shadcn/ui components, dark mode compatible, clean and minimal."

→ v0 generates: Dashboard.tsx with StatCard, ProjectList, WeeklyChart components
→ Uses: Card, Badge, Table from shadcn/ui + Recharts for the bar chart
→ Time: 45 seconds

### Prompt 2: Kanban board
"A Kanban board with 4 columns: Backlog, In Progress, Review, Done.
Each card shows task title, priority tag (low/medium/high/urgent with colors),
assignee avatar, due date, and estimated hours. Cards are draggable between
columns. Add a 'New Task' button that opens a slide-over form. Include
a filter bar at the top with search, priority filter, and client filter."

→ v0 generates: KanbanBoard.tsx with TaskCard, NewTaskForm, FilterBar
→ Uses: Sheet, Input, Select, Badge, Avatar from shadcn/ui
→ Note: v0 uses @hello-pangea/dnd for drag-and-drop
→ Time: 60 seconds

### Prompt 3: Time tracking widget
"An inline time tracker that sits in the header. Shows current task name
('Redesign homepage — Acme Corp'), a running timer (02:34:15), and
start/pause/stop buttons. When stopped, it shows a dropdown to assign
the time entry to a project and add a note. Include a small 'Today: 5h 20m'
summary next to it."

→ v0 generates: TimeTracker.tsx with Timer, TimeEntryForm
→ Time: 30 seconds
```

Kai copies each generated component into his Next.js project. v0 outputs clean shadcn/ui code that drops right in — no adaptation needed because v0 uses the same component library.

```bash
# Kai's project setup (already done before v0)
npx create-next-app@latest freelance-pm --typescript --tailwind --app --src-dir
cd freelance-pm
npx shadcn@latest init
npx shadcn@latest add card badge table sheet input select avatar button
```

## Saturday Afternoon: Full Pages in Cursor

With individual components generated, Kai switches to Cursor to assemble full pages, add routing, and wire up the backend. Cursor's Composer mode handles multi-file edits.

```markdown
## Cursor Composer Session

Kai selects all v0-generated components and prompts:

"Using the components I've added to src/components/,  build out the
full application with these pages:
1. /dashboard — the overview dashboard with stats and project list
2. /projects — Kanban board view, filterable by client
3. /projects/[id] — single project detail with tasks and time entries
4. /time — weekly timesheet grid (rows=projects, cols=Mon-Sun, cells=hours)
5. /invoices — list of invoices with status (draft/sent/paid/overdue)

Add a sidebar navigation with icons for each section. Use next-themes
for dark mode toggle. Create mock data in src/lib/mock-data.ts that
looks realistic — use real-sounding project names and client companies.

For state management, use React context for now — we'll add a real
backend later."
```

Cursor generates 12 files in one pass: 5 page files, a layout with sidebar, mock data, a theme provider, and context providers for projects and time tracking. The entire app is navigable within 2 hours.

## Saturday Evening: Backend with Drizzle + Neon

Kai adds a real database. With Cursor rules already set (from the AI coding workflow), the generated code follows his conventions automatically.

```typescript
// src/db/schema.ts — Database schema (Cursor-generated with guidance)
import { pgTable, uuid, text, timestamp, decimal, integer, pgEnum } from "drizzle-orm/pg-core";

export const projectStatusEnum = pgEnum("project_status", ["active", "paused", "completed", "archived"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid", "overdue"]);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  clientName: text("client_name").notNull(),
  status: projectStatusEnum("status").default("active").notNull(),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),  // Client's rate
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("backlog").notNull(),         // backlog/in_progress/review/done
  priority: priorityEnum("priority").default("medium").notNull(),
  estimatedHours: decimal("estimated_hours", { precision: 5, scale: 1 }),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  taskId: uuid("task_id").references(() => tasks.id),
  date: timestamp("date").notNull(),
  hours: decimal("hours", { precision: 5, scale: 2 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: invoiceStatusEnum("status").default("draft").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  sentAt: timestamp("sent_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

## Sunday Morning: Polish and Deploy

Kai uses v0 for final visual polish — generating a landing page, a login screen, and improving the invoice PDF template. He deploys to Vercel with a single `git push`.

```bash
# Deploy to Vercel
vercel link
vercel env add DATABASE_URL                     # Neon connection string
git add -A && git commit -m "Weekend prototype v1"
git push origin main
# Vercel auto-deploys: https://freelance-pm.vercel.app
```

## Sunday Afternoon: User Testing

Kai sends the link to 5 freelancer friends. They use it for 30 minutes each while he watches via screen share. Three insights emerge immediately:

1. The time tracker needs a "forgot to start" feature — retroactive time entry
2. Invoices should auto-calculate from time entries (they don't yet)
3. The Kanban board is great but freelancers also want a simple list view

None of these insights would have surfaced from a mockup or slide deck. The working prototype — built in 48 hours — reveals real user behavior.

## What This Weekend Built

Kai has a deployed, functional prototype with:
- 5 pages with real data and navigation
- Kanban board with drag-and-drop
- Time tracking with a running timer
- Invoice management (CRUD)
- Dark mode, responsive layout
- PostgreSQL backend on Neon (free tier)
- Deployed on Vercel (free tier)

Total cost: $0 (all free tiers). Total time: ~16 working hours across the weekend. The same scope would have taken 2-3 weeks with traditional development.

The prototype isn't production-ready — it has no auth, no tests, no error handling, and the code is AI-generated spaghetti in places. But that's not the point. The point is validating the idea before investing real engineering time. If user feedback is positive, Kai rebuilds properly. If it's negative, he saved 4 weeks of wasted effort.
