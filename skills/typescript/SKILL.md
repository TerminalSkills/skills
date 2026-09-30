---
name: typescript
description: >-
  Sets up and repairs TypeScript projects: picks tsconfig.json settings for a
  Node.js service, an npm library or a bundled web app, runs type-checking in
  CI, and replaces `any` and unsafe casts with types the compiler can verify.
  Use when someone asks to "set up TypeScript", "fix this tsconfig", "fix a
  TypeScript error", "upgrade to TypeScript 6 or 7", "migrate JavaScript to
  TypeScript", "publish types for a package", "run .ts files in Node" or "make
  this type-safe". Covers the changed defaults in TypeScript 6.0 and 7.0,
  module and moduleResolution, strict mode, project references, declaration
  output, narrowing, satisfies and common compiler errors.
license: Apache-2.0
compatibility: "TypeScript 5.9, 6.0 or 7.0; Node.js 20+ (22.18+ to run .ts files without a build step)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["typescript", "tsconfig", "type-checking", "type-safety", "javascript-migration"]
  repository: https://github.com/microsoft/TypeScript
---

# TypeScript — Configure, Type-Check and Migrate

## Overview

TypeScript 7.0 (July 2026) is the native port of the compiler: the same `tsc` command, usually 8–12x faster on a full build, with no programmatic API yet. It keeps the defaults introduced in 6.0, which differ from 5.x, so a `tsconfig.json` copied from an older project often fails. This skill covers settings per target, type-checking in CI, running `.ts` files directly, patterns that keep types truthful, and migrating JavaScript.

## Instructions

### Check the compiler version first

Run `npx tsc --version`; the defaults depend on it.

| Option | Default in 5.9 and earlier | Default in 6.0 and 7.0 |
|---|---|---|
| `strict` | `false` | `true` |
| `types` | every package in `node_modules/@types` | `[]` |
| `rootDir` | inferred from the input files | the directory of `tsconfig.json` |
| `module` | `commonjs` | `esnext` |
| `target` | `es5` | `es2025` (latest stable ES version) |
| `noUncheckedSideEffectImports` | `false` | `true` |

Deprecated in 6.0 (error TS5101/TS5107, silenced by `"ignoreDeprecations": "6.0"`) and removed in 7.0 (TS5102/TS5108, cannot be silenced): `target: es5`, `downlevelIteration`, `moduleResolution: node`/`node10`/`classic`, `module: amd`/`umd`/`systemjs`/`none`, `baseUrl`, `outFile`, `esModuleInterop: false`, `alwaysStrict: false`.

### Choose settings by what runs the code

Node.js service, compiled by `tsc` and run from `dist/`:

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "target": "es2023",
    "lib": ["es2023"],
    "types": ["node"],
    "rootDir": "./src",
    "outDir": "./dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

- `module: nodenext` implies `moduleResolution: nodenext`. A file is ESM or CommonJS according to `"type"` in `package.json` or a `.mts`/`.cts` extension.
- In ESM files a relative import names the output file: `import { parseInvoice } from "./invoice.js"`.
- An explicit `lib` without `dom` keeps browser globals such as `window` out of server code.
- `node20` (5.9+) is a fixed alternative to the moving `nodenext` and implies `target: es2023`.

Web app built by a bundler (Vite, esbuild, webpack). The bundler emits and `tsc` only checks. `module: preserve` implies `moduleResolution: bundler`, and from 6.0 `dom` includes `dom.iterable`:

```json
{
  "compilerOptions": {
    "module": "preserve",
    "target": "es2023",
    "lib": ["es2023", "dom"],
    "types": ["vite/client"],
    "jsx": "react-jsx",
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Library published to npm — `tsc` emits JavaScript and declarations:

```json
{
  "compilerOptions": {
    "module": "node18",
    "target": "es2022",
    "types": [],
    "rootDir": "./src",
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedDeclarations": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

The matching `package.json`; `"types"` must be the first condition in each `exports` entry:

```json
{
  "name": "@northwind/booking-rules",
  "version": "1.0.0",
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "files": ["dist"]
}
```

`moduleResolution: bundler` in a library accepts extensionless imports that fail in Node.js, so use a `node*` mode. `isolatedDeclarations` (5.5+) requires explicit types on exports (TS9013 otherwise). Check the package before publishing with `npx @arethetypeswrong/cli --pack . --profile esm-only`.

### Know what `strict` covers

`strict` turns on `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `strictBuiltinIteratorReturn`, `noImplicitThis`, `useUnknownInCatchVariables` and `alwaysStrict`. It does not turn on `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` or `noFallthroughCasesInSwitch`; add those by name.

### Type-check in CI

```bash
npx tsc --noEmit                # one project
npx tsc -b                      # project references, in dependency order
npx tsc --noEmit --checkers 2   # 7.0 only: fewer checker threads on a small runner (default 4)
```

- Vite, esbuild, swc, tsx and Node.js remove types without checking them. Only `tsc` reports type errors.
- `tsc` writes output even when it reports errors unless `noEmitOnError` is set; `tsc -b` never does.
- From 6.0, `tsc src/invoice.ts` next to a `tsconfig.json` is error TS5112. Pre-commit hooks that pass file names must check the whole project; `--ignoreConfig` drops every project setting.

### Split a monorepo with project references

The root `tsconfig.json` only lists the projects: `{ "files": [], "references": [{ "path": "./packages/pricing" }, { "path": "./packages/api" }] }`. Each package extends a shared `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "declarationMap": true,
    "module": "nodenext",
    "rootDir": "${configDir}/src",
    "outDir": "${configDir}/dist"
  }
}
```

`composite` turns on `declaration` and `incremental`. Each package lists the packages it imports in its own `references`. `${configDir}` (5.5+) resolves against the config that extends the base. `tsc -b --verbose` explains why a project was rebuilt and `tsc -b --clean` deletes outputs.

### Run TypeScript without a build step

```bash
npx tsx src/server.ts         # esbuild-based: enums and tsconfig paths work
npx tsx watch src/server.ts
node src/report.ts            # built-in type stripping
```

Node.js type stripping is on by default from 22.18 and 23.6, and stable from 24.12 and 25.2. Its limits:

- It ignores `tsconfig.json`, so `paths` aliases fail. Use `"imports": { "#lib/*": "./src/lib/*" }` in `package.json`.
- Syntax that needs code generation throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`: `enum`, parameter properties, namespaces with runtime code, `import x = require()`. Node.js 26 removed `--experimental-transform-types`.
- Imports need the real extension (`./booking.ts`) and type imports need the `type` keyword.
- `.tsx` files and files under `node_modules` are refused.
- To have `tsc` report the same limits, set `erasableSyntaxOnly`, `verbatimModuleSyntax`, and `allowImportingTsExtensions` (with `noEmit`) or `rewriteRelativeImportExtensions` (when emitting).

### Keep types truthful

```ts
import { z } from "zod";
// One variant per state: a field of one state cannot be read in another.
type Payment =
  | { status: "pending" }
  | { status: "captured"; capturedAt: Date; receiptUrl: string }
  | { status: "failed"; declineCode: string };

export function summary(p: Payment): string {
  switch (p.status) {
    case "pending": return "Awaiting capture";
    case "captured": return `Receipt: ${p.receiptUrl}`;
    case "failed": return `Declined (${p.declineCode})`;
    default: {
      const unhandled: never = p; // a new variant makes this line fail to compile
      throw new Error(`Unhandled payment: ${JSON.stringify(unhandled)}`);
    }
  }
}

// satisfies checks the shape and keeps the literal keys; an annotation would widen them to string.
export const retryDelaysMs = { card_declined: 0, network_error: 2_000, rate_limited: 30_000 } satisfies Record<string, number>;
export type RetryReason = keyof typeof retryDelaysMs;

// unknown at the boundary, validated once, typed afterwards.
const WebhookEvent = z.object({ id: z.string(), type: z.enum(["payment.captured", "payment.failed"]), amountCents: z.number().int() });
export function parseWebhook(body: unknown) {
  return WebhookEvent.parse(body); // not: body as WebhookEvent
}
```

### Fix common compiler errors

| Error | Cause | Fix |
|---|---|---|
| TS2591 `Cannot find name 'process'` | `types` is `[]` from 6.0 | `npm i -D @types/node`, then `"types": ["node"]` |
| TS5011, or output in `dist/src/` | `rootDir` is no longer inferred | `"rootDir": "./src"` |
| TS2835 `Relative import paths need explicit file extensions` | ESM under `nodenext` | import `./invoice.js`, the output name |
| TS1484 `is a type and must be imported using a type-only import` | `verbatimModuleSyntax` | `import { type Invoice }` |
| TS7016 `Could not find a declaration file for module` | package ships no types | install its `@types/` package, or add `declare module "legacy-pricing";` to a `.d.ts` file |
| TS18048 `is possibly 'undefined'` | null checks, indexed access | narrow with `if`; avoid the `!` assertion |
| TS2375 `... with 'exactOptionalPropertyTypes: true'` | `undefined` passed to an optional property | omit the key, or declare `label?: string \| undefined` |
| TS18046 `'e' is of type 'unknown'` | catch variable | `e instanceof Error ? e.message : String(e)` |
| TS1294 `not allowed when 'erasableSyntaxOnly' is enabled` | `enum`, parameter property | `as const` object plus a union type; assign fields in the constructor |

### Migrate a JavaScript codebase

1. Add a `tsconfig.json` with `"allowJs": true`, `"checkJs": false`, `"noEmit": true` and an explicit `"strict": false` (6.0+ defaults to `true`). Run `npx tsc --noEmit` in CI from the first commit.
2. Rename files that import no other local file first: `.js` to `.ts`, `.jsx` to `.tsx`. Add `// @ts-check` to files that stay JavaScript.
3. Type the boundaries before the internals: API responses, database rows, environment variables.
4. Turn on one flag per pull request: `noImplicitAny`, then `strictNullChecks`, then `strict`, then `noUncheckedIndexedAccess`.
5. Suppress what cannot be fixed yet with `// @ts-expect-error BOOK-412 untyped discount()`, not `@ts-ignore`: it becomes error TS2578 once the cause is gone.
6. Remove `allowJs` when no `.js` file is left.

## Examples

### Example 1: Set up a Node.js service with a CI type-check

**User request:** "Set up TypeScript for our invoice API on Node 24 and make CI fail on type errors."

```bash
npm install -D typescript @types/node tsx
npm pkg set type=module scripts.typecheck="tsc --noEmit" scripts.build="tsc" scripts.dev="tsx watch src/server.ts"
```

Write the Node.js service `tsconfig.json` from above, then add `npm run typecheck` as a CI step before the build.

**Result:** `npm run typecheck` exits 0 on clean code. After `{ status: "refunded"; refundRef: string }` is added to the `InvoiceState` union, it exits 1 and names the `switch` that does not handle it:

```text
src/invoice.ts(30,13): error TS2322: Type '{ status: "refunded"; refundRef: string; }' is not assignable to type 'never'.
```

### Example 2: Repair a project after upgrading from 5.9 to 7.0

**User request:** "We moved ledger-service from TypeScript 5.9 to 7 and tsc fails before it checks any code."

```text
tsconfig.json(5,25): error TS5108: Option 'moduleResolution=node10' has been removed. Please remove it from your configuration.
tsconfig.json(6,5): error TS5102: Option 'baseUrl' has been removed. Please remove it from your configuration.
tsconfig.json(7,27): error TS5090: Non-relative paths are not allowed. Did you forget a leading './'?
tsconfig.json(9,5): error TS5011: The common source directory of 'tsconfig.json' is './src'. The 'rootDir' setting must be explicitly set to this or another path to adjust your output's file layout.
```

Change only the affected options in `tsconfig.json`:

```diff
-    "moduleResolution": "node",
-    "baseUrl": "./src",
-    "paths": { "@lib/*": ["lib/*"] },
+    "moduleResolution": "bundler",
+    "paths": { "@lib/*": ["./src/lib/*"] },
+    "types": ["node"],
+    "rootDir": "./src",
```

**Result:** the configuration errors are gone and `tsc` reports the code that 5.9 accepted because `strict` was off, here `src/billing/invoice-total.ts(10,34): error TS7006: Parameter 'items' implicitly has an 'any' type.` Fix each one, or set `"strict": false` and raise strictness later as in the migration steps.

## Guidelines

- TypeScript 7.0 has no programmatic API (7.1 is expected to add a new one). typescript-eslint, and the Vue, Svelte, Astro and MDX toolchains need 6.0. Install both: `npm i -D typescript@npm:@typescript/typescript6 @typescript/native@npm:typescript@^7.0.2` gives `tsc` (7.0), `tsc6` (6.0) and the 6.0 API under `import "typescript"`.
- `tsc` never rewrites `paths` aliases in emitted JavaScript. With plain `tsc` output, `@lib/money` fails at runtime in Node.js; use `package.json` `"imports"` or a bundler.
- Replace `as` casts on external data with validation. Keep `as const`, and `as` after a runtime check the compiler cannot follow.
- Prefer a union of string literals to `enum`: it needs no emitted code and works with type stripping.
- JSDoc checking is stricter in 7.0: `@enum`, Closure-style `function(string): void` and postfix `!` are no longer recognised.
- Use the `zod` skill for schema design, `tsup` for bundling a library, `vite` for the app build, `eslint` or `biome` for lint rules, `vitest` for tests, and `react` for component typing.
