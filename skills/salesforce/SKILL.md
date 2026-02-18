---
name: salesforce
description: >-
  Build integrations and automations with Salesforce. Use when a user asks to
  work with Salesforce CRM, manage leads, contacts, opportunities, and accounts,
  build SOQL/SOSL queries, create Apex triggers and classes, configure Flows,
  integrate via REST/SOAP/Bulk APIs, build Lightning Web Components, set up
  Salesforce DX projects, manage deployments, work with Platform Events,
  build Connected Apps, or automate Salesforce workflows. Covers Sales Cloud,
  Service Cloud, APIs, Apex, LWC, and DevOps.
license: Apache-2.0
compatibility: "Any HTTP client (REST/SOAP APIs), Salesforce CLI (sf/sfdx), Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: crm
  tags: ["salesforce", "crm", "apex", "soql", "lightning", "sales-cloud", "api"]
---

# Salesforce

## Overview

Build on the Salesforce platform — the world's largest CRM. This skill covers REST and Bulk API integration, SOQL/SOSL queries, Apex triggers and classes, Flow automation, Lightning Web Components, Platform Events for real-time messaging, Connected Apps for OAuth2, Salesforce DX for source-driven development, and deployment pipelines. Suitable for CRM integrations, custom business logic, and extending Salesforce with external systems.

## Instructions

### Step 1: Authentication — Connected App & OAuth2

**Create a Connected App** (Setup → App Manager → New Connected App):
- Enable OAuth Settings
- Callback URL: `https://your-app.com/callback` (or `https://login.salesforce.com/services/oauth2/success`)
- Scopes: `api`, `refresh_token`, `full`

**Server-to-server (JWT Bearer Flow):**
```bash
# Generate certificate
openssl req -x509 -sha256 -nodes -days 365 -newkey rsa:2048 \
  -keyout server.key -out server.crt

# Upload server.crt to Connected App → Digital Certificates
```

```typescript
import jwt from "jsonwebtoken";
import fs from "fs";

const privateKey = fs.readFileSync("server.key", "utf-8");

async function getSalesforceToken(clientId: string, username: string) {
  const token = jwt.sign({
    iss: clientId,
    sub: username,
    aud: "https://login.salesforce.com",
    exp: Math.floor(Date.now() / 1000) + 300,
  }, privateKey, { algorithm: "RS256" });

  const res = await fetch("https://login.salesforce.com/services/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: token,
    }),
  });
  const data = await res.json();
  return { accessToken: data.access_token, instanceUrl: data.instance_url };
}
```

**Username-password flow** (dev/testing):
```typescript
async function loginPassword(clientId: string, clientSecret: string, username: string, password: string) {
  const res = await fetch("https://login.salesforce.com/services/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: clientId,
      client_secret: clientSecret,
      username,
      password: password + "SECURITY_TOKEN",
    }),
  });
  return res.json();
}
```

**API helper:**
```typescript
async function sf(method: string, path: string, token: string, instanceUrl: string, body?: any) {
  const res = await fetch(`${instanceUrl}/services/data/v60.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`SF ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
```

### Step 2: SOQL & SOSL Queries

**SOQL (Salesforce Object Query Language):**
```typescript
// Simple query
const leads = await sf("GET",
  `/query?q=${encodeURIComponent("SELECT Id, Name, Email, Company, Status FROM Lead WHERE Status = 'Open' ORDER BY CreatedDate DESC LIMIT 100")}`,
  token, instanceUrl
);

// Query with relationships
const opps = await sf("GET",
  `/query?q=${encodeURIComponent(`
    SELECT Id, Name, Amount, StageName, CloseDate,
           Account.Name, Account.Industry,
           Owner.Name,
           (SELECT Id, Subject, Status FROM Tasks WHERE Status != 'Completed')
    FROM Opportunity
    WHERE StageName NOT IN ('Closed Won', 'Closed Lost')
      AND Amount > 50000
    ORDER BY CloseDate ASC
  `)}`, token, instanceUrl
);

// Aggregate query
const summary = await sf("GET",
  `/query?q=${encodeURIComponent(`
    SELECT StageName, COUNT(Id) cnt, SUM(Amount) total
    FROM Opportunity
    WHERE CloseDate = THIS_FISCAL_YEAR
    GROUP BY StageName
  `)}`, token, instanceUrl
);

// Paginate large results
let url = `/query?q=${encodeURIComponent("SELECT Id, Name FROM Contact")}`;
const allRecords = [];
while (url) {
  const data = await sf("GET", url, token, instanceUrl);
  allRecords.push(...data.records);
  url = data.nextRecordsUrl || null;
}
```

**SOSL (Salesforce Object Search Language):**
```typescript
const search = await sf("GET",
  `/search?q=${encodeURIComponent("FIND {TechStart} IN ALL FIELDS RETURNING Lead(Name, Email), Contact(Name, Email), Account(Name)")}`,
  token, instanceUrl
);
```

### Step 3: REST API — CRUD Operations

**Create records:**
```typescript
// Create an Account
const account = await sf("POST", "/sobjects/Account", token, instanceUrl, {
  Name: "TechStart GmbH",
  Industry: "Technology",
  BillingCity: "Berlin",
  BillingCountry: "Germany",
  Website: "https://techstart.io",
  NumberOfEmployees: 75,
  AnnualRevenue: 5000000,
});
const accountId = account.id;

// Create a Contact linked to Account
const contact = await sf("POST", "/sobjects/Contact", token, instanceUrl, {
  FirstName: "Marta",
  LastName: "Schmidt",
  Email: "marta@techstart.io",
  Phone: "+49-30-12345678",
  AccountId: accountId,
  Title: "CTO",
});

// Create an Opportunity
const opp = await sf("POST", "/sobjects/Opportunity", token, instanceUrl, {
  Name: "TechStart — Enterprise License",
  AccountId: accountId,
  StageName: "Qualification",
  Amount: 150000,
  CloseDate: "2026-06-30",
  Type: "New Business",
  LeadSource: "Web",
});
```

**Update:**
```typescript
await sf("PATCH", `/sobjects/Opportunity/${oppId}`, token, instanceUrl, {
  StageName: "Negotiation/Review",
  Amount: 175000,
});
```

**Upsert (by external ID):**
```typescript
await sf("PATCH", `/sobjects/Account/External_ID__c/TECHSTART-001`, token, instanceUrl, {
  Name: "TechStart GmbH",
  Industry: "Technology",
});
```

**Delete:**
```typescript
await sf("DELETE", `/sobjects/Account/${accountId}`, token, instanceUrl);
```

**Composite API (up to 25 requests in one call):**
```typescript
const composite = await sf("POST", "/composite", token, instanceUrl, {
  allOrNone: true,
  compositeRequest: [
    {
      method: "POST",
      url: "/services/data/v60.0/sobjects/Account",
      referenceId: "newAccount",
      body: { Name: "NewCo" },
    },
    {
      method: "POST",
      url: "/services/data/v60.0/sobjects/Contact",
      referenceId: "newContact",
      body: {
        LastName: "Doe",
        AccountId: "@{newAccount.id}",
      },
    },
  ],
});
```

### Step 4: Bulk API 2.0

For large data operations (thousands/millions of records):

```typescript
// Create bulk job
const job = await sf("POST", "/jobs/ingest", token, instanceUrl, {
  object: "Contact",
  operation: "upsert",
  externalIdFieldName: "Email",
  contentType: "CSV",
  lineEnding: "LF",
});

// Upload CSV data
const csv = `FirstName,LastName,Email,AccountId
Marta,Schmidt,marta@techstart.io,${accountId}
Dani,Müller,dani@techstart.io,${accountId}`;

await fetch(`${instanceUrl}/services/data/v60.0/jobs/ingest/${job.id}/batches`, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "text/csv",
  },
  body: csv,
});

// Close job (start processing)
await sf("PATCH", `/jobs/ingest/${job.id}`, token, instanceUrl, {
  state: "UploadComplete",
});

// Check job status
const status = await sf("GET", `/jobs/ingest/${job.id}`, token, instanceUrl);
console.log(`State: ${status.state}, Processed: ${status.numberRecordsProcessed}, Failed: ${status.numberRecordsFailed}`);

// Get failed records
if (status.numberRecordsFailed > 0) {
  const failed = await fetch(`${instanceUrl}/services/data/v60.0/jobs/ingest/${job.id}/failedResults`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(await failed.text());
}
```

### Step 5: Apex — Server-Side Logic

**Apex trigger (auto-create task on new opportunity):**
```apex
trigger OpportunityTrigger on Opportunity (after insert) {
    List<Task> tasks = new List<Task>();
    
    for (Opportunity opp : Trigger.new) {
        if (opp.Amount >= 100000) {
            tasks.add(new Task(
                Subject = 'High-value deal review: ' + opp.Name,
                WhatId = opp.Id,
                OwnerId = opp.OwnerId,
                ActivityDate = Date.today().addDays(3),
                Priority = 'High',
                Status = 'Not Started',
                Description = 'Review and prepare proposal for ' + opp.Name + ' ($' + opp.Amount + ')'
            ));
        }
    }
    
    if (!tasks.isEmpty()) {
        insert tasks;
    }
}
```

**Apex REST endpoint (custom API):**
```apex
@RestResource(urlMapping='/custom/deals/*')
global class DealAPI {
    
    @HttpGet
    global static Map<String, Object> getActiveDealsSummary() {
        AggregateResult[] results = [
            SELECT StageName, COUNT(Id) cnt, SUM(Amount) total
            FROM Opportunity
            WHERE IsClosed = false
            GROUP BY StageName
        ];
        
        List<Map<String, Object>> stages = new List<Map<String, Object>>();
        for (AggregateResult ar : results) {
            stages.add(new Map<String, Object>{
                'stage' => ar.get('StageName'),
                'count' => ar.get('cnt'),
                'total' => ar.get('total')
            });
        }
        
        return new Map<String, Object>{
            'stages' => stages,
            'generatedAt' => Datetime.now()
        };
    }
    
    @HttpPost
    global static String createDealWithContact() {
        RestRequest req = RestContext.request;
        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(req.requestBody.toString());
        
        Account acc = new Account(Name = (String) body.get('company'));
        insert acc;
        
        Contact con = new Contact(
            FirstName = (String) body.get('firstName'),
            LastName = (String) body.get('lastName'),
            Email = (String) body.get('email'),
            AccountId = acc.Id
        );
        insert con;
        
        Opportunity opp = new Opportunity(
            Name = acc.Name + ' - Deal',
            AccountId = acc.Id,
            StageName = 'Qualification',
            Amount = (Decimal) body.get('amount'),
            CloseDate = Date.today().addMonths(3)
        );
        insert opp;
        
        return opp.Id;
    }
}
```

**Call custom Apex REST from external system:**
```typescript
const summary = await sf("GET", "/services/apexrest/custom/deals", token, instanceUrl);
```

### Step 6: Platform Events (Real-Time)

**Define a Platform Event** (Setup → Platform Events → New):
- Label: Deal Closed Event
- API Name: `Deal_Closed__e`
- Fields: `Deal_Id__c` (Text), `Amount__c` (Number), `Account_Name__c` (Text)

**Publish from Apex:**
```apex
Deal_Closed__e event = new Deal_Closed__e(
    Deal_Id__c = opp.Id,
    Amount__c = opp.Amount,
    Account_Name__c = opp.Account.Name
);
EventBus.publish(event);
```

**Subscribe from external system (CometD/Streaming API):**
```typescript
import { Faye } from "faye";

const client = new Faye.Client(`${instanceUrl}/cometd/60.0`);
client.setHeader("Authorization", `Bearer ${token}`);

client.subscribe("/event/Deal_Closed__e", (message: any) => {
  console.log("Deal closed:", message.payload);
  // Trigger downstream: update ERP, notify Slack, etc.
});
```

### Step 7: Salesforce DX & Deployments

**Set up SFDX project:**
```bash
# Install Salesforce CLI
npm install -g @salesforce/cli

# Create project
sf project generate --name my-project
cd my-project

# Authorize org
sf org login web --alias myorg --instance-url https://login.salesforce.com

# Pull metadata
sf project retrieve start --target-org myorg

# Deploy changes
sf project deploy start --source-dir force-app --target-org myorg

# Run tests
sf apex test run --target-org myorg --code-coverage --result-format human
```

**CI/CD with GitHub Actions:**
```yaml
name: Salesforce Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install SF CLI
        run: npm install -g @salesforce/cli
      
      - name: Authenticate
        run: |
          echo "${{ secrets.SF_AUTH_URL }}" > auth.txt
          sf org login sfdx-url --sfdx-url-file auth.txt --alias prod
      
      - name: Deploy
        run: sf project deploy start --source-dir force-app --target-org prod --test-level RunLocalTests
      
      - name: Run Tests
        run: sf apex test run --target-org prod --code-coverage --result-format human
```

### Step 8: Flows (Declarative Automation)

Build automations without code via Setup → Flows.

**Common patterns (configure in Flow Builder):**

**Auto-assign leads by territory:**
- Trigger: Record-Triggered Flow, Lead, After Create
- Decision: Check Lead.State field
- Assignment: Set Lead.OwnerId based on territory mapping
- Update Records: Save the lead

**Opportunity approval process:**
- Trigger: Record-Triggered Flow, Opportunity, Before Update
- Entry condition: StageName changed to "Closed Won" AND Amount > 100000
- Action: Submit for Approval (approval process must exist)
- Email Alert: Notify finance team

**Automated follow-up:**
- Trigger: Scheduled-Triggered Flow
- Get Records: Opportunities where LastActivityDate < 14 days ago AND IsClosed = false
- Loop: For each opportunity
- Create Task: "Follow up — no activity in 14 days"

### Step 9: Integration Patterns

**Sync Salesforce → External Database:**
```typescript
// Outbound Message (Setup → Workflow Rules → Outbound Messages)
// Or use Change Data Capture:
client.subscribe("/data/OpportunityChangeEvent", async (event: any) => {
  const { ChangeEventHeader, ...fields } = event.payload;
  const { changeType, recordIds } = ChangeEventHeader;
  
  if (changeType === "UPDATE" || changeType === "CREATE") {
    for (const id of recordIds) {
      const record = await sf("GET", `/sobjects/Opportunity/${id}`, token, instanceUrl);
      await externalDb.upsert("opportunities", {
        sf_id: id,
        name: record.Name,
        amount: record.Amount,
        stage: record.StageName,
        close_date: record.CloseDate,
        synced_at: new Date(),
      });
    }
  }
});
```

**External system → Salesforce (webhook receiver):**
```typescript
app.post("/webhook/stripe", async (req, res) => {
  const { type, data } = req.body;
  
  if (type === "payment_intent.succeeded") {
    const payment = data.object;
    // Find opportunity by custom field
    const opp = await sf("GET",
      `/query?q=${encodeURIComponent(`SELECT Id FROM Opportunity WHERE Stripe_Payment_ID__c = '${payment.id}'`)}`,
      token, instanceUrl
    );
    
    if (opp.records.length > 0) {
      await sf("PATCH", `/sobjects/Opportunity/${opp.records[0].Id}`, token, instanceUrl, {
        StageName: "Closed Won",
        Payment_Received_Date__c: new Date().toISOString().split("T")[0],
      });
    }
  }
  res.sendStatus(200);
});
```
