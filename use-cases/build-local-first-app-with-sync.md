---
title: Build a Local-First Collaborative App with Real-Time Sync
slug: build-local-first-app-with-sync
description: Build a local-first project management app using TinyBase for reactive client-side storage with CRDT sync, Convex for the backend, Polar for monetization, and React Email for transactional notifications — creating an app that works offline, syncs across devices, and monetizes through subscriptions with license keys.
skills: [tinybase, convex-sdk, polar, react-email]
category: Frontend Development
tags: [local-first, crdt, sync, offline, monetization, collaborative]
---

# Build a Local-First Collaborative App with Real-Time Sync

Nadia is building TaskFlow, a project management tool for small teams (5-20 people). Her differentiator: it works offline-first. Users can create tasks, move them through kanban columns, and add notes even without internet. When connectivity returns, changes sync automatically without conflicts using CRDTs. Free tier is local-only; Pro adds cloud sync, team collaboration, and email notifications.

## Step 1: Local-First Data Store with TinyBase

```typescript
// store/taskStore.ts — Local-first reactive data
import { createMergeableStore } from "tinybase";
import { createLocalPersister } from "tinybase/persisters/persister-browser";
import { createWsSynchronizer } from "tinybase/synchronizers/synchronizer-ws-client";

export function createTaskStore(userId: string, isPro: boolean) {
  const store = createMergeableStore();   // CRDT-based for conflict-free sync

  store.setTablesSchema({
    tasks: {
      title: { type: "string" },
      description: { type: "string", default: "" },
      status: { type: "string", default: "todo" },
      priority: { type: "number", default: 0 },
      assignee: { type: "string", default: "" },
      projectId: { type: "string" },
      createdAt: { type: "number" },
      updatedAt: { type: "number" },
    },
    projects: {
      name: { type: "string" },
      color: { type: "string", default: "#3b82f6" },
      ownerId: { type: "string" },
    },
    columns: {
      name: { type: "string" },
      projectId: { type: "string" },
      order: { type: "number" },
    },
  });

  // Always persist locally (works offline)
  const localPersister = createLocalPersister(store, `taskflow-${userId}`);
  localPersister.startAutoLoad();
  localPersister.startAutoSave();

  // Pro users: sync via WebSocket (CRDT merge)
  if (isPro) {
    const ws = new WebSocket(`wss://sync.taskflow.app/rooms/${userId}`);
    const synchronizer = createWsSynchronizer(store, ws);
    synchronizer.startSync();

    // Sync status indicator
    ws.addEventListener("open", () => store.setValue("syncStatus", "connected"));
    ws.addEventListener("close", () => store.setValue("syncStatus", "offline"));
  }

  return store;
}
```

## Step 2: React UI with Fine-Grained Reactivity

```tsx
// components/KanbanBoard.tsx
import { useTable, useCell, useValues } from "tinybase/ui-react";

function KanbanBoard({ projectId }: { projectId: string }) {
  const columns = useTable("columns");
  const tasks = useTable("tasks");
  const syncStatus = useValues()?.syncStatus;

  const projectColumns = Object.entries(columns)
    .filter(([_, col]) => col.projectId === projectId)
    .sort(([_, a], [__, b]) => (a.order as number) - (b.order as number));

  return (
    <div className="flex gap-4 overflow-x-auto p-4">
      <div className="text-sm text-gray-400">
        {syncStatus === "connected" ? "🟢 Synced" : "🟡 Offline (changes saved locally)"}
      </div>

      {projectColumns.map(([colId, col]) => {
        const colTasks = Object.entries(tasks)
          .filter(([_, t]) => t.status === col.name && t.projectId === projectId)
          .sort(([_, a], [__, b]) => (b.priority as number) - (a.priority as number));

        return (
          <div key={colId} className="w-72 bg-gray-50 rounded-lg p-3">
            <h3 className="font-semibold mb-3">{col.name as string} ({colTasks.length})</h3>
            {colTasks.map(([taskId, task]) => (
              <TaskCard key={taskId} taskId={taskId} />
            ))}
            <AddTaskButton projectId={projectId} status={col.name as string} />
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({ taskId }: { taskId: string }) {
  // Only re-renders when THIS task's cells change
  const title = useCell("tasks", taskId, "title");
  const priority = useCell("tasks", taskId, "priority");
  const assignee = useCell("tasks", taskId, "assignee");

  return (
    <div className="bg-white p-3 rounded shadow-sm mb-2 cursor-pointer hover:shadow">
      <p className="font-medium">{title as string}</p>
      <div className="flex justify-between mt-2 text-sm text-gray-500">
        <span>{assignee as string || "Unassigned"}</span>
        <PriorityBadge level={priority as number} />
      </div>
    </div>
  );
}
```

## Step 3: Monetization with Polar

```typescript
// api/billing.ts — Polar checkout for Pro plan
import { Polar } from "@polar-sh/sdk";

const polar = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN });

export async function createProCheckout(userId: string, email: string) {
  const checkout = await polar.checkouts.create({
    productId: process.env.POLAR_PRO_PRODUCT_ID!,
    successUrl: `https://taskflow.app/billing/success?session={CHECKOUT_ID}`,
    customerEmail: email,
    metadata: { userId },
  });
  return checkout.url;
}

// Webhook: activate Pro features
export async function handlePolarWebhook(event: any) {
  if (event.type === "subscription.created") {
    const userId = event.data.customer.metadata.userId;
    await db.users.update(userId, {
      plan: "pro",
      syncEnabled: true,
      licenseKey: event.data.benefitGrants?.find(
        (b: any) => b.type === "license_keys"
      )?.properties?.key,
    });

    // Send welcome email
    await sendProWelcomeEmail(userId);
  }
}
```

## Step 4: Email Notifications with React Email

```tsx
// emails/weekly-digest.tsx
import { Html, Head, Body, Container, Heading, Text, Section, Row, Column, Button } from "@react-email/components";

interface DigestProps {
  userName: string;
  tasksCompleted: number;
  tasksOverdue: number;
  topProject: string;
  weekSummary: Array<{ day: string; completed: number }>;
}

export default function WeeklyDigest({ userName, tasksCompleted, tasksOverdue, topProject, weekSummary }: DigestProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f9fafb" }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: 24, backgroundColor: "#fff", borderRadius: 12 }}>
          <Heading>Weekly Summary for {userName}</Heading>

          <Row>
            <Column style={{ textAlign: "center", padding: 12 }}>
              <Text style={{ fontSize: 32, fontWeight: "bold", color: "#10b981" }}>{tasksCompleted}</Text>
              <Text style={{ color: "#6b7280" }}>Completed</Text>
            </Column>
            <Column style={{ textAlign: "center", padding: 12 }}>
              <Text style={{ fontSize: 32, fontWeight: "bold", color: tasksOverdue > 0 ? "#ef4444" : "#6b7280" }}>{tasksOverdue}</Text>
              <Text style={{ color: "#6b7280" }}>Overdue</Text>
            </Column>
          </Row>

          <Text>Your most active project: <strong>{topProject}</strong></Text>

          <Button href="https://taskflow.app/dashboard"
            style={{ backgroundColor: "#3b82f6", color: "#fff", padding: "12px 24px", borderRadius: 8 }}>
            Open TaskFlow
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
```

## Results

After 4 months, TaskFlow has 800 users with a 12% conversion to Pro.

- **Offline capability**: 100% of features work offline; average 2.3 hours offline usage per user per week
- **Sync latency**: <200ms CRDT merge when reconnecting; zero conflicts in 4 months of usage
- **Local performance**: Task CRUD operations in <1ms (TinyBase); no network latency for interactions
- **Conversion**: 12% free → Pro ($29/mo); main driver is team sync feature
- **MRR**: $2,784/month from 96 Pro subscribers via Polar
- **Email engagement**: 42% open rate on weekly digests; drives 3x more weekly active sessions
- **Bundle size**: TinyBase core + sync = 8KB gzipped; entire app loads in <1 second
