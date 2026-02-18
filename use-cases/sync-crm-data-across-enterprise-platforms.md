---
title: Sync CRM Data Across Enterprise Platforms
slug: sync-crm-data-across-enterprise-platforms
category: crm
tags: [salesforce, zoho, sap, integration, data-sync, automation]
---

# Sync CRM Data Across Enterprise Platforms

Ravi is an integration architect at a mid-size manufacturing company that uses SAP S/4HANA for ERP (production, inventory, finance), Salesforce for the sales team (leads, opportunities, quotes), and Zoho Books for invoicing in their smaller regional offices. Data flows between these systems manually — sales reps copy order details from Salesforce into SAP, and finance re-enters invoices from SAP into Zoho Books. It takes hours per day and errors are frequent.

Ravi needs a middleware service that automatically syncs data across all three platforms: when a deal closes in Salesforce, it creates a sales order in SAP and an invoice in Zoho Books. When SAP updates inventory, it reflects in Salesforce product records. When Zoho Books records a payment, it updates the Salesforce opportunity.

## Prompt

```text
I need to build a sync middleware between Salesforce, SAP S/4HANA, and Zoho Books. Here's the data flow:

1. **Salesforce → SAP (Deal closed → Sales Order)**:
   - When an Opportunity in Salesforce moves to "Closed Won", automatically create a Sales Order in SAP S/4HANA
   - Map Salesforce Account → SAP Business Partner, Opportunity Products → SAP Order Items
   - If the SAP Business Partner doesn't exist, create it first
   - Store the SAP Sales Order number back in Salesforce as a custom field

2. **Salesforce → Zoho Books (Deal closed → Invoice)**:
   - Same trigger: Opportunity "Closed Won"
   - Create an invoice in Zoho Books with the line items from the Opportunity
   - Send the invoice to the customer automatically
   - Store the Zoho Invoice number in Salesforce

3. **SAP → Salesforce (Inventory sync)**:
   - Every hour, sync material stock levels from SAP to Salesforce Product records
   - Update a custom field "Available_Stock__c" on each Product
   - If stock drops below 10 units, flag the product

4. **Zoho Books → Salesforce (Payment received)**:
   - When a payment is recorded in Zoho Books, update the Salesforce Opportunity
   - Set a custom field "Payment_Received__c" = true and "Payment_Date__c"

5. **Error handling**: Log all sync operations, retry failed operations 3 times with exponential backoff, send Slack alerts on persistent failures.

Use Node.js/TypeScript. Give me the full middleware with all API integrations, error handling, and monitoring.
```

## Agent Response

```text
Here's the complete sync middleware. Single Express app that handles all four data flows with retry logic and monitoring.

## Project Setup

mkdir crm-sync && cd crm-sync
npm init -y
npm install express node-cron
npm install -D typescript @types/node @types/express
npx tsc --init

## Environment (.env)

# Salesforce
SF_CLIENT_ID=your_sf_client_id
SF_PRIVATE_KEY_PATH=./sf-server.key
SF_USERNAME=integration@company.com
SF_LOGIN_URL=https://login.salesforce.com
SF_INSTANCE_URL=https://company.my.salesforce.com

# SAP S/4HANA
SAP_BASE_URL=https://my-s4hana.com/sap/opu/odata/sap
SAP_TOKEN_URL=https://tenant.authentication.eu10.hana.ondemand.com/oauth/token
SAP_CLIENT_ID=sap_client_id
SAP_CLIENT_SECRET=sap_client_secret

# Zoho Books
ZOHO_CLIENT_ID=zoho_client_id
ZOHO_CLIENT_SECRET=zoho_client_secret
ZOHO_REFRESH_TOKEN=zoho_refresh_token
ZOHO_ORG_ID=zoho_org_id

# Slack (alerts)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx

## API Clients (src/clients.ts)

import jwt from "jsonwebtoken";
import fs from "fs";

// ===== Salesforce =====
let sfToken: string;
let sfTokenExpiry = 0;

async function getSFToken(): Promise<string> {
  if (sfToken && Date.now() < sfTokenExpiry) return sfToken;

  const privateKey = fs.readFileSync(process.env.SF_PRIVATE_KEY_PATH!, "utf-8");
  const assertion = jwt.sign({
    iss: process.env.SF_CLIENT_ID,
    sub: process.env.SF_USERNAME,
    aud: process.env.SF_LOGIN_URL,
    exp: Math.floor(Date.now() / 1000) + 300,
  }, privateKey, { algorithm: "RS256" });

  const res = await fetch(`${process.env.SF_LOGIN_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });
  const data = await res.json();
  sfToken = data.access_token;
  sfTokenExpiry = Date.now() + 3500000; // ~58 min
  return sfToken;
}

async function sf(method: string, path: string, body?: any) {
  const token = await getSFToken();
  const res = await fetch(`${process.env.SF_INSTANCE_URL}/services/data/v60.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`SF ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// ===== SAP =====
let sapToken: string;
let sapTokenExpiry = 0;

async function getSAPToken(): Promise<string> {
  if (sapToken && Date.now() < sapTokenExpiry) return sapToken;

  const res = await fetch(process.env.SAP_TOKEN_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${process.env.SAP_CLIENT_ID}:${process.env.SAP_CLIENT_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  sapToken = data.access_token;
  sapTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return sapToken;
}

async function sap(method: string, path: string, body?: any) {
  const token = await getSAPToken();
  const res = await fetch(`${process.env.SAP_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`SAP ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ===== Zoho =====
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
  zohoTokenExpiry = Date.now() + 3500000;
  return zohoToken;
}

async function zoho(method: string, path: string, body?: any) {
  const token = await getZohoToken();
  const orgId = process.env.ZOHO_ORG_ID;
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://www.zohoapis.com/books/v3${path}${sep}organization_id=${orgId}`, {
    method,
    headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Zoho ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export { sf, sap, zoho };

## Retry & Error Handling (src/retry.ts)

async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      console.error(`[${label}] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt === maxRetries) {
        await slackAlert(`❌ Sync failed after ${maxRetries} retries: ${label}\nError: ${err.message}`);
        throw err;
      }
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw new Error("Unreachable");
}

async function slackAlert(text: string) {
  try {
    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) { console.error("Slack alert failed:", e); }
}

## Flow 1: Salesforce → SAP + Zoho (Deal Closed)

// Salesforce webhook handler (Outbound Message or Platform Event)
app.post("/webhook/salesforce/deal-closed", async (req, res) => {
  res.sendStatus(200);
  const { opportunityId } = req.body;

  await withRetry(async () => {
    // Fetch full opportunity with products
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

    // === SAP: Find or create Business Partner ===
    let sapBP;
    const searchResult = await sap("GET",
      `/API_BUSINESS_PARTNER/A_BusinessPartner?$filter=SearchTerm1 eq '${accountName.substring(0,20).toUpperCase()}'&$top=1`
    );

    if (searchResult.d.results.length > 0) {
      sapBP = searchResult.d.results[0].BusinessPartner;
    } else {
      const created = await sap("POST", "/API_BUSINESS_PARTNER/A_BusinessPartner", {
        BusinessPartnerCategory: "1",
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

    // === SAP: Create Sales Order ===
    const sapOrder = await sap("POST", "/API_SALES_ORDER_SRV/A_SalesOrder", {
      SalesOrderType: "OR",
      SalesOrganization: "1010",
      DistributionChannel: "10",
      OrganizationDivision: "00",
      SoldToParty: sapBP,
      PurchaseOrderByCustomer: deal.Name,
      to_Item: deal.OpportunityLineItems.records.map((item: any) => ({
        Material: item.Product2.ProductCode,
        RequestedQuantity: String(item.Quantity),
        NetPriceAmount: String(item.UnitPrice),
        NetPriceCurrency: "USD",
      })),
    });
    const sapOrderId = sapOrder.d.SalesOrder;

    // === Zoho Books: Find or create contact ===
    let zohoContactId;
    const zohoSearch = await zoho("GET", `/contacts?contact_name=${encodeURIComponent(accountName)}`);
    if (zohoSearch.contacts.length > 0) {
      zohoContactId = zohoSearch.contacts[0].contact_id;
    } else {
      const created = await zoho("POST", "/contacts", {
        contact_name: accountName,
        contact_type: "customer",
      });
      zohoContactId = created.contact.contact_id;
    }

    // === Zoho Books: Create and send invoice ===
    const invoice = await zoho("POST", "/invoices", {
      customer_id: zohoContactId,
      date: new Date().toISOString().split("T")[0],
      payment_terms: 30,
      reference_number: `SF-${opportunityId}`,
      line_items: deal.OpportunityLineItems.records.map((item: any) => ({
        name: item.Product2.Name,
        quantity: item.Quantity,
        rate: item.UnitPrice,
      })),
    });

    // Send invoice
    await zoho("POST", `/invoices/${invoice.invoice.invoice_id}/email`, {
      to_mail_ids: [deal.Account.Email || ""],
      subject: `Invoice for ${deal.Name}`,
      body: "Please find your invoice attached.",
    });

    // === Write back to Salesforce ===
    await sf("PATCH", `/sobjects/Opportunity/${opportunityId}`, {
      SAP_Order_Number__c: sapOrderId,
      Zoho_Invoice_Number__c: invoice.invoice.invoice_number,
      Sync_Status__c: "Synced",
      Last_Sync_Date__c: new Date().toISOString(),
    });

    console.log(`✅ Deal ${deal.Name}: SAP order ${sapOrderId}, Zoho invoice ${invoice.invoice.invoice_number}`);
  }, `deal-closed:${opportunityId}`);
});

## Flow 2: SAP → Salesforce (Inventory Sync — hourly)

import cron from "node-cron";

cron.schedule("0 * * * *", async () => {
  console.log("[Inventory] Starting hourly stock sync...");

  await withRetry(async () => {
    // Get all materials from SAP
    const materials = await sap("GET",
      "/API_PRODUCT_SRV/A_Product?$select=Product,to_Plant/MRPAvailableQuantity&$expand=to_Plant&$top=5000"
    );

    // Get Salesforce products mapped by ProductCode
    const sfProducts = await sf("GET",
      `/query?q=${encodeURIComponent("SELECT Id, ProductCode, Available_Stock__c FROM Product2 WHERE IsActive = true")}`
    );
    const sfMap = new Map(sfProducts.records.map((p: any) => [p.ProductCode, p]));

    let updated = 0;
    let lowStock = 0;

    for (const mat of materials.d.results) {
      const sfProduct = sfMap.get(mat.Product);
      if (!sfProduct) continue;

      const totalStock = mat.to_Plant.results.reduce(
        (sum: number, plant: any) => sum + parseFloat(plant.MRPAvailableQuantity || "0"), 0
      );

      const isLow = totalStock < 10;
      if (isLow) lowStock++;

      await sf("PATCH", `/sobjects/Product2/${sfProduct.Id}`, {
        Available_Stock__c: totalStock,
        Low_Stock_Alert__c: isLow,
        Stock_Last_Updated__c: new Date().toISOString(),
      });
      updated++;
    }

    console.log(`[Inventory] Updated ${updated} products, ${lowStock} low stock alerts`);
    if (lowStock > 0) {
      await slackAlert(`⚠️ ${lowStock} products with low stock (<10 units) after SAP sync`);
    }
  }, "inventory-sync");
});

## Flow 3: Zoho Books → Salesforce (Payment)

// Zoho Books webhook (configure in Zoho Books → Settings → Webhooks)
app.post("/webhook/zoho/payment", async (req, res) => {
  res.sendStatus(200);
  const payment = req.body;

  await withRetry(async () => {
    // Find the Salesforce Opportunity by Zoho invoice reference
    for (const inv of payment.invoices || []) {
      const invoiceDetail = await zoho("GET", `/invoices/${inv.invoice_id}`);
      const refNumber = invoiceDetail.invoice.reference_number;

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
});

## Monitoring Endpoint

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    syncs: syncLog.slice(-50), // Last 50 sync events
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CRM sync middleware running on port ${PORT}`));

That covers the full bidirectional sync: Salesforce deals trigger SAP orders and Zoho invoices, SAP inventory syncs hourly to Salesforce, and Zoho payments update Salesforce. Every operation retries 3 times with exponential backoff and alerts Slack on failure.
```

Skills used: `salesforce`, `sap`, `zoho`
