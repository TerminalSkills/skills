---
name: e2b-sandbox
description: >-
  Run AI-generated code safely in cloud sandboxes with E2B — secure execution
  environments for LLM agents. Use when someone asks to "run code in a sandbox",
  "E2B", "execute AI-generated code safely", "code interpreter for AI",
  "sandboxed code execution", "run untrusted code", or "give my AI agent a
  computer". Covers sandbox creation, code execution, file system, process
  management, and custom environments.
license: Apache-2.0
compatibility: "TypeScript/Python SDK. Cloud sandboxes (E2B hosted or self-hosted)."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["sandbox", "code-execution", "e2b", "ai-agents", "security"]
---

# E2B Sandbox

## Overview

E2B provides cloud sandboxes for running AI-generated code safely. Each sandbox is an isolated microVM — the AI agent can execute code, install packages, read/write files, and run processes without any risk to your infrastructure. Spins up in ~150ms, supports any language, and shuts down automatically. The building block for code interpreters, AI coding agents, and data analysis tools.

## When to Use

- AI agent needs to execute code (Python, JS, bash, etc.)
- Running untrusted or AI-generated code safely
- Building a code interpreter or data analysis assistant
- Need isolated environments for each user/session
- AI agent that needs filesystem + process control

## Instructions

### Setup

```bash
npm install @e2b/code-interpreter
# Or for full sandbox control:
npm install e2b
```

### Code Interpreter (Quickstart)

```typescript
// interpreter.ts — Run code in a sandbox with results
import { CodeInterpreter } from "@e2b/code-interpreter";

const sandbox = await CodeInterpreter.create({
  apiKey: process.env.E2B_API_KEY,
});

// Execute Python code
const result = await sandbox.notebook.execCell(`
import pandas as pd
import numpy as np

# Generate sample data
data = pd.DataFrame({
    'date': pd.date_range('2026-01-01', periods=30),
    'revenue': np.random.uniform(1000, 5000, 30),
    'users': np.random.randint(100, 1000, 30),
})

print(f"Total revenue: ${data['revenue'].sum():,.2f}")
print(f"Average users: {data['users'].mean():.0f}")
data.describe()
`);

console.log(result.text);    // Printed output
console.log(result.results); // Rich results (DataFrames, plots)

// Execute JavaScript
const jsResult = await sandbox.notebook.execCell(`
const response = await fetch('https://api.github.com/repos/e2b-dev/e2b');
const data = await response.json();
console.log(\`Stars: \${data.stargazers_count}\`);
`, { language: "javascript" });

await sandbox.close();
```

### Full Sandbox Control

```typescript
// sandbox.ts — Full filesystem + process control
import { Sandbox } from "e2b";

const sandbox = await Sandbox.create({
  template: "base",  // or custom template
  apiKey: process.env.E2B_API_KEY,
});

// Write files
await sandbox.filesystem.write("/home/user/app.py", `
import json
data = {"status": "ok", "message": "Hello from sandbox!"}
print(json.dumps(data))
`);

// Run processes
const proc = await sandbox.process.start({
  cmd: "python3 /home/user/app.py",
});
await proc.wait();
console.log(proc.output.stdout); // {"status": "ok", ...}

// Install packages
await sandbox.process.start({ cmd: "pip install requests beautifulsoup4" }).wait();

// Read files
const content = await sandbox.filesystem.read("/home/user/output.txt");

// List directory
const files = await sandbox.filesystem.list("/home/user/");

await sandbox.close();
```

### Custom Sandbox Templates

```dockerfile
# e2b.Dockerfile — Custom sandbox with pre-installed tools
FROM e2b/base:latest

RUN pip install pandas numpy matplotlib scikit-learn
RUN npm install -g typescript tsx

COPY ./scripts /home/user/scripts
```

```bash
# Build and deploy custom template
e2b template build -n my-data-sandbox
# Now use: Sandbox.create({ template: "my-data-sandbox" })
```

### Integration with LLM Agents

```typescript
// agent.ts — AI agent with code execution capability
import OpenAI from "openai";
import { CodeInterpreter } from "@e2b/code-interpreter";

const openai = new OpenAI();
const sandbox = await CodeInterpreter.create();

const messages = [
  {
    role: "system" as const,
    content: "You are a data analyst. Write Python code to answer questions. Use pandas for data manipulation.",
  },
  {
    role: "user" as const,
    content: "Analyze this CSV and find the top 5 customers by revenue.",
  },
];

// Upload data to sandbox
await sandbox.filesystem.write("/home/user/data.csv", csvData);

// Get code from LLM
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages,
});

const code = extractCodeFromResponse(response.choices[0].message.content!);

// Execute in sandbox safely
const result = await sandbox.notebook.execCell(code);
console.log(result.text);

await sandbox.close();
```

## Examples

### Example 1: Build a code interpreter chatbot

**User prompt:** "Build a chatbot where users can ask data questions and it runs Python to answer."

The agent will create an E2B sandbox per conversation, pass user questions to an LLM for code generation, execute the code safely, and return results with visualizations.

### Example 2: AI coding agent with file access

**User prompt:** "My AI agent needs to write, test, and fix code autonomously."

The agent will set up E2B sandboxes where the AI can create files, run tests, read error output, and iterate until tests pass — all safely isolated.

## Guidelines

- **One sandbox per session** — isolate users/conversations from each other
- **150ms cold start** — fast enough for interactive use
- **Auto-shutdown** — sandboxes close after timeout (default 5 min)
- **Custom templates for speed** — pre-install packages to avoid install time
- **File upload/download** — `filesystem.write()` and `filesystem.read()`
- **Streaming output** — `process.start()` with `onStdout` callback
- **24h max lifetime** — sandboxes are ephemeral, not persistent servers
- **Network access** — sandboxes can fetch URLs (useful for API calls)
- **No GPU** — CPU-only sandboxes (use modal.com for GPU workloads)
- **Free tier: 100 sandbox hours/month** — enough for development
