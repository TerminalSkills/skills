---
name: deepagents
description: >-
  Deep Agents is LangChain's open-source Python harness for long-running agents: one call, create_deep_agent(), returns a LangGraph agent that already has file tools, a task tool for sub-agents, context summarization, and optional human approval. Use when someone asks to "build a deep agent", "research agent with sub-agents", "agent that reads and writes files", "give my agent a virtual filesystem", "deepagents create_deep_agent", or needs more than a plain tool-calling loop but less than a hand-built LangGraph.
license: Apache-2.0
compatibility: "Python 3.11+, deepagents 0.7.x, an API key for the chat model provider"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "deepagents, langchain, langgraph, ai-agents, sub-agents"
  repository: https://github.com/langchain-ai/deepagents
---
# Deep Agents — a batteries-included harness for long-horizon agents

## Overview

`deepagents` (MIT, Python 3.11+) wraps LangChain's `create_agent` with the pieces long tasks need: a filesystem the agent reads and writes (`ls`, `read_file`, `write_file`, `edit_file`, `delete`, `glob`, `grep`), an `execute` shell tool when the backend supports it, a `task` tool that hands work to sub-agents with their own context window, summarization of long threads, and human-in-the-loop approval. The result is a compiled LangGraph graph, so streaming, checkpointers and LangGraph Studio work as usual.

There is no built-in to-do or planning tool in 0.7.34: the default agent's tools are the seven file tools, `execute` and `task`. To add `write_todos`, pass LangChain's `TodoListMiddleware()` in `middleware=[...]` (`from langchain.agents.middleware import TodoListMiddleware`).

Pick it when the agent has to work for many steps and keep notes in files or delegate. For a short tool-calling loop use LangChain `create_agent` (skill `langchain`); when the control flow itself needs a custom graph, use `langgraph`. This skill covers the Python SDK; a JavaScript port exists as a separate project (`deepagentsjs`) and is not covered here.

## Instructions

### Installation

```bash
python3 -m venv .venv
.venv/bin/pip install "deepagents==0.7.34"
```

The package pulls in `langchain` (and with it `langgraph`), `langchain-anthropic` and `langchain-google-genai`. For another provider add its LangChain package (`langchain-openai`, `langchain-google-genai`, `langchain-ollama`) and set that provider's key. Never hard-code keys:

```bash
export ANTHROPIC_API_KEY="..."   # created at console.anthropic.com
```

### Create an agent

Always pass `model` explicitly. Relying on the built-in default (`claude-sonnet-4-6`) is deprecated and will be removed. A model is either a `"provider:model-name"` string or a LangChain chat model object.

```python
from deepagents import create_deep_agent

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    system_prompt="You are a careful research assistant. Write findings to /notes.md.",
)

result = agent.invoke({"messages": [{"role": "user", "content": "List three risks of migrating from MySQL 5.7 to PostgreSQL 17 and save them to /notes.md"}]})
print(result["messages"][-1].content)
```

Notes: `system_prompt` is added to the harness prompt rather than replacing it. The input is a LangGraph state with a `messages` list. Stream with `agent.stream(..., stream_mode="updates")`.

### Add your own tools

`tools` takes plain Python functions (type hints and docstring become the schema), LangChain tools, or MCP-loaded tools.

```python
def lookup_order(order_id: str) -> str:
    """Return the status line for an order id such as ORD-20931."""
    return f"{order_id}: shipped 2026-11-02, carrier DHL"

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[lookup_order],
    system_prompt="Answer shipping questions using lookup_order.",
)
```

### Sub-agents

A sub-agent is a dict with `name` and `description` (required) plus optional `system_prompt`, `tools`, `model`, `middleware`, `interrupt_on`, `skills`, `permissions`. Without `tools` it inherits the main agent's. The main agent delegates through the built-in `task` tool, and a `general-purpose` sub-agent exists by default. Describe each sub-agent by action, because that text is what the model reads to decide when to delegate.

```python
subagents = [
    {
        "name": "source-reader",
        "description": "Reads one document in full and returns a 150-word digest with quotes.",
        "system_prompt": "Read the file you are given. Return only the digest.",
        "model": "anthropic:claude-haiku-4-5",
    },
]
agent = create_deep_agent(model="anthropic:claude-sonnet-4-6", subagents=subagents)
```

Use `CompiledSubAgent` to plug in any existing LangGraph graph, and `AsyncSubAgent` for a remote one. Both are exported from `deepagents`.

### Backends: where the files live

The default `StateBackend` keeps files inside the agent state (a virtual filesystem, nothing touches disk). Choose another backend with `backend=`:

| Backend | Use |
|---|---|
| `StateBackend()` | default, ephemeral, per thread |
| `FilesystemBackend(root_dir=..., virtual_mode=True)` | real files under one root directory |
| `LocalShellBackend(root_dir=..., timeout=120)` | real files plus a working `execute` tool, runs commands on your machine |
| `StoreBackend(namespace=<callable>)` | persistence across threads via a LangGraph store; `namespace` is required and receives the runtime and returns a tuple such as `("user-42",)`; pass `store=` here or to `create_deep_agent` |
| `CompositeBackend(default, routes={"/memories/": ...})` | different backends per path prefix |
| `LangSmithSandbox(sandbox)` | wraps a LangSmith `Sandbox` object: remote sandbox for untrusted code |

```python
from deepagents.backends import FilesystemBackend

backend = FilesystemBackend(root_dir="/srv/reports/q4", virtual_mode=True)
agent = create_deep_agent(model="anthropic:claude-sonnet-4-6", backend=backend)
```

With the non-shell backends the `execute` tool exists but returns an error; only a sandbox backend can run commands.

### Limit access and require approval

`permissions` takes `FilesystemPermission(operations, paths, mode)` rules; `mode` is `"allow"`, `"deny"` or `"interrupt"`, and every path must start with `/`. `interrupt_on` pauses named tools for a human and needs a checkpointer.

```python
from deepagents import FilesystemPermission
from langgraph.checkpoint.memory import InMemorySaver

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    backend=FilesystemBackend(root_dir="/srv/reports/q4", virtual_mode=True),
    permissions=[FilesystemPermission(operations=["write"], paths=["/final/**"], mode="interrupt")],
    interrupt_on={"edit_file": True},
    checkpointer=InMemorySaver(),
)
config = {"configurable": {"thread_id": "q4-review-1"}}
agent.invoke({"messages": [{"role": "user", "content": "Tidy /drafts"}]}, config=config)
```

When a run pauses, `result["__interrupt__"]` holds the pending tool call. Resume with the same `thread_id`; each decision is `approve`, `edit`, `reject` or `respond`:

```python
from langgraph.types import Command

agent.invoke(Command(resume={"decisions": [{"type": "approve"}]}), config=config)
```

### Other `create_deep_agent` parameters

`skills=[...]` and `memory=[...]` load SKILL.md folders and AGENTS.md-style memory from backend paths. `response_format` returns structured output. `middleware=[...]` adds LangChain middleware. `store`, `checkpointer`, `name`, `cache`, `context_schema` and `state_schema` pass through to the underlying graph. Read the signature of the installed version before using a parameter you have not seen: `python -c "import inspect, deepagents; print(inspect.signature(deepagents.create_deep_agent))"`.

### The terminal coding agent

The same team ships `deepagents-code` (command `dcode`), a Claude-Code-style terminal agent built on this SDK: `pip install deepagents-code`, then `dcode --help`. Release 0.2.5 requires Python 3.14; on an older Python pip quietly installs an old 0.1.x release, so check `dcode --help` shows `v0.2.5` or use a 3.14 environment. It has `dcode auth`, `dcode skills`, `dcode threads`, `dcode doctor`, and `-M/--model`, `-m/--message`, `-r/--resume`. Do not install the older `deepagents-cli` package: it is deprecated.

## Examples

### 1. Research agent that delegates reading

Request: "Read the 12 vendor PDFs-turned-markdown in ./vendors and write a comparison to /comparison.md."

```python
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    backend=FilesystemBackend(root_dir="./vendors", virtual_mode=True),
    system_prompt=(
        "Delegate each vendor file to source-reader, collect the digests, "
        "then write /comparison.md with one table row per vendor."
    ),
    subagents=[{
        "name": "source-reader",
        "description": "Reads one vendor file and returns price, limits and SLA as 5 bullets.",
        "system_prompt": "Read the given file only. Return the bullets.",
    }],
)
out = agent.invoke({"messages": [{"role": "user", "content": "Compare all vendors in /."}]})
print(out["messages"][-1].content)
```

Result: the main agent makes one `task` call per file, each sub-agent's long reading stays out of the main context, and `./vendors/comparison.md` appears on disk.

### 2. Agent with a business tool and approval before edits

Request: "Let support ask about orders, but a person must approve any file edit."

```python
from deepagents import create_deep_agent
from langgraph.checkpoint.memory import InMemorySaver

def lookup_order(order_id: str) -> str:
    """Return the status line for an order id such as ORD-20931."""
    return f"{order_id}: shipped 2026-11-02, carrier DHL"

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[lookup_order],
    interrupt_on={"write_file": True, "edit_file": True},
    checkpointer=InMemorySaver(),
)
cfg = {"configurable": {"thread_id": "ticket-8812"}}
state = agent.invoke({"messages": [{"role": "user", "content": "Where is ORD-20931? Save the answer to /reply.md"}]}, config=cfg)
print(state.get("__interrupt__"))
```

Result: the agent calls `lookup_order`, then pauses at `write_file`; `__interrupt__` holds the pending tool call for a reviewer to approve, edit or reject.

## Guidelines

- The model must support tool calling. A weak local model will plan badly; test with a strong model first.
- Security follows a "trust the LLM" model: the agent can do anything its tools and backend allow. Enforce limits in the backend (`root_dir`, sandbox, `permissions`), not in the prompt.
- `LocalShellBackend` runs commands directly on the host. Use it only in a disposable container or VM; use a sandbox backend for untrusted input.
- `StateBackend` files live only in the thread's state and never reach disk. Use `FilesystemBackend`, or `StoreBackend` or a `CompositeBackend` route with a `store`, for anything that must persist.
- `interrupt_on` and sub-agent `interrupt_on` need a checkpointer and a stable `thread_id`.
- Pin the version: the API moves quickly (relying on the default model is already deprecated, and parameters are added often).
- Do not use it for a single-step prompt or a fixed pipeline; plain LangChain or LangGraph is cheaper and easier to debug.
- Docs: https://docs.langchain.com/oss/python/deepagents/overview, API reference: https://reference.langchain.com/python/deepagents/
