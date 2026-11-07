---
title: Let Customers Connect Their CRM to Your SaaS with Nango
slug: let-customers-connect-their-crm-to-your-saas-with-nango
description: Add a "Connect HubSpot" button to a SaaS product, store each customer's connection, and read their contacts without writing OAuth or token-refresh code.
skills:
  - nango
  - typescript
  - nextjs
category: development
tags:
  - oauth
  - integrations
  - hubspot
  - webhooks
  - saas
---

# Let Customers Connect Their CRM to Your SaaS with Nango

## The Problem

Priya Raman is the only backend engineer at Tallybridge, a 9-person startup that sends renewal reminders for B2B subscriptions. Her customers keep their account lists in HubSpot, and every onboarding call ends the same way: the customer exports a CSV, emails it, and Priya imports it by hand. Within a week the list is stale.

The obvious fix is a "Connect HubSpot" button. That means registering an OAuth app, running the authorization flow, storing refresh tokens per customer, refreshing them before they expire, handling revoked access, and doing it again when the first customer on Pipedrive asks. She estimates three weeks for HubSpot alone, and none of it is her product.

## The Solution

Use the **nango** skill to put Nango between Tallybridge and the CRM. Nango runs the OAuth flow in its Connect UI, stores and refreshes the tokens, and injects them when Tallybridge sends a request through its proxy. Tallybridge keeps only a connection ID per customer. The **nextjs** and **typescript** skills cover the existing app, where the button, the session endpoint and the webhook handler live.

The Nango account itself (integration, webhook URL, API key) is created by a person in the dashboard; the agent does everything in the codebase.

## Step-by-Step Walkthrough

### 1. Prepare the account side

Priya signs up at app.nango.dev, creates an integration with the unique key `hubspot` using the Nango-managed OAuth app, sets the webhook URL to `https://app.tallybridge.io/api/webhooks/nango`, and turns on "Send New Connection Creation Webhooks". She exports the keys in her shell and `.env.local`:

```bash
# values come from Environment Settings > API Keys and > Webhooks
NANGO_API_KEY=paste-api-key-here
NANGO_WEBHOOK_SIGNING_KEY=paste-signing-key-here
```

### 2. Mint a session token

> Add a POST route that returns a Nango connect session token for the signed-in organization, allowing only the hubspot integration.

```bash
npm install @nangohq/node @nangohq/frontend
```

```typescript
// app/api/nango/session/route.ts
import { Nango } from '@nangohq/node';
import { getCurrentUser } from '@/lib/auth';

const nango = new Nango({ apiKey: process.env.NANGO_API_KEY! });

export async function POST() {
    const user = await getCurrentUser();
    const { data } = await nango.createConnectSession({
        tags: { end_user_id: user.id, end_user_email: user.email, organization_id: user.orgId },
        allowed_integrations: ['hubspot']
    });
    return Response.json({ sessionToken: data.token });
}
```

### 3. Add the Connect button

> Add a client component with a Connect HubSpot button that opens the Nango Connect UI.

```typescript
'use client';
import Nango from '@nangohq/frontend';

export function ConnectHubSpot() {
    async function open() {
        const nango = new Nango();
        const connect = nango.openConnectUI({
            onEvent: (event) => {
                if (event.type === 'connect') window.location.reload();
            }
        });
        const res = await fetch('/api/nango/session', { method: 'POST' });
        const { sessionToken } = await res.json();
        connect.setSessionToken(sessionToken);
    }
    return <button onClick={open}>Connect HubSpot</button>;
}
```

### 4. Store the connection ID from the webhook

> Add the webhook route. Verify the Nango signature on the raw body, then save the connection ID on the organization.

```typescript
// app/api/webhooks/nango/route.ts
import { Nango } from '@nangohq/node';
import { saveConnection } from '@/lib/connections';

const nango = new Nango({
    apiKey: process.env.NANGO_API_KEY!,
    webhookSigningKey: process.env.NANGO_WEBHOOK_SIGNING_KEY
});

export async function POST(req: Request) {
    const raw = await req.text();
    const headers = Object.fromEntries(req.headers);
    if (!nango.verifyIncomingWebhookRequest(raw, headers)) {
        return new Response('bad signature', { status: 401 });
    }
    const event = JSON.parse(raw);
    if (event.type === 'auth' && event.operation === 'creation' && event.success) {
        await saveConnection(event.tags.organization_id, 'hubspot', event.connectionId);
    }
    return new Response('ok');
}
```

### 5. Read the customer's contacts through the proxy

> Replace the CSV import with a function that pulls up to 100 HubSpot contacts for an organization.

```typescript
// lib/hubspot-contacts.ts
import { Nango } from '@nangohq/node';
import { getConnectionId } from '@/lib/connections';

const nango = new Nango({ apiKey: process.env.NANGO_API_KEY! });

export async function listContacts(orgId: string) {
    const connectionId = await getConnectionId(orgId, 'hubspot');
    const res = await nango.get({
        endpoint: '/crm/v3/objects/contacts',
        params: { limit: 100, properties: 'email,firstname,lastname,company' },
        providerConfigKey: 'hubspot',
        connectionId
    });
    return res.data.results;
}
```

### 6. Handle revoked access

> If Nango says the credentials are invalid, show a Reconnect state instead of an error page.

`nango.getConnection('hubspot', connectionId)` throws with `error.response?.data?.error?.code === 'invalid_credentials'` when a refresh failed. Tallybridge catches that, shows a "Reconnect HubSpot" button and requests a reconnect session. The connection keeps its ID, so no data is lost.

## Real-World Example

Tallybridge shipped the HubSpot connection in four days instead of the three weeks Priya had budgeted. In the first month 31 of 44 customers connected on their own and the CSV email loop stopped. Two customers revoked access during a HubSpot admin cleanup; both saw the Reconnect button and were back within a day.

When a customer asked for Pipedrive, the work was a second integration in the dashboard and `allowed_integrations: ['hubspot', 'pipedrive']`, plus a different endpoint path in the proxy call. For nightly full-list updates Priya later moved the contact read into a Nango sync function, which the nango skill also covers.

## Related Skills

- [nango](/skills/nango) — Connect UI sessions, webhook verification, proxy calls and sync functions
- [nextjs](/skills/nextjs) — the route handlers and client component in the product
- [typescript](/skills/typescript) — typing the session, webhook and contact helpers
