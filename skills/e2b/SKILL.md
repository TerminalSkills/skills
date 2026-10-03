---
name: e2b
description: >-
  E2B is a cloud platform that gives AI agents secure, isolated sandboxes —
  ephemeral Linux VMs with a filesystem, package managers, and internet
  access — to run AI-generated code safely. Use when a user wants an agent to
  execute Python or JavaScript, install packages, read/write files, or run a
  long process without risking the host machine, or wants to wire code
  execution into a LangChain, CrewAI, or custom agent loop.
license: Apache-2.0
compatibility: "Node.js 20.18+ or Python 3.8+, an E2B API key"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags:
    - sandbox
    - code-execution
    - ai-agents
    - cloud
    - e2b
  repository: https://github.com/e2b-dev/E2B
---

# E2B — Sandboxed Code Execution for AI

## Overview

E2B runs AI-generated code inside short-lived, isolated cloud sandboxes rather than on the host machine. Each sandbox is a Linux VM created from a snapshot, with its own filesystem, package managers, and outbound internet access; it is destroyed when killed or when it times out. The `@e2b/code-interpreter` (JS/TS) and `e2b-code-interpreter` (Python) packages add a `runCode` method on top of the base E2B SDK that is purpose-built for data/AI workloads: it returns rich results (stdout/stderr, tracebacks, and rendered outputs like matplotlib charts as base64 images) instead of just an exit code.

## Instructions

### Install and authenticate

```bash
npm install @e2b/code-interpreter dotenv
```

Set `E2B_API_KEY` (from the E2B dashboard) as an environment variable — never hardcode it in source.

### Run code in a sandbox

```typescript
import { Sandbox } from "@e2b/code-interpreter";

const sandbox = await Sandbox.create(); // default timeout: 5 minutes

const result = await sandbox.runCode(`
import pandas as pd
import matplotlib.pyplot as plt

df = pd.DataFrame({"x": range(10), "y": [i**2 for i in range(10)]})
plt.figure(figsize=(8, 5))
plt.plot(df.x, df.y)
plt.title("Quadratic Growth")
plt.savefig("/tmp/chart.png")
print(f"Data points: {len(df)}")
`);

console.log(result.logs.stdout); // ["Data points: 10"]
console.log(result.results);     // [{ type: "png", data: "base64..." }]

await sandbox.kill();
```

### Install packages, read/write files, extend the timeout

```typescript
await sandbox.runCode("!pip install scikit-learn");
await sandbox.runCode(`
from sklearn.linear_model import LinearRegression
model = LinearRegression().fit([[1], [2], [3]], [1, 2, 3])
print(model.predict([[4]]))
`);

await sandbox.files.write("/tmp/sales.csv", csvContent);
const preview = await sandbox.runCode(
  "import pandas as pd; print(pd.read_csv('/tmp/sales.csv').head())"
);
const chartBytes = await sandbox.files.read("/tmp/chart.png");

// Default lifetime is 5 minutes; extend it explicitly for longer jobs
// (max 1 hour on the Hobby plan, 24 hours on Pro).
await sandbox.setTimeout(10 * 60_000);
```

### Run JavaScript instead of Python

```typescript
const jsResult = await sandbox.runCode(
  `
  const response = await fetch('https://api.github.com/repos/e2b-dev/e2b');
  const data = await response.json();
  console.log(data.stargazers_count);
  `,
  { language: "javascript" }
);
```

## Examples

### Example 1: "Let an agent analyze a CSV and return a chart"

```typescript
import { Sandbox } from "@e2b/code-interpreter";
import { readFileSync } from "fs";

const sandbox = await Sandbox.create();
const csv = readFileSync("quarterly-revenue.csv");
await sandbox.files.write("/tmp/quarterly-revenue.csv", csv);

const analysis = await sandbox.runCode(`
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("/tmp/quarterly-revenue.csv")
plt.bar(df["quarter"], df["revenue"])
plt.savefig("/tmp/revenue.png")
print(df.describe())
`);

console.log(analysis.logs.stdout.join("\n"));
const [chart] = analysis.results.filter((r) => r.png);
await sandbox.kill();
```

The agent writes and runs arbitrary pandas/matplotlib code; `analysis.results` carries the chart back as a base64 PNG with no file download step needed.

### Example 2: "Give a LangChain agent a code-execution tool"

```typescript
import { Sandbox } from "@e2b/code-interpreter";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const sandbox = await Sandbox.create({ timeoutMs: 10 * 60_000 });

const runPython = tool(
  async ({ code }) => {
    const execution = await sandbox.runCode(code);
    return execution.logs.stdout.join("\n") || execution.error?.value || "";
  },
  {
    name: "run_python",
    description: "Executes Python code in a sandboxed environment and returns stdout.",
    schema: z.object({ code: z.string() }),
  }
);
```

The agent calls `run_python` whenever it needs to compute something instead of guessing; the sandbox's isolation means a wrong or malicious snippet can't touch the host.

## Guidelines

- A sandbox self-destructs after its timeout (default 5 minutes); call `sandbox.setTimeout()` before it expires for long-running jobs, and always `kill()` sandboxes you're done with rather than relying on the timeout alone, since idle sandboxes still bill for uptime.
- Never bake the `E2B_API_KEY` into committed code or client-side bundles — the key can create sandboxes and billed compute on your account.
- Build a custom sandbox template (prebaked with your packages) when cold-installing dependencies on every run is too slow; the base template includes NumPy, Pandas, and Matplotlib but not arbitrary packages.
- Sandboxes have outbound internet access by default — treat that as an attack surface if you're running untrusted, user-submitted code, not just AI-generated code you've reviewed.
- Use `@e2b/code-interpreter`'s `runCode` for data/analysis workloads that need rich results (charts, tracebacks); use the base `e2b` SDK's shell commands (`sandbox.commands.exec`) for general-purpose process execution that doesn't need that return shape.
