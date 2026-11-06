---
title: "Build a Real-Time Document Collaboration Platform"
description: "Build a self-hosted Google Docs alternative with a Tiptap editor, Yjs real-time sync on your own server, inline comments that stay attached to the text, and version history."
skills: [yjs, prisma]
difficulty: advanced
time_estimate: "20 hours"
tags: [collaboration, real-time, editor, documents, yjs, websocket, prisma]
---

# Build a Real-Time Document Collaboration Platform

## The Problem

Maya, an engineering manager, has a team whose docs live in Notion, but legal wants documents on internal infrastructure. She needs a collaborative editor on your own servers, with real-time sync, comments and version history, that engineers will actually use.

## What You'll Build

A Tiptap 3 editor with live carets, Yjs sync through a WebSocket server you run (persisted in PostgreSQL via Prisma), inline comments anchored to the text, named version snapshots with restore, and two roles per document: editor (live editing) and viewer (read-only view of the last saved state).

Hosted real-time platforms such as Liveblocks run the servers for you, which puts your documents on someone else's infrastructure, the thing legal asked you to avoid. Yjs plus `@y/websocket-server` keeps the data path on your side.

## Architecture

Browser (Tiptap + Collaboration + CollaborationCaret) connects over `wss://collab.example.com/<documentId>?token=...` to a Node collab server (`@y/websocket-server` + auth check + Prisma persistence), which stores Document, Version, Comment and Permission rows in PostgreSQL.

## Step 1: Database Schema

The Yjs state is the source of truth while people edit. The server also stores a plain Tiptap JSON copy, used for viewers and for version snapshots.

```prisma
// prisma/schema.prisma (generator and datasource as in the prisma skill)
model Document {
  id          String       @id @default(cuid())
  title       String
  ydoc        Bytes?       // encoded Yjs state
  content     Json?        // Tiptap JSON copy of the same state
  ownerId     String
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  versions    Version[]
  comments    Comment[]
  permissions Permission[]
}
model Version {
  id         String   @id @default(cuid())
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  documentId String
  name       String?
  content    Json
  createdBy  String
  createdAt  DateTime @default(now())
}
model Comment {
  id         String    @id @default(cuid())   // also the commentId stored on the text mark
  document   Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  documentId String
  parentId   String?                          // set on replies
  body       String
  authorId   String
  resolved   Boolean   @default(false)
  createdAt  DateTime  @default(now())
}
model Permission {
  id         String   @id @default(cuid())
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  documentId String
  userId     String
  role       String   // "viewer" | "editor"
  @@unique([documentId, userId])
}
```

Comments do not store character offsets. Offsets drift as soon as someone types above the commented text. Instead the comment id is stored as a mark on the text itself (Step 4), so the anchor moves with the words and syncs like any other edit.

## Step 2: The Collaboration Server

```bash
npm install yjs ws @y/websocket-server@0.1.1 @tiptap/y-tiptap
```

Stay on `@y/websocket-server` 0.1.1 while the app uses Yjs 13; newer releases need the Yjs 14 pre-release (see the yjs skill).

```typescript
// server/collab.ts
import http from "node:http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { setupWSConnection, setPersistence } from "@y/websocket-server/utils";
import { prisma } from "./db";
import { getUserFromToken } from "./auth"; // your session or JWT verification

async function save(id: string, ydoc: Y.Doc) {
  await prisma.document.update({
    where: { id },
    data: {
      ydoc: Buffer.from(Y.encodeStateAsUpdate(ydoc)),
      // "default" is the field name the Tiptap Collaboration extension uses
      content: yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment("default")) as object,
    },
  });
}

setPersistence({
  provider: null,
  bindState: async (id, ydoc) => {
    const row = await prisma.document.findUnique({ where: { id }, select: { ydoc: true } });
    if (row?.ydoc) Y.applyUpdate(ydoc, row.ydoc);
    let timer: NodeJS.Timeout | undefined;
    ydoc.on("update", () => {            // debounce: at most one write per 2 s of typing
      clearTimeout(timer);
      timer = setTimeout(() => save(id, ydoc).catch(console.error), 2000);
    });
  },
  writeState: (id, ydoc) => save(id, ydoc),   // last client left
});

const server = http.createServer((_req, res) => { res.writeHead(200); res.end("ok"); });
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, async (ws) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const documentId = url.pathname.slice(1);
      const user = await getUserFromToken(url.searchParams.get("token"));
      const perm = user && await prisma.permission.findUnique({
        where: { documentId_userId: { documentId, userId: user.id } },
      });
      // Only editors get a live connection: a Yjs socket can write to the document
      if (perm?.role !== "editor") return ws.close(4403, "forbidden");
      setupWSConnection(ws, req, { docName: documentId });
    } catch {
      ws.close(4401, "unauthorized");
    }
  });
});
server.listen(Number(process.env.PORT ?? 1234), "127.0.0.1"); // put a wss:// reverse proxy in front
```

Close codes 4400 to 4499 tell y-websocket 3.1 not to reconnect, so expired sessions stop retrying. The server is one process with open documents in memory; for several instances, the y-websocket README lists Hocuspocus and y-redis as compatible backends.

## Step 3: The Editor

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-collaboration @tiptap/extension-collaboration-caret y-websocket
```

Tiptap 3: `undoRedo: false` replaces the v2 `history: false`, and `CollaborationCaret` replaces `CollaborationCursor`.

```tsx
// components/CollaborativeEditor.tsx
"use client";
import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { CommentMark } from "./comment-mark";

type Collab = { doc: Y.Doc; provider: WebsocketProvider };
interface Props { documentId: string; token: string; userName: string; userColor: string }

export function CollaborativeEditor({ documentId, token, userName, userColor }: Props) {
  const [collab, setCollab] = useState<Collab | null>(null);
  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(process.env.NEXT_PUBLIC_COLLAB_URL!, documentId, doc,
      { params: { token } }); // sent as ?token=... on every (re)connect
    setCollab({ doc, provider });
    return () => { provider.destroy(); doc.destroy(); };
  }, [documentId, token]);
  if (!collab) return null;
  return <Editor collab={collab} user={{ name: userName, color: userColor }} />;
}

function Editor({ collab, user }: { collab: Collab; user: { name: string; color: string } }) {
  const editor = useEditor({
    immediatelyRender: false, // Next.js: avoid a server/client markup mismatch
    extensions: [
      StarterKit.configure({ undoRedo: false }), // Yjs provides undo/redo
      CommentMark,
      Collaboration.configure({ document: collab.doc }),
      CollaborationCaret.configure({ provider: collab.provider, user }),
    ],
  });
  return <EditorContent editor={editor} />;
}
```

Viewers do not connect. Their page renders the JSON copy that the server saved:

```tsx
// components/ReadOnlyDoc.tsx
"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CommentMark } from "./comment-mark";

export function ReadOnlyDoc({ content }: { content: object | null }) {
  const editor = useEditor({ editable: false, immediatelyRender: false,
    extensions: [StarterKit, CommentMark], content: content ?? undefined });
  return <EditorContent editor={editor} />;
}
```

## Step 4: Inline Comments That Follow the Text

```typescript
// components/comment-mark.ts
import { Mark, mergeAttributes } from "@tiptap/core";
export const CommentMark = Mark.create({
  name: "comment",
  inclusive: false, // typing at the edge of a comment does not extend it
  addAttributes() {
    return { commentId: { default: null,
      parseHTML: (el) => el.getAttribute("data-comment-id"),
      renderHTML: (attrs) => ({ "data-comment-id": attrs.commentId }) } };
  },
  parseHTML() { return [{ tag: "span[data-comment-id]" }]; },
  renderHTML({ HTMLAttributes }) { return ["span", mergeAttributes(HTMLAttributes), 0]; },
});
```

Both API routes share one check. The user comes from the session, never from the request body:

```typescript
// lib/require-editor.ts
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
export async function requireEditor(documentId: string) {
  const session = await getSession();
  if (!session) return { error: new Response("Unauthorized", { status: 401 }) };
  const perm = await prisma.permission.findUnique({
    where: { documentId_userId: { documentId, userId: session.user.id } },
  });
  if (perm?.role !== "editor") return { error: new Response("Forbidden", { status: 403 }) };
  return { userId: session.user.id };
}
```

```typescript
// app/api/documents/[id]/comments/route.ts
import { prisma } from "@/lib/db";
import { requireEditor } from "@/lib/require-editor";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  const auth = await requireEditor(documentId);
  if (auth.error) return auth.error;
  const { body, parentId } = (await req.json()) as { body: string; parentId?: string };
  const comment = await prisma.comment.create({
    data: { documentId, body: body.slice(0, 5000), authorId: auth.userId, parentId },
  });
  return Response.json({ id: comment.id });
}
```

The editor then anchors the selection with `editor.chain().focus().setMark("comment", { commentId: comment.id }).run()`, and the mark syncs to everyone. Resolving is a `PATCH` that sets `resolved` on the row, with the same `requireEditor` check. Adding a comment writes a mark into the document, so in this design only editors comment.

## Step 5: Version Snapshots

Snapshots are taken on the server from the saved copy, so a client cannot submit forged content:

```typescript
// app/api/documents/[id]/versions/route.ts
import { prisma } from "@/lib/db";
import { requireEditor } from "@/lib/require-editor";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  const auth = await requireEditor(documentId);
  if (auth.error) return auth.error;
  const { name } = (await req.json()) as { name?: string };
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, select: { content: true } });
  const version = await prisma.version.create({ data: { documentId, name, content: doc.content ?? {}, createdBy: auth.userId } });
  return Response.json({ id: version.id });
}
```

The copy is written at most two seconds after the last keystroke. Restoring in the editor replaces the current content with the snapshot as an ordinary edit, which every collaborator receives and which can be undone: `editor.commands.setContent(version.content)`.

## Check It

In a headless test with two Tiptap editors bound to two Yjs documents, an insert before a marked range moved the comment mark with its text, and `setContent` on one editor replaced the text on the other. The server code, components and routes type-check against current packages and the Prisma schema validates; the live WebSocket server was not run, so test two browsers (carets and text sync both ways) and a viewer token (the server answers close code 4403).

## What's Next

Export from the stored JSON, offline editing with `y-indexeddb` (yjs skill), PostgreSQL full-text search over `Document.content`, and an audit log of opens, edits and restores.

## Related Skills

- [yjs](/skills/yjs): CRDT sync, the WebSocket server, and the Tiptap 3 collaboration setup used in Steps 2 and 3
- [prisma](/skills/prisma): the schema, client and migrations for documents, versions, comments and permissions
