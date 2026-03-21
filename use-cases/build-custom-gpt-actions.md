---
title: Build Custom GPT Actions
slug: build-custom-gpt-actions
description: Connect ChatGPT to your API or internal tools using Custom GPT Actions — define an OpenAPI schema, add authentication, handle database queries and record creation, and publish to the GPT Store.
skills:
  - openai
difficulty: intermediate
time_estimate: "4 hours"
category: ai
tags:
  - chatgpt
  - gpt-actions
  - openapi
  - ai-assistant
  - saas
  - automation
---

# Build Custom GPT Actions

Sofia runs customer success at a SaaS. Her team constantly switches between ChatGPT and their CRM — ask ChatGPT something, then go look up the customer in HubSpot, then back to ChatGPT. She wants a custom GPT that can query their customer database, look up subscription status, create support tickets, and send emails — all from one chat interface.

## Step 1 — Define the OpenAPI Schema

The Actions schema tells ChatGPT what your API can do. Write it clearly — GPT reads it to decide which endpoint to call and which parameters to pass.

```yaml
# openapi.yaml — Actions schema for the customer success GPT.
# Upload this in the GPT editor under "Actions" → "Import from URL" or paste directly.

openapi: 3.1.0
info:
  title: Customer Success API
  description: >
    Query customer data, subscription status, and support tickets.
    Create tickets and send follow-up emails directly from chat.
  version: 1.0.0

servers:
  - url: https://api.yourapp.com/gpt-actions
    description: Production server

paths:
  /customers/search:
    get:
      operationId: searchCustomers
      summary: Search for customers by name, email, or company
      description: >
        Returns matching customers with their plan, MRR, health score,
        and last contact date. Use this when the user asks about a specific
        customer or company.
      parameters:
        - name: q
          in: query
          required: true
          description: Search query (name, email, or company name)
          schema:
            type: string
        - name: limit
          in: query
          required: false
          schema:
            type: integer
            default: 5
            maximum: 20
      responses:
        "200":
          description: List of matching customers
          content:
            application/json:
              schema:
                type: object
                properties:
                  customers:
                    type: array
                    items:
                      $ref: "#/components/schemas/Customer"

  /customers/{customerId}/subscription:
    get:
      operationId: getSubscriptionStatus
      summary: Get a customer's subscription details
      description: >
        Returns current plan, MRR, billing cycle, trial status,
        upcoming renewal date, and any payment issues.
      parameters:
        - name: customerId
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Subscription details
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Subscription"

  /tickets:
    post:
      operationId: createSupportTicket
      summary: Create a support ticket for a customer
      description: >
        Creates a new support ticket in the helpdesk system.
        Use when the user asks to create, open, or log a ticket for a customer.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [customerId, subject, description, priority]
              properties:
                customerId:
                  type: string
                subject:
                  type: string
                  maxLength: 100
                description:
                  type: string
                priority:
                  type: string
                  enum: [low, medium, high, urgent]
      responses:
        "201":
          description: Ticket created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Ticket"

  /emails/send:
    post:
      operationId: sendFollowUpEmail
      summary: Send a follow-up email to a customer
      description: >
        Sends a personalized email to a customer. The email is sent from
        the authenticated CS rep's address. Always confirm with the user
        before calling this endpoint.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [customerId, subject, body]
              properties:
                customerId:
                  type: string
                subject:
                  type: string
                body:
                  type: string
                  description: Email body in plain text or HTML

components:
  schemas:
    Customer:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
        company:
          type: string
        plan:
          type: string
        mrr:
          type: number
        healthScore:
          type: integer
          description: "0-100 health score based on usage and engagement"
        lastContactAt:
          type: string
          format: date-time

    Subscription:
      type: object
      properties:
        plan:
          type: string
        status:
          type: string
          enum: [active, trialing, past_due, canceled]
        mrr:
          type: number
        renewsAt:
          type: string
          format: date-time
        paymentStatus:
          type: string

    Ticket:
      type: object
      properties:
        id:
          type: string
        url:
          type: string
        status:
          type: string

  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-GPT-API-Key

security:
  - ApiKeyAuth: []
```

## Step 2 — Build the API Endpoints

```typescript
// src/app/api/gpt-actions/customers/search/route.ts
// Authenticates via API key, queries the database, returns structured data.
// Keep responses concise — GPT summarizes them for the user.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customers } from "@/lib/schema";
import { ilike, or } from "drizzle-orm";

export async function GET(request: Request) {
  // Authenticate the GPT Action
  const apiKey = request.headers.get("X-GPT-API-Key");
  if (apiKey !== process.env.GPT_ACTIONS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const limit = Math.min(parseInt(searchParams.get("limit") || "5"), 20);

  if (!q) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  const results = await db.query.customers.findMany({
    where: or(
      ilike(customers.name, `%${q}%`),
      ilike(customers.email, `%${q}%`),
      ilike(customers.company, `%${q}%`)
    ),
    limit,
    columns: {
      id: true,
      name: true,
      email: true,
      company: true,
      plan: true,
      mrr: true,
      healthScore: true,
      lastContactAt: true,
    },
  });

  return NextResponse.json({ customers: results });
}
```

```typescript
// src/app/api/gpt-actions/emails/send/route.ts
// Sends email via Resend. Note: always have GPT confirm before calling this.
// Add "Always confirm with the user before calling this endpoint" in the OpenAPI description.

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { customers } from "@/lib/schema";
import { eq } from "drizzle-orm";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const apiKey = request.headers.get("X-GPT-API-Key");
  if (apiKey !== process.env.GPT_ACTIONS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { customerId, subject, body } = await request.json();

  const customer = await db.query.customers.findFirst({
    where: eq(customers.id, customerId),
    columns: { email: true, name: true },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const { data, error } = await resend.emails.send({
    from: "Sofia at AppName <sofia@yourapp.com>",
    to: customer.email,
    subject,
    text: body,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    messageId: data?.id,
    sentTo: customer.email,
  }, { status: 200 });
}
```

## Step 3 — Configure Authentication in the GPT Editor

```
GPT Editor → Configure → Actions → Authentication

Authentication type: API Key
Auth type: Custom
Custom header name: X-GPT-API-Key
API Key: [paste your GPT_ACTIONS_API_KEY here]

# Generate a secure key:
openssl rand -hex 32
# → store as GPT_ACTIONS_API_KEY in your env, paste value in GPT editor
```

## Step 4 — GPT System Prompt

```
# Customer Success Assistant

You are a customer success assistant for [YourApp]. You have access to customer data, subscription status, and can create tickets and send emails.

## How to use your tools

**searchCustomers**: Use when the user mentions a customer name, company, or email. Always search first before asking for more info.

**getSubscriptionStatus**: Use when the user asks about billing, plan, renewal, or payment issues.

**createSupportTicket**: Use when the user asks to log, create, or open a ticket. Ask for priority if not specified (default: medium).

**sendFollowUpEmail**: ALWAYS show the user the email subject and body first and ask them to confirm before sending. Never send without explicit confirmation.

## Response style
- Be concise and actionable
- Surface the most relevant customer info upfront
- Highlight health scores below 50 (at-risk customers)
- Flag customers with past_due payment status
- Format MRR as "$X,XXX/mo"
```

## Step 5 — Privacy Policy and Domain Verification

```markdown
# Checklist for GPT Store submission

## Required
- [ ] Privacy policy URL (e.g., https://yourapp.com/privacy)
- [ ] Domain verified in OpenAI platform settings
  → platform.openai.com → Settings → Verified domains → Add domain
  → Download verification file → upload to /.well-known/
- [ ] API endpoints return appropriate error messages (not stack traces)
- [ ] Rate limiting on GPT Actions endpoints (GPT can call rapidly)
- [ ] All endpoints documented in OpenAPI spec

## Domain verification
# Add this route to serve the OpenAI verification file:
# GET /.well-known/openai-domain-verification.txt
# Content: [verification code from OpenAI platform]

## Rate limiting (important — GPT Actions can call quickly in loops)
# Add rate limiting per API key: 60 req/min recommended
import { Ratelimit } from "@upstash/ratelimit";
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
});
```

## Results

Sofia's team adopted the custom GPT in week one. After 30 days:

- **Average lookup time: 8 seconds** — ask "what's Acme Corp's health score and when do they renew?" and get the answer in one message. Previously this was 3 tabs and 90 seconds.
- **Ticket creation 4x faster** — describe the issue in plain English, GPT creates the ticket with proper priority and description. No form filling.
- **0 accidental emails** — the confirmation step works. In 30 days the team confirmed 87 emails and rejected 6 drafts that weren't quite right.
- **Debugging tip** — use the Actions console in the GPT editor (the "Test" button shows the raw API request/response). When GPT calls the wrong endpoint, update the `description` in the OpenAPI spec — GPT reads it to decide which action to use.
- **Keep private vs. GPT Store** — Sofia's GPT stays private (internal use only). For a public GPT, the same setup works; OpenAI reviews the submission and you need a public-facing API.
