---
title: Build Automated API Documentation from Code
slug: build-automated-api-documentation-from-code
description: Generate interactive API documentation directly from TypeScript route definitions and Zod schemas, keeping docs always in sync with code and eliminating manual OpenAPI spec maintenance.
skills:
  - typescript
  - hono
  - zod
  - nextjs
category: development
tags:
  - api-documentation
  - openapi
  - code-generation
  - developer-experience
  - automation
---

# Build Automated API Documentation from Code

## The Problem

Yuki leads the API team at a 40-person developer tools company. Their REST API has 85 endpoints, and documentation lives in a manually maintained OpenAPI spec. The spec is perpetually out of date — last audit found 23 endpoints with incorrect request/response schemas and 6 endpoints missing entirely. Developer support tickets about "the docs say X but the API returns Y" consume 12 hours per week. New hires spend their first week understanding which parts of the docs to trust. Automated doc generation from the actual code would guarantee accuracy and cut documentation maintenance to zero.

## Step 1: Build the Schema-to-OpenAPI Converter

Zod schemas are the source of truth for request/response shapes. This converter transforms Zod schemas into OpenAPI 3.1 JSON Schema components, preserving descriptions, constraints, and examples.

```typescript
// src/docs/zod-to-openapi.ts — Convert Zod schemas to OpenAPI JSON Schema
import { z, ZodType, ZodObject, ZodArray, ZodEnum, ZodOptional, ZodString, ZodNumber } from "zod";

interface OpenAPISchema {
  type?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  items?: OpenAPISchema;
  enum?: string[];
  description?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  example?: any;
  oneOf?: OpenAPISchema[];
  nullable?: boolean;
}

export function zodToOpenAPI(schema: ZodType, name?: string): OpenAPISchema {
  if (schema instanceof ZodObject) {
    const shape = schema._def.shape();
    const properties: Record<string, OpenAPISchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToOpenAPI(value as ZodType);

      // Track required fields (non-optional)
      if (!(value instanceof ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
      ...(schema.description ? { description: schema.description } : {}),
    };
  }

  if (schema instanceof ZodArray) {
    return {
      type: "array",
      items: zodToOpenAPI(schema._def.type),
      ...(schema._def.minLength ? { minItems: schema._def.minLength.value } : {}),
      ...(schema._def.maxLength ? { maxItems: schema._def.maxLength.value } : {}),
    };
  }

  if (schema instanceof ZodEnum) {
    return {
      type: "string",
      enum: schema._def.values,
    };
  }

  if (schema instanceof ZodOptional) {
    return zodToOpenAPI(schema._def.innerType);
  }

  if (schema instanceof ZodString) {
    const result: OpenAPISchema = { type: "string" };
    for (const check of schema._def.checks) {
      if (check.kind === "min") result.minLength = check.value;
      if (check.kind === "max") result.maxLength = check.value;
      if (check.kind === "email") result.format = "email";
      if (check.kind === "url") result.format = "uri";
      if (check.kind === "uuid") result.format = "uuid";
      if (check.kind === "datetime") result.format = "date-time";
      if (check.kind === "regex") result.pattern = check.regex.source;
    }
    if (schema.description) result.description = schema.description;
    return result;
  }

  if (schema instanceof ZodNumber) {
    const result: OpenAPISchema = { type: "number" };
    for (const check of schema._def.checks) {
      if (check.kind === "min") result.minimum = check.value;
      if (check.kind === "max") result.maximum = check.value;
      if (check.kind === "int") result.type = "integer";
    }
    if (schema.description) result.description = schema.description;
    return result;
  }

  // Fallback for other Zod types
  return { type: "string" };
}

// Generate a reusable component reference
export function schemaRef(name: string): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}
```

## Step 2: Build the Route Registry

Routes register themselves with metadata — HTTP method, path, schemas, descriptions, and tags. This registry becomes the single source for generating the OpenAPI spec.

```typescript
// src/docs/route-registry.ts — Centralized route registration with documentation metadata
import { ZodType } from "zod";
import { zodToOpenAPI } from "./zod-to-openapi";

interface RouteDoc {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  requestBody?: {
    schema: ZodType;
    description?: string;
    required?: boolean;
  };
  queryParams?: Array<{
    name: string;
    schema: ZodType;
    description: string;
    required?: boolean;
  }>;
  pathParams?: Array<{
    name: string;
    description: string;
    schema?: ZodType;
  }>;
  responses: Record<number, {
    description: string;
    schema?: ZodType;
  }>;
  auth?: boolean;
  deprecated?: boolean;
  rateLimit?: string;        // e.g., "100 req/min"
}

class RouteRegistry {
  private routes: RouteDoc[] = [];
  private schemas = new Map<string, { schema: ZodType; description?: string }>();

  // Register a route with its documentation
  register(doc: RouteDoc): void {
    this.routes.push(doc);
  }

  // Register a reusable schema component
  registerSchema(name: string, schema: ZodType, description?: string): void {
    this.schemas.set(name, { schema, description });
  }

  // Generate complete OpenAPI 3.1 specification
  generateSpec(info: {
    title: string;
    version: string;
    description: string;
    serverUrl: string;
  }): object {
    const paths: Record<string, any> = {};
    const components: Record<string, any> = { schemas: {}, securitySchemes: {} };

    // Add registered schemas as components
    for (const [name, { schema, description }] of this.schemas) {
      components.schemas[name] = {
        ...zodToOpenAPI(schema),
        ...(description ? { description } : {}),
      };
    }

    // Add security scheme
    components.securitySchemes.bearerAuth = {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    };

    // Convert each route to OpenAPI path item
    for (const route of this.routes) {
      const pathKey = route.path.replace(/:(\w+)/g, "{$1}"); // :id → {id}

      if (!paths[pathKey]) paths[pathKey] = {};

      const operation: any = {
        summary: route.summary,
        tags: route.tags,
        parameters: [],
        responses: {},
      };

      if (route.description) operation.description = route.description;
      if (route.deprecated) operation.deprecated = true;
      if (route.auth) operation.security = [{ bearerAuth: [] }];

      // Path parameters
      if (route.pathParams) {
        for (const param of route.pathParams) {
          operation.parameters.push({
            name: param.name,
            in: "path",
            required: true,
            description: param.description,
            schema: param.schema ? zodToOpenAPI(param.schema) : { type: "string" },
          });
        }
      }

      // Query parameters
      if (route.queryParams) {
        for (const param of route.queryParams) {
          operation.parameters.push({
            name: param.name,
            in: "query",
            required: param.required || false,
            description: param.description,
            schema: zodToOpenAPI(param.schema),
          });
        }
      }

      // Request body
      if (route.requestBody) {
        operation.requestBody = {
          required: route.requestBody.required !== false,
          description: route.requestBody.description,
          content: {
            "application/json": {
              schema: zodToOpenAPI(route.requestBody.schema),
            },
          },
        };
      }

      // Responses
      for (const [code, response] of Object.entries(route.responses)) {
        operation.responses[code] = {
          description: response.description,
          ...(response.schema
            ? {
                content: {
                  "application/json": {
                    schema: zodToOpenAPI(response.schema),
                  },
                },
              }
            : {}),
        };
      }

      // Add rate limit header to docs
      if (route.rateLimit) {
        operation.responses[429] = {
          description: `Rate limited (${route.rateLimit})`,
          headers: {
            "Retry-After": { schema: { type: "integer" }, description: "Seconds until rate limit resets" },
          },
        };
      }

      paths[pathKey][route.method.toLowerCase()] = operation;
    }

    return {
      openapi: "3.1.0",
      info: {
        title: info.title,
        version: info.version,
        description: info.description,
      },
      servers: [{ url: info.serverUrl }],
      paths,
      components,
    };
  }

  getRoutes(): RouteDoc[] {
    return [...this.routes];
  }
}

// Singleton registry used across the application
export const registry = new RouteRegistry();
```

## Step 3: Wire Routes to Auto-Register Documentation

Each route module registers its endpoints with the registry alongside the actual Hono route handler. Documentation stays next to the code it documents.

```typescript
// src/routes/users.ts — Example route module with inline documentation registration
import { Hono } from "hono";
import { z } from "zod";
import { registry } from "../docs/route-registry";
import { db } from "../db";

const app = new Hono();

// --- Schemas ---
const CreateUserSchema = z.object({
  name: z.string().min(1).max(100).describe("User's full name"),
  email: z.string().email().describe("Unique email address"),
  role: z.enum(["admin", "member", "viewer"]).describe("Access level"),
});

const UserResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]),
  createdAt: z.string().datetime(),
});

const UserListResponseSchema = z.object({
  users: z.array(UserResponseSchema),
  total: z.number().int(),
  page: z.number().int(),
  pages: z.number().int(),
});

// Register schemas as reusable components
registry.registerSchema("User", UserResponseSchema, "A platform user");
registry.registerSchema("CreateUser", CreateUserSchema);

// --- Routes with inline documentation ---

// GET /api/users
registry.register({
  method: "GET",
  path: "/api/users",
  summary: "List users",
  description: "Returns a paginated list of users. Supports filtering by role and searching by name.",
  tags: ["Users"],
  auth: true,
  queryParams: [
    { name: "page", schema: z.number().int().min(1).default(1), description: "Page number (1-indexed)" },
    { name: "limit", schema: z.number().int().min(1).max(100).default(20), description: "Items per page" },
    { name: "role", schema: z.enum(["admin", "member", "viewer"]).optional(), description: "Filter by role" },
    { name: "search", schema: z.string().optional(), description: "Search by name (partial match)" },
  ],
  responses: {
    200: { description: "User list", schema: UserListResponseSchema },
    401: { description: "Unauthorized" },
  },
  rateLimit: "100 req/min",
});

app.get("/", async (c) => {
  const page = Number(c.req.query("page") || 1);
  const limit = Math.min(Number(c.req.query("limit") || 20), 100);
  const role = c.req.query("role");
  const search = c.req.query("search");

  // actual implementation...
  const users = await db.query.users.findMany({
    limit,
    offset: (page - 1) * limit,
  });

  return c.json({ users, total: 0, page, pages: 0 });
});

// POST /api/users
registry.register({
  method: "POST",
  path: "/api/users",
  summary: "Create user",
  description: "Creates a new user account. Email must be unique across the platform.",
  tags: ["Users"],
  auth: true,
  requestBody: {
    schema: CreateUserSchema,
    description: "User creation payload",
  },
  responses: {
    201: { description: "User created", schema: UserResponseSchema },
    400: { description: "Validation error" },
    409: { description: "Email already exists" },
  },
});

app.post("/", async (c) => {
  const body = CreateUserSchema.parse(await c.req.json());
  // actual implementation...
  return c.json({}, 201);
});

// GET /api/users/:id
registry.register({
  method: "GET",
  path: "/api/users/:id",
  summary: "Get user by ID",
  tags: ["Users"],
  auth: true,
  pathParams: [
    { name: "id", description: "User UUID" },
  ],
  responses: {
    200: { description: "User details", schema: UserResponseSchema },
    404: { description: "User not found" },
  },
});

app.get("/:id", async (c) => {
  const { id } = c.req.param();
  // actual implementation...
  return c.json({});
});

export default app;
```

## Step 4: Serve Interactive Documentation

The generated OpenAPI spec powers an interactive documentation UI. The spec is regenerated on each request in development (always fresh) and cached in production.

```typescript
// src/routes/docs.ts — Serve OpenAPI spec and interactive Swagger UI
import { Hono } from "hono";
import { registry } from "../docs/route-registry";

const app = new Hono();
let cachedSpec: object | null = null;

// Generate or return cached OpenAPI spec
function getSpec(): object {
  if (cachedSpec && process.env.NODE_ENV === "production") {
    return cachedSpec;
  }

  cachedSpec = registry.generateSpec({
    title: "Analytics Platform API",
    version: "2.1.0",
    description: "REST API for the analytics platform. All endpoints require Bearer token authentication unless noted otherwise.",
    serverUrl: process.env.API_URL || "https://api.example.com",
  });

  return cachedSpec;
}

// JSON spec endpoint — consumed by Swagger UI and API clients
app.get("/openapi.json", (c) => {
  return c.json(getSpec());
});

// Interactive documentation UI using Scalar (modern Swagger UI alternative)
app.get("/", (c) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>API Documentation</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/api/docs/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;

  return c.html(html);
});

// CLI-friendly text endpoint for quick reference
app.get("/endpoints", (c) => {
  const routes = registry.getRoutes();
  const text = routes
    .map((r) => {
      const auth = r.auth ? "🔒" : "🔓";
      return `${auth} ${r.method.padEnd(7)} ${r.path.padEnd(40)} ${r.summary}`;
    })
    .join("\n");

  return c.text(`API Endpoints (${routes.length} total)\n${"=".repeat(80)}\n${text}`);
});

// Validation endpoint — check spec for completeness
app.get("/validate", async (c) => {
  const routes = registry.getRoutes();
  const issues: string[] = [];

  for (const route of routes) {
    if (!route.description) {
      issues.push(`${route.method} ${route.path}: missing description`);
    }
    if (!route.responses[200] && !route.responses[201]) {
      issues.push(`${route.method} ${route.path}: no success response defined`);
    }
    if (route.auth && !route.responses[401]) {
      issues.push(`${route.method} ${route.path}: auth required but no 401 response`);
    }
  }

  return c.json({
    totalRoutes: routes.length,
    documented: routes.filter((r) => r.description).length,
    issues,
    coverage: `${Math.round((routes.filter((r) => r.description).length / routes.length) * 100)}%`,
  });
});

export default app;
```

## Results

After deploying automated API documentation:

- **Documentation accuracy: 100%** — docs are generated from the same Zod schemas that validate requests; it's impossible for them to drift
- **Support tickets about incorrect docs dropped from 15/week to 0** — developers trust the docs because they're always current
- **New endpoint documentation time: 0 minutes extra** — developers write the schema for validation anyway; the registry call adds ~5 lines of metadata
- **Developer onboarding time cut by 60%** — new hires explore the interactive docs and see accurate request/response examples immediately; no more "ask someone which docs are wrong"
- **API adoption by external partners increased 40%** — accurate, interactive docs with try-it-out functionality lowered the integration barrier significantly
