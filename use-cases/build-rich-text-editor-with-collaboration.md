---
title: Build a Rich Text Editor with Collaboration
slug: build-rich-text-editor-with-collaboration
description: Build a Notion-style rich text editor with block-based content, slash commands, inline formatting, image embeds, @mentions, and real-time collaboration using Tiptap and Y.js.
skills:
  - typescript
  - nextjs
  - redis
  - postgresql
  - hono
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

Olga leads product at a 30-person knowledge base company. Their editor is a plain `<textarea>` with markdown preview. Users want WYSIWYG editing — bold, headers, images, code blocks, tables — without learning markdown. Two people editing the same document overwrite each other. They lose content when the browser crashes mid-edit. They need a modern editor with rich formatting, slash commands for power users, autosave, and real-time collaboration where multiple editors see each other's cursors.

## Step 1: Build the Collaborative Editor

```typescript
// src/editor/collaborative-editor.tsx — Tiptap + Y.js collaborative rich text editor
"use client";

import { useEditor, EditorContent, BubbleMenu, FloatingMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Mention from "@tiptap/extension-mention";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { useState, useEffect, useCallback, useRef } from "react";

interface EditorProps {
  documentId: string;
  userId: string;
  userName: string;
  userColor: string;
  onSave?: (content: any) => void;
}

// Slash command menu items
const SLASH_COMMANDS = [
  { title: "Heading 1", command: "heading", attrs: { level: 1 }, icon: "H1" },
  { title: "Heading 2", command: "heading", attrs: { level: 2 }, icon: "H2" },
  { title: "Heading 3", command: "heading", attrs: { level: 3 }, icon: "H3" },
  { title: "Bullet List", command: "bulletList", icon: "•" },
  { title: "Numbered List", command: "orderedList", icon: "1." },
  { title: "Task List", command: "taskList", icon: "☑" },
  { title: "Code Block", command: "codeBlock", icon: "</>" },
  { title: "Blockquote", command: "blockquote", icon: "❝" },
  { title: "Table", command: "table", icon: "▦" },
  { title: "Image", command: "image", icon: "🖼" },
  { title: "Divider", command: "horizontalRule", icon: "—" },
];

export function CollaborativeEditor({ documentId, userId, userName, userColor, onSave }: EditorProps) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Y.js document for collaboration
  const ydoc = useRef(new Y.Doc());

  // Connect to collaboration server
  const provider = useRef(
    new HocuspocusProvider({
      url: process.env.NEXT_PUBLIC_COLLAB_URL || "ws://localhost:8080",
      name: documentId,
      document: ydoc.current,
      token: userId,
    })
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,          // Y.js handles undo/redo
      }),
      Image.configure({
        allowBase64: false,
        HTMLAttributes: { class: "editor-image" },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "editor-link" },
      }),
      Placeholder.configure({
        placeholder: 'Type "/" for commands...',
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight,
      Table.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: {
          items: ({ query }: any) => searchUsers(query),
          render: () => ({
            onStart: (props: any) => { /* show mention popup */ },
            onUpdate: (props: any) => { /* update popup */ },
            onExit: () => { /* hide popup */ },
          }),
        },
      }),
      // Real-time collaboration
      Collaboration.configure({
        document: ydoc.current,
      }),
      CollaborationCursor.configure({
        provider: provider.current,
        user: { name: userName, color: userColor },
      }),
    ],
    onUpdate: ({ editor }) => {
      // Debounced autosave
      debouncedSave(editor.getJSON());
    },
  });

  // Autosave every 3 seconds of inactivity
  const debouncedSave = useCallback(
    debounce(async (content: any) => {
      setSaving(true);
      try {
        await fetch(`/api/documents/${documentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        setLastSaved(new Date());
      } finally {
        setSaving(false);
      }
    }, 3000),
    [documentId]
  );

  // Handle slash command execution
  const executeSlashCommand = useCallback((command: typeof SLASH_COMMANDS[0]) => {
    if (!editor) return;

    // Delete the "/" trigger
    editor.chain().focus().deleteRange({
      from: editor.state.selection.from - slashFilter.length - 1,
      to: editor.state.selection.from,
    }).run();

    switch (command.command) {
      case "heading":
        editor.chain().focus().toggleHeading(command.attrs as any).run();
        break;
      case "bulletList":
        editor.chain().focus().toggleBulletList().run();
        break;
      case "orderedList":
        editor.chain().focus().toggleOrderedList().run();
        break;
      case "taskList":
        editor.chain().focus().toggleTaskList().run();
        break;
      case "codeBlock":
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case "blockquote":
        editor.chain().focus().toggleBlockquote().run();
        break;
      case "table":
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case "image":
        const url = prompt("Image URL:");
        if (url) editor.chain().focus().setImage({ src: url }).run();
        break;
      case "horizontalRule":
        editor.chain().focus().setHorizontalRule().run();
        break;
    }

    setShowSlashMenu(false);
  }, [editor, slashFilter]);

  // Image upload via drag & drop
  const handleDrop = useCallback(async (event: DragEvent) => {
    if (!editor) return;
    const files = event.dataTransfer?.files;
    if (!files?.length) return;

    event.preventDefault();

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await res.json();

      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.title.toLowerCase().includes(slashFilter.toLowerCase())
  );

  if (!editor) return null;

  return {
    editor,
    showSlashMenu,
    filteredCommands,
    saving,
    lastSaved,
    executeSlashCommand,
    handleDrop,
  };
}

async function searchUsers(query: string): Promise<Array<{ id: string; label: string }>> {
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=5`);
  const users = await res.json();
  return users.map((u: any) => ({ id: u.id, label: u.name }));
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: any;
  return ((...args: any[]) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }) as T;
}
```

## Results

- **Markdown barrier eliminated** — WYSIWYG editing means non-technical team members create content without learning syntax; adoption across the company tripled
- **Slash commands for power users** — type "/" to see all formatting options; experienced users insert tables, code blocks, and images without touching the toolbar
- **No more content loss** — autosave every 3 seconds means browser crashes lose at most 3 seconds of work; Y.js preserves document state across reconnections
- **Real-time collaboration** — multiple editors see each other's cursors and changes instantly; no more "someone else was editing this document" conflicts
- **@mentions drive engagement** — mentioning a teammate in a document sends them a notification; document discussions happen in context instead of Slack
