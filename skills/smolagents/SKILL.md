---
name: smolagents
description: >-
  smolagents is Hugging Face's small Python library for building AI agents that
  solve a task by writing and running Python code that calls your tools. Use
  when a user asks to build an agent with smolagents, create a CodeAgent or
  ToolCallingAgent, write a tool with the @tool decorator, connect an agent to
  an MCP server or a Hub tool, set up a manager agent with sub-agents, switch
  the model behind an agent (Hugging Face Inference Providers, OpenAI,
  Anthropic, Ollama), or run agent-generated code in a Docker or E2B sandbox.
license: Apache-2.0
compatibility: "Python 3.10+. An LLM endpoint: a Hugging Face token, an OpenAI-compatible API key, or a local model."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/huggingface/smolagents
  tags:
    - huggingface
    - agents
    - tools
    - multi-agent
    - python
---

# smolagents — Hugging Face Lightweight Agent Framework

## Overview

smolagents runs a ReAct loop around any LLM. Its main agent, `CodeAgent`, has the model write a Python snippet at every step; the snippet calls your tools as plain functions and ends by calling `final_answer(...)`. `ToolCallingAgent` does the same job with JSON tool calls. Tools are decorated functions, MCP servers, or Hub repositories; agents can manage other agents; generated code runs in a restricted local interpreter or in a remote sandbox. This skill follows smolagents 1.26.

## Instructions

### Install

The core package has no model client. Add the extras for the model and tools you use:

```bash
python -m venv .venv && source .venv/bin/activate
pip install "smolagents[toolkit]"            # core + web search and webpage tools
pip install "smolagents[openai]"             # OpenAIModel, AzureOpenAIModel
pip install "smolagents[litellm]"            # LiteLLMModel: Anthropic, Ollama, 100+ providers
pip install "smolagents[mcp]" "mcp<2"        # MCPClient; with mcp 2.x it fails on import (mcpadapt 0.1.20)
pip install "smolagents[docker]"             # executor_type="docker" (also: e2b, modal, blaxel)
```

### Pick a model

```python
import os
from smolagents import InferenceClientModel, OpenAIModel, LiteLLMModel

# Hugging Face Inference Providers; reads HF_TOKEN from the environment
model = InferenceClientModel(model_id="deepseek-ai/DeepSeek-R1", provider="together")

# OpenAI, or any OpenAI-compatible server through api_base
model = OpenAIModel(model_id="gpt-5", api_key=os.environ["OPENAI_API_KEY"])

# Anthropic through LiteLLM (provider prefix + the provider's model id)
model = LiteLLMModel(model_id="anthropic/claude-sonnet-5-5", api_key=os.environ["ANTHROPIC_API_KEY"])

# Local Ollama; raise num_ctx, the Ollama default context is too small for agents
model = LiteLLMModel(model_id="ollama_chat/llama3.2", api_base="http://localhost:11434", num_ctx=8192)
```

`HfApiModel` was renamed to `InferenceClientModel` and no longer imports. `OpenAIServerModel` still works as an alias of `OpenAIModel`. There is no `AnthropicServerModel`; use `LiteLLMModel`.

### Write tools and run a CodeAgent

A tool is a typed function with a docstring. The description and the `Args:` section are placed in the system prompt, so they are the manual the model reads.

```python
from smolagents import CodeAgent, tool

ORDERS = {"ORD-20481": 129.50, "ORD-20482": 80.00}

@tool
def get_order_total(order_id: str) -> float:
    """Return the total amount in USD of one order.

    Args:
        order_id: Order identifier, for example "ORD-20481".
    """
    return ORDERS[order_id]

agent = CodeAgent(
    tools=[get_order_total],
    model=model,
    max_steps=6,                                   # default is 20
    additional_authorized_imports=["statistics"],  # imports the generated code may use
    instructions="Answer with a number rounded to two decimals.",
)
total = agent.run("What is the combined total of orders ORD-20481 and ORD-20482?")
print(total)   # 209.5
```

`agent.run()` returns whatever the generated code passed to `final_answer`. Useful options: `add_base_tools=True` (adds `web_search` and `visit_webpage`; needs the `toolkit` extra), `planning_interval=3` (a planning step every three steps), `final_answer_checks=[fn]` (reject an answer and keep going), `stream_outputs=True`, and `return_full_result=True` (a `RunResult` with `output`, `state` and `token_usage`). After a run, `agent.memory.steps` holds every step and `agent.replay()` prints them.

For models that are better at JSON tool calls than at writing code, swap the class and keep everything else:

```python
from smolagents import ToolCallingAgent
agent = ToolCallingAgent(tools=[get_order_total], model=model)
```

### Managed agents

`ManagedAgent` was removed. Give any agent a `name` and a `description` and pass it in `managed_agents`; the manager calls it like a tool.

```python
from smolagents import CodeAgent, ToolCallingAgent, WebSearchTool, VisitWebpageTool

web_agent = ToolCallingAgent(
    tools=[WebSearchTool(), VisitWebpageTool()],
    model=model,
    max_steps=10,
    name="web_search_agent",
    description="Runs web searches and reads pages. Give it a full question.",
)
manager = CodeAgent(tools=[], model=model, managed_agents=[web_agent],
                    additional_authorized_imports=["pandas", "numpy"])
```

### Tools from MCP servers and the Hub

```python
import os
from mcp import StdioServerParameters
from smolagents import CodeAgent, MCPClient, load_tool

server = StdioServerParameters(command="uvx", args=["--quiet", "pubmedmcp@0.1.3"],
                               env={"UV_PYTHON": "3.12", **os.environ})
with MCPClient(server, structured_output=True) as tools:
    agent = CodeAgent(tools=tools, model=model)
    agent.run("Find two recent reviews on statin intolerance and list their PMIDs.")

# Streamable HTTP server
with MCPClient({"url": "http://127.0.0.1:8000/mcp", "transport": "streamable-http"}) as tools:
    agent = CodeAgent(tools=tools, model=model)

# A tool published on the Hub. It downloads and runs that repository's code.
image_tool = load_tool("m-ric/text-to-image", trust_remote_code=True)
```

### Sandbox the generated code

By default the code runs in `LocalPythonExecutor`: an AST interpreter inside your own process that blocks unlisted imports and caps loop iterations. It is a guard, not a security boundary. For untrusted input or web-browsing agents, send the code to a sandbox and use the agent as a context manager so the sandbox is cleaned up:

```python
with CodeAgent(tools=[], model=model, executor_type="docker") as agent:   # or "e2b", "modal", "blaxel"
    agent.run("What is the 100th Fibonacci number?")
```

Remote executors run only the code snippets; model calls stay local, so managed agents do not work with `executor_type`. To sandbox a multi-agent system, run the whole script inside the container.

### Command line

```bash
smolagent "List the three largest moons of Saturn with their radius in km." \
  --model-type LiteLLMModel --model-id anthropic/claude-sonnet-5-5 \
  --tools web_search --imports pandas numpy
smolagent        # no prompt: interactive setup wizard
```

`--action-type tool_calling` switches to a `ToolCallingAgent`. Built-in tool names are `web_search`, `visit_webpage` and `python_interpreter`. With `LiteLLMModel` the key comes from the provider's usual variable (`ANTHROPIC_API_KEY` here) or `--api-key`. `--model-type OpenAIModel` points at Fireworks unless you also pass `--api-base`.

## Examples

### Example 1: Agent that analyzes a CSV with pandas

**User request:** "Build an agent that reads our `orders.csv` and tells me revenue per country."

```python
# analyst.py — requires: pip install "smolagents[litellm]" pandas
import os
from smolagents import CodeAgent, LiteLLMModel, tool

@tool
def csv_path(dataset: str) -> str:
    """Return the local file path of a named dataset.

    Args:
        dataset: Dataset name. The only available dataset is "orders".
    """
    return {"orders": "data/orders.csv"}[dataset]

model = LiteLLMModel(model_id="anthropic/claude-sonnet-5-5", api_key=os.environ["ANTHROPIC_API_KEY"])
agent = CodeAgent(
    tools=[csv_path],
    model=model,
    additional_authorized_imports=["pandas"],
    max_steps=8,
)
print(agent.run(
    "Load the orders dataset (columns: order_id, country, amount_usd) and return "
    "a dict of total amount_usd per country, highest first."
))
```

The console shows each step with the code the model wrote (`pd.read_csv(csv_path(dataset="orders"))`, a `groupby`, then `final_answer(...)`) and its execution logs. The script prints the returned object, for example `{'DE': 48210.0, 'FR': 31975.5, 'NL': 12040.0}`. Without `"pandas"` in `additional_authorized_imports` the step fails with `InterpreterError: Import of pandas is not allowed`; the error goes back to the model, which has to find another way within `max_steps`.

### Example 2: Research manager with a web sub-agent

**User request:** "I want one agent that searches the web and another that writes the summary from what it found."

```python
# research.py — requires: pip install "smolagents[toolkit,openai]"
import os
from smolagents import CodeAgent, ToolCallingAgent, OpenAIModel, WebSearchTool, VisitWebpageTool

model = OpenAIModel(model_id="gpt-5", api_key=os.environ["OPENAI_API_KEY"])

web_agent = ToolCallingAgent(
    tools=[WebSearchTool(max_results=5), VisitWebpageTool()],
    model=model,
    max_steps=10,
    name="web_search_agent",
    description="Searches the web and reads pages. Pass it one precise question.",
)
manager = CodeAgent(
    tools=[],
    model=model,
    managed_agents=[web_agent],
    planning_interval=3,
    return_full_result=True,
)
result = manager.run("Compare the 2025 EU and US rules on AI model transparency in five bullet points with sources.")
print(result.output)
print(result.token_usage)
```

The manager writes code such as `notes = web_search_agent(task="...")`; the sub-agent's report comes back as a string starting with `Here is the final answer from your managed agent 'web_search_agent':`. `result.output` holds the five bullets, and `result.token_usage` reports the input and output token counts.

## Guidelines

- **Local execution is not a sandbox.** `LocalPythonExecutor` limits imports and operations but runs in your process with your permissions. Use `executor_type="docker"`, `"e2b"`, `"modal"` or `"blaxel"` whenever the agent reads web pages, user uploads or other untrusted text.
- **Authorize imports narrowly.** Each entry in `additional_authorized_imports` widens what generated code can do. Submodules need their own entry or a wildcard such as `"numpy.*"`; never authorize `os`, `subprocess` or `"*"` outside a sandbox.
- **`trust_remote_code=True` runs someone else's code.** Read the tool's `tool.py` on the Hub before `load_tool`, and treat MCP servers started over stdio the same way.
- **Tool docstrings are the prompt.** `@tool` raises `DocstringParsingException` when a parameter has no `Args:` description and `TypeHintParsingException` when it has no type hint; vague descriptions cause wrong calls. Put imports a tool needs inside the function if you plan to `push_to_hub` it.
- **Bound the run.** `max_steps` defaults to 20 and every step is an LLM call with the growing history; set it per agent and watch `token_usage`.
- **Keep secrets out of the task text.** Pass API keys through environment variables read inside tools, not in the prompt or in `additional_args`, since both end up in the model's context and in logs.
- **Small local models struggle with `CodeAgent`.** If the model keeps producing malformed code blocks, try `ToolCallingAgent` or a stronger model before tuning prompts.
- **When not to use it:** a fixed pipeline with known steps needs no agent loop; plain function calls are cheaper and deterministic.
