---
title: Replace Fragile Cron Jobs with Event-Driven Durable Workflows
slug: replace-cron-jobs-with-event-driven-workflows
description: A fintech team replaces 30+ fragile cron jobs with durable event-driven workflows — using Inngest for event routing and step functions, Temporal for long-running financial processes, and dead letter queues for failure handling — eliminating silent failures, duplicate processing, and the 3 AM PagerDuty alerts that come from cron jobs that nobody understands.
skills: [inngest, temporal-sdk, amqplib, trigger-dev-v3, opentelemetry-js]
category: development
tags: [cron, event-driven, durable-execution, workflows, reliability, fintech]
---

# Replace Fragile Cron Jobs with Event-Driven Durable Workflows

Sam is an SRE at a fintech company. The system has 34 cron jobs running on 3 servers. Nobody knows exactly what each one does. The documentation is a 2-year-old wiki page that says "DO NOT TOUCH." Last month, the settlement cron ran twice due to a clock sync issue and double-charged 200 customers. The month before, the reconciliation job silently failed for 2 weeks because the error went to a log file nobody reads. Sam's weekend PagerDuty rotation is 80% cron-related alerts.

## The Problem: Why Cron Jobs Break

Every cron job has the same failure modes:

1. **No idempotency**: If it runs twice, bad things happen (double charges, duplicate emails)
2. **Silent failures**: Job crashes at 3 AM, nobody notices until a customer complains
3. **No retry logic**: Transient API failure = entire job fails, no partial recovery
4. **No observability**: "Did the job run? Did it succeed? How long did it take?" — nobody knows
5. **Coupling**: Job A must complete before Job B starts, enforced by scheduling Job B 30 minutes later and hoping
6. **State management**: Long-running jobs track state in temp files or database flags; restarts lose progress

## Step 1: Inventory and Classify

Sam maps every cron job to one of four patterns:

```
EVENT-TRIGGERED (replace with event handlers):
  - Send welcome email after signup         → trigger: user.created
  - Generate invoice after payment          → trigger: payment.completed
  - Sync user to CRM after profile update   → trigger: user.updated
  - Send Slack alert on failed payment      → trigger: payment.failed

SCHEDULED (replace with durable scheduled tasks):
  - Daily settlement processing             → schedule: every day at 2 AM
  - Weekly reconciliation report            → schedule: every Monday at 6 AM
  - Monthly billing cycle                   → schedule: 1st of month
  - Hourly metrics aggregation              → schedule: every hour

LONG-RUNNING (replace with durable workflows):
  - End-of-day batch settlement             → workflow: multi-step with retries
  - Customer onboarding pipeline            → workflow: days-long, multi-step
  - Annual compliance report generation     → workflow: hours-long, data-intensive
```

## Step 2: Event-Triggered Jobs → Inngest Functions

The simplest migration: jobs that react to events don't need schedules at all. They should run when the event happens, not on a timer.

```typescript
// functions/payment-events.ts — Event-driven, replaces 4 cron jobs
import { inngest } from "./client";

// Was: cron job running every 5 minutes checking for new payments
// Now: triggers immediately when payment completes
export const generateInvoice = inngest.createFunction(
  {
    id: "generate-invoice",
    retries: 3,
    concurrency: { limit: 10 },           // Max 10 concurrent invoice generations
    idempotency: "event.data.paymentId",   // Same payment never processed twice
  },
  { event: "payment/completed" },
  async ({ event, step }) => {
    const payment = event.data;

    // Step 1: Generate PDF invoice (retries independently)
    const invoice = await step.run("generate-pdf", async () => {
      return await invoiceService.generatePDF({
        customerId: payment.customerId,
        amount: payment.amount,
        currency: payment.currency,
        items: payment.lineItems,
      });
    });

    // Step 2: Store in S3
    const url = await step.run("upload-to-s3", async () => {
      return await s3.upload(`invoices/${invoice.id}.pdf`, invoice.pdf);
    });

    // Step 3: Send to customer
    await step.run("send-email", async () => {
      await email.send({
        to: payment.customerEmail,
        template: "invoice",
        data: { invoiceUrl: url, amount: payment.amount },
      });
    });

    // Step 4: Update accounting system
    await step.run("sync-accounting", async () => {
      await xero.createInvoice({
        contactId: payment.xeroContactId,
        amount: payment.amount,
        invoiceNumber: invoice.id,
      });
    });

    return { invoiceId: invoice.id, url };
  },
);

// Was: cron job running every minute checking for failed payments
// Now: triggers immediately on failure
export const handleFailedPayment = inngest.createFunction(
  {
    id: "handle-failed-payment",
    retries: 0,                            // Don't retry the handler itself
  },
  { event: "payment/failed" },
  async ({ event, step }) => {
    const { customerId, amount, failureReason, attemptCount } = event.data;

    // Notify team
    await step.run("notify-slack", async () => {
      await slack.send("#payment-alerts", {
        text: `⚠️ Payment failed for customer ${customerId}: ${failureReason} (attempt ${attemptCount})`,
      });
    });

    // If 3rd failure, escalate
    if (attemptCount >= 3) {
      await step.run("create-ticket", async () => {
        await linear.createIssue({
          teamId: "payments",
          title: `Recurring payment failure: ${customerId}`,
          priority: 2,
          description: `Customer has ${attemptCount} consecutive failed payments. Last failure: ${failureReason}. Amount: ${amount}`,
        });
      });

      // Downgrade to free plan after 3 failures
      await step.run("downgrade-plan", async () => {
        await db.customers.update(customerId, { plan: "free", downgradeReason: "payment_failure" });
      });
    }
  },
);
```

Each step is independently retryable. If S3 upload fails, it retries just the upload — not the entire PDF generation. If the email service is down, the invoice is already generated and stored; only the email retries.

## Step 3: Daily Settlement → Durable Workflow

The settlement process is the scariest cron job: it moves money. It must be idempotent, resumable, and auditable.

```typescript
// functions/settlement.ts — Durable workflow, replaces the most dangerous cron job
export const dailySettlement = inngest.createFunction(
  {
    id: "daily-settlement",
    retries: 5,
    concurrency: { limit: 1 },            // NEVER run two settlements simultaneously
    idempotency: "event.data.settlementDate", // Same date never processed twice
  },
  { cron: "0 2 * * *" },                  // 2 AM daily (but now with all the safety guarantees)
  async ({ step }) => {
    const today = new Date().toISOString().split("T")[0];

    // Step 1: Lock settlement (prevent concurrent runs)
    const lock = await step.run("acquire-lock", async () => {
      const existing = await db.settlements.findFirst({
        where: { date: today, status: { in: ["processing", "completed"] } },
      });
      if (existing) throw new Error(`Settlement already ${existing.status} for ${today}`);

      return db.settlements.create({
        data: { date: today, status: "processing", startedAt: new Date() },
      });
    });

    // Step 2: Gather all pending transactions
    const transactions = await step.run("gather-transactions", async () => {
      return db.transactions.findMany({
        where: { status: "pending", createdAt: { lt: new Date(`${today}T00:00:00Z`) } },
      });
    });

    if (transactions.length === 0) {
      await step.run("mark-empty", async () => {
        await db.settlements.update(lock.id, { status: "completed", transactionCount: 0 });
      });
      return { settled: 0 };
    }

    // Step 3: Process in batches (each batch is a separate step = separate retry)
    const BATCH_SIZE = 100;
    let settled = 0;

    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE);
      const batchResult = await step.run(`settle-batch-${i}`, async () => {
        return await paymentProcessor.settleBatch(batch.map(t => ({
          transactionId: t.id,
          amount: t.amount,
          destination: t.merchantBankAccount,
        })));
      });

      settled += batchResult.successCount;

      // Update progress (visible in dashboard)
      await step.run(`update-progress-${i}`, async () => {
        await db.settlements.update(lock.id, {
          processedCount: settled,
          totalCount: transactions.length,
        });
      });
    }

    // Step 4: Generate report
    await step.run("generate-report", async () => {
      const report = await generateSettlementReport(today, settled, transactions.length);
      await email.send({
        to: "finance@ourcompany.com",
        template: "settlement-report",
        data: { date: today, settled, total: transactions.length, reportUrl: report.url },
      });
    });

    // Step 5: Mark complete
    await step.run("mark-complete", async () => {
      await db.settlements.update(lock.id, {
        status: "completed",
        completedAt: new Date(),
        transactionCount: settled,
      });
    });

    return { date: today, settled, total: transactions.length };
  },
);
```

## Results

After migrating all 34 cron jobs over 3 months:

- **Silent failures eliminated**: Every function has built-in alerting; failures are visible in Inngest dashboard within seconds
- **Double-processing eliminated**: Idempotency keys prevent duplicate runs; the settlement double-charge incident is now architecturally impossible
- **PagerDuty alerts**: Down 85% on weekends; remaining 15% are genuine infrastructure issues, not cron mysteries
- **Retry success rate**: 94% of transient failures self-heal via automatic retries; only 6% need human intervention
- **Settlement reliability**: Zero settlement failures in 3 months (was 2-3/month with cron)
- **Observability**: Every step of every workflow is visible in the dashboard — when it ran, how long it took, what it returned
- **Development speed**: New event handlers ship in hours, not days; no crontab editing, no server SSH
- **Documentation**: The code IS the documentation; function definitions describe exactly what happens and when
- **Cost**: $89/month for Inngest (was $0 for cron, but $50K+/year in incident response and customer refunds)
