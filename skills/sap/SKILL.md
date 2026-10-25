---
name: sap
description: >-
  Connect to SAP S/4HANA (OData APIs), SAP Business One (Service Layer) and build
  SAP CAP applications on SAP BTP with Node.js. Use when a user asks to read or create
  business partners, sales orders or purchase orders in S/4HANA, automate Business One
  documents, scaffold a CAP service, or sync SAP with Shopify or another external
  system. Covers OAuth and CSRF handling, the SAP Cloud SDK HTTP client, and
  polling and webhook integration patterns.
license: Apache-2.0
compatibility: 'Node.js 22.12+ for CAP 10 (@sap/cds); any HTTP client for OData; SAP system or tenant access required'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  tags: "sap, erp, s4hana, odata, btp"
---

# SAP

## Overview

SAP S/4HANA exposes business data through OData services (the V2 services `API_BUSINESS_PARTNER`, `API_SALES_ORDER_SRV`, `API_PURCHASEORDER_PROCESS_SRV`, `API_MATERIAL_STOCK_SRV`; V4 variants also exist), SAP Business One exposes the Service Layer (REST/OData under `/b1s/v1`), and the SAP Cloud Application Programming Model (CAP, `@sap/cds` 10) builds new services for SAP BTP. This skill covers authentication, reading and creating documents, a working CAP service, and integration patterns. The API catalog lives in the SAP Business Accelerator Hub (api.sap.com, formerly API Business Hub); your own tenant needs a communication arrangement or technical user.

## Instructions

### Step 1: Authentication and connectivity

```bash
export SAP_TOKEN_URL="https://acme-prod.authentication.eu10.hana.ondemand.com/oauth/token"
export SAP_CLIENT_ID="sb-acme-s4-integration"
export SAP_CLIENT_SECRET="..."   # from your secret store
export SAP_BASE_URL="https://my300123-api.s4hana.cloud.sap/sap/opu/odata/sap"
```

The token URL and base URL come from your tenant (communication arrangement or BTP service key); the values above only show the shape. With OAuth2 client credentials:

```typescript
async function getSAPToken(): Promise<string> {
  const basic = Buffer.from(`${process.env.SAP_CLIENT_ID}:${process.env.SAP_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(process.env.SAP_TOKEN_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  return (await res.json()).access_token;
}
```

OData V2 write requests need a CSRF token: do a GET on the service root with `X-CSRF-Token: fetch`, read the `x-csrf-token` response header, send it on the POST/PATCH/DELETE, and re-fetch when the server answers 403. Keep the session cookies from that GET and send them along.

```typescript
async function getCSRF(token: string, service: string) {
  const res = await fetch(`${process.env.SAP_BASE_URL}/${service}/`, {
    headers: { Authorization: `Bearer ${token}`, "X-CSRF-Token": "fetch", Accept: "application/json" },
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { csrf: res.headers.get("x-csrf-token")!, cookie };
}

async function sapApi(method: string, path: string, token: string, body?: unknown) {
  const service = path.split("/")[1];
  const write = method !== "GET";
  const extra = write ? await getCSRF(token, service) : null;
  const res = await fetch(`${process.env.SAP_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json",
      ...(extra ? { "X-CSRF-Token": extra.csrf, Cookie: extra.cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`SAP ${res.status}: ${await res.text()}`);
  return res.json();
}
```

OData V2 JSON wraps results: lists are in `response.d.results`, a single entity in `response.d`.

The SAP Cloud SDK (`@sap-cloud-sdk/http-client`, v4) adds destination handling, token caching and CSRF on top of the same calls. `executeHttpRequest(destination, requestConfig)` takes a destination (`{ url, username, password }` or a BTP destination name) and `{ method, url, headers, data }`:

```typescript
import { executeHttpRequest } from "@sap-cloud-sdk/http-client";

const res = await executeHttpRequest(
  { url: process.env.SAP_HOST!, username: process.env.SAP_USER!, password: process.env.SAP_PASSWORD! },
  { method: "GET", url: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=5&$select=BusinessPartner" },
);
```

The pregenerated `@sap/cloud-sdk-vdm-*` packages are deprecated; generate a typed client with `@sap-cloud-sdk/generator` instead.

**SAP Business One Service Layer:** log in with company database, user and password, then send the session cookies from the login response on every call, and log out when done.

```typescript
const B1_URL = process.env.B1_SERVICE_LAYER_URL!; // e.g. https://b1-prod.acme.example:50000/b1s/v1

async function b1Login(): Promise<string> {
  const res = await fetch(`${B1_URL}/Login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ CompanyDB: process.env.B1_COMPANY_DB, UserName: process.env.B1_USER, Password: process.env.B1_PASSWORD }),
  });
  if (!res.ok) throw new Error(`B1 login failed: ${res.status}`);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function b1Api(method: string, path: string, session: string, body?: unknown) {
  const res = await fetch(`${B1_URL}${path}`, {
    method, headers: { "Content-Type": "application/json", Cookie: session },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`B1 ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
```

### Step 2: S/4HANA OData operations

```typescript
const token = await getSAPToken();
const customers = await sapApi("GET",
  "/API_BUSINESS_PARTNER/A_BusinessPartner?$filter=BusinessPartnerCategory eq '2'&$select=BusinessPartner,BusinessPartnerFullName,Industry&$top=50", token);

await sapApi("POST", "/API_BUSINESS_PARTNER/A_BusinessPartner", token, {
  BusinessPartnerCategory: "2", BusinessPartnerGrouping: "BP02", OrganizationBPName1: "TechStart GmbH", SearchTerm1: "TECHSTART",
  to_BusinessPartnerAddress: [{ Country: "DE", CityName: "Berlin", StreetName: "Friedrichstrasse", HouseNumber: "123", PostalCode: "10117" }],
});

await sapApi("POST", "/API_SALES_ORDER_SRV/A_SalesOrder", token, {
  SalesOrderType: "OR", SalesOrganization: "1010", DistributionChannel: "10", OrganizationDivision: "00",
  SoldToParty: "1000010", PurchaseOrderByCustomer: "PO-2026-001",
  to_Item: [
    { Material: "TG11", RequestedQuantity: "10", RequestedQuantityUnit: "EA" },
    { Material: "TG12", RequestedQuantity: "5", RequestedQuantityUnit: "EA" },
  ],
});

await sapApi("POST", "/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder", token, {
  PurchaseOrderType: "NB", CompanyCode: "1010", Supplier: "1000020",
  PurchasingOrganization: "1010", PurchasingGroup: "001",
  to_PurchaseOrderItem: [{ Material: "RAW-001", OrderQuantity: "1000", PurchaseOrderQuantityUnit: "KG",
    NetPriceAmount: "5.50", DocumentCurrency: "EUR", Plant: "1010" }],
});

```

Sales prices normally come from pricing conditions, so the items above carry none. Business partner category `2` is an organization (`1` is a natural person); the grouping `BP02` decides the number range. Organization values (`1010`, `10`, `00`, plants, groups, groupings) are customizing data and differ per system. Stock levels are not in the Product API: read `API_MATERIAL_STOCK_SRV` (`A_MatlStkInAcctMod`, filtered by `Material` and `Plant`).

### Step 3: Business One document flow (order, then invoice)

```typescript
const session = await b1Login();
const order = await b1Api("POST", "/Orders", session, {
  CardCode: "C20000", DocDate: "2026-10-24", DocDueDate: "2026-11-07",
  DocumentLines: [{ ItemCode: "A00001", Quantity: 10, UnitPrice: 100 }, { ItemCode: "A00002", Quantity: 5, UnitPrice: 250 }],
});
const invoice = await b1Api("POST", "/Invoices", session, {
  CardCode: "C20000",
  DocumentLines: [
    { BaseType: 17, BaseEntry: order.DocEntry, BaseLine: 0 }, // 17 = sales order
    { BaseType: 17, BaseEntry: order.DocEntry, BaseLine: 1 },
  ],
});
```

### Step 4: SAP CAP service

CAP 10 needs Node.js 22.12 or newer. `cds init` alone creates no runtime; add the Node.js one. New Node.js projects are ES modules (`"type": "module"`), so handlers use `import`/`export`, not `require`.

```bash
npm install -g @sap/cds-dk
cds init shop --nodejs && cd shop && npm install
```

`db/schema.cds`:
```cds
using { cuid } from '@sap/cds/common';
namespace shop;
entity Products : cuid { name : String(100); price : Decimal(10,2); stock : Integer; }
entity Orders : cuid {
  orderDate : Date; customer : String(100); status : String(20) default 'New';
  items : Composition of many OrderItems on items.order = $self; totalAmount : Decimal(12,2);
}
entity OrderItems : cuid {
  order : Association to Orders; product : Association to Products;
  quantity : Integer; unitPrice : Decimal(10,2);
}
```

`srv/catalog-service.cds`:
```cds
using { shop as db } from '../db/schema';
service CatalogService @(path: '/catalog') {
  entity Products   as projection on db.Products;
  entity Orders     as projection on db.Orders;
  entity OrderItems as projection on db.OrderItems;
}
```

`srv/catalog-service.js` (picked up by name next to the `.cds` file):
```javascript
import cds from '@sap/cds'

export default class CatalogService extends cds.ApplicationService {
  init() {
    const { Products, Orders } = this.entities

    this.before('CREATE', Orders, async (req) => {
      const items = req.data.items ?? []
      if (!items.length) return req.reject(400, 'An order needs at least one item')
      for (const item of items) {
        const product = await SELECT.one.from(Products).where({ ID: item.product_ID })
        if (!product) return req.reject(404, `Product ${item.product_ID} not found`)
        if (product.stock < item.quantity) return req.reject(409, `Insufficient stock for ${product.name}`)
        item.unitPrice = product.price
      }
      req.data.totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    })

    this.after('CREATE', Orders, async (order, req) => {
      for (const item of req.data.items)
        await UPDATE(Products).set({ stock: { '-=': item.quantity } }).where({ ID: item.product_ID })
    })
    return super.init()
  }
}
```

Seed data goes in `db/data/shop-Products.csv` (`ID;name;price;stock`). `cds watch` serves `http://localhost:4004/catalog` with an in-memory SQLite database and mocked authentication. Posting an order for 3 loaves returns `totalAmount` computed server-side and lowers the product's stock; ordering more than the stock returns `409 Insufficient stock`. Production needs a real auth strategy (XSUAA/IAS) and a HANA or PostgreSQL binding.

### Step 5: Integration patterns

**SAP to external system (polling):** store the checkpoint durably and advance it only after the batch succeeded.

```typescript
import cron from "node-cron";
cron.schedule("*/5 * * * *", async () => {
  const since = await loadCheckpoint(); // e.g. from a database row, ISO string without milliseconds
  const token = await getSAPToken();
  const orders = await sapApi("GET",
    `/API_SALES_ORDER_SRV/A_SalesOrder?$filter=CreationDate gt datetime'${since}'&$expand=to_Item`, token);
  for (const order of orders.d.results) {
    await externalApi.createOrder({ sapOrderId: order.SalesOrder, customer: order.SoldToParty,
      items: order.to_Item.results.map((i: any) => ({ material: i.Material, quantity: parseFloat(i.RequestedQuantity) })) });
  }
  await saveCheckpoint(new Date().toISOString().slice(0, 19));
});
```

**Shopify webhook to S/4HANA** (verify the HMAC on the raw body first):

```typescript
import crypto from "node:crypto";
app.post("/webhook/shopify/order", express.raw({ type: "application/json" }), async (req, res) => {
  const digest = crypto.createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET!).update(req.body).digest("base64");
  const sent = Buffer.from(req.get("X-Shopify-Hmac-Sha256") ?? "");
  if (sent.length !== digest.length || !crypto.timingSafeEqual(sent, Buffer.from(digest))) return res.sendStatus(401);
  const order = JSON.parse(req.body.toString());
  const token = await getSAPToken();
  await sapApi("POST", "/API_SALES_ORDER_SRV/A_SalesOrder", token, {
    SalesOrderType: "OR", SalesOrganization: "1010", DistributionChannel: "10", OrganizationDivision: "00",
    SoldToParty: await findBusinessPartnerByEmail(order.customer.email),
    PurchaseOrderByCustomer: `SHOPIFY-${order.order_number}`,
    to_Item: order.line_items.map((i: any) => ({ Material: i.sku, RequestedQuantity: String(i.quantity), RequestedQuantityUnit: "EA" })),
  });
  res.sendStatus(200);
});
```

## Examples

### Example 1: Reorder raw material when stock is low

**User prompt:** "When stock of material RAW-001 in plant 1010 drops below 500 KG, create a purchase order to vendor 1000020 for 2000 KG. Check daily and log every PO."

The agent schedules a daily job, reads `API_MATERIAL_STOCK_SRV/A_MatlStkInAcctMod?$filter=Material eq 'RAW-001' and Plant eq '1010'`, sums `MatlWrhsStkQtyInMatlBaseUnit`, and below 500 first checks for an open purchase order for the same material so it never orders twice. It then posts the order from Step 2 and logs the returned `PurchaseOrder` number with the date. Result: one log line per run such as `2026-10-24 PO 4500001234 created, 2000 KG RAW-001`.

### Example 2: Shopify orders into S/4HANA sales orders

**User prompt:** "Receive Shopify orders and create the matching sales orders in S/4HANA, mapping each SKU to the material number and finding the customer by email."

The agent builds the webhook from Step 5: HMAC check, customer lookup through the Business Partner API (created if absent), SKU to `Material`, and a sales order with the Shopify order number in `PurchaseOrderByCustomer` for reconciliation. Result: HTTP 200 to Shopify and a log line linking `SHOPIFY-1042` to the new sales order number.

## Guidelines

- **Fetch a CSRF token before every write to an OData V2 service** and refresh it on a 403; send the cookies from the same GET.
- **Use `$select`, `$top` and `$filter`** on every query; unrestricted reads of large entities are slow and can hit system limits. Page with `$top`/`$skip` or follow `__next`.
- **Dates:** OData V2 uses `/Date(ms)/` values and `datetime'...'` in filters, V4 uses ISO 8601. Parse them explicitly.
- **Do not assume organization data.** Sales organization, plant, company code, order types and units differ per system; ask or read them from customizing.
- **Poll gently** (every 5 minutes at most) and filter on a stored timestamp.
- **Try new calls against the Business Accelerator Hub sandbox or a QA tenant first**, never first against production. Orders and invoices posted to a live system are hard to undo.
- **Secrets** (OAuth client secrets, B1 passwords, webhook secrets) belong in a secret store; use a technical user with narrow authorizations.
- **Business One sessions time out;** log out when finished and re-login on a 401.
