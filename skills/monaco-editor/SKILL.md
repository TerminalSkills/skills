---
name: monaco-editor
description: >-
  Monaco Editor is the code editor that powers VS Code, packaged as a browser component with syntax highlighting, IntelliSense, diagnostics and a diff view. Use when a user asks to "embed a code editor in the web app", "add Monaco to a React or Vite project", "show a JSON or YAML editor with validation", "build a diff viewer", "set up Monaco web workers", or "use @monaco-editor/react without the CDN". Covers bundler setup, models, languages, markers and the diff editor.
license: Apache-2.0
compatibility: "Node.js 20.19+ (what Vite 8 requires; check your bundler) and a bundler (Vite, webpack) for monaco-editor 0.5x; a modern desktop browser; web workers must be served over http(s)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "monaco-editor, code-editor, vscode, web-workers, react"
  repository: https://github.com/microsoft/monaco-editor
---

# Monaco Editor — the VS Code editor in the browser

## Overview

`monaco-editor` is an npm package that ships the editor core of VS Code: multi-cursor editing, find and replace, minimap, syntax highlighting for dozens of languages, and richer language services for TypeScript/JavaScript, JSON, CSS and HTML (completion, hover, validation). The main objects are:

- **model** (`ITextModel`): the text plus language, identified by a `Uri`. Created with `monaco.editor.createModel`.
- **editor**: a view onto one model, created with `monaco.editor.create(domElement, options)`.
- **diff editor**: two models side by side, `monaco.editor.createDiffEditor`.
- **markers**: error and warning squiggles you set yourself with `monaco.editor.setModelMarkers`.

`@monaco-editor/react` is a separate community package (not part of the Microsoft repository) that wraps the editor as `<Editor />` and `<DiffEditor />` and loads Monaco for you. By default it fetches Monaco files from a CDN at runtime; call `loader.config({ monaco })` to use the npm package from your own bundle instead (needed for offline, intranet or strict CSP deployments).

Monaco is a desktop-browser editor. It does not support mobile browsers well. For a terminal-like or plain textarea need, it is overkill.

## Instructions

### Installation

```bash
npm install monaco-editor
```

React wrapper (optional, separate package; it accepts React 16.8 to 19):

```bash
npm install @monaco-editor/react
```

### Web workers

Language features (JSON, CSS/SCSS/Less, HTML, TypeScript/JavaScript) and the editor core run in web workers. You must tell Monaco how to start them through `self.MonacoEnvironment`. Without it the editor still opens but logs `Could not create web worker(s)` and falls back to the main thread. Workers cannot start from a `file://` page, so always serve over `http://` or `https://`.

With Vite, import each worker with the `?worker` suffix and pick one by label:

```typescript
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};
```

These short paths come from the package `exports` map and built successfully with Vite 8 and monaco-editor 0.57. Older guides (including the `@monaco-editor/react` README) use `monaco-editor/esm/vs/...`; with 0.57 the `editor.worker` import written that way failed to resolve, so prefer the paths above.

Put this in a module that runs once before the first editor is created (for example `src/monaco-setup.ts` imported from `main.tsx`). Include only the workers for languages you ship; other languages (Python, Go, YAML, Markdown, and so on) get highlighting from the main thread and need no worker.

With webpack, either use the community `monaco-editor-webpack-plugin` (`new MonacoWebpackPlugin()` in `plugins`, with `style-loader`/`css-loader` for `.css` and `file-loader` for `.ttf`), or list each worker as a separate webpack entry and return its bundle URL from `getWorkerUrl`; both are described in the repository's `docs/integrate-esm.md`.

Versions from 0.56 also expose smaller entry points (`monaco-editor/editor`, then opt-in `monaco-editor/features/...` and `monaco-editor/languages/...` registrations) for custom bundles; the default `import * as monaco from 'monaco-editor'` loads everything. See the package CHANGELOG before slimming a bundle.

### Creating an editor and models

```typescript
import * as monaco from 'monaco-editor';

const model = monaco.editor.createModel(
  '{\n  "name": "billing-api",\n  "port": 8443\n}\n',
  'json',
  monaco.Uri.parse('file:///config/app.json'),
);

const editor = monaco.editor.create(document.getElementById('editor')!, {
  model,
  theme: 'vs-dark',
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 14,
  tabSize: 2,
});

editor.onDidChangeModelContent(() => {
  const text = editor.getValue();
  console.log(`edited, ${text.length} characters`);
});

editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
  console.log('save', model.getValue());
});
```

The container element must have a height (CSS); the editor does not size itself from its content. `automaticLayout: true` makes it follow container resizes. A model URI must be unique: creating a second model with the same `Uri` throws `Cannot add model because it already exists`. Call `model.dispose()` and `editor.dispose()` when a view is removed.

Switch the language of an existing model with `monaco.editor.setModelLanguage(model, 'typescript')`, and the theme globally with `monaco.editor.setTheme('vs')` (built-ins are `vs`, `vs-dark`, `hc-black`, `hc-light`).

### Language services

From 0.55 the nested namespaces were moved to top level, so use `monaco.json`, `monaco.typescript`, `monaco.css`, `monaco.html`. The old `monaco.languages.typescript` and `monaco.languages.json` are deprecated placeholders.

```typescript
monaco.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  schemas: [{
    uri: 'https://schemas.billing-platform.dev/app-config.json',
    fileMatch: ['file:///config/app.json'],
    schema: {
      type: 'object',
      required: ['name', 'port'],
      properties: { name: { type: 'string' }, port: { type: 'integer', minimum: 1024 } },
    },
  }],
});

monaco.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ES2020,
  strict: true,
});
monaco.typescript.typescriptDefaults.addExtraLib(
  'declare const apiVersion: string;',
  'file:///globals.d.ts',
);
```

Schema `fileMatch` entries are matched against the model URI, so set a stable URI when creating the model.

### Your own markers and completions

```typescript
monaco.editor.setModelMarkers(model, 'config-lint', [{
  severity: monaco.MarkerSeverity.Warning,
  message: 'port 8443 is reserved for the admin console',
  startLineNumber: 3, startColumn: 3, endLineNumber: 3, endColumn: 14,
}]);

monaco.languages.registerCompletionItemProvider('plaintext', {
  provideCompletionItems(m, position) {
    const word = m.getWordUntilPosition(position);
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    return {
      suggestions: [{ label: 'TODO(owner)', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'TODO(owner): ', range }],
    };
  },
});
```

Pass the same `owner` string to clear or replace your markers later (`setModelMarkers(model, 'config-lint', [])`).

### Diff editor

```typescript
const diff = monaco.editor.createDiffEditor(document.getElementById('diff')!, {
  renderSideBySide: true,
  readOnly: true,
  automaticLayout: true,
});
diff.setModel({
  original: monaco.editor.createModel(oldText, 'yaml'),
  modified: monaco.editor.createModel(newText, 'yaml'),
});
```

`renderSideBySide: false` gives the inline unified view.

### React with @monaco-editor/react

Use the bundled npm package and the worker setup above by calling `loader.config({ monaco })` once; otherwise the component downloads Monaco from a CDN.

```tsx
import * as monaco from 'monaco-editor';
import Editor, { DiffEditor, loader, type OnMount } from '@monaco-editor/react';
import './monaco-setup';

loader.config({ monaco });

export function ConfigEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const onMount: OnMount = (editor, m) => {
    editor.focus();
    m.editor.setTheme('vs-dark');
  };
  return (
    <Editor
      height="60vh"
      path="file:///config/app.json"
      defaultLanguage="json"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={onMount}
      options={{ minimap: { enabled: false }, automaticLayout: true }}
    />
  );
}

export const Review = ({ before, after }: { before: string; after: string }) => (
  <DiffEditor height="50vh" language="yaml" original={before} modified={after} options={{ renderSideBySide: false }} />
);
```

The `path` prop gives each file its own model, so undo history and cursor position survive when you switch tabs. `onMount` receives the editor and the `monaco` namespace; `useMonaco()` returns the namespace in components that are not the editor.

## Examples

### 1. A validated JSON settings editor in a Vite app

User request: "Add a settings editor to the admin panel that flags invalid JSON and wrong port numbers, with no CDN calls."

```bash
npm install monaco-editor @monaco-editor/react
```

Create `src/monaco-setup.ts` with the Vite worker block from above, import it plus `loader.config({ monaco })` before rendering `ConfigEditor`, and register the JSON schema shown in "Language services" with `fileMatch: ['file:///config/app.json']`. Typing `"port": 80` produces a squiggle on `80` with the schema message that the value must be `>= 1024`; a missing comma shows a syntax error. The browser network tab shows no requests to a CDN, because Monaco is part of the build.

### 2. A review screen that diffs two versions of a config

User request: "Show reviewers what changed between the deployed values.yaml and the proposed one."

```tsx
import { DiffEditor } from '@monaco-editor/react';

export function ValuesReview({ deployed, proposed }: { deployed: string; proposed: string }) {
  return (
    <DiffEditor
      height="70vh"
      language="yaml"
      original={deployed}
      modified={proposed}
      options={{ readOnly: true, renderSideBySide: true, automaticLayout: true }}
    />
  );
}
```

The two panes show the deployed text on the left and the proposed text on the right, with changed lines highlighted and gutter markers for additions and removals. Without the setup from "Web workers", the diff still computes on the main thread but the console warns about missing workers.

### 3. Rejecting saves while markers are present

User request: "Don't let the user save while the editor shows errors."

```typescript
function hasErrors(model: monaco.editor.ITextModel): boolean {
  return monaco.editor
    .getModelMarkers({ resource: model.uri })
    .some((m) => m.severity === monaco.MarkerSeverity.Error);
}

monaco.editor.onDidChangeMarkers(([uri]) => {
  if (uri.toString() === model.uri.toString()) {
    saveButton.disabled = hasErrors(model);
  }
});
```

The save button is disabled when JSON validation or your own `setModelMarkers` call reports an error, and re-enables when the last error is fixed.

## Guidelines

- Configure `self.MonacoEnvironment` before the first editor is created, and serve the app over http(s); otherwise language features degrade and the console shows worker warnings.
- Give the editor container an explicit height and set `automaticLayout: true`, or the editor renders at 0 height or does not follow resizes.
- Use unique model URIs and dispose models and editors when finished; leaked models are the usual source of memory growth in tabbed UIs.
- `@monaco-editor/react` loads Monaco from a CDN unless you call `loader.config({ monaco })` with the npm package; do that for offline use, an intranet, or a Content-Security-Policy.
- The bundle is large (several megabytes before compression). Load the editor lazily (`React.lazy` or a dynamic `import()`) and ship only the workers you use.
- Monaco does not run code, lint or format by itself beyond the built-in JSON/CSS/HTML/TypeScript services; connect your own linter results through markers.
- Treat editor content as untrusted input on the server; the editor is a client-side component and gives no security boundary.
- Do not choose Monaco for mobile-first apps or for a small single-line or markdown input; use a textarea or a lighter editor.
