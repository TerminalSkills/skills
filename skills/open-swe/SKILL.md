---
name: open-swe
description: >-
  Build asynchronous coding agents using LangChain's Open SWE framework — agents that plan,
  code, test, and iterate on software engineering tasks. Use when: building coding bots,
  automating issue resolution, creating SWE agents that work on repos asynchronously.
license: MIT
compatibility: "Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: [swe-agent, coding-agent, langchain, async, automation]
  use-cases:
    - "Build a bot that picks up GitHub issues and submits PRs automatically"
    - "Create an async coding agent that works on tasks while you sleep"
    - "Automate bug fixes and code improvements with SWE agent patterns"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Open SWE

## Overview

Open SWE (by LangChain) is an open-source framework for building asynchronous software engineering agents that can autonomously plan, code, test, and submit pull requests. Unlike synchronous coding assistants, Open SWE agents work in the background — pick up a GitHub issue, work on it for minutes to hours, and deliver a ready-to-review PR.

```
GitHub Issue (labeled "ai-fix")
    ↓ webhook
Open SWE Agent
    ├── Planner: analyze issue, explore codebase, create plan
    ├── Coder: implement changes following plan
    ├── Tester: run tests, fix failures
    └── Reviewer: self-review before PR
    ↓
Pull Request with description + test results
```

## Instructions

When a user asks to build an async coding agent, automate issue resolution, or create SWE bots:

1. **Install Open SWE** — `pip install open-swe langgraph langchain-anthropic`
2. **Configure the agent** — Instantiate `SWEAgent` with an LLM, repo path, and tools
3. **Connect to GitHub** — Use `GitHubIntegration` to listen for labeled issues
4. **Decompose complex tasks** — Use `TaskPlanner` for multi-step issues
5. **Enable test loops** — Set `run_tests=True` so the agent iterates until tests pass

### Basic Agent Setup

```python
from open_swe import SWEAgent
from langchain_anthropic import ChatAnthropic

llm = ChatAnthropic(model="claude-sonnet-4-20250514")
agent = SWEAgent(llm=llm, repo_path="/path/to/repo", tools=["bash", "file_editor", "search"])

result = await agent.solve(
    issue="Fix the login timeout bug - sessions expire after 5 minutes instead of 30",
)
print(result.patch)       # unified diff
print(result.explanation) # what was changed and why
```

### GitHub Integration

```python
from open_swe.integrations import GitHubIntegration

github = GitHubIntegration(token=os.environ["GITHUB_TOKEN"], repo="owner/repo")

@github.on_issue(labels=["ai-fix"])
async def handle_issue(issue):
    agent = SWEAgent(llm=llm, repo_path=github.clone())
    result = await agent.solve(issue=issue.body)
    if result.success:
        pr = await github.create_pr(
            title=f"Fix: {issue.title}",
            body=f"Resolves #{issue.number}\n\n{result.explanation}",
            branch=f"ai-fix/{issue.number}",
            patch=result.patch,
        )
        await issue.comment(f"PR created: {pr.url}")
    else:
        await issue.comment(f"Could not resolve automatically:\n{result.error}")
```

## Examples

### Example 1: Decompose a Complex Feature into Subtasks

```python
from open_swe.planner import TaskPlanner

planner = TaskPlanner(llm=llm)
tasks = await planner.decompose(
    issue="Add user avatar upload with S3 storage and image resizing",
    codebase_context=agent.explore_codebase(),
)
# Returns: [
#   "Add S3 upload utility in lib/storage.ts",
#   "Create avatar resize middleware using sharp",
#   "Add PUT /api/users/:id/avatar endpoint",
#   "Write tests for upload and resize",
#   "Update user profile component to show avatar",
# ]

for task in tasks:
    result = await agent.solve(issue=task)
    agent.apply_patch(result.patch)
```

### Example 2: Process Multiple Issues in Parallel with Test Loops

```python
import asyncio
from open_swe import SWEAgent

async def process_issues(issues: list[str]):
    tasks = []
    for issue in issues:
        agent = SWEAgent(llm=llm, repo_path=clone_repo())
        tasks.append(agent.solve(issue=issue, max_iterations=5, run_tests=True, test_command="pytest"))
    return await asyncio.gather(*tasks)

results = asyncio.run(process_issues([
    "Fix SQL injection in search endpoint",
    "Add rate limiting to API",
    "Update deprecated dependencies",
    "Add input validation to signup form",
    "Fix timezone bug in event scheduler",
]))

for r in results:
    for i, attempt in enumerate(r.iterations):
        print(f"Attempt {i+1}: {'PASS' if attempt.tests_passed else 'FAIL'}")
```

## Guidelines

- **Explore first** — The agent should read relevant files before coding
- **Plan before code** — Create an implementation plan, get approval for large changes
- **Test after change** — Run tests after every modification to catch regressions early
- **Self-review** — Check own code for issues before submitting a PR
- **Incremental** — Apply changes file by file, testing between each step
