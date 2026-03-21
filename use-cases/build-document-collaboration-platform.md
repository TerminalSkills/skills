---
title: "Build a Real-Time Document Collaboration Platform"
description: "Build a Google Docs alternative with rich text editing, real-time multiplayer sync, inline comments, and version history — with better privacy than Notion."
skills: [tiptap-editor, liveblocks, prisma]
difficulty: advanced
time_estimate: "20 hours"
tags: [collaboration, real-time, editor, documents, yjs, websocket, prisma]
---

# Build a Real-Time Document Collaboration Platform

## The Problem

Your team's docs live in Notion, which stores everything on their servers. You want a collaborative editor that lives on your infrastructure — with real-time sync, comments, and version history — without giving up the Google Docs experience.

## What You'll Build

A self-hosted document platform with:
- Rich text editor with block-based structure (Tiptap)
- Real-time multi-user collaboration (Liveblocks + Yjs CRDT)
- Inline + threaded comments with resolve workflow
- Version history with named snapshots, diff view, and restore
- Permission levels: viewer / commenter / editor per user or team

## Persona

**Maya, Engineering Manager** — her team uses Notion but legal wants documents on internal infrastructure. She needs something engineers will actually use, not a SharePoint upgrade.

---

## Architecture

```
┌─────────────────────────────────────────┐
│        Next.js Frontend                  │
│  Tiptap Editor + Liveblocks Room        │
└──────────────┬──────────────────────────┘
               │ WebSocket (Liveblocks)
┌──────────────▼──────────────────────────┐
│         Liveblocks Cloud / Self-hosted   │
│  Yjs CRDT sync | Presence | Cursors     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│     Prisma + PostgreSQL                  │
│  Documents | Versions | Comments | Perms │
└─────────────────────────────────────────┘
```

---

## Step 1: Database Schema

```prisma
// schema.prisma
model Document {
  id          String       @id @default(cuid())
  title       String
  content     Json?        // Tiptap JSON snapshot
  ownerId     String
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  versions    Version[]
  comments    Comment[]
  permissions Permission[]
}

model Version {
  id         String   @id @default(cuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id])
  name       String?
  content    Json
  createdBy  String
  createdAt  DateTime @default(now())
}

model Comment {
  id         String    @id @default(cuid())
  documentId String
  document   Document  @relation(fields: [documentId], references: [id])
  parentId   String?
  content    String
  authorId   String
  resolved   Boolean   @default(false)
  from       Int?      // text selection start
  to         Int?      // text selection end
  createdAt  DateTime  @default(now())
  replies    Comment[] @relation("CommentReplies")
  parent     Comment?  @relation("CommentReplies", fields: [parentId], references: [id])
}

model Permission {
  id         String   @id @default(cuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id])
  userId     String
  role       String   // viewer | commenter | editor

  @@unique([documentId, userId])
}
```

---

## Step 2: Tiptap Editor with Liveblocks

```typescript
// components/CollaborativeEditor.tsx
"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { useLiveblocksExtension } from "@liveblocks/react-tiptap";
import { useMyPresence, useOthers } from "@liveblocks/react";

interface Props {
  documentId: string;
  userColor: string;
  userName: string;
  readOnly?: boolean;
}

export function CollaborativeEditor({ documentId, userColor, userName, readOnly }: Props) {
  const liveblocks = useLiveblocksExtension();
  const [, updatePresence] = useMyPresence();
  const others = useOthers();

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ history: false }), // Yjs handles undo
      liveblocks,
    ],
    onSelectionUpdate({ editor }) {
      const { from, to } = editor.state.selection;
      updatePresence({ cursor: { from, to } });
    },
  });

  return (
    <div className="editor-wrapper">
      {/* Presence avatars */}
      <div className="presence-bar">
        {others.map(({ connectionId, presence, info }) => (
          <div
            key={connectionId}
            className="avatar"
            style={{ borderColor: info?.color }}
            title={info?.name}
          />
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
```

---

## Step 3: Liveblocks Room Setup

```typescript
// app/docs/[id]/page.tsx
import { RoomProvider } from "@/liveblocks.config";
import { CollaborativeEditor } from "@/components/CollaborativeEditor";
import { getDocumentWithPermission } from "@/lib/documents";

export default async function DocumentPage({ params }: { params: { id: string } }) {
  const { document, role } = await getDocumentWithPermission(params.id);

  return (
    <RoomProvider
      id={`doc-${params.id}`}
      initialPresence={{ cursor: null }}
    >
      <CollaborativeEditor
        documentId={params.id}
        userName="Maya Chen"
        userColor="#6366f1"
        readOnly={role === "viewer"}
      />
    </RoomProvider>
  );
}
```

---

## Step 4: Version Snapshots

```typescript
// lib/versions.ts
import { prisma } from "./prisma";
import { Editor } from "@tiptap/react";

export async function saveVersion(
  editor: Editor,
  documentId: string,
  userId: string,
  name?: string
) {
  const content = editor.getJSON();
  return prisma.version.create({
    data: { documentId, content, createdBy: userId, name },
  });
}

export async function restoreVersion(editor: Editor, versionId: string) {
  const version = await prisma.version.findUniqueOrThrow({
    where: { id: versionId },
  });
  editor.commands.setContent(version.content as any);
}
```

---

## Step 5: Inline Comments API

```typescript
// app/api/comments/route.ts
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { documentId, content, authorId, from, to, parentId } = await req.json();

  const comment = await prisma.comment.create({
    data: { documentId, content, authorId, from, to, parentId },
  });

  return NextResponse.json(comment);
}

export async function PATCH(req: NextRequest) {
  const { id, resolved } = await req.json();
  const comment = await prisma.comment.update({
    where: { id },
    data: { resolved },
  });
  return NextResponse.json(comment);
}
```

---

## What's Next

- Export to PDF / Markdown / Docx
- AI writing assistant (Tiptap AI extension + Anthropic)
- Full-text search with pgvector or Meilisearch
- Audit log for compliance (who changed what, when)
