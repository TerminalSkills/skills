---
name: ag2
description: >-
  You are an expert in AG2 (formerly AutoGen), the open-source multi-agent
  conversation framework. You help developers build systems where multiple AI
  agents collaborate through structured conversations — with tool use,
  human-in-the-loop, code execution, group chat orchestration, and nested
  conversations — for complex tasks like software development, research, and
  data analysis.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - multi-agent
    - conversation
    - autogen
    - microsoft
    - orchestration
    - python
---

# AG2 (AutoGen) — Multi-Agent Conversation Framework

You are an expert in AG2 (formerly AutoGen), the open-source multi-agent conversation framework. You help developers build systems where multiple AI agents collaborate through structured conversations — with tool use, human-in-the-loop, code execution, group chat orchestration, and nested conversations — for complex tasks like software development, research, and data analysis.

## Core Capabilities

### Two-Agent Conversation

```python
from autogen import ConversableAgent, UserProxyAgent

# AI assistant agent
assistant = ConversableAgent(
    name="Engineer",
    system_message="""You are a senior software engineer.
    Write clean, tested Python code. Explain your design decisions.""",
    llm_config={"model": "gpt-4o", "temperature": 0.2},
)

# Human proxy (can auto-approve or require human input)
user_proxy = UserProxyAgent(
    name="User",
    human_input_mode="NEVER",             # NEVER / ALWAYS / TERMINATE
    max_consecutive_auto_reply=10,
    is_termination_msg=lambda msg: "TERMINATE" in msg.get("content", ""),
    code_execution_config={
        "work_dir": "workspace",
        "use_docker": True,               # Safe code execution in Docker
    },
)

# Start conversation — agents talk until task is complete
result = user_proxy.initiate_chat(
    assistant,
    message="Create a FastAPI app with user authentication using JWT. Include tests.",
)
# Engineer writes code → User proxy executes → Engineer reviews output → iterates
```

### Group Chat (Multiple Agents)

```python
from autogen import GroupChat, GroupChatManager

# Specialist agents
architect = ConversableAgent(
    name="Architect",
    system_message="You design system architecture. Focus on scalability, reliability, and clean interfaces.",
    llm_config={"model": "gpt-4o"},
)

developer = ConversableAgent(
    name="Developer",
    system_message="You implement features based on the architect's design. Write production-quality code.",
    llm_config={"model": "gpt-4o"},
)

reviewer = ConversableAgent(
    name="Reviewer",
    system_message="You review code for bugs, security issues, and best practices. Be thorough but constructive.",
    llm_config={"model": "gpt-4o"},
)

tester = ConversableAgent(
    name="Tester",
    system_message="You write comprehensive tests. Cover edge cases and integration scenarios.",
    llm_config={"model": "gpt-4o"},
)

# Group chat with round-robin or AI-selected speaker
group_chat = GroupChat(
    agents=[user_proxy, architect, developer, reviewer, tester],
    messages=[],
    max_round=20,
    speaker_selection_method="auto",      # LLM picks next speaker based on context
)

manager = GroupChatManager(groupchat=group_chat, llm_config={"model": "gpt-4o"})

user_proxy.initiate_chat(
    manager,
    message="Build a real-time notification service with WebSocket support, Redis pub/sub, and rate limiting.",
)
# Architect designs → Developer implements → Reviewer catches issues → Developer fixes → Tester adds tests
```

### Tool Use

```python
from autogen import register_function

def search_codebase(query: str, file_pattern: str = "*.py") -> str:
    """Search the codebase for specific patterns.

    Args:
        query: Search query (regex supported)
        file_pattern: File glob pattern to search in
    """
    import subprocess
    result = subprocess.run(["grep", "-rn", query, "--include", file_pattern, "."],
                           capture_output=True, text=True)
    return result.stdout[:2000]

def run_tests(test_path: str = "tests/") -> str:
    """Run pytest on the specified test directory.

    Args:
        test_path: Path to test files or directory
    """
    import subprocess
    result = subprocess.run(["python", "-m", "pytest", test_path, "-v", "--tb=short"],
                           capture_output=True, text=True)
    return f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"

# Register tools for specific agents
register_function(search_codebase, caller=developer, executor=user_proxy,
    description="Search the codebase for code patterns")
register_function(run_tests, caller=tester, executor=user_proxy,
    description="Run tests to verify code correctness")
```

## Installation

```bash
pip install ag2                           # Or: pip install pyautogen
```

## Best Practices

1. **Clear system messages** — Define each agent's role precisely; vague instructions lead to unfocused conversations
2. **Speaker selection** — Use `auto` for LLM-selected speakers in group chat; `round_robin` for predictable flow
3. **Termination conditions** — Set `is_termination_msg` and `max_consecutive_auto_reply`; prevent infinite loops
4. **Docker for code execution** — Enable `use_docker: True` for safe code execution; agents can run untrusted code
5. **Human-in-the-loop** — Use `TERMINATE` mode for approval on critical actions; `NEVER` for fully autonomous
6. **Tool registration** — Register tools with specific caller/executor pairs; not every agent needs every tool
7. **Nested chats** — Use nested conversations for sub-tasks; agent can spawn a side conversation and return results
8. **Cost control** — Set `max_round` and `max_consecutive_auto_reply`; monitor token usage in group chats
