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
  version: "0.2.0"
  category: productivity
  tags: ["jobs", "liepin", "resume", "mcp", "chinese"]
---

# Liepin Jobs (猎聘求职工具)

## Overview

Search jobs on Liepin (猎聘), one of China's major professional recruitment platforms. View and edit your resume, match jobs to your profile, and apply — all from within your AI coding agent. Built on Liepin's official MCP Server with zero external dependencies (uses only Python's built-in `urllib`).

## Instructions

### Setup

The CLI script `liepin_mcp.py` ships in the same directory as this SKILL.md and needs only Python's standard library. Use it from the installed skill directory; do not download a replacement from the network.

Before using any command, you must obtain two tokens from Liepin:

1. Visit https://www.liepin.com/mcp/server and log in
2. Copy the **Gateway Token** (format: `mcp_gateway_token_<value>`)
3. Copy the **User Token** (format: `liepin_user_token_<value>`)
4. Run setup:

```bash
python3 "$HOME/.claude/skills/liepin-jobs/liepin_mcp.py" setup
```

`setup` stores both tokens in plain text in `~/.config/liepin-mcp/config.json`; restrict that file to your user (`chmod 600`). Or skip the file and set environment variables (a value in the config file takes precedence over the environment):

```bash
export LIEPIN_GATEWAY_TOKEN="mcp_gateway_token_<value>"
export LIEPIN_USER_TOKEN="liepin_user_token_<value>"
```

Tokens expire; the lifetime is not documented publicly, so refresh them when requests start failing authentication.

### Commands

```bash
SCRIPT="$HOME/.claude/skills/liepin-jobs/liepin_mcp.py"

# Search jobs
python3 "$SCRIPT" search-job --jobName "AI产品经理" --address "上海"
python3 "$SCRIPT" search-job --jobName "前端开发" --address "北京" --salary "30-50k"

# Apply to a job (requires jobId and jobKind from search results)
python3 "$SCRIPT" apply-job --jobId "<jobId>" --jobKind "<jobKind>"

# View resume
python3 "$SCRIPT" my-resume

# Update resume sections
python3 "$SCRIPT" update-resume --module basic --data '{"name": "张三"}'
python3 "$SCRIPT" update-resume --module experience --data '{"company": "示例科技有限公司", "title": "PM"}'
python3 "$SCRIPT" update-resume --module expectations --data '{"salary": "30-50k", "city": "上海"}'
python3 "$SCRIPT" update-resume --module self-assessment --data '{"content": "5年产品经验..."}'

# List the server's tools with their input schemas
python3 "$SCRIPT" list-tools

# Call any server tool directly
python3 "$SCRIPT" call my-resume --arguments '{}'
# --url is read only by `setup` (before the subcommand), which saves it in the config file;
# other commands use the saved address:  python3 "$SCRIPT" --url "https://mcp.mycorp.internal/liepin" setup
```

Add `--json` to any command for raw JSON output. The script maps the commands to the server tools `user-search-job`, `user-apply-job`, `my-resume` and `resume-toolkit`. The field names inside `--data` are defined by the server, not by the script: run `list-tools` and follow the `resume-toolkit` input schema before updating a resume. The examples above are illustrative.

## Examples

### Example 1: Search for AI jobs in Shanghai

Input:
```
Help me find AI product manager positions in Shanghai with 30-50k salary
```

Agent runs:
```bash
python3 "$HOME/.claude/skills/liepin-jobs/liepin_mcp.py" search-job --jobName "AI产品经理" --address "上海" --salary "30-50k" --json
```

Output: the server's reply with matching positions (company, title, salary range, experience, plus the `jobId` and `jobKind` needed to apply). The agent summarises them as a table and asks which one to look at.

### Example 2: View and improve resume

Input:
```
Check my Liepin resume and suggest improvements
```

Agent runs:
```bash
python3 "$HOME/.claude/skills/liepin-jobs/liepin_mcp.py" my-resume --json
```

Then analyzes completeness and suggests edits for missing sections.

## Guidelines

- **Always confirm before applying**: The `apply-job` command is irreversible. Show job details and get explicit user confirmation first.
- **Rate limit**: the server may rate-limit requests (limits are not published); avoid batch calls.
- **Token security**: tokens grant access to a personal Liepin account and resume; never expose full token values in logs or conversation.
- **Token expiry**: If authentication errors occur, guide the user to refresh tokens at https://www.liepin.com/mcp/server
- **Resume modules**: `basic`, `experience`, `expectations`, `self-assessment`
- **Search parameters**: `--jobName`, `--address`, `--salary`, `--education`, `--experience`, `--companyType`, `--companyName`
