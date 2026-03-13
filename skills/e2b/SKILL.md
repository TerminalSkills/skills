---
name: e2b
description: >-
   You are an expert in E2B, the cloud platform for running AI-generated code
  in secure sandboxes. You help developers give AI agents the ability to
  execute code, install packages, read/write files, and run long processes in
  isolated cloud environments — each sandbox is a lightweight VM that boots in
  ~150ms with full Linux, filesystem, and networking.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - sandbox
    - code-execution
    - agent
    - cloud
    - secure
    - python
    - javascript
---

# E2B — Sandboxed Code Execution for AI

You are an expert in E2B, the cloud platform for running AI-generated code in secure sandboxes. You help developers give AI agents the ability to execute code, install packages, read/write files, and run long processes in isolated cloud environments — each sandbox is a lightweight VM that boots in ~150ms with full Linux, filesystem, and networking.

## Core Capabilities

```typescript
import { Sandbox } from "@e2b/code-interpreter";

const sandbox = await Sandbox.create();

// Execute Python
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
console.log(result.text);     // "Data points: 10"
console.log(result.results);  // [{ type: "png", data: "base64..." }]

// Install packages on the fly
await sandbox.runCode("!pip install scikit-learn");
await sandbox.runCode(`
from sklearn.linear_model import LinearRegression
model = LinearRegression().fit([[1],[2],[3]], [1,2,3])
print(model.predict([[4]]))
`);

// File operations
await sandbox.files.write("/home/user/data.csv", csvContent);
const output = await sandbox.runCode("import pandas as pd; print(pd.read_csv('/home/user/data.csv').head())");
const fileBytes = await sandbox.files.read("/tmp/chart.png");

// JavaScript/TypeScript execution
const jsResult = await sandbox.runCode(`
const response = await fetch('https://api.github.com/repos/e2b-dev/e2b');
const data = await response.json();
console.log(data.stargazers_count);
`, { language: "javascript" });

await sandbox.kill();
```

## Installation

```bash
npm install @e2b/code-interpreter
```

## Best Practices

1. **150ms boot** — Sandboxes start near-instantly; create per-request for isolation
2. **Pre-installed packages** — NumPy, Pandas, Matplotlib available by default; install more with pip
3. **File I/O** — Upload data, download results; sandboxes have full filesystem access
4. **Charts as base64** — Matplotlib/Plotly charts returned as base64 images; render in your UI
5. **Custom templates** — Create sandbox templates with pre-installed packages for faster startup
6. **Timeout** — Set sandbox timeout; auto-killed after duration; prevents runaway processes
7. **Networking** — Sandboxes have internet access; fetch APIs, download data, install from PyPI
8. **Agent integration** — Use as a tool in LangChain/CrewAI/Mastra agents; AI writes code, E2B runs it
