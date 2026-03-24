---
title: "Build a macOS AI Personal Assistant with iMCP"
description: "Build an AI personal assistant that integrates with macOS native apps — Messages, Contacts, Calendar, Reminders — via iMCP"
skills: [imcp, mcp-server, anthropic-sdk]
difficulty: intermediate
time_estimate: "2 hours"
tags: [macos, personal-assistant, imcp, mcp, messages, calendar, reminders, productivity]
---

# Build a macOS AI Personal Assistant with iMCP

## The Problem

You juggle Messages, Calendar, Reminders, Contacts, and Mail across separate apps. Checking "what's on my plate today" means opening 4 apps and mentally stitching the picture together. You want one interface.

## The Solution

Use iMCP to give your AI assistant access to macOS native apps. Ask "What's my day look like?" and get a unified briefing from Calendar, Reminders, and Messages — all from one conversation.

## Persona

**David, VP of Product** — runs 3 product teams, has 8-12 meetings daily, 50+ unread messages by morning. Wants to start each day with a 30-second AI briefing instead of 15 minutes of app-switching.

## Step 1: Install and Configure iMCP

```bash
# Install iMCP
brew install imcp

# Or via npm
npm install -g @anthropic/imcp

# Configure for Claude Desktop
imcp configure --app claude-desktop

# Grant permissions (macOS will prompt for each app)
imcp grant --apps messages,contacts,calendar,reminders
```

After granting permissions, iMCP acts as an MCP server that Claude Desktop can call.

## Step 2: Access Messages

Search conversations, read recent messages, draft replies:

```
You: "Any messages from Sarah in the last 24 hours?"

AI: Found 3 messages from Sarah Chen:
  1. Yesterday 6:15 PM — "Can we move the design review to Thursday?"
  2. Yesterday 9:30 PM — "Updated the mockups, link in #design channel"
  3. Today 7:45 AM — "Morning! Ready for the 9am sync?"

You: "Reply to her latest: Yes, see you at 9! I reviewed the mockups, they look great."

AI: ✅ Reply sent to Sarah Chen.
```

## Step 3: Access Calendar

Check schedule, find free slots, understand your day:

```
You: "What's on my calendar today?"

AI: Today — Wednesday, March 12:
  ☀️ Morning:
    9:00 - 9:30   Team sync (Zoom) — Sarah, Alex, Priya
    10:00 - 11:00  Product review (Conference Room B) — with CEO
  🌤 Afternoon:
    13:00 - 13:30  1:1 with Alex
    14:00 - 15:00  Sprint planning
    16:00 - 16:30  Design review (moved from Wednesday)
  
  📊 5 meetings, 3.5 hours blocked, 4.5 hours free

You: "Find a 30-minute slot for a call with investor this week"

AI: Available 30-min slots this week:
  - Today: 11:00-11:30, 15:00-15:30
  - Thursday: 9:00-9:30, 11:00-12:00
  - Friday: 10:00-12:00 (open morning)
  
  Recommend: Thursday 11:00 — mid-morning, after you've warmed up.
```

## Step 4: Access Reminders

Create, complete, and manage reminders:

```
You: "What reminders are due today?"

AI: 📋 Due today:
  ⬜ Review Q1 budget proposal (high priority)
  ⬜ Send feedback on Alex's promotion doc
  ⬜ Order new monitor for home office
  
  📋 Overdue:
  ⬜ Update investor deck (due yesterday!)

You: "Mark 'order monitor' as done. Set 'update investor deck' to Friday with high priority."

AI: ✅ "Order new monitor" — marked complete
  📅 "Update investor deck" — moved to Friday, priority: high
```

## Step 5: Access Contacts

Find people, get details for meeting prep:

```
You: "I have a call with James Rivera at 2pm. What do I know about him?"

AI: 📇 James Rivera
  Company: Vertex Capital (Managing Partner)
  Email: james@vertexcap.com
  Phone: +1 (415) 555-0142
  Last contact: Feb 28 — you discussed Series A terms
  Notes: Interested in AI/developer tools. Prefers afternoon calls.
  
  💡 Prep: He'll likely ask about MRR growth since last conversation.
```

## Step 6: Daily Briefing

The killer feature — one command for your whole morning:

```
You: "What's on my plate today?"

AI: ☀️ Good morning, David. Here's your Wednesday briefing:

📅 CALENDAR — 5 meetings today (3.5 hrs)
  First up: Team sync at 9:00 with Sarah, Alex, Priya
  Big one: Product review with CEO at 10:00
  Last: Design review at 16:00

💬 MESSAGES — 12 unread since last night
  🔴 Sarah Chen: asking to move design review (already moved ✓)
  🔴 CEO: "Prep the Q1 metrics for tomorrow's board deck"
  🟡 Alex: shared PR for review
  Rest: group chat noise, no action needed

📋 REMINDERS — 3 due today, 1 overdue
  ⚠️ Overdue: Update investor deck (moved to Friday)
  Today: Review Q1 budget, send Alex feedback, order monitor ✓

🎯 TOP 3 PRIORITIES:
  1. Prep Q1 metrics — CEO asked, board deck is tomorrow
  2. Review budget proposal — due today
  3. Send Alex's promotion feedback — he's waiting

Want me to draft the Q1 metrics summary or block focus time for the budget review?
```

## Automation: Schedule the Briefing

Set up a daily briefing with a cron-style trigger:

```bash
# In Claude Desktop or your agent config
# Run every weekday at 8:30 AM
imcp schedule --cron "30 8 * * 1-5" \
  --prompt "Give me my daily briefing: calendar, messages, reminders, priorities" \
  --output notify
```

## Privacy and Security

iMCP runs locally — no data leaves your Mac:

```bash
# Check what iMCP can access
imcp permissions --list

# Revoke specific access
imcp revoke --app messages

# Audit log: see what was accessed
imcp audit --last 24h
```

## Advanced: Cross-App Workflows

Combine data across apps for smart actions:

```
You: "I need to cancel my 2pm meeting with James and let him know"

AI: Done:
  ✅ Cancelled "Call with James Rivera" at 14:00
  ✅ Sent iMessage to James: "Hi James, need to reschedule our 2pm call. 
     How does Thursday 11am work for you?"
  📋 Created reminder: "Follow up with James re: rescheduled call" — due Thursday 9am
```

## Key Takeaways

- **One prompt replaces 4 apps** — the daily briefing alone saves 15 min/day
- **Local-only via MCP** — no cloud, no data leaving your machine
- **Cross-app actions are the superpower** — cancel meeting + notify + set reminder in one command
- **Permissions are granular** — grant only what you need
- **Start with read-only** — get comfortable before enabling send/create actions
- **The briefing is addictive** — once you try it, you can't go back to app-switching
