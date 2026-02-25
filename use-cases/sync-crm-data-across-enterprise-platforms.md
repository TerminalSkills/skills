---
title: Sync CRM Data Across Enterprise Platforms
slug: sync-crm-data-across-enterprise-platforms
description: "Build a TypeScript middleware that syncs deals, invoices, inventory, and payments across Salesforce, SAP S/4HANA, and Zoho Books with retry logic and Slack alerting."
skills: [salesforce, sap, zoho]
category: business
tags: [salesforce, zoho, sap, integration, data-sync, automation]
---

# Sync CRM Data Across Enterprise Platforms

## The Problem

Ravi is an integration architect at a mid-size manufacturing company running three disconnected systems: SAP S/4HANA for ERP (production, inventory, finance), Salesforce for the sales team (leads, opportunities, quotes), and Zoho Books for invoicing in regional offices.

Data flows between these systems manually. When a deal closes in Salesforce, a sales rep copies order details into SAP by hand. Finance re-enters invoices from SAP into Zoho Books. Inventory levels in SAP are checked via email when a sales rep needs to confirm stock for a customer. The whole cycle takes hours per day, and errors are constant — wrong quantities, mismatched prices, invoices sent to the wrong contact because someone transposed a name.

The worst part: payments. When a customer pays an invoice in Zoho Books, nobody updates Salesforce. So the sales team keeps following up on deals that are already paid. Last quarter, a rep called a customer to "check on the invoice status" three weeks after payment cleared. The customer was not impressed.

Ravi needs a middleware that closes the loop: deal to order to invoice to payment, all synced automatically.

## The Solution

Using the **salesforce**, **sap**, and **zoho** skills, build a TypeScript Express server that handles four data flows: Salesforce deal closed triggers SAP order creation and Zoho invoice generation, hourly inventory sync from SAP to Salesforce, and Zoho payment receipts update Salesforce opportunities. Every operation retries with exponential backoff and alerts Slack on persistent failures.

## Step-by-Step Walkthrough

### Step 1: API Clients with Token Management

Each platform uses a different OAuth2 flow. Salesforce uses JWT Bearer (server-to-server, no user interaction), SAP uses client credentials via BTP, and Zoho uses a refresh token flow. Each client manages its own token lifecycle — fetch, cache, refresh before expiry:

```typescript
// src/clients.ts
let sfToken: string;
let sfTokenExpiry = 0;

async function getSFToken(): Promise<string> {
  if (sfToken && Date.now() < sfTokenExpiry) return sfToken;
  // Sign a JWT with the Connected App's private key
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
  sfTokenExpiry = Date.now() + 3500000; // Refresh ~2 min before expiry
  return sfToken;
}

// SAP: client_credentials grant via BTP
// Zoho: refresh_token exchange → short-lived access token
// Each exports a thin wrapper: sf(), sap(), zoho()
```

### Step 2: Retry Logic and Slack Alerting

Every sync operation wraps in a retry handler — three attempts with exponential backoff (2s, 4s, 8s). If all retries fail, Slack gets an alert:

```typescript
// src/retry.ts
async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      console.error(`[${label}] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt === maxRetries) {
        await slackAlert(`Sync failed after ${maxRetries} retries: ${label}\n${err.message}`);
        throw err;
      }
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw new Error("Unreachable");
}
```

### Step 3: Deal Closed to SAP Order and Zoho Invoice

This is the core flow. When a Salesforce Opportunity moves to "Closed Won," three things happen in sequence: find or create the SAP Business Partner, create an SAP Sales Order with line items mapped from the Opportunity, and generate a Zoho Books invoice that auto-sends to the customer.

```typescript
// src/flows/deal-closed.ts
export async function handleDealClosed(req: Request, res: Response) {
  res.sendStatus(200); // Acknowledge immediately — Salesforce retries on timeout
  const { opportunityId } = req.body;

  await withRetry(async () => {
    // Pull Opportunity with Account and line items via SOQL
    const opp = await sf("GET", `/query?q=${encodeURIComponent(`
      SELECT Id, Name, Amount, Account.Name, Account.BillingCity,
             (SELECT Quantity, UnitPrice, Product2.ProductCode, Product2.Name
              FROM OpportunityLineItems)
      FROM Opportunity WHERE Id = '${opportunityId}'
    `)}`);
    const deal = opp.records[0];

    // SAP: Find or create Business Partner by name
    const search = await sap("GET",
      `/API_BUSINESS_PARTNER/A_BusinessPartner?$filter=SearchTerm1 eq '${deal.Account.Name.substring(0, 20).toUpperCase()}'&$top=1`
    );
    const sapBP = search.d.results.length > 0
      ? search.d.results[0].BusinessPartner
      : (await sap("POST", "/API_BUSINESS_PARTNER/A_BusinessPartner", {
          BusinessPartnerCategory: "1",
          BusinessPartnerFullName: deal.Account.Name,
        })).d.BusinessPartner;

    // SAP: Create Sales Order with line items
    const sapOrder = await sap("POST", "/API_SALES_ORDER_SRV/A_SalesOrder", {
      SalesOrderType: "OR", SalesOrganization: "1010",
      SoldToParty: sapBP, PurchaseOrderByCustomer: deal.Name,
      to_Item: deal.OpportunityLineItems.records.map((item: any) => ({
        Material: item.Product2.ProductCode,
        RequestedQuantity: String(item.Quantity),
        NetPriceAmount: String(item.UnitPrice),
      })),
    });

    // Zoho: Create and email invoice
    const invoice = await zoho("POST", "/invoices", {
      customer_id: await findOrCreateZohoContact(deal.Account.Name),
      reference_number: `SF-${opportunityId}`, // Links back to Salesforce
      payment_terms: 30,
      line_items: deal.OpportunityLineItems.records.map((item: any) => ({
        name: item.Product2.Name, quantity: item.Quantity, rate: item.UnitPrice,
      })),
    });
    await zoho("POST", `/invoices/${invoice.invoice.invoice_id}/email`);

    // Write both IDs back to Salesforce for traceability
    await sf("PATCH", `/sobjects/Opportunity/${opportunityId}`, {
      SAP_Order_Number__c: sapOrder.d.SalesOrder,
      Zoho_Invoice_Number__c: invoice.invoice.invoice_number,
      Sync_Status__c: "Synced",
    });
  }, `deal-closed:${opportunityId}`);
}
```

### Step 4: Hourly Inventory Sync (SAP to Salesforce)

A cron job runs every hour, pulls material stock levels from SAP (summed across all plants), and updates each matching Salesforce Product record. Products with fewer than 10 units get flagged, and Slack receives a low-stock alert:

```typescript
// src/flows/inventory.ts
cron.schedule("0 * * * *", async () => {
  await withRetry(async () => {
    const materials = await sap("GET",
      "/API_PRODUCT_SRV/A_Product?$select=Product,to_Plant/MRPAvailableQuantity&$expand=to_Plant&$top=5000"
    );
    const sfProducts = await sf("GET",
      `/query?q=${encodeURIComponent("SELECT Id, ProductCode FROM Product2 WHERE IsActive = true")}`
    );
    const sfMap = new Map(sfProducts.records.map((p: any) => [p.ProductCode, p]));

    let updated = 0, lowStock = 0;
    for (const mat of materials.d.results) {
      const sfProduct = sfMap.get(mat.Product);
      if (!sfProduct) continue;

      const totalStock = mat.to_Plant.results.reduce(
        (sum: number, plant: any) => sum + parseFloat(plant.MRPAvailableQuantity || "0"), 0
      );
      const isLow = totalStock < 10;
      if (isLow) lowStock++;

      await sf("PATCH", `/sobjects/Product2/${sfProduct.Id}`, {
        Available_Stock__c: totalStock, Low_Stock_Alert__c: isLow,
      });
      updated++;
    }

    if (lowStock > 0) await slackAlert(`${lowStock} products with low stock (<10 units)`);
  }, "inventory-sync");
});
```

### Step 5: Payment Received (Zoho to Salesforce)

When Zoho Books records a payment, a webhook fires. The handler looks up the invoice's `reference_number` (set to `SF-<opportunityId>` in Step 3), then marks the Salesforce Opportunity as paid:

```typescript
// src/flows/payment.ts
export async function handlePayment(req: Request, res: Response) {
  res.sendStatus(200);
  const payment = req.body;

  await withRetry(async () => {
    for (const inv of payment.invoices || []) {
      const detail = await zoho("GET", `/invoices/${inv.invoice_id}`);
      const ref = detail.invoice.reference_number;

      if (ref?.startsWith("SF-")) {
        const oppId = ref.replace("SF-", "");
        await sf("PATCH", `/sobjects/Opportunity/${oppId}`, {
          Payment_Received__c: true,
          Payment_Date__c: payment.date,
          Payment_Amount__c: payment.amount,
        });
      }
    }
  }, `payment:${payment.payment_id}`);
}
```

### Step 6: Wiring It All Together

The Express server registers two webhook endpoints and starts the inventory cron:

```typescript
// src/index.ts
const app = express();
app.use(express.json());

app.post("/webhook/salesforce/deal-closed", handleDealClosed);
app.post("/webhook/zoho/payment", handlePayment);

startInventorySync();

app.listen(3000, () => console.log("CRM sync middleware running on port 3000"));
```

## Real-World Example

Ravi deploys the middleware on a Tuesday. By Thursday, the first real deal flows through the system end-to-end.

A sales rep closes a $47,000 opportunity in Salesforce for 200 units of industrial sensors. Within 8 seconds, SAP has a new Sales Order (SO-4401892) with the correct Business Partner and line items. Zoho Books has Invoice INV-2026-0847, which auto-emails to the customer's accounts payable department. Both IDs appear on the Salesforce Opportunity — no manual entry, no re-keying errors.

The hourly inventory sync catches something useful in the first week: SAP shows only 6 units of a popular component, so the Salesforce Product record gets flagged as low stock. A sales rep sees the flag before quoting a large order and checks with the warehouse first, avoiding a promise they couldn't keep.

Two weeks later, the customer pays Invoice INV-2026-0847. Zoho Books records the payment, the webhook fires, and the Salesforce Opportunity updates with `Payment_Received: true` and the payment date. The sales rep who closed the deal gets a dashboard notification instead of having to chase accounts receivable.

After the first month: zero manual data re-entry between the three platforms, 12 hours per week of admin work eliminated, and not a single embarrassing "is this paid yet?" call to a customer who already settled their invoice.
