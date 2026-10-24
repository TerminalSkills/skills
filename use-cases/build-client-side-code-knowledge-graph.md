---
title: "Build a Client-Side Code Knowledge Graph"
slug: build-client-side-code-knowledge-graph
description: "Create a zero-server code intelligence tool that runs entirely in the browser — parse repos, build knowledge graphs, and query code with Graph RAG."
skills: [gitnexus, understand-chat]
category: development
difficulty: advanced
time_estimate: "12 hours"
tags: [code-analysis, knowledge-graph, browser, wasm, tree-sitter, d3, graph-rag, offline]
---

# Build a Client-Side Code Knowledge Graph

## The Problem

You just joined a team that owns a 500-file open source project. There are no docs and the original author left. You need to know what calls what, where the dependencies are and which files are the real entry points. Existing tools want a server, a language server or an IDE plugin. You want something that runs in a browser tab, keeps the code on your machine, and answers questions like "what happens when a user submits the form?" without reading every file.

[GitNexus](https://github.com/abhigyanpatwari/GitNexus) (PolyForm Noncommercial license) does this as a product: it indexes a repo locally into a knowledge graph, serves it to coding agents over MCP, and has a web UI (`gitnexus serve`) for exploring the index. That UI talks to a local backend, so it is not the zero-server design built below. This guide builds a minimal version of the same idea so you can see how it works and adapt it. If you only need the result, use the [gitnexus](/skills/gitnexus) skill, or the [understand-chat](/skills/understand-chat) skill for the Understand-Anything graph.

## The Solution

Parse source with Tree-sitter compiled to WebAssembly, extract functions, classes, methods, imports and calls into a graph, draw it with D3, and answer questions by retrieving the matching nodes plus their neighbours (Graph RAG) and passing them to a language model that runs in the browser through WebLLM. Nothing is uploaded.

## Step-by-Step Walkthrough

### Step 1: Set up and parse with Tree-sitter

Tested with web-tree-sitter 0.27.1 and the grammars from `@vscode/tree-sitter-wasm` 0.3.1. Pin both: a grammar built for an older runtime fails to load (the `tree-sitter-wasms` 0.1.x grammars do not load in 0.27).

```bash
npm create vite@latest graph-app -- --template vanilla-ts
cd graph-app || exit 1
npm install web-tree-sitter@0.27.1 @vscode/tree-sitter-wasm@0.3.1 d3 @mlc-ai/web-llm
npm install -D @types/d3
mkdir -p public/wasm
cp node_modules/web-tree-sitter/web-tree-sitter.wasm public/wasm/
for l in typescript tsx javascript; do cp node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter-$l.wasm public/wasm/; done
```

```typescript
// src/parse.ts — Tree-sitter (WASM) parsing in the browser
import { Parser, Language, type Node } from "web-tree-sitter";
export interface Symbol { kind: "function" | "class" | "method"; name: string; startLine: number; endLine: number; body: string; calls: string[] }
export interface ParsedFile { path: string; symbols: Symbol[]; imports: string[] }
let parser: Parser | undefined;
// baseUrl must serve web-tree-sitter.wasm and the three grammar files
export async function initParser(baseUrl = "/wasm/") {
  await Parser.init({ locateFile: (file: string) => baseUrl + file });
  parser = new Parser();
  const langs = {
    ts: await Language.load(`${baseUrl}tree-sitter-typescript.wasm`),
    tsx: await Language.load(`${baseUrl}tree-sitter-tsx.wasm`),
    js: await Language.load(`${baseUrl}tree-sitter-javascript.wasm`),
  };
  return (path: string) => (/\.tsx$/.test(path) ? langs.tsx : /\.[cm]?jsx?$/.test(path) ? langs.js : /\.[cm]?ts$/.test(path) ? langs.ts : null);
}
const calleeName = (call: Node): string | null => {
  const fn = call.childForFieldName("function");
  if (!fn) return null;
  if (fn.type === "identifier") return fn.text;
  if (fn.type === "member_expression") return fn.childForFieldName("property")?.text ?? null;
  return null;
};
export function parseFile(path: string, source: string, pick: (p: string) => Language | null): ParsedFile | null {
  const language = pick(path);
  if (!parser || !language) return null;
  parser.setLanguage(language);
  const tree = parser.parse(source);
  if (!tree) return null;
  const symbols: Symbol[] = [];
  const add = (kind: Symbol["kind"], name: string, node: Node) =>
    symbols.push({
      kind, name, startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1,
      body: node.text,
      calls: [...new Set(node.descendantsOfType("call_expression").map((c) => (c ? calleeName(c) : null)).filter((n): n is string => !!n))],
    });
  for (const n of tree.rootNode.descendantsOfType(["function_declaration", "class_declaration", "method_definition", "variable_declarator"])) {
    if (!n) continue;
    const name = n.childForFieldName("name")?.text;
    if (!name) continue;
    if (n.type === "variable_declarator") {
      const value = n.childForFieldName("value");
      if (value && (value.type === "arrow_function" || value.type === "function_expression")) add("function", name, n);
    } else add(n.type === "class_declaration" ? "class" : n.type === "method_definition" ? "method" : "function", name, n);
  }
  const imports = tree.rootNode.descendantsOfType("import_statement")
    .map((n) => n?.childForFieldName("source")?.text.slice(1, -1))
    .filter((s): s is string => !!s);
  tree.delete(); // WASM memory is not garbage collected
  return { path, symbols, imports };
}
```

### Step 2: Build the knowledge graph

Imports resolve only to files inside the project. Calls are matched by function name and only when the name is unique, so treat the `calls` edges as a hint, not as type-checked truth. Real tools resolve calls with language-specific rules.

```typescript
// src/graph.ts — knowledge graph: files and symbols as nodes, defines / imports / calls as edges
import type { ParsedFile } from "./parse.js";
export interface GNode { id: string; type: "file" | "function" | "class" | "method"; name: string; file: string; startLine?: number; body?: string }
export interface GEdge { source: string; target: string; type: "defines" | "imports" | "calls" }
export class CodeGraph {
  nodes = new Map<string, GNode>();
  edges: GEdge[] = [];
  constructor(files: ParsedFile[]) {
    const paths = new Set(files.map((f) => f.path));
    const byName = new Map<string, string[]>();
    for (const f of files) {
      this.nodes.set(f.path, { id: f.path, type: "file", name: f.path, file: f.path });
      for (const s of f.symbols) {
        const id = `${f.path}::${s.name}:${s.startLine}`;
        this.nodes.set(id, { id, type: s.kind, name: s.name, file: f.path, startLine: s.startLine, body: s.body });
        this.edges.push({ source: f.path, target: id, type: "defines" });
        byName.set(s.name, [...(byName.get(s.name) ?? []), id]);
      }
      for (const spec of f.imports) {
        const target = resolveImport(f.path, spec, paths);
        if (target) this.edges.push({ source: f.path, target, type: "imports" });
      }
    }
    // Calls are matched by name, and only when the name is unique in the project: a heuristic, not type resolution
    for (const f of files) for (const s of f.symbols) {
      const from = `${f.path}::${s.name}:${s.startLine}`;
      for (const c of s.calls) {
        const targets = byName.get(c);
        if (targets?.length === 1 && targets[0] !== from) this.edges.push({ source: from, target: targets[0], type: "calls" });
      }
    }
  }
  entryPoints() {
    const imported = new Set(this.edges.filter((e) => e.type === "imports").map((e) => e.target));
    return [...this.nodes.values()].filter((n) => n.type === "file" && !imported.has(n.id));
  }
  neighborhood(id: string, depth = 2) {
    const seen = new Set([id]);
    let frontier = [id];
    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const cur of frontier) for (const e of this.edges) {
        const other = e.source === cur ? e.target : e.target === cur ? e.source : null;
        if (other && !seen.has(other)) { seen.add(other); next.push(other); }
      }
      frontier = next;
    }
    return { nodes: [...seen].map((i) => ({ ...this.nodes.get(i)! })), edges: this.edges.filter((e) => seen.has(e.source) && seen.has(e.target)).map((e) => ({ ...e })) };
  }
}
// Relative imports only; "./x.js" may point at x.ts. Packages from node_modules are ignored.
function resolveImport(from: string, spec: string, paths: Set<string>): string | null {
  if (!spec.startsWith(".")) return null;
  const parts = from.split("/").slice(0, -1);
  for (const seg of spec.split("/")) { if (seg === "..") parts.pop(); else if (seg !== ".") parts.push(seg); }
  const base = parts.join("/").replace(/\.[cm]?jsx?$/, "");
  for (const cand of [base, ...[".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"].map((x) => base + x)]) if (paths.has(cand)) return cand;
  return null;
}
```

### Step 3: Visualize with D3

```typescript
// src/render.ts — D3 force-directed view of a (sub)graph
import * as d3 from "d3";
import type { GNode, GEdge } from "./graph.js";
type SimNode = GNode & d3.SimulationNodeDatum;
const colors: Record<string, string> = { file: "#4A90D9", function: "#50C878", class: "#FF6B6B", method: "#FFB347" };
export function renderGraph(container: HTMLElement, graph: { nodes: GNode[]; edges: GEdge[] }) {
  const { clientWidth: width, clientHeight: height } = container;
  container.replaceChildren();
  const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
  const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
  const ids = new Set(nodes.map((n) => n.id));
  const links = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e }));
  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink<SimNode, d3.SimulationLinkDatum<SimNode>>(links).id((d) => d.id).distance(80))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(width / 2, height / 2));
  const link = svg.append("g").selectAll("line").data(links).join("line")
    .attr("stroke", (d) => (d.type === "calls" ? "#c0392b" : "#999")).attr("stroke-opacity", 0.6);
  const node = svg.append("g").selectAll<SVGCircleElement, SimNode>("circle").data(nodes).join("circle")
    .attr("r", (d) => (d.type === "file" ? 8 : 5))
    .attr("fill", (d) => colors[d.type] ?? "#ccc")
    .call(d3.drag<SVGCircleElement, SimNode>()
      .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
  node.append("title").text((d) => `${d.type}: ${d.name}`);
  sim.on("tick", () => {
    link.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
    node.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
  });
  return () => sim.stop();
}
```

### Step 4: Graph RAG with an in-browser model

Retrieval scores nodes by keyword hits in names and bodies, then adds each hit's neighbours so the model sees callers, callees and the defining file. WebLLM runs the model on the GPU through WebGPU, so it needs a recent Chrome or Edge; the first question downloads the weights (several hundred MB to a few GB, depending on the model) and caches them. To use a hosted model instead, replace the `engine` call with a request to the provider's API using a key the user supplies, and say in the UI that code leaves the machine.

```typescript
// src/ask.ts — Graph RAG: keyword retrieval, graph expansion, then a local model in the browser (WebGPU)
import { CreateMLCEngine, type MLCEngine, type InitProgressReport } from "@mlc-ai/web-llm";
import type { CodeGraph } from "./graph.js";
const STOP = new Set(["the", "a", "an", "is", "are", "what", "how", "does", "do", "when", "user", "of", "to", "in", "and", "happens"]);
export function retrieve(graph: CodeGraph, question: string, top = 5) {
  const terms = question.toLowerCase().split(/\W+/).map((t) => t.replace(/s$/, "")).filter((t) => t.length > 2 && !STOP.has(t)); // crude plural stemming
  const scored = [...graph.nodes.values()].filter((n) => n.type !== "file").map((n) => {
    const name = n.name.toLowerCase(), body = (n.body ?? "").toLowerCase();
    return { n, score: terms.reduce((s, t) => s + (name.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0), 0) };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, top);
  const context = new Map<string, string>();
  for (const { n } of scored) for (const m of graph.neighborhood(n.id, 1).nodes)
    context.set(m.id, `[${m.type}] ${m.name} (${m.file}:${m.startLine ?? "?"})\n${(m.body ?? "").slice(0, 300)}`);
  return [...context.values()].join("\n---\n");
}
let engine: MLCEngine | undefined;
export async function ask(graph: CodeGraph, question: string, onProgress?: (text: string) => void) {
  // First call downloads the model weights (about 1-3 GB for the Qwen3 builds) and caches them in the browser.
  engine ??= await CreateMLCEngine("Qwen3-4B-q4f16_1-MLC", { initProgressCallback: (p: InitProgressReport) => onProgress?.(p.text) });
  const reply = await engine.chat.completions.create({
    extra_body: { enable_thinking: false }, // Qwen3 would otherwise print its <think> block first
    messages: [
      { role: "system", content: "Answer questions about code using only the graph context. Cite files and functions. If the context is not enough, say so." },
      { role: "user", content: `Graph context:\n${retrieve(graph, question)}\n\nQuestion: ${question}` },
    ],
  });
  return reply.choices[0].message.content ?? "";
}
```

### Step 5: Wire it together

Add `<input id="folder" type="file" webkitdirectory>`, `<div id="status">`, `<div id="view" style="height:60vh">`, `<input id="question">`, `<button id="ask">` and `<pre id="answer">` to `index.html`, then:

```typescript
// src/main.ts — pick a folder, parse it, draw it, ask about it
import { initParser, parseFile, type ParsedFile } from "./parse.js";
import { CodeGraph } from "./graph.js";
import { renderGraph } from "./render.js";
import { ask } from "./ask.js";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const SKIP = /(^|\/)(node_modules|dist|build|\.git)\//;
let graph: CodeGraph | undefined;
let stop: (() => void) | undefined;
$<HTMLInputElement>("folder").addEventListener("change", async (ev) => {
  const pick = await initParser("/wasm/");
  const parsed: ParsedFile[] = [];
  for (const f of Array.from((ev.target as HTMLInputElement).files ?? [])) {
    const path = f.webkitRelativePath.split("/").slice(1).join("/"); // drop the folder name
    if (SKIP.test(path) || f.size > 500_000) continue;
    const r = parseFile(path, await f.text(), pick);
    if (r) parsed.push(r);
  }
  graph = new CodeGraph(parsed);
  $("status").textContent = `${parsed.length} files, ${graph.nodes.size} nodes, ${graph.edges.length} edges. Entry points: ${graph.entryPoints().slice(0, 5).map((n) => n.id).join(", ")}`;
  stop?.();
  // Drawing every node of a large repo is unreadable: start from the entry points
  const start = graph.entryPoints()[0]?.id;
  if (start) stop = renderGraph($("view"), graph.neighborhood(start, 2));
});
$("ask").addEventListener("click", async () => {
  if (!graph) return;
  $("answer").textContent = await ask(graph, $<HTMLInputElement>("question").value, (t) => ($("answer").textContent = t));
});
```

Run `npm run dev` and pick a project folder. Parsing happens in the tab; closing it discards everything.

## Real-World Example

A new maintainer opens an unfamiliar React and Express repository in the tool. The graph shows two clusters, one for the frontend and one for the server, joined by a few files that import both. Clicking the entry point lists what it imports; the node with the most incoming `imports` edges is the shared API client. Asking "what happens when a user submits the form?" retrieves `handleSubmit`, the API client function it calls and the files that define them, and the model answers with those file names and line numbers. The answer is only as good as the retrieved context, so open the cited lines before you trust it.

## Limits

This version reads JavaScript and TypeScript only (add a grammar from `@vscode/tree-sitter-wasm` for other languages), name-based call edges miss dynamic dispatch, and browser memory bounds the repository size.

## Related Skills

- [gitnexus](/skills/gitnexus) — the full code-graph product, local indexing and an MCP server for coding agents
- [understand-chat](/skills/understand-chat) — questions answered from an Understand-Anything graph
