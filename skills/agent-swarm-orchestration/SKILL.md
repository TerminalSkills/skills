---
name: agent-swarm-orchestration
description: >-
  Coordinate multiple AI agents working together on complex tasks — routing,
  handoffs, consensus, memory sharing, and quality gates. Use when tasks involve
  building multi-agent systems, coordinating specialist agents in a pipeline,
  implementing agent-to-agent communication, designing swarm architectures,
  setting up agent orchestration frameworks, or building autonomous agent teams
  with supervision and quality control. Covers hierarchical, mesh, and pipeline
  topologies.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags:
    - agents
    - multi-agent
    - orchestration
    - swarm
    - ai-pipeline
---

# Agent Swarm Orchestration

## Overview

Coordinate multiple AI agents working together on complex tasks. Design topologies, implement routing, handle handoffs, share memory, and enforce quality gates.

## Instructions

### Why multi-agent?

Single-agent limitations: context window fills up, generalist performance degrades on specialist tasks, no parallel execution, single point of failure. Multi-agent benefits: focused expertise per agent, parallel subtasks, quality agents review others' work, failed agents retry without losing all progress.

### Topologies

```
Pipeline (sequential):
Task → Agent A → Agent B → Agent C → Result
Best for: Linear workflows (Spec → Code → Test → Deploy)

Hierarchical (manager + workers):
         Orchestrator
        /     |      \
   Coder  Tester  Reviewer
Best for: Complex tasks decomposing into independent subtasks

Hub-and-spoke (router):
       ┌→ Specialist A
Router → Specialist B
       └→ Specialist C
Best for: Task classification and routing to the right expert
```

### Orchestrator pattern

```python
# orchestrator.py — Central coordinator managing agent pipeline

from dataclasses import dataclass, field
from enum import Enum

class AgentRole(Enum):
    PLANNER = "planner"
    CODER = "coder"
    REVIEWER = "reviewer"
    TESTER = "tester"

@dataclass
class AgentTask:
    id: str
    role: AgentRole
    input_data: dict
    output_data: dict = field(default_factory=dict)
    status: str = "pending"
    retries: int = 0
    max_retries: int = 3

class Orchestrator:
    def __init__(self, agents: dict[AgentRole, 'Agent']):
        self.agents = agents
        self.tasks: list[AgentTask] = []
        self.context: dict = {}  # Shared memory

    async def run_pipeline(self, spec: str) -> dict:
        plan = await self._run_agent(AgentRole.PLANNER, {"spec": spec})
        self.context["plan"] = plan

        for subtask in plan.get("subtasks", []):
            result = await self._run_agent(AgentRole.CODER, {
                "task": subtask, "plan": plan
            })
            review = await self._run_agent(AgentRole.REVIEWER, {
                "code": result, "requirements": subtask
            })
            retries = 0
            while not review.get("approved") and retries < 3:
                result = await self._run_agent(AgentRole.CODER, {
                    "task": subtask, "previous_attempt": result,
                    "feedback": review.get("feedback")
                })
                review = await self._run_agent(AgentRole.REVIEWER, {
                    "code": result, "requirements": subtask
                })
                retries += 1
            self.context[f"subtask_{subtask['id']}"] = result

        tests = await self._run_agent(AgentRole.TESTER, {"code": self.context})
        return {"plan": plan, "results": self.context, "tests": tests}

    async def _run_agent(self, role: AgentRole, input_data: dict) -> dict:
        agent = self.agents[role]
        task = AgentTask(id=f"{role.value}_{len(self.tasks)}", role=role, input_data=input_data)
        self.tasks.append(task)
        try:
            task.status = "running"
            result = await agent.execute(input_data)
            task.output_data = result
            task.status = "completed"
            return result
        except Exception:
            task.status = "failed"
            if task.retries < task.max_retries:
                task.retries += 1
                return await self._run_agent(role, input_data)
            raise
```

### Router pattern

```python
# router.py — Classify and route tasks to specialists

class TaskRouter:
    ROUTING_PROMPT = """Classify this task and select the best agent:
Task: {task}
Available agents: {agents}
Return JSON: {{"agent": "name", "confidence": 0.0-1.0, "reasoning": "why"}}"""

    def __init__(self, agents: dict[str, 'Agent']):
        self.agents = agents

    async def route(self, task: str) -> dict:
        agent_descriptions = "\n".join(
            f"- {name}: {agent.description}" for name, agent in self.agents.items()
        )
        routing = await self._classify(task, agent_descriptions)
        return await self.agents[routing["agent"]].execute({"task": task})
```

### Shared memory

```python
# shared_memory.py — Inter-agent communication layer

class SharedMemory:
    def __init__(self):
        self.facts: list[dict] = []
        self.decisions: list[dict] = []
        self.artifacts: dict = {}

    def add_fact(self, agent: str, fact: str, confidence: float = 1.0):
        self.facts.append({"agent": agent, "fact": fact, "confidence": confidence})

    def add_decision(self, agent: str, decision: str, reasoning: str):
        self.decisions.append({"agent": agent, "decision": decision, "reasoning": reasoning})

    def get_context_for_agent(self, agent_role: str, max_items: int = 20) -> str:
        parts = []
        for f in self.facts[-max_items:]:
            parts.append(f"[{f['agent']}] {f['fact']}")
        for d in self.decisions[-max_items:]:
            parts.append(f"[{d['agent']}] {d['decision']}: {d['reasoning']}")
        return "\n".join(parts)
```

### Quality gates

Enforce quality between pipeline stages:

```python
# quality_gate.py — Validate agent output before handoff

@dataclass
class QualityCheck:
    name: str
    passed: bool
    details: str
    severity: str  # "blocking" or "warning"

class QualityGate:
    async def check(self, stage: str, output: dict) -> list[QualityCheck]:
        checks = []
        if stage == "code":
            checks.append(self._check_syntax(output.get("code", "")))
            checks.append(self._check_tests_present(output))
            checks.append(self._check_no_secrets(output.get("code", "")))
        elif stage == "review":
            checks.append(self._check_review_depth(output.get("review", "")))
        elif stage == "test":
            checks.append(self._check_tests_pass(output.get("test_results", {})))
        return checks

    def gate_passed(self, checks: list[QualityCheck]) -> bool:
        return all(c.passed for c in checks if c.severity == "blocking")
```

## Examples

### Build a code review pipeline

```prompt
Build a multi-agent pipeline for automated code review. Agent 1 (Analyzer) reads the PR diff and identifies potential issues. Agent 2 (Security Reviewer) checks for security vulnerabilities. Agent 3 (Style Checker) verifies coding standards. The Orchestrator collects all findings, deduplicates, prioritizes by severity, and produces a structured review. Include retry logic for when agents produce low-quality reviews.
```

### Create a research swarm

```prompt
Build a research swarm where 4 agents each search different sources (web, academic papers, news, social media) for information about a topic, then a Synthesizer agent combines their findings into a comprehensive brief. Use shared memory so agents can see what others have found and avoid duplication. Include confidence scores and source citations.
```

### Design a customer support routing system

```prompt
Build a support ticket routing system with 5 specialist agents: Billing, Technical, Account, Feature Requests, and Escalation. The Router agent classifies incoming tickets and routes to the right specialist. If confidence is below 70%, route to a generalist. Track routing accuracy and retrain the classifier weekly based on resolution data.
```

## Guidelines

- Start with the simplest topology (pipeline) and only add complexity when needed
- Always include quality gates between pipeline stages — never pass unchecked output forward
- Use shared memory to prevent agents from duplicating work or contradicting each other
- Set retry limits (typically 3) to prevent infinite loops when agents fail repeatedly
- Route to a generalist or escalate to human when classifier confidence is below 70%
- Log every agent decision and handoff for debugging and optimization
- Keep individual agent contexts small and focused — specialist agents outperform generalists
