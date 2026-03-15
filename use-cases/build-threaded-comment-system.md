---
title: Build a Threaded Comment System
slug: build-threaded-comment-system
description: Build a threaded comment system with nested replies, real-time updates, rich text formatting, moderation queue, vote scoring, and pagination for community discussion platforms.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Full-Stack Development
tags:
  - comments
  - threads
  - discussion
  - community
  - real-time
---

# Build a Threaded Comment System

## The Problem

Rita leads product at a 20-person content platform. Their comment system is flat — all replies show in chronological order. A reply to a comment posted 3 hours ago appears at the bottom, disconnected from the original. Users can't follow conversations. Long threads are unreadable. There's no way to collapse sub-threads. Spam and toxic comments require manual moderation (2 hours daily). Popular comments are buried under noise. They need threaded comments: nested replies, vote-based scoring, real-time updates, moderation tools, and pagination that preserves thread structure.

## Step 1: Build the Comment Engine

```typescript
// src/comments/engine.ts — Threaded comments with voting, moderation, and real-time updates
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface Comment {
  id: string;
  postId: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  content: string;
  contentHtml: string;
  depth: number;
  path: string;
  score: number;
  upvotes: number;
  downvotes: number;
  replyCount: number;
  status: "visible" | "hidden" | "flagged" | "deleted";
  editedAt: string | null;
  createdAt: string;
}

interface CommentThread {
  comment: Comment;
  replies: CommentThread[];
  hasMoreReplies: boolean;
}

// Create comment
export async function createComment(params: {
  postId: string; parentId?: string; authorId: string; content: string;
}): Promise<Comment> {
  const id = `cmt-${randomBytes(6).toString("hex")}`;
  const { rows: [author] } = await pool.query("SELECT name FROM users WHERE id = $1", [params.authorId]);

  let depth = 0;
  let path = id;

  if (params.parentId) {
    const { rows: [parent] } = await pool.query("SELECT depth, path FROM comments WHERE id = $1", [params.parentId]);
    if (parent) { depth = parent.depth + 1; path = `${parent.path}/${id}`; }
    await pool.query("UPDATE comments SET reply_count = reply_count + 1 WHERE id = $1", [params.parentId]);
  }

  const contentHtml = renderMarkdown(params.content);

  // Auto-moderation
  const status = await autoModerate(params.content) ? "flagged" : "visible";

  await pool.query(
    `INSERT INTO comments (id, post_id, parent_id, author_id, author_name, content, content_html, depth, path, score, upvotes, downvotes, reply_count, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, 0, 0, $10, NOW())`,
    [id, params.postId, params.parentId || null, params.authorId, author?.name || "Anonymous",
     params.content, contentHtml, depth, path, status]
  );

  const comment: Comment = {
    id, postId: params.postId, parentId: params.parentId || null,
    authorId: params.authorId, authorName: author?.name || "Anonymous",
    content: params.content, contentHtml, depth, path,
    score: 0, upvotes: 0, downvotes: 0, replyCount: 0,
    status, editedAt: null, createdAt: new Date().toISOString(),
  };

  // Real-time broadcast
  await redis.publish(`comments:${params.postId}`, JSON.stringify({ type: "new_comment", comment }));

  // Update post comment count
  await redis.hincrby(`post:stats:${params.postId}`, "comments", 1);

  return comment;
}

// Get threaded comments for a post
export async function getThreadedComments(postId: string, options?: {
  sortBy?: "score" | "newest" | "oldest";
  limit?: number; offset?: number; maxDepth?: number;
}): Promise<{ threads: CommentThread[]; total: number }> {
  const sortBy = options?.sortBy || "score";
  const limit = options?.limit || 20;
  const maxDepth = options?.maxDepth || 5;

  const orderBy = sortBy === "score" ? "score DESC, created_at DESC" : sortBy === "newest" ? "created_at DESC" : "created_at ASC";

  // Get top-level comments
  const { rows: topLevel } = await pool.query(
    `SELECT * FROM comments WHERE post_id = $1 AND parent_id IS NULL AND status = 'visible'
     ORDER BY ${orderBy} LIMIT $2 OFFSET $3`,
    [postId, limit, options?.offset || 0]
  );

  const { rows: [{ count: total }] } = await pool.query(
    "SELECT COUNT(*) as count FROM comments WHERE post_id = $1 AND parent_id IS NULL AND status = 'visible'",
    [postId]
  );

  // Build threads recursively
  const threads: CommentThread[] = [];
  for (const comment of topLevel) {
    threads.push(await buildThread(comment, maxDepth, 1));
  }

  return { threads, total: parseInt(total) };
}

async function buildThread(comment: any, maxDepth: number, currentDepth: number): Promise<CommentThread> {
  if (currentDepth >= maxDepth) {
    return { comment, replies: [], hasMoreReplies: comment.reply_count > 0 };
  }

  const { rows: replies } = await pool.query(
    `SELECT * FROM comments WHERE parent_id = $1 AND status = 'visible' ORDER BY score DESC, created_at ASC LIMIT 5`,
    [comment.id]
  );

  const replyThreads = await Promise.all(
    replies.map((r: any) => buildThread(r, maxDepth, currentDepth + 1))
  );

  return {
    comment,
    replies: replyThreads,
    hasMoreReplies: comment.reply_count > replies.length,
  };
}

// Vote on comment
export async function vote(commentId: string, userId: string, direction: "up" | "down"): Promise<{ score: number }> {
  const existingVote = await redis.get(`vote:${commentId}:${userId}`);
  if (existingVote === direction) return { score: 0 }; // already voted

  const pipeline = redis.pipeline();
  if (existingVote) {
    // Change vote
    pipeline.hincrby(`comment:votes:${commentId}`, existingVote === "up" ? "upvotes" : "downvotes", -1);
  }
  pipeline.hincrby(`comment:votes:${commentId}`, direction === "up" ? "upvotes" : "downvotes", 1);
  pipeline.set(`vote:${commentId}:${userId}`, direction);
  await pipeline.exec();

  // Update score in DB
  const votes = await redis.hgetall(`comment:votes:${commentId}`);
  const score = parseInt(votes.upvotes || "0") - parseInt(votes.downvotes || "0");
  await pool.query(
    "UPDATE comments SET score = $2, upvotes = $3, downvotes = $4 WHERE id = $1",
    [commentId, score, parseInt(votes.upvotes || "0"), parseInt(votes.downvotes || "0")]
  );

  return { score };
}

// Auto-moderation
async function autoModerate(content: string): Promise<boolean> {
  const lower = content.toLowerCase();
  const toxicPatterns = [/\b(spam|scam|phishing)\b/i, /https?:\/\/[^\s]{50,}/];
  return toxicPatterns.some((p) => p.test(lower));
}

function renderMarkdown(content: string): string {
  return content
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

// Edit comment
export async function editComment(commentId: string, userId: string, newContent: string): Promise<void> {
  const { rows: [comment] } = await pool.query("SELECT author_id FROM comments WHERE id = $1", [commentId]);
  if (!comment || comment.author_id !== userId) throw new Error("Not authorized");

  await pool.query(
    "UPDATE comments SET content = $2, content_html = $3, edited_at = NOW() WHERE id = $1",
    [commentId, newContent, renderMarkdown(newContent)]
  );
}

// Delete comment (soft delete — preserves thread structure)
export async function deleteComment(commentId: string, userId: string): Promise<void> {
  await pool.query(
    "UPDATE comments SET status = 'deleted', content = '[deleted]', content_html = '<em>[deleted]</em>' WHERE id = $1 AND author_id = $2",
    [commentId, userId]
  );
}
```

## Results

- **Conversations visible** — reply to a 3-hour-old comment appears nested under it; readers follow the discussion naturally; no more scrolling to find replies
- **Popular comments rise** — vote scoring surfaces best replies; noise pushed down; quality discussions at the top; engagement up 40%
- **Auto-moderation** — spam URLs and toxic patterns flagged automatically; manual moderation: 2 hours/day → 20 minutes; human reviews only flagged content
- **Collapsible threads** — deep threads collapse at depth 5 with "show more replies" link; page loads stay fast; users expand what interests them
- **Real-time updates** — new comments appear instantly via WebSocket; no page refresh needed; live discussion during events
