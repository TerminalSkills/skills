---
name: api-doc-generator
description: >-
  Generate and validate API documentation from source code, route definitions,
  and existing endpoints. Use when a user asks to generate API docs, create
  OpenAPI specs, document endpoints, sync docs with code, detect documentation
  drift, or produce Swagger files from a codebase.
license: Apache-2.0
compatibility: "Works with any REST or GraphQL API codebase. Supports Express, FastAPI, Django, Rails, Spring Boot, and NestJS route detection."
metadata:
  author: carlos
  version: "1.0.0"
  category: development
  tags: ["api", "documentation", "openapi", "swagger"]
---

# API Documentation Generator

## Overview

Generates accurate API documentation by analyzing route definitions, controller logic, request/response types, and middleware chains in your codebase. Detects drift between existing docs and actual implementation, then produces updated OpenAPI 3.x specs.

## Instructions

When asked to generate or update API documentation:

1. **Identify the framework** by scanning `package.json`, `requirements.txt`, `Gemfile`, `pom.xml`, or `go.mod`.

2. **Locate route definitions:**
   - Express/NestJS: scan for `router.get/post/put/delete`, `@Get()/@Post()` decorators
   - FastAPI: scan for `@app.get`, `@router.post` decorators
   - Django REST: scan for `urlpatterns`, `ViewSet` classes
   - Rails: parse `config/routes.rb`
   - Spring Boot: scan for `@RequestMapping`, `@GetMapping` annotations

3. **Extract for each endpoint:**
   - HTTP method and path (including path parameters)
   - Request body schema (from TypeScript types, Pydantic models, serializers, or annotations)
   - Response schema and status codes
   - Authentication requirements (middleware, decorators, guards)
   - Query parameters and headers

4. **If existing OpenAPI/Swagger spec exists:**
   - Parse it and compare against discovered endpoints
   - Report added endpoints (in code but not in docs)
   - Report removed endpoints (in docs but not in code)
   - Report changed schemas (field additions, type changes, new required fields)

5. **Generate output** as a valid OpenAPI 3.0.x YAML document with:
   - Proper `info`, `servers`, and `components/schemas` sections
   - Realistic `example` values for every field
   - Error response schemas (400, 401, 403, 404, 500)

6. **Generate a human-readable changelog** listing all differences found.

## Examples

### Example 1: Generate docs from Express app

**Input:**
```
Generate API documentation for this Express app in src/routes/
```

**Output:**
```yaml
openapi: "3.0.3"
info:
  title: User Management API
  version: "2.1.0"
paths:
  /api/users:
    get:
      summary: List users with pagination
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        "200":
          description: Paginated user list
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/UserListResponse"
              example:
                users:
                  - id: "usr_8f2k3j"
                    email: "maria@example.com"
                    role: "editor"
                    createdAt: "2025-11-03T14:22:00Z"
                total: 847
                page: 1
                limit: 20
```

### Example 2: Detect documentation drift

**Input:**
```
Compare our OpenAPI spec in docs/api.yaml against the actual routes in src/controllers/
```

**Output:**
```
Documentation Drift Report
===========================

3 endpoints added in code (missing from docs):
  POST /api/users/bulk-import     — src/controllers/users.ts:142
  GET  /api/users/:id/activity    — src/controllers/users.ts:198
  PUT  /api/settings/notifications — src/controllers/settings.ts:55

1 endpoint removed from code (stale in docs):
  DELETE /api/users/:id/avatar    — last seen in git at commit a3f8c21

2 schema changes detected:
  POST /api/users — added required field "organizationId" (string)
  GET /api/users/:id — response now includes "lastLoginAt" (datetime, nullable)
```

## Guidelines

- Always validate generated OpenAPI against the spec using structural checks before outputting.
- Use `$ref` for shared schemas — never duplicate the same object definition.
- Include authentication info (`securitySchemes`) when auth middleware is detected.
- Mark deprecated endpoints with `deprecated: true` instead of removing them.
- When unsure about a response type, inspect test files or integration tests for actual payloads.
- Prefer inferring types from TypeScript interfaces, Pydantic models, or serializer classes over guessing from raw handler code.
