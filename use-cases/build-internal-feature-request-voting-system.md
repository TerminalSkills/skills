---
title: Build an Internal Feature Request Voting System
slug: build-internal-feature-request-voting-system
description: Build a feature request and voting system that lets customers submit ideas, vote on priorities, and track implementation status — turning user feedback into a transparent product roadmap.
skills:
  - typescript
  - nextjs
  - postgresql
  - redis
  - tailwindcss
  - zod
category: Full-Stack Development
tags:
  - product-management
  - voting
  - feedback
  - roadmap
  - user-engagement
---

# Build an Internal Feature Request Voting System

## The Problem

Luis runs product at a 50-person B2B analytics platform. Feature requests arrive from everywhere — Intercom chats, sales call notes, Slack messages, support tickets, quarterly business reviews. The product team tracks 400+ requests across 6 different spreadsheets with no deduplication. Customers submit the same request 3-4 times because they can't see it's already logged. The team built the wrong features twice last quarter because they prioritized based on who shouted loudest rather than actual demand. A voting system would surface true priorities and show customers their voice matters — reducing churn driven by "you never listen to us" complaints ($240K ARR at risk).

## Step 1: Design the Data Model

The system tracks feature requests with metadata, votes with optional comments, and status transitions. Requests can be merged when duplicates are detected.

```typescript
// src/db/schema.ts — Feature request and voting data model
import { pgTable, uuid, varchar, text, integer, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";

export const requestStatus = pgEnum("request_status", [
  "pending_review",    // submitted, awaiting triage
  "under_review",      // product team is evaluating
  "planned",           // accepted, on the roadmap
  "in_progress",       // currently being built
  "shipped",           // released
  "declined",          // won't do (with reason)
  "merged",            // duplicate, merged into another request
]);

export const featureRequests = pgTable("feature_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull(),
  submitterId: uuid("submitter_id").notNull(),
  submitterAccountId: uuid("submitter_account_id").notNull(), // company
  category: varchar("category", { length: 50 }),              // e.g., "reporting", "integrations"
  status: requestStatus("status").default("pending_review").notNull(),
  statusNote: text("status_note"),                            // reason for decline or update
  voteCount: integer("vote_count").default(0).notNull(),
  commentCount: integer("comment_count").default(0).notNull(),
  mergedIntoId: uuid("merged_into_id"),                       // if merged into another request
  estimatedQuarter: varchar("estimated_quarter", { length: 10 }), // e.g., "Q2 2026"
  isPublic: boolean("is_public").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const votes = pgTable("votes", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull(),
  userId: uuid("user_id").notNull(),
  accountId: uuid("account_id").notNull(),
  priority: integer("priority").default(1).notNull(), // 1-3: nice-to-have, important, critical
  comment: text("comment"),                            // optional "why this matters to us"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const statusHistory = pgTable("status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull(),
  fromStatus: requestStatus("from_status"),
  toStatus: requestStatus("to_status").notNull(),
  changedBy: uuid("changed_by").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

## Step 2: Build the Request and Voting API

The API handles request submission, voting (with one vote per user per request), and admin actions like status changes and merging duplicates.

```typescript
// src/routes/requests.ts — Feature request CRUD + voting API
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { featureRequests, votes, statusHistory } from "../db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();

const CreateRequestSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(20).max(5000),
  category: z.string().optional(),
});

const VoteSchema = z.object({
  priority: z.number().int().min(1).max(3),
  comment: z.string().max(1000).optional(),
});

// List requests with sorting and filtering
app.get("/requests", async (c) => {
  const sort = c.req.query("sort") || "votes"; // votes | newest | status
  const status = c.req.query("status");
  const category = c.req.query("category");
  const page = Number(c.req.query("page") || 1);
  const limit = 20;

  let query = db.select().from(featureRequests)
    .where(eq(featureRequests.isPublic, true))
    .$dynamic();

  if (status) {
    query = query.where(eq(featureRequests.status, status as any));
  }
  if (category) {
    query = query.where(eq(featureRequests.category, category));
  }

  const orderMap = {
    votes: desc(featureRequests.voteCount),
    newest: desc(featureRequests.createdAt),
    status: featureRequests.status,
  };

  const results = await query
    .orderBy(orderMap[sort as keyof typeof orderMap] || orderMap.votes)
    .limit(limit)
    .offset((page - 1) * limit);

  // Get total count for pagination
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(featureRequests)
    .where(eq(featureRequests.isPublic, true));

  return c.json({ requests: results, total: count, page, pages: Math.ceil(count / limit) });
});

// Submit a new request
app.post("/requests", async (c) => {
  const userId = c.get("userId");
  const accountId = c.get("accountId");
  const body = CreateRequestSchema.parse(await c.req.json());

  // Check for potential duplicates before creating
  const duplicates = await db.select()
    .from(featureRequests)
    .where(sql`similarity(title, ${body.title}) > 0.4`)
    .limit(3);

  if (duplicates.length > 0) {
    return c.json({
      warning: "Similar requests found. Consider voting on an existing one instead.",
      similarRequests: duplicates.map((d) => ({ id: d.id, title: d.title, votes: d.voteCount })),
      canProceed: true, // let the user decide
    }, 200);
  }

  const [request] = await db.insert(featureRequests).values({
    title: body.title,
    description: body.description,
    category: body.category,
    submitterId: userId,
    submitterAccountId: accountId,
  }).returning();

  // Auto-vote with the submitter's vote
  await db.insert(votes).values({
    requestId: request.id,
    userId,
    accountId,
    priority: 2, // default: "important"
  });
  await db.update(featureRequests)
    .set({ voteCount: 1 })
    .where(eq(featureRequests.id, request.id));

  return c.json(request, 201);
});

// Vote on a request
app.post("/requests/:id/vote", async (c) => {
  const { id } = c.req.param();
  const userId = c.get("userId");
  const accountId = c.get("accountId");
  const body = VoteSchema.parse(await c.req.json());

  // Check for existing vote (one per user per request)
  const existing = await db.select().from(votes)
    .where(and(eq(votes.requestId, id), eq(votes.userId, userId)));

  if (existing.length > 0) {
    // Update existing vote
    await db.update(votes)
      .set({ priority: body.priority, comment: body.comment })
      .where(eq(votes.id, existing[0].id));
  } else {
    await db.insert(votes).values({
      requestId: id,
      userId,
      accountId,
      priority: body.priority,
      comment: body.comment,
    });

    // Increment vote count
    await db.update(featureRequests)
      .set({ voteCount: sql`vote_count + 1` })
      .where(eq(featureRequests.id, id));
  }

  // Invalidate cache
  await redis.del(`request:${id}`);

  return c.json({ success: true });
});

// Remove vote
app.delete("/requests/:id/vote", async (c) => {
  const { id } = c.req.param();
  const userId = c.get("userId");

  const deleted = await db.delete(votes)
    .where(and(eq(votes.requestId, id), eq(votes.userId, userId)))
    .returning();

  if (deleted.length > 0) {
    await db.update(featureRequests)
      .set({ voteCount: sql`vote_count - 1` })
      .where(eq(featureRequests.id, id));
    await redis.del(`request:${id}`);
  }

  return c.json({ success: true });
});

// Admin: update status
app.patch("/requests/:id/status", async (c) => {
  const { id } = c.req.param();
  const adminId = c.get("userId");
  const { status, note, estimatedQuarter } = await c.req.json();

  const [current] = await db.select().from(featureRequests)
    .where(eq(featureRequests.id, id));

  if (!current) return c.json({ error: "Not found" }, 404);

  // Record status transition
  await db.insert(statusHistory).values({
    requestId: id,
    fromStatus: current.status,
    toStatus: status,
    changedBy: adminId,
    note,
  });

  await db.update(featureRequests)
    .set({
      status,
      statusNote: note,
      estimatedQuarter: estimatedQuarter || current.estimatedQuarter,
      updatedAt: new Date(),
    })
    .where(eq(featureRequests.id, id));

  // Notify voters when status changes to planned/in_progress/shipped
  if (["planned", "in_progress", "shipped"].includes(status)) {
    const voters = await db.select().from(votes)
      .where(eq(votes.requestId, id));

    // Queue notifications (async)
    for (const voter of voters) {
      await redis.lpush("notifications:queue", JSON.stringify({
        userId: voter.userId,
        type: "status_update",
        requestId: id,
        requestTitle: current.title,
        newStatus: status,
        note,
      }));
    }
  }

  return c.json({ success: true });
});

// Admin: merge duplicate request into another
app.post("/requests/:id/merge/:targetId", async (c) => {
  const { id, targetId } = c.req.param();

  // Move all votes from source to target
  const sourceVotes = await db.select().from(votes)
    .where(eq(votes.requestId, id));

  for (const vote of sourceVotes) {
    // Check if voter already voted on target
    const existing = await db.select().from(votes)
      .where(and(eq(votes.requestId, targetId), eq(votes.userId, vote.userId)));

    if (existing.length === 0) {
      await db.insert(votes).values({
        requestId: targetId,
        userId: vote.userId,
        accountId: vote.accountId,
        priority: vote.priority,
        comment: vote.comment,
      });
    }
  }

  // Recalculate target vote count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(votes)
    .where(eq(votes.requestId, targetId));

  await db.update(featureRequests)
    .set({ voteCount: count })
    .where(eq(featureRequests.id, targetId));

  // Mark source as merged
  await db.update(featureRequests)
    .set({ status: "merged", mergedIntoId: targetId, statusNote: `Merged into request ${targetId}` })
    .where(eq(featureRequests.id, id));

  return c.json({ success: true, mergedVotes: sourceVotes.length });
});

export default app;
```

## Step 3: Build the Voting Board UI

The frontend shows a clean board with request cards, vote buttons, status filters, and a submission form. Vote counts and status badges make priorities immediately visible.

```typescript
// src/components/FeatureBoard.tsx — Feature request voting board UI
import { useState, useEffect } from "react";

interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  voteCount: number;
  commentCount: number;
  estimatedQuarter?: string;
  createdAt: string;
  hasVoted?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending_review: { label: "Under Review", color: "text-gray-700", bg: "bg-gray-100" },
  planned: { label: "Planned", color: "text-blue-700", bg: "bg-blue-100" },
  in_progress: { label: "In Progress", color: "text-yellow-700", bg: "bg-yellow-100" },
  shipped: { label: "Shipped", color: "text-green-700", bg: "bg-green-100" },
  declined: { label: "Declined", color: "text-red-700", bg: "bg-red-100" },
};

export function FeatureBoard() {
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("votes");

  useEffect(() => {
    fetchRequests();
  }, [filter, sort]);

  async function fetchRequests() {
    const params = new URLSearchParams({ sort });
    if (filter !== "all") params.set("status", filter);
    const res = await fetch(`/api/requests?${params}`);
    const data = await res.json();
    setRequests(data.requests);
  }

  async function handleVote(requestId: string, hasVoted: boolean) {
    if (hasVoted) {
      await fetch(`/api/requests/${requestId}/vote`, { method: "DELETE" });
    } else {
      await fetch(`/api/requests/${requestId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: 2 }),
      });
    }
    fetchRequests();
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Feature Requests</h1>
        <button
          onClick={() => {/* open submit modal */}}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Submit Request
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["all", "pending_review", "planned", "in_progress", "shipped"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-sm ${
              filter === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {s === "all" ? "All" : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="ml-auto px-3 py-1 border rounded-lg text-sm"
        >
          <option value="votes">Most Voted</option>
          <option value="newest">Newest</option>
        </select>
      </div>

      {/* Request cards */}
      <div className="space-y-3">
        {requests.map((req) => {
          const statusConf = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending_review;
          return (
            <div key={req.id} className="flex items-start gap-4 p-4 bg-white rounded-lg border hover:shadow-sm">
              {/* Vote button */}
              <button
                onClick={() => handleVote(req.id, !!req.hasVoted)}
                className={`flex flex-col items-center min-w-[48px] p-2 rounded-lg border ${
                  req.hasVoted
                    ? "bg-blue-50 border-blue-300 text-blue-600"
                    : "hover:bg-gray-50 border-gray-200 text-gray-500"
                }`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 3l-7 7h4v7h6v-7h4l-7-7z" />
                </svg>
                <span className="text-sm font-semibold">{req.voteCount}</span>
              </button>

              {/* Content */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">{req.title}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusConf.bg} ${statusConf.color}`}>
                    {statusConf.label}
                  </span>
                  {req.estimatedQuarter && (
                    <span className="text-xs text-gray-500">📅 {req.estimatedQuarter}</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">{req.description}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  {req.category && <span className="bg-gray-100 px-2 py-0.5 rounded">{req.category}</span>}
                  <span>{req.commentCount} comments</span>
                  <span>{new Date(req.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

## Results

After launching the feature voting board:

- **Duplicate feature requests dropped by 73%** — similar request detection and a searchable board prevent customers from submitting duplicates; 400+ requests consolidated to 145 unique items
- **Product prioritization accuracy improved** — the top 10 voted features aligned with revenue-weighted customer demand; the team stopped building features only 2 power users wanted
- **"You never listen" churn complaints dropped to zero** — $240K ARR saved; customers see their requests tracked with status updates and estimated timelines
- **Customer engagement with the board: 68% monthly active** — customers check back to vote and see progress; average customer submitted 3.2 votes in the first month
- **Product team saves 6 hours/week** — no more triaging requests from 6 different spreadsheets and Slack channels; everything flows through one system with duplicate detection
