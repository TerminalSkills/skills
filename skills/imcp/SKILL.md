---
name: imcp
description: >-
  iMCP is a macOS menu bar app that exposes Messages, Contacts, Calendar, Reminders, Location, Maps, Weather, Phone, Voicemail and Shortcuts to AI clients through a local MCP server.
  Use when: connecting Claude Desktop, Claude Code or Cursor to Apple data, querying contacts/reminders
  from an AI assistant, integrating macOS apps with AI agents.
license: MIT
compatibility: "macOS 15.3+, Claude Desktop or any MCP client"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/mattt/iMCP
  category: productivity
  tags: [mcp, macos, apple, messages, contacts]
---

# iMCP

## Overview

iMCP is a macOS app that connects your digital life with AI through the Model Context Protocol (MCP). It provides a native MCP server that gives AI assistants like Claude Desktop access to your Calendar, Contacts, Location, Maps, Messages, Phone, Voicemail, Reminders, Shortcuts, and Weather data, plus HomeKit through an optional helper app.

iMCP does NOT collect or store any of your data. It acts as a bridge between your macOS apps and MCP-compatible AI clients. The client (for example Claude Desktop) does send the data returned by tool calls off the device, so enable only what you are comfortable sharing. Current release: 1.7.0 (October 2026).

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

Click the iMCP menu bar icon and choose "Configure Claude Desktop"; it adds the bundled `imcp-server` executable to `~/Library/Application Support/Claude/claude_desktop_config.json` and keeps your other servers. Manual setup: choose "Copy server command to clipboard" and paste it into the config:

```json
{
  "mcpServers": {
    "iMCP": {
      "command": "/Applications/iMCP.app/Contents/MacOS/imcp-server"
    }
  }
}
```

Quit and reopen Claude Desktop and approve the connection. The first time a client connects, iMCP shows an approval dialog; tick "Always trust this client" to stop repeated prompts.

### Connect to Claude Code, Cursor or Amp

```bash
claude mcp add --scope user iMCP -- /Applications/iMCP.app/Contents/MacOS/imcp-server
claude mcp add-from-claude-desktop      # or import an existing Claude Desktop config
amp mcp add iMCP -- /Applications/iMCP.app/Contents/MacOS/imcp-server
```

Cursor has a one-click install link in the repository README. `imcp-server` is a small stdio proxy that talks to the running app over Bonjour, so the iMCP app must be open.

### Available Services

- **Calendar** — View events, create and update events, set recurrence and alarms
- **Contacts** — Search contacts by name, phone, or email; browse details
- **Location** — Get current device location, geocode addresses
- **Maps** — Search places, get directions, estimate travel times
- **Messages** — Read message history with a participant over a date range (read-only), plus attachments if you grant the Attachments folder; enabling it asks you to pick `~/Library/Messages`
- **Phone / Voicemail** — Call history synced from your iPhone, voicemail transcripts and audio (voicemail needs macOS 26 or later); start calls with system confirmation
- **Reminders** — View, create, update and delete reminders and lists, with due dates, recurrence and priorities
- **Shortcuts** — List and run Shortcuts on your Mac
- **Weather** — Current conditions for any location
- **Home** — HomeKit control, only through a helper app you build and sign with your own Apple Developer account (`Scripts/install-helper.sh` in a clone of the repo)

## Examples

### Example 1: Meeting Preparation Workflow

A product manager asks Claude Desktop to help prepare for an upcoming meeting:

```
User: "I have a meeting with Sarah Chen tomorrow. Find her contact info,
check what time the meeting is, and summarize our recent messages."
```

Claude Desktop uses iMCP to:
1. Search Contacts for "Sarah Chen" — finds email sarah.chen@harborlabs.io, phone +1-415-555-0192
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
- Check the menu bar icon to verify the MCP server is running (blue toggle); `imcp-server` cannot reach a closed app
- `reminders_create` rejects arguments outside its schema (use `reminders_update` to complete a reminder)
- If Messages misses recent texts after upgrading from an older version, switch Messages off and on in the iMCP menu and grant the whole `~/Library/Messages` folder
- If `imcp-server` reports that Bonjour discovery timed out, turn on its own entry in System Settings > Privacy & Security > Local Network
- If a service stops working, check System Settings > Privacy & Security to re-grant permissions
- Combine services for powerful workflows (e.g., calendar + contacts + messages for meeting prep)
- iMCP works with any MCP client that can launch a stdio server
- iMCP collects nothing itself, but the AI client receives whatever tool calls return
- You can revoke permissions anytime in System Settings > Privacy & Security
- See [iMCP.app](https://iMCP.app) and [GitHub](https://github.com/mattt/iMCP) for full documentation
