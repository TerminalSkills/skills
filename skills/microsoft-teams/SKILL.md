---
name: microsoft-teams
description: >-
  Build bots, automate workflows, and manage Microsoft Teams programmatically
  via Microsoft Graph API. Use when someone asks to "build a Teams bot",
  "automate Teams messages", "create Teams channels", "integrate with Teams",
  "Teams webhook", "send Teams notifications", "manage Teams meetings", or
  "Teams app development". Covers Workflows webhooks (the replacement for
  discontinued Office 365 connectors), Graph API for channels and meetings, and
  bots with the Teams SDK.
license: Apache-2.0
compatibility: >-
  Microsoft Graph API v1.0, Teams SDK for TypeScript
  (@microsoft/teams.apps 2.x, Node.js 22.12+). Requires a Microsoft 365 tenant.
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags: "microsoft-teams, graph-api, teams-sdk, microsoft-365, collaboration"
---

# Microsoft Teams

## Overview

This skill helps AI agents build integrations with Microsoft Teams: notifications through a Workflows webhook, team, channel and meeting management through the Microsoft Graph API, and conversational bots with the Teams SDK. Three things changed since older tutorials were written: Office 365 connector webhooks were switched off in May 2026 in favour of Power Automate Workflows, Graph cannot post channel messages with app-only permissions, and the Bot Framework SDK is no longer maintained.

## Instructions

### Choose Integration Type

| Need | Solution | Complexity |
|------|----------|------------|
| Send notifications to a channel or chat | Workflows webhook (Power Automate) | Low |
| Create channels, meetings, read teams | Graph API | Medium |
| Post messages as a signed-in user | Graph API, delegated permission | Medium |
| Interactive bot (commands, cards, proactive messages) | Teams SDK (`@microsoft/teams.apps`) | High |

### Webhook Notifications (Workflows)

Microsoft 365 connectors, including the old `webhook.office.com` incoming webhook, were switched off in a rollout that Microsoft ran from 18 to 22 May 2026, so old connector URLs no longer deliver and none can be created. Create the webhook with the Workflows app instead: in the channel, open **More options (...)**, **Workflows**, pick the template **Send webhook alerts to a channel**, save, and copy the generated URL. Treat the URL as a secret; anyone holding it can post to the channel. The workflow belongs to the person who created it, so add a co-owner or it stops when that person leaves.

```typescript
const WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL!;

const res = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard', version: '1.4',
        body: [
          { type: 'TextBlock', text: 'Deployment Complete', weight: 'Bolder', size: 'Large' },
          { type: 'FactSet', facts: [
            { title: 'Service', value: 'api-gateway' },
            { title: 'Version', value: 'v2.4.1' },
            { title: 'Environment', value: 'Production' },
          ]},
        ],
        actions: [{ type: 'Action.OpenUrl', title: 'View Dashboard', url: 'https://grafana.acme-corp.io/d/api-gateway' }],
      },
    }],
  }),
});
if (!res.ok) console.error('Teams webhook failed', res.status, await res.text());
```

Limits from the Teams docs: 28 KB per message, and more than four requests per second are throttled (retry with exponential backoff). Do not use HTML in card text; Markdown only.

### Graph API

```typescript
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID!, process.env.AZURE_CLIENT_ID!, process.env.AZURE_CLIENT_SECRET!
);
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});
const graphClient = Client.initWithMiddleware({ authProvider });

// Create a channel (application permission Channel.Create)
await graphClient.api(`/teams/${teamId}/channels`).post({
  displayName: 'Project Alpha', membershipType: 'standard',
});

// Create an online meeting (application permission OnlineMeetings.ReadWrite.All)
const meeting = await graphClient.api(`/users/${organizerId}/onlineMeetings`).post({
  subject: 'Sprint Planning',
  startDateTime: '2026-11-02T14:00:00Z', endDateTime: '2026-11-02T15:00:00Z',
  participants: { attendees: [{ upn: 'sarah.chen@acme-corp.io' }] },
});
console.log('Join URL:', meeting.joinUrl);
```

Posting a channel message (`POST /teams/{id}/channels/{id}/messages`) works only with a delegated token (`ChannelMessage.Send`); application permissions are supported there for data migration only. A daemon that must announce something in a channel should use the Workflows webhook or a bot. Meetings created with an app-only token also need a tenant admin to grant an application access policy to the app (`New-CsApplicationAccessPolicy` in Teams PowerShell); without it Graph returns 403.

### Bot (Teams SDK)

The Bot Framework SDK (`botbuilder`, last release 4.23.3) is archived and out of support since 31 December 2025. Microsoft's replacements are the Teams SDK (`@microsoft/teams.apps`, used below) and the Microsoft 365 Agents SDK. Install with `npm install @microsoft/teams.apps @microsoft/teams.api @microsoft/teams.cards`.

```typescript
import { App } from '@microsoft/teams.apps';
import { MessageActivity } from '@microsoft/teams.api';
import { AdaptiveCard, TextBlock, FactSet, Fact } from '@microsoft/teams.cards';

const app = new App(); // reads CLIENT_ID, CLIENT_SECRET and TENANT_ID from the environment

app.on('message', async ({ activity, reply }) => {
  if (activity.text?.trim().toLowerCase() === 'status') {
    const card = new AdaptiveCard(
      new TextBlock('System Status', { weight: 'Bolder', size: 'Large' }),
      new FactSet(
        new Fact('API', 'Healthy (42ms)'),
        new Fact('Database', 'Healthy (8ms)'),
        new Fact('Queue', 'High (1,247 pending)'),
      ),
    );
    await reply(new MessageActivity('').addCard('adaptive', card));
    return;
  }
  await reply('Commands: `status` for system health');
});

app.start(Number(process.env.PORT ?? 3978)).catch(console.error);
```

Messages arrive at `/api/messages`. The bot needs an Azure bot registration and a Teams app manifest installed in Teams; the Microsoft 365 Agents Toolkit (formerly Teams Toolkit) scaffolds both. For local runs without Teams token validation, set `DANGEROUSLY_ALLOW_UNAUTHENTICATED_REQUESTS=true`, never in production.

## Examples

### Example 1: Deployment notifications to a DevOps channel
**User prompt:** "Send a rich notification to our Teams DevOps channel whenever a deployment completes, showing the service name, version, environment, and a link to Grafana."

The agent will:
1. Ask the user to create a Workflows webhook (template "Send webhook alerts to a channel") in the channel and store its URL as `TEAMS_WEBHOOK_URL` in the CI secrets
2. Post the Adaptive Card payload from the Webhook section as a post-deploy CI step
3. Check `res.ok` and log failures without failing the deployment

Result: the channel shows a card titled "Deployment Complete" with the service, version and environment facts and a "View Dashboard" button.

### Example 2: A status bot
**User prompt:** "Create a Teams bot that responds to 'status' with a system health card showing API, database, and queue metrics."

The agent will:
1. Scaffold the project with `@microsoft/teams.apps` using the code above
2. Replace the hard-coded facts with calls to the monitoring endpoints
3. Register the bot in Azure, put `CLIENT_ID`, `CLIENT_SECRET` and `TENANT_ID` in the environment, and sideload the app manifest into Teams

Result: typing `status` to the bot returns an Adaptive Card with the three health rows.

## Guidelines

- A Workflows webhook is enough for one-way alerts; do not build a bot for that.
- Application permissions suit daemons; delegated permissions suit anything that acts as a user, including posting channel messages.
- Graph throttles per app and tenant and answers 429 with a `Retry-After` header; honour it. Combine up to 20 calls with `POST /$batch`.
- Keep secrets (client secret, webhook URL) in environment variables or Azure Key Vault, never in code or card payloads.
- Preview cards in the Adaptive Cards designer (adaptivecards.microsoft.com/designer) before shipping; Teams supports a subset of card features.
- Do not start new projects on `botbuilder` or on Office 365 connector webhooks.
