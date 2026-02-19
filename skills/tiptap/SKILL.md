---
name: tiptap
description: >-
  Build rich text editors with Tiptap. Use when a user asks to add a WYSIWYG
  editor, build a Notion-like editor, create a rich text input, add markdown
  editing, build a collaborative editor, or create a CMS content editor.
license: Apache-2.0
compatibility: 'React, Vue, vanilla JS'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frontend
  tags:
    - tiptap
    - editor
    - rich-text
    - wysiwyg
    - prosemirror
    - collaborative
---

# Tiptap

## Overview

Tiptap is a headless rich text editor framework built on ProseMirror. It provides the logic (content model, commands, extensions) while you provide the UI. Used by GitLab, Substack, and Notion-like apps. Supports collaborative editing via Yjs.

## Instructions

### Step 1: Setup

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
```

### Step 2: Basic Editor

```tsx
// components/Editor.tsx — Rich text editor with toolbar
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

export function RichEditor({ content, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing...' }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  if (!editor) return null

  return (
    <div className="border rounded-lg">
      <div className="flex gap-1 p-2 border-b">
        <button onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'bg-gray-200' : ''}>B</button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'bg-gray-200' : ''}>I</button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
        <button onClick={() => editor.chain().focus().toggleCodeBlock().run()}>Code</button>
      </div>
      <EditorContent editor={editor} className="p-4 prose max-w-none min-h-[200px]" />
    </div>
  )
}
```

### Step 3: Extensions

```bash
# Additional extensions
npm install @tiptap/extension-link @tiptap/extension-image @tiptap/extension-mention
npm install @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor
```

```typescript
// Custom extension example
import { Extension } from '@tiptap/core'

const CustomKeymap = Extension.create({
  name: 'customKeymap',
  addKeyboardShortcuts() {
    return {
      'Mod-s': () => { saveDocument(); return true },
    }
  },
})
```

### Step 4: Collaborative Editing

```typescript
// Collaborative editing with Yjs
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const ydoc = new Y.Doc()
const provider = new WebsocketProvider('ws://localhost:1234', 'my-document', ydoc)

const editor = useEditor({
  extensions: [
    StarterKit.configure({ history: false }),    // Yjs handles undo/redo
    Collaboration.configure({ document: ydoc }),
    CollaborationCursor.configure({ provider, user: { name: 'Alice', color: '#f783ac' } }),
  ],
})
```

## Guidelines

- Tiptap is headless — it provides no UI by default. Build your own toolbar or use community UI kits.
- Use StarterKit for common features (bold, italic, lists, headings, code blocks).
- Output can be HTML (`editor.getHTML()`) or JSON (`editor.getJSON()`). JSON is better for storage and rendering.
- For collaborative editing, combine with Yjs and a WebSocket server (or use Tiptap's hosted Collaboration service).
