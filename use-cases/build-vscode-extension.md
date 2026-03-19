---
title: Build a VS Code Extension
slug: build-vscode-extension
description: Build a VS Code extension with custom commands, a sidebar TreeView, hover providers, diagnostics, code actions, and a WebviewPanel. Publish to the VS Code Marketplace with vsce.
skills:
  - typescript
  - vscode-api
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

Sam's team has a custom component library with 200+ components. Developers constantly look up component APIs in docs, mistype prop names, and forget required props. Sam wants a VS Code extension that shows component docs on hover, validates props, and lets teammates browse the component library in a sidebar — without leaving the editor.

## Step 1: Extension Manifest

```json
// package.json (extension manifest section)
{
  "name": "component-lens",
  "displayName": "ComponentLens",
  "description": "Inline docs, validation, and browser for your component library",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other", "Linters"],
  "activationEvents": ["onLanguage:typescriptreact", "onLanguage:javascriptreact"],
  "contributes": {
    "commands": [
      {
        "command": "componentLens.openBrowser",
        "title": "ComponentLens: Open Component Browser",
        "icon": "$(symbol-class)"
      },
      {
        "command": "componentLens.insertComponent",
        "title": "ComponentLens: Insert Component Snippet"
      }
    ],
    "menus": {
      "editor/context": [
        {
          "command": "componentLens.insertComponent",
          "when": "editorLangId == typescriptreact || editorLangId == javascriptreact",
          "group": "1_modification"
        }
      ],
      "view/title": [
        {
          "command": "componentLens.openBrowser",
          "when": "view == componentLens.browser",
          "group": "navigation"
        }
      ]
    },
    "views": {
      "explorer": [
        {
          "id": "componentLens.browser",
          "name": "Components",
          "icon": "$(symbol-class)"
        }
      ]
    },
    "configuration": {
      "title": "ComponentLens",
      "properties": {
        "componentLens.manifestPath": {
          "type": "string",
          "default": "./component-manifest.json",
          "description": "Path to component manifest file"
        }
      }
    }
  }
}
```

## Step 2: Extension Activation & Command Registration

```typescript
// src/extension.ts — Entry point
import * as vscode from "vscode";
import { ComponentBrowserProvider } from "./providers/ComponentBrowserProvider";
import { ComponentHoverProvider } from "./providers/ComponentHoverProvider";
import { ComponentDiagnosticProvider } from "./providers/ComponentDiagnosticProvider";
import { ComponentCodeActionProvider } from "./providers/ComponentCodeActionProvider";
import { loadManifest, ComponentManifest } from "./manifest";

export async function activate(context: vscode.ExtensionContext) {
  // Load component manifest
  const manifest = await loadManifest(vscode.workspace.getConfiguration("componentLens").get("manifestPath")!);

  // Register TreeView sidebar provider
  const browserProvider = new ComponentBrowserProvider(manifest, context);
  vscode.window.registerTreeDataProvider("componentLens.browser", browserProvider);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("componentLens.openBrowser", () => {
      vscode.commands.executeCommand("workbench.view.explorer");
    }),

    vscode.commands.registerCommand("componentLens.insertComponent", async () => {
      const item = await vscode.window.showQuickPick(
        manifest.components.map((c) => ({ label: c.name, description: c.description, detail: c.package })),
        { placeHolder: "Select a component to insert" }
      );
      if (!item) return;

      const component = manifest.components.find((c) => c.name === item.label)!;
      const snippet = buildSnippet(component);
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await editor.insertSnippet(new vscode.SnippetString(snippet));
      }
    }),

    // Open component docs in WebviewPanel when tree item is clicked
    vscode.commands.registerCommand("componentLens.viewDocs", (componentName: string) => {
      ComponentDocsPanel.createOrShow(context.extensionUri, manifest, componentName);
    })
  );

  // Hover provider for TSX/JSX
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [{ language: "typescriptreact" }, { language: "javascriptreact" }],
      new ComponentHoverProvider(manifest)
    )
  );

  // Diagnostics for prop validation
  const diagnosticCollection = vscode.languages.createDiagnosticCollection("componentLens");
  context.subscriptions.push(diagnosticCollection);

  const diagProvider = new ComponentDiagnosticProvider(manifest, diagnosticCollection);
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => diagProvider.validate(e.document)),
    vscode.workspace.onDidOpenTextDocument((doc) => diagProvider.validate(doc))
  );

  // Code actions (quick fixes)
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [{ language: "typescriptreact" }, { language: "javascriptreact" }],
      new ComponentCodeActionProvider(manifest),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );

  vscode.window.showInformationMessage(`ComponentLens: loaded ${manifest.components.length} components`);
}

export function deactivate() {}

function buildSnippet(component: any): string {
  const requiredProps = component.props
    .filter((p: any) => p.required)
    .map((p: any, i: number) => `${p.name}={\${${i + 1}:${p.defaultValue || p.type}}}`)
    .join(" ");

  return `<${component.name} ${requiredProps}>$0</${component.name}>`;
}
```

## Step 3: TreeView Sidebar Provider

```typescript
// src/providers/ComponentBrowserProvider.ts
import * as vscode from "vscode";
import { ComponentManifest } from "../manifest";

export class ComponentItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly componentName: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly kind: "category" | "component"
  ) {
    super(label, collapsibleState);
    if (kind === "component") {
      this.contextValue = "component";
      this.iconPath = new vscode.ThemeIcon("symbol-class");
      this.command = {
        command: "componentLens.viewDocs",
        title: "View Docs",
        arguments: [componentName],
      };
    } else {
      this.iconPath = new vscode.ThemeIcon("folder");
    }
  }
}

export class ComponentBrowserProvider implements vscode.TreeDataProvider<ComponentItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ComponentItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private manifest: ComponentManifest, private context: vscode.ExtensionContext) {}

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ComponentItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ComponentItem): ComponentItem[] {
    if (!element) {
      // Root: return categories
      const categories = [...new Set(this.manifest.components.map((c) => c.category))];
      return categories.map(
        (cat) => new ComponentItem(cat, cat, vscode.TreeItemCollapsibleState.Collapsed, "category")
      );
    }

    // Category expanded: return components
    return this.manifest.components
      .filter((c) => c.category === element.componentName)
      .map(
        (c) => new ComponentItem(c.name, c.name, vscode.TreeItemCollapsibleState.None, "component")
      );
  }
}
```

## Step 4: Hover Provider & Diagnostics

```typescript
// src/providers/ComponentHoverProvider.ts
import * as vscode from "vscode";
import { ComponentManifest } from "../manifest";

export class ComponentHoverProvider implements vscode.HoverProvider {
  constructor(private manifest: ComponentManifest) {}

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const range = document.getWordRangeAtPosition(position, /<[A-Z][A-Za-z0-9]*/);
    if (!range) return null;

    const word = document.getText(range).replace("<", "");
    const component = this.manifest.components.find((c) => c.name === word);
    if (!component) return null;

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown(`### ${component.name}\n`);
    md.appendMarkdown(`${component.description}\n\n`);
    md.appendMarkdown(`**Package:** \`${component.package}\`\n\n`);
    md.appendMarkdown(`**Props:**\n`);

    for (const prop of component.props) {
      md.appendMarkdown(`- \`${prop.name}\`${prop.required ? " *(required)*" : ""}: \`${prop.type}\` — ${prop.description}\n`);
    }

    md.appendMarkdown(`\n[View full docs](command:componentLens.viewDocs?${encodeURIComponent(JSON.stringify([component.name]))})`);
    return new vscode.Hover(md, range);
  }
}

// src/providers/ComponentDiagnosticProvider.ts
import * as vscode from "vscode";

export class ComponentDiagnosticProvider {
  constructor(private manifest: any, private collection: vscode.DiagnosticCollection) {}

  validate(document: vscode.TextDocument) {
    if (!["typescriptreact", "javascriptreact"].includes(document.languageId)) return;

    const text = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    for (const component of this.manifest.components) {
      const regex = new RegExp(`<${component.name}\\s([^>]*)>`, "g");
      let match;
      while ((match = regex.exec(text)) !== null) {
        const attrs = match[1];
        for (const prop of component.props.filter((p: any) => p.required)) {
          if (!attrs.includes(prop.name)) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const diag = new vscode.Diagnostic(
              new vscode.Range(startPos, endPos),
              `Missing required prop '${prop.name}' on <${component.name}>`,
              vscode.DiagnosticSeverity.Error
            );
            diag.code = `missing-prop:${component.name}:${prop.name}`;
            diagnostics.push(diag);
          }
        }
      }
    }

    this.collection.set(document.uri, diagnostics);
  }
}
```

## Step 5: WebviewPanel for Rich Docs UI

```typescript
// src/providers/ComponentDocsPanel.ts
import * as vscode from "vscode";

export class ComponentDocsPanel {
  private static currentPanel: ComponentDocsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;

  static createOrShow(extensionUri: vscode.Uri, manifest: any, componentName: string) {
    if (ComponentDocsPanel.currentPanel) {
      ComponentDocsPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      ComponentDocsPanel.currentPanel.update(manifest, componentName);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "componentDocs",
      `Docs: ${componentName}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    ComponentDocsPanel.currentPanel = new ComponentDocsPanel(panel, extensionUri, manifest, componentName);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, manifest: any, componentName: string) {
    this.panel = panel;
    this.update(manifest, componentName);
    panel.onDidDispose(() => { ComponentDocsPanel.currentPanel = undefined; });
  }

  update(manifest: any, componentName: string) {
    const component = manifest.components.find((c: any) => c.name === componentName);
    this.panel.title = `Docs: ${componentName}`;
    this.panel.webview.html = this.getHtml(component);
  }

  private getHtml(component: any): string {
    const propsRows = component.props
      .map((p: any) => `<tr><td><code>${p.name}</code></td><td>${p.required ? "✅" : ""}</td><td><code>${p.type}</code></td><td>${p.description}</td></tr>`)
      .join("");

    return `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family);padding:16px">
      <h1>${component.name}</h1>
      <p>${component.description}</p>
      <h2>Props</h2>
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
        <tr><th>Prop</th><th>Required</th><th>Type</th><th>Description</th></tr>
        ${propsRows}
      </table>
      <h2>Example</h2>
      <pre><code>${component.example}</code></pre>
    </body></html>`;
  }
}
```

## Step 6: Publish to Marketplace

```bash
# Install vsce
npm install -g @vscode/vsce

# Add publisher to package.json: "publisher": "your-publisher-id"

# Package locally for testing
vsce package
# → component-lens-0.1.0.vsix

# Install locally to test
code --install-extension component-lens-0.1.0.vsix

# Publish to VS Code Marketplace
# 1. Create account: https://marketplace.visualstudio.com/manage
# 2. Generate Personal Access Token in Azure DevOps
vsce login your-publisher-id
vsce publish
```

## Results

- **Prop errors caught at edit time** — diagnostics highlight missing required props inline; team catches issues before runtime
- **Hover docs eliminate context switching** — hover over any component to see its API; no more browser tabs to component docs
- **Component insertion in 3 keystrokes** — Cmd+Shift+P → Insert Component → pick from list; snippet fills required props with tab stops
- **Sidebar library browser** — all 200+ components browsable by category; click to open full docs panel
- **Team adoption: 100%** — shipped as a `.vsix` file to the team via Slack; zero setup required beyond install
