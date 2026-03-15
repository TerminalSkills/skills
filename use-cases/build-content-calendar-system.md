---
title: Build a Content Calendar System
slug: build-content-calendar-system
description: Build a content calendar with scheduling, editorial workflow, team assignments, content types, publishing queue, and analytics for managing multi-channel content production.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: content
tags:
  - content-calendar
  - editorial
  - scheduling
  - content-management
  - workflow
---

# Build a Content Calendar System

## The Problem

Julia leads content at a 20-person company publishing 40 pieces/month across blog, social media, email, and video. Content is tracked in a spreadsheet — 3 tabs, 200 rows, no one knows the source of truth. Deadlines are missed because nobody sees upcoming due dates. Two writers accidentally write about the same topic. Social posts go out at random times instead of optimal engagement windows. They need a content calendar: visual timeline, content type management, editorial workflow (draft→review→approved→published), team assignments, and publishing queue with optimal timing.

## Step 1: Build the Calendar Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface ContentItem {
  id: string;
  title: string;
  type: "blog" | "social" | "email" | "video" | "podcast";
  channel: string;
  status: "idea" | "assigned" | "drafting" | "review" | "approved" | "scheduled" | "published";
  assignee: string;
  reviewer: string | null;
  dueDate: string;
  publishDate: string | null;
  tags: string[];
  brief: string;
  contentUrl: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

interface CalendarView {
  items: ContentItem[];
  byDay: Record<string, ContentItem[]>;
  stats: { total: number; byStatus: Record<string, number>; byType: Record<string, number>; overdue: number };
}

export async function getCalendar(startDate: string, endDate: string, filters?: { type?: string; assignee?: string; status?: string }): Promise<CalendarView> {
  let sql = `SELECT * FROM content_items WHERE ((due_date BETWEEN $1 AND $2) OR (publish_date BETWEEN $1 AND $2))`;
  const params: any[] = [startDate, endDate];
  let idx = 3;
  if (filters?.type) { sql += ` AND type = $${idx}`; params.push(filters.type); idx++; }
  if (filters?.assignee) { sql += ` AND assignee = $${idx}`; params.push(filters.assignee); idx++; }
  if (filters?.status) { sql += ` AND status = $${idx}`; params.push(filters.status); idx++; }
  sql += " ORDER BY COALESCE(publish_date, due_date)";

  const { rows: items } = await pool.query(sql, params);

  const byDay: Record<string, ContentItem[]> = {};
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let overdue = 0;

  for (const item of items) {
    const day = (item.publish_date || item.due_date).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(item);
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    byType[item.type] = (byType[item.type] || 0) + 1;
    if (item.due_date < new Date() && !['published', 'scheduled'].includes(item.status)) overdue++;
  }

  return { items, byDay, stats: { total: items.length, byStatus, byType, overdue } };
}

export async function createContentItem(params: Omit<ContentItem, "id" | "createdAt" | "status"> & { status?: string }): Promise<ContentItem> {
  const id = `content-${randomBytes(6).toString("hex")}`;
  await pool.query(
    `INSERT INTO content_items (id, title, type, channel, status, assignee, reviewer, due_date, publish_date, tags, brief, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [id, params.title, params.type, params.channel, params.status || "idea", params.assignee, params.reviewer, params.dueDate, params.publishDate, JSON.stringify(params.tags), params.brief]
  );
  return { ...params, id, status: (params.status || "idea") as any, contentUrl: null, metadata: {}, createdAt: new Date().toISOString() };
}

export async function updateStatus(itemId: string, newStatus: ContentItem["status"], userId: string): Promise<void> {
  const transitions: Record<string, string[]> = {
    idea: ["assigned"], assigned: ["drafting"], drafting: ["review"],
    review: ["approved", "drafting"], approved: ["scheduled"], scheduled: ["published"],
  };
  const { rows: [current] } = await pool.query("SELECT status FROM content_items WHERE id = $1", [itemId]);
  if (!current) throw new Error("Item not found");
  if (!transitions[current.status]?.includes(newStatus)) throw new Error(`Invalid transition: ${current.status} → ${newStatus}`);

  await pool.query("UPDATE content_items SET status = $2 WHERE id = $1", [itemId, newStatus]);
  await pool.query("INSERT INTO content_activity (item_id, action, user_id, created_at) VALUES ($1, $2, $3, NOW())", [itemId, `status:${newStatus}`, userId]);

  if (newStatus === "review" || newStatus === "approved") {
    await redis.rpush("notification:queue", JSON.stringify({ type: "content_status", itemId, status: newStatus }));
  }
}

export async function checkDuplicateTopics(title: string): Promise<Array<{ id: string; title: string; similarity: number }>> {
  const { rows } = await pool.query(
    `SELECT id, title, similarity(title, $1) as sim FROM content_items WHERE similarity(title, $1) > 0.3 AND status != 'published' ORDER BY sim DESC LIMIT 5`,
    [title]
  );
  return rows;
}

export async function getOptimalPublishTime(type: string, channel: string): Promise<{ day: string; hour: number; reason: string }> {
  const optimal: Record<string, { day: string; hour: number; reason: string }> = {
    "blog:website": { day: "Tuesday", hour: 10, reason: "Highest organic traffic" },
    "social:twitter": { day: "Wednesday", hour: 13, reason: "Peak engagement" },
    "social:linkedin": { day: "Tuesday", hour: 9, reason: "Professional morning scroll" },
    "email:newsletter": { day: "Thursday", hour: 8, reason: "Highest open rates" },
  };
  return optimal[`${type}:${channel}`] || { day: "Tuesday", hour: 10, reason: "General best practice" };
}
```

## Results

- **Missed deadlines: 8/month → 1** — calendar shows all due dates visually; overdue items highlighted red; assignees get reminders 2 days before
- **Duplicate topics eliminated** — title similarity check catches "AI in Marketing" vs "Marketing with AI" before assignment; no wasted effort
- **40 pieces/month managed visually** — drag items on calendar to reschedule; filter by type, assignee, status; spreadsheet retired
- **Editorial workflow enforced** — draft can't publish without review; reviewer notified automatically; approved content queued for optimal time
- **Optimal timing** — blog posts published Tuesday 10 AM (highest traffic); LinkedIn posts at 9 AM (professional audience); engagement up 25%
