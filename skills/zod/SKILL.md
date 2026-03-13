---
name: zod
description: >-
  You are an expert in Zod, the TypeScript-first schema declaration and
  validation library. You help developers define schemas that validate data at
  runtime AND infer TypeScript types at compile time — eliminating the need to
  write types and validators separately. Used for API input validation, form
  validation, environment variables, config files, and any data boundary.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - validation
    - schema
    - typescript
    - type-inference
    - parsing
    - forms
---

# Zod — TypeScript-First Schema Validation

You are an expert in Zod, the TypeScript-first schema declaration and validation library. You help developers define schemas that validate data at runtime AND infer TypeScript types at compile time — eliminating the need to write types and validators separately. Used for API input validation, form validation, environment variables, config files, and any data boundary.

## Core Capabilities

### Schema Definition

```typescript
import { z } from "zod";

// Primitives
const nameSchema = z.string().min(1).max(100);
const ageSchema = z.number().int().positive().max(150);
const emailSchema = z.string().email();

// Objects
const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  age: z.number().int().min(18, "Must be 18+").optional(),
  role: z.enum(["user", "admin", "moderator"]).default("user"),
  tags: z.array(z.string()).max(10).default([]),
  address: z.object({
    street: z.string(),
    city: z.string(),
    country: z.string().length(2),          // ISO country code
    zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Infer TypeScript type from schema — single source of truth
type User = z.infer<typeof userSchema>;
// {
//   name: string; email: string; age?: number;
//   role: "user" | "admin" | "moderator"; tags: string[];
//   address?: { street: string; city: string; country: string; zip: string };
//   metadata?: Record<string, unknown>;
// }

// Parse (throws on invalid)
const user = userSchema.parse(requestBody);

// Safe parse (returns result object)
const result = userSchema.safeParse(requestBody);
if (result.success) {
  console.log(result.data);                // Typed as User
} else {
  console.log(result.error.flatten());     // Structured error messages
}
```

### Advanced Patterns

```typescript
// Discriminated unions
const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), x: z.number(), y: z.number() }),
  z.object({ type: z.literal("scroll"), offset: z.number() }),
  z.object({ type: z.literal("keypress"), key: z.string(), modifiers: z.array(z.string()) }),
]);

// Transform (parse + transform in one step)
const dateStringSchema = z.string().transform((s) => new Date(s));
const csvSchema = z.string().transform((s) => s.split(",").map((v) => v.trim()));

// Refinement (custom validation)
const passwordSchema = z.string()
  .min(8, "At least 8 characters")
  .refine((p) => /[A-Z]/.test(p), "Must contain uppercase")
  .refine((p) => /[0-9]/.test(p), "Must contain number")
  .refine((p) => /[^A-Za-z0-9]/.test(p), "Must contain special character");

// Recursive types
const categorySchema: z.ZodType<Category> = z.object({
  name: z.string(),
  children: z.lazy(() => z.array(categorySchema)).default([]),
});

// Environment variables
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3000),   // Coerces string "3000" to number
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});
const env = envSchema.parse(process.env);

// Pipe (chain transformations)
const numberFromString = z.string().pipe(z.coerce.number().positive());
```

### API Validation

```typescript
// Express middleware
import { z } from "zod";

function validate<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten().fieldErrors });
    }
    req.body = result.data;
    next();
  };
}

app.post("/api/users", validate(userSchema), (req, res) => {
  // req.body is validated and typed
});
```

## Installation

```bash
npm install zod
```

## Best Practices

1. **Single source of truth** — Define schema once; infer types with `z.infer<>`; never duplicate type definitions
2. **safeParse over parse** — Use `safeParse` in APIs; returns error object instead of throwing
3. **Coerce for strings** — Use `z.coerce.number()` for query params and env vars; auto-converts strings
4. **Default values** — Use `.default()` to provide defaults; schema is also a transformer
5. **Error messages** — Pass custom messages: `z.string().min(1, "Required")`; user-friendly validation
6. **Discriminated unions** — Use for API event types, polymorphic data; TypeScript narrows correctly
7. **Environment validation** — Validate `process.env` at startup; fail fast on missing config
8. **Composability** — `.extend()`, `.pick()`, `.omit()`, `.merge()` for schema reuse; DRY schemas
