---
name: imcp
description: >-
  Access macOS native data (Messages, Contacts, Reminders, Calendar) via MCP server with iMCP.
  Use when: building AI assistants that access Apple data, querying contacts/reminders from
  Claude Desktop, integrating macOS apps with AI agents.
license: MIT
compatibility: "macOS 15.3+, Claude Desktop or any MCP client"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: [mcp, macos, apple, messages, contacts]
---

# iMCP

## Overview

iMCP is a macOS app that connects your digital life with AI through the Model Context Protocol (MCP). It provides a native MCP server that gives AI assistants like Claude Desktop access to your Calendar, Contacts, Location, Maps, Messages, Reminders, and Weather data.

iMCP does NOT collect or store any of your data. It acts as a bridge between your macOS apps and MCP-compatible AI clients. Data is sent to the AI client only when tool calls are made.

Requires macOS 15.3 or later.

## Instructions

### Installation

```bash
# Via Homebrew (recommended)
brew install --cask mattt/tap/iMCP

# Or download from https://iMCP.app/download
```

### Setup

1. Launch iMCP. A menu bar icon appears with all available services listed.
2. Click each service icon to activate it. macOS will prompt for permissions (Calendar, Contacts, Reminders, Location, Messages).
3. Grant permissions for the services you want to use.

### Connect to Claude Desktop

Add iMCP to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "imcp": {
      "command": "/Applications/iMCP.app/Contents/MacOS/iMCP",
      "args": ["--mcp"]
    }
  }
}
```

Restart Claude Desktop. iMCP tools are now available.

### Available Services

- **Calendar** — View upcoming events, create new events, set recurrence and alarms
- **Contacts** — Search contacts by name, phone, or email; browse details
- **Location** — Get current device location, geocode addresses
- **Maps** — Search places, get directions, estimate travel times
- **Messages** — Read message history (read-only), search conversations
- **Reminders** — View and create reminders with due dates and priorities
- **Weather** — Current conditions for any location

## Examples

### Example 1: Meeting Preparation Workflow

A product manager asks Claude Desktop to help prepare for an upcoming meeting:

```
User: "I have a meeting with Sarah Chen tomorrow. Find her contact info,
check what time the meeting is, and summarize our recent messages."
```

Claude Desktop uses iMCP to:
1. Search Contacts for "Sarah Chen" — finds email sarah.chen@acmecorp.com, phone +1-415-555-0192
2. Query Calendar for tomorrow — finds "Q2 Planning w/ Sarah" at 2:00 PM
3. Read Messages with Sarah — summarizes last 5 messages about the Q2 roadmap discussion

Response includes Sarah's contact details, meeting time, and a summary of recent conversation context.

### Example 2: Daily Planning with Reminders and Calendar

A developer uses Claude Desktop each morning to organize their day:

```
User: "What's on my plate today? Check my calendar and outstanding reminders,
then suggest a prioritized schedule."
```

Claude Desktop uses iMCP to:
1. Query Calendar for today — finds 3 events: standup at 9:30 AM, design review at 1:00 PM, 1:1 with manager at 4:00 PM
2. Fetch Reminders — finds 7 outstanding: "Review PR #428" (high priority), "Update API docs", "Book dentist appointment", "Reply to vendor email", "Order monitor stand", "Submit expense report" (due today), "Renew SSL cert" (due tomorrow)
3. Check Weather — 72F, sunny

Suggests a schedule: handle "Submit expense report" first (due today), tackle "Review PR #428" (high priority) before standup, slot "Update API docs" between meetings, and defer lower-priority items.

## Guidelines

- Activate only the services you actually need to minimize permission exposure
- Check the menu bar icon to verify the MCP server is running (blue toggle)
- If a service stops working, check System Settings > Privacy & Security to re-grant permissions
- Combine services for powerful workflows (e.g., calendar + contacts + messages for meeting prep)
- iMCP works with any MCP-compatible client, not just Claude Desktop
- iMCP runs entirely locally on your Mac with no data collection
- You can revoke permissions anytime in System Settings > Privacy & Security
- See [iMCP.app](https://iMCP.app) and [GitHub](https://github.com/mattt/iMCP) for full documentation
