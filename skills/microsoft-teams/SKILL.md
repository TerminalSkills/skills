---
name: microsoft-teams
description: >-
  Build bots, automate workflows, and manage Microsoft Teams programmatically
  via Microsoft Graph API. Use when someone asks to "build a Teams bot",
  "automate Teams messages", "create Teams channels", "integrate with Teams",
  "Teams webhook", "send Teams notifications", "manage Teams meetings", or
  "Teams app development". Covers Graph API for messaging, channels, meetings,
  bots with Bot Framework, incoming webhooks, and Power Automate integration.
license: Apache-2.0
compatibility: >-
  Microsoft Graph API v1.0, Bot Framework SDK v4, Teams Toolkit. Requires
  Microsoft 365 tenant.
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - microsoft-teams
    - graph-api
    - bot-framework
    - microsoft-365
    - collaboration
---

# Microsoft Teams

## Overview

This skill helps AI agents build integrations with Microsoft Teams — from simple webhook notifications to full-featured bots and workflow automation. It covers the Microsoft Graph API for team/channel/message management, Bot Framework for conversational bots, incoming webhooks for quick notifications, Adaptive Cards for rich UI, and meeting automation.

## Instructions

### Choose Integration Type

| Need | Solution | Complexity |
|------|----------|------------|
| Send notifications to a channel | Incoming Webhook | Low |
| Read/write messages, manage teams | Graph API | Medium |
| Interactive bot (commands, dialogs) | Bot Framework | High |
| No-code automation | Power Automate | Low |

### Incoming Webhooks (Simplest)

```typescript
const WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;

// Simple text
await fetch(WEBHOOK_URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: '**Production Alert**: CPU at 95% on api-server-01' }),
});

// Adaptive Card (rich formatting)
await fetch(WEBHOOK_URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard', version: '1.5',
        body: [
          { type: 'TextBlock', text: 'Deployment Complete', weight: 'Bolder', size: 'Large' },
          { type: 'FactSet', facts: [
            { title: 'Service', value: 'api-gateway' },
            { title: 'Version', value: 'v2.4.1' },
            { title: 'Environment', value: 'Production' },
          ]},
        ],
        actions: [{ type: 'Action.OpenUrl', title: 'View Dashboard', url: 'https://grafana.example.com' }],
      },
    }],
  }),
});
```

### Graph API

```typescript
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

// Permissions: Team.ReadBasic.All, ChannelMessage.Send, Chat.ReadWrite.All, OnlineMeetings.ReadWrite.All
const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID, process.env.AZURE_CLIENT_ID, process.env.AZURE_CLIENT_SECRET
);
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});
const graphClient = Client.initWithMiddleware({ authProvider });

// Create channel
await graphClient.api(`/teams/${teamId}/channels`).post({
  displayName: 'Project Alpha', membershipType: 'standard',
});

// Send message with Adaptive Card
await graphClient.api(`/teams/${teamId}/channels/${channelId}/messages`).post({
  body: { contentType: 'html', content: '' },
  attachments: [{
    id: '1', contentType: 'application/vnd.microsoft.card.adaptive',
    content: JSON.stringify({
      type: 'AdaptiveCard', version: '1.5',
      body: [
        { type: 'TextBlock', text: 'PR #142: Add payment retry logic', weight: 'Bolder' },
        { type: 'FactSet', facts: [{ title: 'Author', value: 'Sarah Chen' }, { title: 'Tests', value: 'All passing' }] },
      ],
      actions: [{ type: 'Action.OpenUrl', title: 'Review PR', url: 'https://github.com/org/repo/pull/142' }],
    }),
  }],
});

// Create online meeting
const meeting = await graphClient.api(`/users/${organizerId}/onlineMeetings`).post({
  subject: 'Sprint Planning',
  startDateTime: '2026-03-01T14:00:00Z', endDateTime: '2026-03-01T15:00:00Z',
  participants: { attendees: [{ upn: 'sarah@example.com', role: 'attendee' }] },
});
console.log('Join URL:', meeting.joinUrl);
```

### Bot Framework

```typescript
import { ActivityHandler, TurnContext, CardFactory } from 'botbuilder';
import { BotFrameworkAdapter } from 'botbuilder';
import express from 'express';

class TeamBot extends ActivityHandler {
  constructor() {
    super();
    this.onMessage(async (context: TurnContext, next) => {
      const text = context.activity.text?.trim().toLowerCase();
      if (text === 'status') {
        const card = CardFactory.adaptiveCard({
          type: 'AdaptiveCard', version: '1.5',
          body: [
            { type: 'TextBlock', text: 'System Status', weight: 'Bolder', size: 'Large' },
            { type: 'FactSet', facts: [
              { title: 'API', value: 'Healthy (42ms)' },
              { title: 'Database', value: 'Healthy (8ms)' },
              { title: 'Queue', value: 'High (1,247 pending)' },
            ]},
          ],
        });
        await context.sendActivity({ attachments: [card] });
      } else {
        await context.sendActivity('Commands: `status` — system health, `deploy <service>` — deploy');
      }
      await next();
    });
    this.onMembersAdded(async (context, next) => {
      for (const member of context.activity.membersAdded) {
        if (member.id !== context.activity.recipient.id)
          await context.sendActivity(`Welcome, ${member.name}! Type \`help\` to see what I can do.`);
      }
      await next();
    });
  }
}

const adapter = new BotFrameworkAdapter({
  appId: process.env.MICROSOFT_APP_ID, appPassword: process.env.MICROSOFT_APP_PASSWORD,
});
const bot = new TeamBot();
const app = express();
app.post('/api/messages', (req, res) => adapter.process(req, res, (ctx) => bot.run(ctx)));
app.listen(3978);
```

## Examples

### Example 1: Set up deployment notifications via webhook
**User prompt:** "Send a rich notification to our Teams DevOps channel whenever a deployment completes, showing the service name, version, environment, and a link to Grafana."

The agent will:
1. Get the Incoming Webhook URL from the Teams channel connector settings
2. Construct an Adaptive Card with a `TextBlock` header, a `FactSet` showing service/version/environment/time, and an `Action.OpenUrl` button linking to the Grafana dashboard
3. POST the card payload to the webhook URL from the CI/CD pipeline's post-deployment step
4. Add error handling to log failures without blocking the deployment

### Example 2: Build a slash-command bot for system health checks
**User prompt:** "Create a Teams bot that responds to 'status' with a system health card showing API, database, and queue metrics pulled from our monitoring endpoints."

The agent will:
1. Set up a Bot Framework project with `BotFrameworkAdapter` and an Express server on port 3978
2. Implement `onMessage` handler that checks for the `status` command
3. Fetch current metrics from the monitoring API endpoints
4. Format the results as an Adaptive Card with a `FactSet` and status indicators
5. Register the bot in Azure Bot Service and install it in the Teams workspace

## Guidelines

- Incoming webhooks for simple notifications — don't over-engineer with Graph API when a webhook does the job
- Use Adaptive Cards for any structured data — much better UX than plain text
- Graph API with application permissions for daemon services, delegated permissions for user-context apps
- Bot Framework for interactive scenarios — commands, dialogs, approval workflows
- Rate limits: Graph API allows 10,000 requests per 10 minutes per app per tenant
- Always handle `onMembersAdded` in bots — send welcome message with capabilities
- Store tokens securely — Azure Key Vault or environment variables, never in code
- Test Adaptive Cards at adaptivecards.io/designer before deploying
- Use Teams Toolkit (VS Code extension) for rapid development with templates
- For high-volume messaging, use batch requests (`$batch` endpoint) to reduce API calls
