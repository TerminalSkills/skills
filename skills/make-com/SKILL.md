---
name: make-com
description: >-
  You are an expert in Make.com (formerly Integromat), the visual automation
  platform for connecting apps and building workflows without code. You help
  teams build scenarios using drag-and-drop modules, routers for conditional
  logic, iterators for array processing, and aggregators for data collection —
  enabling non-technical users to automate business processes across 1,500+
  apps.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Automation & Integration
  tags:
    - no-code
    - workflow
    - automation
    - integration
    - visual-builder
    - iPaaS
---

# Make.com — Visual Workflow Automation Platform

You are an expert in Make.com (formerly Integromat), the visual automation platform for connecting apps and building workflows without code. You help teams build scenarios using drag-and-drop modules, routers for conditional logic, iterators for array processing, and aggregators for data collection — enabling non-technical users to automate business processes across 1,500+ apps.

## Core Capabilities

### Scenario Building

```markdown
## Scenario Structure

Make.com scenarios are visual flowcharts:
- **Trigger**: Starts the scenario (webhook, schedule, app event)
- **Module**: Performs an action (read/write data in an app)
- **Router**: Splits flow into conditional branches
- **Iterator**: Processes array items one by one
- **Aggregator**: Collects multiple items into one output
- **Filter**: Conditionally passes or blocks data between modules

## Example: Invoice Processing Pipeline

[Gmail Trigger: New email with attachment]
    → [Filter: subject contains "invoice"]
    → [Google Drive: Upload attachment]
    → [OpenAI: Extract invoice data from PDF]
    → [Router]
        ├→ [Filter: amount > $1000] → [Slack: Notify #finance for approval]
        └→ [Filter: amount ≤ $1000] → [QuickBooks: Create bill] → [Slack: Confirm processed]
```

### Data Mapping

```markdown
## Mapping Syntax

Make.com uses double curly braces for dynamic values:
- {{1.email}} — Email from module 1
- {{2.body.amount}} — Amount from module 2's response
- {{formatDate(1.date; "YYYY-MM-DD")}} — Format a date
- {{if(1.status = "active"; "Yes"; "No")}} — Conditional value
- {{parseJSON(1.body)}} — Parse JSON string
- {{length(1.items)}} — Count items in array
- {{substring(1.name; 0; 50)}} — First 50 characters

## Built-in Functions
- Text: replace, lower, upper, trim, split, md5, sha256
- Math: round, ceil, floor, min, max, sum, average
- Date: addDays, addMonths, formatDate, parseDate, now
- Array: map, sort, slice, merge, distinct, contains
```

### HTTP Module (Custom APIs)

```markdown
## Custom API Integration

Module: HTTP → Make a Request

URL: https://api.example.com/orders
Method: POST
Headers:
  Authorization: Bearer {{connection.api_key}}
  Content-Type: application/json
Body:
  {
    "customer_email": "{{1.email}}",
    "items": {{1.items}},
    "total": {{1.total}}
  }
Parse Response: Yes
```

### Error Handling

```markdown
## Error Routes

Every module can have an error handler route:
[Module] → 🔴 [Error Handler]

Error handler types:
- **Resume**: Continue with default values
- **Rollback**: Undo all changes in the scenario
- **Commit**: Save progress, stop execution
- **Break**: Pause and retry later (with backoff)
- **Ignore**: Skip the failed item, continue with next

## Incomplete Executions
Make.com saves failed executions for manual retry.
Dashboard shows: which module failed, the input data, the error message.
Click "Resolve" to fix data and re-run from the failed step.
```

## Installation

```markdown
# No installation — browser-based
# https://make.com

# Pricing
- Free: 1,000 operations/month
- Core: $10.59/month (10,000 operations)
- Pro: $18.82/month (10,000 operations + advanced features)
```

## Best Practices

1. **Start with the trigger** — Every scenario needs one trigger module; choose between instant (webhook) and scheduled (polling)
2. **Routers for branching** — Use routers with filters for conditional logic; each branch runs independently
3. **Error handling on every module** — Add error routes for critical modules; use "Break" for retryable failures
4. **Data stores for state** — Use Make.com's built-in data stores for tracking processed items and workflow state
5. **Iterators for arrays** — When an API returns an array, use an iterator to process each item; don't try to handle arrays in a single module
6. **HTTP module for custom APIs** — Any API not in the 1,500+ app catalog can be called via the HTTP module
7. **Scenario blueprints** — Export scenarios as JSON blueprints; share with team members or import to other accounts
8. **Execution history** — Make.com logs every execution with full data flow; use it for debugging and auditing
