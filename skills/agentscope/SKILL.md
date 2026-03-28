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
  category: ai-tools
  tags:
    - agents
    - observability
    - debugging
    - transparency
    - tracing
    - production
  use-cases:
    - "Build agents with full execution tracing for debugging and compliance"
    - "Create observable AI workflows where every decision is logged and explainable"
    - "Monitor and debug complex multi-agent systems in production"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# AgentScope

Build transparent, observable AI agents using [AgentScope](https://github.com/agentscope-ai/agentscope) — a framework for creating agents you can see, understand, and trust with full execution tracing and debugging.

## Installation

```bash
pip install agentscope
```

Or with Node.js:

```bash
npm install agentscope
```

## Core Concepts

AgentScope provides three pillars of observability:

1. **Execution Tracing** — Every step is recorded with inputs, outputs, timing, and decisions
2. **Decision Logging** — Why the agent chose action A over action B
3. **Live Debugging** — Inspect, pause, and replay agent executions

## Basic Agent with Tracing

```python
from agentscope import Agent, Tracer

tracer = Tracer(output="./traces/")

agent = Agent(
    name="research-assistant",
    model="claude-sonnet-4-20250514",
    tracer=tracer,
)

result = agent.run("Summarize the key findings from this paper")

# Access the full execution trace
trace = tracer.latest()
print(f"Steps: {trace.step_count}")
print(f"Duration: {trace.duration_ms}ms")
print(f"Tokens used: {trace.total_tokens}")

for step in trace.steps:
    print(f"  [{step.type}] {step.name}: {step.duration_ms}ms")
    print(f"    Input: {step.input[:100]}...")
    print(f"    Output: {step.output[:100]}...")
```

## Decision Logging

Track why an agent made specific choices:

```python
from agentscope import Agent, DecisionLogger

logger = DecisionLogger(
    log_alternatives=True,  # Log rejected options too
    log_reasoning=True,     # Log chain-of-thought
)

agent = Agent(
    name="trading-agent",
    model="claude-sonnet-4-20250514",
    decision_logger=logger,
    tools=["market-data", "portfolio", "trade-executor"],
)

result = agent.run("Review portfolio and suggest rebalancing")

# Inspect decisions
for decision in logger.decisions:
    print(f"Decision: {decision.action}")
    print(f"Reasoning: {decision.reasoning}")
    print(f"Alternatives considered:")
    for alt in decision.alternatives:
        print(f"  - {alt.action} (score: {alt.score:.2f}, rejected: {alt.rejection_reason})")
    print(f"Confidence: {decision.confidence:.2f}")
```

## Multi-Agent Observability

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
    coordination="sequential",  # or "parallel", "hierarchical"
)

result = team.run("Create a market analysis report for Q4 2025")

# View inter-agent communication
for message in tracer.messages():
    print(f"[{message.sender} → {message.receiver}] {message.content[:80]}...")

# Launch debugging dashboard
dashboard = Dashboard(tracer)
dashboard.serve(port=8080)  # Opens web UI at localhost:8080
```

## Execution Replay

Replay and debug past executions:

```python
from agentscope import Tracer, Replayer

tracer = Tracer(output="./traces/")

# Load a past trace
trace = tracer.load("trace-2025-03-28-143022")

replayer = Replayer(trace)

# Step through execution
for step in replayer:
    print(f"Step {step.index}: {step.name}")
    print(f"  Input: {step.input}")
    print(f"  Output: {step.output}")
    
    if step.is_decision:
        print(f"  Decision: {step.decision.action}")
        print(f"  Alternatives: {len(step.decision.alternatives)}")
    
    # Modify and re-run from this point
    # replayer.fork(step.index, modified_input="new prompt")
```

## Structured Audit Trails

For compliance and audit requirements:

```python
from agentscope import Agent, AuditTrail

audit = AuditTrail(
    storage="./audit_logs/",
    format="jsonl",
    include_timestamps=True,
    include_model_params=True,
    redact_pii=True,  # Auto-redact PII from logs
)

agent = Agent(
    name="claims-processor",
    model="claude-sonnet-4-20250514",
    audit_trail=audit,
)

result = agent.run("Process insurance claim #12345")

# Export audit report
report = audit.export(
    trace_id=result.trace_id,
    format="pdf",
    include_decisions=True,
    include_data_access=True,
)
report.save("audit-claim-12345.pdf")
```

## Integration with Monitoring Systems

### OpenTelemetry Export

```python
from agentscope import Agent, Tracer
from agentscope.exporters import OTelExporter

exporter = OTelExporter(
    endpoint="http://localhost:4317",
    service_name="my-agent-service",
)

tracer = Tracer(exporters=[exporter])

agent = Agent(
    name="support-agent",
    model="claude-sonnet-4-20250514",
    tracer=tracer,
)

# Traces automatically appear in Jaeger/Grafana/Datadog
```

### Prometheus Metrics

```python
from agentscope.exporters import PrometheusExporter

metrics = PrometheusExporter(port=9090)

tracer = Tracer(exporters=[metrics])

# Exposes metrics:
# agent_step_duration_seconds
# agent_total_tokens
# agent_decision_count
# agent_error_count
# agent_trace_duration_seconds
```

## Tips

- Enable `log_alternatives=True` during development to understand agent decision-making
- Use the Dashboard web UI for visual debugging — much easier than reading JSON traces
- Set `redact_pii=True` in production to avoid logging sensitive data
- OpenTelemetry export integrates with existing monitoring stacks (Datadog, Grafana, New Relic)
- For multi-agent systems, trace inter-agent messages to find communication bottlenecks
- Execution replay is invaluable for reproducing bugs — save traces from production errors
- Keep audit trail storage separate from application logs for compliance isolation
