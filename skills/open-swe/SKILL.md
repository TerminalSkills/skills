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
  category: ai-tools
  tags: [swe-agent, coding-agent, langchain, async, automation, software-engineering]
  use-cases:
    - "Build a bot that picks up GitHub issues and submits PRs automatically"
    - "Create an async coding agent that works on tasks while you sleep"
    - "Automate bug fixes and code improvements with SWE agent patterns"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Open SWE

## Overview

Open SWE (by LangChain) is an open-source framework for building asynchronous software engineering agents that can autonomously plan, code, test, and submit pull requests. Unlike synchronous coding assistants, Open SWE agents work in the background — pick up a GitHub issue, work on it for minutes to hours, and deliver a ready-to-review PR.

## Architecture

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

## Setup

```bash
pip install open-swe langgraph langchain-anthropic
```

## Basic Agent

```python
from open_swe import SWEAgent
from langchain_anthropic import ChatAnthropic

llm = ChatAnthropic(model="claude-sonnet-4-20250514")

agent = SWEAgent(
    llm=llm,
    repo_path="/path/to/repo",
    tools=["bash", "file_editor", "search"],
)

# Run on an issue
result = await agent.solve(
    issue="Fix the login timeout bug - sessions expire after 5 minutes instead of 30",
)
print(result.patch)       # unified diff
print(result.explanation) # what was changed and why
```

## GitHub Integration

```python
from open_swe.integrations import GitHubIntegration

github = GitHubIntegration(
    token=os.environ["GITHUB_TOKEN"],
    repo="owner/repo",
)

# Listen for issues labeled "ai-fix"
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

## Task Decomposition

```python
# For complex issues, decompose into subtasks
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

## Testing Loop

```python
# Agent runs tests and iterates until passing
result = await agent.solve(
    issue="Fix failing test in auth module",
    max_iterations=5,      # max fix attempts
    run_tests=True,        # run test suite after each change
    test_command="pytest tests/auth/",
)

# result.iterations shows each attempt
for i, attempt in enumerate(result.iterations):
    print(f"Attempt {i+1}: {'PASS' if attempt.tests_passed else 'FAIL'}")
    if not attempt.tests_passed:
        print(f"  Failures: {attempt.test_output[:200]}")
```

## Async Execution

```python
import asyncio
from open_swe import SWEAgent

# Process multiple issues in parallel
async def process_issues(issues: list[str]):
    tasks = []
    for issue in issues:
        agent = SWEAgent(llm=llm, repo_path=clone_repo())
        tasks.append(agent.solve(issue=issue))
    
    results = await asyncio.gather(*tasks)
    return results

# Run 5 issues in parallel
results = asyncio.run(process_issues([
    "Fix SQL injection in search endpoint",
    "Add rate limiting to API",
    "Update deprecated dependencies",
    "Add input validation to signup form",
    "Fix timezone bug in event scheduler",
]))
```

## Key Patterns

- **Explore first**: agent reads relevant files before coding
- **Plan before code**: creates implementation plan, gets approval
- **Test after change**: runs tests after every modification
- **Self-review**: checks own code for issues before submitting
- **Incremental**: applies changes file by file, testing between each
