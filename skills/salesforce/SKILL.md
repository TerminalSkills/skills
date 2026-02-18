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
compatibility: 'Any HTTP client (REST/SOAP APIs), Salesforce CLI (sf/sfdx), Node.js 18+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: business
  tags:
    - salesforce
    - crm
    - apex
    - soql
    - lightning
---

# Salesforce

## Overview

Build on the Salesforce platform — the world's largest CRM. This skill covers REST and Bulk API integration, SOQL/SOSL queries, Apex triggers and classes, Flow automation, Platform Events for real-time messaging, Connected Apps for OAuth2, Salesforce DX for source-driven development, and deployment pipelines. Suitable for CRM integrations, custom business logic, and extending Salesforce with external systems.

## Instructions

### Step 1: Authentication — Connected App & OAuth2

Create a Connected App (Setup → App Manager → New Connected App), enable OAuth, set scopes: `api`, `refresh_token`, `full`.

**JWT Bearer Flow (server-to-server):**
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

**API helper:**
```typescript
async function sf(method: string, path: string, token: string, instanceUrl: string, body?: any) {
  const res = await fetch(`${instanceUrl}/services/data/v60.0${path}`, {
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
  StageName: "Qualification", Amount: 150000, CloseDate: "2026-06-30",
});

// Update and upsert
await sf("PATCH", `/sobjects/Opportunity/${oppId}`, token, instanceUrl, { StageName: "Negotiation/Review", Amount: 175000 });
await sf("PATCH", `/sobjects/Account/External_ID__c/TECHSTART-001`, token, instanceUrl, { Name: "TechStart GmbH" });

// Composite API (up to 25 requests in one call)
await sf("POST", "/composite", token, instanceUrl, {
  allOrNone: true,
  compositeRequest: [
    { method: "POST", url: "/services/data/v60.0/sobjects/Account", referenceId: "newAccount", body: { Name: "NewCo" } },
    { method: "POST", url: "/services/data/v60.0/sobjects/Contact", referenceId: "newContact",
      body: { LastName: "Doe", AccountId: "@{newAccount.id}" } },
  ],
});
```

### Step 4: Bulk API 2.0

```typescript
const job = await sf("POST", "/jobs/ingest", token, instanceUrl, {
  object: "Contact", operation: "upsert", externalIdFieldName: "Email", contentType: "CSV",
});
await fetch(`${instanceUrl}/services/data/v60.0/jobs/ingest/${job.id}/batches`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv" },
  body: `FirstName,LastName,Email,AccountId\nMarta,Schmidt,marta@techstart.io,${accountId}`,
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

**Platform Events** — define `Deal_Closed__e` with fields in Setup, publish from Apex with `EventBus.publish(event)`, subscribe externally via CometD Streaming API.

### Step 6: SFDX & CI/CD

```bash
sf project generate --name my-project && cd my-project
sf org login web --alias myorg
sf project retrieve start --target-org myorg
sf project deploy start --source-dir force-app --target-org myorg
sf apex test run --target-org myorg --code-coverage --result-format human
```

**GitHub Actions deploy:**
```yaml
steps:
  - uses: actions/checkout@v4
  - run: npm install -g @salesforce/cli
  - run: echo "${{ secrets.SF_AUTH_URL }}" > auth.txt && sf org login sfdx-url --sfdx-url-file auth.txt --alias prod
  - run: sf project deploy start --source-dir force-app --target-org prod --test-level RunLocalTests
```

### Step 7: Integration Patterns

**Change Data Capture (SF → external):**
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
app.post("/webhook/stripe", async (req, res) => {
  if (req.body.type === "payment_intent.succeeded") {
    const payment = req.body.data.object;
    const opp = await sf("GET",
      `/query?q=${encodeURIComponent(`SELECT Id FROM Opportunity WHERE Stripe_Payment_ID__c = '${payment.id}'`)}`,
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

The agent will subscribe to `/data/OpportunityChangeEvent` via CometD, filter for UPDATE events where StageName changed to "Closed Won", fetch the full record, and upsert it into PostgreSQL. For the inbound flow, it will create an Express endpoint at `/webhook/stripe` that extracts the payment ID from the Stripe event, queries Salesforce for the matching opportunity by custom field `Stripe_Payment_ID__c`, and patches the stage to "Closed Won" with the payment date.

## Guidelines

- **Use the Composite API for related record creation** — creating an Account, Contact, and Opportunity in a single composite call with `@{referenceId.id}` references is faster and ensures atomicity with `allOrNone: true`.
- **Paginate all SOQL queries** — results over 2,000 records return a `nextRecordsUrl`; always loop until it is null to avoid silently missing data.
- **Prefer Bulk API 2.0 for large data loads** — anything over a few hundred records should use the Bulk API with CSV upload to avoid governor limits and API call quotas.
- **Always test Apex with `RunLocalTests`** — Salesforce requires 75% code coverage for production deploys; run `sf apex test run` before every deployment to catch failures early.
- **Sanitize SOQL inputs** — never interpolate user input directly into SOQL strings; use bind variables in Apex or parameterize queries to prevent SOQL injection.
- **Handle CSRF tokens for on-premise S/4HANA** — write operations against on-premise Salesforce instances may require fetching an `X-CSRF-Token` header first; cloud instances using OAuth2 do not need this.
