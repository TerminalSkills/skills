---
title: "Build a Multi-Agent System with the A2A Protocol"
slug: build-multi-agent-system-with-a2a
description: "Connect independent AI agents built on different frameworks into a collaborative system using the Agent2Agent protocol for discovery, task delegation, and orchestration."
skills: [a2a-protocol, coding-agent, mcp-server-builder]
category: development
tags: [a2a, multi-agent, agent-interoperability, orchestration, ai-agents]
---

# Build a Multi-Agent System with the A2A Protocol

## The Problem

A company has 4 AI agents built by different teams on different frameworks: a research agent on LangGraph, a code generation agent on Google ADK, a data analysis agent on CrewAI, and a writing agent on a custom Python framework. Each agent works well in isolation, but they cannot talk to each other. When a user needs research done, code written based on findings, and a report generated — someone has to manually copy outputs between agents. There is no way for the code agent to ask the research agent for clarification, no shared task tracking, and no way to discover what agents are available. The team wants to build an orchestrator but every agent has a different API.

## The Solution

Use `a2a-protocol` to make each agent A2A-compliant with standard Agent Cards and task management, `coding-agent` to implement the orchestrator that discovers and delegates to specialized agents, and `mcp-server-builder` to give individual agents tool access while they collaborate via A2A.

```bash
npx terminal-skills install a2a-protocol coding-agent mcp-server-builder
```

## Step-by-Step Walkthrough

### 1. Create Agent Cards and wrap existing agents

```text
We have 4 agents on different frameworks:
1. Research agent (LangGraph) — searches web, summarizes papers
2. Code agent (Google ADK) — generates and refactors code
3. Data agent (CrewAI) — analyzes datasets, creates visualizations
4. Writer agent (custom Python) — writes reports, blog posts, docs

Wrap each one as an A2A server. Create Agent Cards that describe their
skills, supported input/output modes, and capabilities (streaming, push
notifications). Each agent should serve its card at /.well-known/agent.json
and accept standard A2A messages. Use the Python a2a-sdk.

Show me the full implementation for the research agent as an example,
and the Agent Card JSON for all four.
```

The agent wraps the LangGraph research agent in an A2A server using the a2a-sdk's Starlette integration. The AgentExecutor receives incoming messages, feeds them to the LangGraph chain, streams intermediate results as TaskStatusUpdateEvents, and returns the final answer as a completed task. Agent Cards for all four agents define their skills with descriptive tags and example queries so the orchestrator can make smart routing decisions.

### 2. Build the orchestrator agent

```text
Create an A2A orchestrator that:
1. Discovers all available agents by fetching their Agent Cards from a
   registry (a JSON file listing agent URLs for now)
2. Receives user requests and plans which agents to involve
3. Supports sequential chains (research → write) and parallel fan-out
   (ask research + data simultaneously)
4. Passes context between agents — the output of one becomes input to next
5. Handles the input-required state (agent needs clarification from user)
6. Tracks all tasks with status, shows progress to the user
7. Is itself an A2A server (so it can be composed into larger systems)

The orchestrator should use an LLM to decide the execution plan based on
the user's request and the available agent skills.
```

The agent builds an orchestrator that loads Agent Cards from a registry, uses an LLM to generate an execution plan (which agents, in what order, with what inputs), executes the plan by sending A2A messages to each agent, handles streaming responses and aggregates results, and exposes itself as an A2A server with a "plan-and-execute" skill. The orchestrator supports both sequential chains and parallel fan-out patterns.

### 3. Implement agent-to-agent delegation

```text
Add the ability for agents to delegate to each other directly (not just
through the orchestrator). For example: the writer agent needs data to
include in a report, so it sends an A2A message to the data agent asking
for a chart. The data agent returns an artifact (PNG image) that the
writer includes in the report.

Implement this for a concrete scenario: user asks the writer to create
a quarterly report. The writer delegates to data agent for charts and
research agent for market insights, then assembles everything into a
cohesive report.
```

The agent modifies the writer agent to include A2A client capabilities. When the writer needs data, it discovers the data agent via its Agent Card, sends a message requesting specific charts with structured JSON parameters, receives artifacts (images and data tables), and incorporates them into the final report. The entire delegation chain is tracked through A2A task IDs, and the user sees streaming status updates: "Writing report... Requesting sales data from data agent... Generating chart... Incorporating results..."

### 4. Add push notifications for long-running tasks

```text
The data analysis agent can take 5-10 minutes for complex queries. Set up
push notifications so:
1. Client sends a task to the orchestrator
2. Orchestrator delegates to data agent with a webhook URL
3. Data agent processes async, POSTs status updates to webhook
4. Orchestrator receives updates and forwards to the original client
5. Support reconnection — if the client disconnects, they can poll for
   the task status later using the task ID

Also implement a simple task dashboard that shows all active tasks across
all agents with their current status.
```

The agent implements push notification handlers on the orchestrator, configures webhook URLs in outbound A2A requests, builds a task store that persists across reconnections (using SQLite), and creates a simple web dashboard that polls the orchestrator's ListTasks endpoint to show task status, duration, and which agents are involved.

### 5. Add security and production hardening

```text
Secure the multi-agent system:
1. Agent-to-agent authentication: each agent has a service account token,
   declared in its Agent Card's authentication section
2. TLS on all A2A endpoints
3. Rate limiting per client
4. Input validation: reject messages with unsupported content types
5. Task timeout: auto-cancel tasks that run longer than 30 minutes
6. Audit logging: log all inter-agent communications with task IDs
7. Health checks: /health endpoint on each agent, orchestrator monitors

Also add OpenTelemetry tracing so we can see the full request flow
across all agents in Jaeger.
```

The agent adds bearer token authentication to all A2A servers, configures TLS with cert-manager, implements middleware for rate limiting and input validation, adds a task reaper that cancels stale tasks, structured logging with correlation IDs, health check endpoints, and OpenTelemetry instrumentation using the a2a-sdk's telemetry extra that traces requests across the entire agent chain.

## Real-World Example

An AI platform team at a 40-person company has 4 agents built by different teams on LangGraph, ADK, CrewAI, and custom Python. Users manually copy-paste between agents to complete complex tasks that need multiple capabilities.

1. They wrap each agent as an A2A server in under a day per agent — no rewrite needed, just a thin wrapper
2. The orchestrator connects all four agents — users now describe what they need in natural language and the right agents are selected automatically
3. Direct agent-to-agent delegation enables the writer to pull charts from the data agent without human intervention
4. A quarterly report that previously took 3 hours of manual coordination now completes in 8 minutes end-to-end
5. OpenTelemetry tracing reveals that 70% of total time is spent in the data agent — the team optimizes its queries and cuts report generation to 3 minutes
