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
    - coordination
---

# Agent Swarm Orchestration

Coordinate multiple AI agents working together on complex tasks. Design topologies, implement routing, handle handoffs, share memory, and enforce quality gates.

## Why Multi-Agent?

Single-agent limitations:
- Context window fills up on complex tasks
- Generalist performance degrades on specialist tasks
- No separation of concerns or parallel execution
- Single point of failure with no self-correction

Multi-agent benefits:
- Each agent has focused expertise and smaller context
- Agents can work in parallel on independent subtasks
- Quality agents can review other agents' work
- Failed agents can be retried without losing all progress

## Topologies

### Pipeline (sequential)

```
Task → Agent A → Agent B → Agent C → Result
       (plan)    (execute)  (review)

Best for: Linear workflows with clear phases
Example: Spec → Code → Test → Deploy
```

### Hierarchical (manager + workers)

```
           Orchestrator
          /     |      \
     Coder  Tester  Reviewer
      |        |        |
   [subtask] [subtask] [subtask]

Best for: Complex tasks that decompose into independent subtasks
Example: Feature development with parallel code, test, and docs
```

### Mesh (peer-to-peer)

```
    Agent A ←→ Agent B
      ↕    ╲  ╱    ↕
    Agent C ←→ Agent D

Best for: Collaborative tasks where agents need to share findings
Example: Research team where each agent explores different sources
```

### Hub-and-spoke (router)

```
         ┌→ Specialist A
Input → Router → Specialist B
         └→ Specialist C

Best for: Task classification and routing to the right expert
Example: Support system routing to billing, technical, or sales agents
```

## Implementation Patterns

### Orchestrator pattern

```python
# orchestrator.py
# Central coordinator that manages agent pipeline

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

class AgentRole(Enum):
    PLANNER = "planner"
    CODER = "coder"
    REVIEWER = "reviewer"
    TESTER = "tester"
    DEPLOYER = "deployer"

@dataclass
class AgentTask:
    """A task assigned to an agent in the pipeline.
    
    Tracks the task lifecycle: pending → running → completed/failed
    """
    id: str
    role: AgentRole
    input_data: dict
    output_data: dict = field(default_factory=dict)
    status: str = "pending"      # pending, running, completed, failed
    retries: int = 0
    max_retries: int = 3
    dependencies: list[str] = field(default_factory=list)

class Orchestrator:
    """Manages a pipeline of specialized agents.
    
    Routes tasks to the right agent, handles retries,
    enforces quality gates, and tracks overall progress.
    """
    
    def __init__(self, agents: dict[AgentRole, 'Agent']):
        self.agents = agents
        self.tasks: list[AgentTask] = []
        self.context: dict = {}  # Shared memory across agents
    
    async def run_pipeline(self, spec: str) -> dict:
        """Execute the full agent pipeline on a specification.
        
        Args:
            spec: Task specification / requirements
        
        Returns:
            Final output dict with all agent results
        """
        # Phase 1: Planning
        plan = await self._run_agent(AgentRole.PLANNER, {
            "spec": spec,
            "context": self.context
        })
        self.context["plan"] = plan
        
        # Phase 2: Execution (can parallelize independent tasks)
        subtasks = plan.get("subtasks", [])
        for subtask in subtasks:
            result = await self._run_agent(AgentRole.CODER, {
                "task": subtask,
                "plan": plan,
                "context": self.context
            })
            
            # Phase 3: Quality gate — review each subtask
            review = await self._run_agent(AgentRole.REVIEWER, {
                "code": result,
                "requirements": subtask,
                "context": self.context
            })
            
            # Retry loop if review fails
            retries = 0
            while not review.get("approved") and retries < 3:
                result = await self._run_agent(AgentRole.CODER, {
                    "task": subtask,
                    "previous_attempt": result,
                    "feedback": review.get("feedback"),
                    "context": self.context
                })
                review = await self._run_agent(AgentRole.REVIEWER, {
                    "code": result,
                    "requirements": subtask,
                    "context": self.context
                })
                retries += 1
            
            self.context[f"subtask_{subtask['id']}"] = result
        
        # Phase 4: Testing
        test_results = await self._run_agent(AgentRole.TESTER, {
            "code": self.context,
            "plan": plan
        })
        
        return {
            "plan": plan,
            "results": self.context,
            "tests": test_results,
            "status": "completed"
        }
    
    async def _run_agent(self, role: AgentRole, input_data: dict) -> dict:
        """Run a single agent with retry logic.
        
        Args:
            role: Which specialist agent to invoke
            input_data: Input for the agent
        
        Returns:
            Agent's output dict
        """
        agent = self.agents[role]
        task = AgentTask(
            id=f"{role.value}_{len(self.tasks)}",
            role=role,
            input_data=input_data
        )
        self.tasks.append(task)
        
        try:
            task.status = "running"
            result = await agent.execute(input_data)
            task.output_data = result
            task.status = "completed"
            return result
        except Exception as e:
            task.status = "failed"
            if task.retries < task.max_retries:
                task.retries += 1
                return await self._run_agent(role, input_data)
            raise
```

### Router pattern

```python
# router.py
# Classify incoming tasks and route to specialist agents

class TaskRouter:
    """Routes tasks to the most appropriate specialist agent.
    
    Uses LLM classification to determine which agent
    should handle each incoming request.
    """
    
    ROUTING_PROMPT = """Classify this task and select the best agent:

Task: {task}

Available agents:
{agents}

Return JSON: {{"agent": "agent_name", "confidence": 0.0-1.0, "reasoning": "why"}}
"""
    
    def __init__(self, agents: dict[str, 'Agent']):
        self.agents = agents
        self.routing_history: list[dict] = []
    
    async def route(self, task: str) -> dict:
        """Route a task to the best specialist agent.
        
        Args:
            task: Task description to route
        
        Returns:
            Agent result dict
        """
        # Build agent descriptions for the classifier
        agent_descriptions = "\n".join(
            f"- {name}: {agent.description}"
            for name, agent in self.agents.items()
        )
        
        # Classify
        routing = await self._classify(task, agent_descriptions)
        agent_name = routing["agent"]
        
        # Execute
        agent = self.agents[agent_name]
        result = await agent.execute({"task": task})
        
        # Track routing decisions for optimization
        self.routing_history.append({
            "task": task,
            "routed_to": agent_name,
            "confidence": routing["confidence"]
        })
        
        return result
```

### Shared memory

```python
# shared_memory.py
# Memory layer for inter-agent communication

from datetime import datetime

class SharedMemory:
    """Shared context accessible by all agents in the swarm.
    
    Stores facts, decisions, and artifacts that agents
    can read and write during pipeline execution.
    """
    
    def __init__(self):
        self.facts: list[dict] = []       # Discovered information
        self.decisions: list[dict] = []   # Choices made
        self.artifacts: dict = {}          # Code, docs, data
        self.messages: list[dict] = []     # Inter-agent messages
    
    def add_fact(self, agent: str, fact: str, confidence: float = 1.0):
        """Record a discovered fact.
        
        Args:
            agent: Name of agent that discovered this
            fact: The information discovered
            confidence: How certain (0-1)
        """
        self.facts.append({
            "agent": agent,
            "fact": fact,
            "confidence": confidence,
            "timestamp": datetime.now().isoformat()
        })
    
    def add_decision(self, agent: str, decision: str, reasoning: str):
        """Record a decision with reasoning.
        
        Args:
            agent: Agent that made the decision
            decision: What was decided
            reasoning: Why this choice was made
        """
        self.decisions.append({
            "agent": agent,
            "decision": decision,
            "reasoning": reasoning,
            "timestamp": datetime.now().isoformat()
        })
    
    def get_context_for_agent(self, agent_role: str, max_items: int = 20) -> str:
        """Build a context string for an agent.
        
        Includes recent facts, decisions, and relevant artifacts.
        Limits size to prevent context overflow.
        
        Args:
            agent_role: Role of the requesting agent
            max_items: Max items to include
        
        Returns:
            Formatted context string
        """
        context_parts = []
        
        # Recent facts
        recent_facts = self.facts[-max_items:]
        if recent_facts:
            context_parts.append("Known facts:")
            for f in recent_facts:
                context_parts.append(f"- [{f['agent']}] {f['fact']}")
        
        # Recent decisions
        recent_decisions = self.decisions[-max_items:]
        if recent_decisions:
            context_parts.append("\nDecisions made:")
            for d in recent_decisions:
                context_parts.append(f"- [{d['agent']}] {d['decision']}: {d['reasoning']}")
        
        return "\n".join(context_parts)
```

## Quality Gates

Enforce quality between pipeline stages:

```python
# quality_gate.py
# Enforce quality standards between agent handoffs

@dataclass
class QualityCheck:
    name: str
    passed: bool
    details: str
    severity: str  # "blocking" or "warning"

class QualityGate:
    """Validate agent output before passing to next stage.
    
    Blocking failures stop the pipeline and trigger retry.
    Warnings are logged but don't stop execution.
    """
    
    async def check(self, stage: str, output: dict) -> list[QualityCheck]:
        checks = []
        
        if stage == "code":
            # Check: code is syntactically valid
            checks.append(self._check_syntax(output.get("code", "")))
            # Check: tests are included
            checks.append(self._check_tests_present(output))
            # Check: no hardcoded secrets
            checks.append(self._check_no_secrets(output.get("code", "")))
        
        elif stage == "review":
            # Check: review is substantive (not just "looks good")
            checks.append(self._check_review_depth(output.get("review", "")))
        
        elif stage == "test":
            # Check: all tests pass
            checks.append(self._check_tests_pass(output.get("test_results", {})))
            # Check: coverage threshold met
            checks.append(self._check_coverage(output.get("coverage", 0)))
        
        return checks
    
    def gate_passed(self, checks: list[QualityCheck]) -> bool:
        """Check if all blocking checks passed."""
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
