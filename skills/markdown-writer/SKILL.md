---
name: markdown-writer
description: >-
  Generates well-structured technical documentation in Markdown. Use when a user
  asks to write docs, create a README, document an API, write a how-to guide,
  generate technical documentation, create a changelog, write a project wiki,
  or produce any structured Markdown content. Follows documentation best
  practices for clarity and completeness.
license: Apache-2.0
compatibility: "Works with any Markdown renderer"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: content
  tags: ["markdown", "documentation", "writing", "readme", "technical-writing"]
---

# Markdown Writer

## Overview

Generate well-structured technical documentation in Markdown format. Covers READMEs, API docs, how-to guides, changelogs, and any structured technical content using documentation best practices.

## Instructions

When a user asks you to write documentation or Markdown content, follow these steps:

### Step 1: Determine the document type

| Type | Purpose | Audience |
|------|---------|----------|
| README | Project introduction, setup, usage | New users and contributors |
| API docs | Endpoint reference with parameters and responses | Developers integrating the API |
| How-to guide | Step-by-step walkthrough for a specific task | Users solving a problem |
| Tutorial | Learning-oriented, progressive complexity | Beginners |
| Reference | Complete technical specification | Experienced users |
| Changelog | Version history with changes | All users |
| ADR | Architecture decision record | Team members |

### Step 2: Gather information

Before writing, collect:
- Read the codebase to understand what the project does
- Check existing docs for tone and style
- Identify the target audience (beginner, intermediate, expert)
- Note any prerequisites or dependencies
- Find code examples that demonstrate real usage

### Step 3: Write using these templates

The templates below sit in four-backtick fences so that the three-backtick fences inside them can be copied as they are.

**README template:**
````markdown
# Project Name

One-line description of what this project does.

## Installation

```bash
npm install project-name
```

## Quick Start

```javascript
const lib = require('project-name');
lib.doSomething();
```

## Usage

### Feature One
Explain the feature with a code example.

### Feature Two
Explain the feature with a code example.

## API Reference

### `functionName(param1, param2)`
- `param1` (string): Description
- `param2` (number, optional): Description. Default: `10`
- Returns: `Promise<Result>`

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | `3000` | Server port |
| `debug` | boolean | `false` | Enable debug logging |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
````

**API endpoint documentation:**
````markdown
### Create a User

```
POST /api/users
```

**Request body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Full name |
| `email` | string | Yes | Email address |
| `role` | string | No | Default: `"user"` |

**Example request:**
```bash
curl -X POST https://northwind.dev/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Doe", "email": "jane.doe@northwind.dev"}'
```

**Response (201 Created):**
```json
{
  "id": 42,
  "name": "Jane Doe",
  "email": "jane.doe@northwind.dev",
  "role": "user",
  "created_at": "2024-03-15T10:30:00Z"
}
```

**Error responses:**
| Status | Description |
|--------|-------------|
| `400` | Invalid request body |
| `409` | Email already exists |
````

**How-to guide template:**
````markdown
# How to Deploy to Production

## Prerequisites
- Docker 20+ installed
- AWS CLI configured with credentials

## Steps

### 1. Build the image
```bash
docker build -t myapp:latest .
```

### 2. Push to registry
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
docker tag myapp:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/myapp:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/myapp:latest
```

### 3. Deploy
```bash
aws ecs update-service --cluster prod --service myapp --force-new-deployment
```

## Troubleshooting

**Build fails with "out of memory":**
Increase Docker memory limit to at least 4GB in Docker Desktop settings.

**Deployment times out:**
Check that the health check endpoint returns 200 within 30 seconds.
````

### Step 4: Review and polish

Checklist before delivering:
- [ ] Title clearly states what the document covers
- [ ] Code examples are copy-paste ready (no placeholders that would break)
- [ ] Tables are used for structured data instead of long prose
- [ ] Headings follow a logical hierarchy (H1 > H2 > H3)
- [ ] Links are included for external references
- [ ] Prerequisites are listed before steps that require them

## Examples

### Example 1: Generate a README for a CLI tool

**User request:** "Write a README for my Node.js CLI tool that converts images"

**Output structure:**
```
# img-convert

Fast image format conversion from the command line.

## Installation
  npm install -g img-convert

## Usage
  img-convert input.png output.webp
  img-convert --quality 80 --resize 800x600 photo.jpg photo.webp
  img-convert --batch src/*.png --format webp --outdir dist/

## Options (table with flag, type, default, description)

## Supported Formats (table)

## Examples (3-4 real usage scenarios)

## Contributing

## License
```

### Example 2: Document an existing API from code

**User request:** "Generate API docs from my Express routes"

**Process:**
1. Read all route files to identify endpoints
2. Extract HTTP method, path, middleware, request/response types
3. Generate one section per endpoint with method, path, parameters, body, response, and example

**Output structure:**
```
# API Reference

Base URL: `https://api.northwind.dev/v1`
Authentication: Bearer token in Authorization header

## Users
### GET /users - List all users
### GET /users/:id - Get a user
### POST /users - Create a user
### PUT /users/:id - Update a user
### DELETE /users/:id - Delete a user

## Orders
### GET /orders - List orders
### POST /orders - Create an order
```

Each endpoint includes parameters table, example request, and example response.

## Guidelines

- Write for the reader, not yourself. Assume the reader has never seen this project.
- Start with the most common use case, not edge cases.
- Every code example must be complete enough to run. Do not leave out imports or setup.
- Use tables for anything with more than 3 key-value pairs. Tables are faster to scan than paragraphs.
- Keep paragraphs short (3-4 sentences max). Use bullet points for lists of items.
- Link to related documents rather than duplicating content.
- Use consistent formatting: backticks for code, bold for UI elements, italics sparingly.
- To show a code fence inside a code block, make the outer fence longer than the inner one (four backticks around three). Backslash-escaped backticks are not a fence: inside a code block they print literally, and outside one they render as a plain paragraph.
- For API docs, always include at least one complete request/response example per endpoint.
- Version documentation alongside code. If the API changes, the docs must change.
- Do not document obvious things. "The `name` field is the name" adds no value.
