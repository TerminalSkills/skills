---
name: zoho
description: >-
  Integrate and automate Zoho products. Use when a user asks to work with Zoho
  CRM, Zoho Books, Zoho Desk, Zoho Projects, Zoho Mail, or Zoho Creator, build
  custom integrations via Zoho APIs, automate workflows with Deluge scripting,
  sync data between Zoho apps and external systems, manage leads and deals,
  automate invoicing, build custom Zoho Creator apps, set up webhooks, or manage
  Zoho organization settings. Covers Zoho CRM, Books, Desk, Projects, Creator,
  and cross-product integrations.
license: Apache-2.0
compatibility: 'Any HTTP client (REST APIs), Deluge for serverless scripting'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags:
    - zoho
    - crm
    - zoho-crm
    - zoho-books
    - automation
---

# Zoho

## Overview

Integrate and automate across the Zoho ecosystem — CRM, Books, Desk, Projects, Creator, and more. This skill covers OAuth2 authentication, the Zoho CRM API v8 (leads, contacts, deals, custom modules), Zoho Books (invoices, payments, expenses), Zoho Desk (tickets, agents), Deluge serverless scripting for custom automation, webhooks, and cross-product data synchronization.

## Instructions

### Step 1: Authentication — OAuth2

Register an app at https://api-console.zoho.com/. All Zoho APIs use OAuth2.

```bash
# Self Client (server-to-server): in api-console.zoho.com create a Self Client, then generate a grant code
# for these scopes (the code is valid only a few minutes, exchange it at once):
#   ZohoCRM.modules.ALL,ZohoCRM.coql.READ,ZohoBooks.fullaccess.all,Desk.tickets.ALL
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "grant_type=authorization_code" -d "client_id=$ZOHO_CLIENT_ID" \
  -d "client_secret=$ZOHO_CLIENT_SECRET" -d "code=$ZOHO_GRANT_CODE"
```

The response holds `access_token` (valid 1 hour), a long-lived `refresh_token` (store it as a secret) and `api_domain`. Use that `api_domain` as the base URL of CRM calls instead of hard-coding it.

**Token refresh & API helper:**
```typescript
async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
  });
  return (await res.json()).access_token;
}

async function zoho(method: string, url: string, token: string, body?: any, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(url, {
    method, headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json", ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${await res.text()}`);
  return res.json();
}
```

Data centers: Accounts and API hosts share one suffix in the US `.com`, EU `.eu`, IN `.in`, AU `.com.au`, JP `.jp` and CN `.com.cn` regions (for example `accounts.zoho.eu`, `www.zohoapis.eu`, `desk.zoho.eu`). Canada is the exception: `accounts.zohocloud.ca`, `www.zohoapis.ca`, `desk.zohocloud.ca`.

### Step 2: Zoho CRM — Leads, Contacts, Deals

```typescript
const CRM = "https://www.zohoapis.com/crm/v8";

// Create a lead (one POST may carry up to 100 records)
await zoho("POST", `${CRM}/Leads`, token, {
  data: [{ First_Name: "Marta", Last_Name: "Schmidt", Email: "marta@startup.io",
    Company: "TechStart GmbH", Phone: "+49-30-12345678", Lead_Source: "Web Form", Annual_Revenue: 500000 }],
  trigger: ["workflow"], // omit to run all automations; [] runs none
});

// COQL query (SQL-like; needs the ZohoCRM.coql.READ scope; LIMIT max 200 per call)
const results = await zoho("POST", `${CRM}/coql`, token, {
  select_query: `SELECT Last_Name, Email, Company FROM Leads
    WHERE Lead_Source = 'Web Form' AND Created_Time > '2026-01-01T00:00:00+00:00'
    ORDER BY Created_Time DESC LIMIT 0, 100`
});

// Update a deal
await zoho("PUT", `${CRM}/Deals`, token, {
  data: [{ id: "5725767000001843011", Stage: "Closed Won", Amount: 75000, Closing_Date: "2026-03-31" }],
});

// Convert lead to contact + deal
await zoho("POST", `${CRM}/Leads/${leadId}/actions/convert`, token, {
  data: [{ Deals: { Deal_Name: "TechStart Enterprise", Amount: 50000, Stage: "Qualification" } }],
});

// Bulk insert (up to 100 per request)
await zoho("POST", `${CRM}/Leads`, token, {
  data: contacts.map(c => ({ First_Name: c.firstName, Last_Name: c.lastName, Email: c.email, Company: c.company })),
  trigger: ["workflow"],
});
```

### Step 3: Zoho Books — Invoicing & Accounting

```typescript
const BOOKS = "https://www.zohoapis.com/books/v3";
const ORG_ID = process.env.ZOHO_BOOKS_ORG_ID!; // from GET /organizations

// Create invoice
const invoice = await zoho("POST", `${BOOKS}/invoices?organization_id=${ORG_ID}`, token, {
  customer_id: customerId, date: "2026-02-18", payment_terms: 30,
  line_items: [
    { name: "Enterprise License — Annual", rate: 50000, quantity: 1, tax_id: "982000000566007" },
    { name: "Implementation Support (40h)", rate: 150, quantity: 40 },
  ],
});

// Send invoice by email
await zoho("POST", `${BOOKS}/invoices/${invoice.invoice.invoice_id}/email?organization_id=${ORG_ID}`, token, {
  to_mail_ids: ["marta@techstart.io"], subject: "Your Invoice",
});

// Record payment
await zoho("POST", `${BOOKS}/customerpayments?organization_id=${ORG_ID}`, token, {
  customer_id: customerId, payment_mode: "Bank Transfer", amount: 56000, date: "2026-03-15",
  invoices: [{ invoice_id: invoice.invoice.invoice_id, amount_applied: 56000 }],
});

// List unpaid invoices
const unpaid = await zoho("GET", `${BOOKS}/invoices?organization_id=${ORG_ID}&status=unpaid&sort_column=due_date`, token);
```

### Step 4: Zoho Desk — Support Tickets

```typescript
const DESK = "https://desk.zoho.com/api/v1";
// every Desk call except /organizations needs the orgId header (GET /organizations lists yours)
const DESK_HDR = { orgId: process.env.ZOHO_DESK_ORG_ID! };

await zoho("POST", `${DESK}/tickets`, token, {
  subject: "Cannot access dashboard after update", departmentId: "1892000000006907", contactId: "1892000000042032",
  channel: "Email", priority: "High", status: "Open", category: "Technical",
}, DESK_HDR);

await zoho("POST", `${DESK}/tickets/${ticketId}/comments`, token, {
  content: "Root cause identified. Fix deploying in 2 hours.", isPublic: false,
}, DESK_HDR);

await zoho("PATCH", `${DESK}/tickets/${ticketId}`, token, { status: "In Progress", assigneeId: "1892000000056007" }, DESK_HDR);
```

### Step 5: Deluge Scripting

**Auto-create invoice when deal closes (CRM → Books).** Create the `zoho_books` and CRM connections under Setup → Developer Hub → Connections first, and replace `ORG_ID` with your Books organization id:
```deluge
// Custom function attached to a CRM workflow rule; the rule passes the deal id as `dealId`
void createInvoiceFromDeal(string dealId)
{
headers = Map(); headers.put("Content-Type", "application/json");
deal = zoho.crm.getRecordById("Deals", dealId);
contact = zoho.crm.getRecordById("Contacts", deal.get("Contact_Name").get("id"));

// Find or create Books customer
searchResp = invokeurl [url: "https://www.zohoapis.com/books/v3/contacts?organization_id=ORG_ID&email=" + contact.get("Email")
  type: GET connection: "zoho_books"];

if (searchResp.get("contacts").size() == 0) {
  customerData = Map(); customerData.put("contact_name", deal.get("Account_Name").get("name"));
  createResp = invokeurl [url: "https://www.zohoapis.com/books/v3/contacts?organization_id=ORG_ID"
    type: POST parameters: customerData.toString() headers: headers connection: "zoho_books"];
  booksContactId = createResp.get("contact").get("contact_id");
} else { booksContactId = searchResp.get("contacts").get(0).get("contact_id"); }

// Create invoice
lineItems = List(); item = Map();
item.put("name", deal.get("Deal_Name")); item.put("rate", deal.get("Amount")); item.put("quantity", 1);
lineItems.add(item);
invoiceData = Map(); invoiceData.put("customer_id", booksContactId); invoiceData.put("line_items", lineItems);
invokeurl [url: "https://www.zohoapis.com/books/v3/invoices?organization_id=ORG_ID"
  type: POST parameters: invoiceData.toString() headers: headers connection: "zoho_books"];
}
```

### Step 6: Webhooks & Reporting

**CRM webhook** (Setup → Automation → Webhooks):
```
URL: https://your-server.com/zoho/deal-closed
Parameters: send the Deal's id, name and amount as deal_id, name and amount, and add the custom header x-webhook-secret (see the handler below).
```

**Webhook handler** (add a secret as a custom parameter or header in the webhook definition and reject requests that lack it):
```typescript
app.post("/zoho/deal-closed", (req, res) => {
  if (req.get("x-webhook-secret") !== process.env.ZOHO_WEBHOOK_SECRET) return res.sendStatus(401);
  const { deal_id, name, amount } = req.body;
  notifySlack(`Deal won: ${name} — $${amount}`);
  syncToERP(deal_id);
  res.sendStatus(200);
});
```

**CRM analytics with COQL:**
```typescript
const revenue = await zoho("POST", `${CRM}/coql`, token, {
  select_query: `SELECT Stage, SUM(Amount) as Total_Amount, COUNT(id) as Deal_Count
    FROM Deals WHERE Closing_Date BETWEEN '2026-01-01' AND '2026-12-31' GROUP BY Stage`
});
```

## Examples

### Example 1: Lead-to-invoice pipeline across CRM and Books

**User prompt:** "When a deal closes as won in Zoho CRM, automatically create the customer in Zoho Books if they don't exist, generate an invoice with the deal amount, and email it to the contact. Show me how to set this up with Deluge."

The agent will write a Deluge workflow function triggered on Deal stage change to "Closed Won". It will fetch the deal and contact details from CRM, search Zoho Books for a customer matching the contact email, create one if not found, build an invoice with the deal name and amount as a line item, and use the Books API to email the invoice to the contact's email address. The full Deluge script will use `invokeurl` with the `zoho_books` connection for cross-product API calls.

### Example 2: Multi-channel support dashboard with ticket escalation

**User prompt:** "Set up automated ticket escalation in Zoho Desk: any open ticket past its due date should be bumped to Urgent priority, the assigned agent should get a Slack notification, and I want a daily COQL report showing deal pipeline totals by stage."

The agent will write a Deluge scheduled function that runs daily, queries Zoho Desk for open tickets with due dates before today, patches each to Urgent priority, and sends the agent a Slack notification via webhook with the ticket number and subject. For the pipeline report, it will build a COQL query that groups deals by Stage with SUM(Amount) and COUNT(id), filtered to the current year, and format the results as a summary table.

## Guidelines

- **Use the correct data center URL** — Zoho routes by region (US `.com`, EU `.eu`, IN `.in`, AU `.com.au`, JP `.jp`, CN `.com.cn`; Canada uses `zohocloud.ca` for Accounts and Desk but `zohoapis.ca` for the CRM and Books APIs); tokens from one data center do not work on another, so take `api_domain` from the token response.
- **Pin the CRM API version in the URL** (`/crm/v8/`); older versions such as v2 are superseded, and request fields by API name.
- **Refresh tokens before they expire** — Zoho access tokens last 1 hour; implement automatic refresh using the stored refresh token and handle 401 responses as a trigger to re-authenticate.
- **Limit bulk inserts to 100 records** — the CRM API caps batch creates/updates at 100 records per request; split larger datasets into chunks and add a short delay between batches. A batch can return HTTP 207 (partial success), so read the per-record `status` in the response.
- **Use COQL over search for complex queries** — COQL supports aggregation, GROUP BY, joins through lookups and multi-field filtering that the basic search API cannot handle; it returns up to 200 rows per call (`LIMIT offset, count`; pagination reaches 100,000 rows), and larger exports belong to the Bulk Read API.
- **Test Deluge scripts in sandbox first** — Deluge errors in production workflows can silently break automations; use the Zoho Developer Console sandbox to test before deploying to live.
- **Know what `trigger` does** — if you omit it, the automations tied to the API call run; `trigger: []` skips workflows, so pass `[]` for bulk imports that should not fire emails.
