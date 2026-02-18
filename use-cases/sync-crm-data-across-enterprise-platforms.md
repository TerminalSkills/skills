---
title: Sync CRM Data Across Enterprise Platforms
slug: sync-crm-data-across-enterprise-platforms
description: "Build a TypeScript middleware that syncs deals, invoices, inventory, and payments across Salesforce, SAP S/4HANA, and Zoho Books with retry logic and Slack alerting."
skills: [salesforce, sap, zoho]
category: crm
tags: [salesforce, zoho, sap, integration, data-sync, automation]
---

# Sync CRM Data Across Enterprise Platforms

## The Problem

Ravi is an integration architect at a mid-size manufacturing company that uses SAP S/4HANA for ERP (production, inventory, finance), Salesforce for the sales team (leads, opportunities, quotes), and Zoho Books for invoicing in their smaller regional offices. Data flows between these systems manually — sales reps copy order details from Salesforce into SAP, and finance re-enters invoices from SAP into Zoho Books. It takes hours per day and errors are frequent.

Ravi needs a middleware service that automatically syncs data across all three platforms: when a deal closes in Salesforce, it creates a sales order in SAP and an invoice in Zoho Books. When SAP updates inventory, it reflects in Salesforce product records. When Zoho Books records a payment, it updates the Salesforce opportunity.

## The Solution

Use the **salesforce**, **sap**, and **zoho** skills to build a Node.js/TypeScript Express server that listens for webhooks and runs scheduled syncs. Four data flows cover the full lifecycle: deal → order → invoice → payment, plus hourly inventory sync. Every operation retries with exponential backoff and alerts Slack on failure.

## Step-by-Step Walkthrough

### 1. Define the requirements

```text
I need to build a sync middleware between Salesforce, SAP S/4HANA, and Zoho Books. Here's the data flow:

1. Salesforce → SAP (Deal closed → Sales Order):
   - When an Opportunity moves to "Closed Won", create a Sales Order in SAP S/4HANA
   - Map Salesforce Account → SAP Business Partner, Opportunity Products → SAP Order Items
   - If the SAP Business Partner doesn't exist, create it first
   - Store the SAP Sales Order number back in Salesforce as a custom field

2. Salesforce → Zoho Books (Deal closed → Invoice):
   - Same trigger: Opportunity "Closed Won"
   - Create an invoice in Zoho Books with the line items from the Opportunity
   - Send the invoice to the customer automatically
   - Store the Zoho Invoice number in Salesforce

3. SAP → Salesforce (Inventory sync):
   - Every hour, sync material stock levels from SAP to Salesforce Product records
   - Update a custom field "Available_Stock__c" on each Product
   - If stock drops below 10 units, flag the product

4. Zoho Books → Salesforce (Payment received):
   - When a payment is recorded in Zoho Books, update the Salesforce Opportunity
   - Set a custom field "Payment_Received__c" = true and "Payment_Date__c"

5. Error handling: Log all sync operations, retry failed operations 3 times with exponential backoff, send Slack alerts on persistent failures.

Use Node.js/TypeScript. Give me the full middleware with all API integrations, error handling, and monitoring.
```

### 2. Set up the project

```bash
mkdir crm-sync && cd crm-sync
npm init -y
npm install express node-cron
npm install -D typescript @types/node @types/express
npx tsc --init
```

```text
crm-sync/
├── src/
│   ├── index.ts        # Express server + route registration
│   ├── clients.ts      # API clients for Salesforce, SAP, Zoho
│   ├── retry.ts        # Retry wrapper + Slack alerting
│   ├── flows/
│   │   ├── deal-closed.ts    # SF → SAP order + Zoho invoice
│   │   ├── inventory.ts      # SAP → SF stock sync (hourly cron)
│   │   └── payment.ts        # Zoho → SF payment update
│   └── types.ts        # Shared interfaces
└── .env                # API credentials (never commit)
```

### 3. Configure environment variables

```bash
# .env — API credentials for all three platforms.
# Each platform uses OAuth2 with different grant types.

# Salesforce (JWT Bearer flow — no user interaction needed)
SF_CLIENT_ID=your_sf_connected_app_client_id
SF_PRIVATE_KEY_PATH=./sf-server.key
SF_USERNAME=integration@company.com
SF_LOGIN_URL=https://login.salesforce.com
SF_INSTANCE_URL=https://company.my.salesforce.com

# SAP S/4HANA (Client Credentials via BTP OAuth)
SAP_BASE_URL=https://my-s4hana.com/sap/opu/odata/sap
SAP_TOKEN_URL=https://tenant.authentication.eu10.hana.ondemand.com/oauth/token
SAP_CLIENT_ID=sap_client_id
SAP_CLIENT_SECRET=sap_client_secret

# Zoho Books (Refresh Token flow — get initial token from Zoho console)
ZOHO_CLIENT_ID=zoho_client_id
ZOHO_CLIENT_SECRET=zoho_client_secret
ZOHO_REFRESH_TOKEN=zoho_refresh_token
ZOHO_ORG_ID=zoho_org_id

# Slack (incoming webhook for failure alerts)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
```

### 4. Build the API clients

```typescript
// src/clients.ts — Authenticated API clients for Salesforce, SAP, and Zoho.
// Each client manages its own OAuth token lifecycle (fetch, cache, refresh).

import jwt from "jsonwebtoken";
import fs from "fs";

// ===== Salesforce (JWT Bearer Token) =====
// Salesforce Connected App uses a signed JWT to get an access token
// without any user interaction — ideal for server-to-server integration.

let sfToken: string;
let sfTokenExpiry = 0;

async function getSFToken(): Promise<string> {
  // Return cached token if it's still valid (tokens last ~60 min)
  if (sfToken && Date.now() < sfTokenExpiry) return sfToken;

  const privateKey = fs.readFileSync(process.env.SF_PRIVATE_KEY_PATH!, "utf-8");

  // Build a JWT assertion: signed proof that we're the Connected App
  const assertion = jwt.sign({
    iss: process.env.SF_CLIENT_ID,      // Connected App consumer key
    sub: process.env.SF_USERNAME,        // Integration user
    aud: process.env.SF_LOGIN_URL,       // Login endpoint (login.salesforce.com)
    exp: Math.floor(Date.now() / 1000) + 300, // 5-minute expiry on the JWT itself
  }, privateKey, { algorithm: "RS256" });

  const res = await fetch(`${process.env.SF_LOGIN_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });
  const data = await res.json();
  sfToken = data.access_token;
  sfTokenExpiry = Date.now() + 3500000; // Refresh ~2 min before actual expiry
  return sfToken;
}

/** Generic Salesforce REST API call. Handles auth, JSON encoding, error checking. */
async function sf(method: string, path: string, body?: any) {
  const token = await getSFToken();
  const res = await fetch(`${process.env.SF_INSTANCE_URL}/services/data/v60.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`SF ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json(); // 204 = success with no body (PATCH)
}

// ===== SAP S/4HANA (Client Credentials via BTP) =====
// SAP on BTP uses standard OAuth2 client_credentials grant.
// The token gives access to OData APIs on the S/4HANA system.

let sapToken: string;
let sapTokenExpiry = 0;

async function getSAPToken(): Promise<string> {
  if (sapToken && Date.now() < sapTokenExpiry) return sapToken;

  const res = await fetch(process.env.SAP_TOKEN_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Basic auth: base64(client_id:client_secret)
      Authorization: "Basic " + Buffer.from(
        `${process.env.SAP_CLIENT_ID}:${process.env.SAP_CLIENT_SECRET}`
      ).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  sapToken = data.access_token;
  sapTokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 60s early
  return sapToken;
}

/** Generic SAP OData API call. All SAP APIs return JSON with a `d` wrapper. */
async function sap(method: string, path: string, body?: any) {
  const token = await getSAPToken();
  const res = await fetch(`${process.env.SAP_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",  // SAP OData defaults to XML without this
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`SAP ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ===== Zoho Books (Refresh Token Flow) =====
// Zoho uses a long-lived refresh token to get short-lived access tokens.
// The refresh token is obtained once via the Zoho developer console.

let zohoToken: string;
let zohoTokenExpiry = 0;

async function getZohoToken(): Promise<string> {
  if (zohoToken && Date.now() < zohoTokenExpiry) return zohoToken;

  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    }),
  });
  const data = await res.json();
  zohoToken = data.access_token;
  zohoTokenExpiry = Date.now() + 3500000; // ~58 min
  return zohoToken;
}

/** Generic Zoho Books API call. Appends organization_id to all requests. */
async function zoho(method: string, path: string, body?: any) {
  const token = await getZohoToken();
  const orgId = process.env.ZOHO_ORG_ID;
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(
    `https://www.zohoapis.com/books/v3${path}${sep}organization_id=${orgId}`,
    {
      method,
      headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  if (!res.ok) throw new Error(`Zoho ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export { sf, sap, zoho };
```

### 5. Build retry logic and Slack alerting

```typescript
// src/retry.ts — Retry wrapper with exponential backoff and Slack alerts.
// Wraps any async function: retries up to 3 times, then alerts Slack.

/** Retry an async operation with exponential backoff (2s, 4s, 8s). */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,         // Human-readable label for logs and alerts
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      console.error(`[${label}] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt === maxRetries) {
        // All retries exhausted — alert the team and rethrow
        await slackAlert(
          `❌ Sync failed after ${maxRetries} retries: ${label}\nError: ${err.message}`
        );
        throw err;
      }
      // Exponential backoff: 2s → 4s → 8s
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw new Error("Unreachable");
}

/** Send a Slack alert via incoming webhook. Fails silently on error. */
async function slackAlert(text: string) {
  try {
    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("Slack alert failed:", e);
  }
}

export { withRetry, slackAlert };
```

### 6. Build Flow 1: Deal Closed → SAP Order + Zoho Invoice

```typescript
// src/flows/deal-closed.ts — Triggered by Salesforce webhook when Opportunity → "Closed Won".
// Creates a Sales Order in SAP, an Invoice in Zoho Books, and writes IDs back to Salesforce.

import { sf, sap, zoho } from "../clients";
import { withRetry } from "../retry";
import { Request, Response } from "express";

export async function handleDealClosed(req: Request, res: Response) {
  res.sendStatus(200); // Acknowledge immediately so Salesforce doesn't retry
  const { opportunityId } = req.body;

  await withRetry(async () => {
    // --- Fetch the full Opportunity with all line items ---
    // SOQL query pulls Account (for billing address) and Products (for order items)
    const opp = await sf("GET",
      `/query?q=${encodeURIComponent(`
        SELECT Id, Name, Amount, Account.Name, Account.BillingCity,
               Account.BillingCountry, Account.BillingStreet, Account.BillingPostalCode,
               (SELECT Id, Name, Quantity, UnitPrice, Product2.ProductCode, Product2.Name
                FROM OpportunityLineItems)
        FROM Opportunity WHERE Id = '${opportunityId}'
      `)}`
    );
    const deal = opp.records[0];
    const accountName = deal.Account.Name;

    // --- SAP: Find or create Business Partner ---
    // SearchTerm1 is a 20-char indexed field SAP uses for fast lookups
    let sapBP;
    const searchResult = await sap("GET",
      `/API_BUSINESS_PARTNER/A_BusinessPartner` +
      `?$filter=SearchTerm1 eq '${accountName.substring(0, 20).toUpperCase()}'&$top=1`
    );

    if (searchResult.d.results.length > 0) {
      sapBP = searchResult.d.results[0].BusinessPartner;
    } else {
      // No match — create a new Business Partner with address from Salesforce
      const created = await sap("POST", "/API_BUSINESS_PARTNER/A_BusinessPartner", {
        BusinessPartnerCategory: "1",  // 1 = Organization
        BusinessPartnerFullName: accountName,
        SearchTerm1: accountName.substring(0, 20).toUpperCase(),
        to_BusinessPartnerAddress: [{
          Country: deal.Account.BillingCountry || "US",
          CityName: deal.Account.BillingCity || "",
          StreetName: deal.Account.BillingStreet || "",
          PostalCode: deal.Account.BillingPostalCode || "",
        }],
      });
      sapBP = created.d.BusinessPartner;
    }

    // --- SAP: Create Sales Order ---
    // Map each Salesforce OpportunityLineItem to an SAP order item.
    // SalesOrderType "OR" = Standard Order in SAP.
    const sapOrder = await sap("POST", "/API_SALES_ORDER_SRV/A_SalesOrder", {
      SalesOrderType: "OR",
      SalesOrganization: "1010",    // Company's sales org in SAP
      DistributionChannel: "10",
      OrganizationDivision: "00",
      SoldToParty: sapBP,
      PurchaseOrderByCustomer: deal.Name,  // Reference back to SF deal name
      to_Item: deal.OpportunityLineItems.records.map((item: any) => ({
        Material: item.Product2.ProductCode,        // Must match SAP material number
        RequestedQuantity: String(item.Quantity),
        NetPriceAmount: String(item.UnitPrice),
        NetPriceCurrency: "USD",
      })),
    });
    const sapOrderId = sapOrder.d.SalesOrder;

    // --- Zoho Books: Find or create Contact ---
    let zohoContactId;
    const zohoSearch = await zoho("GET",
      `/contacts?contact_name=${encodeURIComponent(accountName)}`
    );
    if (zohoSearch.contacts.length > 0) {
      zohoContactId = zohoSearch.contacts[0].contact_id;
    } else {
      const created = await zoho("POST", "/contacts", {
        contact_name: accountName,
        contact_type: "customer",
      });
      zohoContactId = created.contact.contact_id;
    }

    // --- Zoho Books: Create and email the invoice ---
    const invoice = await zoho("POST", "/invoices", {
      customer_id: zohoContactId,
      date: new Date().toISOString().split("T")[0],
      payment_terms: 30,                             // Net 30
      reference_number: `SF-${opportunityId}`,       // Links back to Salesforce
      line_items: deal.OpportunityLineItems.records.map((item: any) => ({
        name: item.Product2.Name,
        quantity: item.Quantity,
        rate: item.UnitPrice,
      })),
    });

    // Auto-send the invoice to the customer
    await zoho("POST", `/invoices/${invoice.invoice.invoice_id}/email`, {
      to_mail_ids: [deal.Account.Email || ""],
      subject: `Invoice for ${deal.Name}`,
      body: "Please find your invoice attached.",
    });

    // --- Write SAP + Zoho IDs back to Salesforce ---
    // Custom fields track which external records correspond to this Opportunity
    await sf("PATCH", `/sobjects/Opportunity/${opportunityId}`, {
      SAP_Order_Number__c: sapOrderId,
      Zoho_Invoice_Number__c: invoice.invoice.invoice_number,
      Sync_Status__c: "Synced",
      Last_Sync_Date__c: new Date().toISOString(),
    });

    console.log(
      `✅ Deal ${deal.Name}: SAP order ${sapOrderId}, ` +
      `Zoho invoice ${invoice.invoice.invoice_number}`
    );
  }, `deal-closed:${opportunityId}`);
}
```

### 7. Build Flow 2: Hourly Inventory Sync (SAP → Salesforce)

```typescript
// src/flows/inventory.ts — Runs every hour via node-cron.
// Pulls stock levels from SAP materials and updates Salesforce Product records.

import cron from "node-cron";
import { sf, sap } from "../clients";
import { withRetry, slackAlert } from "../retry";

/** Start the hourly inventory sync cron job. */
export function startInventorySync() {
  // Run at minute 0 of every hour
  cron.schedule("0 * * * *", async () => {
    console.log("[Inventory] Starting hourly stock sync...");

    await withRetry(async () => {
      // --- Pull all materials with plant-level stock from SAP ---
      // MRPAvailableQuantity is the unrestricted stock per plant
      const materials = await sap("GET",
        "/API_PRODUCT_SRV/A_Product" +
        "?$select=Product,to_Plant/MRPAvailableQuantity" +
        "&$expand=to_Plant&$top=5000"
      );

      // --- Build a lookup map of Salesforce Products by ProductCode ---
      const sfProducts = await sf("GET",
        `/query?q=${encodeURIComponent(
          "SELECT Id, ProductCode, Available_Stock__c FROM Product2 WHERE IsActive = true"
        )}`
      );
      const sfMap = new Map(
        sfProducts.records.map((p: any) => [p.ProductCode, p])
      );

      let updated = 0;
      let lowStock = 0;

      for (const mat of materials.d.results) {
        const sfProduct = sfMap.get(mat.Product);
        if (!sfProduct) continue; // SAP material not mapped to a SF product

        // Sum stock across all plants (a company may have multiple warehouses)
        const totalStock = mat.to_Plant.results.reduce(
          (sum: number, plant: any) =>
            sum + parseFloat(plant.MRPAvailableQuantity || "0"),
          0
        );

        const isLow = totalStock < 10;
        if (isLow) lowStock++;

        // Update the Salesforce Product with current stock level
        await sf("PATCH", `/sobjects/Product2/${sfProduct.Id}`, {
          Available_Stock__c: totalStock,
          Low_Stock_Alert__c: isLow,
          Stock_Last_Updated__c: new Date().toISOString(),
        });
        updated++;
      }

      console.log(`[Inventory] Updated ${updated} products, ${lowStock} low stock alerts`);
      if (lowStock > 0) {
        await slackAlert(
          `⚠️ ${lowStock} products with low stock (<10 units) after SAP sync`
        );
      }
    }, "inventory-sync");
  });
}
```

### 8. Build Flow 3: Payment Received (Zoho → Salesforce)

```typescript
// src/flows/payment.ts — Triggered by Zoho Books webhook when a payment is recorded.
// Finds the linked Salesforce Opportunity via the invoice reference and marks it as paid.

import { sf, zoho } from "../clients";
import { withRetry } from "../retry";
import { Request, Response } from "express";

export async function handlePayment(req: Request, res: Response) {
  res.sendStatus(200);
  const payment = req.body;

  await withRetry(async () => {
    // A single payment can cover multiple invoices
    for (const inv of payment.invoices || []) {
      // Fetch the full invoice to get the reference_number we set earlier
      const invoiceDetail = await zoho("GET", `/invoices/${inv.invoice_id}`);
      const refNumber = invoiceDetail.invoice.reference_number;

      // Our invoices use "SF-<opportunityId>" as the reference — check for that prefix
      if (refNumber?.startsWith("SF-")) {
        const oppId = refNumber.replace("SF-", "");

        await sf("PATCH", `/sobjects/Opportunity/${oppId}`, {
          Payment_Received__c: true,
          Payment_Date__c: payment.date,
          Payment_Amount__c: payment.amount,
          Payment_Method__c: payment.payment_mode,
        });

        console.log(`✅ Payment recorded for Opportunity ${oppId}: $${payment.amount}`);
      }
    }
  }, `payment:${payment.payment_id}`);
}
```

### 9. Wire up the Express server

```typescript
// src/index.ts — Entry point. Registers webhook routes and starts cron jobs.

import express from "express";
import { handleDealClosed } from "./flows/deal-closed";
import { startInventorySync } from "./flows/inventory";
import { handlePayment } from "./flows/payment";

const app = express();
app.use(express.json());

// Salesforce sends here when an Opportunity moves to "Closed Won"
// (configure via Salesforce Outbound Message or Platform Event)
app.post("/webhook/salesforce/deal-closed", handleDealClosed);

// Zoho Books sends here when a payment is recorded
// (configure via Zoho Books → Settings → Webhooks)
app.post("/webhook/zoho/payment", handlePayment);

// Health check endpoint — returns last 50 sync events for monitoring
const syncLog: any[] = [];
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    syncs: syncLog.slice(-50),
  });
});

// Start the hourly SAP → Salesforce inventory sync
startInventorySync();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CRM sync middleware running on port ${PORT}`));
```

### 10. Deploy and test

```bash
# Build and run
npx tsc
node dist/index.js

# Test the deal-closed webhook locally
curl -X POST http://localhost:3000/webhook/salesforce/deal-closed \
  -H "Content-Type: application/json" \
  -d '{"opportunityId": "006xx000001abc"}'

# Test the payment webhook
curl -X POST http://localhost:3000/webhook/zoho/payment \
  -H "Content-Type: application/json" \
  -d '{"payment_id": "123", "amount": 5000, "date": "2026-02-18", "payment_mode": "Bank Transfer", "invoices": [{"invoice_id": "456"}]}'
```

The full bidirectional sync: Salesforce deals trigger SAP orders and Zoho invoices, SAP inventory syncs hourly to Salesforce, and Zoho payments update Salesforce. Every operation retries 3 times with exponential backoff and alerts Slack on failure.
