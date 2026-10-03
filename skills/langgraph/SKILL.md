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
compatibility: 'Python 3.10+ (langgraph 1.x) or Node.js 18+ (@langchain/langgraph)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/langchain-ai/langgraph
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
pip install -U langgraph langchain langchain-openai
# For persistence across restarts:
pip install langgraph-checkpoint-sqlite  # or langgraph-checkpoint-postgres
export OPENAI_API_KEY="..." OPENAI_MODEL="..."   # key and a model id from your provider; code below reads OPENAI_MODEL
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
import os
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
    import ast, operator as op
    ops = {ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul, ast.Div: op.truediv}
    def ev(n):
        if isinstance(n, ast.Constant): return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in ops: return ops[type(n.op)](ev(n.left), ev(n.right))
        raise ValueError("unsupported expression")
    return str(ev(ast.parse(expression, mode="eval").body))  # never eval() model output

tools = [search_web, calculate]
llm = ChatOpenAI(model=os.environ["OPENAI_MODEL"]).bind_tools(tools)

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

For the common tool-calling loop, LangChain 1.x provides `create_agent`, built on LangGraph (it replaces `langgraph.prebuilt.create_react_agent`, deprecated since 1.0; that function's prompt argument is `prompt`, not `state_modifier`):

```python
from langchain.agents import create_agent

agent = create_agent(
    model="openai:" + os.environ["OPENAI_MODEL"],
    tools=[search_web, calculate],
    system_prompt="You are a research assistant. Always cite sources.",
)

result = agent.invoke({"messages": [{"role": "user", "content": "Compare GDP of France and Germany"}]})
print(result["messages"][-1].content)
```

### Step 5: Custom State and Complex Workflows

Use custom `TypedDict` state with `Annotated[list, add]` reducers to accumulate data across nodes. Build workflows with cycles using conditional edges — for example, a research-write-review loop where `should_revise` routes back to revision until quality passes or max iterations are reached:

```python
from operator import add

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
from langgraph.checkpoint.memory import InMemorySaver      # dev only, lost on restart
from langgraph.checkpoint.sqlite import SqliteSaver        # file-based

# SqliteSaver.from_conn_string is a context manager
with SqliteSaver.from_conn_string("checkpoints.db") as memory:
    app = graph.compile(checkpointer=memory)

    # Each thread_id maintains separate conversation state
    config = {"configurable": {"thread_id": "user-123"}}
    app.invoke({"messages": [("human", "Hi, I'm Alice")]}, config)
    result = app.invoke({"messages": [("human", "What's my name?")]}, config)  # remembers Alice
```

Use `PostgresSaver` (call `.setup()` once) in production.

### Step 7: Human-in-the-Loop

Pause inside a node with `interrupt()` and continue with `Command(resume=...)`. A checkpointer and a `thread_id` are required, and the node restarts from its beginning on resume, so keep side effects after the interrupt:

```python
from langgraph.types import interrupt, Command

def send(state: State) -> dict:
    approved = interrupt({"question": "Send this email?", "draft": state["messages"][-1].content})
    if approved:
        send_email(state["messages"][-1].content)
    return {"messages": [("ai", "sent" if approved else "cancelled")]}

app = graph.compile(checkpointer=InMemorySaver())
config = {"configurable": {"thread_id": "email-1"}}
result = app.invoke({"messages": [("human", "Send apology email")]}, config)
print(result["__interrupt__"])                      # the payload for the reviewer
result = app.invoke(Command(resume=True), config)   # approval continues the run
```

`interrupt_before` / `interrupt_after` still exist but the docs recommend them for debugging only.

### Step 8: Multi-Agent Patterns

#### Supervisor Pattern
One agent delegates to specialist workers:

```python
import os
from typing import Literal
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END, MessagesState

llm = ChatOpenAI(model=os.environ["OPENAI_MODEL"])

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
    return "writer" if "writer" in last else END

def make_worker(role: str):
    def worker(state: MessagesState) -> dict:
        return {"messages": [llm.invoke([("system", role), *state["messages"]])]}
    return worker

researcher = make_worker("You are a research specialist. Find facts and data.")
writer = make_worker("You are a writing specialist. Create polished content.")

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
parent.add_edge(START, "research")
```

## Examples

### Example 1: Customer support agent with tools
**User prompt:** "Create a LangGraph agent that handles customer support: look up order status, check return eligibility, and escalate to a human when it can't resolve the issue."

The agent defines `lookup_order`, `check_return_eligibility` and `escalate_to_human` as `@tool` functions, builds the ReAct graph from Step 3 (LLM node, `ToolNode`, conditional edge to `END` when no tool calls remain) and compiles it with a checkpointer so each `thread_id` keeps its own conversation. Result: a multi-turn agent whose answers cite tool output.

### Example 2: Researcher, writer and reviewer pipeline
**User prompt:** "Build a workflow where a researcher gathers information, a writer drafts an article, and a reviewer gives feedback. Revise up to 3 times before publishing."

The agent defines `ResearchState` (topic, sources with an `add` reducer, draft, review notes, `revision_count`) and nodes `research`, `write`, `review`, `publish`. A `should_revise` conditional edge routes back to `write` while the reviewer objects and `revision_count < 3`, otherwise to `publish`. Checkpointing lets you inspect each step with `app.get_state(config)`.

## Guidelines

1. **Start with `create_agent`** — covers the plain tool-calling loop; drop to `StateGraph` when you need custom control flow
4. **Add persistence early** — checkpointing enables recovery, debugging, and human-in-the-loop
6. **Use conditional edges** — they make control flow explicit and debuggable
7. **Stream in production** — users need feedback during multi-step agent runs
9. **Visualize your graph** — `app.get_graph().draw_mermaid()` helps debug topology
10. **Use LangSmith tracing** — essential for debugging multi-node agent runs

## Common Pitfalls

- **Forgetting reducers**: without `Annotated[list, add]`, lists are overwritten instead of appended
- **Infinite loops**: cap iterations in conditional edges
- **State key mismatches**: node return keys must match State fields
- **Not compiling**: `graph.compile()` is required before `.invoke()`
- **Checkpoint without thread_id**: always pass `configurable.thread_id` when using persistence
- **Old APIs**: `create_react_agent(state_modifier=...)` and `MemorySaver`-only tutorials predate 1.0; use `create_agent` and `InMemorySaver`
