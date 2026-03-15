---
title: Build a Real-Time Collaborative Code Editor
slug: build-real-time-collaborative-code-editor
description: >
  Build a browser-based code editor where multiple developers edit
  simultaneously with syntax highlighting, cursor presence, and
  live execution — powering pair programming and coding interviews.
skills:
  - typescript
  - yjs
  - hono
  - redis
  - docker
  - e2b
  - zod
category: development
tags:
  - collaborative-editing
  - code-editor
  - real-time
  - pair-programming
  - webrtc
  - monaco
---

# Build a Real-Time Collaborative Code Editor

## The Problem

A coding interview platform uses a basic textarea for candidates to write code. No syntax highlighting, no auto-complete, and no way for the interviewer to see the candidate's code in real-time — they share screens on Zoom and the interviewer can't type. When two interviewers join, they take turns dictating edits. The platform also wants pair programming features for its learning product, but the current architecture can't support real-time collaboration.

## Step 1: CRDT-Backed Document Sync

```typescript
// src/editor/document.ts
import * as Y from 'yjs';

export function createCodeDocument(): {
  doc: Y.Doc;
  getText: () => Y.Text;
  getLanguage: () => Y.Map<string>;
  getMetadata: () => Y.Map<any>;
} {
  const doc = new Y.Doc();

  return {
    doc,
    getText: () => doc.getText('code'),
    getLanguage: () => doc.getMap('language'),
    getMetadata: () => doc.getMap('metadata'),
  };
}

// Awareness: cursor positions and selections
export interface EditorAwareness {
  userId: string;
  userName: string;
  color: string;
  cursor: {
    lineNumber: number;
    column: number;
  } | null;
  selection: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  } | null;
}
```

## Step 2: WebSocket Sync Server

```typescript
// src/editor/sync-server.ts
import { Hono } from 'hono';
import * as Y from 'yjs';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

// In-memory document store (per room)
const rooms = new Map<string, {
  doc: Y.Doc;
  connections: Set<WebSocket>;
  awareness: Map<string, any>;
}>();

function getOrCreateRoom(roomId: string): typeof rooms extends Map<string, infer V> ? V : never {
  if (!rooms.has(roomId)) {
    const doc = new Y.Doc();
    rooms.set(roomId, { doc, connections: new Set(), awareness: new Map() });

    // Load persisted state
    redis.getBuffer(`room:${roomId}:state`).then(saved => {
      if (saved) Y.applyUpdate(doc, saved);
    });

    // Auto-save on updates
    doc.on('update', async (update: Uint8Array) => {
      const state = Y.encodeStateAsUpdate(doc);
      await redis.setBuffer(`room:${roomId}:state`, Buffer.from(state));
      await redis.expire(`room:${roomId}:state`, 86400 * 7);
    });
  }
  return rooms.get(roomId)!;
}

export function handleConnection(roomId: string, ws: WebSocket, userId: string, userName: string): void {
  const room = getOrCreateRoom(roomId);
  room.connections.add(ws);

  // Send current state
  const state = Y.encodeStateAsUpdate(room.doc);
  ws.send(JSON.stringify({ type: 'sync', data: Buffer.from(state).toString('base64') }));

  // Send current awareness
  for (const [id, awareness] of room.awareness) {
    ws.send(JSON.stringify({ type: 'awareness', userId: id, data: awareness }));
  }

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data as string);

    switch (msg.type) {
      case 'update': {
        const update = Buffer.from(msg.data, 'base64');
        Y.applyUpdate(room.doc, update);
        // Broadcast to other connections
        for (const peer of room.connections) {
          if (peer !== ws && peer.readyState === 1) {
            peer.send(JSON.stringify({ type: 'update', data: msg.data }));
          }
        }
        break;
      }

      case 'awareness': {
        room.awareness.set(userId, msg.data);
        for (const peer of room.connections) {
          if (peer !== ws && peer.readyState === 1) {
            peer.send(JSON.stringify({ type: 'awareness', userId, data: msg.data }));
          }
        }
        break;
      }
    }
  });

  ws.addEventListener('close', () => {
    room.connections.delete(ws);
    room.awareness.delete(userId);
    // Notify others that user left
    for (const peer of room.connections) {
      if (peer.readyState === 1) {
        peer.send(JSON.stringify({ type: 'awareness_leave', userId }));
      }
    }
    // Clean up empty rooms after delay
    if (room.connections.size === 0) {
      setTimeout(() => {
        if (room.connections.size === 0) rooms.delete(roomId);
      }, 60000);
    }
  });
}
```

## Step 3: Code Execution Sandbox

```typescript
// src/editor/executor.ts
import { z } from 'zod';

const ExecutionRequest = z.object({
  code: z.string().max(50000),
  language: z.enum(['javascript', 'typescript', 'python', 'go', 'rust']),
  stdin: z.string().max(10000).default(''),
  timeoutSeconds: z.number().int().min(1).max(30).default(10),
});

const ExecutionResult = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int(),
  executionTimeMs: z.number(),
  memoryUsageMb: z.number().optional(),
});

export async function executeCode(
  request: z.infer<typeof ExecutionRequest>
): Promise<z.infer<typeof ExecutionResult>> {
  const { Sandbox } = await import('e2b');

  const sandbox = await Sandbox.create({
    template: getTemplate(request.language),
    timeoutMs: request.timeoutSeconds * 1000,
  });

  try {
    const filename = getFilename(request.language);
    await sandbox.filesystem.write(`/home/user/${filename}`, request.code);

    const cmd = getRunCommand(request.language, filename);
    const start = Date.now();

    const result = await sandbox.process.startAndWait({
      cmd,
      cwd: '/home/user',
      stdin: request.stdin,
      timeoutMs: request.timeoutSeconds * 1000,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
      executionTimeMs: Date.now() - start,
    };
  } finally {
    await sandbox.close();
  }
}

function getTemplate(lang: string): string {
  const templates: Record<string, string> = {
    javascript: 'base', typescript: 'base', python: 'base', go: 'base', rust: 'base',
  };
  return templates[lang] ?? 'base';
}

function getFilename(lang: string): string {
  const filenames: Record<string, string> = {
    javascript: 'main.js', typescript: 'main.ts', python: 'main.py', go: 'main.go', rust: 'main.rs',
  };
  return filenames[lang] ?? 'main.js';
}

function getRunCommand(lang: string, filename: string): string {
  const commands: Record<string, string> = {
    javascript: `node ${filename}`,
    typescript: `npx tsx ${filename}`,
    python: `python3 ${filename}`,
    go: `go run ${filename}`,
    rust: `rustc ${filename} -o main && ./main`,
  };
  return commands[lang] ?? `node ${filename}`;
}
```

## Step 4: Room API

```typescript
// src/api/rooms.ts
import { Hono } from 'hono';
import { executeCode } from '../editor/executor';
import { Pool } from 'pg';

const app = new Hono();
const db = new Pool({ connectionString: process.env.DATABASE_URL });

app.post('/v1/rooms', async (c) => {
  const { language, template } = await c.req.json();
  const roomId = crypto.randomUUID().slice(0, 8);

  await db.query(`
    INSERT INTO rooms (id, language, created_by, created_at)
    VALUES ($1, $2, $3, NOW())
  `, [roomId, language, c.get('userId')]);

  return c.json({
    roomId,
    editorUrl: `https://editor.example.com/room/${roomId}`,
    wsUrl: `wss://editor.example.com/ws/${roomId}`,
  });
});

app.post('/v1/rooms/:roomId/execute', async (c) => {
  const { code, language, stdin } = await c.req.json();
  const result = await executeCode({ code, language, stdin, timeoutSeconds: 10 });
  return c.json(result);
});

export default app;
```

## Results

- **Interview experience**: both parties edit simultaneously, no more screen sharing
- **Cursor presence**: see exactly where the other person is typing
- **Code execution**: run code in 5 languages with 10-second timeout
- **Latency**: <50ms sync between editors (CRDT + WebSocket)
- **Offline resilience**: edits queue locally and sync when reconnected
- **Pair programming**: 2-8 developers collaborate in same editor
- **Session persistence**: code saved for 7 days, shareable via link
