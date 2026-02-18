---
name: sap
description: >-
  Integrate with SAP systems and build extensions. Use when a user asks to
  connect to SAP S/4HANA, SAP Business One, or SAP ERP via OData, RFC, BAPI,
  or IDoc interfaces, build SAP BTP (Business Technology Platform) applications,
  work with SAP CAP (Cloud Application Programming), consume SAP APIs from
  the API Business Hub, manage master data, automate procurement or sales
  processes, build Fiori apps, extract SAP data for analytics, or integrate
  SAP with external systems. Covers S/4HANA APIs, Business One, BTP, CAP,
  and integration patterns.
license: Apache-2.0
compatibility: "Node.js 18+ (SAP Cloud SDK), any HTTP client (OData APIs)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: erp
  tags: ["sap", "erp", "s4hana", "odata", "btp", "cap", "fiori", "business-one"]
---

# SAP

## Overview

Integrate with SAP — the enterprise ERP backbone. This skill covers SAP S/4HANA Cloud and on-premise APIs (OData V2/V4, BAPI/RFC), SAP Business One (Service Layer), SAP BTP application development, SAP CAP (Cloud Application Programming model), SAP Cloud SDK for JavaScript/TypeScript, master data management, procurement and sales document automation, and integration patterns for connecting SAP with external systems.

## Instructions

### Step 1: Authentication & Connectivity

**SAP S/4HANA Cloud — API Key or OAuth2:**
```bash
# API Business Hub (sandbox testing)
# Get API key from https://api.sap.com/
export SAP_API_KEY="your-api-key"

# Production: OAuth2 Client Credentials
export SAP_TOKEN_URL="https://your-tenant.authentication.eu10.hana.ondemand.com/oauth/token"
export SAP_CLIENT_ID="client-id"
export SAP_CLIENT_SECRET="client-secret"
```

```typescript
// OAuth2 token helper
async function getSAPToken() {
  const res = await fetch(process.env.SAP_TOKEN_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${SAP_CLIENT_ID}:${SAP_CLIENT_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token;
}

// OData API helper
async function sapApi(method: string, path: string, token: string, body?: any) {
  const baseUrl = process.env.SAP_BASE_URL; // e.g., https://my-s4hana.com/sap/opu/odata/sap
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-CSRF-Token": method === "GET" ? "" : await getCSRFToken(token),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`SAP ${res.status}: ${await res.text()}`);
  return res.json();
}

// CSRF token (required for write operations on S/4HANA on-premise)
async function getCSRFToken(token: string) {
  const res = await fetch(`${process.env.SAP_BASE_URL}/API_BUSINESS_PARTNER/A_BusinessPartner?$top=0`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-CSRF-Token": "Fetch",
    },
  });
  return res.headers.get("x-csrf-token") || "";
}
```

**SAP Business One — Service Layer:**
```typescript
const B1_URL = "https://your-b1-server:50000/b1s/v1";

async function b1Login() {
  const res = await fetch(`${B1_URL}/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      CompanyDB: "SBODemoUS",
      UserName: "manager",
      Password: "password",
    }),
  });
  const cookies = res.headers.get("set-cookie");
  return cookies; // Session cookie for subsequent requests
}

async function b1Api(method: string, path: string, session: string, body?: any) {
  const res = await fetch(`${B1_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: session,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}
```

### Step 2: SAP Cloud SDK for JavaScript

**Install and configure:**
```bash
npm install @sap-cloud-sdk/http-client @sap-cloud-sdk/odata-v2 @sap-cloud-sdk/odata-v4
# For generated API clients:
npm install @sap/cloud-sdk-vdm-business-partner-service
```

**Type-safe API calls:**
```typescript
import { businessPartnerService } from "@sap/cloud-sdk-vdm-business-partner-service";

const { businessPartnerApi } = businessPartnerService();

// Get all customers
const customers = await businessPartnerApi
  .requestBuilder()
  .getAll()
  .filter(
    businessPartnerApi.schema.BUSINESS_PARTNER_CATEGORY.equals("1"), // Customer
    businessPartnerApi.schema.SEARCH_TERM_1.equals("TECH")
  )
  .select(
    businessPartnerApi.schema.BUSINESS_PARTNER,
    businessPartnerApi.schema.BUSINESS_PARTNER_FULL_NAME,
    businessPartnerApi.schema.INDUSTRY,
    businessPartnerApi.schema.SEARCH_TERM_1
  )
  .top(50)
  .execute({ destinationName: "S4HANA" });

// Create a business partner
const newBP = businessPartnerApi.entityBuilder()
  .businessPartnerCategory("1")
  .businessPartnerFullName("TechStart GmbH")
  .searchTerm1("TECHSTART")
  .industry("IT")
  .build();

const created = await businessPartnerApi
  .requestBuilder()
  .create(newBP)
  .execute({ destinationName: "S4HANA" });
```

### Step 3: S/4HANA OData APIs — Common Operations

**Business Partners (customers/vendors):**
```typescript
// List customers
const customers = await sapApi("GET",
  "/API_BUSINESS_PARTNER/A_BusinessPartner?$filter=BusinessPartnerCategory eq '1'&$select=BusinessPartner,BusinessPartnerFullName,Industry&$top=50",
  token
);

// Create customer
await sapApi("POST", "/API_BUSINESS_PARTNER/A_BusinessPartner", token, {
  BusinessPartnerCategory: "1",
  BusinessPartnerFullName: "TechStart GmbH",
  BusinessPartnerGrouping: "BPGR",
  SearchTerm1: "TECHSTART",
  Industry: "IT",
  to_BusinessPartnerAddress: [{
    Country: "DE",
    CityName: "Berlin",
    StreetName: "Friedrichstraße",
    HouseNumber: "123",
    PostalCode: "10117",
  }],
});
```

**Sales Orders:**
```typescript
// Create sales order
await sapApi("POST", "/API_SALES_ORDER_SRV/A_SalesOrder", token, {
  SalesOrderType: "OR",
  SalesOrganization: "1010",
  DistributionChannel: "10",
  OrganizationDivision: "00",
  SoldToParty: "CUSTOMER_BP_ID",
  PurchaseOrderByCustomer: "PO-2026-001",
  to_Item: [
    {
      Material: "TG11",
      RequestedQuantity: "10",
      RequestedQuantityUnit: "EA",
      NetPriceAmount: "100.00",
      NetPriceCurrency: "EUR",
    },
    {
      Material: "TG12",
      RequestedQuantity: "5",
      RequestedQuantityUnit: "EA",
      NetPriceAmount: "250.00",
      NetPriceCurrency: "EUR",
    },
  ],
});

// Get sales orders with items
const orders = await sapApi("GET",
  "/API_SALES_ORDER_SRV/A_SalesOrder?$expand=to_Item&$filter=SoldToParty eq 'CUSTOMER_ID'&$top=20&$orderby=CreationDate desc",
  token
);
```

**Purchase Orders:**
```typescript
await sapApi("POST", "/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder", token, {
  PurchaseOrderType: "NB",
  CompanyCode: "1010",
  PurchasingOrganization: "1010",
  PurchasingGroup: "001",
  Supplier: "VENDOR_BP_ID",
  to_PurchaseOrderItem: [{
    Material: "RAW-001",
    OrderQuantity: "1000",
    PurchaseOrderQuantityUnit: "KG",
    NetPriceAmount: "5.50",
    DocumentCurrency: "EUR",
    Plant: "1010",
    StorageLocation: "0001",
  }],
});
```

**Material Master:**
```typescript
// Get material details
const material = await sapApi("GET",
  "/API_PRODUCT_SRV/A_Product('TG11')?$expand=to_Description,to_Plant",
  token
);

// Search materials
const materials = await sapApi("GET",
  "/API_PRODUCT_SRV/A_Product?$filter=startswith(Product,'TG')&$select=Product,ProductType,BaseUnit&$top=100",
  token
);
```

### Step 4: SAP Business One — Service Layer

```typescript
// List items (products)
const items = await b1Api("GET", "/Items?$filter=ItemType eq 'itItems'&$top=50", session);

// Create a sales order
const order = await b1Api("POST", "/Orders", session, {
  CardCode: "C20000",  // Customer code
  DocDate: "2026-02-18",
  DocumentLines: [
    { ItemCode: "A00001", Quantity: 10, UnitPrice: 100 },
    { ItemCode: "A00002", Quantity: 5, UnitPrice: 250 },
  ],
  Comments: "Urgent delivery requested",
});

// Create invoice from sales order
const invoice = await b1Api("POST", "/Invoices", session, {
  CardCode: "C20000",
  DocumentLines: [
    { BaseType: 17, BaseEntry: order.DocEntry, BaseLine: 0 },
    { BaseType: 17, BaseEntry: order.DocEntry, BaseLine: 1 },
  ],
});

// Inventory status
const stock = await b1Api("GET",
  "/Items('A00001')?$select=ItemCode,ItemName,QuantityOnStock,QuantityOrderedByCustomers",
  session
);

// Incoming payments
await b1Api("POST", "/IncomingPayments", session, {
  CardCode: "C20000",
  DocDate: "2026-02-18",
  CashSum: 1750,
  PaymentInvoices: [{
    DocEntry: invoice.DocEntry,
    SumApplied: 1750,
    InvoiceType: "it_Invoice",
  }],
});

// SQL query (B1 query service)
const report = await b1Api("POST", "/SQLQueries('myQuery')/List", session);
```

### Step 5: SAP BTP & CAP (Cloud Application Programming)

**Create a CAP project:**
```bash
npm install -g @sap/cds-dk
cds init my-project && cd my-project
npm install
```

**Define a data model** (`db/schema.cds`):
```cds
namespace my.project;

entity Products {
  key ID     : UUID;
  name       : String(100);
  description: String(1000);
  price      : Decimal(10,2);
  currency   : String(3);
  stock      : Integer;
  category   : Association to Categories;
}

entity Categories {
  key ID   : UUID;
  name     : String(50);
  products : Association to many Products on products.category = $self;
}

entity Orders {
  key ID       : UUID;
  orderDate    : Date;
  customer     : String(100);
  status       : String(20) default 'New';
  items        : Composition of many OrderItems on items.order = $self;
  totalAmount  : Decimal(12,2);
}

entity OrderItems {
  key ID    : UUID;
  order     : Association to Orders;
  product   : Association to Products;
  quantity  : Integer;
  unitPrice : Decimal(10,2);
}
```

**Define a service** (`srv/catalog-service.cds`):
```cds
using my.project from '../db/schema';

service CatalogService @(path: '/catalog') {
  @readonly entity Products as projection on project.Products;
  @readonly entity Categories as projection on project.Categories;

  entity Orders as projection on project.Orders;

  action submitOrder(orderId: UUID) returns Orders;
  function getTopProducts(limit: Integer) returns array of Products;
}
```

**Implement service logic** (`srv/catalog-service.js`):
```javascript
const cds = require("@sap/cds");

module.exports = class CatalogService extends cds.ApplicationService {
  init() {
    const { Products, Orders, OrderItems } = this.entities;

    // Validate stock before order creation
    this.before("CREATE", Orders, async (req) => {
      const { items } = req.data;
      for (const item of items) {
        const product = await SELECT.one.from(Products).where({ ID: item.product_ID });
        if (!product) throw req.reject(404, `Product ${item.product_ID} not found`);
        if (product.stock < item.quantity) {
          throw req.reject(409, `Insufficient stock for ${product.name}: ${product.stock} available`);
        }
        item.unitPrice = product.price;
      }
      req.data.totalAmount = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    });

    // Reduce stock after order creation
    this.after("CREATE", Orders, async (order, req) => {
      for (const item of order.items) {
        await UPDATE(Products).set({ stock: { "-=": item.quantity } }).where({ ID: item.product_ID });
      }
    });

    // Custom action
    this.on("submitOrder", async (req) => {
      const { orderId } = req.data;
      await UPDATE(Orders).set({ status: "Submitted" }).where({ ID: orderId });
      return SELECT.one.from(Orders).where({ ID: orderId });
    });

    // Custom function
    this.on("getTopProducts", async (req) => {
      const { limit = 10 } = req.data;
      return SELECT.from(Products).orderBy("stock desc").limit(limit);
    });

    return super.init();
  }
};
```

**Run locally:**
```bash
cds watch
# API available at http://localhost:4004/catalog
# OData metadata: http://localhost:4004/catalog/$metadata
```

**Deploy to BTP Cloud Foundry:**
```bash
# Add deployment config
cds add hana   # HANA database
cds add xsuaa  # Authentication
cds add mta    # MTA build

# Build and deploy
mbt build
cf deploy mta_archives/my-project_1.0.0.mtar
```

### Step 6: Integration Patterns

**SAP → External system (outbound):**
```typescript
// Poll S/4HANA for new sales orders every 5 minutes
import cron from "node-cron";

let lastCheck = new Date().toISOString();

cron.schedule("*/5 * * * *", async () => {
  const token = await getSAPToken();
  const newOrders = await sapApi("GET",
    `/API_SALES_ORDER_SRV/A_SalesOrder?$filter=CreationDate gt datetime'${lastCheck}'&$expand=to_Item`,
    token
  );

  for (const order of newOrders.d.results) {
    // Sync to external system
    await externalApi.createOrder({
      sapOrderId: order.SalesOrder,
      customer: order.SoldToParty,
      items: order.to_Item.results.map((i: any) => ({
        material: i.Material,
        quantity: parseFloat(i.OrderQuantity),
        price: parseFloat(i.NetAmount),
      })),
      total: parseFloat(order.TotalNetAmount),
      createdAt: order.CreationDate,
    });
    console.log(`Synced order ${order.SalesOrder}`);
  }

  lastCheck = new Date().toISOString();
});
```

**External → SAP (inbound via middleware):**
```typescript
// Receive Shopify orders → create SAP sales orders
app.post("/webhook/shopify/order", async (req, res) => {
  const shopifyOrder = req.body;
  const token = await getSAPToken();

  // Find or create customer in SAP
  let customer = await findCustomerByEmail(token, shopifyOrder.email);
  if (!customer) {
    customer = await createCustomer(token, {
      name: `${shopifyOrder.shipping_address.first_name} ${shopifyOrder.shipping_address.last_name}`,
      email: shopifyOrder.email,
      address: shopifyOrder.shipping_address,
    });
  }

  // Map Shopify line items to SAP materials
  const items = shopifyOrder.line_items.map((item: any) => ({
    Material: item.sku,
    RequestedQuantity: String(item.quantity),
    NetPriceAmount: String(item.price),
    NetPriceCurrency: shopifyOrder.currency,
  }));

  // Create sales order in SAP
  await sapApi("POST", "/API_SALES_ORDER_SRV/A_SalesOrder", token, {
    SalesOrderType: "OR",
    SalesOrganization: "1010",
    DistributionChannel: "10",
    OrganizationDivision: "00",
    SoldToParty: customer.BusinessPartner,
    PurchaseOrderByCustomer: shopifyOrder.name,
    to_Item: items,
  });

  res.sendStatus(200);
});
```

**IDoc integration (classic):**
```typescript
// Parse IDoc XML (e.g., ORDERS05)
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser();
const idoc = parser.parse(idocXml);

const header = idoc.ORDERS05.IDOC.E1EDK01;
const items = Array.isArray(idoc.ORDERS05.IDOC.E1EDP01)
  ? idoc.ORDERS05.IDOC.E1EDP01
  : [idoc.ORDERS05.IDOC.E1EDP01];

console.log("Order:", header.BELNR);
items.forEach((item: any) => {
  console.log(`Material: ${item.E1EDP19?.IDTNR}, Qty: ${item.MENGE}`);
});
```

### Step 7: Reporting & Data Extraction

**Extract data for analytics:**
```typescript
// Sales order analytics — paginated extraction
async function extractAllSalesOrders(token: string) {
  const orders = [];
  let skip = 0;
  const top = 5000;

  while (true) {
    const batch = await sapApi("GET",
      `/API_SALES_ORDER_SRV/A_SalesOrder?$select=SalesOrder,SalesOrderType,SoldToParty,TotalNetAmount,TransactionCurrency,CreationDate,OverallSDProcessStatus&$top=${top}&$skip=${skip}&$orderby=CreationDate desc`,
      token
    );

    const results = batch.d.results;
    if (results.length === 0) break;
    orders.push(...results);
    skip += top;

    if (results.length < top) break;
    await new Promise(r => setTimeout(r, 500)); // Rate limiting
  }

  return orders;
}

// Financial postings
const postings = await sapApi("GET",
  `/API_JOURNALENTRYITEMBASIC_SRV/A_JournalEntryItemBasic?$filter=FiscalYear eq '2026' and CompanyCode eq '1010'&$select=CompanyCode,FiscalYear,FiscalPeriod,GLAccount,AmountInCompanyCodeCurrency,CompanyCodeCurrency&$top=5000`,
  token
);
```

**SAP Analytics Cloud integration (export):**
```typescript
// Export to CSV for SAC import
import { createWriteStream } from "fs";

const writer = createWriteStream("sales_orders.csv");
writer.write("OrderID,Customer,Amount,Currency,Date,Status\n");

const orders = await extractAllSalesOrders(token);
for (const o of orders) {
  writer.write(`${o.SalesOrder},${o.SoldToParty},${o.TotalNetAmount},${o.TransactionCurrency},${o.CreationDate},${o.OverallSDProcessStatus}\n`);
}
writer.end();
```
