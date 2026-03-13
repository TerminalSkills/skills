---
name: ag-ui
category: AI & Machine Learning
tags: [agent, ui, protocol, streaming, react, frontend, copilotkit]
version: 1.0.0
author: terminal-skills
---

# AG-UI — Agent-User Interaction Protocol

You are an expert in AG-UI (Agent-User Interaction Protocol), the open standard by CopilotKit for connecting AI agents to frontend UIs. You help developers stream agent actions, tool calls, state updates, and text generation to React components in real-time — enabling rich agent UIs where users see what the agent is thinking, doing, and can intervene at any step.

## Core Capabilities

### AG-UI Server (Agent Events)

```typescript
// server/agent.ts — Stream agent events to UI
import { AgentServer, EventStream } from "@ag-ui/server";

const server = new AgentServer();

server.onRequest(async (request, stream: EventStream) => {
  const { messages, context } = request;

  // Emit thinking state
  stream.emitStateUpdate({ status: "thinking", progress: 0 });

  // Stream text generation
  stream.emitTextStart();
  for (const word of "I'll analyze your data now.".split(" ")) {
    stream.emitTextDelta(word + " ");
    await sleep(50);
  }
  stream.emitTextEnd();

  // Emit tool call
  stream.emitToolCallStart("search_database", { query: context.userQuery });
  const results = await searchDatabase(context.userQuery);
  stream.emitToolCallEnd("search_database", results);
  stream.emitStateUpdate({ status: "analyzing", progress: 50 });

  // Stream analysis
  stream.emitTextStart();
  const analysis = await generateAnalysis(results);
  for await (const chunk of analysis) {
    stream.emitTextDelta(chunk);
  }
  stream.emitTextEnd();

  // Custom state for UI rendering
  stream.emitStateUpdate({
    status: "complete",
    progress: 100,
    charts: [{ type: "bar", data: results.chartData }],
    suggestions: ["Run deeper analysis", "Export to CSV", "Schedule report"],
  });

  stream.end();
});
```

### AG-UI React Client

```tsx
import { useAgent, AgentProvider } from "@ag-ui/react";

function App() {
  return (
    <AgentProvider url="https://api.example.com/agent">
      <AgentChat />
    </AgentProvider>
  );
}

function AgentChat() {
  const { messages, state, sendMessage, isStreaming, toolCalls } = useAgent();

  return (
    <div className="flex flex-col h-screen">
      {/* Agent state visualization */}
      {state.status === "thinking" && (
        <div className="bg-blue-50 p-3 rounded-lg animate-pulse">
          🤔 Agent is thinking... ({state.progress}%)
          <progress value={state.progress} max={100} />
        </div>
      )}

      {/* Tool calls (show what agent is doing) */}
      {toolCalls.map((tc) => (
        <div key={tc.id} className="bg-gray-50 p-2 rounded text-sm">
          🔧 <strong>{tc.name}</strong>: {tc.status === "running" ? "Working..." : "Done"}
          {tc.result && <pre className="mt-1">{JSON.stringify(tc.result, null, 2)}</pre>}
        </div>
      ))}

      {/* Messages */}
      {messages.map((msg) => (
        <div key={msg.id} className={msg.role === "user" ? "text-right" : "text-left"}>
          <p>{msg.content}</p>
        </div>
      ))}

      {/* Dynamic UI from agent state */}
      {state.charts?.map((chart, i) => (
        <Chart key={i} type={chart.type} data={chart.data} />
      ))}

      {state.suggestions && (
        <div className="flex gap-2">
          {state.suggestions.map((s) => (
            <button key={s} onClick={() => sendMessage(s)} className="px-3 py-1 bg-blue-100 rounded">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}>
        <input placeholder="Ask anything..." disabled={isStreaming} />
      </form>
    </div>
  );
}
```

## Installation

```bash
npm install @ag-ui/react @ag-ui/server
```

## Best Practices

1. **State streaming** — Emit state updates for progress, status, UI components; users see agent's thought process
2. **Tool call transparency** — Show tool calls in real-time; builds trust, helps debugging
3. **Suggestions** — Emit suggestion buttons after responses; guide users to next actions
4. **Custom UI** — Use state updates to render charts, tables, forms; richer than plain text
5. **Human-in-the-loop** — Emit confirmation requests before destructive actions; users approve or reject
6. **Progress tracking** — Emit progress percentages for long tasks; prevent user anxiety
7. **Framework agnostic** — AG-UI protocol works with any agent backend (LangGraph, CrewAI, custom)
8. **CopilotKit integration** — AG-UI powers CopilotKit; use CopilotKit for higher-level React components
