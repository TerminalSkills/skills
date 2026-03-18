---
name: e2b-code-interpreter
description: >-
  Secure sandboxed code execution for AI agents using E2B. Use when: running
  AI-generated code safely, building coding assistants, data analysis agents,
  secure multi-tenant code execution, or any scenario where untrusted code must
  run in an isolated environment.
license: Apache-2.0
compatibility: "Requires Node.js 18+ or Python 3.9+. E2B API key required."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["e2b", "code-interpreter", "sandbox", "ai-agents", "code-execution"]
  use-cases:
    - "Run AI-generated Python code safely in an isolated sandbox"
    - "Build a coding assistant that executes and streams results back to users"
    - "Data analysis agent that processes CSV files in a secure environment"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# E2B Code Interpreter

## Overview

E2B provides secure, isolated sandbox environments for executing AI-generated code. Each sandbox is an isolated microVM — it cannot access the host system, the internet (unless configured), or other sandboxes. Use it whenever an AI agent needs to run code safely.

Supports Python, JavaScript, and Bash out of the box. Sandboxes can be short-lived (one-shot execution) or long-running (for multi-turn sessions).

## Setup

### Install SDK

```bash
# JavaScript / TypeScript
npm install @e2b/code-interpreter

# Python
pip install e2b-code-interpreter
```

### Authentication

Set your E2B API key as an environment variable:

```bash
export E2B_API_KEY=e2b_your_api_key_here
```

Get your API key at https://e2b.dev/dashboard.

## Instructions

### Step 1: Create a sandbox

```typescript
// TypeScript
import { Sandbox } from '@e2b/code-interpreter'

const sandbox = await Sandbox.create()
```

```python
# Python
from e2b_code_interpreter import Sandbox

sandbox = Sandbox()
```

### Step 2: Execute code

#### Python execution

```typescript
// TypeScript
const result = await sandbox.runCode(`
import pandas as pd
import numpy as np

data = {'values': [10, 20, 30, 40, 50]}
df = pd.DataFrame(data)
print(df.describe())
print("Mean:", df['values'].mean())
`)

console.log(result.text)       // stdout
console.log(result.results)    // rich outputs (charts, tables)
console.log(result.error)      // any errors
```

```python
# Python
execution = sandbox.run_code("""
import pandas as pd
import numpy as np

data = {'values': [10, 20, 30, 40, 50]}
df = pd.DataFrame(data)
print(df.describe())
print("Mean:", df['values'].mean())
""")

print(execution.text)    # stdout
print(execution.error)   # stderr / exceptions
```

#### JavaScript execution

```typescript
const result = await sandbox.runCode(`
const arr = [1, 2, 3, 4, 5]
const sum = arr.reduce((a, b) => a + b, 0)
console.log('Sum:', sum)
console.log('Average:', sum / arr.length)
`, { language: 'javascript' })
```

#### Bash execution

```typescript
const result = await sandbox.runCode(`
echo "System info:"
uname -a
python3 --version
node --version
`, { language: 'bash' })
```

### Step 3: Stream output

For long-running executions, stream stdout/stderr in real time:

```typescript
const result = await sandbox.runCode(`
import time
for i in range(10):
    print(f"Step {i+1}/10")
    time.sleep(0.5)
`, {
  onStdout: (output) => process.stdout.write(output.line + '\n'),
  onStderr: (output) => process.stderr.write(output.line + '\n'),
})
```

```python
# Python streaming
execution = sandbox.run_code(
    """
import time
for i in range(10):
    print(f"Step {i+1}/10", flush=True)
    time.sleep(0.5)
""",
    on_stdout=lambda output: print(output.line),
    on_stderr=lambda output: print("ERR:", output.line),
)
```

### Step 4: Upload and download files

```typescript
// Upload a file to the sandbox
const fileContent = Buffer.from('name,age\nAlice,30\nBob,25')
await sandbox.files.write('/home/user/data.csv', fileContent)

// Run code that processes the file
const result = await sandbox.runCode(`
import pandas as pd
df = pd.read_csv('/home/user/data.csv')
print(df)
print("Average age:", df['age'].mean())
`)

// Download a file from the sandbox
const outputBytes = await sandbox.files.read('/home/user/output.png')
```

```python
# Python upload/download
sandbox.files.write('/home/user/data.csv', b'name,age\nAlice,30\nBob,25')

execution = sandbox.run_code("""
import pandas as pd
df = pd.read_csv('/home/user/data.csv')
print(df)
""")

output_bytes = sandbox.files.read('/home/user/output.png')
```

### Step 5: Long-running sandboxes (multi-turn sessions)

Keep a sandbox alive for a multi-turn conversation so state persists between executions:

```typescript
// Create sandbox with custom timeout (max 3600s)
const sandbox = await Sandbox.create({ timeoutMs: 3600_000 })

// First turn: define a variable
await sandbox.runCode(`x = 42`)

// Second turn: use it (sandbox state preserved)
const result = await sandbox.runCode(`print(x * 2)`)
console.log(result.text) // "84"

// Extend timeout if needed
await sandbox.setTimeout(3600_000)

// Always destroy when done
await sandbox.kill()
```

```python
# Python long-running sandbox
sandbox = Sandbox(timeout=3600)

sandbox.run_code("x = 42")
result = sandbox.run_code("print(x * 2)")
print(result.text)  # "84"

sandbox.kill()
```

### Step 6: Handle errors gracefully

```typescript
const result = await sandbox.runCode(`
import json
data = json.loads('invalid json{{{')
`)

if (result.error) {
  console.error('Execution failed:', result.error.name, result.error.value)
  // Retry with corrected code or report to user
} else {
  console.log(result.text)
}
```

### Step 7: Destroy the sandbox

Always destroy sandboxes when finished to avoid unnecessary billing:

```typescript
await sandbox.kill()
```

```python
sandbox.kill()
```

## Complete Example: AI Coding Agent

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { Sandbox } from '@e2b/code-interpreter'

const client = new Anthropic()
const sandbox = await Sandbox.create({ timeoutMs: 300_000 })

async function runCodingAgent(userTask: string) {
  // Generate code with LLM
  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Write Python code to: ${userTask}\n\nRespond with ONLY the code, no explanation.`
    }]
  })

  const code = (message.content[0] as { text: string }).text
    .replace(/```python\n?/g, '').replace(/```/g, '').trim()

  console.log('Generated code:\n', code)

  // Execute in E2B sandbox
  const result = await sandbox.runCode(code, {
    onStdout: (out) => process.stdout.write(out.line + '\n'),
    onStderr: (err) => process.stderr.write(err.line + '\n'),
  })

  if (result.error) {
    console.error('Error:', result.error.value)
  }

  return result
}

await runCodingAgent('analyze the first 10 fibonacci numbers and print their stats')
await sandbox.kill()
```

## Guidelines

- Always call `sandbox.kill()` when done — sandboxes count against your quota while running.
- Use long-running sandboxes (with a session ID or stored reference) for multi-turn chat where variables must persist.
- Stream output for tasks that take more than a couple of seconds; users expect feedback.
- Check `result.error` before using `result.text` — execution may fail silently.
- For file-heavy workflows (datasets, images), use `sandbox.files.write()` before running code.
- E2B sandboxes are ephemeral: filesystem state is lost after `kill()`. Download any outputs you need first.
- Default sandbox timeout is 300 seconds; set `timeoutMs` explicitly for long jobs.
- Sandboxes have internet access by default — disable with network configuration if running untrusted code.
