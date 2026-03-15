---
title: Automate Browser Workflows with AI Agents
slug: automate-browser-workflows-with-ai-agents
description: Build AI-powered browser automation that navigates web apps, fills forms, extracts data, and completes multi-step workflows using Stagehand for natural language browser control, BrowserBase for cloud browser infrastructure, and Playwright for reliable fallback — replacing 40 hours per week of manual data entry for a logistics company processing 200 shipment orders daily.
skills: [stagehand, browserbase, playwright-testing]
category: data-ai
tags: [browser-automation, ai-agent, computer-use, rpa, web-automation, scraping]
---

# Automate Browser Workflows with AI Agents

Kenji manages operations at a 30-person logistics company. His team spends 40 hours per week copying shipment data between three web portals that don't have APIs: the carrier's booking system, the customs declaration portal, and their client's order management platform. Five people rotate through the task — open the carrier site, find the tracking number, copy it to customs, fill in 14 fields, download the PDF, upload it to the client portal. It's mind-numbing, error-prone, and costs $4,200/month in labor.

Traditional RPA tools (UiPath, Automation Anywhere) require brittle selectors that break every time a portal updates its UI. Kenji needs something that can look at a web page like a human does and figure out what to click, even when the layout changes.

## Step 1: AI Browser Control with Stagehand

Stagehand lets you write browser automation in natural language. Instead of `page.click('#submit-btn-v3')` that breaks when the ID changes, you write `stagehand.act("click the submit button")` and the AI finds it regardless of how the page is structured.

```typescript
// src/automation/shipment-processor.ts — Main automation flow
import { Stagehand } from "@browserbasehq/stagehand";

interface ShipmentOrder {
  trackingNumber: string;
  origin: string;
  destination: string;
  weight: number;
  dimensions: string;
  declaredValue: number;
  hsCode: string;
  recipientName: string;
  recipientAddress: string;
}

async function processShipment(order: ShipmentOrder): Promise<{
  customsRef: string;
  carrierBooking: string;
  clientConfirmation: string;
}> {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",                   // Run in cloud browser (not local)
    modelName: "gpt-4o",
    modelClientOptions: { apiKey: process.env.OPENAI_API_KEY },
    enableCaching: true,                  // Cache AI decisions for repeated patterns
  });

  await stagehand.init();
  const page = stagehand.page;

  // ---- STEP 1: Book shipment with carrier ----
  await page.goto("https://carrier-portal.example.com/login");

  await stagehand.act({
    action: "Log in with username %username% and password %password%",
    variables: {
      username: process.env.CARRIER_USER!,
      password: process.env.CARRIER_PASS!,
    },
  });

  await stagehand.act({ action: "Click on 'New Booking' or 'Create Shipment'" });

  // Fill in shipment details — Stagehand finds the right fields
  await stagehand.act({
    action: "Fill in the shipment form with these details: origin %origin%, destination %dest%, weight %weight% kg, dimensions %dims%",
    variables: {
      origin: order.origin,
      dest: order.destination,
      weight: String(order.weight),
      dims: order.dimensions,
    },
  });

  await stagehand.act({ action: "Submit the booking form" });

  // Extract the booking confirmation number
  const bookingResult = await stagehand.extract({
    instruction: "Extract the booking confirmation number or reference ID from this page",
    schema: {
      type: "object",
      properties: {
        bookingNumber: { type: "string", description: "The booking reference number" },
        estimatedDelivery: { type: "string", description: "Estimated delivery date" },
      },
      required: ["bookingNumber"],
    },
  });

  console.log(`Carrier booking: ${bookingResult.bookingNumber}`);

  // ---- STEP 2: Submit customs declaration ----
  await page.goto("https://customs.example.gov/declarations");

  await stagehand.act({
    action: "Start a new import declaration",
  });

  await stagehand.act({
    action: "Fill the customs form: tracking number %tracking%, HS code %hs%, declared value %value% USD, recipient %name% at %address%",
    variables: {
      tracking: order.trackingNumber,
      hs: order.hsCode,
      value: String(order.declaredValue),
      name: order.recipientName,
      address: order.recipientAddress,
    },
  });

  await stagehand.act({ action: "Submit the declaration" });

  const customsResult = await stagehand.extract({
    instruction: "Extract the customs reference number and status",
    schema: {
      type: "object",
      properties: {
        referenceNumber: { type: "string" },
        status: { type: "string" },
      },
      required: ["referenceNumber"],
    },
  });

  // ---- STEP 3: Download customs PDF and upload to client portal ----
  await stagehand.act({ action: "Download the declaration PDF" });

  // Wait for download, then navigate to client portal
  await page.goto("https://client-orders.example.com");

  await stagehand.act({
    action: "Find order %tracking% and upload the customs document",
    variables: { tracking: order.trackingNumber },
  });

  await stagehand.act({
    action: "Mark the order as 'Customs Cleared' and add note: Booking %booking%, Customs ref %customs%",
    variables: {
      booking: bookingResult.bookingNumber,
      customs: customsResult.referenceNumber,
    },
  });

  await stagehand.close();

  return {
    customsRef: customsResult.referenceNumber,
    carrierBooking: bookingResult.bookingNumber,
    clientConfirmation: order.trackingNumber,
  };
}
```

## Step 2: Cloud Browser Infrastructure with BrowserBase

Running 200 browser sessions locally would melt Kenji's office server. BrowserBase provides cloud-hosted browsers with residential proxies, session recording, and parallel execution — each shipment gets its own isolated browser.

```typescript
// src/automation/browser-pool.ts — Parallel processing with BrowserBase
import Browserbase from "@browserbasehq/sdk";

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

async function processOrderBatch(orders: ShipmentOrder[]): Promise<ProcessingResult[]> {
  // Process up to 10 orders in parallel
  const CONCURRENCY = 10;
  const results: ProcessingResult[] = [];

  for (let i = 0; i < orders.length; i += CONCURRENCY) {
    const batch = orders.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.allSettled(
      batch.map(async (order) => {
        // Each order gets its own cloud browser session
        const session = await bb.sessions.create({
          projectId: process.env.BROWSERBASE_PROJECT_ID!,
          browserSettings: {
            fingerprint: { locales: ["en-US"], screen: { maxWidth: 1920 } },
          },
          proxies: true,                   // Residential proxy to avoid blocks
          keepAlive: false,                // Auto-cleanup after use
        });

        try {
          const result = await processShipment(order);
          return { order: order.trackingNumber, ...result, status: "success" };
        } catch (error) {
          // Session recording available for debugging
          const debugUrl = `https://browserbase.com/sessions/${session.id}`;
          console.error(`Failed ${order.trackingNumber}: ${error.message}`);
          console.error(`Debug recording: ${debugUrl}`);
          return { order: order.trackingNumber, status: "failed", error: error.message, debugUrl };
        }
      })
    );

    results.push(...batchResults.map(r => r.status === "fulfilled" ? r.value : r.reason));
  }

  return results;
}
```

## Step 3: Reliable Fallback with Playwright

When AI-based navigation is overkill (login pages with stable selectors), Playwright handles it faster and cheaper. The system uses Stagehand for dynamic pages and Playwright for predictable ones.

```typescript
// src/automation/hybrid-approach.ts — Stagehand + Playwright
import { Stagehand } from "@browserbasehq/stagehand";

async function hybridWorkflow(order: ShipmentOrder) {
  const stagehand = new Stagehand({ env: "BROWSERBASE", modelName: "gpt-4o" });
  await stagehand.init();
  const page = stagehand.page;

  // Playwright for stable pages (fast, no AI cost)
  await page.goto("https://carrier-portal.example.com/login");
  await page.fill("#username", process.env.CARRIER_USER!);
  await page.fill("#password", process.env.CARRIER_PASS!);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");

  // Stagehand for dynamic pages (AI handles layout changes)
  await stagehand.act({ action: "Navigate to the shipment booking section" });
  await stagehand.act({
    action: "Create a new shipment from %origin% to %dest%, weight %weight% kg",
    variables: {
      origin: order.origin,
      dest: order.destination,
      weight: String(order.weight),
    },
  });

  // Playwright for extraction when DOM is predictable
  const bookingNumber = await page.textContent(".booking-reference");

  // Stagehand for extraction when DOM is unpredictable
  const customsData = await stagehand.extract({
    instruction: "Extract all customs form fields and their current values",
    schema: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
            },
          },
        },
      },
    },
  });

  await stagehand.close();
}
```

## Step 4: Scheduling and Error Recovery

The system runs every 30 minutes, picks up new orders, processes them, and retries failures with exponential backoff.

```typescript
// src/scheduler.ts — Order processing scheduler
import { CronJob } from "cron";

const job = new CronJob("*/30 * * * *", async () => {
  // Fetch unprocessed orders from database
  const orders = await db.query.orders.findMany({
    where: and(
      eq(orders.status, "pending"),
      lt(orders.retryCount, 3),          // Max 3 retries
    ),
    limit: 50,
  });

  if (orders.length === 0) return;
  console.log(`Processing ${orders.length} orders`);

  const results = await processOrderBatch(orders);

  for (const result of results) {
    if (result.status === "success") {
      await db.update(orders)
        .set({
          status: "completed",
          customsRef: result.customsRef,
          carrierBooking: result.carrierBooking,
          completedAt: new Date(),
        })
        .where(eq(orders.trackingNumber, result.order));
    } else {
      await db.update(orders)
        .set({
          status: "retry",
          retryCount: sql`retry_count + 1`,
          lastError: result.error,
          nextRetryAt: new Date(Date.now() + 2 ** result.retryCount * 60000),
        })
        .where(eq(orders.trackingNumber, result.order));
    }
  }
});

job.start();
```

## Results After 60 Days

The automation processes 200 orders per day with a 94% first-attempt success rate. The remaining 6% fail on CAPTCHA challenges or portal downtime and succeed on retry. Processing time dropped from 12 minutes per order (human) to 45 seconds (AI agent).

- **Labor savings**: 40 hours/week → 2 hours/week (monitoring + exception handling)
- **Cost**: $180/month (BrowserBase sessions + OpenAI) vs $4,200/month (manual labor)
- **Error rate**: 4.2% → 0.3% (humans make typos; AI copies data exactly)
- **Processing speed**: 12 min/order → 45 seconds/order (26x faster)
- **Debugging**: Every failed session has a video recording in BrowserBase for instant root-cause analysis
