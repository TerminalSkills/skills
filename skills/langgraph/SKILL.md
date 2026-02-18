---
name: langgraph
description: >-
  Build stateful, multi-step AI agents and workflows with LangGraph. Use when a
  user asks to create AI agents with complex logic, build multi-agent systems,
  implement human-in-the-loop workflows, create state machines for LLMs, build
  agentic RAG, implement tool-calling agents with branching logic, create
  planning agents, build supervisor/worker patterns, or orchestrate multi-step
  AI pipelines with cycles, persistence, and streaming.
license: Apache-2.0
compatibility: 'Python 3.9+ or Node.js 18+ (langgraph, langgraph-checkpoint)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - langgraph
    - agents
    - state-machines
    - multi-agent
    - workflows
---

# LangGraph

## Overview

LangGraph is a framework for building stateful, multi-actor AI applications as graphs. Unlike simple chains, LangGraph supports cycles, branching, persistence, and human-in-the-loop — essential for real-world agents that need to plan, retry, delegate, and remember state across interactions.

## Instructions

### Step 1: Installation

```bash
pip install langgraph langgraph-checkpoint langchain-openai
# For persistence:
pip install langgraph-checkpoint-sqlite  # or langgraph-checkpoint-postgres
```

### Step 2: Core Concepts

LangGraph models applications as **graphs** with:
- **State**: A shared data structure (typically TypedDict or Pydantic model) passed between nodes
- **Nodes**: Functions that receive state and return updates
- **Edges**: Connections between nodes (fixed or conditional)
- **Reducers**: Define how node outputs merge into state (default: overwrite; `add` for lists)

```python
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

class State(TypedDict):
    messages: Annotated[list, add_messages]  # add_messages reducer appends
    next_step: str
```

### Step 3: Build a Basic Agent (ReAct Pattern)

The simplest useful agent — calls tools in a loop until done:

```python
from typing import Annotated, TypedDict
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

class State(TypedDict):
    messages: Annotated[list, add_messages]

@tool
def search_web(query: str) -> str:
    """Search the web for current information."""
    return f"Results for '{query}': [relevant information here]"

@tool
def calculate(expression: str) -> str:
    """Evaluate a math expression."""
    return str(eval(expression))

tools = [search_web, calculate]
llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)

def agent(state: State) -> dict:
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def should_continue(state: State) -> str:
    last = state["messages"][-1]
    if last.tool_calls:
        return "tools"
    return END

graph = StateGraph(State)
graph.add_node("agent", agent)
graph.add_node("tools", ToolNode(tools))

graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
graph.add_edge("tools", "agent")  # After tools, go back to agent

app = graph.compile()

result = app.invoke({"messages": [("human", "What's 42 * 17 and who invented calculus?")]})
```

### Step 4: Prebuilt Agents

For common patterns, use prebuilt helpers:

```python
from langgraph.prebuilt import create_react_agent

agent = create_react_agent(
    ChatOpenAI(model="gpt-4o"),
    tools=[search_web, calculate],
    state_modifier="You are a research assistant. Always cite sources.",
)

result = agent.invoke({"messages": [("human", "Compare GDP of France and Germany")]})
```

### Step 5: Custom State and Complex Workflows

Use custom `TypedDict` state with `Annotated[list, add]` reducers to accumulate data across nodes. Build workflows with cycles using conditional edges — for example, a research-write-review loop where `should_revise` routes back to revision until quality passes or max iterations are reached:

```python
class ResearchState(TypedDict):
    topic: str
    sources: Annotated[list[str], add]  # Accumulates across nodes
    draft: str
    review_notes: str
    revision_count: int

graph = StateGraph(ResearchState)
graph.add_node("research", research)
graph.add_node("write", write_draft)
graph.add_node("review", review)
graph.add_node("revise", revise)
graph.add_node("publish", publish)

graph.add_edge(START, "research")
graph.add_edge("research", "write")
graph.add_edge("write", "review")
graph.add_conditional_edges("review", should_revise, {"revise": "revise", "publish": "publish"})
graph.add_edge("revise", "review")  # Cycle: revise → review again
graph.add_edge("publish", END)

app = graph.compile()
```

### Step 6: Persistence and Memory

Checkpointing lets agents resume from where they left off:

```python
from langgraph.checkpoint.sqlite import SqliteSaver

# In-memory for dev:
from langgraph.checkpoint.memory import MemorySaver
memory = MemorySaver()

# SQLite for persistence:
memory = SqliteSaver.from_conn_string("checkpoints.db")

app = graph.compile(checkpointer=memory)

# Each thread_id maintains separate conversation state
config = {"configurable": {"thread_id": "user-123"}}
result = app.invoke({"messages": [("human", "Hi, I'm Alice")]}, config)
# Later...
result = app.invoke({"messages": [("human", "What's my name?")]}, config)
# Agent remembers: "Your name is Alice"
```

### Step 7: Human-in-the-Loop

Interrupt execution for human approval using `interrupt_before`:

```python
# interrupt_before pauses execution before the specified node
app = graph.compile(checkpointer=MemorySaver(), interrupt_before=["send"])

config = {"configurable": {"thread_id": "email-1"}}
result = app.invoke({"messages": [("human", "Send apology email")]}, config)
# Execution pauses before "send" — human reviews draft

# Resume after approval:
result = app.invoke(None, config)  # Continue from checkpoint
```

### Step 8: Multi-Agent Patterns

#### Supervisor Pattern
One agent delegates to specialist workers:

```python
from typing import Literal
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END, MessagesState

llm = ChatOpenAI(model="gpt-4o")

def supervisor(state: MessagesState) -> dict:
    response = llm.invoke([
        ("system", "Route to: 'researcher' for facts, 'writer' for content, 'FINISH' when done."),
        *state["messages"]
    ])
    return {"messages": [response]}

def route(state: MessagesState) -> Literal["researcher", "writer", END]:
    last = state["messages"][-1].content.lower()
    if "researcher" in last:
        return "researcher"
    elif "writer" in last:
        return "writer"
    return END

def researcher(state: MessagesState) -> dict:
    result = llm.invoke([
        ("system", "You are a research specialist. Find facts and data."),
        *state["messages"]
    ])
    return {"messages": [result]}

def writer(state: MessagesState) -> dict:
    result = llm.invoke([
        ("system", "You are a writing specialist. Create polished content."),
        *state["messages"]
    ])
    return {"messages": [result]}

graph = StateGraph(MessagesState)
graph.add_node("supervisor", supervisor)
graph.add_node("researcher", researcher)
graph.add_node("writer", writer)

graph.add_edge(START, "supervisor")
graph.add_conditional_edges("supervisor", route)
graph.add_edge("researcher", "supervisor")
graph.add_edge("writer", "supervisor")

app = graph.compile()
```

For handoff patterns, create `@tool(return_direct=True)` transfer functions (e.g., `transfer_to_billing`, `transfer_to_support`) and give each agent the ability to call other agents' transfer tools.

### Step 9: Streaming and Subgraphs

Stream node outputs with `stream_mode="updates"` or stream LLM tokens with `stream_mode="messages"`. Compose complex systems using subgraphs — compile a smaller `StateGraph` and add it as a node in a parent graph:

```python
# Stream node outputs
for chunk in app.stream({"messages": [("human", "Research AI trends")]}, stream_mode="updates"):
    for node_name, output in chunk.items():
        print(f"[{node_name}]: {output}")

# Use compiled subgraph as a node
parent = StateGraph(ParentState)
parent.add_node("research", research_compiled)  # compiled subgraph
parent.add_node("publish", publish_node)
parent.add_edge(START, "research")
parent.add_edge("research", "publish")
```

## Examples

### Example 1: Build a customer support agent with tool use
**User prompt:** "Create a LangGraph agent that handles customer support. It should be able to look up order status, check return eligibility, and escalate to a human when it can't resolve the issue."

The agent will define three tools — `lookup_order` (takes an order ID and returns status/tracking), `check_return_eligibility` (takes order ID and returns whether it qualifies), and `escalate_to_human` (flags the conversation for human review). It will create a `State` TypedDict with an `add_messages` reducer, wire up a ReAct-pattern graph with an LLM node that calls tools in a loop, add a conditional edge that routes to `END` when no tool calls remain or routes to a `ToolNode`, and compile the graph with `MemorySaver` for conversation persistence across multiple turns using `thread_id`.

### Example 2: Create a multi-agent research and writing pipeline
**User prompt:** "Build a LangGraph workflow where a researcher agent gathers information about a topic, a writer agent drafts an article, and a reviewer agent provides feedback. The writer should revise up to 3 times based on feedback before publishing."

The agent will define a `ResearchState` with fields for topic, sources, draft, review notes, and revision count using `Annotated[list, add]` for sources. It will create four nodes — `research` (gathers sources via web search tool), `write` (drafts article from sources), `review` (evaluates draft quality), and `publish` (outputs final article). A `should_revise` conditional edge will route back to `write` if the reviewer requests changes and `revision_count < 3`, otherwise route to `publish`. The graph compiles with checkpointing so the user can inspect intermediate states.

## Guidelines

1. **Start with prebuilt agents** — `create_react_agent` covers 80% of use cases
2. **Use TypedDict state** — clear types prevent runtime bugs
3. **Keep nodes focused** — each node does one thing well
4. **Add persistence early** — checkpointing enables recovery, debugging, and human-in-the-loop
5. **Limit cycles** — always have a max iteration count to prevent infinite loops
6. **Use conditional edges** — they make control flow explicit and debuggable
7. **Stream in production** — users need feedback during multi-step agent runs
8. **Test with deterministic inputs** — mock tool outputs for reliable tests
9. **Visualize your graph** — `app.get_graph().draw_mermaid_png()` helps debug topology
10. **Use LangSmith tracing** — essential for debugging multi-node agent runs

## Common Pitfalls

- **Forgetting reducers**: Without `Annotated[list, add]`, lists get overwritten instead of appended
- **Infinite loops**: Always add a max-iteration check in conditional edges
- **State key mismatches**: Node return keys must match State fields exactly
- **Not compiling**: `graph.compile()` is required before `.invoke()`
- **Mixing up `START`/`END`**: Import from `langgraph.graph`, not strings
- **Checkpoint without thread_id**: Always pass `configurable.thread_id` when using persistence
