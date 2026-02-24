---
name: openapi-spec
description: >-
  Design and maintain OpenAPI specifications. Use when a user asks to create
  an API spec, document REST APIs, generate client SDKs from a spec, validate
  API contracts, or implement design-first API development.
license: Apache-2.0
compatibility: 'Any language, any framework'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - openapi
    - swagger
    - api-design
    - documentation
    - rest
---

# OpenAPI Specification

## Overview

OpenAPI (formerly Swagger) is the standard for describing REST APIs. Write a YAML/JSON spec once, then generate documentation, client SDKs, server stubs, mock servers, and tests automatically. Design-first development catches breaking changes before writing code.

## Instructions

### Step 1: Define API Spec

```yaml
# openapi.yaml — API specification
openapi: 3.1.0
info:
  title: Project Management API
  version: 1.0.0
  description: API for managing projects and tasks

servers:
  - url: https://api.example.com/v1
    description: Production
  - url: http://localhost:3000/v1
    description: Local development

paths:
  /projects:
    get:
      summary: List all projects
      operationId: listProjects
      tags: [Projects]
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [active, archived, all]
            default: active
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
        - name: cursor
          in: query
          schema:
            type: string
          description: Pagination cursor from previous response
      responses:
        '200':
          description: List of projects
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Project'
                  nextCursor:
                    type: string
                    nullable: true

    post:
      summary: Create a project
      operationId: createProject
      tags: [Projects]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateProjectInput'
      responses:
        '201':
          description: Project created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Project'
        '422':
          $ref: '#/components/responses/ValidationError'

  /projects/{projectId}:
    get:
      summary: Get project by ID
      operationId: getProject
      tags: [Projects]
      parameters:
        - name: projectId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Project details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Project'
        '404':
          $ref: '#/components/responses/NotFound'

components:
  schemas:
    Project:
      type: object
      required: [id, name, status, createdAt]
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
          example: "Website Redesign"
        description:
          type: string
          nullable: true
        status:
          type: string
          enum: [active, archived]
        taskCount:
          type: integer
        createdAt:
          type: string
          format: date-time

    CreateProjectInput:
      type: object
      required: [name]
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 100
        description:
          type: string
          maxLength: 500

  responses:
    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            type: object
            properties:
              error:
                type: string
                example: "Project not found"

    ValidationError:
      description: Validation error
      content:
        application/json:
          schema:
            type: object
            properties:
              error:
                type: string
              details:
                type: array
                items:
                  type: object
                  properties:
                    field:
                      type: string
                    message:
                      type: string

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

### Step 2: Generate TypeScript Client

```bash
npx openapi-typescript openapi.yaml -o src/api/schema.ts
```

```typescript
// Generated types are used with fetch or axios
import type { paths } from './schema'

type ListProjectsResponse = paths['/projects']['get']['responses']['200']['content']['application/json']
type CreateProjectInput = paths['/projects']['post']['requestBody']['content']['application/json']
```

### Step 3: Validate and Lint

```bash
npx @redocly/cli lint openapi.yaml
npx @redocly/cli preview-docs openapi.yaml  # live preview
```

## Guidelines

- Design-first: write the spec before implementing. It's cheaper to change YAML than code.
- Use `$ref` extensively — reusable schemas prevent duplication and inconsistency.
- Add `operationId` to every endpoint — it's used for SDK method names.
- Use Redocly or Stoplight for visual spec editing and documentation hosting.
- Version your API in the URL path (`/v1/`) for breaking changes; use spec `version` for minor updates.
