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

Data moves between them by hand. When a deal closes in Salesforce, a rep copies the order into SAP. Finance re-enters invoices from SAP into Zoho Books. Stock levels are checked by email. Errors are constant: wrong quantities, mismatched prices, invoices sent to the wrong contact. Worst of all, when a customer pays in Zoho Books nobody updates Salesforce, so reps keep chasing deals that are already paid.

Ravi needs middleware that closes the loop: deal to order to invoice to payment, synced automatically.

## The Solution

Using the **salesforce**, **sap** and **zoho** skills, build a small TypeScript service (Node 22 or later, Express) with three flows: a closed-won Opportunity creates the SAP sales order and the Zoho invoice; an hourly job copies SAP stock levels to Salesforce products; a ten-minute job copies Zoho payments back to the Opportunity. Every flow retries with backoff and alerts Slack when it still fails.

Before you start, create these custom fields in Salesforce: on Opportunity `SAP_Order_Number__c`, `Zoho_Invoice_Number__c` (text), `Sync_Status__c` (text), `Payment_Received__c` (checkbox), `Payment_Date__c` (date), `Payment_Amount__c` (currency); on Product `Available_Stock__c` (number) and `Low_Stock_Alert__c` (checkbox).

## Step-by-Step Walkthrough

### Step 1: Project setup and API clients

```bash
npm init -y && npm pkg set type=module
npm install express jose node-cron zod
npm install -D typescript tsx @types/node @types/express @types/node-cron
```

Salesforce uses the JWT bearer flow (a Connected App with a certificate), SAP uses OAuth client credentials against the BTP token URL, and Zoho exchanges a refresh token for a one-hour access token. Secrets stay in environment variables. Three details matter: Salesforce returns an `instance_url` that is the base for every REST call, and the API version is read from `/services/data/`; SAP OData writes need a CSRF token (`X-CSRF-Token: Fetch`) plus the session cookie that comes with it; every Zoho Books call needs `organization_id`.

```typescript
// src/clients.ts — one small client per system; each caches its own token
import { importPKCS8, SignJWT } from "jose";
const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var ${k}`);
  return v;
};
async function json(res: Response, label: string) {
  if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}
// ---- Salesforce: JWT bearer flow (server to server, no user interaction) ----
let sfAuth: { token: string; base: string; expires: number } | undefined;
async function sfLogin() {
  if (sfAuth && Date.now() < sfAuth.expires) return sfAuth;
  const key = await importPKCS8(env("SF_PRIVATE_KEY"), "RS256"); // PEM of the Connected App certificate
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(env("SF_CLIENT_ID"))          // Connected App consumer key
    .setSubject(env("SF_USERNAME"))
    .setAudience(env("SF_LOGIN_URL"))        // https://login.salesforce.com, or https://test.salesforce.com for sandboxes
    .setExpirationTime("3m")
    .sign(key);
  const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
  const t = await json(await fetch(`${env("SF_LOGIN_URL")}/services/oauth2/token`, { method: "POST", body }), "salesforce token");
  // No expiry in the response (set per org): re-login every 30 minutes and on 401.
  const versions = await json(await fetch(`${t.instance_url}/services/data/`), "salesforce versions");
  const latest = versions.at(-1).url as string;        // e.g. /services/data/v6x.0
  sfAuth = { token: t.access_token, base: `${t.instance_url}${latest}`, expires: Date.now() + 30 * 60_000 };
  return sfAuth;
}
export async function sf(method: string, path: string, body?: unknown, retry = true): Promise<any> {
  const a = await sfLogin();
  const res = await fetch(`${a.base}${path}`, {
    method, headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry) { sfAuth = undefined; return sf(method, path, body, false); }
  return json(res, `salesforce ${method} ${path}`);
}
export const soql = (q: string) => sf("GET", `/query?q=${encodeURIComponent(q)}`);
// ---- SAP S/4HANA: OAuth client credentials + CSRF token for writes ----
let sapTok: { token: string; expires: number } | undefined;
async function sapToken() {
  if (sapTok && Date.now() < sapTok.expires) return sapTok.token;
  const basic = Buffer.from(`${env("SAP_CLIENT_ID")}:${env("SAP_CLIENT_SECRET")}`).toString("base64");
  const t = await json(await fetch(env("SAP_TOKEN_URL"), {
    method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  }), "sap token");
  sapTok = { token: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 };
  return sapTok.token;
}
export async function sap(method: string, path: string, body?: unknown): Promise<any> {
  const headers: Record<string, string> = { Authorization: `Bearer ${await sapToken()}`, Accept: "application/json" };
  if (method !== "GET") {
    // SAP_BASE_URL = OData root, e.g. https://<host>/sap/opu/odata/sap; fetch the token from the target service.
    const service = path.split("/")[1];
    const probe = await fetch(`${env("SAP_BASE_URL")}/${service}/`, { headers: { ...headers, "X-CSRF-Token": "Fetch" } });
    headers["X-CSRF-Token"] = probe.headers.get("x-csrf-token") ?? "";
    const cookie = probe.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    if (cookie) headers.Cookie = cookie;
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${env("SAP_BASE_URL")}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return json(res, `sap ${method} ${path}`);
}
export const odataStr = (s: string) => s.replaceAll("'", "''"); // escape an OData filter value
// ---- Zoho Books: refresh-token exchange; every call needs organization_id ----
let zTok: { token: string; expires: number } | undefined;
async function zohoToken() {
  if (zTok && Date.now() < zTok.expires) return zTok.token;
  const q = new URLSearchParams({
    grant_type: "refresh_token", refresh_token: env("ZOHO_REFRESH_TOKEN"),
    client_id: env("ZOHO_CLIENT_ID"), client_secret: env("ZOHO_CLIENT_SECRET"),
  });
  const t = await json(await fetch(`${env("ZOHO_ACCOUNTS_URL")}/oauth/v2/token?${q}`, { method: "POST" }), "zoho token");
  zTok = { token: t.access_token, expires: Date.now() + 50 * 60_000 }; // tokens last 1 hour
  return zTok.token;
}
export async function zoho(method: string, path: string, body?: unknown): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${env("ZOHO_BOOKS_URL")}${path}${sep}organization_id=${env("ZOHO_ORG_ID")}`; // the /books/v3 root on your Zoho data-center domain
  const res = await fetch(url, {
    method, headers: { Authorization: `Zoho-oauthtoken ${await zohoToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return json(res, `zoho ${method} ${path}`);
}
export async function slackAlert(text: string) {
  await fetch(env("SLACK_WEBHOOK_URL"), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
  }).catch(() => {});
}
```

### Step 2: Retry and Slack alerts
```typescript
import { slackAlert } from "./clients.ts";
export async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${label}] attempt ${i}/${attempts} failed: ${msg}`);
      if (i >= attempts) {
        await slackAlert(`Sync failed after ${attempts} attempts: ${label}\n${msg}`);
        throw err;
      }
      await new Promise((r) => setTimeout(r, 2 ** i * 1000));
    }
  }
}
```

### Step 3: The three flows

**Deal closed.** The flow is safe to run twice. The SAP order number is written back to the Opportunity the moment the order exists, and the Zoho invoice is looked up by its `SF-<opportunityId>` reference before a new one is created, so a retry after a half-finished run does not create duplicates. The price is sent as a `PR00` pricing condition because `API_SALES_ORDER_SRV` has no price field on the item itself; check the condition type your pricing procedure uses. A missing SAP business partner goes to Slack instead of being created, since a customer in SAP needs your company's grouping and role rules.

**Inventory.** Stock lives in `API_MATERIAL_STOCK_SRV`, not in the product service, and counts only unrestricted-use stock (type `01`, no special stock), summed across plants and storage locations.

**Payments.** Zoho Books webhooks are configured per workflow rule with a payload you design, so the service polls instead: for each synced, unpaid Opportunity it asks Zoho for a paid invoice with the matching reference.

```typescript
import { sf, soql, sap, zoho, odataStr, slackAlert } from "./clients.ts";
import { withRetry } from "./retry.ts";
const CURRENCY = process.env.DEAL_CURRENCY ?? "EUR";
// 1. Closed won -> SAP sales order + Zoho invoice
export async function handleDealClosed(opportunityId: string) {
  await withRetry(`deal-closed:${opportunityId}`, async () => {
    const { records } = await soql(`
      SELECT Id, Name, Account.Name, SAP_Order_Number__c, Zoho_Invoice_Number__c,
             (SELECT Contact.Email FROM OpportunityContactRoles WHERE IsPrimary = true),
             (SELECT Quantity, UnitPrice, Product2.ProductCode, Product2.Name FROM OpportunityLineItems)
      FROM Opportunity WHERE Id = '${opportunityId}'`);   // id was validated as 15-18 alphanumerics
    const deal = records[0];
    if (!deal || deal.Zoho_Invoice_Number__c) return;      // unknown id, or fully synced already
    const items = deal.OpportunityLineItems?.records ?? [], name: string = deal.Account.Name;
    let sapOrder: string | undefined = deal.SAP_Order_Number__c;
    if (!sapOrder) {
      // The customer must already exist in SAP; a missing partner goes to Slack instead of being guessed.
      const term = odataStr(name.slice(0, 20).toUpperCase());
      const found = await sap("GET", `/API_BUSINESS_PARTNER/A_BusinessPartner?$filter=SearchTerm1 eq '${term}'&$select=BusinessPartner&$top=1`);
      const bp = found.d.results[0]?.BusinessPartner;
      if (!bp) {
        await slackAlert(`No SAP business partner with search term ${term} for deal ${deal.Name}`);
        return;
      }
      // Price as a pricing condition (PR00 = standard price; check your pricing procedure)
    const order = await sap("POST", "/API_SALES_ORDER_SRV/A_SalesOrder", {
      SalesOrderType: "OR", SalesOrganization: "1010", DistributionChannel: "10", OrganizationDivision: "00",
      SoldToParty: bp, PurchaseOrderByCustomer: String(deal.Name).slice(0, 35), // field limit is 35
      to_Item: items.map((i: any) => ({
        Material: i.Product2.ProductCode, RequestedQuantity: String(i.Quantity),
        to_PricingElement: [{ ConditionType: "PR00", ConditionRateValue: String(i.UnitPrice), ConditionCurrency: CURRENCY }],
      })),
    });
    sapOrder = order.d.SalesOrder as string;
    // Save at once so a retry cannot create a second order.
    await sf("PATCH", `/sobjects/Opportunity/${opportunityId}`, { SAP_Order_Number__c: sapOrder });
    }
    const email: string | undefined = deal.OpportunityContactRoles?.records?.[0]?.Contact?.Email;
    const contacts = await zoho("GET", `/contacts?contact_type=customer&contact_name=${encodeURIComponent(name)}`);
    // The name filter can match several contacts: require an exact name.
    const contact = contacts.contacts.find((c: any) => c.contact_name.toLowerCase() === name.toLowerCase()) ?? (await zoho("POST", "/contacts", {
      contact_name: name, contact_type: "customer",
      contact_persons: email ? [{ email, is_primary_contact: true }] : [],
    })).contact;
    const existing = (await zoho("GET", `/invoices?reference_number=SF-${opportunityId}`)).invoices?.[0];
    const { invoice } = existing ? { invoice: existing } : await zoho("POST", "/invoices", {
      customer_id: contact.contact_id, reference_number: `SF-${opportunityId}`, payment_terms: 30,
      line_items: items.map((i: any) => ({ name: i.Product2.Name, quantity: i.Quantity, rate: i.UnitPrice })),
    });
    const to = email ?? contact.email;   // to_mail_ids is required
    if (to) await zoho("POST", `/invoices/${invoice.invoice_id}/email`, { to_mail_ids: [to] });
    await sf("PATCH", `/sobjects/Opportunity/${opportunityId}`, {
      SAP_Order_Number__c: sapOrder, Zoho_Invoice_Number__c: invoice.invoice_number, Sync_Status__c: "Synced",
    });
  });
}
// 2. Hourly: SAP stock -> Salesforce products (total across plants)
export async function syncInventory() {
  await withRetry("inventory-sync", async () => {
    const { records } = await soql("SELECT Id, ProductCode FROM Product2 WHERE IsActive = true AND ProductCode != null");
    const byCode = new Map<string, string>(records.map((p: any) => [p.ProductCode, p.Id]));
    let low = 0;
    for (let skip = 0; ; skip += 500) {
      const page = await sap("GET",
        `/API_MATERIAL_STOCK_SRV/A_MaterialStock?$select=Material&$expand=to_MatlStkInAcctMod&$top=500&$skip=${skip}`);
      const rows = page.d.results;
      for (const m of rows) {
        const id = byCode.get(m.Material);
        if (!id) continue;
        // Available = unrestricted-use stock (type 01), no special stock; blocked/quality/in-transit are excluded.
        const total = m.to_MatlStkInAcctMod.results
          .filter((r: any) => r.InventoryStockType === "01" && !r.InventorySpecialStockType)
          .reduce((s: number, r: any) => s + Number(r.MatlWrhsStkQtyInMatlBaseUnit || 0), 0);
        if (total < 10) low++;
        await sf("PATCH", `/sobjects/Product2/${id}`, { Available_Stock__c: total, Low_Stock_Alert__c: total < 10 });
      }
      if (rows.length < 500) break;
    }
    if (low) await slackAlert(`${low} products with fewer than 10 units in stock`);
  });
}
// 3. Every 10 minutes: paid Zoho invoices -> Salesforce opportunities
export async function syncPayments() {
  await withRetry("payment-sync", async () => {
    const { records } = await soql(
      "SELECT Id FROM Opportunity WHERE Sync_Status__c = 'Synced' AND Payment_Received__c = false LIMIT 200");
    for (const opp of records) {
      const res = await zoho("GET", `/invoices?reference_number=SF-${opp.Id}&status=paid`);
      const inv = res.invoices?.[0];
      if (!inv) continue;
      await sf("PATCH", `/sobjects/Opportunity/${opp.Id}`, {
        Payment_Received__c: true, Payment_Date__c: inv.last_payment_date, Payment_Amount__c: inv.total,
      });
    }
  });
}
```

### Step 4: Entry point

Salesforce calls the service from a record-triggered Flow or an Apex callout through a Named Credential. The endpoint checks a shared secret, validates the id (it ends up in a SOQL string) and answers `202` before the work starts. Put the service behind TLS before exposing it; it listens on `127.0.0.1` only.

```typescript
import { timingSafeEqual } from "node:crypto";
import express from "express";
import cron from "node-cron";
import { z } from "zod";
import { handleDealClosed, syncInventory, syncPayments } from "./flows.ts";
const Body = z.object({ opportunityId: z.string().regex(/^[a-zA-Z0-9]{15,18}$/) });
const secret = Buffer.from(process.env.WEBHOOK_SECRET ?? "");
const app = express();
app.use(express.json({ limit: "10kb" }));
app.post("/webhook/salesforce/deal-closed", (req, res) => {
  const given = Buffer.from(req.header("x-webhook-secret") ?? "");
  if (!secret.length || given.length !== secret.length || !timingSafeEqual(given, secret)) return res.sendStatus(401);
  const body = Body.safeParse(req.body);
  if (!body.success) return res.sendStatus(400);
  res.sendStatus(202); // answer now, work afterwards
  handleDealClosed(body.data.opportunityId).catch(() => {}); // already logged and alerted by withRetry
});
cron.schedule("0 * * * *", () => syncInventory().catch(() => {}));
cron.schedule("*/10 * * * *", () => syncPayments().catch(() => {}));
app.listen(3000, "127.0.0.1", () => console.log("CRM sync listening on 127.0.0.1:3000"));
```

## Real-World Example

Ravi deploys the middleware on a Tuesday. A sales rep closes a 47,000 EUR opportunity for 200 industrial sensors. Within seconds SAP has a new sales order and Zoho Books has an invoice with reference `SF-006...`, emailed to the primary contact on the Opportunity. Both numbers appear on the Salesforce record without anyone re-typing them.

The first hourly stock run flags a popular component at 6 units, so a rep checks with the warehouse before quoting a large order. Two weeks later the customer pays; the next ten-minute run sets `Payment_Received__c` and the payment date, and the rep stops asking accounts receivable.

## Related Skills

- [salesforce](/skills/salesforce) - JWT login, SOQL and record updates
- [sap](/skills/sap) - S/4HANA OData services, OAuth and CSRF handling
- [zoho](/skills/zoho) - Zoho Books invoices, contacts and OAuth
