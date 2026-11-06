---
name: plate
description: >-
  Plate is a plugin-based rich-text editor framework for React, built on Slate, with optional shadcn/ui components, Markdown import/export and Yjs real-time collaboration. Use it when a user asks to "add a rich text editor to a React app", "build a Notion-style editor with Plate", "serialize Plate content to Markdown", "add collaboration to a Plate editor", or "migrate from @udecode/plate-* to platejs". Covers the current platejs and @platejs/* packages, not the pre-v49 @udecode/plate-* ones.
license: Apache-2.0
compatibility: "Node.js 18+, React 18+, TypeScript 5+ with moduleResolution bundler"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "rich-text, editor, slate, react, collaboration"
  repository: https://github.com/udecode/plate
---

# Plate — plugin-based rich-text editor for React

## Overview

Plate wraps Slate in a plugin system: every feature (bold, headings, lists, tables, Markdown, collaboration) is a plugin with its own transforms, keyboard handling and optional React component. The document is plain JSON (`Value`, an array of nodes such as `{ type: 'p', children: [{ text: 'Hi' }] }`), so it is easy to store, diff and migrate.

The packages were renamed in v49: the old `@udecode/plate-*` packages are gone, and everything now lives in `platejs` plus scoped `@platejs/*` packages. This skill was checked against `platejs` 53.5.x (MIT licensed). Pin the major version in `package.json` because plugin and package boundaries have changed between majors.

Import paths follow one rule: `platejs` and `@platejs/*` are headless and run in Node.js; `platejs/react` and `@platejs/*/react` are the browser editor. Use the base entrypoints in scripts and server code.

## Instructions

### Installation (headless, no UI kit)

```bash
npm install platejs@53 @platejs/basic-nodes@53
```

TypeScript needs `"moduleResolution": "bundler"` (TypeScript 5+) because the packages are ESM-only:

```json
{ "compilerOptions": { "module": "esnext", "moduleResolution": "bundler", "jsx": "react-jsx", "strict": true } }
```

### Installation (styled editor with shadcn/ui)

In a project that already has shadcn/ui set up, the registry installs ready-made components and plugin kits into your source tree, where you own and edit them:

```bash
npx shadcn@latest add @plate/plate-ui
npx shadcn@latest add @plate/editor
```

`@plate/editor` is the documented Next.js starting point. Feature kits such as `@plate/basic-nodes-kit` wire a plugin and its UI together. This command copies files into your project, so run it on a clean git tree and review the diff.

### Create a minimal editor

```tsx
import type { Value } from 'platejs';
import { BoldPlugin, H1Plugin, ItalicPlugin } from '@platejs/basic-nodes/react';
import { Plate, PlateContent, usePlateEditor } from 'platejs/react';

const initialValue: Value = [
  { type: 'h1', children: [{ text: 'Q4 launch plan' }] },
  { type: 'p', children: [{ text: 'Ship the ' }, { text: 'beta', bold: true }, { text: ' by Friday.' }] },
];

export function NoteEditor() {
  const editor = usePlateEditor({
    plugins: [BoldPlugin, ItalicPlugin, H1Plugin],
    value: initialValue,
  });
  return (
    <Plate editor={editor} onChange={({ value }) => localStorage.setItem('note', JSON.stringify(value))}>
      <PlateContent placeholder="Write something..." />
    </Plate>
  );
}
```

`usePlateEditor` memoizes the editor; `createPlateEditor` (also from `platejs/react`) does not. Marks render as `<strong>`, `<em>` and `<u>` by default. To trigger formatting from your own toolbar call `editor.tf.bold.toggle()`.

### Render a node with your own component

Block plugins take a component through `withComponent`:

```tsx
import { H1Plugin } from '@platejs/basic-nodes/react';
import { PlateElement, type PlateElementProps } from 'platejs/react';

function H1Element(props: PlateElementProps) {
  return <PlateElement as="h1" className="text-3xl font-bold" {...props} />;
}

const plugins = [H1Plugin.withComponent(H1Element)];
```

### Markdown import and export (Node.js or browser)

```bash
npm install @platejs/markdown@53
```

```ts
import { BaseBasicBlocksPlugin, BaseBasicMarksPlugin } from '@platejs/basic-nodes';
import { MarkdownPlugin, deserializeMd, serializeMd } from '@platejs/markdown';
import { createSlateEditor } from 'platejs';

const editor = createSlateEditor({
  plugins: [BaseBasicBlocksPlugin, BaseBasicMarksPlugin, MarkdownPlugin],
});
const value = deserializeMd(editor, '# Release notes\n\nShipped **v2** today.');
console.log(serializeMd(editor, { value }));
```

Output of the round trip is `# Release notes` and `Shipped **v2** today.` separated by a blank line. `createSlateEditor` is the non-React editor, so this runs in scripts, API routes and migrations. Register a plugin for every node type that appears in the content: the Markdown `- item` syntax produces `ul`/`li` nodes that are only serialized back if the list plugin (`@platejs/list`) is registered too.

### Bulk transforms on a document

```ts
const editor = createSlateEditor({ plugins: [BaseBasicBlocksPlugin], value });
editor.tf.setNodes({ type: 'h2' }, { at: [], match: (n) => 'type' in n && n.type === 'h1' });
const plain = editor.api.string([]);
```

Pass `at: []` to apply a transform to the whole document, then read `editor.children` for the new value.

### Real-time collaboration with Yjs

```bash
npm install @platejs/yjs@53 @hocuspocus/provider
```

```tsx
import { useEffect } from 'react';
import { YjsPlugin } from '@platejs/yjs/react';
import { Plate, PlateContent, usePlateEditor } from 'platejs/react';

export function SharedEditor({ docId, user }: { docId: string; user: { name: string; color: string } }) {
  const editor = usePlateEditor({
    plugins: [
      YjsPlugin.configure({
        options: {
          cursors: { data: user },
          providers: [{ type: 'hocuspocus', options: { name: docId, url: 'wss://collab.notes-app.dev' } }],
        },
      }),
    ],
    skipInitialization: true,
  });

  useEffect(() => {
    void editor.getApi(YjsPlugin).yjs.init({ id: docId, value: [{ type: 'p', children: [{ text: '' }] }] });
    return () => editor.getApi(YjsPlugin).yjs.destroy();
  }, [editor, docId]);

  return (
    <Plate editor={editor}>
      <PlateContent />
    </Plate>
  );
}
```

`skipInitialization: true` is required so Plate does not seed its own value over the shared document. The `value` passed to `yjs.init` is only used when the document is empty on the server. Other provider types are `indexeddb` (local persistence, option `docName`) and `webrtc` (option `roomName`); all providers share one `Y.Doc`. Remote cursors need the `RemoteCursorOverlay` component from the Plate UI registry rendered through `render.afterEditable`, inside a positioned container.

## Examples

### Example 1: Add a Markdown preview-and-save flow to an existing editor

Request: "Our notes editor stores JSON. Add a button that exports the note as a .md file."

```tsx
import { MarkdownPlugin, serializeMd } from '@platejs/markdown';
import { BoldPlugin, H1Plugin } from '@platejs/basic-nodes/react';
import { usePlateEditor } from 'platejs/react';

const editor = usePlateEditor({ plugins: [BoldPlugin, H1Plugin, MarkdownPlugin] });
const markdown = serializeMd(editor);
const blob = new Blob([markdown], { type: 'text/markdown' });
```

Result: `serializeMd(editor)` returns the current document as Markdown; the `Blob` can be given to a download link. Add `MarkdownPlugin` to the same plugin list as the editor you already have.

### Example 2: Migrate stored headings in a script

Request: "Every h1 in 3,000 saved notes should become an h2."

```ts
import { BaseBasicBlocksPlugin } from '@platejs/basic-nodes';
import { createSlateEditor, type Value } from 'platejs';

export function demoteHeadings(value: Value): Value {
  const editor = createSlateEditor({ plugins: [BaseBasicBlocksPlugin], value });
  editor.tf.setNodes({ type: 'h2' }, { at: [], match: (n) => 'type' in n && n.type === 'h1' });
  return editor.children;
}
```

Result: run it over each stored note and write the returned array back. No React or DOM is needed.

### Example 3: Upgrade an old project

Request: "This repo imports from @udecode/plate-common."

Replace the dependencies with `platejs` and the specific `@platejs/*` packages used (marks and basic blocks are in `@platejs/basic-nodes`), change imports to `platejs` and `platejs/react`, then run `npx tsc --noEmit` and fix each reported missing export against the current docs at https://platejs.org/docs.

## Guidelines

- Use the exact package names above. Search results and older tutorials show `@udecode/plate-*` and `createPlugin`-style code that no longer matches v49+.
- Do not import `platejs/react` or `@platejs/*/react` in Node.js scripts or Server Components; use `createSlateEditor` and the base plugins.
- Plugins are what give a node type meaning: register a plugin for every `type` that occurs in stored content, or the round trip through Markdown loses it (shown above with lists).
- Store the JSON `Value`, not HTML. Markdown is lossy for rich nodes (tables, mentions, comments); keep JSON as the source of truth when fidelity matters.
- With Yjs, the server is the source of truth: do not also feed the same document through `value` on every render, and always call `yjs.destroy()` on unmount.
- Authenticate the collaboration server yourself. Plate's Hocuspocus provider accepts a `token` option that your server must verify.
- Plate AI and comment features depend on extra packages and an LLM provider key that you supply; they are not covered here and need their own documentation check.
- Not for non-React apps. For a framework-agnostic editor on ProseMirror use Tiptap instead; for a code editor use Monaco.
