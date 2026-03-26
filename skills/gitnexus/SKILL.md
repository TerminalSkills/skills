---
name: gitnexus
description: >-
  Build client-side code knowledge graphs with built-in Graph RAG for code exploration.
  Use when: analyzing large codebases in the browser, building zero-server code intelligence
  tools, creating interactive code exploration UIs.
license: MIT
compatibility: "Browser, TypeScript"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: [knowledge-graph, code-analysis, graph-rag, browser, visualization]
  use-cases:
    - "Build a browser-based code exploration tool from a GitHub repo URL"
    - "Create an interactive knowledge graph of any codebase without a server"
    - "Ask questions about code using Graph RAG in the browser"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# GitNexus

## Overview

Build client-side code knowledge graphs that run entirely in the browser — no server required. Parse code with tree-sitter WASM, construct a graph of files, functions, classes, and dependencies, visualize it with force-directed layouts, and query it with Graph RAG for natural-language code exploration.

## Instructions

When a user asks to build a code knowledge graph, browser-based code explorer, or Graph RAG for code:

1. **Set up tree-sitter WASM** — Load language grammars for the target languages
2. **Parse the codebase** — Extract AST nodes (functions, classes, imports, exports)
3. **Build the graph** — Create nodes and edges representing code relationships
4. **Visualize** — Render with force-directed graph (D3 or force-graph library)
5. **Enable Graph RAG** — Embed graph nodes, allow natural-language queries

### Code Parsing with Tree-sitter WASM

```typescript
import Parser from "web-tree-sitter";

interface CodeNode {
  id: string;
  type: "file" | "function" | "class" | "method" | "import" | "export";
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
}

interface CodeEdge {
  source: string;
  target: string;
  type: "contains" | "calls" | "imports" | "extends" | "implements";
}

async function initParser(language: string): Promise<Parser> {
  await Parser.init();
  const parser = new Parser();
  const lang = await Parser.Language.load(`/tree-sitter-${language}.wasm`);
  parser.setLanguage(lang);
  return parser;
}

function extractNodes(tree: Parser.Tree, filePath: string): CodeNode[] {
  const nodes: CodeNode[] = [];
  nodes.push({ id: `file:${filePath}`, type: "file", name: filePath.split("/").pop()!, filePath, startLine: 0, endLine: tree.rootNode.endPosition.row, code: "" });

  function walk(node: Parser.SyntaxNode) {
    const nameNode = node.childForFieldName("name");
    if ((node.type === "function_declaration" || node.type === "arrow_function") && nameNode) {
      nodes.push({ id: `fn:${filePath}:${nameNode.text}`, type: "function", name: nameNode.text, filePath, startLine: node.startPosition.row, endLine: node.endPosition.row, code: node.text.slice(0, 500) });
    }
    if (node.type === "class_declaration" && nameNode) {
      nodes.push({ id: `class:${filePath}:${nameNode.text}`, type: "class", name: nameNode.text, filePath, startLine: node.startPosition.row, endLine: node.endPosition.row, code: node.text.slice(0, 500) });
    }
    if (node.type === "import_statement") {
      const source = node.descendantsOfType("string")[0];
      if (source) nodes.push({ id: `import:${filePath}:${source.text}`, type: "import", name: source.text.replace(/['"]/g, ""), filePath, startLine: node.startPosition.row, endLine: node.endPosition.row, code: node.text });
    }
    for (const child of node.children) walk(child);
  }
  walk(tree.rootNode);
  return nodes;
}
```

### Graph Construction

```typescript
function buildGraph(fileNodes: Map<string, CodeNode[]>): { nodes: CodeNode[]; edges: CodeEdge[] } {
  const allNodes: CodeNode[] = [];
  const edges: CodeEdge[] = [];
  const functionIndex = new Map<string, string>();

  for (const [, nodes] of fileNodes) {
    allNodes.push(...nodes);
    for (const node of nodes) {
      if (node.type === "function" || node.type === "method") functionIndex.set(node.name, node.id);
    }
  }

  for (const node of allNodes) {
    const fileId = `file:${node.filePath}`;
    if (node.type !== "file") edges.push({ source: fileId, target: node.id, type: "contains" });
    if (node.type === "import") {
      const targetFile = resolveImport(node.name, node.filePath);
      if (targetFile) edges.push({ source: fileId, target: `file:${targetFile}`, type: "imports" });
    }
    if (node.type === "function" || node.type === "method") {
      for (const [fnName, fnId] of functionIndex) {
        if (fnId !== node.id && node.code.includes(fnName + "(")) edges.push({ source: node.id, target: fnId, type: "calls" });
      }
    }
  }
  return { nodes: allNodes, edges };
}

function resolveImport(importPath: string, fromFile: string): string | null {
  if (importPath.startsWith(".")) {
    return `${fromFile.split("/").slice(0, -1).join("/")}/${importPath.replace(/^\.\//, "")}.ts`;
  }
  return null;
}
```

### Visualization with Force-Graph

```typescript
import ForceGraph from "force-graph";

function renderGraph(container: HTMLElement, graph: { nodes: CodeNode[]; edges: CodeEdge[] }) {
  const colorMap: Record<string, string> = { file: "#4a9eff", function: "#50c878", class: "#ff6b6b", method: "#ffa500", import: "#888888", export: "#dda0dd" };
  ForceGraph()(container)
    .graphData({
      nodes: graph.nodes.map((n) => ({ id: n.id, name: n.name, type: n.type, val: n.type === "file" ? 8 : n.type === "class" ? 5 : 3 })),
      links: graph.edges.map((e) => ({ source: e.source, target: e.target, type: e.type })),
    })
    .nodeColor((node: any) => colorMap[node.type] || "#999")
    .nodeLabel((node: any) => `${node.type}: ${node.name}`)
    .linkDirectionalArrowLength(4);
}
```

### Graph RAG Query

```typescript
import { pipeline } from "@xenova/transformers";

async function embedNodes(graph: { nodes: CodeNode[] }): Promise<Map<string, number[]>> {
  const embeddings = new Map<string, number[]>();
  const embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  for (const node of graph.nodes) {
    const text = `${node.type} "${node.name}" in ${node.filePath}: ${node.code.slice(0, 200)}`;
    const result = await embedder(text, { pooling: "mean", normalize: true });
    embeddings.set(node.id, Array.from(result.data));
  }
  return embeddings;
}

function searchGraph(query: number[], embeddings: Map<string, number[]>, topK = 10): string[] {
  const scores: [string, number][] = [];
  for (const [id, emb] of embeddings) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < query.length; i++) { dot += query[i] * emb[i]; magA += query[i] ** 2; magB += emb[i] ** 2; }
    scores.push([id, dot / (Math.sqrt(magA) * Math.sqrt(magB))]);
  }
  return scores.sort((a, b) => b[1] - a[1]).slice(0, topK).map(([id]) => id);
}
```

## Examples

### Example 1: Build a Browser-Based Code Explorer for a React Project

```bash
npm create vite@latest code-nexus -- --template vanilla-ts
cd code-nexus
npm install web-tree-sitter force-graph @xenova/transformers
```

```typescript
// main.ts — Parse a GitHub repo and render its knowledge graph
const parser = await initParser("typescript");
const files = await fetchRepoFiles("facebook/react", "packages/react/src");
const fileNodes = new Map<string, CodeNode[]>();
for (const file of files) {
  const tree = parser.parse(file.content);
  fileNodes.set(file.path, extractNodes(tree, file.path));
}
const graph = buildGraph(fileNodes);
renderGraph(document.getElementById("graph")!, graph);
// Result: interactive force-directed graph showing React's internal module structure
```

### Example 2: Natural-Language Code Query with Graph RAG

```typescript
// After building the graph, embed all nodes and query
const graph = buildGraph(fileNodes);
const embeddings = await embedNodes(graph);

// User asks a question about the codebase
const embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
const qEmb = Array.from((await embedder("How does the authentication middleware work?", { pooling: "mean", normalize: true })).data);
const relevantIds = searchGraph(qEmb, embeddings, 5);
const context = relevantIds
  .map((id) => graph.nodes.find((n) => n.id === id))
  .filter(Boolean)
  .map((n) => `[${n!.type}] ${n!.name} (${n!.filePath})\n${n!.code.slice(0, 300)}`)
  .join("\n---\n");

// Pass context to LLM for a grounded answer about the codebase
const response = await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({ messages: [
    { role: "system", content: `Answer using this code context:\n${context}` },
    { role: "user", content: "How does the authentication middleware work?" },
  ]}),
});
```

## Guidelines

1. **Lazy-load grammars** — Only load tree-sitter WASM grammars for languages present in the repo
2. **OPFS for large repos** — Store cloned files in Origin Private File System for persistence
3. **Incremental parsing** — Re-parse only changed files, not the entire repo
4. **Limit graph size** — For repos with 1000+ files, allow filtering by directory or file type
5. **Web Workers** — Run parsing and embedding in Web Workers to keep the UI responsive
6. **Cache embeddings** — Store in IndexedDB so you don't re-embed on every page load
