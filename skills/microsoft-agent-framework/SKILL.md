---
name: microsoft-agent-framework
description: >-
  Build multi-agent AI systems with Microsoft's Agent Framework (formerly Semantic
  Kernel Agents). Use when: defining AI agents, orchestrating multi-agent workflows
  (sequential, parallel, conditional), creating custom agents in Python or .NET,
  using built-in agents (ChatCompletion, OpenAI Assistant), deploying agent
  systems, or comparing agent orchestration patterns.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["microsoft", "agents", "multi-agent", "orchestration", "python", "dotnet"]
  use-cases:
    - "Build a multi-agent system where researcher, writer, and editor collaborate"
    - "Orchestrate sequential agent pipeline for data processing"
    - "Create custom agents with tool-calling in Python or .NET"
  agents: [claude-code, openai-codex, cursor]
---

# Microsoft Agent Framework

## Overview

Microsoft Agent Framework provides primitives for building single and multi-agent AI systems. It supports agent definition, orchestration patterns, tool integration, and deployment — available in both Python and .NET.

**Repo:** `microsoft/semantic-kernel` (agents module)  
**Docs:** learn.microsoft.com/semantic-kernel/agents  
**Requirements:** Python 3.10+ or .NET 8+

## Installation

### Python
```bash
pip install semantic-kernel
# Agents are included in the core package
```

### .NET
```bash
dotnet add package Microsoft.SemanticKernel
dotnet add package Microsoft.SemanticKernel.Agents.Core
dotnet add package Microsoft.SemanticKernel.Agents.OpenAI  # For OpenAI Assistant agent
```

## Core Concepts

### Agent Definition

An agent = instructions + model + tools + optional name/description.

```python
from semantic_kernel.agents import ChatCompletionAgent
from semantic_kernel import Kernel

kernel = Kernel()
# Add AI service to kernel (OpenAI, Azure OpenAI, etc.)

researcher = ChatCompletionAgent(
    kernel=kernel,
    name="Researcher",
    instructions="""You are a research analyst. Given a topic,
    find key facts, statistics, and recent developments.
    Always cite sources. Output structured findings.""",
)

writer = ChatCompletionAgent(
    kernel=kernel,
    name="Writer",
    instructions="""You are a technical writer. Take research findings
    and produce clear, engaging content. Use simple language.
    Target audience: software developers.""",
)
```

### Built-in Agent Types

| Type | Description | Use Case |
|------|------------|----------|
| `ChatCompletionAgent` | Wraps any chat model | General tasks, most common |
| `OpenAIAssistantAgent` | Uses OpenAI Assistants API | Code interpreter, file search |
| `AzureAIAgent` | Azure AI Foundry agent | Enterprise, Azure-integrated |

### Agent with Tools

```python
from semantic_kernel.functions import kernel_function

class WebSearch:
    @kernel_function(description="Search the web for information")
    def search(self, query: str) -> str:
        # Implement search logic
        return f"Results for: {query}"

class Calculator:
    @kernel_function(description="Perform mathematical calculations")
    def calculate(self, expression: str) -> str:
        return str(eval(expression))  # Use safe eval in production

kernel.add_plugin(WebSearch(), plugin_name="web")
kernel.add_plugin(Calculator(), plugin_name="math")

agent = ChatCompletionAgent(
    kernel=kernel,
    name="Assistant",
    instructions="Use tools to answer questions accurately.",
)
```

## Multi-Agent Orchestration

### AgentGroupChat

The primary way to orchestrate multiple agents:

```python
from semantic_kernel.agents import AgentGroupChat
from semantic_kernel.agents.strategies import (
    SequentialSelectionStrategy,
    KernelFunctionTerminationStrategy,
)

chat = AgentGroupChat(
    agents=[researcher, writer, editor],
    selection_strategy=SequentialSelectionStrategy(
        agents=[researcher, writer, editor]
    ),
    termination_strategy=KernelFunctionTerminationStrategy(
        agents=[editor],
        max_iterations=6,
    ),
)

await chat.add_chat_message(message="Write a blog post about WebAssembly in 2025")

async for response in chat.invoke():
    print(f"[{response.name}]: {response.content}")
```

### Orchestration Patterns

#### Sequential — agents take turns in fixed order
```python
from semantic_kernel.agents.strategies import SequentialSelectionStrategy

strategy = SequentialSelectionStrategy(
    agents=[researcher, writer, editor],
    initial_agent=researcher,
)
```
Use for: pipelines where each agent builds on the previous output.

#### Conditional — kernel function picks the next agent
```python
from semantic_kernel.agents.strategies import KernelFunctionSelectionStrategy

selector_fn = KernelFunction.from_prompt("""
Given the conversation, determine which agent should respond next.
Agents: Researcher, Writer, Editor.
If research is needed, pick Researcher.
If draft is ready for writing, pick Writer.
If draft needs review, pick Editor.
Respond with only the agent name.
""")

strategy = KernelFunctionSelectionStrategy(
    kernel=kernel,
    function=selector_fn,
    agents=[researcher, writer, editor],
)
```
Use for: dynamic workflows where the next step depends on current state.

#### Parallel — fan-out to multiple agents, aggregate results
```python
import asyncio

async def parallel_analysis(topic: str):
    tasks = [
        researcher.invoke(f"Research {topic}"),
        competitor_analyst.invoke(f"Analyze competitors in {topic}"),
        trend_analyst.invoke(f"Identify trends in {topic}"),
    ]
    results = await asyncio.gather(*tasks)
    # Feed aggregated results to synthesizer agent
    summary = await synthesizer.invoke(
        f"Synthesize these analyses:\n" +
        "\n---\n".join(r.content for r in results)
    )
    return summary
```
Use for: independent analyses that combine into a final output.

## .NET Example

```csharp
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Agents;
using Microsoft.SemanticKernel.Agents.Chat;

var kernel = Kernel.CreateBuilder()
    .AddAzureOpenAIChatCompletion(deployment, endpoint, apiKey)
    .Build();

ChatCompletionAgent researcher = new()
{
    Kernel = kernel,
    Name = "Researcher",
    Instructions = "You are a research analyst. Find key facts and statistics."
};

ChatCompletionAgent writer = new()
{
    Kernel = kernel,
    Name = "Writer",
    Instructions = "You are a technical writer. Produce clear, engaging content."
};

AgentGroupChat chat = new(researcher, writer)
{
    ExecutionSettings = new()
    {
        SelectionStrategy = new SequentialSelectionStrategy { InitialAgent = researcher },
        TerminationStrategy = new MaxIterationTerminationStrategy(4)
    }
};

chat.AddChatMessage(new("Write about Kubernetes security best practices"));

await foreach (var msg in chat.InvokeAsync())
{
    Console.WriteLine($"[{msg.AuthorName}]: {msg.Content}");
}
```

## Deployment

### As API Service
```python
from fastapi import FastAPI
from semantic_kernel.agents import ChatCompletionAgent

app = FastAPI()
# Initialize agents at startup

@app.post("/chat")
async def chat(message: str):
    response = await agent.invoke(message)
    return {"response": response.content}
```

### With Azure Container Apps
```bash
az containerapp up \
  --name agent-service \
  --source . \
  --env-vars AZURE_OPENAI_ENDPOINT=... AZURE_OPENAI_KEY=...
```

## Tips

- Start with `ChatCompletionAgent` — it works with any chat model provider
- Use `SequentialSelectionStrategy` first, upgrade to `KernelFunctionSelectionStrategy` when you need dynamic routing
- Set `max_iterations` on termination strategy to prevent infinite agent loops
- Each agent can have its own kernel with different models — use cheaper models for simple tasks
- `AgentGroupChat` maintains shared conversation history — all agents see all messages
- For production, add logging to track which agent responds and why
