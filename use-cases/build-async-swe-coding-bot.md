---
title: "Build an Async SWE Coding Bot"
description: "Create an autonomous coding bot that picks up GitHub issues labeled 'ai-fix', writes code, runs tests, and submits pull requests — with human review in the loop."
skills: [open-swe, github-actions, anthropic-sdk]
difficulty: advanced
time_estimate: "10 hours"
tags: [coding-bot, github, automation, swe-agent, pull-requests, ci-cd, autonomous-coding]
---

# Build an Async SWE Coding Bot

## Persona

You lead a 6-person engineering team. Bug backlog keeps growing — 40+ issues, most are straightforward fixes. Your devs should be building features, not patching typos and fixing off-by-one errors. You want a bot that picks up simple issues, writes the fix, runs tests, and opens a PR. Humans review and merge. Target: automate 30% of bug fixes.

Inspired by [open-swe](https://github.com/langchain-ai/open-swe) (8k+ stars) — LangChain's open-source software engineering agent.

## Architecture

```
GitHub Issue (labeled "ai-fix")
        ↓
  Webhook → Your Server
        ↓
  Agent: Read issue + Explore codebase
        ↓
  Agent: Plan fix → Write code → Run tests
        ↓
  Create PR + Post progress comments
        ↓
  Human reviews → Merge or request changes
```

## Step 1: GitHub Webhook Handler

```python
from fastapi import FastAPI, Request, HTTPException
import hmac, hashlib, json

app = FastAPI()
WEBHOOK_SECRET = "your-webhook-secret"

@app.post("/webhook")
async def handle_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    expected = "sha256=" + hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(signature, expected):
        raise HTTPException(401, "Invalid signature")

    payload = json.loads(body)
    action = payload.get("action")
    issue = payload.get("issue", {})
    labels = [l["name"] for l in issue.get("labels", [])]

    if action == "labeled" and "ai-fix" in labels:
        # Trigger the coding agent
        await process_issue(
            repo=payload["repository"]["full_name"],
            issue_number=issue["number"],
            title=issue["title"],
            body=issue["body"]
        )

    return {"status": "ok"}
```

## Step 2: Codebase Exploration Agent

```python
import anthropic
import subprocess
from pathlib import Path

client = anthropic.Anthropic()

class CodebaseExplorer:
    def __init__(self, repo_path: str):
        self.path = Path(repo_path)

    def tree(self, max_depth: int = 3) -> str:
        result = subprocess.run(["find", str(self.path), "-maxdepth", str(max_depth),
                                 "-type", "f", "-name", "*.py"], capture_output=True, text=True)
        return result.stdout

    def read_file(self, filepath: str) -> str:
        return (self.path / filepath).read_text()

    def grep(self, pattern: str, file_ext: str = "*.py") -> str:
        result = subprocess.run(["grep", "-rn", pattern, "--include", file_ext, str(self.path)],
                                capture_output=True, text=True)
        return result.stdout[:3000]

    def get_test_files(self) -> list[str]:
        return [str(p.relative_to(self.path)) for p in self.path.rglob("test_*.py")]


def plan_fix(issue_title: str, issue_body: str, codebase: CodebaseExplorer) -> dict:
    tree = codebase.tree()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system="""You are a senior developer. Given an issue and repo structure, plan a fix.
Return JSON: {
  relevant_files: [string],
  grep_patterns: [string],
  approach: string,
  estimated_changes: int,
  risk_level: "low"|"medium"|"high"
}""",
        messages=[{"role": "user", "content": f"Issue: {issue_title}\n{issue_body}\n\nRepo structure:\n{tree}"}]
    )
    return json.loads(response.content[0].text)
```

## Step 3: Code Writing Agent

```python
def write_fix(issue: dict, plan: dict, codebase: CodebaseExplorer) -> list[dict]:
    # Gather context from relevant files
    context = ""
    for f in plan["relevant_files"]:
        try:
            context += f"\n--- {f} ---\n{codebase.read_file(f)}\n"
        except FileNotFoundError:
            pass

    # Gather grep results for additional context
    for pattern in plan.get("grep_patterns", []):
        context += f"\n--- grep '{pattern}' ---\n{codebase.grep(pattern)}\n"

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        system="""You are a senior developer writing a bug fix. 
- Make minimal, focused changes
- Follow existing code style
- Add or update tests for your changes
- Return JSON array of file changes:
[{file: string, action: "edit"|"create", content: string, description: string}]""",
        messages=[{"role": "user", "content": f"Issue: {issue['title']}\n{issue['body']}\n\nPlan: {plan['approach']}\n\nCode:\n{context}"}]
    )
    return json.loads(response.content[0].text)
```

## Step 4: Test Runner & Validation

```python
def apply_and_test(changes: list[dict], codebase: CodebaseExplorer) -> dict:
    # Apply changes
    for change in changes:
        filepath = codebase.path / change["file"]
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_text(change["content"])

    # Run tests
    result = subprocess.run(
        ["python", "-m", "pytest", str(codebase.path / "tests"), "-v", "--tb=short"],
        capture_output=True, text=True, timeout=120
    )

    return {
        "passed": result.returncode == 0,
        "stdout": result.stdout[-2000:],
        "stderr": result.stderr[-1000:],
    }
```

## Step 5: Create PR with Progress Updates

```python
import httpx

GITHUB_TOKEN = "ghp_..."

async def post_comment(repo: str, issue_number: int, body: str):
    async with httpx.AsyncClient() as c:
        await c.post(
            f"https://api.github.com/repos/{repo}/issues/{issue_number}/comments",
            headers={"Authorization": f"token {GITHUB_TOKEN}"},
            json={"body": body}
        )

async def create_pr(repo: str, branch: str, issue_number: int, changes: list[dict]) -> str:
    async with httpx.AsyncClient() as c:
        # Create PR
        pr = await c.post(
            f"https://api.github.com/repos/{repo}/pulls",
            headers={"Authorization": f"token {GITHUB_TOKEN}"},
            json={
                "title": f"fix: auto-fix for #{issue_number}",
                "head": branch,
                "base": "main",
                "body": f"Closes #{issue_number}\n\n**AI-generated fix.** Please review carefully.\n\n"
                        f"### Changes\n" + "\n".join(f"- `{c['file']}`: {c['description']}" for c in changes)
            }
        )
        return pr.json()["html_url"]

async def process_issue(repo: str, issue_number: int, title: str, body: str):
    await post_comment(repo, issue_number, "🤖 **AI Bot**: Picking up this issue. I'll explore the codebase and propose a fix.")

    codebase = await clone_repo(repo)
    plan = plan_fix(title, body, codebase)

    await post_comment(repo, issue_number, f"📋 **Plan**: {plan['approach']}\n\nFiles: {', '.join(plan['relevant_files'])}")

    changes = write_fix({"title": title, "body": body}, plan, codebase)
    test_result = apply_and_test(changes, codebase)

    if test_result["passed"]:
        branch = f"ai-fix/issue-{issue_number}"
        await push_branch(codebase, branch)
        pr_url = await create_pr(repo, branch, issue_number, changes)
        await post_comment(repo, issue_number, f"✅ Tests pass. PR ready for review: {pr_url}")
    else:
        await post_comment(repo, issue_number, f"❌ Tests failed. Needs human attention.\n```\n{test_result['stdout'][-500:]}\n```")
```

## What You'll Learn

- GitHub webhook integration for event-driven automation
- Multi-step AI agent: explore → plan → code → test → PR
- Codebase navigation patterns (tree, grep, file reading)
- Safe code modification with test validation gates
- Human-in-the-loop PR workflow for AI-generated code
- Building production async coding pipelines
