---
title: Build a Spreadsheet Formula Engine
slug: build-spreadsheet-formula-engine
description: Build a spreadsheet formula engine in TypeScript with a real parser, cell references and ranges, built-in functions, dependency tracking, circular reference detection, and incremental recalculation.
skills:
  - typescript
category: development
tags:
  - spreadsheet
  - formulas
  - calculation
  - engine
  - expressions
---

# Build a Spreadsheet Formula Engine

## The Problem

Tomas leads product at a 20-person fintech building a budgeting tool. Users need spreadsheet-like calculations: `=SUM(B2:B10)`, `=IF(A1>100, "Over budget", "OK")`. A full spreadsheet component is far more than they need and does not fit their data model. They want a small engine of their own: parse Excel-style expressions, resolve cell references, compute results, detect circular references, and recalculate only what a change affects.

The tempting first version is a pile of regular expressions: match `^NAME\((.*)\)$` for functions, split on `+` for arithmetic. It breaks on the first real formula. `=SUM(A1)+SUM(B1)` matches the function pattern as one call with the argument `A1)+SUM(B1`, operators inside string literals get split, and `10-2-3` comes out as 11 when you split from the wrong side. A tokenizer plus a precedence-based parser avoids all of these.

## The Solution

The engine has four parts, all in one dependency-free TypeScript file (the `typescript` skill covers the strict compiler settings used here):

1. A **tokenizer** that turns the formula into numbers, strings, identifiers and operators.
2. A **parser** that builds an AST using Excel's precedence (comparison, `&`, `+ -`, `* /`, `^`, unary minus) with left associativity.
3. An **evaluator** that returns values or typed errors (`#DIV/0!`, `#NAME?`, `#VALUE!`, `#CYCLE!`, `#ERROR!`) and evaluates only the taken branch of `IF`.
4. A **sheet** that records dependencies from the AST (never from the formula text), finds the cells affected by an edit, orders them topologically, and marks cells that are stuck in a cycle.

## Step-by-Step Walkthrough

### Step 1: Write the engine

```typescript
// src/spreadsheet/engine.ts — tokenizer, recursive-descent parser, dependency graph, recalculation
export type Value = string | number | boolean | null;
export type Err = { error: "#DIV/0!" | "#NAME?" | "#REF!" | "#CYCLE!" | "#VALUE!" | "#ERROR!" };
export type Result = Value | Err;
const isErr = (v: unknown): v is Err => typeof v === "object" && v !== null && "error" in v;

// ---- Tokenizer -------------------------------------------------------------
type Tok = { t: "num" | "str" | "id" | "op"; v: string };
function tokenize(src: string): Tok[] {
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?)|"((?:[^"]|"")*)"|([A-Za-z_][A-Za-z0-9_.]*|\$?[A-Za-z]+\$?\d+)|(<=|>=|<>|[-+*/^&=<>(),:]))/gy;
  const out: Tok[] = [];
  let m: RegExpExecArray | null;
  let end = 0;
  while (end < src.trimEnd().length && (m = re.exec(src))) {
    end = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: "num", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "str", v: m[2].replace(/""/g, '"') });
    else if (m[3] !== undefined) out.push({ t: "id", v: m[3].replace(/\$/g, "").toUpperCase() });
    else out.push({ t: "op", v: m[4] });
  }
  if (end < src.trimEnd().length) throw new SyntaxError(`Unexpected character at ${end}`);
  return out;
}

// ---- AST -------------------------------------------------------------------
export type Node =
  | { k: "lit"; v: Value }
  | { k: "ref"; ref: string }
  | { k: "range"; from: string; to: string }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

// Precedence (low → high), as in Excel: comparison < & < + - < * / < ^ < unary minus
const BIN: Record<string, number> = { "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "&": 2, "+": 3, "-": 3, "*": 4, "/": 4, "^": 5 };
const CELL = /^[A-Z]{1,3}[1-9]\d*$/;

export function parse(formula: string): Node {
  const toks = tokenize(formula.startsWith("=") ? formula.slice(1) : formula);
  let i = 0;
  const peek = () => toks[i];
  const eat = (v?: string) => {
    const t = toks[i++];
    if (!t || (v && t.v !== v)) throw new SyntaxError(`Expected ${v ?? "token"}`);
    return t;
  };
  function expr(min: number): Node {
    let left = unary();
    for (;;) {
      const t = peek();
      const p = t?.t === "op" ? BIN[t.v] : undefined;
      if (p === undefined || p < min) return left;
      i++;
      // ^ is left-associative in Excel, so every operator parses its right side at p + 1
      left = { k: "bin", op: t.v, a: left, b: expr(p + 1) };
    }
  }
  function unary(): Node {
    const t = peek();
    if (t?.t === "op" && (t.v === "-" || t.v === "+")) { i++; return { k: "un", op: t.v, a: unary() }; }
    return primary();
  }
  function primary(): Node {
    const t = eat();
    if (t.t === "num") return { k: "lit", v: Number(t.v) };
    if (t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "op" && t.v === "(") { const e = expr(1); eat(")"); return e; }
    if (t.t === "id") {
      if (peek()?.v === "(") {
        i++;
        const args: Node[] = [];
        if (peek()?.v !== ")") { do args.push(expr(1)); while (peek()?.v === "," && i++); }
        eat(")");
        return { k: "call", fn: t.v, args };
      }
      if (t.v === "TRUE" || t.v === "FALSE") return { k: "lit", v: t.v === "TRUE" };
      if (CELL.test(t.v)) {
        if (peek()?.v === ":") { i++; const e = eat(); if (!CELL.test(e.v)) throw new SyntaxError("Bad range"); return { k: "range", from: t.v, to: e.v }; }
        return { k: "ref", ref: t.v };
      }
    }
    throw new SyntaxError(`Unexpected ${t.v}`);
  }
  const ast = expr(1);
  if (i < toks.length) throw new SyntaxError(`Unexpected ${toks[i].v}`);
  return ast;
}

// ---- Cell addresses (A..ZZZ, 1-based rows) ---------------------------------
export function colToNum(col: string): number { return [...col].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0); }
export function numToCol(n: number): string { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; }
export function splitRef(ref: string) { const m = /^([A-Z]+)(\d+)$/.exec(ref)!; return { col: colToNum(m[1]), row: Number(m[2]) }; }
export function expandRange(from: string, to: string): string[] {
  const a = splitRef(from), b = splitRef(to), out: string[] = [];
  for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++)
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) out.push(numToCol(c) + r);
  return out;
}

// ---- Dependencies come from the AST, never from regexes over the text ------
export function dependencies(node: Node, out = new Set<string>()): Set<string> {
  if (node.k === "ref") out.add(node.ref);
  else if (node.k === "range") expandRange(node.from, node.to).forEach((r) => out.add(r));
  else if (node.k === "un") dependencies(node.a, out);
  else if (node.k === "bin") { dependencies(node.a, out); dependencies(node.b, out); }
  else if (node.k === "call") node.args.forEach((a) => dependencies(a, out));
  return out;
}

// ---- Evaluation ------------------------------------------------------------
const nums = (vs: unknown[]) => vs.flat(Infinity).filter((v): v is number => typeof v === "number");
const FN: Record<string, (...a: any[]) => any> = {
  SUM: (...a) => nums(a).reduce((x, y) => x + y, 0),
  AVERAGE: (...a) => { const n = nums(a); return n.length ? n.reduce((x, y) => x + y, 0) / n.length : { error: "#DIV/0!" }; },
  MIN: (...a) => Math.min(...nums(a), ...(nums(a).length ? [] : [0])),
  MAX: (...a) => Math.max(...nums(a), ...(nums(a).length ? [] : [0])),
  AND: (...a) => a.flat(Infinity).every(Boolean),
  OR: (...a) => a.flat(Infinity).some(Boolean),
  ROUND: (v, d = 0) => { const x = Math.abs(Number(v)), k = Number(d); return Math.sign(Number(v)) * Number(Math.round(Number(`${x}e${k}`)) + `e${-k}`); }, // half away from zero on the decimal digits, so 1.005 -> 1.01 as in Excel
  UPPER: (s) => String(s ?? "").toUpperCase(),
};

export type Lookup = (ref: string) => Result;
export function evalNode(n: Node, get: Lookup): Result | Result[] {
  switch (n.k) {
    case "lit": return n.v;
    case "ref": return get(n.ref);
    case "range": return expandRange(n.from, n.to).map(get);
    case "un": { const v = evalNode(n.a, get); if (isErr(v)) return v; return n.op === "-" ? -Number(v) : Number(v); }
    case "bin": {
      const a = evalNode(n.a, get), b = evalNode(n.b, get);
      if (isErr(a)) return a;
      if (isErr(b)) return b;
      if (Array.isArray(a) || Array.isArray(b)) return { error: "#VALUE!" };
      switch (n.op) {
        case "&": return `${a ?? ""}${b ?? ""}`;
        case "=": return a === b;
        case "<>": return a !== b;
        case "<": return (a as any) < (b as any);
        case ">": return (a as any) > (b as any);
        case "<=": return (a as any) <= (b as any);
        case ">=": return (a as any) >= (b as any);
      }
      const x = Number(a ?? 0), y = Number(b ?? 0);
      if (Number.isNaN(x) || Number.isNaN(y)) return { error: "#VALUE!" };
      if (n.op === "+") return x + y;
      if (n.op === "-") return x - y;
      if (n.op === "*") return x * y;
      if (n.op === "^") return x ** y;
      return y === 0 ? { error: "#DIV/0!" } : x / y;
    }
    case "call": {
      if (n.fn === "IF") {
        const c = evalNode(n.args[0], get);
        if (isErr(c)) return c;
        return n.args[c ? 1 : 2] ? evalNode(n.args[c ? 1 : 2], get) : !!c;
      }
      if (n.fn === "IFERROR") { const v = evalNode(n.args[0], get); return isErr(v) ? evalNode(n.args[1], get) : v; }
      const fn = FN[n.fn];
      if (!fn) return { error: "#NAME?" };
      const args = n.args.map((a) => evalNode(a, get));
      const bad = args.flat(Infinity).find(isErr);
      return bad ? (bad as Err) : fn(...args);
    }
  }
}

// ---- Sheet: graph, cycle detection, recalculation ---------------------------
export class Sheet {
  private raw = new Map<string, string>();
  private ast = new Map<string, Node>();
  private deps = new Map<string, Set<string>>();       // cell -> cells it reads
  private dependents = new Map<string, Set<string>>(); // cell -> cells that read it
  private values = new Map<string, Result>();

  get(ref: string): Result { return this.values.get(ref) ?? null; }

  /** Set a cell and return every cell whose value changed, in dependency order. */
  set(ref: string, input: string): Map<string, Result> {
    for (const d of this.deps.get(ref) ?? []) this.dependents.get(d)?.delete(ref);
    this.raw.set(ref, input); this.ast.delete(ref); this.deps.delete(ref);
    if (input.startsWith("=")) {
      try {
        const ast = parse(input);
        this.ast.set(ref, ast);
        const d = dependencies(ast);
        this.deps.set(ref, d);
        for (const x of d) (this.dependents.get(x) ?? this.dependents.set(x, new Set()).get(x)!).add(ref);
      } catch { /* syntax error: no AST, recalc reports #ERROR! */ }
    }
    return this.recalc(ref);
  }

  private recalc(start: string): Map<string, Result> {
    // 1. cells reachable from `start` through dependents
    const reach = new Set<string>(); const stack = [start];
    while (stack.length) { const r = stack.pop()!; if (reach.has(r)) continue; reach.add(r); stack.push(...(this.dependents.get(r) ?? [])); }
    // 2. Kahn's algorithm over that subgraph: cells left over are in (or behind) a cycle
    const indeg = new Map<string, number>();
    for (const r of reach) indeg.set(r, [...(this.deps.get(r) ?? [])].filter((d) => reach.has(d)).length);
    const queue = [...reach].filter((r) => indeg.get(r) === 0), order: string[] = [];
    while (queue.length) {
      const r = queue.shift()!; order.push(r);
      for (const d of this.dependents.get(r) ?? []) { indeg.set(d, indeg.get(d)! - 1); if (indeg.get(d) === 0) queue.push(d); }
    }
    const done = new Set(order), out = new Map<string, Result>();
    for (const r of reach) if (!done.has(r)) { this.values.set(r, { error: "#CYCLE!" }); out.set(r, { error: "#CYCLE!" }); }
    for (const r of order) {
      const ast = this.ast.get(r);
      const text = this.raw.get(r) ?? "";
      const v: Result = ast ? (evalNode(ast, (x) => this.get(x)) as Result) : text.startsWith("=") ? { error: "#ERROR!" } : this.literal(text);
      this.values.set(r, v);
      out.set(r, v);
    }
    return out;
  }
  private literal(s: string): Value {
    if (s === "") return null;
    if (!Number.isNaN(Number(s))) return Number(s);
    if (/^(true|false)$/i.test(s)) return s.toLowerCase() === "true";
    return s;
  }
}
```

### Step 2: Use it

```typescript
import { Sheet } from "./engine.ts";

const sheet = new Sheet();
sheet.set("B2", "10");
sheet.set("B3", "20");
sheet.set("A1", "=SUM(B2:B3)+SUM(B2:B3)");
sheet.set("A2", '=IF(A1>100,"Over budget","OK")');
console.log(sheet.get("A1"), sheet.get("A2")); // 60 "OK"

// set() returns every cell that was recomputed, already in dependency order
const changed = sheet.set("B2", "50"); // A1 -> 140, A2 -> "Over budget"

sheet.set("C1", "=C2");
sheet.set("C2", "=C1"); // both cells become { error: "#CYCLE!" } instead of looping
```

These cases fail with the regex approach and pass here: `=10-2-3` is `5`; `=2^3^2` is `64` and `=-2^2` is `4` (both as in Excel); `=IF(1=1,"x=y, (z)","n")` keeps its string; `=1/0` is `#DIV/0!`, and `=IFERROR(A6,0)` turns it into `0`; `=FOO(1)` is `#NAME?`; `=1+` is `#ERROR!`. Wire `set()` to the UI: send the raw input, render the returned map. The engine does no I/O, so it runs in the browser or on a server.

### Step 3: Add domain functions

Add entries to the `FN` table, e.g. `BUDGET_REMAINING(category)` reading your own data. Identifiers may contain underscores, so the parser needs no change. A function that must not evaluate every argument (like `IF`) belongs in the evaluator's `call` case.

## Real-World Example

Tomas's team runs the engine over a hundred formulas copied from their users' spreadsheets and logs each one it rejects. Most are missing functions (`VLOOKUP`, `SUMIF`, date functions), added to `FN` one by one.

For performance they build a chain of 2,000 cells where each is `=previous+1` and edit the first. The engine recomputes all 2,000 dependents in a few milliseconds on a laptop (3 ms in one local run), because only the cells reachable from the edit are visited, once each.

Limits to know before shipping: no sheet-qualified references (`Sheet2!A1`), array formulas, percent literals or date serials; columns run `A` to `ZZZ`; mixed text/number comparison uses JavaScript ordering, not Excel's.

## Related Skills

- [typescript](../skills/typescript/SKILL.md) -- strict compiler settings and type narrowing used for the AST and the error type
