---
name: zoho
description: >-
  Integrate and automate Zoho products. Use when a user asks to work with
  Zoho CRM, Zoho Books, Zoho Desk, Zoho Projects, Zoho Mail, or Zoho Creator,
  build custom integrations via Zoho APIs, automate workflows with Deluge
  scripting, sync data between Zoho apps and external systems, manage leads
  and deals, automate invoicing, build custom Zoho Creator apps, set up
  webhooks, or manage Zoho organization settings. Covers Zoho CRM, Books,
  Desk, Projects, Creator, and cross-product integrations.
license: Apache-2.0
compatibility: "Any HTTP client (REST APIs), Deluge for serverless scripting"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: crm
  tags: ["zoho", "crm", "zoho-crm", "zoho-books", "automation", "deluge", "erp"]
---

# Zoho

## Overview

Integrate and automate across the Zoho ecosystem — CRM, Books, Desk, Projects, Creator, and more. This skill covers OAuth2 authentication, the Zoho CRM API v2 (leads, contacts, deals, custom modules), Zoho Books (invoices, payments, expenses), Zoho Desk (tickets, agents), Deluge serverless scripting for custom automation, webhooks, and cross-product data synchronization.

## Instructions

### Step 1: Authentication — OAuth2

All Zoho APIs use OAuth2. Register an app at https://api-console.zoho.com/.

**Self-client (server-to-server):**
```bash
# 1. Get grant code (manual, one-time)
# Go to: https://api-console.zoho.com/ → Self Client → Generate Code
# Scope: ZohoCRM.modules.ALL,ZohoBooks.fullaccess.all,ZohoDesk.tickets.ALL

# 2. Exchange for tokens
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=GRANT_CODE" \
  -d "redirect_uri=https://www.zoho.com"

# Response: { access_token, refresh_token, expires_in }
```

**Token refresh helper:**
```typescript
const ZOHO_ACCOUNTS = "https://accounts.zoho.com";

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch(`${ZOHO_ACCOUNTS}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  return data.access_token;
}

// API helper
async function zoho(method: string, url: string, token: string, body?: any) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${await res.text()}`);
  return res.json();
}
```

**Data center URLs:**
- US: `https://www.zohoapis.com`
- EU: `https://www.zohoapis.eu`
- IN: `https://www.zohoapis.in`
- AU: `https://www.zohoapis.com.au`

### Step 2: Zoho CRM — Leads, Contacts, Deals

**Create a lead:**
```typescript
const CRM = "https://www.zohoapis.com/crm/v2";

const lead = await zoho("POST", `${CRM}/Leads`, token, {
  data: [{
    First_Name: "Marta",
    Last_Name: "Schmidt",
    Email: "marta@startup.io",
    Company: "TechStart GmbH",
    Phone: "+49-30-12345678",
    Lead_Source: "Web Form",
    Annual_Revenue: 500000,
    Description: "Interested in enterprise plan",
    // Custom fields
    Industry_Vertical: "SaaS",
    Company_Size: "50-100",
  }],
  trigger: ["workflow", "approval"],
});
console.log("Lead ID:", lead.data[0].details.id);
```

**Search records:**
```typescript
// Search by email
const results = await zoho("GET",
  `${CRM}/Leads/search?email=marta@startup.io`, token
);

// Search with criteria
const deals = await zoho("GET",
  `${CRM}/Deals/search?criteria=(Stage:equals:Negotiation)and(Amount:greater_than:10000)`, token
);

// COQL query (Zoho's SQL-like)
const coql = await zoho("POST", `${CRM}/coql`, token, {
  select_query: `SELECT Last_Name, Email, Company, Annual_Revenue
                 FROM Leads
                 WHERE Lead_Source = 'Web Form' AND Created_Time > '2026-01-01T00:00:00+00:00'
                 ORDER BY Created_Time DESC
                 LIMIT 100`
});
```

**Update a record:**
```typescript
await zoho("PUT", `${CRM}/Deals`, token, {
  data: [{
    id: "DEAL_ID",
    Stage: "Closed Won",
    Amount: 75000,
    Closing_Date: "2026-03-31",
  }],
});
```

**Bulk operations:**
```typescript
// Insert up to 100 records at once
const leads = contacts.map(c => ({
  First_Name: c.firstName,
  Last_Name: c.lastName,
  Email: c.email,
  Company: c.company,
}));

await zoho("POST", `${CRM}/Leads`, token, {
  data: leads, // max 100 per request
  trigger: ["workflow"],
});
```

**Convert lead to contact + deal:**
```typescript
await zoho("POST", `${CRM}/Leads/${leadId}/actions/convert`, token, {
  data: [{
    Deals: {
      Deal_Name: "TechStart Enterprise License",
      Amount: 50000,
      Closing_Date: "2026-06-30",
      Stage: "Qualification",
      Pipeline: "Standard",
    },
    carry_over_tags: { Contacts: ["tag1"], Deals: ["tag1"] },
  }],
});
```

**Notes and attachments:**
```typescript
// Add a note
await zoho("POST", `${CRM}/Deals/${dealId}/Notes`, token, {
  data: [{ Note_Title: "Call Summary", Note_Content: "Discussed pricing. Follow up next week." }],
});
```

### Step 3: Zoho Books — Invoicing & Accounting

```typescript
const BOOKS = "https://www.zohoapis.com/books/v3";
const ORG_ID = "YOUR_ORG_ID"; // from Settings → Organization

// Create a contact (customer)
const customer = await zoho("POST",
  `${BOOKS}/contacts?organization_id=${ORG_ID}`, token, {
  contact_name: "TechStart GmbH",
  company_name: "TechStart GmbH",
  contact_type: "customer",
  billing_address: {
    address: "Friedrichstraße 123",
    city: "Berlin",
    state: "Berlin",
    zip: "10117",
    country: "Germany",
  },
  contact_persons: [{
    first_name: "Marta",
    last_name: "Schmidt",
    email: "marta@techstart.io",
    is_primary_contact: true,
  }],
  payment_terms: 30,
  currency_id: "EUR_CURRENCY_ID",
});

// Create an invoice
const invoice = await zoho("POST",
  `${BOOKS}/invoices?organization_id=${ORG_ID}`, token, {
  customer_id: customer.contact.contact_id,
  date: "2026-02-18",
  payment_terms: 30,
  line_items: [
    {
      name: "Enterprise License — Annual",
      description: "12-month enterprise license",
      rate: 50000,
      quantity: 1,
      tax_id: "TAX_ID",
    },
    {
      name: "Implementation Support",
      description: "40 hours of onboarding support",
      rate: 150,
      quantity: 40,
    },
  ],
  notes: "Thank you for your business!",
  terms: "Payment due within 30 days.",
  is_inclusive_tax: false,
});

// Send invoice by email
await zoho("POST",
  `${BOOKS}/invoices/${invoice.invoice.invoice_id}/email?organization_id=${ORG_ID}`, token, {
  to_mail_ids: ["marta@techstart.io"],
  subject: "Invoice from Our Company",
  body: "Please find your invoice attached.",
});

// Record payment
await zoho("POST",
  `${BOOKS}/customerpayments?organization_id=${ORG_ID}`, token, {
  customer_id: customer.contact.contact_id,
  payment_mode: "Bank Transfer",
  amount: 56000,
  date: "2026-03-15",
  invoices: [{
    invoice_id: invoice.invoice.invoice_id,
    amount_applied: 56000,
  }],
});

// List unpaid invoices
const unpaid = await zoho("GET",
  `${BOOKS}/invoices?organization_id=${ORG_ID}&status=unpaid&sort_column=due_date`, token
);
```

### Step 4: Zoho Desk — Support Tickets

```typescript
const DESK = "https://desk.zoho.com/api/v1";

// Create a ticket
const ticket = await zoho("POST", `${DESK}/tickets`, token, {
  subject: "Cannot access dashboard after update",
  description: "After the latest update, the dashboard returns a 500 error...",
  contactId: "CONTACT_ID",
  departmentId: "DEPT_ID",
  channel: "Email",
  priority: "High",
  status: "Open",
  category: "Technical",
  cf: { cf_product_version: "3.2.1" }, // Custom fields
});

// List tickets with filters
const tickets = await zoho("GET",
  `${DESK}/tickets?status=Open&priority=High&sortBy=createdTime&limit=50`, token
);

// Add a comment
await zoho("POST", `${DESK}/tickets/${ticketId}/comments`, token, {
  content: "Identified the root cause. Fix deploying in 2 hours.",
  isPublic: false, // Internal comment
});

// Update ticket
await zoho("PATCH", `${DESK}/tickets/${ticketId}`, token, {
  status: "In Progress",
  assigneeId: "AGENT_ID",
});
```

### Step 5: Deluge Scripting (Serverless Automation)

Deluge runs inside Zoho — custom functions, workflow rules, buttons.

**Auto-assign leads by region (CRM workflow):**
```deluge
// Trigger: Lead creation
region = ifnull(input.Lead.Country, "");

ownerMap = Map();
ownerMap.put("Germany", "user@company.com");
ownerMap.put("France", "user2@company.com");
ownerMap.put("United States", "user3@company.com");

if (ownerMap.containKey(region)) {
    owner = zoho.crm.getRecords("users", 1, 200).get("users")
        .findElement("email", ownerMap.get(region));
    if (owner != null) {
        update = Map();
        update.put("Owner", owner.get("id"));
        zoho.crm.updateRecord("Leads", input.Lead.get("id"), update);
    }
}
```

**Auto-create invoice when deal closes (CRM → Books):**
```deluge
// Trigger: Deal stage = Closed Won
dealId = input.Deal.get("id");
deal = zoho.crm.getRecordById("Deals", dealId);
contactId = deal.get("Contact_Name").get("id");

// Get contact email from CRM
contact = zoho.crm.getRecordById("Contacts", contactId);
email = contact.get("Email");

// Find or create Books customer
searchResp = invokeurl [
    url: "https://www.zohoapis.com/books/v3/contacts?organization_id=ORG_ID&email=" + email
    type: GET
    connection: "zoho_books"
];

if (searchResp.get("contacts").size() == 0) {
    // Create customer in Books
    customerData = Map();
    customerData.put("contact_name", deal.get("Account_Name").get("name"));
    customerData.put("email", email);
    createResp = invokeurl [
        url: "https://www.zohoapis.com/books/v3/contacts?organization_id=ORG_ID"
        type: POST
        parameters: customerData.toString()
        connection: "zoho_books"
    ];
    booksContactId = createResp.get("contact").get("contact_id");
} else {
    booksContactId = searchResp.get("contacts").get(0).get("contact_id");
}

// Create invoice
lineItems = List();
item = Map();
item.put("name", deal.get("Deal_Name"));
item.put("rate", deal.get("Amount"));
item.put("quantity", 1);
lineItems.add(item);

invoiceData = Map();
invoiceData.put("customer_id", booksContactId);
invoiceData.put("line_items", lineItems);
invoiceData.put("date", zoho.currentdate.toString("yyyy-MM-dd"));

invokeurl [
    url: "https://www.zohoapis.com/books/v3/invoices?organization_id=ORG_ID"
    type: POST
    parameters: invoiceData.toString()
    connection: "zoho_books"
];
```

**Escalate overdue tickets (Desk scheduled function):**
```deluge
// Run daily
overdueTickets = invokeurl [
    url: "https://desk.zoho.com/api/v1/tickets?status=Open&dueDateBefore=" + zoho.currentdate.toString("yyyy-MM-dd'T'HH:mm:ssZ")
    type: GET
    connection: "zoho_desk"
];

for each ticket in overdueTickets.get("data") {
    // Escalate priority
    updateData = Map();
    updateData.put("priority", "Urgent");
    invokeurl [
        url: "https://desk.zoho.com/api/v1/tickets/" + ticket.get("id")
        type: PATCH
        parameters: updateData.toString()
        connection: "zoho_desk"
    ];
    
    // Notify manager
    sendmail [
        from: zoho.adminuserid
        to: "manager@company.com"
        subject: "Overdue Ticket: " + ticket.get("subject")
        message: "Ticket #" + ticket.get("ticketNumber") + " is overdue. Priority escalated to Urgent."
    ];
}
```

### Step 6: Webhooks & External Integrations

**CRM webhook (notify external system on deal close):**
```
CRM → Settings → Automation → Actions → Webhooks → New
URL: https://your-server.com/zoho/deal-closed
Method: POST
Body: {"deal_id":"${Deals.Deal Id}","name":"${Deals.Deal Name}","amount":"${Deals.Amount}","stage":"${Deals.Stage}"}
```

**Webhook handler:**
```typescript
app.post("/zoho/deal-closed", (req, res) => {
  const { deal_id, name, amount, stage } = req.body;
  if (stage === "Closed Won") {
    // Trigger downstream actions
    notifySlack(`🎉 Deal won: ${name} — $${amount}`);
    syncToERP(deal_id);
  }
  res.sendStatus(200);
});
```

**Zoho Creator custom app** (low-code):
```deluge
// Form submission trigger in Creator
// Auto-create CRM lead from custom form
leadData = Map();
leadData.put("Last_Name", input.Name);
leadData.put("Email", input.Email);
leadData.put("Company", input.Company);
leadData.put("Lead_Source", "Zoho Creator Form");

response = zoho.crm.createRecord("Leads", leadData);
input.CRM_Lead_ID = response.get("id");
```

### Step 7: Reporting & Analytics

**CRM analytics:**
```typescript
// Pipeline summary
const pipeline = await zoho("GET",
  `${CRM}/Deals/actions/count?criteria=(Pipeline:equals:Standard)&group_by=Stage`, token
);

// Revenue by month (COQL)
const revenue = await zoho("POST", `${CRM}/coql`, token, {
  select_query: `SELECT Stage, SUM(Amount) as Total_Amount, COUNT(id) as Deal_Count
                 FROM Deals
                 WHERE Closing_Date BETWEEN '2026-01-01' AND '2026-12-31'
                 GROUP BY Stage`
});

// Lead conversion rate
const leads = await zoho("GET",
  `${CRM}/Leads/actions/count?criteria=(Created_Time:greater_than:2026-01-01T00:00:00+00:00)`, token
);
const converted = await zoho("GET",
  `${CRM}/Leads/actions/count?criteria=(Converted:equals:true)and(Created_Time:greater_than:2026-01-01T00:00:00+00:00)`, token
);
```

**Books financial reports:**
```typescript
// Profit & Loss
const pnl = await zoho("GET",
  `${BOOKS}/reports/profitandloss?organization_id=${ORG_ID}&from_date=2026-01-01&to_date=2026-12-31`, token
);

// Aging summary (overdue invoices)
const aging = await zoho("GET",
  `${BOOKS}/reports/receivableaging?organization_id=${ORG_ID}`, token
);
```
