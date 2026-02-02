---
name: meeting-notes
description: >-
  Transform raw meeting notes or transcripts into structured, actionable
  summaries. Use when a user asks to summarize meeting notes, organize a
  transcript, extract action items from a meeting, create meeting minutes,
  format discussion notes, or turn a call recording transcript into a summary.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: ["meetings", "notes", "summaries", "action-items", "transcripts"]
  use-cases:
    - "Convert raw meeting transcripts into structured summaries with action items"
    - "Extract decisions, owners, and deadlines from unstructured meeting notes"
    - "Generate follow-up emails from meeting discussions"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Meeting Notes

## Overview

Transform raw meeting notes, transcripts, or audio-to-text outputs into clean, structured summaries. Extracts key decisions, action items with owners and deadlines, discussion topics, and follow-up tasks. Produces consistent, professional meeting documentation that teams can reference and act on.

## Instructions

When a user asks you to process meeting notes or a transcript, follow these steps:

### Step 1: Identify the input format

| Format | Characteristics | Handling |
|--------|----------------|----------|
| Raw transcript | Speaker labels, timestamps, verbatim speech | Clean up filler words, group by topic |
| Bullet notes | Shorthand, incomplete sentences | Expand into full context |
| Audio transcript | May have errors, no punctuation | Fix obvious transcription errors, add structure |
| Paste from chat | Messages with usernames and timestamps | Group by discussion thread |

### Step 2: Extract the core elements

Read through the entire input and identify:

1. **Meeting metadata** - Date, attendees, meeting purpose/title
2. **Agenda topics** - The main subjects discussed
3. **Key decisions** - Any conclusions or agreements reached
4. **Action items** - Tasks assigned, with owner and deadline if mentioned
5. **Open questions** - Unresolved issues needing follow-up
6. **Next steps** - What happens after the meeting

### Step 3: Structure the output

Use this template:

```markdown
# Meeting Summary: [Title/Purpose]

**Date:** [Date]
**Attendees:** [Names]
**Duration:** [If known]

## Agenda

1. [Topic 1]
2. [Topic 2]
3. [Topic 3]

## Discussion Summary

### [Topic 1]
- Key points discussed
- Context and reasoning
- Any data or references mentioned

### [Topic 2]
- Key points discussed
- Different viewpoints raised
- Conclusion reached

## Decisions Made

| # | Decision | Owner | Context |
|---|----------|-------|---------|
| 1 | [What was decided] | [Who owns it] | [Why] |
| 2 | [What was decided] | [Who owns it] | [Why] |

## Action Items

| # | Task | Owner | Deadline | Priority |
|---|------|-------|----------|----------|
| 1 | [Specific task] | [Person] | [Date] | High |
| 2 | [Specific task] | [Person] | [Date] | Medium |

## Open Questions

- [Question that was not resolved]
- [Item needing further research]

## Next Meeting

- **Date:** [If scheduled]
- **Topics to cover:** [Carryover items]
```

### Step 4: Clean and refine

- Remove filler words (um, uh, like, you know)
- Consolidate repeated points into single clear statements
- Ensure every action item has an owner (flag if missing)
- Convert vague deadlines ("soon", "next week") to specific dates when possible
- Keep the summary to 20-30% of the original length

## Examples

### Example 1: Transcript to summary

**User request:** "Summarize these meeting notes from our sprint planning"

**Input (raw notes):**
```
john: ok so we need to talk about the auth bug first
sarah: yeah the login timeout is causing issues for about 12% of users
john: can we fix it this sprint?
mike: i think so, its a session config issue. ill take it
sarah: great, make it P1. also we need to discuss the new dashboard
john: right, the designs are ready. sarah can you start on the frontend?
sarah: sure, ill need the API endpoints from mike first
mike: ill have those done by wednesday
john: perfect. anything else?
sarah: we should update the docs before release
john: good call. mike can you handle that by friday?
mike: yep
```

**Output:**
```markdown
# Meeting Summary: Sprint Planning

**Attendees:** John, Sarah, Mike

## Discussion Summary

### Authentication Bug
- Login timeout affecting ~12% of users
- Root cause identified as session configuration issue
- Prioritized as P1 for current sprint

### New Dashboard
- Designs are finalized and ready for implementation
- Frontend work depends on API endpoints being available
- Documentation update needed before release

## Action Items

| # | Task | Owner | Deadline | Priority |
|---|------|-------|----------|----------|
| 1 | Fix login timeout (session config) | Mike | End of sprint | P1 |
| 2 | Build dashboard API endpoints | Mike | Wednesday | High |
| 3 | Implement dashboard frontend | Sarah | After API ready | High |
| 4 | Update documentation for release | Mike | Friday | Medium |
```

### Example 2: Extract action items only

**User request:** "Just pull out the action items from this meeting transcript"

**Output format:**
```markdown
## Action Items from [Meeting Name]

| # | Task | Owner | Deadline | Status |
|---|------|-------|----------|--------|
| 1 | [Task] | [Person] | [Date] | Pending |
| 2 | [Task] | [Person] | [Date] | Pending |

**Unassigned items (need owners):**
- [Task with no clear owner]
- [Task with no clear owner]
```

### Example 3: Generate follow-up email

**User request:** "Turn these meeting notes into a follow-up email"

**Output:**
```
Subject: Meeting Summary & Action Items - [Topic] ([Date])

Hi team,

Thanks for joining today's discussion on [topic]. Here's a quick recap:

**Key Decisions:**
- [Decision 1]
- [Decision 2]

**Action Items:**
- @[Person]: [Task] by [deadline]
- @[Person]: [Task] by [deadline]

**Next Steps:**
[What happens next and when the next meeting is]

Let me know if I missed anything or if any details need correction.

Best,
[Name]
```

## Guidelines

- Always preserve attribution. If someone said something or was assigned a task, keep their name attached.
- When deadlines are vague, note them as-is but flag for clarification.
- If the input is messy or unclear, do your best and add a note about what was ambiguous.
- Keep summaries concise. The goal is to save people from re-reading the full notes.
- Group related discussion points even if they were discussed at different times in the meeting.
- Use consistent formatting so summaries are scannable at a glance.
- If the user provides a transcript with speaker labels, always maintain the association between speakers and their statements.
- For recurring meetings, maintain a consistent structure so summaries are easy to compare week over week.
