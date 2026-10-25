---
name: microsoft-agent-framework
description: >-
  Microsoft Agent Framework is an open-source framework for building AI agents and multi-agent workflows in Python and .NET, the successor to Semantic Kernel agents and AutoGen. Use this skill when a user asks to build an agent with tools, run sequential, concurrent, handoff or group-chat orchestrations, host agents on Microsoft Foundry or OpenAI, or migrate from Semantic Kernel agents (AgentGroupChat) to Agent Framework.
license: Apache-2.0
compatibility: "Python 3.10+ or .NET 8+; an OpenAI key or a Microsoft Foundry project"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/microsoft/agent-framework
  tags: "microsoft, multi-agent, orchestration, agents, workflows"
---

# Microsoft Agent Framework

## Overview

Microsoft Agent Framework (MAF) builds production agents and graph-based multi-agent workflows in Python and .NET. It lives in its own repository, `microsoft/agent-framework`, and replaces the older Semantic Kernel agent classes (`ChatCompletionAgent`, `AgentGroupChat`, `kernel_function`) and AutoGen. Checked on 2026-10-24: PyPI `agent-framework` 1.23.0, `agent-framework-orchestrations` 1.4.0, NuGet `Microsoft.Agents.AI` 1.26.0. Imports and builders below were exercised in a clean virtualenv; calls to a model were not run (they need a key or a Foundry project).

Docs: https://learn.microsoft.com/agent-framework/ , migration guides: "from Semantic Kernel" and "from AutoGen" on the same site.

## Instructions

### Install

```bash
pip install agent-framework agent-framework-orchestrations   # Python 3.10+
dotnet add package Microsoft.Agents.AI                        # .NET
```

### An agent with a tool (Python)

An `Agent` is a chat client plus instructions and tools. Tools are plain functions decorated with `@tool`; `approval_mode="never_require"` runs them without asking, so use `"always_require"` for side effects. Clients live under `agent_framework.openai` (`OpenAIChatClient`) and `agent_framework.foundry` (`FoundryChatClient`, which authenticates with `azure-identity`, for example `AzureCliCredential` after `az login`).

```python
# support_agent.py
import asyncio
import os
from typing import Annotated

from agent_framework import Agent, tool
from agent_framework.openai import OpenAIChatClient


@tool(approval_mode="never_require")
def get_order_status(order_id: Annotated[str, "Order number such as A-10492"]) -> str:
    """Look up the shipping status of an order."""
    return f"Order {order_id} shipped on 2026-10-21."


agent = Agent(
    client=OpenAIChatClient(model=os.environ["OPENAI_MODEL"]),  # reads OPENAI_API_KEY
    name="support",
    instructions="Answer shipping questions using the tool.",
    tools=[get_order_status],
)

print(asyncio.run(agent.run("Where is order A-10492?")))
```

With Foundry the client becomes `FoundryChatClient(project_endpoint=os.environ["FOUNDRY_PROJECT_ENDPOINT"], model=os.environ["FOUNDRY_MODEL"], credential=AzureCliCredential())`.

### Multi-agent orchestrations (Python)

Orchestrations are builders in `agent_framework.orchestrations` that return a `Workflow`; run it with `await workflow.run(prompt)` and read `result.get_outputs()`.

```python
# pipeline.py
from agent_framework.orchestrations import (
    SequentialBuilder, ConcurrentBuilder, GroupChatBuilder, HandoffBuilder,
)

# Sequential: writer -> reviewer, the conversation is shared and each reply is appended
seq = SequentialBuilder(participants=[writer, reviewer], output_from="all").build()

# Concurrent: same prompt fanned out to all agents, results aggregated
par = ConcurrentBuilder(participants=[researcher, marketer, legal]).build()

# Group chat: a function (or an orchestrator agent) picks the next speaker
def round_robin(state):  # GroupChatState
    names = list(state.participants.keys())
    return names[state.current_round % len(names)]

chat = GroupChatBuilder(participants=[expert, verifier, skeptic],
                        selection_func=round_robin, max_rounds=6).build()

# Handoff: mesh of agents that transfer control to each other (triage -> specialists)
hand = HandoffBuilder(participants=[triage, refunds, orders]).build()
```

Handoff workflows pause for user input between turns (`HandoffAgentUserRequest` events); see `python/samples/03-workflows/orchestrations/` in the repository for the request/response loop. Workflows also support checkpointing (`checkpoint_storage`), streaming and human-in-the-loop requests.

### A basic agent (.NET)

```csharp
// Program.cs  (dotnet add package Microsoft.Agents.AI.Foundry --prerelease; the package is preview-only on NuGet.
//               also add Azure.AI.Projects and Azure.Identity)
using Azure.AI.Projects;
using Azure.Identity;
using Microsoft.Agents.AI;

string endpoint = Environment.GetEnvironmentVariable("FOUNDRY_PROJECT_ENDPOINT")
    ?? throw new InvalidOperationException("FOUNDRY_PROJECT_ENDPOINT is not set.");
string model = Environment.GetEnvironmentVariable("FOUNDRY_MODEL")
    ?? throw new InvalidOperationException("FOUNDRY_MODEL is not set.");

AIAgent agent = new AIProjectClient(new Uri(endpoint), new DefaultAzureCredential())
    .AsAIAgent(model: model, instructions: "You are a support assistant.", name: "support");

Console.WriteLine(await agent.RunAsync("Summarize the refund policy in two sentences."));
```

### Migrating from Semantic Kernel agents

| Semantic Kernel | Agent Framework |
|---|---|
| `ChatCompletionAgent(kernel=..., ...)` | `Agent(client=..., instructions=..., tools=[...])` |
| `@kernel_function` plugin classes | `@tool` functions passed in `tools=` |
| `AgentGroupChat` + selection/termination strategies | `SequentialBuilder`, `GroupChatBuilder(selection_func=..., termination_condition=..., max_rounds=...)` |
| `OpenAIAssistantAgent`, `AzureAIAgent` | `OpenAIChatClient` / `FoundryChatClient` behind `Agent` |

Follow the official migration guide for the rest; the old `semantic-kernel` package is a different project and does not install this framework.

## Examples

### Example 1: Draft, then review

**User request:** "Build a writer agent and a reviewer agent that critique each other's tagline, in Python."

Create two `Agent`s on one `OpenAIChatClient`, build `SequentialBuilder(participants=[writer, reviewer], output_from="all").build()`, run `await workflow.run("Write a tagline for a budget-friendly eBike.")`, then loop over `result.get_outputs()`. With `output_from="all"` it holds one `AgentResponse` per agent, in order (writer first, then reviewer); print `author_name` and `text` of each response's `messages`.

### Example 2: Three analysts in parallel

**User request:** "Get a researcher, a marketer and a legal reviewer to react to our new eBike launch at once."

Use `ConcurrentBuilder(participants=[researcher, marketer, legal]).build()` and `await workflow.run(...)`. The aggregated `AgentResponse` contains one message per participant, each tagged with `author_name`.

## Guidelines

- Do not use `eval` in a tool body (older examples did); validate and parse arguments, and use `approval_mode="always_require"` for tools that write data or spend money.
- Keep credentials in environment variables (`OPENAI_API_KEY`, Azure CLI login) and never in code.
- Set `max_rounds` or a termination condition on group chats so agents cannot loop forever.
- Use cheaper models for simple participants by giving each agent its own client.
- Pin `agent-framework` and `agent-framework-orchestrations` together; preview provider packages (for example `agent-framework-anthropic`) use pre-release version numbers.
- For Semantic Kernel features outside agents (plugins, memory, planners), the `semantic-kernel` package remains a separate project.
