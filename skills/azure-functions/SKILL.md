---
name: azure-functions
description: |
  Build serverless applications with Azure Functions. Create HTTP and event-driven
  functions with input/output bindings, configure triggers for queues, timers,
  and blob storage. Use Durable Functions for stateful orchestration workflows.
license: Apache-2.0
compatibility: 'azure-cli, Azure Functions Core Tools 4.x, Node.js 22 or 24 (v4 programming model)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - azure
    - functions
    - serverless
    - durable-functions
---

# Azure Functions

## Overview

Azure Functions is a serverless compute service that runs event-driven code without managing infrastructure. Its unique binding system connects to Azure services declaratively, and Durable Functions enable complex stateful workflows.

## Instructions

### Core Concepts

- **Trigger** — what causes a function to run (HTTP, timer, queue, blob, etc.)
- **Input Binding** — declaratively read data from a service when function runs
- **Output Binding** — declaratively write data to a service after function runs
- **Function App** — a container for one or more functions sharing configuration
- **Hosting Plan** — Flex Consumption (recommended serverless plan), Premium, Dedicated, or Container Apps. The older Consumption plan is legacy: Linux Consumption retires on 30 September 2028 (Microsoft Learn), so do not create new apps on it
- **Durable Functions** — extension for stateful orchestrations and workflows

### Project Setup

```bash
# Create a new function project
func init order-functions --worker-runtime node --language javascript --model V4
cd order-functions
```

```bash
# Create a new HTTP-triggered function
func new --name handleWebhook --template "HTTP trigger" --authlevel function
```

```bash
# Create Azure resources (Flex Consumption, Linux)
az group create --name orders-rg --location westeurope

az storage account create \
  --name ordersfuncstore01 \
  --resource-group orders-rg \
  --sku Standard_LRS

az functionapp create \
  --name orders-functions-we \
  --resource-group orders-rg \
  --storage-account ordersfuncstore01 \
  --flexconsumption-location westeurope \
  --runtime node \
  --runtime-version 22
```

The app name must be globally unique. The command also creates an Application Insights instance. Check supported Node.js versions in the Node.js developer reference (24.x and 22.x for the v4 model). With `func init ... --model V4` the functions live in `src/functions/*.js` and are registered through `app.http()`, `app.timer()` and so on, which is what the examples below use.

### HTTP Functions

```javascript
// src/functions/handleWebhook.js — HTTP triggered function
const { app } = require('@azure/functions');

app.http('handleWebhook', {
    methods: ['POST'],
    authLevel: 'function',
    route: 'webhooks/{source}',
    handler: async (request, context) => {
        // authLevel 'function' requires the x-functions-key header or ?code= query parameter
        const source = request.params.source;
        const body = await request.json();

        context.log(`Webhook from ${source}, ${Object.keys(body).length} fields`);

        // Process webhook (processWebhook is your own function)
        const result = await processWebhook(source, body);

        return {
            status: 200,
            jsonBody: { received: true, id: result.id }
        };
    }
});
```

### Timer Functions

```javascript
// src/functions/dailyCleanup.js — runs on a CRON schedule
const { app } = require('@azure/functions');

app.timer('dailyCleanup', {
    schedule: '0 0 2 * * *', // NCRONTAB: {second} {minute} {hour} {day} {month} {day-of-week}; 2:00 AM UTC daily
    handler: async (myTimer, context) => {
        context.log('Running daily cleanup at', new Date().toISOString());

        const deleted = await cleanupExpiredSessions();   // your own function
        context.log(`Deleted ${deleted} expired sessions`);
    }
});
```

### Queue Trigger with Output Binding

```javascript
// src/functions/processOrder.js — triggered by queue, writes to Cosmos DB
const { app, output } = require('@azure/functions');

const cosmosOutput = output.cosmosDB({
    databaseName: 'app-db',
    containerName: 'processed-orders',
    connection: 'CosmosDBConnection',   // app setting name, or prefix of CosmosDBConnection__accountEndpoint for managed identity
    createIfNotExists: true
});

app.storageQueue('processOrder', {
    queueName: 'order-queue',   // lowercase letters, numbers and hyphens only
    connection: 'AzureWebJobsStorage',
    return: cosmosOutput,
    handler: async (queueItem, context) => {
        context.log('Processing order:', queueItem.orderId);

        const processedOrder = {
            id: queueItem.orderId,
            ...queueItem,
            status: 'processed',
            processedAt: new Date().toISOString()
        };

        // Returned value goes to Cosmos DB via output binding
        return processedOrder;
    }
});
```

### Blob Trigger

```javascript
// src/functions/processImage.js — triggered when blob is uploaded
// source: 'EventGrid' is the event-based trigger: lower latency, and the only kind Flex Consumption supports.
// It needs an Event Grid subscription on the storage account (see the blob trigger docs).
const { app } = require('@azure/functions');

app.storageBlob('processImage', {
    path: 'uploads/{name}',
    source: 'EventGrid',
    connection: 'AzureWebJobsStorage',
    handler: async (blob, context) => {
        const fileName = context.triggerMetadata.name;
        context.log(`Processing blob: ${fileName}, size: ${blob.length} bytes`);

        // Resize image, extract metadata, etc.
        await generateThumbnail(blob, fileName);
    }
});
```

### Durable Functions

```javascript
// src/functions/orderOrchestrator.js — orchestrate multi-step order processing
const { app } = require('@azure/functions');
const df = require('durable-functions');

// Orchestrator function
df.app.orchestration('orderOrchestrator', function* (context) {
    const order = context.df.getInput();

    // Step 1: Validate inventory
    const inventory = yield context.df.callActivity('checkInventory', order.items);
    if (!inventory.available) {
        yield context.df.callActivity('notifyCustomer', {
            orderId: order.id,
            message: 'Items out of stock'
        });
        return { status: 'cancelled', reason: 'out_of_stock' };
    }

    // Step 2: Process payment
    const payment = yield context.df.callActivity('processPayment', {
        amount: order.total,
        customerId: order.customerId
    });

    // Step 3: Ship order (with retry)
    const retryOptions = new df.RetryOptions(5000, 3); // 5s interval, 3 attempts
    const shipment = yield context.df.callActivityWithRetry(
        'shipOrder', retryOptions, order
    );

    // Step 4: Notify customer
    yield context.df.callActivity('notifyCustomer', {
        orderId: order.id,
        message: `Shipped! Tracking: ${shipment.trackingNumber}`
    });

    return { status: 'completed', tracking: shipment.trackingNumber };
});

// Activity functions
df.app.activity('checkInventory', { handler: async (items) => { /* ... */ } });
df.app.activity('processPayment', { handler: async (payment) => { /* ... */ } });
df.app.activity('shipOrder', { handler: async (order) => { /* ... */ } });
df.app.activity('notifyCustomer', { handler: async (notification) => { /* ... */ } });

// HTTP starter (client function)
df.app.client.http('startOrder', {
    route: 'orders/start',
    methods: ['POST'],
    handler: async (request, client, context) => {
        const order = await request.json();
        const instanceId = await client.startNew('orderOrchestrator', { input: order });
        context.log(`Started orchestration ${instanceId}`);
        return client.createCheckStatusResponse(request, instanceId);
    }
});
```

Install the package with `npm install durable-functions` (3.x). Orchestrator code is replayed, so it must be deterministic: no `Date.now()`, random numbers, direct I/O or `fetch` in the orchestrator, only in activities; use `context.df.currentUtcDateTime` for time. Durable Functions also need a storage connection (`AzureWebJobsStorage`), which local development provides through Azurite or a real account.

### Deployment

```bash
# Deploy to Azure (run from the project root)
func azure functionapp publish orders-functions-we
```

```bash
# Set application settings
az functionapp config appsettings set \
  --name orders-functions-we \
  --resource-group orders-rg \
  --settings "CosmosDBConnection__accountEndpoint=https://orders-cosmos.documents.azure.com:443/"
```

```bash
# View function logs
func azure functionapp logstream orders-functions-we
```

## Examples

### Example 1: Webhook receiver that queues work

**User request:** "I need an endpoint that receives Stripe-style webhooks and processes each one reliably, deployed to Azure."

**Actions:**
1. Run `func init payments-hooks --worker-runtime node --language javascript --model V4`.
2. Add an HTTP function (`authLevel: 'function'`) that validates the signature and returns the body quickly, writing the event to a storage queue with an output binding.
3. Add a queue-triggered function that does the slow processing.
4. Create the app with `az functionapp create ... --flexconsumption-location westeurope --runtime node --runtime-version 22` and run `func azure functionapp publish`.

**Output:** The endpoint `https://orders-functions-we.azurewebsites.net/api/webhooks/{source}?code=$FUNCTION_KEY` answers within milliseconds, and `func azure functionapp logstream` shows each queued event processed.

### Example 2: Nightly cleanup and order workflow

**User request:** "Delete expired sessions every night and run order fulfilment as a multi-step workflow with retries."

**Actions:**
1. Add the timer function with `schedule: '0 0 2 * * *'` for the nightly cleanup (NCRONTAB expression, UTC by default).
2. Install `durable-functions`, add the orchestrator with activities, and the `df.app.client.http` starter.
3. Wrap the shipping activity in `callActivityWithRetry` with `new df.RetryOptions(5000, 3)`.

**Output:** A POST to `/api/orders/start` returns a status-query payload (`statusQueryGetUri`) and the orchestration reaches `Completed` with the tracking number.

## Guidelines

- Use bindings to avoid boilerplate for reading/writing Azure services
- Choose Flex Consumption for most new serverless apps (scales to zero, supports virtual networks); Premium when you need no cold starts or long-running work; avoid the legacy Consumption plan
- Use Durable Functions for multi-step workflows instead of chaining queues
- Store settings in Application Settings (or Key Vault references), never in code; `authLevel: 'anonymous'` exposes the endpoint to the internet, so use it only behind your own auth
- HTTP-triggered functions must answer within 230 seconds whatever the plan; hand longer work to a queue or Durable Functions
- Use managed identities instead of secrets where possible: give the app's identity a data-plane role and set `<NAME>__accountEndpoint` (Cosmos DB) or the matching `__` settings instead of a key
- Enable Application Insights for monitoring and diagnostics
- Keep functions small and focused — one trigger, one purpose
