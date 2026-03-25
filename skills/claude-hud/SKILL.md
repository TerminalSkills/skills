---
name: claude-hud
description: >-
  Build heads-up display (HUD) dashboards for AI coding agents — show context
  usage, active tools, running sub-agents, and task progress in real-time.
  Use when: monitoring AI agent activity, building developer tools for
  AI-assisted coding, creating status dashboards for agent workflows.
license: MIT
compatibility: "Claude Code, Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: [claude-code, hud, dashboard, devtools, monitoring, agent-status]
  use-cases:
    - "Build a real-time dashboard showing what your AI agents are doing"
    - "Monitor context window usage and tool calls during AI coding sessions"
    - "Create a progress tracker for multi-step AI agent workflows"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Claude HUD — AI Agent Dashboard

## Overview

Build heads-up display dashboards that monitor AI coding agents in real-time. Track context window consumption, active tool calls, sub-agent status, task progress, and cost — all rendered in a terminal UI or web interface. Inspired by [claude-hud](https://github.com/jarrodwatts/claude-hud) (13k+ stars).

## Instructions

### Step 1: Understand the HUD Architecture

An AI agent HUD has these core components:

| Component | What It Shows | Data Source |
|-----------|---------------|-------------|
| Context meter | Tokens used / remaining | Agent API response headers |
| Tool tracker | Active tool calls + history | Hook into tool execution |
| Sub-agent panel | Spawned agents + status | Agent orchestration layer |
| Task progress | Todo items + completion | Parse agent task lists |
| Cost tracker | $ spent this session | Token count × model pricing |

### Step 2: Set Up the Project

```bash
mkdir ai-hud && cd ai-hud
npm init -y
npm install blessed blessed-contrib chalk ws
```

**Key dependencies:**
- `blessed` / `blessed-contrib` — terminal UI widgets (gauges, logs, tables)
- `ws` — WebSocket server for real-time data from agent
- `chalk` — colored terminal output

### Step 3: Build the Context Usage Monitor

Track how much of the context window the agent has consumed:

```javascript
// context-monitor.js
class ContextMonitor {
  constructor(maxTokens = 200000) {
    this.maxTokens = maxTokens;
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.cacheHits = 0;
  }

  update(apiResponse) {
    const usage = apiResponse.usage || {};
    this.inputTokens = usage.input_tokens || 0;
    this.outputTokens = usage.output_tokens || 0;
    this.cacheHits = usage.cache_read_input_tokens || 0;
    return this.getStatus();
  }

  getStatus() {
    const total = this.inputTokens + this.outputTokens;
    const pct = ((total / this.maxTokens) * 100).toFixed(1);
    return {
      used: total,
      remaining: this.maxTokens - total,
      percentage: parseFloat(pct),
      cached: this.cacheHits,
      warning: parseFloat(pct) > 80 ? 'HIGH' : 'OK'
    };
  }
}
```

### Step 4: Build the Tool Call Tracker

Monitor which tools the agent is invoking:

```javascript
// tool-tracker.js
class ToolTracker {
  constructor() {
    this.active = [];     // currently running
    this.history = [];    // completed calls
    this.counts = {};     // call count per tool
  }

  onToolStart(toolName, input) {
    const call = {
      id: Date.now(),
      tool: toolName,
      input: JSON.stringify(input).slice(0, 100),
      startedAt: new Date(),
      status: 'running'
    };
    this.active.push(call);
    this.counts[toolName] = (this.counts[toolName] || 0) + 1;
    return call;
  }

  onToolEnd(callId, output) {
    const idx = this.active.findIndex(c => c.id === callId);
    if (idx !== -1) {
      const call = this.active.splice(idx, 1)[0];
      call.status = 'done';
      call.duration = Date.now() - call.startedAt;
      call.output = String(output).slice(0, 80);
      this.history.unshift(call);
      if (this.history.length > 50) this.history.pop();
    }
  }

  getTopTools(n = 5) {
    return Object.entries(this.counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }
}
```

### Step 5: Build the Terminal Dashboard

Render everything in a terminal UI using blessed-contrib:

```javascript
// dashboard.js
const blessed = require('blessed');
const contrib = require('blessed-contrib');

const screen = blessed.screen({ smartCSR: true, title: 'AI Agent HUD' });
const grid = new contrib.grid({ rows: 12, cols: 12, screen });

// Context usage gauge
const contextGauge = grid.set(0, 0, 3, 4, contrib.gauge, {
  label: ' Context Usage ',
  stroke: 'green',
  fill: 'white'
});

// Tool call log
const toolLog = grid.set(0, 4, 6, 8, contrib.log, {
  label: ' Tool Calls ',
  fg: 'green',
  selectedFg: 'green'
});

// Task progress bar
const taskBar = grid.set(3, 0, 3, 4, contrib.bar, {
  label: ' Tasks ',
  barWidth: 6,
  maxHeight: 10
});

// Cost tracker
const costLine = grid.set(6, 0, 6, 6, contrib.line, {
  label: ' Cost ($) ',
  showLegend: true,
  minY: 0
});

// Sub-agent table
const agentTable = grid.set(6, 6, 6, 6, contrib.table, {
  label: ' Sub-Agents ',
  keys: true,
  columnWidth: [20, 10, 15]
});

function refresh(state) {
  contextGauge.setPercent(state.context.percentage);
  state.tools.active.forEach(t =>
    toolLog.log(`⚡ ${t.tool} — ${t.input}`)
  );
  screen.render();
}

screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
screen.render();
```

### Step 6: Connect via WebSocket

Stream agent events to the dashboard in real-time:

```javascript
// server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8765 });

wss.on('connection', (ws) => {
  console.log('HUD client connected');
  ws.on('message', (data) => {
    const event = JSON.parse(data);
    // Route to appropriate tracker
    switch (event.type) {
      case 'context_update': contextMonitor.update(event.data); break;
      case 'tool_start': toolTracker.onToolStart(event.tool, event.input); break;
      case 'tool_end': toolTracker.onToolEnd(event.id, event.output); break;
      case 'task_update': taskTracker.update(event.tasks); break;
    }
    broadcastState();
  });
});
```

### Step 7: Add Cost Tracking

Calculate session cost based on model pricing:

```javascript
const PRICING = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },   // per 1M tokens
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'gpt-4o': { input: 2.5, output: 10.0 },
};

function calculateCost(model, inputTokens, outputTokens) {
  const p = PRICING[model] || PRICING['claude-sonnet-4-20250514'];
  return ((inputTokens * p.input + outputTokens * p.output) / 1_000_000).toFixed(4);
}
```

## Customization Ideas

- **Web UI variant**: Replace blessed with React + D3.js for a browser-based HUD
- **Multi-agent view**: Show multiple agents side-by-side with separate context meters
- **Alert system**: Notify when context usage > 80% or cost exceeds budget
- **Session recording**: Log all events to replay agent sessions later
- **Git integration**: Show files modified by agent alongside tool calls

## References

- [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud) — original inspiration
- [blessed-contrib](https://github.com/yaronn/blessed-contrib) — terminal dashboard widgets
- [Anthropic API usage headers](https://docs.anthropic.com/en/api/messages) — token counting
