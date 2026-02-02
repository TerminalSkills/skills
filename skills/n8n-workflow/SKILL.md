---
name: n8n-workflow
description: >-
  Automate document workflows with n8n. Use when a user asks to create an n8n
  workflow, automate a process, connect services, build an integration pipeline,
  set up webhook triggers, or access n8n workflow templates. Covers workflow
  design, node configuration, and accessing 7800+ community templates.
license: Apache-2.0
compatibility: "Requires Node.js 18+ or Docker for n8n installation"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["n8n", "workflow", "automation", "integration", "no-code"]
  use-cases:
    - "Build automated document processing pipelines"
    - "Connect APIs and services without custom code"
    - "Leverage 7800+ community workflow templates"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# n8n Workflow

## Overview

Create, configure, and deploy n8n workflows for document and data automation. n8n is an open-source workflow automation tool with 400+ integrations. This skill helps you design workflows, configure nodes, use community templates, and self-host n8n instances.

## Instructions

When a user asks for help with n8n workflows, determine which task they need:

### Task A: Set up n8n locally

1. Install n8n using one of these methods:

```bash
# Option 1: npm (requires Node.js 18+)
npm install -g n8n
n8n start

# Option 2: Docker (recommended for production)
docker run -d --name n8n \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n:latest

# Option 3: Docker Compose with persistent storage
```

2. Create a `docker-compose.yml` for a production setup:

```yaml
version: "3.8"
services:
  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=changeme
      - WEBHOOK_URL=https://your-domain.com/
    volumes:
      - n8n_data:/home/node/.n8n
    restart: unless-stopped

volumes:
  n8n_data:
```

3. Access the editor at `http://localhost:5678`

### Task B: Design a workflow from scratch

1. Identify the trigger (webhook, schedule, event, manual)
2. Map out the data flow: source -> transform -> destination
3. Create the workflow JSON structure:

```json
{
  "name": "Document Processing Pipeline",
  "nodes": [
    {
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300],
      "parameters": {
        "path": "process-doc",
        "httpMethod": "POST"
      }
    },
    {
      "name": "Extract Data",
      "type": "n8n-nodes-base.code",
      "position": [450, 300],
      "parameters": {
        "jsCode": "const items = $input.all();\nreturn items.map(item => ({ json: { text: item.json.body.content } }));"
      }
    }
  ],
  "connections": {
    "Webhook Trigger": {
      "main": [[ { "node": "Extract Data", "type": "main", "index": 0 } ]]
    }
  }
}
```

4. Import the JSON into n8n via the editor or CLI:

```bash
# Import via CLI
n8n import:workflow --input=workflow.json
```

### Task C: Use community templates

1. Browse templates at `https://n8n.io/workflows/` (7800+ available)
2. Search by use case, integration, or keyword
3. Download and import the template:

```bash
# Download a template
curl -o template.json "https://api.n8n.io/api/templates/workflows/TEMPLATE_ID"

# Import into your n8n instance
n8n import:workflow --input=template.json
```

4. Customize the template by updating credentials and parameters

### Task D: Configure common nodes

**HTTP Request node** for API calls:
```json
{
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "POST",
    "url": "https://api.example.com/process",
    "sendBody": true,
    "bodyParameters": {
      "parameters": [
        { "name": "document", "value": "={{ $json.fileContent }}" }
      ]
    }
  }
}
```

**Schedule Trigger** for recurring workflows:
```json
{
  "type": "n8n-nodes-base.scheduleTrigger",
  "parameters": {
    "rule": { "interval": [{ "field": "hours", "hoursInterval": 1 }] }
  }
}
```

**Code node** for custom transformations:
```javascript
// Process each item
const results = [];
for (const item of $input.all()) {
  results.push({
    json: {
      processed: item.json.content.toUpperCase(),
      timestamp: new Date().toISOString()
    }
  });
}
return results;
```

## Examples

### Example 1: Automated invoice processing pipeline

**User request:** "Create an n8n workflow that watches a folder for new invoices, extracts data, and saves to a spreadsheet"

**Workflow design:**
1. **Trigger:** Local File Trigger watching `/invoices/` directory
2. **Read File:** Read the uploaded PDF/image
3. **HTTP Request:** Send to an OCR API for text extraction
4. **Code Node:** Parse extracted text into structured fields (vendor, amount, date)
5. **Google Sheets:** Append the row to an invoice tracking spreadsheet
6. **Email:** Send confirmation with the extracted data

### Example 2: Slack-to-Notion document sync

**User request:** "When someone posts a document link in Slack, automatically save it to Notion"

**Workflow design:**
1. **Slack Trigger:** Listen for messages containing URLs in a specific channel
2. **Code Node:** Extract and validate the URL from the message
3. **HTTP Request:** Fetch document metadata from the URL
4. **Notion Node:** Create a new page in the target database with title, URL, and metadata
5. **Slack Node:** Reply in thread confirming the document was saved

### Example 3: Scheduled report generation

**User request:** "Every Monday at 9 AM, pull data from our API and email a summary"

**Workflow design:**
1. **Schedule Trigger:** Cron expression `0 9 * * 1`
2. **HTTP Request:** Fetch weekly metrics from the internal API
3. **Code Node:** Aggregate and format data into an HTML table
4. **Send Email:** Deliver the formatted report to the distribution list

## Guidelines

- Always set up error handling with the Error Trigger node for production workflows.
- Use environment variables for credentials and API keys, never hardcode them.
- Test workflows with small datasets before enabling automated triggers.
- Use the n8n CLI for version-controlled workflow management: export with `n8n export:workflow --all --output=workflows/`.
- Set execution timeouts to prevent runaway workflows.
- For high-volume workflows, self-host n8n with a PostgreSQL backend instead of the default SQLite.
- Pin node versions in production to avoid breaking changes on updates.
- Use sub-workflows to keep complex automations modular and reusable.
