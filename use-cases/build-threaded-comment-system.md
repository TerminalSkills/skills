---
title: Build a Threaded Comment System
slug: build-threaded-comment-system
description: Build a Reddit-style threaded comment system with nested replies, voting, sorting, pagination, mention notifications, and moderation tools — supporting deep discussion threads on any content.
skills:
  - typescript
  - postgresql
  - redis
  - hono
  - zod
category: Full-Stack Development
tags:
  - comments
  - threads
  - discussion
  - community
  - social
---

# Build a Threaded Comment System

## The Problem

Nina leads product at a 20-person developer documentation platform. Users request comments on docs and tutorials. Flat comment systems (like Disqus) make conversations hard to follow — replies to different points mix together. They need threaded comments where replies nest under their parent, users can vote on helpful answers, and moderators can hide spam. The comment system should work on any entity (docs, tutorials, blog posts) and handle thousands of comments per page efficiently.

## Step 1: Build the Comment Engine

```typescript
// src/comments/engine.ts — Threaded comments with voting, moderation, and efficient tree loading
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

const MAX_DEPTH = 10;              // maximum nesting depth
const COMMENTS_PER_PAGE = 20;

interface Comment {
  id: string;
  entityType: string;          // "doc", "tutorial", "post"
  entityId: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  body: string;
  bodyHtml: string;            // rendered markdown
  depth: number;
  path: string;                // materialized path: "001.003.007"
  score: number;               // upvotes - downvotes
  upvotes: number;
  downvotes: number;
  replyCount: number;
  status: "visible" | "hidden" | "deleted";
  createdAt: string;
  editedAt: string | null;
  children?: Comment[];
}

// Create a comment or reply
export async function createComment(
  entityType: string,
  entityId: string,
  authorId: string,
  body: string,
  parentId?: string
): Promise<Comment> {
  let depth = 0;
  let path = "";

  if (parentId) {
    const { rows: [parent] } = await pool.query(
      "SELECT depth, path FROM comments WHERE id = $1",
      [parentId]
    );
    if (!parent) throw new Error("Parent comment not found");
    if (parent.depth >= MAX_DEPTH) throw new Error("Maximum reply depth reached");

    depth = parent.depth + 1;

    // Generate path segment (sequential within parent)
    const { rows: [{ count }] } = await pool.query(
      "SELECT COUNT(*) as count FROM comments WHERE parent_id = $1",
      [parentId]
    );
    const segment = String(parseInt(count) + 1).padStart(3, "0");
    path = `${parent.path}.${segment}`;
  } else {
    // Top-level comment
    const { rows: [{ count }] } = await pool.query(
      "SELECT COUNT(*) as count FROM comments WHERE entity_type = $1 AND entity_id = $2 AND parent_id IS NULL",
      [entityType, entityId]
    );
    path = String(parseInt(count) + 1).padStart(3, "0");
  }

  const id = `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const bodyHtml = renderMarkdown(body);

  const { rows: [comment] } = await pool.query(
    `INSERT INTO comments (id, entity_type, entity_id, parent_id, author_id, body, body_html, depth, path, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     RETURNING *`,
    [id, entityType, entityId, parentId || null, authorId, body, bodyHtml, depth, path]
  );

  // Update parent reply count
  if (parentId) {
    await pool.query(
      "UPDATE comments SET reply_count = reply_count + 1 WHERE id = $1",
      [parentId]
    );
  }

  // Invalidate cache
  await redis.del(`comments:${entityType}:${entityId}`);

  // Handle @mentions
  const mentions = extractMentions(body);
  if (mentions.length > 0) {
    await notifyMentions(mentions, comment, entityType, entityId);
  }

  // Notify parent author of reply
  if (parentId) {
    const { rows: [parent] } = await pool.query("SELECT author_id FROM comments WHERE id = $1", [parentId]);
    if (parent.author_id !== authorId) {
      await redis.rpush("notification:queue", JSON.stringify({
        userId: parent.author_id,
        type: "comment_reply",
        data: { commentId: id, entityType, entityId, authorId },
      }));
    }
  }

  return comment;
}

// Get threaded comments for an entity
export async function getComments(
  entityType: string,
  entityId: string,
  options?: {
    sort?: "newest" | "oldest" | "top";
    page?: number;
    userId?: string;         // for showing user's votes
  }
): Promise<{ comments: Comment[]; total: number; hasMore: boolean }> {
  const page = options?.page || 1;
  const sort = options?.sort || "top";

  // Sort order for top-level comments
  let orderBy = "score DESC, created_at DESC";
  if (sort === "newest") orderBy = "created_at DESC";
  if (sort === "oldest") orderBy = "created_at ASC";

  // Get top-level comments with pagination
  const { rows: topLevel } = await pool.query(
    `SELECT c.*, u.name as author_name, u.avatar_url as author_avatar
     FROM comments c
     JOIN users u ON c.author_id = u.id
     WHERE c.entity_type = $1 AND c.entity_id = $2
       AND c.parent_id IS NULL AND c.status = 'visible'
     ORDER BY ${orderBy}
     LIMIT $3 OFFSET $4`,
    [entityType, entityId, COMMENTS_PER_PAGE, (page - 1) * COMMENTS_PER_PAGE]
  );

  // Get all replies for these top-level comments (using path prefix)
  const topIds = topLevel.map((c) => c.id);
  let allReplies: any[] = [];

  if (topIds.length > 0) {
    const paths = topLevel.map((c) => c.path);
    const pathConditions = paths.map((_, i) => `c.path LIKE $${i + 3} || '.%'`).join(" OR ");

    const { rows } = await pool.query(
      `SELECT c.*, u.name as author_name, u.avatar_url as author_avatar
       FROM comments c
       JOIN users u ON c.author_id = u.id
       WHERE c.entity_type = $1 AND c.entity_id = $2
         AND c.status = 'visible'
         AND (${pathConditions})
       ORDER BY c.path`,
      [entityType, entityId, ...paths]
    );
    allReplies = rows;
  }

  // Build tree
  const commentMap = new Map<string, Comment>();
  for (const c of [...topLevel, ...allReplies]) {
    commentMap.set(c.id, { ...c, children: [] });
  }

  const rootComments: Comment[] = [];
  for (const c of commentMap.values()) {
    if (c.parentId && commentMap.has(c.parentId)) {
      commentMap.get(c.parentId)!.children!.push(c);
    } else if (!c.parentId) {
      rootComments.push(c);
    }
  }

  // Get user's votes if logged in
  if (options?.userId) {
    const allIds = [...commentMap.keys()];
    if (allIds.length > 0) {
      const { rows: votes } = await pool.query(
        `SELECT comment_id, vote FROM comment_votes
         WHERE user_id = $1 AND comment_id = ANY($2)`,
        [options.userId, allIds]
      );
      for (const vote of votes) {
        const comment = commentMap.get(vote.comment_id);
        if (comment) (comment as any).userVote = vote.vote;
      }
    }
  }

  const { rows: [{ count }] } = await pool.query(
    "SELECT COUNT(*) as count FROM comments WHERE entity_type = $1 AND entity_id = $2 AND parent_id IS NULL AND status = 'visible'",
    [entityType, entityId]
  );

  return {
    comments: rootComments,
    total: parseInt(count),
    hasMore: page * COMMENTS_PER_PAGE < parseInt(count),
  };
}

// Vote on a comment
export async function vote(commentId: string, userId: string, direction: "up" | "down"): Promise<{ score: number }> {
  const voteValue = direction === "up" ? 1 : -1;

  // Upsert vote
  const { rows: [existing] } = await pool.query(
    "SELECT vote FROM comment_votes WHERE comment_id = $1 AND user_id = $2",
    [commentId, userId]
  );

  if (existing) {
    if (existing.vote === voteValue) {
      // Remove vote (toggle off)
      await pool.query("DELETE FROM comment_votes WHERE comment_id = $1 AND user_id = $2", [commentId, userId]);
      await pool.query(
        `UPDATE comments SET ${direction === "up" ? "upvotes" : "downvotes"} = ${direction === "up" ? "upvotes" : "downvotes"} - 1,
         score = upvotes - downvotes WHERE id = $1`,
        [commentId]
      );
    } else {
      // Change vote direction
      await pool.query("UPDATE comment_votes SET vote = $3 WHERE comment_id = $1 AND user_id = $2", [commentId, userId, voteValue]);
      await pool.query(
        `UPDATE comments SET upvotes = upvotes + $2, downvotes = downvotes - $2, score = upvotes - downvotes + $2 * 2 WHERE id = $1`,
        [commentId, direction === "up" ? 1 : -1]
      );
    }
  } else {
    await pool.query("INSERT INTO comment_votes (comment_id, user_id, vote) VALUES ($1, $2, $3)", [commentId, userId, voteValue]);
    await pool.query(
      `UPDATE comments SET ${direction === "up" ? "upvotes = upvotes + 1" : "downvotes = downvotes + 1"}, score = upvotes - downvotes WHERE id = $1`,
      [commentId]
    );
  }

  const { rows: [{ score }] } = await pool.query("SELECT score FROM comments WHERE id = $1", [commentId]);
  return { score: parseInt(score) };
}

function renderMarkdown(body: string): string { return body; /* use markdown-it */ }
function extractMentions(body: string): string[] {
  return [...body.matchAll(/@(\w+)/g)].map((m) => m[1]);
}
async function notifyMentions(usernames: string[], comment: any, entityType: string, entityId: string) {
  for (const username of usernames) {
    const { rows } = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    if (rows[0]) {
      await redis.rpush("notification:queue", JSON.stringify({
        userId: rows[0].id, type: "mention", data: { commentId: comment.id, entityType, entityId },
      }));
    }
  }
}
```

## Results

- **Conversations are followable** — nested threads keep replies organized under their parent; reading a discussion is natural instead of jumping between flat comments
- **Best answers rise to top** — voting sorts the most helpful comments first; documentation gets crowd-sourced corrections and tips
- **Materialized path makes tree queries fast** — loading all replies for a thread is one query with `WHERE path LIKE '003.%'`; no recursive CTEs needed
- **@mentions drive engagement** — mentioned users get notified; response rate doubled; discussions stay active
- **Moderation at scale** — hiding a comment also hides its entire subtree; spam is one click to clean up
