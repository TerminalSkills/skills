---
name: microsoft-teams
description: >-
  Build bots, automate workflows, and manage Microsoft Teams programmatically via
  Microsoft Graph API. Use when someone asks to "build a Teams bot", "automate Teams
  messages", "create Teams channels", "integrate with Teams", "Teams webhook",
  "send Teams notifications", "manage Teams meetings", or "Teams app development".
  Covers Graph API for messaging, channels, meetings, bots with Bot Framework,
  incoming webhooks, and Power Automate integration.
license: Apache-2.0
compatibility: "Microsoft Graph API v1.0, Bot Framework SDK v4, Teams Toolkit. Requires Microsoft 365 tenant."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["microsoft-teams", "graph-api", "bot-framework", "microsoft-365", "collaboration", "api"]
---

# Microsoft Teams

## Overview

This skill helps AI agents build integrations with Microsoft Teams — from simple webhook notifications to full-featured bots and workflow automation. It covers the Microsoft Graph API for team/channel/message management, Bot Framework for conversational bots, incoming webhooks for quick notifications, Adaptive Cards for rich UI, and meeting automation.

## Instructions

### Step 1: Choose Integration Type

| Need | Solution | Complexity |
|------|----------|------------|
| Send notifications to a channel | Incoming Webhook | Low — no app registration |
| Read/write messages, manage teams | Graph API | Medium — app registration + permissions |
| Interactive bot (commands, dialogs) | Bot Framework | High — hosted bot service |
| No-code automation | Power Automate | Low — visual flow builder |
| Full Teams app (tabs, bots, cards) | Teams Toolkit | High — full app package |

### Step 2: Incoming Webhooks (Simplest)

No app registration needed — just a URL to POST JSON to:

```typescript
// Send message to Teams channel via webhook
const WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;
// Get URL: Teams channel → ⋯ → Connectors → Incoming Webhook → Configure

// Simple text message
await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: '🚨 **Production Alert**: CPU usage at 95% on api-server-01',
  }),
});

// Adaptive Card (rich formatting)
await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.5',
        body: [
          {
            type: 'TextBlock',
            text: '🚀 Deployment Complete',
            weight: 'Bolder',
            size: 'Large',
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Service', value: 'api-gateway' },
              { title: 'Version', value: 'v2.4.1' },
              { title: 'Environment', value: 'Production' },
              { title: 'Time', value: new Date().toISOString() },
            ],
          },
          {
            type: 'TextBlock',
            text: 'All health checks passing ✅',
            color: 'Good',
          },
        ],
        actions: [
          {
            type: 'Action.OpenUrl',
            title: 'View Dashboard',
            url: 'https://grafana.example.com/d/deploy',
          },
          {
            type: 'Action.OpenUrl',
            title: 'View Logs',
            url: 'https://logs.example.com/deploy/v2.4.1',
          },
        ],
      },
    }],
  }),
});
```

### Step 3: Microsoft Graph API

#### App Registration & Authentication

```typescript
// Register app at https://portal.azure.com → App registrations
// Required permissions (Application type for daemon/service):
//   - Team.ReadBasic.All
//   - Channel.ReadBasic.All
//   - ChannelMessage.Send
//   - Chat.ReadWrite.All
//   - User.Read.All
//   - OnlineMeetings.ReadWrite.All (for meetings)

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID,
  process.env.AZURE_CLIENT_ID,
  process.env.AZURE_CLIENT_SECRET
);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});

const graphClient = Client.initWithMiddleware({ authProvider });
```

#### Teams & Channels
```typescript
// List teams the app has access to
const teams = await graphClient.api('/groups')
  .filter("resourceProvisioningOptions/Any(x:x eq 'Team')")
  .select('id,displayName,description')
  .get();

// Get channels in a team
const channels = await graphClient.api(`/teams/${teamId}/channels`)
  .get();

// Create a channel
const newChannel = await graphClient.api(`/teams/${teamId}/channels`)
  .post({
    displayName: 'Project Alpha',
    description: 'Channel for Project Alpha discussions',
    membershipType: 'standard', // or 'private', 'shared'
  });

// Create private channel with members
const privateChannel = await graphClient.api(`/teams/${teamId}/channels`)
  .post({
    displayName: 'Leadership Updates',
    membershipType: 'private',
    members: [
      {
        '@odata.type': '#microsoft.graph.aadUserConversationMember',
        'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userId}')`,
        roles: ['owner'],
      },
    ],
  });
```

#### Send Messages
```typescript
// Send message to channel
await graphClient.api(`/teams/${teamId}/channels/${channelId}/messages`)
  .post({
    body: {
      contentType: 'html',
      content: '<h3>Weekly Status Update</h3><ul><li>Sprint velocity: 42 points</li><li>Bugs resolved: 7</li><li>Features shipped: 3</li></ul>',
    },
  });

// Send message with mentions
await graphClient.api(`/teams/${teamId}/channels/${channelId}/messages`)
  .post({
    body: {
      contentType: 'html',
      content: 'Hey <at id="0">John</at>, the PR is ready for review.',
    },
    mentions: [{
      id: 0,
      mentionText: 'John',
      mentioned: {
        user: { id: userId, displayName: 'John', userIdentityType: 'aadUser' },
      },
    }],
  });

// Send Adaptive Card via Graph API
await graphClient.api(`/teams/${teamId}/channels/${channelId}/messages`)
  .post({
    body: { contentType: 'html', content: '' },
    attachments: [{
      id: '1',
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: JSON.stringify({
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.5',
        body: [
          { type: 'TextBlock', text: 'Approval Required', weight: 'Bolder', size: 'Large' },
          { type: 'TextBlock', text: 'PR #142: Add payment retry logic', wrap: true },
          { type: 'FactSet', facts: [
            { title: 'Author', value: 'Sarah Chen' },
            { title: 'Changes', value: '+247 / -31' },
            { title: 'Tests', value: 'All passing ✅' },
          ]},
        ],
        actions: [
          { type: 'Action.OpenUrl', title: 'Review PR', url: 'https://github.com/org/repo/pull/142' },
        ],
      }),
    }],
  });

// Send chat message (1:1 or group chat)
await graphClient.api(`/chats/${chatId}/messages`)
  .post({
    body: { contentType: 'text', content: 'Reminder: standup in 15 minutes' },
  });
```

#### Meetings
```typescript
// Create online meeting
const meeting = await graphClient.api(`/users/${organizerId}/onlineMeetings`)
  .post({
    subject: 'Sprint Planning',
    startDateTime: '2026-03-01T14:00:00Z',
    endDateTime: '2026-03-01T15:00:00Z',
    participants: {
      attendees: [
        { upn: 'sarah@example.com', role: 'attendee' },
        { upn: 'mike@example.com', role: 'attendee' },
      ],
    },
    lobbyBypassSettings: {
      scope: 'organization', // organization members skip lobby
    },
    isEntryExitAnnounced: false,
  });

console.log('Join URL:', meeting.joinUrl);

// List user's meetings
const meetings = await graphClient.api(`/users/${userId}/onlineMeetings`)
  .filter(`startDateTime ge 2026-03-01T00:00:00Z`)
  .get();

// Get meeting attendance report
const attendance = await graphClient
  .api(`/users/${organizerId}/onlineMeetings/${meetingId}/attendanceReports`)
  .get();
```

### Step 4: Bot Framework (Interactive Bots)

```typescript
// Install: npm install botbuilder botframework-connector

import { ActivityHandler, TurnContext, CardFactory } from 'botbuilder';

class TeamBot extends ActivityHandler {
  constructor() {
    super();

    // Handle messages
    this.onMessage(async (context: TurnContext, next) => {
      const text = context.activity.text?.trim().toLowerCase();

      if (text === 'status') {
        const card = CardFactory.adaptiveCard({
          type: 'AdaptiveCard',
          version: '1.5',
          body: [
            { type: 'TextBlock', text: '📊 System Status', weight: 'Bolder', size: 'Large' },
            { type: 'FactSet', facts: [
              { title: 'API', value: '✅ Healthy (42ms)' },
              { title: 'Database', value: '✅ Healthy (8ms)' },
              { title: 'Queue', value: '⚠️ High (1,247 pending)' },
            ]},
          ],
        });
        await context.sendActivity({ attachments: [card] });
      } else if (text?.startsWith('deploy ')) {
        const service = text.replace('deploy ', '');
        await context.sendActivity(`🚀 Deploying **${service}** to production...`);
        // Trigger deployment pipeline
      } else {
        await context.sendActivity(
          `I can help with:\n- \`status\` — Check system health\n- \`deploy <service>\` — Deploy to production`
        );
      }

      await next();
    });

    // Handle new members added to team
    this.onMembersAdded(async (context, next) => {
      for (const member of context.activity.membersAdded) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity(
            `Welcome to the team, ${member.name}! 👋 Type \`help\` to see what I can do.`
          );
        }
      }
      await next();
    });
  }
}

// Express server to receive webhook events
import express from 'express';
import { BotFrameworkAdapter } from 'botbuilder';

const adapter = new BotFrameworkAdapter({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD,
});

const bot = new TeamBot();
const app = express();

app.post('/api/messages', async (req, res) => {
  await adapter.process(req, res, (context) => bot.run(context));
});

app.listen(3978);
```

### Step 5: Power Automate (No-Code)

Common Teams automations:
- **New channel message → parse and route** (support triage)
- **Scheduled message** → post weekly status to channel
- **Approval flow** → request approval via Adaptive Card, route response
- **Form submission → Teams notification** (Microsoft Forms → Teams)
- **File uploaded to SharePoint → notify in Teams**
- **Email with keyword → forward to Teams channel**

### Adaptive Cards Reference

```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    { "type": "TextBlock", "text": "Title", "weight": "Bolder", "size": "Large" },
    { "type": "TextBlock", "text": "Description text", "wrap": true },
    { "type": "Image", "url": "https://...", "size": "Medium" },
    { "type": "FactSet", "facts": [
      { "title": "Label", "value": "Value" }
    ]},
    { "type": "ColumnSet", "columns": [
      { "type": "Column", "width": "auto", "items": [...] },
      { "type": "Column", "width": "stretch", "items": [...] }
    ]},
    { "type": "Input.Text", "id": "comment", "placeholder": "Add a comment" },
    { "type": "Input.ChoiceSet", "id": "priority", "choices": [
      { "title": "High", "value": "high" },
      { "title": "Low", "value": "low" }
    ]}
  ],
  "actions": [
    { "type": "Action.Submit", "title": "Approve", "data": { "action": "approve" } },
    { "type": "Action.OpenUrl", "title": "View Details", "url": "https://..." },
    { "type": "Action.ShowCard", "title": "Comment", "card": { "type": "AdaptiveCard", "body": [...] } }
  ]
}
```

Design tool: https://adaptivecards.io/designer/

## Best Practices

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
