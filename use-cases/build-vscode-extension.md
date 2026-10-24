---
title: Build a VS Code Extension
slug: build-vscode-extension
description: Build a VS Code extension with custom commands, a sidebar TreeView, hover providers, diagnostics, code actions, and a WebviewPanel. Publish to the VS Code Marketplace with vsce.
skills:
  - typescript
category: development
tags:
  - vscode
  - extension
  - ide
  - developer-tools
  - marketplace
---

# Build a VS Code Extension

## The Problem

Sam's team has a custom component library with 200+ components. Developers constantly look up component APIs in docs, mistype prop names, and forget required props. Sam wants a VS Code extension that shows component docs on hover, validates props, and lets teammates browse the component library in a sidebar, without leaving the editor.

## The Solution

A TypeScript extension that reads a `component-manifest.json` from the workspace and plugs it into five VS Code APIs: a `TreeDataProvider` (sidebar), a `HoverProvider` (inline docs), a `DiagnosticCollection` plus `CodeActionProvider` (prop validation and quick fixes) and a `WebviewPanel` (full docs). The [typescript](https://terminalskills.io/skills/typescript) skill covers the compiler setup.

## Step-by-Step Walkthrough

### Step 1: Project and manifest

Create the folder with `package.json`, `tsconfig.json` and the `src/` files below, then install the dev dependencies with `npm install`. `engines.vscode` must be at least as new as the `@types/vscode` version, otherwise `vsce package` refuses to build. Since VS Code 1.74, commands and views you declare in `contributes` activate the extension automatically, so `activationEvents` only needs the language triggers.

```json
{
  "name": "component-lens", "displayName": "ComponentLens", "version": "0.1.0",
  "publisher": "your-publisher-id", "license": "MIT",
  "repository": { "type": "git", "url": "https://example.com/component-lens.git" },
  "engines": { "vscode": "^1.90.0" },
  "main": "./out/extension.js",
  "activationEvents": ["onLanguage:typescriptreact", "onLanguage:javascriptreact"],
  "contributes": {
    "commands": [
      { "command": "componentLens.openBrowser", "title": "ComponentLens: Open Browser" },
      { "command": "componentLens.insertComponent", "title": "ComponentLens: Insert Component" }
    ],
    "views": { "explorer": [{ "id": "componentLens.browser", "name": "Components" }] },
    "configuration": { "title": "ComponentLens", "properties": {
      "componentLens.manifestPath": { "type": "string", "default": "component-manifest.json" } } }
  },
  "scripts": { "compile": "tsc -p ./" },
  "devDependencies": { "@types/node": "^20.14.0", "@types/vscode": "^1.90.0", "@vscode/vsce": "^4.0.0", "typescript": "^5.5.0" }
}
```

`tsconfig.json` needs `"module": "commonjs"`, `"target": "ES2022"`, `"outDir": "out"`, `"rootDir": "src"` and `"strict": true`. Compile with `npx tsc -p .`.

The extension reads `component-manifest.json` from the workspace root: `{ "components": [...] }`, where each entry has `name`, `category`, `package`, `description`, `example` and `props` (each prop has `name`, `type`, `required`, `description`). Most design-system builds can emit this file.

### Step 2: Manifest types and activation

```typescript
// src/manifest.ts
import * as vscode from "vscode";
export interface PropDef { name: string; type: string; required: boolean; description: string; defaultValue?: string }
export interface ComponentDef { name: string; category: string; package: string; description: string; example: string; props: PropDef[] }
export interface ComponentManifest { components: ComponentDef[] }
export async function loadManifest(): Promise<ComponentManifest> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return { components: [] };
  const rel = vscode.workspace.getConfiguration("componentLens").get<string>("manifestPath", "component-manifest.json");
  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, rel));
  return JSON.parse(Buffer.from(bytes).toString("utf8")) as ComponentManifest;
}
```

```typescript
// src/extension.ts
import * as vscode from "vscode";
import { loadManifest, ComponentDef } from "./manifest";
import { ComponentBrowserProvider } from "./providers/ComponentBrowserProvider";
import { ComponentHoverProvider } from "./providers/ComponentHoverProvider";
import { ComponentDiagnosticProvider } from "./providers/ComponentDiagnosticProvider";
import { ComponentCodeActionProvider } from "./providers/ComponentCodeActionProvider";
import { ComponentDocsPanel } from "./providers/ComponentDocsPanel";
const REACT = [{ language: "typescriptreact" }, { language: "javascriptreact" }];
export async function activate(context: vscode.ExtensionContext) {
  const manifest = await loadManifest();
  const collection = vscode.languages.createDiagnosticCollection("componentLens");
  const diagnostics = new ComponentDiagnosticProvider(manifest, collection);
  context.subscriptions.push(
    collection,
    vscode.window.registerTreeDataProvider("componentLens.browser", new ComponentBrowserProvider(manifest)),
    vscode.commands.registerCommand("componentLens.openBrowser", () =>
      vscode.commands.executeCommand("componentLens.browser.focus")),
    vscode.commands.registerCommand("componentLens.insertComponent", async () => {
      const item = await vscode.window.showQuickPick(
        manifest.components.map((c) => ({ label: c.name, description: c.description, detail: c.package })),
        { placeHolder: "Select a component to insert" });
      const component = manifest.components.find((c) => c.name === item?.label);
      if (component) await vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(buildSnippet(component)));
    }),
    vscode.commands.registerCommand("componentLens.viewDocs", (name: string) =>
      ComponentDocsPanel.createOrShow(manifest, name)),
    vscode.languages.registerHoverProvider(REACT, new ComponentHoverProvider(manifest)),
    vscode.languages.registerCodeActionsProvider(REACT, new ComponentCodeActionProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.workspace.onDidChangeTextDocument((e) => diagnostics.validate(e.document)),
    vscode.workspace.onDidOpenTextDocument((doc) => diagnostics.validate(doc)),
  );
  vscode.workspace.textDocuments.forEach((doc) => diagnostics.validate(doc));
}
function buildSnippet(c: ComponentDef): string {
  const props = c.props.filter((p) => p.required)
    .map((p, i) => ` ${p.name}={\${${i + 1}:${p.defaultValue ?? p.type}}}`).join("");
  return `<${c.name}${props}>$0</${c.name}>`;
}
```

### Step 3: TreeView sidebar

`componentLens.browser.focus` is generated by VS Code for every contributed view, so the "open browser" command needs no custom code.

```typescript
// src/providers/ComponentBrowserProvider.ts
import * as vscode from "vscode";
import { ComponentManifest } from "../manifest";
export class ComponentBrowserProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  constructor(private manifest: ComponentManifest) {}
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }
  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!element) {
      const categories = [...new Set(this.manifest.components.map((c) => c.category))];
      return categories.map((cat) => new vscode.TreeItem(cat, vscode.TreeItemCollapsibleState.Collapsed));
    }
    return this.manifest.components.filter((c) => c.category === element.label).map((c) => {
      const item = new vscode.TreeItem(c.name);
      item.command = { command: "componentLens.viewDocs", title: "View Docs", arguments: [c.name] };
      return item;
    });
  }
}
```

### Step 4: Hover provider

A hover link can only run commands listed in `isTrusted.enabledCommands`. Do not set `isTrusted = true`, which lets manifest content run any command.

```typescript
// src/providers/ComponentHoverProvider.ts
import * as vscode from "vscode";
import { ComponentManifest } from "../manifest";
export class ComponentHoverProvider implements vscode.HoverProvider {
  constructor(private manifest: ComponentManifest) {}
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position, /<[A-Z][A-Za-z0-9]*/);
    if (!range) return undefined;
    const name = document.getText(range).slice(1);
    const component = this.manifest.components.find((c) => c.name === name);
    if (!component) return undefined;
    const md = new vscode.MarkdownString();
    // Allow only our own command from the hover link, not every command
    md.isTrusted = { enabledCommands: ["componentLens.viewDocs"] };
    md.appendMarkdown(`### ${component.name}\n\n${component.description}\n\n`);
    md.appendMarkdown(`**Package:** \`${component.package}\`\n\n**Props:**\n`);
    for (const p of component.props) {
      md.appendMarkdown(`- \`${p.name}\`${p.required ? " *(required)*" : ""}: \`${p.type}\` — ${p.description}\n`);
    }
    const args = encodeURIComponent(JSON.stringify([component.name]));
    md.appendMarkdown(`\n[View full docs](command:componentLens.viewDocs?${args})`);
    return new vscode.Hover(md, range);
  }
}
```

### Step 5: Diagnostics and quick fixes

The check is a regular expression over the document text, so it is a fast first filter, not a JSX parser: a `>` inside an attribute value (an arrow function, for example) ends the match early. For stricter checks, use the TypeScript compiler API.

```typescript
// src/providers/ComponentDiagnosticProvider.ts
import * as vscode from "vscode";
import { ComponentManifest } from "../manifest";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export class ComponentDiagnosticProvider {
  constructor(private manifest: ComponentManifest, private collection: vscode.DiagnosticCollection) {}
  validate(document: vscode.TextDocument) {
    if (!["typescriptreact", "javascriptreact"].includes(document.languageId)) return;
    const text = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];
    for (const component of this.manifest.components) {
      // Opening tag only: <Button ...> or <Button> or <Button />, not <ButtonGroup>
      const tag = new RegExp(`<${escapeRe(component.name)}(?=[\\s/>])([^>]*)>`, "g");
      let match: RegExpExecArray | null;
      while ((match = tag.exec(text)) !== null) {
        const attrs = match[1];
        for (const prop of component.props.filter((p) => p.required)) {
          if (new RegExp(`(^|\\s)${escapeRe(prop.name)}(?=[\\s=/>]|$)`).test(attrs)) continue;
          const range = new vscode.Range(document.positionAt(match.index), document.positionAt(match.index + match[0].length));
          const diag = new vscode.Diagnostic(
            range,
            `Missing required prop '${prop.name}' on <${component.name}>`,
            vscode.DiagnosticSeverity.Error
          );
          diag.code = `missing-prop:${component.name}:${prop.name}`;
          diag.source = "ComponentLens";
          diagnostics.push(diag);
        }
      }
    }
    this.collection.set(document.uri, diagnostics);
  }
}
```

```typescript
// src/providers/ComponentCodeActionProvider.ts
import * as vscode from "vscode";
export class ComponentCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diag of context.diagnostics) {
      const [kind, component, prop] = String(diag.code).split(":");
      if (kind !== "missing-prop") continue;
      const action = new vscode.CodeAction(`Add required prop '${prop}'`, vscode.CodeActionKind.QuickFix);
      action.diagnostics = [diag];
      action.isPreferred = true;
      action.edit = new vscode.WorkspaceEdit();
      // Insert right after "<Component"
      const insertAt = diag.range.start.translate(0, component.length + 1);
      action.edit.insert(document.uri, insertAt, ` ${prop}={undefined}`);
      actions.push(action);
    }
    return actions;
  }
}
```

### Step 6: Webview for rich docs

Anything from the manifest is data, so escape it before it goes into HTML and set a Content-Security-Policy. The panel needs no scripts, so leave `enableScripts` off.

```typescript
// src/providers/ComponentDocsPanel.ts
import * as vscode from "vscode";
import { ComponentManifest } from "../manifest";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export class ComponentDocsPanel {
  private static panel: vscode.WebviewPanel | undefined;
  static createOrShow(manifest: ComponentManifest, name: string) {
    const c = manifest.components.find((x) => x.name === name);
    if (!c) return;
    if (ComponentDocsPanel.panel) ComponentDocsPanel.panel.reveal(vscode.ViewColumn.Beside);
    else {
      ComponentDocsPanel.panel = vscode.window.createWebviewPanel("componentDocs", name, vscode.ViewColumn.Beside, { enableScripts: false });
      ComponentDocsPanel.panel.onDidDispose(() => (ComponentDocsPanel.panel = undefined));
    }
    const rows = c.props.map((p) =>
      `<tr><td><code>${esc(p.name)}</code></td><td>${p.required ? "yes" : ""}</td><td><code>${esc(p.type)}</code></td><td>${esc(p.description)}</td></tr>`).join("");
    ComponentDocsPanel.panel.title = `Docs: ${name}`;
    ComponentDocsPanel.panel.webview.html = `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"></head>
<body style="font-family:var(--vscode-font-family);padding:16px">
<h1>${esc(c.name)}</h1><p>${esc(c.description)}</p>
<table border="1" cellpadding="6"><tr><th>Prop</th><th>Required</th><th>Type</th><th>Description</th></tr>${rows}</table>
<h2>Example</h2><pre><code>${esc(c.example)}</code></pre></body></html>`;
  }
}
```

### Step 7: Test, package and publish

Press F5 to launch an Extension Development Host with the extension loaded. Then package it:

```bash
npm run compile
npx vsce package --no-dependencies   # -> component-lens-0.1.0.vsix
code --install-extension component-lens-0.1.0.vsix
```

`--no-dependencies` is right here because the extension has no runtime `dependencies`; if you add some, bundle with esbuild instead. `vsce` also wants a `README.md`, a `LICENSE` and a `repository` field in `package.json`, and a `.vscodeignore` that excludes `src/**`, `tsconfig.json` and `**/*.map`.

To publish to the Marketplace, create a publisher at https://marketplace.visualstudio.com/manage and authenticate. Global Azure DevOps Personal Access Tokens are retired on December 1, 2026, so use Microsoft Entra ID rather than a PAT:

```bash
az login
npx vsce publish --azure-credential
```
Until then `vsce login <publisher>` with a PAT that has the Marketplace "Manage" scope still works; read the token from `$VSCE_PAT` rather than typing it into scripts. Current steps are in the [publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## Real-World Example

Sam points the extension at the 200-component manifest the design-system build already produces. A developer types `<Button>` without `variant`, sees the red underline, and applies the "Add required prop" quick fix. Hovering any component shows its props, and the sidebar lists the components by category. Sam shares the `.vsix` through the team chat, and developers install it with `code --install-extension`, with no Marketplace account needed for an internal tool.

## Related Skills

- [typescript](https://terminalskills.io/skills/typescript): compiler options and strict typing for the extension code
