---
name: salesforce
description: >-
  Build integrations and automations with Salesforce. Use when a user asks to
  work with Salesforce CRM, manage leads, contacts, opportunities, and accounts,
  build SOQL/SOSL queries, create Apex triggers and classes, configure Flows,
  integrate via REST/SOAP/Bulk APIs, build Lightning Web Components, set up
  Salesforce DX projects, manage deployments, work with Platform Events, build
  Connected Apps, or automate Salesforce workflows. Covers Sales Cloud, Service
  Cloud, APIs, Apex, LWC, and DevOps.
license: Apache-2.0
compatibility: 'Any HTTP client (REST/SOAP APIs); Salesforce CLI (sf) 2.x, which needs Node.js 22+; Node.js 18+ for the TypeScript snippets'
metadata:
  author: terminal-skills
  repository: https://github.com/forcedotcom/cli
  version: 1.1.0
  category: business
  tags: "salesforce, crm, apex, soql, lightning"
---

# Salesforce

## Overview

Build on the Salesforce platform — the world's largest CRM. This skill covers REST and Bulk API integration, SOQL/SOSL queries, Apex triggers and classes, Flow automation, Platform Events for real-time messaging, Connected Apps for OAuth2, Salesforce DX for source-driven development, and deployment pipelines. Suitable for CRM integrations, custom business logic, and extending Salesforce with external systems.

## Instructions

### Step 1: Authentication — Connected App & OAuth2

Create a Connected App (Setup → App Manager → New Connected App), enable OAuth, set scopes: `api` and `refresh_token` (add `web` only for browser flows). Avoid `full`, which grants everything the user can do. Server-to-server use needs the JWT flow's certificate uploaded to the app and the app's users pre-authorized. Newer orgs steer new integrations to External Client Apps; the same flows apply there.

**JWT Bearer Flow (server-to-server).** Use `https://test.salesforce.com` as `aud` and token host for sandboxes, or your My Domain URL:
```typescript
import jwt from "jsonwebtoken";
import fs from "fs";

async function getSalesforceToken(clientId: string, username: string) {
  const privateKey = fs.readFileSync("server.key", "utf-8");
  const token = jwt.sign({
    iss: clientId, sub: username, aud: "https://login.salesforce.com",
    exp: Math.floor(Date.now() / 1000) + 300,
  }, privateKey, { algorithm: "RS256" });

  const res = await fetch("https://login.salesforce.com/services/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: token }),
  });
  const data = await res.json();
  return { accessToken: data.access_token, instanceUrl: data.instance_url };
}
```

**API helper.** Pick the version from the highest entry returned by `GET {instanceUrl}/services/data/` and keep it in one place:
```typescript
const API_VERSION = process.env.SF_API_VERSION ?? "60.0";

async function sf(method: string, path: string, token: string, instanceUrl: string, body?: any) {
  const res = await fetch(`${instanceUrl}/services/data/v${API_VERSION}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`SF ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
```

### Step 2: SOQL & SOSL Queries

```typescript
// Query with relationships
const opps = await sf("GET", `/query?q=${encodeURIComponent(`
  SELECT Id, Name, Amount, StageName, CloseDate, Account.Name, Owner.Name,
    (SELECT Id, Subject, Status FROM Tasks WHERE Status != 'Completed')
  FROM Opportunity WHERE StageName NOT IN ('Closed Won','Closed Lost') AND Amount > 50000
  ORDER BY CloseDate ASC`)}`, token, instanceUrl);

// Aggregate
const summary = await sf("GET", `/query?q=${encodeURIComponent(`
  SELECT StageName, COUNT(Id) cnt, SUM(Amount) total FROM Opportunity
  WHERE CloseDate = THIS_FISCAL_YEAR GROUP BY StageName`)}`, token, instanceUrl);

// Paginate large results
let url = `/query?q=${encodeURIComponent("SELECT Id, Name FROM Contact")}`;
const all = [];
while (url) {
  const data = await sf("GET", url, token, instanceUrl);
  all.push(...data.records);
  url = data.nextRecordsUrl || null;
}

// SOSL full-text search
const search = await sf("GET",
  `/search?q=${encodeURIComponent("FIND {TechStart} RETURNING Lead(Name,Email),Contact(Name),Account(Name)")}`,
  token, instanceUrl);
```

### Step 3: REST API — CRUD & Composite

```typescript
// Create Account + Contact + Opportunity
const account = await sf("POST", "/sobjects/Account", token, instanceUrl, {
  Name: "TechStart GmbH", Industry: "Technology", BillingCity: "Berlin", BillingCountry: "Germany",
});
await sf("POST", "/sobjects/Contact", token, instanceUrl, {
  FirstName: "Marta", LastName: "Schmidt", Email: "marta@techstart.io", AccountId: account.id, Title: "CTO",
});
await sf("POST", "/sobjects/Opportunity", token, instanceUrl, {
  Name: "TechStart — Enterprise License", AccountId: account.id,
  StageName: "Qualification", Amount: 150000, CloseDate: "2026-12-31",
});

// Update and upsert
await sf("PATCH", `/sobjects/Opportunity/${oppId}`, token, instanceUrl, { StageName: "Negotiation/Review", Amount: 175000 });
await sf("PATCH", `/sobjects/Account/External_ID__c/TECHSTART-001`, token, instanceUrl, { Name: "TechStart GmbH" });

// Composite API (up to 25 requests in one call)
await sf("POST", "/composite", token, instanceUrl, {
  allOrNone: true,
  compositeRequest: [
    { method: "POST", url: `/services/data/v${API_VERSION}/sobjects/Account`, referenceId: "newAccount", body: { Name: "NewCo" } },
    { method: "POST", url: `/services/data/v${API_VERSION}/sobjects/Contact`, referenceId: "newContact",
      body: { LastName: "Okafor", AccountId: "@{newAccount.id}" } },
  ],
});
```

### Step 4: Bulk API 2.0

An upsert needs an external ID field (a custom field marked External ID); standard `Email` does not qualify.

```typescript
const job = await sf("POST", "/jobs/ingest", token, instanceUrl, {
  object: "Contact", operation: "upsert", externalIdFieldName: "External_ID__c", contentType: "CSV",
});
await fetch(`${instanceUrl}/services/data/v${API_VERSION}/jobs/ingest/${job.id}/batches`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv" },
  body: `FirstName,LastName,External_ID__c,AccountId\nMarta,Schmidt,TECHSTART-C-001,${accountId}`,
});
await sf("PATCH", `/jobs/ingest/${job.id}`, token, instanceUrl, { state: "UploadComplete" });
```

### Step 5: Apex & Platform Events

**Trigger (auto-task on high-value opportunities):**
```apex
trigger OpportunityTrigger on Opportunity (after insert) {
    List<Task> tasks = new List<Task>();
    for (Opportunity opp : Trigger.new) {
        if (opp.Amount >= 100000) {
            tasks.add(new Task(Subject='Review: ' + opp.Name, WhatId=opp.Id,
                OwnerId=opp.OwnerId, ActivityDate=Date.today().addDays(3), Priority='High'));
        }
    }
    if (!tasks.isEmpty()) insert tasks;
}
```

**Custom REST endpoint:**
```apex
@RestResource(urlMapping='/custom/deals/*')
global class DealAPI {
    @HttpGet
    global static Map<String, Object> getActiveDealsSummary() {
        AggregateResult[] results = [SELECT StageName, COUNT(Id) cnt, SUM(Amount) total
            FROM Opportunity WHERE IsClosed = false GROUP BY StageName];
        List<Map<String, Object>> stages = new List<Map<String, Object>>();
        for (AggregateResult ar : results)
            stages.add(new Map<String, Object>{'stage'=>ar.get('StageName'),'count'=>ar.get('cnt'),'total'=>ar.get('total')});
        return new Map<String, Object>{'stages'=>stages, 'generatedAt'=>Datetime.now()};
    }
}
```

Always bulkify triggers (no SOQL or DML inside the loop) and keep one trigger per object. **Platform Events** — define `Deal_Closed__e` with fields in Setup, publish from Apex with `EventBus.publish(event)`, subscribe externally via CometD Streaming API.

### Step 6: SFDX & CI/CD

```bash
sf project generate --name my-project && cd my-project
sf org login web --alias myorg
sf project retrieve start --source-dir force-app --target-org myorg
sf project deploy start --source-dir force-app --target-org myorg
sf apex test run --target-org myorg --test-level RunLocalTests --wait 10 --code-coverage --result-format human
```

**GitHub Actions deploy:**
```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 22 }
  - run: npm install -g @salesforce/cli
  - run: |
      printf '%s' "$SF_AUTH_URL" > "$RUNNER_TEMP/auth.txt"
      sf org login sfdx-url --sfdx-url-file "$RUNNER_TEMP/auth.txt" --alias prod
      rm "$RUNNER_TEMP/auth.txt"
    env:
      SF_AUTH_URL: ${{ secrets.SF_AUTH_URL }}
  - run: sf project deploy start --source-dir force-app --target-org prod --test-level RunLocalTests
```

### Step 7: Integration Patterns

**Change Data Capture (SF → external).** Enable the object under Setup → Change Data Capture. Subscribe with the Pub/Sub API (gRPC, current) or the CometD Streaming API; `client` below stands for a CometD client:
```typescript
client.subscribe("/data/OpportunityChangeEvent", async (event: any) => {
  const { changeType, recordIds } = event.payload.ChangeEventHeader;
  if (changeType === "UPDATE" || changeType === "CREATE") {
    for (const id of recordIds) {
      const record = await sf("GET", `/sobjects/Opportunity/${id}`, token, instanceUrl);
      await externalDb.upsert("opportunities", { sf_id: id, name: record.Name, amount: record.Amount, stage: record.StageName });
    }
  }
});
```

**External webhook → Salesforce (Stripe example):**
```typescript
// Verify the Stripe-Signature header on the raw body first (stripe.webhooks.constructEvent).
app.post("/webhook/stripe", async (req, res) => {
  if (req.body.type === "payment_intent.succeeded") {
    const payment = req.body.data.object;
    const opp = await sf("GET",
      `/query?q=${encodeURIComponent(`SELECT Id FROM Opportunity WHERE Stripe_Payment_ID__c = '${String(payment.id).replace(/['\\]/g, "\\$&")}'`)}`,
      token, instanceUrl);
    if (opp.records.length > 0) {
      await sf("PATCH", `/sobjects/Opportunity/${opp.records[0].Id}`, token, instanceUrl, { StageName: "Closed Won" });
    }
  }
  res.sendStatus(200);
});
```

## Examples

### Example 1: Lead-to-deal pipeline with automated follow-ups

**User prompt:** "Create an Apex trigger that auto-creates a follow-up task when a new opportunity over $100K is created, and write a SOQL query that gives me a pipeline summary grouped by stage with total amounts for this fiscal year."

The agent will write an `after insert` Apex trigger on Opportunity that checks `Amount >= 100000` and creates a Task with 3-day due date, high priority, and the opportunity owner as assignee. It will also build a SOQL aggregate query using `GROUP BY StageName` with `COUNT(Id)` and `SUM(Amount)` filtered to `THIS_FISCAL_YEAR`, and show how to call it via the REST API to get the pipeline summary.

### Example 2: Bi-directional sync between Salesforce and an external order system

**User prompt:** "Set up Change Data Capture to sync closed-won opportunities to our PostgreSQL database in real time, and create an inbound webhook endpoint that updates Salesforce opportunities when Stripe payments succeed."

The agent will subscribe to `/data/OpportunityChangeEvent` via CometD, filter for CREATE and UPDATE events, fetch the full record, and upsert it into PostgreSQL. For the inbound flow, it will create an Express endpoint at `/webhook/stripe` that extracts the payment ID from the Stripe event, queries Salesforce for the matching opportunity by custom field `Stripe_Payment_ID__c`, and patches the stage to "Closed Won".

## Guidelines

- **Use the Composite API for related record creation** — creating an Account, Contact, and Opportunity in a single composite call with `@{referenceId.id}` references is faster and ensures atomicity with `allOrNone: true`.
- **Paginate all SOQL queries** — results over 2,000 records return a `nextRecordsUrl`; always loop until it is null to avoid silently missing data.
- **Prefer Bulk API 2.0 for large data loads** — anything over a few hundred records should use the Bulk API with CSV upload to avoid governor limits and API call quotas.
- **Always test Apex with `RunLocalTests`** — Salesforce requires 75% code coverage for production deploys; run `sf apex test run --wait 10` (without `--wait` it returns a run ID at once) before every deployment to catch failures early.
- **Sanitize SOQL inputs** — never interpolate user input directly into SOQL strings; use bind variables in Apex or parameterize queries to prevent SOQL injection.
- **Respect API limits** — each org has a rolling 24-hour API request allocation; check `GET /limits` and batch with Composite or Bulk before polling in loops.
- **Keep secrets out of code** — the JWT private key, consumer key and auth URL come from a secret store or environment variables, never the repository; use a dedicated integration user with a minimal permission set.
