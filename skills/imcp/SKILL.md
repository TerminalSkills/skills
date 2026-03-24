---
name: imcp
description: >-
  Access macOS native data (Messages, Contacts, Reminders, Calendar) via MCP server with iMCP.
  Use when: building AI assistants that access Apple data, querying contacts/reminders from
  Claude Desktop, integrating macOS apps with AI agents.
license: MIT
compatibility: "macOS 14+, Claude Desktop"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: [mcp, macos, apple, messages, contacts, reminders, calendar]
  use-cases:
    - "Ask Claude to check your reminders and suggest priorities"
    - "Search contacts and draft personalized messages from Claude Desktop"
    - "Build AI workflows that integrate with macOS native apps"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# iMCP

## Overview

iMCP is a macOS app that connects your digital life with AI through the Model Context Protocol (MCP). It provides a native MCP server that gives AI assistants like Claude Desktop access to your Calendar, Contacts, Location, Maps, Messages, Reminders, and Weather data.

**Key principle:** iMCP does NOT collect or store any of your data. It acts as a bridge between your macOS apps and MCP-compatible AI clients. Data is sent to the AI client only when tool calls are made.

## Prerequisites

- macOS 15.3 or later
- An MCP-compatible client (Claude Desktop, or any client supporting the [Model Context Protocol](https://modelcontextprotocol.io))

## Installation

### Option 1: Homebrew (recommended)

```bash
brew install --cask mattt/tap/iMCP
```

### Option 2: Direct download

Download from [iMCP.app/download](https://iMCP.app/download).

## Setup

### 1. Launch iMCP

Open the app. A menu bar icon appears with all available services listed (initially gray/inactive).

The blue toggle at the top indicates the MCP server is running and ready for connections.

### 2. Activate services

Click each service icon to activate it. macOS will prompt for permissions:

- **Calendar** → "Allow Full Access to Your Calendar"
- **Contacts** → "Allow Access to Your Contacts"
- **Reminders** → "Allow Access to Your Reminders"
- **Location** → "Allow Location Access"
- **Messages** → "Allow Access to Messages"

Grant permissions for the services you want to use. Activated services change from gray to their distinctive colors.

### 3. Connect to Claude Desktop

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

## Available Services

### 📅 Calendar

Access and manage calendar events.

**Capabilities:**
- View upcoming events across all calendars
- Create new events with customizable settings
- Set recurrence rules, alarms, and availability status
- Query events by date range or calendar

**Example prompts:**
```
"What's on my calendar this week?"
"Create a meeting with John tomorrow at 2pm for 1 hour"
"Show me all events for next Monday"
"Add a recurring standup at 9am every weekday"
```

### 👤 Contacts

Search and access contact information.

**Capabilities:**
- Search contacts by name, phone number, or email
- Access your own contact information
- Browse contact details (phone, email, address, company)

**Example prompts:**
```
"Find John Smith's email address"
"What's Sarah's phone number?"
"Show me all contacts at Acme Corp"
"What's my own phone number?"
```

### 📍 Location

Access current location and geocoding.

**Capabilities:**
- Get current device location
- Convert addresses to coordinates (geocoding)
- Convert coordinates to addresses (reverse geocoding)

**Example prompts:**
```
"Where am I right now?"
"What's the latitude and longitude of 1 Apple Park Way?"
```

### 🗺️ Maps

Location search, directions, and map generation.

**Capabilities:**
- Search for places and points of interest
- Get directions between locations
- Estimate travel times
- Generate static map images
- Look up nearby businesses/services

**Example prompts:**
```
"Find coffee shops near me"
"How long will it take to drive to the airport?"
"Show me a map of downtown San Francisco"
"Get directions from home to the office"
```

### 💬 Messages

Access message history (read-only).

**Capabilities:**
- Read message history with specific contacts
- Search messages within date ranges
- View conversation threads

**Example prompts:**
```
"Show me my recent messages with Sarah"
"What did John text me last week?"
"Find messages mentioning 'dinner' from this month"
```

### ✅ Reminders

View and create reminders.

**Capabilities:**
- View reminders across all lists
- Create new reminders with due dates
- Set priorities and alerts
- Organize across reminder lists

**Example prompts:**
```
"What are my outstanding reminders?"
"Add a reminder to buy groceries tomorrow at 5pm"
"Show me high-priority reminders"
"Create a reminder to call the dentist next Monday"
```

### 🌤️ Weather

Current weather conditions for any location.

**Capabilities:**
- Current temperature, wind speed, conditions
- Weather for any location (uses Location service)

**Example prompts:**
```
"What's the weather like right now?"
"What's the temperature in Tokyo?"
"Will I need an umbrella today?"
```

## Privacy & Security

- iMCP runs **entirely locally** on your Mac
- **No data collection** — iMCP does not store or transmit your data
- Data is only sent when your MCP client (e.g., Claude Desktop) makes tool calls
- macOS permission dialogs control exactly which services iMCP can access
- You can revoke permissions anytime in System Settings → Privacy & Security

## Tips

- Activate only the services you actually need
- Check the menu bar icon to verify the MCP server is running (blue toggle)
- If a service stops working, check System Settings → Privacy & Security
- Combine services for powerful workflows: "Check my calendar, find the meeting attendee's contact, and draft a prep email"
- iMCP works with any MCP-compatible client, not just Claude Desktop

## Resources

- [iMCP Website](https://iMCP.app)
- [GitHub Repository](https://github.com/mattt/iMCP)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP Compatible Clients](https://modelcontextprotocol.io/clients)
