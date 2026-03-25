---
title: "Build a Client-Side Code Knowledge Graph"
description: "Create a zero-server code intelligence tool that runs entirely in the browser — parse repos, build knowledge graphs, and query code with Graph RAG."
skills: [gitnexus, understand-chat]
difficulty: advanced
time_estimate: "12 hours"
tags: [code-analysis, knowledge-graph, browser, wasm, tree-sitter, d3, graph-rag, offline]
---

# Build a Client-Side Code Knowledge Graph

## Persona

You just joined a team that owns a 500-file open source project. No docs. The original author left. You need to understand the codebase **fast** — what calls what, where the dependencies are, which files are the real entry points. You want a tool that runs in your browser, works offline, and lets you ask questions like "what happens when a user clicks submit?"

Inspired by [GitNexus](https://github.com/gitnexus/gitnexus) (19k+ stars) — client-side code intelligence with zero server dependencies.

## Architecture

```
ZIP/Repo Upload (browser)
        ↓
  Tree-sitter WASM Parser
        ↓
  AST Extraction (functions, classes, imports)
        ↓
  Knowledge Graph (nodes + edges)
        ↓
  ┌─────────────┬──────────────────┐
  │ D3 Force    │  Graph RAG       │
  │ Visualization│  (ask questions) │
  └─────────────┴──────────────────┘
```

## Step 1: Parse Code in the Browser with Tree-sitter WASM

```javascript
import Parser from "web-tree-sitter";

async function initParser(language) {
  await Parser.init();
  const parser = new Parser();
  const lang = await Parser.Language.load(`/tree-sitter-${language}.wasm`);
  parser.setLanguage(lang);
  return parser;
}

function extractSymbols(tree, sourceCode) {
  const symbols = [];
  const cursor = tree.walk();

  function visit() {
    const node = cursor.currentNode;
    if (["function_declaration", "function_definition", "method_definition",
         "class_declaration", "arrow_function"].includes(node.type)) {
      const nameNode = node.childForFieldName("name");
      symbols.push({
        type: node.type.replace("_declaration", "").replace("_definition", ""),
        name: nameNode?.text || "<anonymous>",
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        body: sourceCode.slice(node.startIndex, node.endIndex),
      });
    }
    if (cursor.gotoFirstChild()) {
      do { visit(); } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  }
  visit();
  return symbols;
}

function extractImports(tree) {
  const imports = [];
  const cursor = tree.walk();
  function visit() {
    const node = cursor.currentNode;
    if (node.type === "import_statement" || node.type === "import_declaration") {
      const source = node.descendantsOfType("string")[0];
      if (source) imports.push(source.text.replace(/['"]/g, ""));
    }
    if (cursor.gotoFirstChild()) {
      do { visit(); } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  }
  visit();
  return imports;
}
```

## Step 2: Build the Knowledge Graph

```javascript
class CodeGraph {
  constructor() {
    this.nodes = new Map(); // id -> {type, name, file, metadata}
    this.edges = [];        // {source, target, type}
  }

  addFile(filePath, symbols, imports) {
    // File node
    this.nodes.set(filePath, { type: "file", name: filePath, file: filePath });

    // Symbol nodes
    for (const sym of symbols) {
      const id = `${filePath}::${sym.name}`;
      this.nodes.set(id, { type: sym.type, name: sym.name, file: filePath, ...sym });
      this.edges.push({ source: filePath, target: id, type: "defines" });
    }

    // Import edges
    for (const imp of imports) {
      const resolved = resolveImport(filePath, imp);
      this.edges.push({ source: filePath, target: resolved, type: "imports" });
    }
  }

  // Find what depends on a given file
  dependentsOf(filePath) {
    return this.edges
      .filter(e => e.target === filePath && e.type === "imports")
      .map(e => e.source);
  }

  // Find entry points (files nothing imports)
  findEntryPoints() {
    const imported = new Set(this.edges.filter(e => e.type === "imports").map(e => e.target));
    return [...this.nodes.values()]
      .filter(n => n.type === "file" && !imported.has(n.name));
  }

  // Subgraph around a node (for focused visualization)
  neighborhood(nodeId, depth = 2) {
    const visited = new Set([nodeId]);
    let frontier = [nodeId];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const id of frontier) {
        for (const edge of this.edges) {
          const neighbor = edge.source === id ? edge.target : edge.target === id ? edge.source : null;
          if (neighbor && !visited.has(neighbor)) {
            visited.add(neighbor);
            next.push(neighbor);
          }
        }
      }
      frontier = next;
    }
    return {
      nodes: [...visited].map(id => this.nodes.get(id)).filter(Boolean),
      edges: this.edges.filter(e => visited.has(e.source) && visited.has(e.target))
    };
  }
}
```

## Step 3: Visualize with D3 Force-Directed Graph

```javascript
import * as d3 from "d3";

function renderGraph(container, graph) {
  const width = container.clientWidth, height = container.clientHeight;
  const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);

  const colorMap = { file: "#4A90D9", function: "#50C878", class: "#FF6B6B", method: "#FFB347" };

  const sim = d3.forceSimulation(graph.nodes)
    .force("link", d3.forceLink(graph.edges).id(d => d.id).distance(80))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(width / 2, height / 2));

  const link = svg.selectAll("line").data(graph.edges).join("line")
    .attr("stroke", "#999").attr("stroke-opacity", 0.6);

  const node = svg.selectAll("circle").data(graph.nodes).join("circle")
    .attr("r", d => d.type === "file" ? 8 : 5)
    .attr("fill", d => colorMap[d.type] || "#ccc")
    .call(d3.drag().on("start", dragStart).on("drag", dragged).on("end", dragEnd));

  node.append("title").text(d => `${d.type}: ${d.name}`);

  sim.on("tick", () => {
    link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    node.attr("cx", d => d.x).attr("cy", d => d.y);
  });
}
```

## Step 4: Graph RAG — Ask Questions About Code

```javascript
async function queryCode(graph, question) {
  // Find relevant nodes via keyword matching
  const keywords = question.toLowerCase().split(/\s+/);
  const relevant = [...graph.nodes.values()].filter(n =>
    keywords.some(k => n.name.toLowerCase().includes(k) ||
                       (n.body && n.body.toLowerCase().includes(k)))
  );

  // Expand to neighborhood for context
  const contextNodes = new Set();
  for (const node of relevant.slice(0, 5)) {
    const hood = graph.neighborhood(`${node.file}::${node.name}`, 1);
    hood.nodes.forEach(n => contextNodes.add(n));
  }

  const context = [...contextNodes].map(n =>
    `[${n.type}] ${n.name} (${n.file}:${n.startLine || "?"})\n${(n.body || "").slice(0, 300)}`
  ).join("\n---\n");

  // Query AI with graph context (use any API — or run locally with WebLLM)
  const response = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [
        { role: "system", content: "Answer questions about code using the provided graph context. Reference specific files and functions." },
        { role: "user", content: `Graph context:\n${context}\n\nQuestion: ${question}` }
      ]
    })
  });
  return response.json();
}
```

## What You'll Learn

- Browser-based code parsing with Tree-sitter WASM
- Building and querying knowledge graphs in JavaScript
- D3 force-directed graph visualization
- Graph RAG: combining graph structure with LLM queries
- Zero-server architecture — everything runs client-side
- Understanding large codebases through structural analysis
