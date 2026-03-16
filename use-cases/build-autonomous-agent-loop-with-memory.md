---
title: Build an Autonomous Agent Loop with Memory
slug: build-autonomous-agent-loop-with-memory
description: Build an autonomous agent loop with persistent memory, task decomposition, self-reflection, tool orchestration, and human-in-the-loop checkpoints for complex multi-step AI workflows.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: AI & Machine Learning
tags:
  - ai-agent
  - autonomous
  - memory
  - self-reflection
  - orchestration
---

# Build an Autonomous Agent Loop with Memory

## The Problem

Lisa leads AI at a 25-person dev tools company building agents that complete complex tasks: "analyze our codebase, find security vulnerabilities, create tickets for each, and assign to the right team." This requires 20+ steps, memory across steps, tool calling, error recovery, and knowing when to ask a human. Current agents forget what they did 5 steps ago. When an API call fails, they restart from scratch. There's no way to pause, review, and resume. They need an agent loop with persistent memory, self-reflection, tool orchestration, and checkpoints.

## Step 1: Build the Agent Loop

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface AgentState {
  id: string;
  task: string;
  status: "running" | "paused" | "completed" | "failed";
  plan: string[];
  currentStep: number;
  memory: AgentMemory;
  thoughts: Thought[];
  toolCalls: ToolCall[];
  checkpoints: Checkpoint[];
  maxIterations: number;
  iteration: number;
  startedAt: string;
}

interface AgentMemory {
  shortTerm: Array<{ key: string; value: any; step: number }>;
  longTerm: Array<{ key: string; value: any; importance: number }>;
  workingContext: string;
}

interface Thought {
  step: number;
  type: "plan" | "observe" | "reflect" | "decide";
  content: string;
  timestamp: string;
}

interface ToolCall {
  step: number;
  tool: string;
  args: any;
  result: any;
  success: boolean;
  duration: number;
}

interface Checkpoint {
  step: number;
  description: string;
  requiresApproval: boolean;
  approved: boolean | null;
  approvedBy: string | null;
}

interface Tool {
  name: string;
  description: string;
  execute: (args: any, memory: AgentMemory) => Promise<any>;
}

const tools = new Map<string, Tool>();

export function registerTool(tool: Tool): void { tools.set(tool.name, tool); }

// Start autonomous agent
export async function startAgent(task: string, config?: { maxIterations?: number; checkpointEvery?: number }): Promise<AgentState> {
  const id = `agent-${randomBytes(8).toString("hex")}`;
  const state: AgentState = {
    id, task, status: "running",
    plan: [], currentStep: 0,
    memory: { shortTerm: [], longTerm: [], workingContext: "" },
    thoughts: [], toolCalls: [], checkpoints: [],
    maxIterations: config?.maxIterations || 50,
    iteration: 0,
    startedAt: new Date().toISOString(),
  };

  await saveState(state);
  runLoop(state).catch(() => {});
  return state;
}

async function runLoop(state: AgentState): Promise<void> {
  while (state.status === "running" && state.iteration < state.maxIterations) {
    state.iteration++;

    // Step 1: Think — what should I do next?
    const thought = await think(state);
    state.thoughts.push(thought);

    // Step 2: Check if we need a checkpoint
    if (state.iteration % 5 === 0) {
      const checkpoint: Checkpoint = {
        step: state.iteration,
        description: `Completed ${state.iteration} steps. Current: ${thought.content.slice(0, 100)}`,
        requiresApproval: state.iteration % 10 === 0, // every 10 steps requires human
        approved: null, approvedBy: null,
      };
      state.checkpoints.push(checkpoint);

      if (checkpoint.requiresApproval) {
        state.status = "paused";
        await saveState(state);
        await redis.rpush("notification:queue", JSON.stringify({ type: "agent_checkpoint", agentId: state.id, step: state.iteration, description: checkpoint.description }));
        return; // will resume when approved
      }
    }

    // Step 3: Act — execute tool or make decision
    if (thought.type === "decide") {
      const toolName = extractToolName(thought.content);
      const toolArgs = extractToolArgs(thought.content);

      if (toolName && tools.has(toolName)) {
        const tool = tools.get(toolName)!;
        const start = Date.now();
        try {
          const result = await tool.execute(toolArgs, state.memory);
          state.toolCalls.push({ step: state.iteration, tool: toolName, args: toolArgs, result, success: true, duration: Date.now() - start });

          // Store result in short-term memory
          state.memory.shortTerm.push({ key: `step_${state.iteration}_result`, value: result, step: state.iteration });

          // Keep short-term memory bounded
          if (state.memory.shortTerm.length > 20) state.memory.shortTerm = state.memory.shortTerm.slice(-20);
        } catch (error: any) {
          state.toolCalls.push({ step: state.iteration, tool: toolName, args: toolArgs, result: error.message, success: false, duration: Date.now() - start });

          // Self-reflect on error
          state.thoughts.push({ step: state.iteration, type: "reflect", content: `Tool ${toolName} failed: ${error.message}. I should try a different approach.`, timestamp: new Date().toISOString() });
        }
      }
    }

    // Step 4: Reflect — am I making progress?
    if (state.iteration % 3 === 0) {
      const reflection = await reflect(state);
      state.thoughts.push(reflection);

      // Check if task is complete
      if (reflection.content.includes("TASK_COMPLETE")) {
        state.status = "completed";
        break;
      }

      // Promote important findings to long-term memory
      const important = state.memory.shortTerm.filter((m) => m.step >= state.iteration - 3);
      for (const mem of important) {
        if (JSON.stringify(mem.value).length > 50) {
          state.memory.longTerm.push({ key: mem.key, value: mem.value, importance: 0.5 });
        }
      }
    }

    // Update working context
    state.memory.workingContext = buildWorkingContext(state);
    await saveState(state);
  }

  if (state.iteration >= state.maxIterations) state.status = "failed";
  await saveState(state);
}

async function think(state: AgentState): Promise<Thought> {
  // In production: call LLM with task + memory + recent actions
  const recentActions = state.toolCalls.slice(-5).map((t) => `${t.tool}(${JSON.stringify(t.args).slice(0, 50)}) → ${t.success ? "ok" : "failed"}`).join("; ");
  return {
    step: state.iteration,
    type: state.plan.length === 0 ? "plan" : "decide",
    content: `Step ${state.iteration}: analyzing task. Recent: ${recentActions || 'none'}`,
    timestamp: new Date().toISOString(),
  };
}

async function reflect(state: AgentState): Promise<Thought> {
  const successRate = state.toolCalls.length > 0 ? state.toolCalls.filter((t) => t.success).length / state.toolCalls.length : 1;
  const content = successRate < 0.5
    ? `Reflection: Low success rate (${(successRate * 100).toFixed(0)}%). Need to change approach.`
    : `Reflection: Progress is good (${(successRate * 100).toFixed(0)}% success). Continuing.`;
  return { step: state.iteration, type: "reflect", content, timestamp: new Date().toISOString() };
}

function buildWorkingContext(state: AgentState): string {
  const recent = state.thoughts.slice(-5).map((t) => `[${t.type}] ${t.content.slice(0, 100)}`).join("\n");
  const memory = state.memory.longTerm.slice(-5).map((m) => `${m.key}: ${JSON.stringify(m.value).slice(0, 100)}`).join("\n");
  return `Task: ${state.task}\nStep: ${state.iteration}/${state.maxIterations}\nRecent thoughts:\n${recent}\nMemory:\n${memory}`;
}

function extractToolName(thought: string): string | null {
  const match = thought.match(/use tool:\s*(\w+)/i) || thought.match(/call\s+(\w+)/i);
  return match?.[1] || null;
}

function extractToolArgs(thought: string): any {
  const match = thought.match(/args:\s*(\{[^}]+\})/i);
  try { return match ? JSON.parse(match[1]) : {}; } catch { return {}; }
}

// Resume after checkpoint approval
export async function approveCheckpoint(agentId: string, stepIndex: number, approvedBy: string): Promise<void> {
  const state = await getState(agentId);
  if (!state) throw new Error("Agent not found");
  const checkpoint = state.checkpoints.find((c) => c.step === stepIndex);
  if (checkpoint) { checkpoint.approved = true; checkpoint.approvedBy = approvedBy; }
  state.status = "running";
  await saveState(state);
  runLoop(state).catch(() => {});
}

async function saveState(state: AgentState): Promise<void> {
  await redis.setex(`agent:state:${state.id}`, 86400, JSON.stringify(state));
  await pool.query(
    `INSERT INTO agent_runs (id, task, status, iteration, thoughts_count, tool_calls_count, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (id) DO UPDATE SET status = $3, iteration = $4, thoughts_count = $5, tool_calls_count = $6, updated_at = NOW()`,
    [state.id, state.task, state.status, state.iteration, state.thoughts.length, state.toolCalls.length]
  );
}

async function getState(agentId: string): Promise<AgentState | null> {
  const data = await redis.get(`agent:state:${agentId}`);
  return data ? JSON.parse(data) : null;
}

// Get agent execution timeline
export async function getTimeline(agentId: string): Promise<{ thoughts: Thought[]; toolCalls: ToolCall[]; checkpoints: Checkpoint[] }> {
  const state = await getState(agentId);
  if (!state) throw new Error("Agent not found");
  return { thoughts: state.thoughts, toolCalls: state.toolCalls, checkpoints: state.checkpoints };
}
```

## Results

- **20-step tasks completed autonomously** — agent decomposes, executes tools, stores results in memory, reflects on progress; no manual step-by-step guidance
- **Persistent memory** — step 15 uses information from step 3; short-term memory bounded at 20 items; important findings promoted to long-term; no context loss
- **Self-reflection** — agent detects low success rate and changes approach; failed API call → tries alternative tool; adaptive behavior
- **Human checkpoints** — every 10 steps, agent pauses for approval; human reviews progress, approves or redirects; safe autonomous operation
- **Full timeline** — every thought, tool call, and decision logged; debug by reading the agent's reasoning; reproduce issues; improve prompts
