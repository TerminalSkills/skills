---
title: Build a Zod Validation Layer for a TypeScript App
slug: build-zod-validation-layer-for-typescript-app
description: >-
  Use Zod 4 for runtime validation across your entire TypeScript stack — API
  request/response validation, tRPC inputs, form schemas, Drizzle table
  schemas, environment variables, and shared types between frontend and backend.
skills:
  - zod
  - trpc
  - drizzle-orm
category: development
tags:
  - validation
  - zod
  - typescript
  - type-safety
  - api
---

# Build a Zod Validation Layer for a TypeScript App

## The Problem

Daria's API accepts user input but validates it with manual `if` checks scattered through handlers. Types drift from reality: the TypeScript type says `email: string` but the runtime value could be anything. The same rules are re-typed in the form, the tRPC procedures and the database layer, and they disagree.

## The Solution

Define each shape once with Zod 4 (`zod@4`, imported as `"zod"`) and derive everything else from it: TypeScript types with `z.infer`, request validation, tRPC `.input()`/`.output()`, form validation through `@hookform/resolvers`, and insert schemas for Drizzle tables through `drizzle-zod`. Zod 4 deprecates several spellings that older tutorials still use (`z.string().email()`, `error.errors`, `.flatten()`); this guide uses the current ones.

```bash
npm install zod @trpc/server drizzle-orm drizzle-zod react-hook-form @hookform/resolvers
```

## Step-by-Step Walkthrough

### Step 1: Define shared schemas

```typescript
// src/schemas/user.ts
import { z } from "zod";

export const UserRoleSchema = z.enum(["admin", "editor", "viewer"]);

export const CreateUserSchema = z.object({
  email: z.email("Invalid email address"),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  role: UserRoleSchema.default("viewer"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});

export const UpdateUserSchema = CreateUserSchema.omit({ password: true }).partial();

export const UserResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: UserRoleSchema,
  createdAt: z.coerce.date(),
  plan: z.enum(["free", "pro", "enterprise"]),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
```

```typescript
// src/schemas/project.ts
import { z } from "zod";

export const ProjectStatusSchema = z.enum(["active", "paused", "completed", "archived"]);

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: ProjectStatusSchema.default("active"),
  budget: z.number().positive().optional(),
  tags: z.array(z.string().max(50)).max(10).default([]),
  deadline: z.coerce.date().optional(),
}).refine((p) => !p.deadline || p.deadline > new Date(), {
  error: "Deadline must be in the future",
  path: ["deadline"],
});

export const ProjectFiltersSchema = z.object({
  status: ProjectStatusSchema.optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "createdAt", "deadline"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateProjectInput = z.output<typeof CreateProjectSchema>;
export type ProjectFilters = z.output<typeof ProjectFiltersSchema>;
```

Notes: `z.email()` and `z.uuid()` replace the deprecated `z.string().email()` / `.uuid()`. The deadline check is a `.refine` on the object, because a `new Date()` passed to `.min()` is evaluated once at module load and would freeze "now" at server start. Use `z.output<>` for types of schemas with defaults or coercion (what the handler receives); `z.input<>` is what callers may send.

### Step 2: Validate API requests and responses

```typescript
// src/lib/api-validate.ts
import { z } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string[]>) {
    super(message);
  }
}

export function validateRequest<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(400, "Validation failed", z.flattenError(result.error).fieldErrors as Record<string, string[]>);
  }
  return result.data;
}
```

```typescript
// src/app/api/users/route.ts (Next.js route handler)
import { CreateUserSchema, UserResponseSchema } from "@/schemas/user";
import { ApiError, validateRequest } from "@/lib/api-validate";

export async function POST(req: Request) {
  try {
    const input = validateRequest(CreateUserSchema, await req.json());
    const user = await createUser(input);
    return Response.json(UserResponseSchema.parse(user), { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message, fields: error.fields }, { status: error.status });
    }
    throw error;
  }
}
```

A bad body returns `400` with `{"error":"Validation failed","fields":{"email":["Invalid email address"]}}`. Parsing the response with `UserResponseSchema` catches handlers that leak fields or return the wrong shape before the client sees them; never return the password or its hash.

### Step 3: Fail fast on environment variables

```typescript
// src/env.ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
export const env = parsed.data;
```

`env.PORT` is a `number` and `env.NODE_ENV` is a union, with no casts. A missing `JWT_SECRET` prints a readable `✖ ... → at JWT_SECRET` message and the process exits at boot instead of failing on the first request. Keep vendor key checks (such as `startsWith("sk_")`) out of the schema unless you control the format.

### Step 4: Reuse the schemas in tRPC

The same schemas are tRPC inputs and outputs, so the client gets the types with no extra work:

```typescript
// src/trpc.ts
import { initTRPC } from "@trpc/server";
import { CreateUserSchema, UserResponseSchema } from "@/schemas/user";
import { ProjectFiltersSchema } from "@/schemas/project";

const t = initTRPC.create();

export const appRouter = t.router({
  createUser: t.procedure
    .input(CreateUserSchema)
    .output(UserResponseSchema)
    .mutation(async ({ input }) => {
      // input: { email: string; name: string; role: "admin" | ...; password: string }
      return { id: crypto.randomUUID(), email: input.email, name: input.name, role: input.role, createdAt: new Date(), plan: "free" as const };
    }),
  listProjects: t.procedure
    .input(ProjectFiltersSchema) // ?page=2 style strings are coerced by the schema
    .query(({ input }) => ({ items: [], page: input.page })),
});
export type AppRouter = typeof appRouter;
```

An invalid input is rejected with a `BAD_REQUEST` tRPC error before the resolver runs.

### Step 5: Derive database validation from the Drizzle table

```typescript
// src/db/schema.ts
import { integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: varchar({ length: 255 }).notNull().unique(),
  name: varchar({ length: 100 }).notNull(),
  role: text({ enum: ["admin", "editor", "viewer"] }).notNull().default("viewer"),
  passwordHash: text().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});
```

```typescript
// src/schemas/db.ts: the row shape that is safe to insert
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "@/db/schema";

export const InsertUserRow = createInsertSchema(users, {
  email: (s) => s.email(),
  name: (s) => s.min(2).max(100),
}).omit({ id: true, createdAt: true });
export type InsertUserRowT = z.infer<typeof InsertUserRow>;
```

`createInsertSchema` builds the validator from the column types (the `role` enum, `notNull` columns); the callback form tightens individual columns. Hashing happens between `CreateUserSchema` (plain `password`) and this schema (`passwordHash`), so the two stay separate on purpose. An unknown role fails with `Invalid option: expected one of "admin"|"editor"|"viewer"`.

### Step 6: Form validation (React Hook Form + Zod)

```tsx
// src/components/CreateProjectForm.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CreateProjectSchema } from "@/schemas/project";

type FormIn = z.input<typeof CreateProjectSchema>;
type FormOut = z.output<typeof CreateProjectSchema>;

export function CreateProjectForm({ onSubmit }: { onSubmit: (data: FormOut) => Promise<void> }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: { status: "active", tags: [] },
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("name")} />
      {errors.name && <p>{errors.name.message}</p>}
      <input type="number" {...register("budget", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} />
      <input type="date" {...register("deadline", { setValueAs: (v) => v || undefined })} />
      {errors.deadline && <p>{errors.deadline.message}</p>}
      <button type="submit" disabled={isSubmitting}>Create</button>
    </form>
  );
}
```

`zodResolver` in `@hookform/resolvers` 5+ takes the schema's input and output types separately, hence the three generics. The `setValueAs` callbacks turn an empty field into `undefined`; without them an empty date becomes `Invalid Date` and an empty number becomes `NaN`, and the optional fields fail.

### Step 7: Composable building blocks

```typescript
// src/schemas/common.ts
import { z } from "zod";

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginatedResponse<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    pagination: z.object({ page: z.number(), limit: z.number(), total: z.number(), pages: z.number() }),
  });
}

export const IdParamSchema = z.object({ id: z.uuid("Invalid ID format") });
export const SlugSchema = z.string().min(3).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be lowercase with hyphens");
export const EmailSchema = z.email().transform((e) => e.trim().toLowerCase());
```

## Real-World Example

Daria moves the four hand-written checks in `POST /api/users` onto `CreateUserSchema`, points the signup form and the `createUser` tRPC mutation at the same schema, and adds `env.ts` to the entry point. Deleting a rule now means editing one line, and a type error shows up in every consumer. In staging, a deploy missing `JWT_SECRET` stopped at boot with a one-line message instead of failing on the first login.

## Related Skills

- `zod` — schema definition, parsing, coercion and Zod 4 migration details
- `trpc` — typed procedures that take Zod schemas as inputs and outputs
- `drizzle-orm` — table definitions that `drizzle-zod` turns into insert and select schemas
