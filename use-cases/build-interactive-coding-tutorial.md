---
title: "Build an Interactive Coding Tutorial Platform"
description: "Build a Codecademy-style coding tutorial platform with in-browser code execution, AI hints, XP tracking, and streaks — for a niche programming audience."
skills: [anthropic-sdk, prisma]
difficulty: advanced
time_estimate: "10 hours"
tags: [education, coding, interactive, ai-hints, pyodide, monaco, gamification]
---

# Build an Interactive Coding Tutorial Platform

**Persona:** You're building a niche coding course — maybe "SQL for Data Analysts" or "Rust for Systems Programmers." You want the Codecademy experience but fully under your control, without $500/month platform fees.

## What You'll Build

- **Structured lessons**: Explanation → Code challenge → Verified solution
- **In-browser code editor**: Monaco with syntax highlighting
- **Code execution**: JS runs in browser, Python via Pyodide (no server needed)
- **Progress tracking**: Completed lessons, daily streak, XP system
- **AI hint system**: Claude gives progressively bigger hints on demand

---

## 1. Lesson Structure

```typescript
// types/lesson.ts
export interface Lesson {
  id: string;
  title: string;
  slug: string;
  language: "javascript" | "python" | "sql" | "rust";
  explanation: string;      // MDX content
  starterCode: string;      // Shown in editor
  solutionCode: string;     // Never sent to client
  testCases: TestCase[];
  xpReward: number;
  hints: string[];          // Progressive hints (1=vague, 3=near-answer)
}

export interface TestCase {
  input?: string;
  expectedOutput: string;
  description: string;
  hidden: boolean;          // Hidden tests prevent hardcoding
}
```

```prisma
model Lesson {
  id          String       @id @default(cuid())
  slug        String       @unique
  title       String
  language    String
  explanation String       @db.Text
  starterCode String       @db.Text
  xpReward    Int          @default(10)
  order       Int
  moduleId    String
  module      Module       @relation(fields: [moduleId], references: [id])
  completions Completion[]
}

model Completion {
  id        String   @id @default(cuid())
  userId    String
  lessonId  String
  lesson    Lesson   @relation(fields: [lessonId], references: [id])
  xpEarned  Int
  createdAt DateTime @default(now())
  @@unique([userId, lessonId])
}

model UserProgress {
  userId        String   @id
  totalXp       Int      @default(0)
  currentStreak Int      @default(0)
  lastActiveAt  DateTime @default(now())
}
```

---

## 2. In-Browser Code Editor

Use Monaco Editor with language-specific setup.

```tsx
// components/CodeEditor.tsx
"use client";
import Editor from "@monaco-editor/react";
import { useState } from "react";

interface Props {
  language: string;
  starterCode: string;
  onRun: (code: string) => void;
}

export function CodeEditor({ language, starterCode, onRun }: Props) {
  const [code, setCode] = useState(starterCode);

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-700">
      <div className="bg-zinc-900 px-4 py-2 flex items-center justify-between">
        <span className="text-zinc-400 text-sm font-mono">{language}</span>
        <button
          onClick={() => onRun(code)}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-1 rounded text-sm font-medium"
        >
          ▶ Run
        </button>
      </div>
      <Editor
        height="300px"
        defaultLanguage={language}
        value={code}
        onChange={(val) => setCode(val ?? "")}
        theme="vs-dark"
        options={{ fontSize: 14, minimap: { enabled: false }, lineNumbers: "on" }}
      />
    </div>
  );
}
```

---

## 3. In-Browser Code Execution

Run Python with Pyodide (no server), JavaScript with `new Function`.

```typescript
// lib/execute-code.ts

export interface ExecutionResult {
  output: string;
  error?: string;
  passed: boolean;
}

// JavaScript execution (sandboxed via iframe postMessage in production)
export function runJavaScript(code: string, testCases: TestCase[]): ExecutionResult {
  const logs: string[] = [];
  const sandboxedLog = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  
  try {
    const fn = new Function("console", code);
    fn({ log: sandboxedLog, error: sandboxedLog });
    const output = logs.join("\n");
    const passed = testCases.every(tc => output.includes(tc.expectedOutput));
    return { output, passed };
  } catch (e) {
    return { output: "", error: String(e), passed: false };
  }
}

// Python execution via Pyodide (client-side)
export async function runPython(code: string, testCases: TestCase[]): Promise<ExecutionResult> {
  // @ts-ignore - pyodide loaded via CDN script tag
  const pyodide = await loadPyodide();
  
  try {
    let output = "";
    pyodide.setStdout({ batched: (s: string) => { output += s + "\n"; } });
    await pyodide.runPythonAsync(code);
    const passed = testCases.every(tc => output.trim().includes(tc.expectedOutput.trim()));
    return { output: output.trim(), passed };
  } catch (e) {
    return { output: "", error: String(e), passed: false };
  }
}
```

---

## 4. AI Hint System

Claude gives progressively bigger hints — nudges before answers.

```typescript
// app/api/hint/route.ts
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const client = new Anthropic();

export async function POST(req: Request) {
  const { lessonId, userCode, hintLevel, userId } = await req.json();
  
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) return Response.json({ error: "Lesson not found" }, { status: 404 });

  const hintInstructions = [
    "Give a vague conceptual nudge (1 sentence). Don't mention the solution.",
    "Give a slightly more specific hint about the approach (2 sentences). No code.",
    "Give a strong hint with a partial code snippet. Almost but not the full answer.",
    "You can now explain the solution clearly with working code."
  ];

  const stream = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    stream: true,
    system: `You are a patient coding tutor. The lesson is: "${lesson.title}".
The correct solution is:
\`\`\`
${lesson.solutionCode}
\`\`\`
${hintInstructions[Math.min(hintLevel, 3)]}`,
    messages: [{
      role: "user",
      content: `Here is my current code:\n\`\`\`\n${userCode}\n\`\`\`\n\nGive me hint level ${hintLevel + 1}.`
    }]
  });

  // Track hint usage for analytics
  await prisma.hintUsage.create({ data: { userId, lessonId, hintLevel } });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    }
  });

  return new Response(readable, { headers: { "Content-Type": "text/plain" } });
}
```

---

## 5. XP and Streak System

```typescript
// lib/progress.ts
import { prisma } from "@/lib/prisma";

export async function completeLesson(userId: string, lessonId: string, xpReward: number) {
  const existing = await prisma.completion.findUnique({
    where: { userId_lessonId: { userId, lessonId } }
  });
  if (existing) return; // Already completed, no double XP

  await prisma.$transaction(async (tx) => {
    await tx.completion.create({ data: { userId, lessonId, xpEarned: xpReward } });

    const progress = await tx.userProgress.findUnique({ where: { userId } });
    const lastActive = progress?.lastActiveAt ?? new Date(0);
    const hoursSince = (Date.now() - lastActive.getTime()) / 3_600_000;
    const streakContinues = hoursSince < 30; // within same day + buffer

    await tx.userProgress.upsert({
      where: { userId },
      create: { userId, totalXp: xpReward, currentStreak: 1 },
      update: {
        totalXp: { increment: xpReward },
        currentStreak: streakContinues ? { increment: 1 } : 1,
        lastActiveAt: new Date()
      }
    });
  });
}

export function getLevel(xp: number): { level: number; nextLevelXp: number } {
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const nextLevelXp = Math.pow(level, 2) * 100;
  return { level, nextLevelXp };
}
```

---

## Result

You now have a fully self-hosted coding education platform:
- Any language that runs in a browser (JS, Python, SQL via sql.js)
- No expensive hosting — Pyodide runs entirely client-side
- Students get unstuck with AI hints instead of Googling
- Gamification keeps completion rates high
- You own the student data and can build email drip campaigns on top
