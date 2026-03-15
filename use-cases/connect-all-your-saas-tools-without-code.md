---
title: Connect All Your SaaS Tools Without Writing Code
slug: connect-all-your-saas-tools-without-code
description: Build automated workflows connecting Stripe, Slack, HubSpot, Notion, and Google Sheets using Pipedream for developer-friendly integrations with code steps, Make.com for visual no-code flows, and Activepieces for self-hosted automation — eliminating 25 hours per week of manual data entry for a 15-person operations team.
skills: [pipedream, make-com, activepieces]
category: automation
tags: [automation, integration, no-code, workflow, saas-integration, iPaaS]
---

# Connect All Your SaaS Tools Without Writing Code

Yuki runs operations at a 15-person B2B startup using 12 SaaS tools that don't talk to each other. When a deal closes in HubSpot, someone manually creates the customer in Stripe, adds them to the onboarding Notion board, sends a welcome email via Loops, and posts a celebration in Slack. When a support ticket escalates in Intercom, someone copies the details into a Linear issue and pings the engineering lead.

The team spends 25 hours per week on manual data shuffling between tools. Every handoff is a chance for something to fall through the cracks — and it does, weekly.

## Step 1: Developer Workflows with Pipedream

For workflows that need custom logic — data transformation, conditional branching, API calls with authentication — Pipedream gives developers a serverless workflow engine with 2,000+ app integrations and full Node.js/Python code steps.

```javascript
// Pipedream workflow: New HubSpot Deal → Stripe + Notion + Slack
// Trigger: HubSpot — Deal Stage Changed to "Closed Won"

// Step 1: Transform HubSpot deal data
export default defineComponent({
  async run({ steps }) {
    const deal = steps.trigger.event;

    return {
      companyName: deal.properties.dealname,
      contactEmail: deal.properties.email,
      amount: parseFloat(deal.properties.amount),
      plan: deal.properties.plan_type || "pro",    // Custom HubSpot property
      annualBilling: deal.properties.billing_cycle === "annual",
      salesRep: deal.properties.hubspot_owner_id,
      closeDate: deal.properties.closedate,
    };
  },
});

// Step 2: Create Stripe customer and subscription
export default defineComponent({
  props: {
    stripe: { type: "app", app: "stripe" },
  },
  async run({ steps }) {
    const deal = steps.transform.$return_value;
    const stripe = require("stripe")(this.stripe.$auth.api_key);

    // Create customer
    const customer = await stripe.customers.create({
      email: deal.contactEmail,
      name: deal.companyName,
      metadata: { hubspot_deal: steps.trigger.event.id, sales_rep: deal.salesRep },
    });

    // Create subscription
    const priceId = deal.annualBilling
      ? process.env[`STRIPE_${deal.plan.toUpperCase()}_ANNUAL`]
      : process.env[`STRIPE_${deal.plan.toUpperCase()}_MONTHLY`];

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      trial_period_days: 14,
    });

    return { customerId: customer.id, subscriptionId: subscription.id };
  },
});

// Step 3: Create Notion onboarding card
export default defineComponent({
  props: {
    notion: { type: "app", app: "notion" },
  },
  async run({ steps }) {
    const deal = steps.transform.$return_value;
    const { Client } = require("@notionhq/client");
    const notion = new Client({ auth: this.notion.$auth.oauth_access_token });

    await notion.pages.create({
      parent: { database_id: process.env.NOTION_ONBOARDING_DB },
      properties: {
        "Company": { title: [{ text: { content: deal.companyName } }] },
        "Contact": { email: deal.contactEmail },
        "Plan": { select: { name: deal.plan } },
        "ARR": { number: deal.annualBilling ? deal.amount : deal.amount * 12 },
        "Status": { select: { name: "Onboarding" } },
        "Sales Rep": { rich_text: [{ text: { content: deal.salesRep } }] },
      },
    });
  },
});

// Step 4: Celebrate in Slack
export default defineComponent({
  props: {
    slack: { type: "app", app: "slack" },
  },
  async run({ steps }) {
    const deal = steps.transform.$return_value;
    const stripe = steps.create_stripe.$return_value;

    await this.slack.chat.postMessage({
      channel: "#wins",
      text: `🎉 *New customer!* ${deal.companyName} signed up for ${deal.plan} plan!\n` +
            `💰 ${deal.annualBilling ? "Annual" : "Monthly"}: $${deal.amount.toLocaleString()}\n` +
            `📧 ${deal.contactEmail}\n` +
            `Stripe: https://dashboard.stripe.com/customers/${stripe.customerId}`,
    });
  },
});
```

## Step 2: No-Code Flows with Make.com

For non-technical team members who need to build their own automations, Make.com (formerly Integromat) provides a visual builder. Yuki trains the operations team to build simple flows without involving engineering.

```markdown
## Make.com Scenario: Support Escalation → Linear + Slack

### Visual Flow:
[Intercom Webhook] → [Filter: priority = urgent] → [Router]
    ├→ [Linear: Create Issue] → [Intercom: Add Note with Linear link]
    └→ [Slack: Send Message to #eng-escalations]

### Configuration:
1. **Trigger**: Intercom webhook — "Conversation tag added: escalation"
2. **Filter**: Only proceed if conversation.priority == "urgent"
3. **Linear module**:
   - Team: Engineering
   - Title: "🚨 Escalation: {{intercom.conversation.subject}}"
   - Description: "Customer: {{intercom.conversation.user.email}}\n\n{{intercom.conversation.last_message}}"
   - Priority: Urgent
   - Label: customer-escalation
4. **Slack module**:
   - Channel: #eng-escalations
   - Message: "🚨 Urgent escalation from {{intercom.conversation.user.name}}\nLinear: {{linear.issue.url}}\nIntercom: {{intercom.conversation.url}}"
5. **Intercom module**:
   - Add internal note: "Linear issue created: {{linear.issue.url}}"

### Schedule: Real-time (instant webhook trigger)
```

## Step 3: Self-Hosted Automation with Activepieces

For workflows involving sensitive data (payroll, HR, financial reports), Yuki self-hosts Activepieces — an open-source alternative that keeps data on their infrastructure.

```yaml
# docker-compose.yml — Self-hosted Activepieces
version: "3.8"
services:
  activepieces:
    image: activepieces/activepieces:latest
    ports:
      - "8080:80"
    environment:
      AP_ENGINE_EXECUTABLE_PATH: "dist/packages/engine/main.js"
      AP_ENVIRONMENT: "prod"
      AP_FRONTEND_URL: "https://automations.internal.company.com"
      AP_ENCRYPTION_KEY: "${AP_ENCRYPTION_KEY}"
      AP_JWT_SECRET: "${AP_JWT_SECRET}"
      AP_POSTGRES_HOST: "postgres"
      AP_POSTGRES_DATABASE: "activepieces"
      AP_POSTGRES_USERNAME: "${POSTGRES_USER}"
      AP_POSTGRES_PASSWORD: "${POSTGRES_PASS}"
      AP_REDIS_HOST: "redis"
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16
    volumes:
      - pg_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: activepieces
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASS}

  redis:
    image: redis:7
    volumes:
      - redis_data:/data

volumes:
  pg_data:
  redis_data:
```

## Results After 30 Days

- **Manual data entry**: 25 hours/week → 3 hours/week (exception handling only)
- **Workflows automated**: 14 cross-app flows running 24/7
- **Error rate**: 8% (manual copying) → 0.1% (automated, validated)
- **Mean time to onboard**: 4 hours → 15 minutes (automated provisioning)
- **Escalation response**: 2 hours → 4 minutes (instant routing)
- **Cost**: Pipedream $29/mo + Make.com $16/mo + Activepieces $0 (self-hosted) = $45/month vs $4,200/month labor
