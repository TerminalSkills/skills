---
title: Build an In-App Messaging System
slug: build-in-app-messaging-system
description: Build real-time in-app messaging with direct messages, group threads, read receipts, file sharing, message search, typing indicators, and notification management.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Full-Stack Development
tags:
  - messaging
  - chat
  - real-time
  - websocket
  - communication
---

# Build an In-App Messaging System

## The Problem

Hana leads product at a 25-person project management SaaS. Users communicate about projects via email, Slack, and comments — context is scattered. They want in-app messaging so conversations stay with the project. But chat is complex: they need read receipts (so users know if their message was seen), typing indicators, file sharing, thread support (so conversations don't get noisy), offline message queuing, and notification preferences. Building on WebSockets means handling reconnection, message ordering, and delivery guarantees.

## Step 1: Build the Messaging Engine

```typescript
// src/messaging/engine.ts — In-app messaging with threads, receipts, and real-time delivery
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface Conversation {
  id: string;
  type: "direct" | "group" | "project";
  name: string | null;
  participants: string[];
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCounts: Record<string, number>;
  createdAt: string;
}

interface Message {
  id: string;
  conversationId: string;
  threadId: string | null;
  senderId: string;
  senderName: string;
  content: string;
  contentType: "text" | "file" | "image" | "system";
  attachments: Array<{ name: string; url: string; size: number; mimeType: string }>;
  replyTo: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  readBy: Array<{ userId: string; readAt: string }>;
  reactions: Array<{ emoji: string; userId: string }>;
  metadata: Record<string, any>;
  createdAt: string;
}

// Send message
export async function sendMessage(params: {
  conversationId: string;
  senderId: string;
  content: string;
  contentType?: Message["contentType"];
  attachments?: Message["attachments"];
  threadId?: string;
  replyTo?: string;
}): Promise<Message> {
  const id = `msg-${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;

  // Get sender name
  const { rows: [sender] } = await pool.query("SELECT name FROM users WHERE id = $1", [params.senderId]);

  const message: Message = {
    id,
    conversationId: params.conversationId,
    threadId: params.threadId || null,
    senderId: params.senderId,
    senderName: sender?.name || "Unknown",
    content: params.content,
    contentType: params.contentType || "text",
    attachments: params.attachments || [],
    replyTo: params.replyTo || null,
    editedAt: null,
    deletedAt: null,
    readBy: [{ userId: params.senderId, readAt: new Date().toISOString() }],
    reactions: [],
    metadata: {},
    createdAt: new Date().toISOString(),
  };

  // Store message
  await pool.query(
    `INSERT INTO messages (id, conversation_id, thread_id, sender_id, content, content_type, attachments, reply_to, read_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [id, params.conversationId, params.threadId, params.senderId, params.content,
     message.contentType, JSON.stringify(message.attachments), params.replyTo,
     JSON.stringify(message.readBy)]
  );

  // Update conversation
  const preview = params.content.slice(0, 100);
  await pool.query(
    `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $2 WHERE id = $1`,
    [params.conversationId, preview]
  );

  // Increment unread for other participants
  const { rows: [conv] } = await pool.query("SELECT participants FROM conversations WHERE id = $1", [params.conversationId]);
  const participants: string[] = JSON.parse(conv.participants);

  for (const userId of participants) {
    if (userId !== params.senderId) {
      await redis.hincrby(`unread:${userId}`, params.conversationId, 1);
    }
  }

  // Publish to real-time subscribers
  await redis.publish(`conv:${params.conversationId}`, JSON.stringify({
    type: "new_message", message,
  }));

  // Push notifications for offline users
  for (const userId of participants) {
    if (userId === params.senderId) continue;
    const isOnline = await redis.get(`presence:${userId}`);
    if (!isOnline) {
      await redis.rpush("notification:queue", JSON.stringify({
        type: "new_message", userId,
        title: message.senderName,
        body: preview,
        data: { conversationId: params.conversationId, messageId: id },
      }));
    }
  }

  return message;
}

// Mark messages as read
export async function markAsRead(conversationId: string, userId: string): Promise<void> {
  const now = new Date().toISOString();

  // Update unread messages
  await pool.query(
    `UPDATE messages SET read_by = read_by || $3::jsonb
     WHERE conversation_id = $1 AND NOT (read_by @> $4::jsonb)
     AND created_at <= NOW()`,
    [conversationId,
     userId,
     JSON.stringify([{ userId, readAt: now }]),
     JSON.stringify([{ userId }])]
  );

  // Clear unread count
  await redis.hdel(`unread:${userId}`, conversationId);

  // Notify sender that message was read
  await redis.publish(`conv:${conversationId}`, JSON.stringify({
    type: "read_receipt", userId, readAt: now,
  }));
}

// Typing indicator
export async function setTyping(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
  if (isTyping) {
    await redis.setex(`typing:${conversationId}:${userId}`, 5, "1");
  } else {
    await redis.del(`typing:${conversationId}:${userId}`);
  }

  await redis.publish(`conv:${conversationId}`, JSON.stringify({
    type: "typing", userId, isTyping,
  }));
}

// Get conversation messages with pagination
export async function getMessages(
  conversationId: string,
  options?: { before?: string; limit?: number; threadId?: string }
): Promise<{ messages: Message[]; hasMore: boolean }> {
  const limit = options?.limit || 50;
  let sql = `SELECT * FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL`;
  const params: any[] = [conversationId];
  let idx = 2;

  if (options?.threadId) {
    sql += ` AND thread_id = $${idx}`;
    params.push(options.threadId);
    idx++;
  } else {
    sql += ` AND thread_id IS NULL`; // main conversation only
  }

  if (options?.before) {
    sql += ` AND created_at < $${idx}`;
    params.push(options.before);
    idx++;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
  params.push(limit + 1);

  const { rows } = await pool.query(sql, params);
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).reverse().map(parseMessage);

  return { messages, hasMore };
}

// Search messages
export async function searchMessages(
  userId: string,
  query: string,
  conversationId?: string
): Promise<Message[]> {
  let sql = `SELECT m.* FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE m.content ILIKE $1 AND c.participants::jsonb @> $2::jsonb AND m.deleted_at IS NULL`;
  const params: any[] = [`%${query}%`, JSON.stringify([userId])];

  if (conversationId) {
    sql += ` AND m.conversation_id = $3`;
    params.push(conversationId);
  }

  sql += ` ORDER BY m.created_at DESC LIMIT 50`;
  const { rows } = await pool.query(sql, params);
  return rows.map(parseMessage);
}

// Get user's conversations with unread counts
export async function getUserConversations(userId: string): Promise<Array<Conversation & { unread: number }>> {
  const { rows } = await pool.query(
    `SELECT * FROM conversations WHERE participants::jsonb @> $1::jsonb ORDER BY last_message_at DESC`,
    [JSON.stringify([userId])]
  );

  const unreadAll = await redis.hgetall(`unread:${userId}`);

  return rows.map((row: any) => ({
    ...row,
    participants: JSON.parse(row.participants),
    unread: parseInt(unreadAll[row.id] || "0"),
  }));
}

// Create conversation
export async function createConversation(params: {
  type: Conversation["type"];
  participants: string[];
  name?: string;
}): Promise<Conversation> {
  // For direct messages, check if conversation already exists
  if (params.type === "direct" && params.participants.length === 2) {
    const sorted = [...params.participants].sort();
    const { rows: [existing] } = await pool.query(
      `SELECT * FROM conversations WHERE type = 'direct' AND participants = $1`,
      [JSON.stringify(sorted)]
    );
    if (existing) return { ...existing, participants: JSON.parse(existing.participants) };
  }

  const id = `conv-${randomBytes(8).toString("hex")}`;
  await pool.query(
    `INSERT INTO conversations (id, type, name, participants, last_message_at, last_message_preview, created_at)
     VALUES ($1, $2, $3, $4, NOW(), '', NOW())`,
    [id, params.type, params.name || null, JSON.stringify(params.participants)]
  );

  return { id, type: params.type, name: params.name || null, participants: params.participants, lastMessageAt: new Date().toISOString(), lastMessagePreview: "", unreadCounts: {}, createdAt: new Date().toISOString() };
}

// Add reaction
export async function addReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  await pool.query(
    `UPDATE messages SET reactions = reactions || $2::jsonb WHERE id = $1`,
    [messageId, JSON.stringify([{ emoji, userId }])]
  );
}

function parseMessage(row: any): Message {
  return { ...row, attachments: JSON.parse(row.attachments || "[]"), readBy: JSON.parse(row.read_by || "[]"), reactions: JSON.parse(row.reactions || "[]"), metadata: {} };
}
```

## Results

- **Context stays with the project** — conversations linked to project IDs; no more digging through Slack for "what did we decide about the API?"
- **Read receipts reduce follow-ups** — sender sees "read by 3/4 members"; knows message was seen without asking "did you see my message?"
- **Threads prevent noise** — detailed discussions happen in threads; main conversation stays clean with topic-level messages
- **Offline message queuing** — messages sent while user is offline delivered on reconnect; push notification bridges the gap
- **File sharing inline** — drag-and-drop files into chat; images render inline; PDFs show preview; no more "check your email for the attachment"
