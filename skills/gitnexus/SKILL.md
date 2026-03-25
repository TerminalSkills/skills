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
  tags: [knowledge-graph, code-analysis, graph-rag, browser, client-side, visualization]
  use-cases:
    - "Build a browser-based code exploration tool from a GitHub repo URL"
    - "Create an interactive knowledge graph of any codebase without a server"
    - "Ask questions about code using Graph RAG in the browser"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# GitNexus

## Overview

Build client-side code knowledge graphs that run entirely in the browser — no server required. Parse code with tree-sitter WASM, construct a graph of files, functions, classes, and dependencies, visualize it with force-directed layouts, and query it with Graph RAG for natural-language code exploration.

## Architecture

```
[GitHub Repo URL]
       ↓
[Fetch via GitHub API / git clone to OPFS]
       ↓
[Tree-sitter WASM] → Parse AST per file
       ↓
[Graph Builder] → Nodes: files, functions, classes, imports
                → Edges: calls, imports, extends, implements
       ↓
[Force Graph Viz]     [Graph RAG Query]
  D3 / force-graph      Embed nodes → vector search → LLM answer
```

## Instructions

When a user asks to build a code knowledge graph, browser-based code explorer, or Graph RAG for code:

1. **Set up tree-sitter WASM** — Load language grammars for the target languages
2. **Parse the codebase** — Extract AST nodes (functions, classes, imports, exports)
3. **Build the graph** — Create nodes and edges representing code relationships
4. **Visualize** — Render with force-directed graph (D3 or force-graph library)
5. **Enable Graph RAG** — Embed graph nodes, allow natural-language queries

## Code Parsing with Tree-sitter WASM

```typescript
/**
 * Parse source files into AST nodes entirely in the browser.
 */
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
  const fileId = `file:${filePath}`;

  nodes.push({
    id: fileId,
    type: "file",
    name: filePath.split("/").pop()!,
    filePath,
    startLine: 0,
    endLine: tree.rootNode.endPosition.row,
    code: "",
  });

  function walk(node: Parser.SyntaxNode) {
    // Functions
    if (node.type === "function_declaration" || node.type === "arrow_function") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        nodes.push({
          id: `fn:${filePath}:${nameNode.text}`,
          type: "function",
          name: nameNode.text,
          filePath,
          startLine: node.startPosition.row,
          endLine: node.endPosition.row,
          code: node.text.slice(0, 500),
        });
      }
    }

    // Classes
    if (node.type === "class_declaration") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        nodes.push({
          id: `class:${filePath}:${nameNode.text}`,
          type: "class",
          name: nameNode.text,
          filePath,
          startLine: node.startPosition.row,
          endLine: node.endPosition.row,
          code: node.text.slice(0, 500),
        });
      }
    }

    // Import statements
    if (node.type === "import_statement") {
      const source = node.descendantsOfType("string")[0];
      if (source) {
        nodes.push({
          id: `import:${filePath}:${source.text}`,
          type: "import",
          name: source.text.replace(/['"]/g, ""),
          filePath,
          startLine: node.startPosition.row,
          endLine: node.endPosition.row,
          code: node.text,
        });
      }
    }

    for (const child of node.children) walk(child);
  }

  walk(tree.rootNode);
  return nodes;
}
```

## Graph Construction

```typescript
/**
 * Build a knowledge graph from parsed code nodes.
 */
interface CodeGraph {
  nodes: CodeNode[];
  edges: CodeEdge[];
}

function buildGraph(fileNodes: Map<string, CodeNode[]>): CodeGraph {
  const allNodes: CodeNode[] = [];
  const edges: CodeEdge[] = [];
  const functionIndex = new Map<string, string>(); // name → id

  // Collect all nodes and index functions
  for (const [filePath, nodes] of fileNodes) {
    allNodes.push(...nodes);
    for (const node of nodes) {
      if (node.type === "function" || node.type === "method") {
        functionIndex.set(node.name, node.id);
      }
    }
  }

  // Build edges
  for (const node of allNodes) {
    const fileId = `file:${node.filePath}`;

    // File contains function/class
    if (node.type !== "file") {
      edges.push({ source: fileId, target: node.id, type: "contains" });
    }

    // Import edges: file → imported file
    if (node.type === "import") {
      const targetFile = resolveImport(node.name, node.filePath);
      if (targetFile) {
        edges.push({ source: fileId, target: `file:${targetFile}`, type: "imports" });
      }
    }

    // Call edges: scan function body for references to other functions
    if (node.type === "function" || node.type === "method") {
      for (const [fnName, fnId] of functionIndex) {
        if (fnId !== node.id && node.code.includes(fnName + "(")) {
          edges.push({ source: node.id, target: fnId, type: "calls" });
        }
      }
    }
  }

  return { nodes: allNodes, edges };
}

function resolveImport(importPath: string, fromFile: string): string | null {
  // Simplified: resolve relative imports
  if (importPath.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1).join("/");
    return `${dir}/${importPath.replace(/^\.\//, "")}.ts`;
  }
  return null; // External package
}
```

## Visualization with Force-Graph

```typescript
/**
 * Render the knowledge graph with force-graph (WebGL-powered).
 */
import ForceGraph from "force-graph";

function renderGraph(container: HTMLElement, graph: CodeGraph) {
  const colorMap: Record<string, string> = {
    file: "#4a9eff",
    function: "#50c878",
    class: "#ff6b6b",
    method: "#ffa500",
    import: "#888888",
    export: "#dda0dd",
  };

  const fg = ForceGraph()(container)
    .graphData({
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        val: n.type === "file" ? 8 : n.type === "class" ? 5 : 3,
      })),
      links: graph.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
      })),
    })
    .nodeColor((node: any) => colorMap[node.type] || "#999")
    .nodeLabel((node: any) => `${node.type}: ${node.name}`)
    .linkDirectionalArrowLength(4)
    .linkColor((link: any) => (link.type === "calls" ? "#ff6b6b" : "#cccccc"))
    .onNodeClick((node: any) => {
      // Show code preview panel
      showCodePreview(node.id, graph);
    });

  return fg;
}

function showCodePreview(nodeId: string, graph: CodeGraph) {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const panel = document.getElementById("code-preview")!;
  panel.innerHTML = `
    <h3>${node.type}: ${node.name}</h3>
    <p>${node.filePath}:${node.startLine}-${node.endLine}</p>
    <pre><code>${escapeHtml(node.code)}</code></pre>
  `;
}
```

## Graph RAG (Query Code in Natural Language)

```typescript
/**
 * Graph RAG: embed graph nodes, search by similarity, answer with LLM.
 */

// Step 1: Embed graph nodes (run once after graph construction)
async function embedNodes(graph: CodeGraph): Promise<Map<string, number[]>> {
  const embeddings = new Map<string, number[]>();

  // Batch embed using a local model or API
  const texts = graph.nodes.map((n) =>
    `${n.type} "${n.name}" in ${n.filePath}: ${n.code.slice(0, 200)}`
  );

  // Using transformers.js for in-browser embedding
  const { pipeline } = await import("@xenova/transformers");
  const embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  for (let i = 0; i < texts.length; i++) {
    const result = await embedder(texts[i], { pooling: "mean", normalize: true });
    embeddings.set(graph.nodes[i].id, Array.from(result.data));
  }

  return embeddings;
}

// Step 2: Search for relevant nodes
function searchGraph(
  query: number[],
  embeddings: Map<string, number[]>,
  topK: number = 10
): string[] {
  const scores: Array<[string, number]> = [];
  for (const [id, emb] of embeddings) {
    const sim = cosineSimilarity(query, emb);
    scores.push([id, sim]);
  }
  scores.sort((a, b) => b[1] - a[1]);
  return scores.slice(0, topK).map(([id]) => id);
}

// Step 3: Expand with graph neighbors (the "Graph" in Graph RAG)
function expandWithNeighbors(nodeIds: string[], graph: CodeGraph, hops: number = 1): string[] {
  const expanded = new Set(nodeIds);
  for (let i = 0; i < hops; i++) {
    for (const edge of graph.edges) {
      if (expanded.has(edge.source)) expanded.add(edge.target);
      if (expanded.has(edge.target)) expanded.add(edge.source);
    }
  }
  return [...expanded];
}

// Step 4: Ask LLM with graph context
async function queryCode(question: string, graph: CodeGraph, embeddings: Map<string, number[]>) {
  const { pipeline } = await import("@xenova/transformers");
  const embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const qEmb = Array.from((await embedder(question, { pooling: "mean", normalize: true })).data);

  const relevantIds = searchGraph(qEmb, embeddings, 5);
  const expandedIds = expandWithNeighbors(relevantIds, graph, 1);
  const context = expandedIds
    .map((id) => graph.nodes.find((n) => n.id === id))
    .filter(Boolean)
    .map((n) => `[${n!.type}] ${n!.name} (${n!.filePath}:${n!.startLine})\n${n!.code.slice(0, 300)}`)
    .join("\n---\n");

  // Call LLM (use WebLLM for fully client-side, or API)
  const response = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [
        { role: "system", content: `Answer questions about code using this context:\n${context}` },
        { role: "user", content: question },
      ],
    }),
  });
  return response.json();
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
```

## Project Setup

```bash
# Vite + TypeScript project
npm create vite@latest code-nexus -- --template vanilla-ts
cd code-nexus
npm install web-tree-sitter force-graph @xenova/transformers
```

```html
<!-- index.html -->
<div id="graph" style="width: 100vw; height: 80vh;"></div>
<div id="code-preview" style="position: fixed; right: 0; top: 0; width: 400px;"></div>
<input id="query" placeholder="Ask about the code..." style="width: 100%;" />
```

## Best Practices

1. **Lazy-load grammars** — Only load tree-sitter WASM grammars for languages present in the repo
2. **OPFS for large repos** — Store cloned files in Origin Private File System for persistence
3. **Incremental parsing** — Re-parse only changed files, not the entire repo
4. **Limit graph size** — For repos with 1000+ files, allow filtering by directory or file type
5. **Web Workers** — Run parsing and embedding in Web Workers to keep the UI responsive
6. **Cache embeddings** — Store in IndexedDB so you don't re-embed on every page load

## Dependencies

```bash
npm install web-tree-sitter force-graph @xenova/transformers
```
