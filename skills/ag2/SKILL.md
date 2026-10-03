---
name: ag2
description: >-
  AG2 (formerly AutoGen) is an open-source Python framework for building AI
  agents and multi-agent systems that use tools, human approval and structured
  conversations. Use it when you need agents that call functions, collaborate
  in a group chat, execute code, or when you are migrating AutoGen or
  pyautogen code to AG2 v1 or ag2-classic.
license: Apache-2.0
compatibility: Python 3.10+, an API key for the chosen model provider
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/ag2ai/ag2
  tags:
    - multi-agent
    - autogen
    - orchestration
    - python
    - agents
---

# AG2 (AutoGen) — Multi-Agent Conversation Framework

## Overview

AG2 is the community continuation of Microsoft's AutoGen. Since **v1.0** (current: 1.1.1, September 2026) it is a new, async-first framework and is **not backward compatible** with classic AutoGen:

| You see in code | You have | Install |
|---|---|---|
| `from ag2 import Agent`, `from ag2.config import OpenAIConfig` | AG2 v1 | `pip install "ag2[openai]"` |
| `from autogen import ConversableAgent, GroupChat, UserProxyAgent` | classic AutoGen / AG2 0.x | `pip install ag2-classic` (its README also shows `autogen[openai]`) |

Classic is in maintenance mode (security fixes only). Do not mix the two APIs in one file. Provider extras for v1: `ag2[openai]`, `ag2[anthropic]`, `ag2[gemini]`, `ag2[ollama]` and others. Docs: https://docs.ag2.ai (v1) and https://classic.docs.ag2.ai (classic).

## Instructions

### AG2 v1: an agent with a tool

```python
import asyncio
from ag2 import Agent, tool
from ag2.config import OpenAIConfig      # also AnthropicConfig, GeminiConfig, OllamaConfig, ...


@tool
async def count_lines(path: str) -> str:
    """Count the lines in a source file inside the current project."""
    with open(path, encoding="utf-8") as f:
        return f"{path}: {sum(1 for _ in f)} lines"


reviewer = Agent(
    "reviewer",
    prompt="You review Python code. Use tools to inspect files before judging them.",
    config=OpenAIConfig("gpt-4o-mini"),   # key is read from OPENAI_API_KEY
    tools=[count_lines],
)


async def main() -> None:
    reply = await reviewer.ask("How big is app/main.py?")
    print(reply.body)
    follow_up = await reply.ask("Is that too large for one module?")  # keeps the history
    print(follow_up.body)


asyncio.run(main())
```

- `agent.ask(...)` returns a reply; `reply.body` is the text and `reply.ask(...)` continues the same conversation.
- A tool is a typed function with a docstring decorated with `@tool`; the signature and docstring become the schema the model sees.
- Stream or observe a turn with `async with agent.run("...") as run: run.start(); async for event in run.stream...` and `await run.result()`.
- Human approval: pass `hitl_hook=` to `Agent`; it receives a `HumanInputRequest` (from `ag2.events`) and returns a `HumanMessage(content=...)`.
- Test without an LLM: `from ag2.testing import TestConfig` and pass `TestConfig("scripted reply")` (or `ToolCallEvent`s) as `config`.

### AG2 v1: several agents

v1 replaces `GroupChat`, swarm and nested chats with a **Network**: a `Hub` registers agents, and they talk over typed channels (`conversation` for free two-party chat, `consulting` for one question and one answer, `discussion` for round-robin among N agents, `workflow` for a `TransitionGraph` of conditional handoffs, the closest analogue to GroupChat). Read the group-chat migration guide on docs.ag2.ai before writing this part; the classes live in `ag2.network` (`Hub`, `Channel`, `TransitionGraph`, `Handoff`).

### Classic AutoGen (`ag2-classic`): two agents and group chat

Only for existing code that imports `autogen`.

```python
from autogen import ConversableAgent, LLMConfig, UserProxyAgent, register_function
from autogen.agentchat import run_group_chat
from autogen.agentchat.group.patterns import AutoPattern

llm_config = LLMConfig(api_type="openai", model="gpt-4o-mini")   # key from OPENAI_API_KEY

engineer = ConversableAgent(
    name="engineer",
    system_message="You write clean, tested Python. Explain design decisions briefly.",
    llm_config=llm_config,
)
runner = UserProxyAgent(
    name="runner",
    human_input_mode="NEVER",              # NEVER / ALWAYS / TERMINATE
    max_consecutive_auto_reply=10,
    is_termination_msg=lambda m: "TERMINATE" in (m.get("content") or ""),
    code_execution_config={"work_dir": "workspace", "use_docker": True},
)
result = runner.initiate_chat(engineer, message="Write a FastAPI /health endpoint with a pytest test.", max_turns=6)

reviewer = ConversableAgent(name="reviewer", system_message="You review code for bugs and security issues.", llm_config=llm_config)
pattern = AutoPattern(
    agents=[engineer, reviewer],
    initial_agent=engineer,
    group_manager_args={"name": "manager", "llm_config": llm_config},
)
response = run_group_chat(pattern=pattern, messages="Build a rate limiter for our API.", max_rounds=12)
```

Tools in classic: `register_function(fn, caller=engineer, executor=runner, description="...")`. The caller proposes the call, the executor runs it. Classic also has `LLMConfig.from_json(path="OAI_CONFIG_LIST")` for a config file. Only the register and `run_group_chat` calls above were checked against the classic README; check other classic details at classic.docs.ag2.ai.

## Examples

### Example 1: Single agent that inspects a repository

**User request:** "Make me an AG2 agent that can count lines in files and answer questions about them."

Install with `python -m venv .venv && .venv/bin/pip install "ag2[openai]"`, save the v1 code above as `reviewer.py`, set `OPENAI_API_KEY` in the environment and run `.venv/bin/python reviewer.py`. The agent calls `count_lines` for `app/main.py`, then prints a sentence such as "app/main.py has 212 lines". The follow-up question reuses the same history.

### Example 2: Unit-test an agent without calling an LLM

**User request:** "I want to test my AG2 tool wiring in CI without an API key."

```python
from ag2 import Agent
from ag2.events import ToolCallEvent
from ag2.testing import TestConfig

config = TestConfig(
    ToolCallEvent(name="count_lines", arguments='{"path": "app/main.py"}'),
    "app/main.py has 212 lines",
)
agent = Agent("reviewer", prompt="Use tools.", config=config, tools=[count_lines])
reply = await agent.ask("How big is app/main.py?")
assert "212" in reply.body
```

The scripted model requests the tool, AG2 runs the real `count_lines`, and the scripted second turn is the answer. Each `ask` consumes scripted turns, so supply enough for follow-ups.

## Guidelines

- Check which API a file uses (`ag2` vs `autogen` imports) before editing; v1 and classic are different libraries.
- Keep keys in environment variables, never in code or a committed `OAI_CONFIG_LIST`.
- Give each agent a narrow prompt and only the tools it needs; vague prompts produce unfocused loops.
- Always bound loops: `max_turns` / `max_rounds` and `max_consecutive_auto_reply` in classic, and watch token usage in group chats.
- Classic code execution runs model-written code: keep `use_docker: True`, and never point `work_dir` at a real project.
- Require human approval (`hitl_hook` in v1, `human_input_mode="ALWAYS"` or `"TERMINATE"` in classic) before irreversible actions.
- Do not migrate a working classic system to v1 unprompted; v1 is a rewrite of orchestration, not a version bump.
