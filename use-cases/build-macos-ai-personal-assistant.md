---
title: Build a macOS AI Personal Assistant with iMCP
slug: build-macos-ai-personal-assistant
description: Use iMCP to give your AI assistant access to macOS native apps for unified daily briefings and task management.
skills:
  - imcp
category: productivity
tags:
  - macos
  - personal-assistant
  - mcp
  - calendar
  - reminders
---

# Build a macOS AI Personal Assistant with iMCP

## The Problem

You juggle Messages, Calendar, Reminders, Contacts, and Weather across separate apps every morning. Checking "what is on my plate today" means opening 4 apps, scanning each one, and mentally stitching the picture together. It takes 15 minutes before you even start working.

## The Solution

Use iMCP to give Claude Desktop access to your macOS native apps through the Model Context Protocol. Ask "What does my day look like?" and get a unified briefing from Calendar, Reminders, Messages, and Weather — all from one conversation.

## Step-by-Step Walkthrough

### Step 1: Install iMCP

```bash
brew install --cask mattt/tap/iMCP
```

Launch iMCP from Applications. A menu bar icon appears.

### Step 2: Activate Services

Click each service icon in the menu bar to activate it. Grant macOS permissions when prompted:
- Calendar — full access
- Contacts — access to contacts
- Reminders — access to reminders
- Messages — access to messages
- Location — location access (for weather)

### Step 3: Connect to Claude Desktop

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

Restart Claude Desktop.

### Step 4: Build Your Morning Briefing

Ask Claude Desktop:

```
Give me my morning briefing:
1. What meetings do I have today?
2. What are my outstanding reminders, sorted by priority?
3. Any messages I need to respond to?
4. What is the weather?
```

Claude uses iMCP to query Calendar, Reminders, Messages, and Weather, then presents a unified summary.

### Step 5: Set Up Meeting Prep

Before any meeting, ask:

```
I have a meeting with Sarah Chen in 30 minutes. Find her contact info,
check our recent messages, and summarize what we last discussed.
```

Claude searches Contacts, reads Messages history, and prepares context — all without you opening a single app.

## Real-World Example

David, VP of Product at a Series B startup, runs 3 product teams and has 8-12 meetings daily. Every morning he opens Claude Desktop and types: "Morning briefing." Claude queries his Calendar (finds 9 meetings including a board prep at 2 PM), Reminders (finds "Submit Q2 budget" due today and "Review hiring plan" high priority), Messages (3 unread from his PM about a launch delay), and Weather (62F, rain expected at 3 PM). Claude presents it as a prioritized summary: handle the budget submission first, prep for the board meeting by noon, address the launch delay with his PM before standup, and bring an umbrella for the afternoon walk. What used to take David 15 minutes of app-switching now takes 30 seconds. He extends the pattern to meeting prep — before each 1:1, he asks Claude to pull the person's contact, recent messages, and last meeting notes.

## Related Skills

- [imcp](/skills/imcp) — The macOS MCP server connecting native apps to AI
