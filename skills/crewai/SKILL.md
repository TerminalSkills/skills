---
name: crewai
description: >-
  CrewAI is a Python framework for building multi-agent AI systems: you define
  agents with roles, goals and tools, give them tasks, and run them as a crew
  with sequential or hierarchical processes, memory and delegation. Use when a
  user wants to build a multi-agent workflow, set up a CrewAI project, write
  custom CrewAI tools, or run a crew from the crewai CLI.
license: Apache-2.0
compatibility: 'Python 3.10-3.13, an LLM API key (OpenAI by default, other providers via LiteLLM-style model strings)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/crewAIInc/crewAI
  tags:
    - crewai
    - multi-agent
    - orchestration
    - agents
    - python
---

# CrewAI — Multi-Agent Orchestration

## Overview

CrewAI organizes LLM agents into a `Crew`: each `Agent` has a role, goal, backstory and tools, each `Task` has a description and expected output, and the crew runs the tasks in order (`Process.sequential`) or under an auto-created manager (`Process.hierarchical`). Besides crews, the package has `Flow` for event-driven, stateful pipelines that can call crews. Checked against crewai and crewai-tools 1.15.23 (28 Sep 2026): imports and constructors below were executed; model calls were not (no API key used).

## Instructions

### Step 1: Install and scaffold

```bash
pip install crewai crewai-tools          # or: uv tool install crewai
crewai --version
crewai create crew research-crew         # interactive wizard that writes agents.yaml, tasks.yaml, crew.py
cd research-crew && crewai install && crewai run
```

Set the provider key in a `.env` file or the environment (for OpenAI, `OPENAI_API_KEY`); never commit it. Scaffolded projects keep prompts in `src/<name>/config/agents.yaml` and `tasks.yaml`, with a `@CrewBase` class in `crew.py` using `@agent`, `@task` and `@crew` decorators; `{topic}` placeholders are filled by `kickoff(inputs=...)`.

### Step 2: Agents, tasks and a crew in plain Python

```python
from crewai import Agent, Task, Crew, Process, LLM
from crewai_tools import SerperDevTool, WebsiteSearchTool, FileReadTool   # SerperDevTool needs SERPER_API_KEY

llm = LLM(model="openai/gpt-4o-mini", temperature=0.2)

researcher = Agent(
    role="Senior Research Analyst",
    goal="Find accurate, cross-checked facts about {topic}",
    backstory="You have 15 years in technology analysis and always verify claims against several sources.",
    tools=[SerperDevTool(), WebsiteSearchTool()],
    llm=llm,
    allow_delegation=False,
    verbose=True,
)
writer = Agent(
    role="Content Writer",
    goal="Turn research into a clear article for developers",
    backstory="A technical writer who explains complex topics with concrete examples.",
    tools=[FileReadTool()],
    llm=llm,
)

research_task = Task(
    description="Research {topic}. Find at least 5 credible sources, key numbers and recent developments.",
    expected_output="A research brief with source URLs",
    agent=researcher,
)
writing_task = Task(
    description="Write a 1200-word markdown article from the research brief.",
    expected_output="A markdown article with intro, 3 sections and conclusion",
    agent=writer,
    context=[research_task],               # output of research_task is passed in
    output_file="article.md",
)

crew = Crew(agents=[researcher, writer], tasks=[research_task, writing_task],
            process=Process.sequential, verbose=True)
result = crew.kickoff(inputs={"topic": "AI agents in production"})
print(result.raw)                          # final text; also result.pydantic, result.json_dict, result.tasks_output
print(result.token_usage)
```

`Task` also accepts `output_pydantic=MyModel` for structured results, `guardrail=` for output checks and `async_execution=True`.

### Step 3: Custom tools

```python
import json
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

class OrdersQueryInput(BaseModel):
    query: str = Field(description="Read-only SQL SELECT against the orders database")

class OrdersQueryTool(BaseTool):
    name: str = "orders_query"
    description: str = "Run a read-only SQL query on the orders analytics database"
    args_schema: type[BaseModel] = OrdersQueryInput

    def _run(self, query: str) -> str:
        rows = run_readonly_query(query)   # your own function
        return json.dumps(rows, default=str)
```

The `@tool("name")` decorator from `crewai.tools` works for simple functions. Agents can also take MCP servers through the `mcps=` field.

### Step 4: Hierarchical process and memory

```python
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    process=Process.hierarchical,          # requires manager_llm or manager_agent
    manager_llm="gpt-4o",
    memory=True,                           # or pass a Memory instance for custom storage
)
```

Memory is a unified store (`Memory`, with scoped views) and calls an embedding model; configure `embedder=` if you do not use OpenAI. Reset it with `crewai reset-memories`. Other useful CLI commands: `crewai test`, `crewai train`, `crewai replay`.

## Examples

**Example 1: "Set up a researcher and writer crew for blog posts"**

Run the Step 2 script with `OPENAI_API_KEY` and `SERPER_API_KEY` exported. Result: verbose logs show the researcher's tool calls, then `article.md` is written and the token usage dictionary prints.

**Example 2: "Let the crew query our orders database"**

Add `OrdersQueryTool()` to a `Data Analyst` agent's `tools`, give it a Task such as "Summarize last month's refunds by reason", and run `crew.kickoff()`. Result: the agent calls `orders_query` with SQL, and the answer in `result.raw` cites the returned rows.

## Guidelines

- Specific roles, goals and `expected_output` text drive quality; vague agents wander and burn tokens.
- Use `Process.sequential` by default; hierarchical adds a manager LLM and more calls, so use it only when task assignment must be dynamic.
- Pass data between tasks explicitly with `context=[...]`; set `max_iter` and `max_rpm` on agents to cap loops and rate-limit errors.
- Tools run with your credentials: give database tools read-only access and validate inputs; do not let agents run arbitrary shell or write code unless sandboxed (`allow_code_execution` runs code and should stay off unless needed).
- Delegation (`allow_delegation=True`) increases cost and can loop between agents; enable it only where needed.
- CrewAI collects anonymous telemetry by default; set `CREWAI_DISABLE_TELEMETRY=true` where policy requires.
- Old tutorials use `crewai_tools` imports that moved or LangChain tools; prefer `crewai_tools` and `crewai.tools.BaseTool`, and pin the version you tested.
