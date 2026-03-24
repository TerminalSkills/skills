---
name: liepin-jobs
description: >-
  Search jobs on Liepin (猎聘), apply to positions, view and edit resumes.
  Zero-dependency Python CLI wrapping Liepin's official MCP Server.
  Trigger words: jobs, liepin, resume, 找工作, 搜职位, 投简历, 猎聘, 求职, 招聘, 简历.
license: MIT
compatibility: "Requires Python 3.9+"
metadata:
  author: xllinbupt
  version: "0.1.0"
  category: productivity
  tags: ["jobs", "liepin", "resume", "mcp", "chinese"]
---

# Liepin Jobs (猎聘求职工具)

## Overview

Search jobs on Liepin (猎聘), one of China's major professional recruitment platforms. View and edit your resume, match jobs to your profile, and apply — all from within your AI coding agent. Built on Liepin's official MCP Server with zero external dependencies (uses only Python's built-in `urllib`).

## Instructions

### Setup

The CLI script `liepin_mcp.py` is included alongside this SKILL.md. If it is not present in your skill directory, fetch it:

```bash
curl -o "<skill_dir>/liepin_mcp.py" "https://raw.githubusercontent.com/TerminalSkills/skills/main/skills/liepin-jobs/liepin_mcp.py"
```

Before using any command, you must obtain two tokens from Liepin:

1. Visit https://www.liepin.com/mcp/server and log in
2. Copy the **Gateway Token** (format: `mcp_gateway_token_xxxx`)
3. Copy the **User Token** (format: `liepin_user_token_xxxx`)
4. Run setup:

```bash
python3 "<skill_dir>/liepin_mcp.py" setup
```

Or set environment variables:

```bash
export LIEPIN_GATEWAY_TOKEN="mcp_gateway_token_xxxx"
export LIEPIN_USER_TOKEN="liepin_user_token_xxxx"
```

Tokens expire after 90 days.

### Commands

```bash
SCRIPT="<skill_dir>/liepin_mcp.py"

# Search jobs
python3 "$SCRIPT" search-job --jobName "AI产品经理" --address "上海"
python3 "$SCRIPT" search-job --jobName "前端开发" --address "北京" --salary "30-50k"

# Apply to a job (requires jobId and jobKind from search results)
python3 "$SCRIPT" apply-job --jobId "JOB_ID" --jobKind "JOB_KIND"

# View resume
python3 "$SCRIPT" my-resume

# Update resume sections
python3 "$SCRIPT" update-resume --module basic --data '{"name": "张三"}'
python3 "$SCRIPT" update-resume --module experience --data '{"company": "xxx", "title": "PM"}'
python3 "$SCRIPT" update-resume --module expectations --data '{"salary": "30-50k", "city": "上海"}'
python3 "$SCRIPT" update-resume --module self-assessment --data '{"content": "5年产品经验..."}'

# List all available tools
python3 "$SCRIPT" list-tools
```

Add `--json` to any command for raw JSON output.

## Examples

### Example 1: Search for AI jobs in Shanghai

Input:
```
Help me find AI product manager positions in Shanghai with 30-50k salary
```

Agent runs:
```bash
python3 "<skill_dir>/liepin_mcp.py" search-job --jobName "AI产品经理" --address "上海" --salary "30-50k" --json
```

Output:
```
Found 15 matching positions:
| Company       | Title          | Salary  | Experience |
|---------------|----------------|---------|------------|
| ByteDance     | AI PM Lead     | 35-50k  | 3-5 years  |
| Alibaba       | AI Product Mgr | 30-45k  | 3-5 years  |
| ...           | ...            | ...     | ...        |
```

### Example 2: View and improve resume

Input:
```
Check my Liepin resume and suggest improvements
```

Agent runs:
```bash
python3 "<skill_dir>/liepin_mcp.py" my-resume --json
```

Then analyzes completeness and suggests edits for missing sections.

## Guidelines

- **Always confirm before applying**: The `apply-job` command is irreversible. Show job details and get explicit user confirmation first.
- **Rate limit**: All operations share a 60 requests/minute limit. Avoid batch calls.
- **Token security**: Never expose full token values in logs or conversation.
- **Token expiry**: If authentication errors occur, guide the user to refresh tokens at https://www.liepin.com/mcp/server
- **Resume modules**: `basic`, `experience`, `expectations`, `self-assessment`
- **Search parameters**: `--jobName`, `--address`, `--salary`, `--education`, `--experience`, `--companyType`, `--companyName`
