---
name: nango
description: >-
  Nango is an integration platform that handles OAuth, API-key storage, token refresh and authenticated API calls for 1,000+ third-party APIs, plus a TypeScript runtime for sync and action functions. Use it when a user asks to "let my customers connect their HubSpot or GitHub account", "add OAuth to my product", "proxy requests to a customer's API", "sync records from an external API", or "give an AI agent access to a user's SaaS tools" without writing per-provider auth code.
license: Apache-2.0
compatibility: "Node.js 20+ for the @nangohq/node and @nangohq/frontend SDKs, Node.js 22.22.2+ for the nango CLI (package engines); a Nango Cloud account (free signup) for the runtime"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "nango, oauth, integrations, api-proxy, typescript"
  repository: https://github.com/NangoHQ/nango
---
# Nango — managed auth, proxy and functions for product integrations

## Overview
Nango sits between your product and the external APIs your customers use. It has three parts: **Auth** (an embeddable Connect UI that runs the OAuth or API-key flow and stores a *connection* per end user, with automatic token refresh), **Proxy** (send a request to Nango and it injects that connection's credentials), and **Functions** (TypeScript syncs, actions and event handlers you write locally and deploy to Nango's runtime).

The runtime is Nango Cloud, which needs an account. Signup cannot be automated: ask the user to sign up at app.nango.dev and give you an API key from Environment Settings > API Keys. Never invent keys. Self-hosting exists, but the docs describe it as an Enterprise option (BYOC or Self-Managed) plus a limited free option for hobby projects; use Cloud unless the user asks otherwise. The repository is under the Elastic License 2.0, not an OSI open-source license.

Packages (npm): `@nangohq/node` (backend SDK), `@nangohq/frontend` (Connect UI), `nango` (CLI and the function-authoring library). The `nango` package declares `engines.node >=22.22.2`; the SDKs declare `>=20`.

## Instructions

### 1. Set up the account side (the user does this)
In the dashboard: create an integration (for example `hubspot`) on the Integrations tab. For OAuth APIs Nango offers a Nango-managed OAuth app for many providers, which is fine for development and production; otherwise register your own OAuth app and paste its client ID and secret. Then, under Environment Settings, set a webhook URL and enable "Send New Connection Creation Webhooks". The webhook URL cannot be set through the API.

The API key goes in the environment, never in code:

```bash
# Paste the values from Environment Settings > API Keys and > Webhooks
export NANGO_API_KEY="paste-api-key-here"
export NANGO_WEBHOOK_SIGNING_KEY="paste-signing-key-here"
```

### 2. Backend: create a connect session
Install the SDK and mint a short-lived session token for the signed-in user. Tags tie the new connection back to your own user or organization.

```bash
npm install @nangohq/node
```

```typescript
import { Nango } from '@nangohq/node';

const nango = new Nango({
    apiKey: process.env.NANGO_API_KEY!,
    webhookSigningKey: process.env.NANGO_WEBHOOK_SIGNING_KEY
});

export async function createSessionToken(userId: string, email: string, orgId: string) {
    const { data } = await nango.createConnectSession({
        tags: { end_user_id: userId, end_user_email: email, organization_id: orgId },
        allowed_integrations: ['hubspot']
    });
    return data.token;
}
```

The constructor takes `apiKey`. The older `secretKey` option still exists but is deprecated, and passing both throws. With one allowed integration the Connect UI goes straight to that provider; with several it shows a picker.

### 3. Frontend: open the Connect UI
```bash
npm install @nangohq/frontend
```

```typescript
import Nango from '@nangohq/frontend';

const nango = new Nango();
const connect = nango.openConnectUI({
    onEvent: (event) => {
        if (event.type === 'connect') console.log('Authorized');
        if (event.type === 'close') console.log('Modal closed');
    }
});

const res = await fetch('/api/nango/session', { method: 'POST' });
const { sessionToken } = await res.json();
connect.setSessionToken(sessionToken); // a loading state shows until this is called
```

### 4. Backend: receive the connection ID by webhook
When authorization succeeds Nango POSTs an `auth` webhook. Verify the signature against the raw body, then store `connectionId` next to the user or organization (Nango does not know who owns it, only your tags do).

```typescript
import express from 'express';

const app = express();
app.post('/webhooks/nango', express.text({ type: '*/*' }), async (req, res) => {
    if (!nango.verifyIncomingWebhookRequest(req.body, req.headers)) {
        return res.status(401).send('bad signature');
    }
    const event = JSON.parse(req.body);
    if (event.type === 'auth' && event.operation === 'creation' && event.success) {
        await saveConnection(event.tags.organization_id, event.connectionId);
    }
    res.sendStatus(200);
});
```

The signature is an HMAC-SHA256 hex digest of the raw body in the `X-Nango-Hmac-Sha256` header. Parse JSON only after verifying; a body re-serialized by middleware will not match. Do not use the deprecated `verifyWebhookSignature`.

### 5. Call the external API through the proxy
```typescript
const res = await nango.get({
    endpoint: '/crm/v3/objects/contacts',
    params: { limit: 10 },
    providerConfigKey: 'hubspot',
    connectionId: connectionIdFromYourDb
});
console.log(res.data.results);
```

`nango.get/post/put/patch/delete` and `nango.proxy({ method, ... })` return an axios response and throw an axios error on non-2xx (read `error.response.status`). `retries: 3` enables exponential-backoff retries. `getConnection(providerConfigKey, connectionId)` returns the stored credentials; it throws with code `invalid_credentials` when the refresh failed, which is the moment to show a Reconnect button (create a reconnect session and reopen the Connect UI).

### 6. Functions: scaffold, run, deploy with the CLI
```bash
npm install -g nango
nango init nango-integrations
cd nango-integrations
```

`nango init` creates `index.ts`, `package.json`, `.env`, `.nango/` (commit it, it tracks deployed state) and an example `github/` folder with a sync, an action and an on-event function. Put API keys in `nango-integrations/.env`; the variable is named per environment, and each holds a Nango API key:

```bash
NANGO_SECRET_KEY_DEV='f3a91c7e-2b4d-4e8a-9c10-5d6e7f8a9b0c'
NANGO_SECRET_KEY_PROD='0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'
```

Commands (confirmed in `nango --help`): `nango dev` (watch and type-check), `nango compile`, `nango create github create-issue` (scaffold a function), `nango dryrun create-issue <connection ID> -e dev`, `nango deploy [environment]`, `nango pull github list-repos --catalog` (copy a catalog function locally). Every function file must be imported from the root `index.ts` or it is not deployed.

An action (run on demand, output max 2 MB):

```typescript
import { createAction } from 'nango';
import * as z from 'zod';

export default createAction({
    description: 'Creates a GitHub issue',
    version: '1.0.0',
    input: z.object({ owner: z.string(), repo: z.string(), title: z.string(), body: z.string().optional() }),
    output: z.object({ id: z.number(), url: z.string().url() }),
    exec: async (nango, input) => {
        const response = await nango.post({
            endpoint: `/repos/${input.owner}/${input.repo}/issues`,
            data: { title: input.title, body: input.body }
        });
        return { id: response.data.id, url: response.data.html_url };
    }
});
```

A sync (scheduled, saves records into Nango's cache):

```typescript
import { createSync } from 'nango';
import * as z from 'zod';

const Contact = z.object({ id: z.string(), email: z.string().optional(), updatedAt: z.string() });

export default createSync({
    description: 'Syncs HubSpot contacts',
    version: '1.0.0',
    frequency: 'every hour',
    autoStart: true,
    models: { Contact },
    exec: async (nango) => {
        for await (const page of nango.paginate<any>({
            endpoint: '/crm/v3/objects/contacts',
            paginate: { type: 'cursor', cursor_path_in_response: 'paging.next.after', cursor_name_in_request: 'after', response_path: 'results', limit: 100 }
        })) {
            await nango.batchSave(
                page.map((c) => ({ id: c.id, email: c.properties?.email, updatedAt: c.updatedAt })),
                'Contact'
            );
        }
    }
});
```

Inside functions the connection is implicit: call `nango.get/post/paginate` without `connectionId`. Check the provider's real cursor fields in its API reference before setting the `paginate` options.

### 7. Call functions and read synced data from your backend
```typescript
const issue = await nango.triggerAction('github', connectionId, 'create-issue', {
    owner: 'acme-labs', repo: 'billing-api', title: 'Invoice PDF is blank', body: 'Seen on invoice 2041'
});

const { records, next_cursor } = await nango.listRecords({
    providerConfigKey: 'hubspot', connectionId, model: 'Contact', limit: 100
});
```

## Examples

### Example 1: "Let customers connect their HubSpot and list their contacts"
Steps: user creates the `hubspot` integration and webhook in the dashboard; you add `createSessionToken` (step 2), the frontend button (step 3), the webhook handler (step 4), then:

```typescript
app.get('/api/contacts', async (req, res) => {
    const connectionId = await getConnectionId(req.user.orgId);
    const r = await nango.get({ endpoint: '/crm/v3/objects/contacts', params: { limit: 5 }, providerConfigKey: 'hubspot', connectionId });
    res.json(r.data.results);
});
```

Result: a customer clicks Connect, completes HubSpot OAuth, your webhook stores the connection ID, and `/api/contacts` returns their five contacts; you never handled a token.

### Example 2: "Create an issue in the customer's GitHub repo from my agent"
```bash
cd nango-integrations
nango create github create-issue
nango dryrun create-issue 'a1b2c3d4-0000-4000-8000-000000000000' -e dev --input '{"owner":"acme-labs","repo":"billing-api","title":"Invoice PDF is blank"}'
nango deploy dev
```

Result: the dry run prints the action output (id and url of the new issue); after deploy, `nango.triggerAction('github', connectionId, 'create-issue', {...})` runs it with that customer's token. Dry runs and deploys need an environment secret key and a real connection.

## Guidelines
- Keep the API key server-side. The frontend only ever sees a session token, which expires; mint a new one per authorization attempt.
- Store `connectionId` yourself, keyed to your user or organization. Do not delete and recreate a connection to fix auth; re-authorize instead, which keeps its data and ID.
- `providerConfigKey` is the integration's unique key from the dashboard (for example `hubspot`), not the provider name.
- Use a custom OAuth callback URL on your own domain (a 308 redirect to Nango's callback) before real users connect with your own OAuth app; changing it later can break flows.
- Catalog actions can change under you. For deterministic code, `nango pull` them into your project and deploy your copy.
- Make write actions idempotent before using async execution or retries.
- Not a fit: one-off scripts against your own single account (call the API directly), or when you must keep all credentials inside your own infrastructure without an Enterprise self-hosting plan.
