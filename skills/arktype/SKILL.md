---
name: arktype
description: >-
  Define runtime-validated types with ArkType — TypeScript's 1:1 validator.
  Use when someone asks to "validate data in TypeScript", "runtime type
  checking", "ArkType", "type-safe validation", "alternative to Zod", "faster
  validation library", or "validate with TypeScript syntax". Covers type
  definitions, validation, morphs (transforms), scopes, and comparison with Zod.
license: Apache-2.0
compatibility: "TypeScript 5.1+. Node.js/Bun/Deno/browser."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/arktypeio/arktype
  category: development
  tags: ["validation", "typescript", "arktype", "runtime-types", "schema"]
---

# ArkType

## Overview

ArkType is a runtime validation library that uses TypeScript's own syntax for type definitions. Instead of learning a new API (`z.string().email()`), you write types the way you already know (`"string.email"`). Its own benchmarks put it far ahead of Zod on speed (the project cites an order of magnitude or more; measure your own payloads), and it gives readable error messages and a 1:1 match between your types and validators. Current release at the time of writing: 2.2.x. It implements Standard Schema, so it plugs into libraries that accept that interface.

## When to Use

- Runtime validation where performance matters (hot paths, large payloads)
- Want to write validators using TypeScript syntax (not a builder API)
- Need detailed, human-readable error messages
- Replacing Zod in performance-critical applications
- Type-safe data transformations (morphs)

## Instructions

### Setup

```bash
npm install arktype
```

### Basic Types

```typescript
// types.ts — Define types using TypeScript syntax
import { type } from "arktype";

// String with constraints
const email = type("string.email");
const result = email("maya.chen@northwind.io");  // "maya.chen@northwind.io"
const error = email("not-an-email");       // ArkErrors: must be an email address (was "not-an-email")

// Object types — looks like TypeScript
const User = type({
  name: "string >= 2",            // String with min length 2
  email: "string.email",
  age: "number.integer >= 13",    // Integer, min 13
  role: "'admin' | 'user'",       // Literal union
  "bio?": "string <= 500",        // Optional, max 500 chars
});

// Infer the TypeScript type — no separate interface needed
type User = typeof User.infer;
// { name: string; email: string; age: number; role: "admin" | "user"; bio?: string }

// Validate
const valid = User({
  name: "Kai",
  email: "kai.berg@northwind.io",
  age: 25,
  role: "user",
});

if (valid instanceof type.errors) {
  console.log(valid.summary);  // Human-readable error message
} else {
  console.log(valid.name);     // Typed as User
}
```

### Arrays and Nested Types

```typescript
// complex.ts — Complex nested types
import { type } from "arktype";

const Address = type({
  street: "string",
  city: "string",
  zip: "string.numeric",      // Only checks the string looks numeric; stays a string
  country: "string == 2",     // Exactly 2 characters (ISO code)
});

const Order = type({
  id: "string.uuid",
  items: type({
    productId: "string",
    quantity: "number.integer > 0",
    price: "number > 0",
  }).array(),                   // Array of items
  shippingAddress: Address,
  total: "number > 0",
  status: "'pending' | 'shipped' | 'delivered'",
  createdAt: "Date",
});

type Order = typeof Order.infer;
```

### Morphs (Transforms)

`string.trim`, `string.numeric.parse`, `string.json.parse` and `string.date.parse` are built-in morphs: they validate and convert in one step. Plain `string.numeric` only validates and leaves a string.

```typescript
// morphs.ts — Transform data during validation
import { type } from "arktype";

// Parse string to number
const numericString = type("string.numeric.parse");
numericString("42");  // 42 (number)

// Defaults and custom checks
const Settings = type({ retries: "number.integer = 3" });
Settings({});         // { retries: 3 }
const Even = type("number").narrow((n, ctx) => n % 2 === 0 || ctx.mustBe("even"));
Even(3).summary;      // "must be even (was 3)"

// Parse and transform API input
const CreateUserInput = type({
  name: "string.trim",                          // Auto-trim
  email: type("string.email").pipe((e) => e.toLowerCase()),  // Lowercase
  age: type("string.numeric.parse"),            // String → number
  tags: type("string").pipe((s) => s.split(",")), // "a,b,c" → ["a","b","c"]
});
```

### Scopes (Reusable Type Systems)

```typescript
// scope.ts — Define interconnected types
import { scope } from "arktype";

const types = scope({
  user: {
    id: "string.uuid",
    name: "string >= 2",
    email: "string.email",
    "posts?": "post[]",
  },
  post: {
    id: "string.uuid",
    title: "string >= 1",
    content: "string",
    "author?": "user",         // Cyclic reference (optional so data can terminate)
    tags: "string[]",
  },
}).export();

const out = types.user({ id: crypto.randomUUID(), name: "Kai" });
if (out instanceof type.errors) console.error(out.summary);
```

### Throwing, JSON Schema and Standard Schema

```typescript
const Config = type({ port: "number.integer", "host?": "string" });
const config = Config.assert({ port: 8080 });   // returns data or throws TraversalError
const schema = Config.toJsonSchema();            // JSON Schema draft 2020-12 object
Config["~standard"].vendor;                      // "arktype" (Standard Schema interface)
```

## Examples

### Example 1: Validate API request bodies

**User prompt:** "Validate incoming POST requests in my Express API with clear error messages."

The agent installs `arktype`, defines one `type({...})` per endpoint body, and writes a middleware that calls the schema and checks `out instanceof type.errors`. On failure it responds `400` with `out.summary`; on success it passes the typed data on. A bad body such as `{ "age": 3 }` returns `age must be at least 13 (was 3)`.

### Example 2: Replace Zod with ArkType

**User prompt:** "My Zod validation is slow on large payloads. Switch to something faster."

The agent translates each Zod schema (`z.string().email()` becomes `"string.email"`, `z.coerce.number()` becomes `"string.numeric.parse"` where the input is a string), swaps `safeParse` for the `instanceof type.errors` check, and times both libraries on a real payload before claiming a speedup.

## Guidelines

- **TypeScript syntax** — `"string.email"` not `z.string().email()`
- **`type.errors` for error checking** — `result instanceof type.errors`
- **`.infer` for TypeScript type** — no duplicate interface definitions
- **Morphs for transforms** — `.pipe()` to transform during validation
- **Scopes for complex schemas** — define interconnected types with forward references
- **Faster than Zod in the project's benchmarks** — matters for hot paths; measure your own payloads
- **Error messages are human-readable** — `result.summary` for display
- **`?` suffix for optional** — `"bio?": "string"` makes bio optional
- **Constraints in the type** — `"0 <= number < 100"` is a range
- **`string.numeric` does not convert** — use `string.numeric.parse` when you need a number
- **Cyclic types need an escape** — make the back-reference optional or an array, or no finite value validates
- **Not as battle-tested as Zod** — newer library, smaller ecosystem
