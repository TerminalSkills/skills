---
name: crewai
description: >-
  You are an expert in CrewAI, the framework for orchestrating autonomous AI
  agents working together as a crew. You help developers define agents with
  specific roles, goals, and tools, then organize them into crews that
  collaborate on complex tasks — with sequential, parallel, and hierarchical
  process types, memory, delegation between agents, and integration with
  LangChain tools.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - agent
    - multi-agent
    - crew
    - orchestration
    - roles
    - python
    - production
---

# CrewAI — Multi-Agent Orchestration

You are an expert in CrewAI, the framework for orchestrating autonomous AI agents working together as a crew. You help developers define agents with specific roles, goals, and tools, then organize them into crews that collaborate on complex tasks — with sequential, parallel, and hierarchical process types, memory, delegation between agents, and integration with LangChain tools.

## Core Capabilities

### Agents and Crews

```python
from crewai import Agent, Task, Crew, Process
from crewai_tools import SerperDevTool, WebsiteSearchTool, FileReadTool

# Define specialized agents
researcher = Agent(
    role="Senior Research Analyst",
    goal="Find comprehensive, accurate data about the given topic",
    backstory="""You are an expert researcher with 15 years of experience
    in technology analysis. You are meticulous about data accuracy and
    always cross-reference multiple sources.""",
    tools=[SerperDevTool(), WebsiteSearchTool()],
    llm="gpt-4o",
    verbose=True,
    allow_delegation=True,                  # Can ask other agents for help
    memory=True,
)

writer = Agent(
    role="Content Writer",
    goal="Write engaging, well-structured content based on research",
    backstory="""You are a skilled technical writer who transforms complex
    research into clear, engaging articles. You write for a developer audience.""",
    tools=[FileReadTool()],
    llm="gpt-4o",
    verbose=True,
)

editor = Agent(
    role="Editor",
    goal="Ensure content is polished, accurate, and publication-ready",
    backstory="""You are a demanding editor who ensures every piece
    meets the highest standards of clarity, accuracy, and engagement.""",
    llm="gpt-4o",
)

# Define tasks
research_task = Task(
    description="""Research the topic: {topic}
    Find at least 5 credible sources, key statistics, expert opinions,
    and recent developments. Focus on practical implications.""",
    expected_output="Comprehensive research report with citations",
    agent=researcher,
)

writing_task = Task(
    description="""Write a 1500-word article based on the research.
    Include: introduction, 3-4 key sections with examples, conclusion.
    Target audience: senior developers and tech leads.""",
    expected_output="Well-structured article in markdown format",
    agent=writer,
    context=[research_task],               # Uses research output as input
)

editing_task = Task(
    description="""Review and polish the article. Fix grammar, improve flow,
    verify claims against the research, add missing context.
    Return the final publication-ready article.""",
    expected_output="Final polished article ready for publication",
    agent=editor,
    context=[research_task, writing_task],
)

# Create and run crew
crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, writing_task, editing_task],
    process=Process.sequential,            # Or Process.hierarchical
    memory=True,                           # Shared crew memory
    verbose=True,
)

result = crew.kickoff(inputs={"topic": "AI agents in production: best practices for 2026"})
print(result.raw)                          # Final article
print(result.token_usage)                  # Total tokens used
```

### Custom Tools

```python
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

class DatabaseQueryInput(BaseModel):
    query: str = Field(description="SQL query to execute")

class DatabaseQueryTool(BaseTool):
    name: str = "database_query"
    description: str = "Execute SQL queries against the analytics database"
    args_schema: type[BaseModel] = DatabaseQueryInput

    def _run(self, query: str) -> str:
        results = db.execute(query)
        return json.dumps(results, default=str)

# Use in agent
analyst = Agent(
    role="Data Analyst",
    goal="Extract insights from the database",
    tools=[DatabaseQueryTool()],
    llm="gpt-4o",
)
```

### Hierarchical Process

```python
# Manager agent delegates to specialists
crew = Crew(
    agents=[researcher, writer, editor, analyst],
    tasks=[complex_report_task],
    process=Process.hierarchical,          # Manager auto-created, delegates subtasks
    manager_llm="gpt-4o",
    memory=True,
)
```

## Installation

```bash
pip install crewai crewai-tools
```

## Best Practices

1. **Clear roles** — Each agent needs a specific role, goal, and backstory; specificity improves output quality
2. **Task dependencies** — Use `context=[task1, task2]` to pass output between tasks; explicit data flow
3. **Sequential for reliability** — Use `Process.sequential` for predictable, ordered execution
4. **Hierarchical for complex** — Use `Process.hierarchical` when tasks need dynamic delegation
5. **Custom tools** — Wrap your APIs as CrewAI tools; agents use them autonomously
6. **Memory** — Enable `memory=True` for long-running crews; agents remember previous interactions
7. **Delegation** — Set `allow_delegation=True` for agents that should ask others for help
8. **Token tracking** — Check `result.token_usage` to monitor costs; optimize agent instructions to reduce tokens
