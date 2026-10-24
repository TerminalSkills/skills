---
title: Build a Rich Text Editor with Collaboration
slug: build-rich-text-editor-with-collaboration
description: Build a Notion-style rich text editor with slash commands, tables, code blocks, and real-time collaboration with live cursors using Tiptap 3, Yjs, and a Hocuspocus server that stores documents in PostgreSQL.
skills:
  - typescript
  - nextjs
  - postgresql
  - yjs
category: development
tags:
  - rich-text
  - editor
  - collaboration
  - tiptap
  - real-time
---

# Build a Rich Text Editor with Collaboration

## The Problem

Olga leads product at a 30-person knowledge base company. Their editor is a plain `<textarea>` with markdown preview. Users want WYSIWYG editing (bold, headers, code blocks, tables) without learning markdown. Two people editing the same document overwrite each other, and a browser crash mid-edit loses content. They need a rich editor with slash commands for power users, and real-time collaboration where editors see each other's cursors.

## The Solution

Use Tiptap 3 (a headless editor on ProseMirror) for the editing surface, Yjs for conflict-free merging of concurrent edits, and a Hocuspocus WebSocket server that persists the Yjs document state to PostgreSQL. Because every change is synced to the server as it happens, there is no separate "autosave" step: a crash loses nothing that reached the server, and a reconnecting client merges its offline edits instead of overwriting.

Tiptap 3 renamed several things the older tutorials still use: `history: false` is now `undoRedo: false`, `CollaborationCursor` is now `CollaborationCaret`, Link and Underline ship inside StarterKit, and task lists live in `@tiptap/extension-list`.

## Step-by-Step Walkthrough

### Step 1: Install the packages

```bash
npm install @tiptap/react @tiptap/pm @tiptap/core @tiptap/starter-kit @tiptap/extensions   @tiptap/extension-image @tiptap/extension-list @tiptap/extension-table   @tiptap/extension-code-block-lowlight @tiptap/extension-collaboration   @tiptap/extension-collaboration-caret @tiptap/suggestion   @hocuspocus/provider yjs lowlight
npm install @hocuspocus/server @hocuspocus/extension-database pg   # collaboration server
```

### Step 2: Add slash commands

Typing `/` opens a filtered command list. Tiptap's `Suggestion` utility handles the trigger, query, and keyboard events; you supply the popup (`render`) with whatever UI library you already use.

```typescript
// src/slash-command.ts
import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";

export interface SlashItem {
  title: string;
  run: (editor: Editor, range: Range) => void;
}

export const SLASH_ITEMS: SlashItem[] = [
  { title: "Heading 1", run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 1 }).run() },
  { title: "Heading 2", run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run() },
  { title: "Bullet list", run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: "Task list", run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: "Code block", run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { title: "Table", run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: "Divider", run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
];

// Typing "/" opens the menu. `render` is where you mount your popup (tippy, Radix, plain DOM).
export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        items: ({ query }) => SLASH_ITEMS.filter((i) => i.title.toLowerCase().includes(query.toLowerCase())),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => ({
          onStart: (props) => { /* show popup at props.clientRect?.(), list props.items */ },
          onUpdate: (props) => { /* refresh the list */ },
          onKeyDown: ({ event }) => event.key === "Escape", // true = handled
          onExit: () => { /* hide popup */ },
        }),
      }),
    ];
  },
});
```

### Step 3: Build the collaborative editor hook

The hook creates one Yjs document and one provider per document id, wires them into the `Collaboration` and `CollaborationCaret` extensions, and cleans up on unmount. `immediatelyRender: false` is required when the component renders on the server in Next.js.

```typescript
// src/use-collab-editor.ts
"use client";
import { useEffect, useMemo } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";           // v3 already bundles Link and Underline
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { createLowlight, common } from "lowlight";
import * as Y from "yjs";
import { SlashCommand } from "./slash-command";

const lowlight = createLowlight(common);

export function useCollabEditor(opts: { documentId: string; token: string; userName: string; userColor: string }) {
  const { ydoc, provider } = useMemo(() => {
    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: process.env.NEXT_PUBLIC_COLLAB_URL ?? "ws://127.0.0.1:1234",
      name: opts.documentId,
      document: ydoc,
      token: opts.token,
    });
    return { ydoc, provider };
  }, [opts.documentId, opts.token]);

  useEffect(() => () => { provider.destroy(); ydoc.destroy(); }, [provider, ydoc]);

  return useEditor({
    immediatelyRender: false,          // required with Next.js SSR
    extensions: [
      StarterKit.configure({
        undoRedo: false,               // v3 name for `history`; Yjs provides undo/redo
        link: { openOnClick: false },
      }),
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: 'Type "/" for commands...' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
      SlashCommand,
      Collaboration.configure({ document: ydoc }),
      CollaborationCaret.configure({ provider, user: { name: opts.userName, color: opts.userColor } }),
    ],
  }, [ydoc, provider]);
}
```

Render it with `<EditorContent editor={editor} />` from `@tiptap/react`. Pass a short-lived session token as `token`, never a bare user id in production.

### Step 4: Run the collaboration server

Hocuspocus loads a document's Yjs state when the first client opens it and stores it (debounced) as clients edit. The server binds to 127.0.0.1; put a TLS-terminating reverse proxy in front of it for `wss://` in production. `onAuthenticate` runs before any document is served: throw to reject the connection.

```sql
CREATE TABLE documents (
  id         text PRIMARY KEY,
  ydoc       bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

```typescript
// src/server.ts
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const server = new Server({
  address: "127.0.0.1",
  port: 1234,
  async onAuthenticate({ token }) {
    const user = await verifySession(token);     // your own check; throw to reject
    return { user };
  },
  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const { rows } = await pool.query("SELECT ydoc FROM documents WHERE id = $1", [documentName]);
        return rows[0]?.ydoc ?? null;            // bytea -> Buffer/Uint8Array
      },
      store: async ({ documentName, state }) => {
        await pool.query(
          `INSERT INTO documents (id, ydoc) VALUES ($1, $2)
           ON CONFLICT (id) DO UPDATE SET ydoc = EXCLUDED.ydoc, updated_at = now()`,
          [documentName, state],
        );
      },
    }),
  ],
});

async function verifySession(token: string) { if (!token) throw new Error("unauthorized"); return { id: token }; }
server.listen();
```

`DATABASE_URL` comes from the environment. Replace the placeholder `verifySession` with a real check of your session token.

## Real-World Example

Olga's team ships the editor behind their existing document pages. Within the first week support stops getting "my changes disappeared" tickets: two editors in the same page now see each other's colored carets, and reopening a page after a tab crash shows the last text that reached the server. Power users pick up `/table` and `/code` within a day, while non-technical teammates use the toolbar and never touch markdown.

## Related Skills

- [typescript](/skills/typescript): types for the editor hook and server
- [nextjs](/skills/nextjs): hosts the editor page and server-renders the shell
- [postgresql](/skills/postgresql): stores the Yjs document state
- [yjs](/skills/yjs): the CRDT layer, awareness, and persistence options
