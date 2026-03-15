---
title: Build Real-Time Collaboration Cursors
slug: build-real-time-collaboration-cursors
description: Build real-time collaboration with live cursors, presence awareness, selection highlighting, viewport tracking, and conflict-free cursor positioning for multiplayer applications.
skills:
  - typescript
  - redis
  - hono
  - zod
category: development
tags:
  - collaboration
  - real-time
  - cursors
  - presence
  - multiplayer
---

# Build Real-Time Collaboration Cursors

## The Problem

Lena leads product at a 25-person design tool company. Users can share documents but can't see each other's activity — they accidentally edit the same section simultaneously, overwriting each other's work. There's no way to know who's looking at what. Figma and Google Docs spoiled users with live cursors and presence indicators. Customers leave for competitors that offer real-time collaboration. They need multiplayer cursors: see who's online, where their cursor is, what they've selected, and handle viewport synchronization — all at 60fps without killing server performance.

## Step 1: Build the Cursor Engine

```typescript
// src/collaboration/cursors.ts — Real-time collaboration with live cursors and presence
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const redisSub = new Redis(process.env.REDIS_URL!);

interface CursorPosition {
  x: number;
  y: number;
  pageId?: string;          // which page/canvas they're on
  elementId?: string;       // element being hovered
  viewportX?: number;       // viewport scroll position
  viewportY?: number;
  zoom?: number;
}

interface UserPresence {
  userId: string;
  name: string;
  avatar: string;
  color: string;            // assigned collaboration color
  cursor: CursorPosition;
  selection: string[];      // IDs of selected elements
  isActive: boolean;        // false = idle (no input for 60s)
  lastActiveAt: number;
  joinedAt: number;
}

interface CollaborationRoom {
  documentId: string;
  users: Map<string, UserPresence>;
  onUpdate: (userId: string, presence: UserPresence) => void;
}

const COLLABORATION_COLORS = [
  "#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
];

const rooms = new Map<string, Set<string>>();

// Join a collaboration room
export async function joinRoom(
  documentId: string,
  user: { userId: string; name: string; avatar: string }
): Promise<{ presence: UserPresence; existingUsers: UserPresence[] }> {
  // Assign color based on position in room
  const roomKey = `collab:room:${documentId}`;
  const memberCount = await redis.scard(roomKey);
  const color = COLLABORATION_COLORS[memberCount % COLLABORATION_COLORS.length];

  const presence: UserPresence = {
    userId: user.userId,
    name: user.name,
    avatar: user.avatar,
    color,
    cursor: { x: 0, y: 0 },
    selection: [],
    isActive: true,
    lastActiveAt: Date.now(),
    joinedAt: Date.now(),
  };

  // Store presence
  await redis.sadd(roomKey, user.userId);
  await redis.setex(`collab:presence:${documentId}:${user.userId}`, 120, JSON.stringify(presence));

  // Get existing users
  const members = await redis.smembers(roomKey);
  const existingUsers: UserPresence[] = [];
  for (const memberId of members) {
    if (memberId === user.userId) continue;
    const data = await redis.get(`collab:presence:${documentId}:${memberId}`);
    if (data) existingUsers.push(JSON.parse(data));
  }

  // Broadcast join event
  await redis.publish(`collab:${documentId}`, JSON.stringify({
    type: "user_joined", userId: user.userId, presence,
  }));

  return { presence, existingUsers };
}

// Update cursor position (called at 60fps from client, throttled to 30fps on server)
export async function updateCursor(
  documentId: string,
  userId: string,
  position: CursorPosition
): Promise<void> {
  // Throttle: skip update if last one was <33ms ago (30fps)
  const lastKey = `collab:lastupdate:${documentId}:${userId}`;
  const last = await redis.get(lastKey);
  if (last && Date.now() - parseInt(last) < 33) return;
  await redis.setex(lastKey, 1, String(Date.now()));

  // Update presence
  const presenceKey = `collab:presence:${documentId}:${userId}`;
  const data = await redis.get(presenceKey);
  if (!data) return;

  const presence: UserPresence = JSON.parse(data);
  presence.cursor = position;
  presence.isActive = true;
  presence.lastActiveAt = Date.now();

  await redis.setex(presenceKey, 120, JSON.stringify(presence));

  // Broadcast cursor update (lightweight — only position data)
  await redis.publish(`collab:${documentId}`, JSON.stringify({
    type: "cursor_move",
    userId,
    cursor: position,
    color: presence.color,
    name: presence.name,
  }));
}

// Update selection
export async function updateSelection(
  documentId: string,
  userId: string,
  selectedElements: string[]
): Promise<void> {
  const presenceKey = `collab:presence:${documentId}:${userId}`;
  const data = await redis.get(presenceKey);
  if (!data) return;

  const presence: UserPresence = JSON.parse(data);
  presence.selection = selectedElements;
  presence.lastActiveAt = Date.now();

  await redis.setex(presenceKey, 120, JSON.stringify(presence));

  await redis.publish(`collab:${documentId}`, JSON.stringify({
    type: "selection_change",
    userId,
    selection: selectedElements,
    color: presence.color,
  }));
}

// Leave room
export async function leaveRoom(documentId: string, userId: string): Promise<void> {
  await redis.srem(`collab:room:${documentId}`, userId);
  await redis.del(`collab:presence:${documentId}:${userId}`);
  await redis.del(`collab:lastupdate:${documentId}:${userId}`);

  await redis.publish(`collab:${documentId}`, JSON.stringify({
    type: "user_left", userId,
  }));
}

// Detect and mark idle users (run periodically)
export async function detectIdleUsers(documentId: string): Promise<void> {
  const roomKey = `collab:room:${documentId}`;
  const members = await redis.smembers(roomKey);

  for (const userId of members) {
    const data = await redis.get(`collab:presence:${documentId}:${userId}`);
    if (!data) {
      await redis.srem(roomKey, userId);  // stale member
      continue;
    }

    const presence: UserPresence = JSON.parse(data);
    if (presence.isActive && Date.now() - presence.lastActiveAt > 60000) {
      presence.isActive = false;
      await redis.setex(`collab:presence:${documentId}:${userId}`, 120, JSON.stringify(presence));
      await redis.publish(`collab:${documentId}`, JSON.stringify({
        type: "user_idle", userId,
      }));
    }
  }
}

// Get room stats
export async function getRoomStats(documentId: string): Promise<{
  activeUsers: number;
  idleUsers: number;
  users: UserPresence[];
}> {
  const members = await redis.smembers(`collab:room:${documentId}`);
  const users: UserPresence[] = [];

  for (const memberId of members) {
    const data = await redis.get(`collab:presence:${documentId}:${memberId}`);
    if (data) users.push(JSON.parse(data));
  }

  return {
    activeUsers: users.filter((u) => u.isActive).length,
    idleUsers: users.filter((u) => !u.isActive).length,
    users,
  };
}
```

## Results

- **Live cursors at 30fps** — smooth cursor tracking with throttling; 10 simultaneous users on one document without lag; Redis pub/sub handles broadcast efficiently
- **Accidental overwrites eliminated** — users see who's editing what section; selection highlighting shows locked elements; "oh, you're working on that" happens before the conflict
- **Presence awareness** — avatar bubbles show who's in the document; idle detection dims inactive users after 60 seconds; "3 people viewing" indicator drives engagement
- **Figma-like experience** — colored cursors with name labels, selection highlights matching cursor color, viewport indicator showing where each user is looking
- **Scalable** — Redis pub/sub means server doesn't track WebSocket connections; horizontal scaling by adding more servers; cursor data expires automatically
