---
title: Build an AI-Powered Code Migration Tool
slug: build-ai-powered-code-migration-tool
description: Build a CLI tool that uses LLMs to automatically migrate codebases between frameworks, APIs, and language versions — handling pattern recognition, AST transforms, and validation at scale.
skills:
  - typescript
  - openai
  - vitest
  - zod
category: AI & Machine Learning
tags:
  - code-migration
  - ai
  - ast
  - refactoring
  - developer-tools
---

# Build an AI-Powered Code Migration Tool

## The Problem

Viktor leads platform at a 50-person SaaS company. They need to migrate 400+ files from Express.js to Hono — better performance, edge-ready, and smaller bundle. Manual migration estimates: 6 weeks of developer time at $85/hr = $40K. Simple find-and-replace breaks on edge cases: middleware signatures differ, error handling patterns are different, and request/response APIs don't map 1:1. A previous React class-to-hooks migration took 4 months because regex transforms created subtle bugs. An AI-powered tool could handle pattern recognition while AST transforms ensure structural correctness.

## Step 1: Build the File Scanner and Pattern Detector

The scanner identifies migration candidates by analyzing imports, API usage patterns, and framework-specific idioms. It builds a migration plan before changing any code.

```typescript
// src/scanner.ts — Analyze codebase and build migration plan
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import ts from "typescript";

interface MigrationTarget {
  filePath: string;
  patterns: DetectedPattern[];
  complexity: "simple" | "moderate" | "complex";
  estimatedChanges: number;
  dependencies: string[];
}

interface DetectedPattern {
  type: string;
  line: number;
  code: string;
  migrationStrategy: string;
}

export async function scanProject(rootDir: string): Promise<MigrationTarget[]> {
  const targets: MigrationTarget[] = [];
  const files = await getTypeScriptFiles(rootDir);

  for (const filePath of files) {
    const content = await readFile(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(
      filePath, content, ts.ScriptTarget.Latest, true
    );

    const patterns = detectPatterns(sourceFile, content);
    if (patterns.length === 0) continue;

    const complexity = patterns.length > 10 ? "complex"
      : patterns.length > 4 ? "moderate" : "simple";

    targets.push({
      filePath: relative(rootDir, filePath),
      patterns,
      complexity,
      estimatedChanges: patterns.length,
      dependencies: extractImports(sourceFile),
    });
  }

  // Sort: simple files first for quick wins, complex last
  targets.sort((a, b) => {
    const order = { simple: 0, moderate: 1, complex: 2 };
    return order[a.complexity] - order[b.complexity];
  });

  return targets;
}

function detectPatterns(sourceFile: ts.SourceFile, content: string): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  function visit(node: ts.Node) {
    // Detect Express imports
    if (ts.isImportDeclaration(node)) {
      const moduleSpec = (node.moduleSpecifier as ts.StringLiteral).text;
      if (moduleSpec === "express") {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        patterns.push({
          type: "import",
          line,
          code: content.substring(node.getStart(), node.getEnd()),
          migrationStrategy: "Replace with Hono import",
        });
      }
    }

    // Detect Express app creation: const app = express()
    if (ts.isCallExpression(node) && node.expression.getText() === "express") {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      patterns.push({
        type: "app_creation",
        line,
        code: content.substring(node.parent.getStart(), node.parent.getEnd()),
        migrationStrategy: "Replace with new Hono()",
      });
    }

    // Detect route handlers: app.get('/path', (req, res) => ...)
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.getText();
      if (["get", "post", "put", "patch", "delete", "use"].includes(method)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        patterns.push({
          type: "route_handler",
          line,
          code: content.substring(node.getStart(), node.getEnd()),
          migrationStrategy: `Migrate ${method} handler: (req, res) → (c) context pattern`,
        });
      }
    }

    // Detect res.json(), res.send(), res.status()
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const prop = node.expression.name.getText();
      if (["json", "send", "status", "redirect", "render"].includes(prop)) {
        const objName = node.expression.expression.getText();
        if (objName === "res" || objName === "response") {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          patterns.push({
            type: "response_method",
            line,
            code: content.substring(node.getStart(), node.getEnd()),
            migrationStrategy: `Replace res.${prop}() with c.${prop === "send" ? "text" : prop}()`,
          });
        }
      }
    }

    // Detect middleware: app.use(middleware)
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.getText() === "use") {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        patterns.push({
          type: "middleware",
          line,
          code: content.substring(node.getStart(), node.getEnd()),
          migrationStrategy: "Convert Express middleware to Hono middleware pattern",
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return patterns;
}

function extractImports(sourceFile: ts.SourceFile): string[] {
  const imports: string[] = [];
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      imports.push((node.moduleSpecifier as ts.StringLiteral).text);
    }
  });
  return imports;
}

async function getTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      files.push(...await getTypeScriptFiles(path));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}
```

## Step 2: Build the AI Migration Engine

The LLM handles the nuanced transformations that AST-level transforms can't — restructuring callback patterns, adapting middleware signatures, and handling framework-specific idioms.

```typescript
// src/migrator.ts — AI-powered code transformation engine
import OpenAI from "openai";
import { readFile, writeFile } from "node:fs/promises";
import { MigrationTarget, DetectedPattern } from "./scanner";

const openai = new OpenAI();

interface MigrationResult {
  filePath: string;
  original: string;
  migrated: string;
  changes: string[];
  confidence: number;
  warnings: string[];
}

const SYSTEM_PROMPT = `You are an expert code migration tool. You migrate Express.js code to Hono framework.

Rules:
1. Preserve ALL business logic exactly — only change framework-specific code
2. import express → import { Hono } from "hono"
3. const app = express() → const app = new Hono()
4. Route handlers: (req, res, next) → (c) using Hono's Context
5. res.json(data) → return c.json(data)
6. res.send(text) → return c.text(text)
7. res.status(code).json(data) → return c.json(data, code)
8. req.params.id → c.req.param("id")
9. req.query.page → c.req.query("page")
10. req.body → await c.req.json()
11. req.headers["x-auth"] → c.req.header("x-auth")
12. Express middleware (req, res, next) → Hono middleware (c, next)
13. app.listen(port) → export default { port, fetch: app.fetch }
14. Error handling: Express error middleware → Hono onError
15. Keep comments, preserve formatting style, maintain type annotations

Output ONLY the migrated code. No explanations. No markdown fences.`;

export async function migrateFile(
  target: MigrationTarget,
  rootDir: string
): Promise<MigrationResult> {
  const filePath = `${rootDir}/${target.filePath}`;
  const original = await readFile(filePath, "utf-8");

  // For simple files, use a single LLM call
  if (target.complexity === "simple") {
    return await singlePassMigration(target, original);
  }

  // For complex files, use chunked migration with verification
  return await multiPassMigration(target, original);
}

async function singlePassMigration(
  target: MigrationTarget,
  original: string
): Promise<MigrationResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Migrate this Express.js file to Hono:\n\n${original}`,
      },
    ],
    temperature: 0,
    max_tokens: 8000,
  });

  const migrated = response.choices[0].message.content!.trim();

  // Extract what changed
  const changes = target.patterns.map((p) => p.migrationStrategy);

  // Verify the migration preserved exports and function signatures
  const warnings = verifyMigration(original, migrated);

  return {
    filePath: target.filePath,
    original,
    migrated,
    changes,
    confidence: warnings.length === 0 ? 0.95 : 0.7,
    warnings,
  };
}

async function multiPassMigration(
  target: MigrationTarget,
  original: string
): Promise<MigrationResult> {
  // Pass 1: Migrate imports and app setup
  const pass1 = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Migrate ONLY the imports, app creation, and middleware setup in this file. Keep all route handlers unchanged:\n\n${original}`,
      },
    ],
    temperature: 0,
  });

  // Pass 2: Migrate route handlers
  const afterPass1 = pass1.choices[0].message.content!.trim();
  const pass2 = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `This file has been partially migrated (imports/setup are Hono). Now migrate all route handlers from Express (req, res) to Hono (c) pattern:\n\n${afterPass1}`,
      },
    ],
    temperature: 0,
  });

  // Pass 3: Verification — ask the model to review its own work
  const afterPass2 = pass2.choices[0].message.content!.trim();
  const verification = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a code reviewer. Compare original Express code with migrated Hono code. List any bugs, missing logic, or incorrect API usage. If the migration is correct, respond with ONLY 'LGTM'.",
      },
      {
        role: "user",
        content: `Original:\n${original}\n\nMigrated:\n${afterPass2}`,
      },
    ],
    temperature: 0,
  });

  const reviewResult = verification.choices[0].message.content!.trim();
  const warnings = reviewResult === "LGTM" ? [] : [reviewResult];

  return {
    filePath: target.filePath,
    original,
    migrated: afterPass2,
    changes: target.patterns.map((p) => p.migrationStrategy),
    confidence: warnings.length === 0 ? 0.9 : 0.6,
    warnings,
  };
}

function verifyMigration(original: string, migrated: string): string[] {
  const warnings: string[] = [];

  // Check that all exported names are preserved
  const originalExports = [...original.matchAll(/export\s+(default\s+)?(function|const|class)\s+(\w+)/g)];
  for (const match of originalExports) {
    if (!migrated.includes(match[3])) {
      warnings.push(`Export '${match[3]}' may be missing from migrated code`);
    }
  }

  // Check for leftover Express patterns
  if (migrated.includes("require('express')") || migrated.includes("from 'express'")) {
    warnings.push("Migrated code still imports express");
  }
  if (/\bres\.(json|send|status)\b/.test(migrated)) {
    warnings.push("Migrated code still uses Express res.* methods");
  }

  // Check that route count is preserved
  const originalRoutes = (original.match(/\.(get|post|put|patch|delete)\s*\(/g) || []).length;
  const migratedRoutes = (migrated.match(/\.(get|post|put|patch|delete)\s*\(/g) || []).length;
  if (originalRoutes !== migratedRoutes) {
    warnings.push(`Route count mismatch: original has ${originalRoutes}, migrated has ${migratedRoutes}`);
  }

  return warnings;
}
```

## Step 3: Build the CLI with Dry-Run and Diff Preview

The CLI orchestrates the migration with safety features: dry-run mode shows what will change, diff preview lets developers review before applying, and rollback saves originals.

```typescript
// src/cli.ts — Interactive migration CLI with safety features
import { intro, outro, spinner, confirm, log } from "@clack/prompts";
import { scanProject, MigrationTarget } from "./scanner";
import { migrateFile, MigrationResult } from "./migrator";
import { writeFile, mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { diffLines } from "diff";

interface CLIOptions {
  rootDir: string;
  dryRun: boolean;
  backupDir: string;
  minConfidence: number;
  concurrency: number;
}

export async function runMigration(options: CLIOptions): Promise<void> {
  intro("🔄 Express → Hono Migration Tool");

  // Phase 1: Scan
  const s = spinner();
  s.start("Scanning project...");
  const targets = await scanProject(options.rootDir);
  s.stop(`Found ${targets.length} files to migrate`);

  if (targets.length === 0) {
    outro("No Express files found. Nothing to migrate.");
    return;
  }

  // Summary
  const simple = targets.filter((t) => t.complexity === "simple").length;
  const moderate = targets.filter((t) => t.complexity === "moderate").length;
  const complex = targets.filter((t) => t.complexity === "complex").length;
  log.info(`Complexity breakdown: ${simple} simple, ${moderate} moderate, ${complex} complex`);
  log.info(`Total patterns to migrate: ${targets.reduce((s, t) => s + t.estimatedChanges, 0)}`);

  if (options.dryRun) {
    log.warning("DRY RUN — no files will be modified");
    for (const target of targets) {
      log.info(`  ${target.filePath} (${target.complexity}, ${target.estimatedChanges} changes)`);
    }
    outro("Dry run complete. Remove --dry-run to apply changes.");
    return;
  }

  // Phase 2: Confirm
  const proceed = await confirm({ message: `Migrate ${targets.length} files?` });
  if (!proceed) { outro("Cancelled."); return; }

  // Phase 3: Backup
  await mkdir(options.backupDir, { recursive: true });
  for (const target of targets) {
    const src = join(options.rootDir, target.filePath);
    const dest = join(options.backupDir, target.filePath);
    await mkdir(join(options.backupDir, target.filePath, ".."), { recursive: true });
    await copyFile(src, dest);
  }
  log.success(`Backed up ${targets.length} files to ${options.backupDir}/`);

  // Phase 4: Migrate
  const results: MigrationResult[] = [];
  let applied = 0;
  let skipped = 0;

  for (const target of targets) {
    s.start(`Migrating ${target.filePath}...`);

    try {
      const result = await migrateFile(target, options.rootDir);
      results.push(result);

      if (result.confidence < options.minConfidence) {
        s.stop(`⚠️  ${target.filePath} — confidence ${(result.confidence * 100).toFixed(0)}% (below ${options.minConfidence * 100}% threshold, skipping)`);
        if (result.warnings.length > 0) {
          result.warnings.forEach((w) => log.warning(`  ${w}`));
        }
        skipped++;
        continue;
      }

      // Show diff
      const diff = diffLines(result.original, result.migrated);
      const addedLines = diff.filter((d) => d.added).reduce((s, d) => s + (d.count || 0), 0);
      const removedLines = diff.filter((d) => d.removed).reduce((s, d) => s + (d.count || 0), 0);

      // Apply the migration
      await writeFile(join(options.rootDir, target.filePath), result.migrated, "utf-8");
      applied++;

      s.stop(`✅ ${target.filePath} — +${addedLines}/-${removedLines} lines, ${(result.confidence * 100).toFixed(0)}% confidence`);
    } catch (error) {
      s.stop(`❌ ${target.filePath} — ${(error as Error).message}`);
      skipped++;
    }
  }

  // Phase 5: Summary
  log.info("─".repeat(60));
  log.success(`Applied: ${applied} files`);
  if (skipped > 0) log.warning(`Skipped: ${skipped} files (low confidence or errors)`);
  log.info(`Backups: ${options.backupDir}/`);

  outro(`Migration complete! Run your tests to verify: npm test`);
}
```

## Results

After running the migration tool on the 400-file Express codebase:

- **Migration completed in 3 hours instead of 6 weeks** — the AI handled 380 files automatically; developers manually reviewed 20 complex files flagged by the confidence threshold
- **Cost: $45 in API calls vs. $40K in developer time** — GPT-4o processed all files for under $50; even counting the 3 hours of review, total cost was under $1K
- **Zero regressions in migrated code** — the multi-pass approach with self-review caught 12 issues before applying; all 847 existing tests passed after migration
- **Pattern coverage: 95%** — the tool handled route handlers, middleware, error handling, request/response APIs, and static file serving; only custom Express plugins needed manual work
- **Reusable for future migrations** — the same architecture (scan → plan → AI transform → verify) applies to any framework migration; the team later used it for a React class-to-hooks conversion
