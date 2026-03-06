---
name: bruno
description: >-
  Test and debug APIs with Bruno, the open-source API client. Use when a user asks to create API requests, organize collections, write test scripts, use environments and variables, or collaborate on API workflows stored in Git.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["api-client", "http", "testing", "git-friendly", "open-source"]
---
# Bruno — Git-Friendly API Client

## Overview

You are an expert in Bruno, the open-source API client that stores collections as plain text files in your Git repository. Unlike Postman (cloud-synced, proprietary format), Bruno uses a human-readable format (Bru) that lives alongside your code — versioned, reviewable, and shareable via Git.

## Instructions

### Collection Structure

```
api-collection/
├── bruno.json                    # Collection config
├── environments/
│   ├── dev.bru
│   ├── staging.bru
│   └── production.bru
├── auth/
│   ├── login.bru
│   ├── register.bru
│   └── refresh-token.bru
├── users/
│   ├── list-users.bru
│   ├── get-user.bru
│   ├── create-user.bru
│   └── update-user.bru
└── orders/
    ├── list-orders.bru
    ├── create-order.bru
    └── process-refund.bru
```

### Bru File Format

```bru
# auth/login.bru — Human-readable, Git-diffable

meta {
  name: Login
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/api/auth/login
  body: json
  auth: none
}

headers {
  Content-Type: application/json
}

body:json {
  {
    "email": "{{testEmail}}",
    "password": "{{testPassword}}"
  }
}

script:post-response {
  // Save token for subsequent requests
  if (res.status === 200) {
    bru.setVar("authToken", res.body.token);
    bru.setVar("userId", res.body.user.id);
  }
}

tests {
  test("should return 200", () => {
    expect(res.status).to.equal(200);
  });

  test("should return token", () => {
    expect(res.body.token).to.be.a("string");
    expect(res.body.token.length).to.be.greaterThan(0);
  });

  test("should return user", () => {
    expect(res.body.user.email).to.equal("{{testEmail}}");
  });
}
```

### Environments

```bru
# environments/dev.bru
vars {
  baseUrl: http://localhost:3000
  testEmail: test@example.com
  testPassword: testpass123
}

vars:secret [
  stripeKey,
  dbPassword
]
```

### Scripting

```javascript
// Pre-request script — runs before sending
const crypto = require("crypto");
const timestamp = Date.now().toString();
const signature = crypto
  .createHmac("sha256", bru.getVar("apiSecret"))
  .update(timestamp)
  .digest("hex");

bru.setVar("timestamp", timestamp);
bru.setVar("signature", signature);

// Post-response script — process responses
if (res.status === 200) {
  const users = res.body.data;
  bru.setVar("firstUserId", users[0].id);
  console.log(`Found ${users.length} users`);
}

// Chain requests — use variables from previous responses
// login.bru sets {{authToken}}
// create-order.bru uses {{authToken}} in auth header
```

### CLI for CI/CD

```bash
# Install CLI
npm install -g @usebruno/cli

# Run entire collection
bru run --env dev

# Run specific folder
bru run auth/ --env dev

# Run with custom environment variables
bru run --env production --env-var apiKey=sk_live_xxx

# Output JUnit XML for CI
bru run --env dev --output results.xml --format junit
```

## Installation

```bash
# Desktop app (GUI)
# Download from https://www.usebruno.com/downloads

# CLI
npm install -g @usebruno/cli
```

## Examples

**Example 1: User asks to set up bruno**

User: "Help me set up bruno for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure bruno
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with bruno**

User: "Create a dashboard using bruno"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Git-first workflow** — Store Bruno collections in your repo next to application code; review API changes in PRs
2. **Environment files for config** — Use environments for base URLs and credentials; secrets marked as `vars:secret` are never committed
3. **Test assertions** — Write tests in every request; run them in CI to catch API regressions
4. **Script chaining** — Use `bru.setVar()` in post-response scripts to pass data between requests (token → subsequent calls)
5. **Folder organization** — Mirror your API structure (auth/, users/, orders/); each folder can have its own pre-request scripts
6. **CI/CD integration** — Run `bru run --env staging` after deployment to verify API contract; fail the pipeline on test failures
7. **No cloud dependency** — Unlike Postman, your collections never leave your machine or repo; no sync, no cloud, no account required
8. **Documentation as requests** — Bruno collections serve as living API documentation; new team members run requests to understand the API
