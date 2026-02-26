---
name: mintlify
description: >-
  Create beautiful developer documentation with Mintlify — AI-powered docs
  platform. Use when someone asks to "create documentation site", "Mintlify",
  "developer docs", "API documentation", "beautiful docs like Stripe", or
  "documentation platform with AI search". Covers page creation, API reference
  generation, components, analytics, and AI chat.
license: Apache-2.0
compatibility: "MDX. Hosted or self-hosted. GitHub integration."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["documentation", "mintlify", "docs", "api-reference", "developer-experience"]
---

# Mintlify

## Overview

Mintlify is a documentation platform that makes developer docs look like Stripe's — beautiful by default, with built-in API reference generation, AI-powered search, analytics, and MDX components. Write in MDX, push to GitHub, docs deploy automatically. Includes interactive API playground, versioning, and AI chatbot trained on your docs.

## When to Use

- Creating documentation for an API or developer product
- Want beautiful docs without building a custom site
- Need interactive API reference with try-it-now playground
- Want AI-powered search and chatbot for your docs
- Replacing ReadMe, GitBook, or Docusaurus with something prettier

## Instructions

### Setup

```bash
# Install CLI
npm install -g mintlify

# Initialize in your project
mintlify init

# Local development
mintlify dev
```

### Configuration

```json
// mint.json — Documentation configuration
{
  "name": "My Product",
  "logo": {
    "dark": "/logo/dark.svg",
    "light": "/logo/light.svg"
  },
  "favicon": "/favicon.svg",
  "colors": {
    "primary": "#0D9373",
    "light": "#07C983",
    "dark": "#0D9373"
  },
  "navigation": [
    {
      "group": "Getting Started",
      "pages": ["introduction", "quickstart", "authentication"]
    },
    {
      "group": "API Reference",
      "pages": [
        "api-reference/overview",
        {
          "group": "Users",
          "pages": [
            "api-reference/users/list",
            "api-reference/users/create",
            "api-reference/users/get",
            "api-reference/users/update"
          ]
        }
      ]
    },
    {
      "group": "Guides",
      "pages": ["guides/webhooks", "guides/rate-limits", "guides/errors"]
    }
  ],
  "api": {
    "baseUrl": "https://api.myproduct.com",
    "auth": { "method": "bearer" }
  },
  "topbarLinks": [
    { "name": "Dashboard", "url": "https://app.myproduct.com" }
  ],
  "tabs": [
    { "name": "API Reference", "url": "api-reference" },
    { "name": "SDKs", "url": "sdks" }
  ],
  "footerSocials": {
    "github": "https://github.com/myproduct",
    "twitter": "https://twitter.com/myproduct"
  }
}
```

### Writing Pages

```mdx
---
title: "Quickstart"
description: "Get up and running in 5 minutes"
---

## Install the SDK

<CodeGroup>
```bash npm
npm install @myproduct/sdk
```
```bash yarn
yarn add @myproduct/sdk
```
```bash pnpm
pnpm add @myproduct/sdk
```
</CodeGroup>

## Initialize

```typescript
import { MyProduct } from "@myproduct/sdk";

const client = new MyProduct({
  apiKey: process.env.MYPRODUCT_API_KEY,
});
```

<Note>
  Never expose your API key in client-side code. Use environment variables.
</Note>

## Make your first request

<Steps>
  <Step title="Create a resource">
    ```typescript
    const resource = await client.resources.create({
      name: "My First Resource",
    });
    ```
  </Step>
  <Step title="Verify it worked">
    ```typescript
    const fetched = await client.resources.get(resource.id);
    console.log(fetched.name); // "My First Resource"
    ```
  </Step>
</Steps>

<Card title="Full API Reference" icon="code" href="/api-reference">
  Explore all available endpoints
</Card>
```

### API Reference Pages

```mdx
---
title: "Create User"
api: "POST https://api.myproduct.com/v1/users"
description: "Create a new user account"
---

<ParamField body="email" type="string" required>
  User's email address
</ParamField>

<ParamField body="name" type="string" required>
  Full name (2-100 characters)
</ParamField>

<ParamField body="role" type="string" default="user">
  One of: `user`, `admin`
</ParamField>

<ResponseExample>
```json 200
{
  "id": "usr_1a2b3c",
  "email": "kai@example.com",
  "name": "Kai",
  "role": "user",
  "created_at": "2026-02-26T12:00:00Z"
}
```
```json 400
{
  "error": "validation_error",
  "message": "Email is required"
}
```
</ResponseExample>
```

## Examples

### Example 1: Document an API from OpenAPI spec

**User prompt:** "Generate documentation for my REST API from our OpenAPI spec."

The agent will convert the OpenAPI spec to Mintlify pages, create navigation structure, add code examples in multiple languages, and set up the API playground.

### Example 2: Create product docs with guides

**User prompt:** "Set up documentation for our SaaS product — quickstart, guides, and API reference."

The agent will initialize Mintlify, create the navigation structure, write quickstart and guide pages with MDX components, and configure deployment.

## Guidelines

- **MDX for rich content** — use components like `<Note>`, `<Card>`, `<Steps>`, `<CodeGroup>`
- **`mint.json` is the config** — navigation, branding, API settings
- **API pages auto-generate playground** — users can try API calls from the docs
- **`mintlify dev` for local preview** — hot reload during writing
- **GitHub integration** — push to repo, docs deploy automatically
- **AI chatbot** — trained on your docs, answers user questions
- **OpenAPI import** — `mintlify openapi <spec.yaml>` generates API reference pages
- **Versioning** — support multiple API versions
- **Analytics built-in** — see which pages are popular, where users drop off
- **Custom domains** — `docs.myproduct.com`
