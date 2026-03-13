---
title: Build a Zod Validation Layer for a TypeScript App
slug: build-zod-validation-layer-for-typescript-app
description: >-
  Use Zod for runtime validation across your entire TypeScript stack — API
  request/response validation, form schemas, environment variables, config
  files, and shared types between frontend and backend.
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

Daria's API accepts user input but validates it with manual `if` checks scattered through handlers. Types drift from reality — the TypeScript type says `email: string` but the runtime value could be anything. She needs a single source of truth: define the shape once with Zod, get runtime validation AND TypeScript types from the same schema, and use it everywhere — API endpoints, forms, environment variables, and config files.

## Step 1: Define Shared Schemas

```typescript
// src/schemas/user.ts
import { z } from "zod";

export const UserRoleSchema = z.enum(["admin", "editor", "viewer"]);

export const CreateUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  role: UserRoleSchema.default("viewer"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});

export const UpdateUserSchema = CreateUserSchema.partial().omit({ password: true });

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: UserRoleSchema,
  createdAt: z.coerce.date(),
  plan: z.enum(["free", "pro", "enterprise"]),
});

// Types derived from schemas — always in sync
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
  deadline: z.coerce.date().min(new Date(), "Deadline must be in the future").optional(),
});

export const ProjectFiltersSchema = z.object({
  status: ProjectStatusSchema.optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "createdAt", "deadline"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type ProjectFilters = z.infer<typeof ProjectFiltersSchema>;
```

## Step 2: API Endpoint Validation

```typescript
// src/app/api/users/route.ts
import { CreateUserSchema, UserResponseSchema } from "@/schemas/user";
import { NextRequest } from "next/server";
import { ZodError } from "zod";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = CreateUserSchema.parse(body); // Throws ZodError on invalid input

    const user = await createUser(input); // input is fully typed: CreateUserInput

    // Validate response too — ensures API contract
    const response = UserResponseSchema.parse(user);
    return Response.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({
        error: "Validation failed",
        details: error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      }, { status: 400 });
    }
    throw error;
  }
}
```

```typescript
// src/lib/api-validate.ts — Reusable validation helper
import { ZodSchema, ZodError } from "zod";

export function validateRequest<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const formatted = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      throw new ApiError(400, `Validation failed: ${formatted}`);
    }
    throw error;
  }
}

// Usage: const input = validateRequest(CreateUserSchema, await req.json());
```

## Step 3: Environment Variable Validation

```typescript
// src/env.ts — Validate env vars at startup, not at runtime
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  RESEND_API_KEY: z.string().startsWith("re_"),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PORT: z.coerce.number().int().positive().default(3000),
});

// Parse at module load — fails fast if env is misconfigured
export const env = EnvSchema.parse(process.env);

// TypeScript knows the exact types:
// env.PORT is number (not string!)
// env.NODE_ENV is "development" | "production" | "test"
```

## Step 4: Form Validation (React Hook Form + Zod)

```tsx
// src/components/CreateProjectForm.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateProjectSchema, type CreateProjectInput } from "@/schemas/project";

export function CreateProjectForm({ onSubmit }: { onSubmit: (data: CreateProjectInput) => Promise<void> }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateProjectInput>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: { status: "active", tags: [] },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Project Name</label>
        <input {...register("name")} className="w-full px-3 py-2 border rounded" />
        {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium">Budget ($)</label>
        <input type="number" {...register("budget", { valueAsNumber: true })} className="w-full px-3 py-2 border rounded" />
        {errors.budget && <p className="text-red-500 text-sm mt-1">{errors.budget.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium">Deadline</label>
        <input type="date" {...register("deadline")} className="w-full px-3 py-2 border rounded" />
        {errors.deadline && <p className="text-red-500 text-sm mt-1">{errors.deadline.message}</p>}
      </div>

      <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded">
        {isSubmitting ? "Creating..." : "Create Project"}
      </button>
    </form>
  );
}
```

## Step 5: Composable Schema Patterns

```typescript
// src/schemas/common.ts — Reusable building blocks
import { z } from "zod";

// Pagination that works for any list endpoint
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Wrap any schema in a paginated response
export function paginatedResponse<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      pages: z.number(),
    }),
  });
}

// ID param validation
export const IdParamSchema = z.object({
  id: z.string().uuid("Invalid ID format"),
});

// Slug validation
export const SlugSchema = z.string()
  .min(3).max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be lowercase with hyphens");

// Transform: trim and lowercase email
export const EmailSchema = z.string().email().transform((e) => e.trim().toLowerCase());
```

## Summary

Daria now has a single source of truth for data shapes. The same `CreateUserSchema` validates API input (server), form data (client), and generates TypeScript types (compile time). Environment variables are validated at startup — if `STRIPE_SECRET_KEY` is missing, the app fails immediately instead of crashing when the first payment happens. Composable patterns like `paginatedResponse()` and `PaginationSchema` eliminate repetition. The API returns consistent error messages with field-level details. No more `if (!email || typeof email !== 'string')` scattered through the codebase.
