---
name: agentscope
description: >-
  Build transparent, observable AI agents using AgentScope — agents you can see, understand,
  and trust with full execution tracing and debugging. Use when: building production agents
  that need observability, debugging complex agent behaviors, creating agents with audit trails.
license: Apache-2.0
compatibility: "Python 3.10+ or Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags:
    - agents
    - observability
    - debugging
    - tracing
    - production
---

# AgentScope

Build transparent, observable AI agents using [AgentScope](https://github.com/agentscope-ai/agentscope) — a framework for creating agents you can see, understand, and trust with full execution tracing and debugging.

## Overview

AgentScope provides three pillars of observability for AI agents: execution tracing (every step recorded with inputs, outputs, timing), decision logging (why the agent chose action A over B), and live debugging (inspect, pause, and replay agent executions). It integrates with monitoring stacks like OpenTelemetry, Prometheus, Datadog, and Grafana.

## Instructions

### Installation

```bash
pip install agentscope
```

Or with Node.js:

```bash
npm install agentscope
```

### Basic Agent with Tracing

```python
from agentscope import Agent, Tracer

tracer = Tracer(output="./traces/")

agent = Agent(
    name="research-assistant",
    model="claude-sonnet-4-20250514",
    tracer=tracer,
)

result = agent.run("Summarize the key findings from this paper")

trace = tracer.latest()
print(f"Steps: {trace.step_count}")
print(f"Duration: {trace.duration_ms}ms")
print(f"Tokens used: {trace.total_tokens}")

for step in trace.steps:
    print(f"  [{step.type}] {step.name}: {step.duration_ms}ms")
    print(f"    Input: {step.input[:100]}...")
    print(f"    Output: {step.output[:100]}...")
```

### Decision Logging

Track why an agent made specific choices:

```python
from agentscope import Agent, DecisionLogger

logger = DecisionLogger(
    log_alternatives=True,
    log_reasoning=True,
)

agent = Agent(
    name="trading-agent",
    model="claude-sonnet-4-20250514",
    decision_logger=logger,
    tools=["market-data", "portfolio", "trade-executor"],
)

result = agent.run("Review portfolio and suggest rebalancing")

for decision in logger.decisions:
    print(f"Decision: {decision.action}")
    print(f"Reasoning: {decision.reasoning}")
    for alt in decision.alternatives:
        print(f"  - {alt.action} (score: {alt.score:.2f}, rejected: {alt.rejection_reason})")
```

### Multi-Agent Observability

```python
from agentscope import AgentTeam, Tracer, Dashboard

tracer = Tracer(output="./traces/")

team = AgentTeam(
    agents=[
        Agent(name="researcher", model="claude-sonnet-4-20250514", role="research"),
        Agent(name="analyst", model="claude-sonnet-4-20250514", role="analysis"),
        Agent(name="writer", model="claude-sonnet-4-20250514", role="writing"),
    ],
    tracer=tracer,
    coordination="sequential",
)

result = team.run("Create a market analysis report for Q4 2025")

for message in tracer.messages():
    print(f"[{message.sender} → {message.receiver}] {message.content[:80]}...")

dashboard = Dashboard(tracer)
dashboard.serve(port=8080)
```

### Structured Audit Trails

```python
from agentscope import Agent, AuditTrail

audit = AuditTrail(
    storage="./audit_logs/",
    format="jsonl",
    include_timestamps=True,
    redact_pii=True,
)

agent = Agent(
    name="claims-processor",
    model="claude-sonnet-4-20250514",
    audit_trail=audit,
)

result = agent.run("Process insurance claim #12345")

report = audit.export(
    trace_id=result.trace_id,
    format="pdf",
    include_decisions=True,
)
report.save("audit-claim-12345.pdf")
```

### OpenTelemetry Integration

```python
from agentscope import Agent, Tracer
from agentscope.exporters import OTelExporter

exporter = OTelExporter(
    endpoint="http://localhost:4317",
    service_name="my-agent-service",
)

tracer = Tracer(exporters=[exporter])
agent = Agent(name="support-agent", model="claude-sonnet-4-20250514", tracer=tracer)
# Traces automatically appear in Jaeger/Grafana/Datadog
```

## Examples

### Example 1: Debug a Multi-Agent Research Pipeline

```python
from agentscope import AgentTeam, Tracer, Replayer

tracer = Tracer(output="./traces/")
team = AgentTeam(
    agents=[
        Agent(name="researcher", model="claude-sonnet-4-20250514", role="research"),
        Agent(name="analyst", model="claude-sonnet-4-20250514", role="analysis"),
    ],
    tracer=tracer,
)

result = team.run("Analyze Q4 revenue trends for FAANG companies")

# Replay and inspect each step
trace = tracer.latest()
replayer = Replayer(trace)
for step in replayer:
    print(f"Step {step.index}: {step.name} — {step.duration_ms}ms")
    if step.is_decision:
        print(f"  Chose: {step.decision.action}, Alternatives: {len(step.decision.alternatives)}")
```

### Example 2: Production Audit Trail for Insurance Claims

```python
from agentscope import Agent, AuditTrail
from agentscope.exporters import PrometheusExporter

audit = AuditTrail(storage="./audit_logs/", format="jsonl", redact_pii=True)
metrics = PrometheusExporter(port=9090)

agent = Agent(
    name="claims-processor",
    model="claude-sonnet-4-20250514",
    audit_trail=audit,
    tracer=Tracer(exporters=[metrics]),
)

result = agent.run("Process insurance claim #67890 for water damage — $12,400")
report = audit.export(trace_id=result.trace_id, format="pdf", include_decisions=True)
report.save("audit-claim-67890.pdf")
# Prometheus exposes: agent_step_duration_seconds, agent_total_tokens, agent_error_count
```

## Guidelines

- Enable `log_alternatives=True` during development to understand agent decision-making
- Use the Dashboard web UI for visual debugging — much easier than reading JSON traces
- Set `redact_pii=True` in production to avoid logging sensitive data
- OpenTelemetry export integrates with existing monitoring stacks (Datadog, Grafana, New Relic)
- For multi-agent systems, trace inter-agent messages to find communication bottlenecks
- Execution replay is invaluable for reproducing bugs — save traces from production errors
- Keep audit trail storage separate from application logs for compliance isolation
