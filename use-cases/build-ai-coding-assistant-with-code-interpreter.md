---
title: "Build an AI Coding Assistant with Code Interpreter"
slug: build-ai-coding-assistant-with-code-interpreter
description: "Build a conversational coding assistant that generates Python code with an LLM and executes it safely in an E2B sandbox with auto-retry."
skills: [e2b]
category: development
tags: [code-interpreter, sandbox, e2b, ai-assistant, coding]
---

# Build an AI Coding Assistant with Code Interpreter

**Persona:** You're building a Cursor or Replit-like coding assistant — users describe what they want in natural language, your LLM generates the code, and E2B executes it safely in an isolated sandbox. Output streams back to the user in real time.

**Skills used:** [e2b-code-interpreter](../skills/e2b-code-interpreter/SKILL.md)

---

## What You're Building

A conversational coding assistant that:
1. Accepts a natural language coding task from the user
2. Sends the task to an LLM to generate code
3. Executes the generated code in an E2B sandbox
4. Streams stdout/stderr back to the user as it runs
5. Detects errors and retries with auto-correction (up to 3 attempts)
6. Maintains session state — variables defined in one message persist in the next

---

## Prerequisites

```bash
npm install @e2b/code-interpreter @anthropic-ai/sdk
```

```bash
export E2B_API_KEY=e2b_your_key
export ANTHROPIC_API_KEY=sk-ant-your_key
```

---

## Step 1: Initialize the sandbox and LLM client

Create one sandbox per user session. Keep it alive for the full conversation so variables and imports persist between turns.

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { Sandbox } from '@e2b/code-interpreter'

const anthropic = new Anthropic()

// One sandbox per session — reused across multiple messages
const sandbox = await Sandbox.create({
  timeoutMs: 30 * 60 * 1000, // 30 minutes per session
})

console.log('Sandbox ready:', sandbox.sandboxId)
```

---

## Step 2: Generate code from natural language

Ask the LLM to write Python code for the user's task. Use a system prompt that enforces clean, executable output.

```typescript
async function generateCode(
  task: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  errorContext?: string
): Promise<string> {
  const systemPrompt = `You are an expert Python developer.
The user will describe a coding task. Write clean, working Python code to accomplish it.
Rules:
- Output ONLY the Python code. No markdown fences, no explanation.
- Use print() to show results — they will be streamed to the user.
- You may import any standard library or common packages (pandas, numpy, matplotlib, requests).
- Keep code concise and readable.
${errorContext ? `\nThe previous attempt failed with this error:\n${errorContext}\nFix the code.` : ''}`

  const messages = [
    ...history,
    { role: 'user' as const, content: task },
  ]

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  })

  const code = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  return code
}
```

---

## Step 3: Execute code with streaming output

Run the generated code in the sandbox. Stream every line of stdout/stderr to the user as it arrives.

```typescript
interface ExecutionResult {
  success: boolean
  output: string
  error?: string
  richOutputs?: unknown[]
}

async function executeCode(
  sandbox: Sandbox,
  code: string,
  onOutput: (line: string) => void
): Promise<ExecutionResult> {
  const outputLines: string[] = []
  let errorMessage: string | undefined

  const result = await sandbox.runCode(code, {
    onStdout: (output) => {
      outputLines.push(output.line)
      onOutput(`  ${output.line}`)
    },
    onStderr: (output) => {
      outputLines.push(`[stderr] ${output.line}`)
      onOutput(`  ⚠️  ${output.line}`)
    },
  })

  if (result.error) {
    errorMessage = `${result.error.name}: ${result.error.value}`
    if (result.error.traceback) {
      errorMessage += `\n${result.error.traceback}`
    }
  }

  return {
    success: !result.error,
    output: outputLines.join('\n'),
    error: errorMessage,
    richOutputs: result.results,
  }
}
```

---

## Step 4: Auto-retry on error

If execution fails, send the error back to the LLM and ask it to fix the code. Retry up to 3 times.

```typescript
const MAX_RETRIES = 3

async function generateAndRun(
  sandbox: Sandbox,
  task: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  onOutput: (line: string) => void
): Promise<{ code: string; result: ExecutionResult }> {
  let code = ''
  let result: ExecutionResult | null = null
  let lastError: string | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      onOutput(`\n🔄 Attempt ${attempt}/${MAX_RETRIES} — fixing error...\n`)
    }

    // Generate (or regenerate) code
    code = await generateCode(task, history, lastError)
    onOutput(`\n📝 Generated code:\n\`\`\`python\n${code}\n\`\`\`\n\n🚀 Running...\n`)

    // Execute
    result = await executeCode(sandbox, code, onOutput)

    if (result.success) {
      onOutput('\n✅ Done.\n')
      return { code, result }
    }

    lastError = result.error
    onOutput(`\n❌ Error: ${result.error}\n`)
  }

  onOutput(`\n🛑 Failed after ${MAX_RETRIES} attempts.\n`)
  return { code, result: result! }
}
```

---

## Step 5: Multi-turn session loop

Run the full conversation loop. The LLM conversation history grows with each turn; the sandbox preserves Python state.

```typescript
async function runCodingAssistant() {
  const sandbox = await Sandbox.create({ timeoutMs: 30 * 60 * 1000 })

  // LLM conversation history
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = []

  console.log('🤖 AI Coding Assistant ready. Type a task or "exit" to quit.\n')

  // Simple REPL loop (replace with your chat UI)
  const readline = await import('readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  const askQuestion = (prompt: string) =>
    new Promise<string>(resolve => rl.question(prompt, resolve))

  while (true) {
    const userInput = await askQuestion('You: ')

    if (userInput.toLowerCase() === 'exit') break
    if (!userInput.trim()) continue

    console.log('\nAssistant:')

    const { code, result } = await generateAndRun(
      sandbox,
      userInput,
      history,
      (line) => process.stdout.write(line + '\n')
    )

    // Add this turn to LLM history
    history.push({ role: 'user', content: userInput })
    history.push({
      role: 'assistant',
      content: result.success
        ? `I ran this code:\n\`\`\`python\n${code}\n\`\`\`\nOutput:\n${result.output}`
        : `I tried to run this code but it failed:\n\`\`\`python\n${code}\n\`\`\`\nError: ${result.error}`,
    })

    console.log()
  }

  // Clean up sandbox when session ends
  await sandbox.kill()
  rl.close()
  console.log('Session ended. Sandbox destroyed.')
}

runCodingAssistant().catch(console.error)
```

---

## Step 6: Example session

```
You: Create a list of the first 20 fibonacci numbers and show their statistics

Assistant:

📝 Generated code:
```python
fib = [0, 1]
for _ in range(18):
    fib.append(fib[-1] + fib[-2])

import statistics
print("Fibonacci numbers:", fib)
print("Min:", min(fib))
print("Max:", max(fib))
print("Mean:", round(statistics.mean(fib), 2))
print("Median:", statistics.median(fib))
```

🚀 Running...

  Fibonacci numbers: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181]
  Min: 0
  Max: 4181
  Mean: 697.25
  Median: 44.5

✅ Done.

You: Now plot them as a bar chart and save it as fibonacci.png

Assistant:

📝 Generated code:
```python
import matplotlib.pyplot as plt

fib = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181]
plt.figure(figsize=(12, 5))
plt.bar(range(len(fib)), fib, color="steelblue")
plt.title("First 20 Fibonacci Numbers")
plt.xlabel("Index")
plt.ylabel("Value")
plt.tight_layout()
plt.savefig("fibonacci.png", dpi=150)
print("Chart saved to fibonacci.png")
```

🚀 Running...

  Chart saved to fibonacci.png

✅ Done.
```

---

## Key Design Decisions

- **One sandbox per session**: All variables, imports, and files created in earlier turns are available in later turns — just like a Jupyter notebook.
- **Streaming first**: Users see output as it prints, not after the full run completes. This is critical for long-running tasks.
- **Auto-retry loop**: Most LLM code errors are fixable by sending the traceback back to the model. Three retries handles the vast majority of cases without user intervention.
- **History in the LLM context**: Including previous code and output in the conversation history lets the assistant reference earlier results (e.g., "now plot them" without re-explaining what "them" is).

---

## Production Considerations

- **Sandbox per user session**: Create one sandbox per user, store its ID in your session/database, and reconnect with `Sandbox.connect(sandboxId)` across HTTP requests.
- **Idle timeout**: Set `timeoutMs` to match your session timeout. Extend with `sandbox.setTimeout()` on activity.
- **File downloads**: Use `sandbox.files.read(path)` to retrieve generated files (charts, CSVs) and serve them to users.
- **Language selection**: Pass `{ language: "javascript" }` or `{ language: "bash" }` to `runCode()` for non-Python execution.
- **Resource limits**: E2B sandboxes have CPU/memory limits. For heavy computation, consider Modal (see [modal-labs skill](../skills/modal-labs/SKILL.md)) instead.
