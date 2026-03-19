---
name: liepin-jobs
description: >-
  Search jobs on Liepin (猎聘), apply to positions, view and edit resumes.
  Zero-dependency Python CLI wrapping Liepin's official MCP Server.
  Use when users want to find jobs, submit applications, or manage resumes
  on the Liepin platform.
license: MIT
compatibility: ''
metadata:
  author: xllinbupt
  version: 0.1.0
  category: productivity
  tags:
    - jobs
    - liepin
    - resume
    - mcp
    - chinese
    - career
    - recruitment
---

# Liepin Jobs (猎聘求职工具)

Search jobs, apply to positions, and manage resumes on Liepin — China's leading professional recruitment platform. Built on Liepin's official MCP Server with zero external dependencies.

## Setup

Requires two tokens from https://www.liepin.com/mcp/server:

```bash
export LIEPIN_GATEWAY_TOKEN="mcp_gateway_token_xxxx"
export LIEPIN_USER_TOKEN="liepin_user_token_xxxx"
```

## Commands

```bash
SCRIPT="<skill_dir>/liepin_mcp.py"

# Search jobs
python3 "$SCRIPT" search-job --jobName "AI产品经理" --address "上海"
python3 "$SCRIPT" search-job --jobName "前端开发" --address "北京" --salary "30-50k"

# Apply to a job (requires jobId from search results)
python3 "$SCRIPT" apply-job --jobId "JOB_ID" --jobKind "JOB_KIND"

# View resume
python3 "$SCRIPT" my-resume

# Update resume sections
python3 "$SCRIPT" update-resume --module basic --data '{"name": "张三"}'
python3 "$SCRIPT" update-resume --module experience --data '{"company": "xxx"}'
```

## Source

Full skill with Python script: https://github.com/xllinbupt/MCP2skill
