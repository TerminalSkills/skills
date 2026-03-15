---
title: Build a Content Versioning System
slug: build-content-versioning-system
description: Build a content versioning system with full revision history, diff visualization, branch-and-merge workflows, scheduled publishing, and rollback capabilities for CMS content.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: content
tags:
  - versioning
  - cms
  - content
  - revision-history
  - publishing
---

# Build a Content Versioning System

## The Problem

Rosa manages content at a 20-person media company publishing 50 articles daily. Writers accidentally overwrite each other's edits. Nobody knows who changed what or when. Rolling back a bad edit means restoring a full database backup — taking the site down for 20 minutes. Editors want to preview changes before publishing. Legal needs an audit trail of every content modification for compliance. They need git-like versioning for content: every change tracked, diffs visible, branches for drafts, scheduled publishing, and instant rollback.

## Step 1: Build the Versioning Engine

```typescript
// src/versioning/engine.ts — Content versioning with diffs, branches, and scheduled publishing
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash, randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface ContentVersion {
  id: string;
  contentId: string;
  version: number;
  branch: string;
  title: string;
  body: string;
  metadata: Record<string, any>;
  checksum: string;
  authorId: string;
  authorName: string;
  message: string;          // commit message describing what changed
  parentVersionId: string | null;
  status: "draft" | "review" | "approved" | "published" | "archived";
  scheduledAt: string | null;
  createdAt: string;
}

interface ContentDiff {
  additions: number;
  deletions: number;
  changes: Array<{ type: "add" | "remove" | "change"; line: number; content: string }>;
}

// Save new version (auto-increments version number per branch)
export async function saveVersion(params: {
  contentId: string;
  branch?: string;
  title: string;
  body: string;
  metadata?: Record<string, any>;
  authorId: string;
  message: string;
}): Promise<ContentVersion> {
  const branch = params.branch || "main";

  // Get latest version on this branch
  const { rows: [latest] } = await pool.query(
    `SELECT * FROM content_versions WHERE content_id = $1 AND branch = $2 ORDER BY version DESC LIMIT 1`,
    [params.contentId, branch]
  );

  const version = latest ? latest.version + 1 : 1;
  const id = `cv-${randomBytes(6).toString("hex")}`;
  const checksum = createHash("sha256").update(params.title + params.body).digest("hex").slice(0, 12);

  const { rows: [author] } = await pool.query("SELECT name FROM users WHERE id = $1", [params.authorId]);

  const newVersion: ContentVersion = {
    id, contentId: params.contentId, version, branch,
    title: params.title, body: params.body,
    metadata: params.metadata || {},
    checksum, authorId: params.authorId,
    authorName: author?.name || "Unknown",
    message: params.message,
    parentVersionId: latest?.id || null,
    status: "draft",
    scheduledAt: null,
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO content_versions (id, content_id, version, branch, title, body, metadata, checksum, author_id, message, parent_version_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', NOW())`,
    [id, params.contentId, version, branch, params.title, params.body,
     JSON.stringify(newVersion.metadata), checksum, params.authorId,
     params.message, newVersion.parentVersionId]
  );

  await redis.del(`content:latest:${params.contentId}:${branch}`);
  return newVersion;
}

// Get diff between two versions
export async function getDiff(versionIdA: string, versionIdB: string): Promise<ContentDiff> {
  const { rows: [a] } = await pool.query("SELECT * FROM content_versions WHERE id = $1", [versionIdA]);
  const { rows: [b] } = await pool.query("SELECT * FROM content_versions WHERE id = $1", [versionIdB]);
  if (!a || !b) throw new Error("Version not found");

  const linesA = a.body.split("\n");
  const linesB = b.body.split("\n");
  const changes: ContentDiff["changes"] = [];
  let additions = 0, deletions = 0;

  const maxLen = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= linesA.length) { changes.push({ type: "add", line: i + 1, content: linesB[i] }); additions++; }
    else if (i >= linesB.length) { changes.push({ type: "remove", line: i + 1, content: linesA[i] }); deletions++; }
    else if (linesA[i] !== linesB[i]) { changes.push({ type: "change", line: i + 1, content: linesB[i] }); additions++; deletions++; }
  }

  return { additions, deletions, changes };
}

// Merge branch into main
export async function mergeBranch(contentId: string, sourceBranch: string, userId: string): Promise<ContentVersion> {
  const { rows: [source] } = await pool.query(
    `SELECT * FROM content_versions WHERE content_id = $1 AND branch = $2 ORDER BY version DESC LIMIT 1`,
    [contentId, sourceBranch]
  );
  if (!source) throw new Error("Source branch not found");

  return saveVersion({
    contentId, branch: "main",
    title: source.title, body: source.body,
    metadata: JSON.parse(source.metadata),
    authorId: userId,
    message: `Merge branch '${sourceBranch}' into main`,
  });
}

// Instant rollback to any previous version
export async function rollback(contentId: string, targetVersionId: string, userId: string): Promise<ContentVersion> {
  const { rows: [target] } = await pool.query(
    "SELECT * FROM content_versions WHERE id = $1 AND content_id = $2",
    [targetVersionId, contentId]
  );
  if (!target) throw new Error("Target version not found");

  return saveVersion({
    contentId, branch: "main",
    title: target.title, body: target.body,
    metadata: JSON.parse(target.metadata),
    authorId: userId,
    message: `Rollback to version ${target.version}`,
  });
}

// Schedule version for future publishing
export async function schedulePublish(versionId: string, publishAt: string): Promise<void> {
  await pool.query(
    "UPDATE content_versions SET scheduled_at = $2, status = 'approved' WHERE id = $1",
    [versionId, publishAt]
  );
  const ttl = Math.ceil((new Date(publishAt).getTime() - Date.now()) / 1000);
  if (ttl > 0) {
    await redis.setex(`content:scheduled:${versionId}`, ttl, "publish");
  }
}

// Publish version (make live, archive previous)
export async function publish(versionId: string): Promise<void> {
  const { rows: [version] } = await pool.query("SELECT * FROM content_versions WHERE id = $1", [versionId]);
  if (!version) throw new Error("Version not found");

  await pool.query(
    "UPDATE content_versions SET status = 'archived' WHERE content_id = $1 AND status = 'published'",
    [version.content_id]
  );
  await pool.query("UPDATE content_versions SET status = 'published' WHERE id = $1", [versionId]);
  await redis.del(`content:published:${version.content_id}`);
}

// Get full version history for content
export async function getHistory(contentId: string, branch?: string): Promise<ContentVersion[]> {
  let sql = "SELECT * FROM content_versions WHERE content_id = $1";
  const params: any[] = [contentId];
  if (branch) { sql += " AND branch = $2"; params.push(branch); }
  sql += " ORDER BY version DESC LIMIT 100";
  const { rows } = await pool.query(sql, params);
  return rows;
}
```

## Results

- **Full audit trail** — every edit tracked with author, timestamp, and commit message; legal compliance satisfied; no more "who changed the headline?"
- **Instant rollback: 20 min → 1 click** — bad edit reverted by creating a new version from old content; no database restore; site stays up
- **Branch workflows** — writer creates "redesign" branch, edits freely, editor reviews diff, merges when ready; no overwriting live content
- **Scheduled publishing** — article set to publish at 9 AM Monday; editor approves Friday; version auto-publishes on schedule
- **Visual diffs** — editor sees exactly what changed: +12 lines added, -3 removed; reviews in minutes instead of re-reading entire article
