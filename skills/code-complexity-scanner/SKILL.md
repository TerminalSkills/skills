---
name: code-complexity-scanner
description: >-
  Measures cyclomatic complexity, cognitive complexity, and function length
  across codebases to identify maintenance hotspots. Use when someone asks
  about code complexity, function length analysis, maintainability metrics,
  or needs to find the most complex parts of their codebase. Trigger words:
  complexity, cyclomatic, cognitive complexity, long functions, hotspots,
  maintainability index, code metrics.
license: Apache-2.0
compatibility: "Works with any language; best results with JS/TS, Python, Go, Java"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["code-quality", "complexity", "metrics", "static-analysis"]
---

# Code Complexity Scanner

## Overview

This skill analyzes source code to measure cyclomatic complexity, cognitive complexity, and function length. It identifies the most complex functions and files in a codebase, helping teams focus refactoring efforts on the code that's hardest to maintain and most likely to harbor bugs.

## Instructions

### Step 1: Identify Target Language and Files

Detect the primary language from file extensions and package files. Filter to source code only (exclude node_modules, vendor, dist, build, __pycache__, .git).

### Step 2: Prefer a real analyzer, fall back to counting

Run an established tool when one is available; counting by reading code is slow and error-prone for large files.

```bash
pip install lizard radon          # use a virtual environment
lizard src/ -C 15 -L 100 -w       # any language; warns above CCN 15 or 100 lines (-w = warnings only)
radon cc -s -n C src/             # Python: only grade C or worse
```
For JS/TS, enable the core ESLint `complexity` rule (cyclomatic) and `sonarjs/cognitive-complexity` from `eslint-plugin-sonarjs` (cognitive, default threshold 15) in `eslint.config.js`, then run `npx eslint src/`:
```javascript
import sonarjs from 'eslint-plugin-sonarjs'
export default [{ files: ['src/**/*.{js,ts}'], plugins: { sonarjs },
  rules: { complexity: ['warn', 15], 'sonarjs/cognitive-complexity': ['warn', 15] } }]
```
In Go use `gocyclo` and `gocognit`. Lizard's default CCN threshold is 15, and its CCN counts `&&` and `||`, so it matches the rules below (`lizard` reports 7 for a function with one `if`, one `elif`, one `for`, one inner `if` and an `and` plus an `or`).

If no tool can be installed, count by hand. For each function/method:
- `if`, `elif`/`else if` → +1 each
- `for`, `while`, `do-while` → +1 each
- `case` in switch (each case) → +1 each
- `catch` → +1
- `&&`, `||` in conditions → +1 each
- Ternary `?:` → +1
- `else` does not count; base complexity starts at 1

### Step 3: Measure Cognitive Complexity

More nuanced than cyclomatic (the SonarSource definition) — penalizes nesting:
- Each `if`, loop, `catch`, ternary or `switch` (the whole switch counts once, not per case): +1
- Each of those inside nested structures: an extra +1 per nesting level
- `else if` / `else`: +1, with no nesting penalty
- Recursion: +1
- Each run of the same boolean operator (`a && b && c` is one run; switching to `||` starts a new one): +1

### Step 4: Identify Hotspot Files

Rank files by:
1. Maximum function complexity in the file
2. Average complexity across all functions
3. Number of functions above threshold (default: 15)
4. Total lines of code

### Step 5: Output Report

Present findings in three tiers:
- 🔴 **Critical** (complexity > 25): Must refactor — these functions are untestable
- 🟡 **Warning** (complexity 15-25): Should refactor when next modifying
- 🟢 **OK** (complexity < 15): Acceptable maintainability

## Examples

### Example 1: TypeScript Project Scan

**User prompt:**
```
Scan src/ for the most complex functions
```

**Agent output:**
```
Complexity Report — src/ (89 files scanned)

🔴 CRITICAL (complexity > 25)
  src/billing/calculator.ts
    calculateInvoiceTotal()     Cyclomatic: 34  Cognitive: 48  Lines: 180
    applyDiscountRules()        Cyclomatic: 26  Cognitive: 31  Lines: 95

  src/api/middleware/auth.ts
    validateAndRefreshToken()   Cyclomatic: 28  Cognitive: 35  Lines: 120

🟡 WARNING (complexity 15-25)
  src/workers/sync.ts
    reconcileRecords()          Cyclomatic: 19  Cognitive: 24  Lines: 88
  src/utils/validators.ts
    validateAddress()           Cyclomatic: 16  Cognitive: 18  Lines: 65

Summary:
  Files scanned: 89 | Functions analyzed: 412
  Average complexity: 6.8 | Median: 4
  Functions above threshold: 14 (3.4%)
  Recommended target: reduce critical functions below 15
```

### Example 2: Python Project with Trend

**User prompt:**
```
What are the complexity hotspots in our Django app?
```

**Agent output:**
```
Complexity Hotspots — myapp/ (67 files)

Top 10 by Cyclomatic Complexity:
  Rank  Function                              CC   Lines  File
  1     process_order()                       38   340    views/checkout.py
  2     generate_report()                     27   210    reports/builder.py
  3     sync_inventory()                      24   180    tasks/inventory.py
  4     parse_import_file()                   22   150    importers/csv.py
  5     calculate_shipping()                  19   95     shipping/rates.py

Nesting depth violations (>4 levels):
  views/checkout.py:142    — 6 levels deep in process_order()
  reports/builder.py:89    — 5 levels deep in generate_report()

Recommended refactoring order: process_order() first (highest complexity,
most changed file per git history, 340 lines is 3x recommended max).
```

## Guidelines

- **Thresholds are configurable** — default 15 works for most teams, but ask the user if they have a team standard
- **Cognitive > cyclomatic for human readability** — cognitive complexity better captures how hard code is to understand
- **Context matters** — a parser with complexity 20 might be acceptable; a controller with complexity 20 needs splitting
- **Combine with change frequency** — complex code that never changes is less urgent than complex code edited weekly
- **Don't count generated code** — exclude auto-generated files, migrations, and schema definitions
- **Suggest specific refactorings** — "Extract method" for long functions, "Replace conditional with polymorphism" for deep switch statements, "Introduce parameter object" for functions with 5+ parameters
