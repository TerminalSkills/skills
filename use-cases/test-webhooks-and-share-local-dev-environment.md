---
title: Test Webhooks and Share Your Local Dev Environment
slug: test-webhooks-and-share-local-dev-environment
description: Set up a local development environment with Stripe webhooks, Telegram bot, and client-accessible preview — all tunneled through ngrok with auth and request inspection.
skills:
  - ngrok
  - telegram-bot-builder
  - shopify
category: development
tags:
  - webhooks
  - tunneling
  - local-development
  - stripe
  - telegram
  - demo
  - testing
---

## The Problem

Dani is building an e-commerce checkout flow for a client. The stack: a Node.js backend that handles Stripe payment webhooks, a Telegram bot that notifies the shop owner about new orders, and a frontend the client needs to review. Right now Dani is stuck in a painful loop: push code to a staging server, wait for deploy, test the webhook, find a bug, fix locally, push again. Each cycle takes 10 minutes. Stripe webhooks can't reach localhost. The Telegram bot webhook needs a public HTTPS URL. And the client keeps asking "can I see the latest version?" but Dani doesn't want to deploy half-finished work.

Dani needs all three services accessible from the internet — webhook receivers, bot endpoint, and a client preview — without leaving the local machine.

## The Solution

Use ngrok to expose three local services simultaneously: the backend API for Stripe webhooks (with signature verification), the Telegram bot endpoint, and the frontend for client review (with basic auth). Use the ngrok inspector to debug webhook payloads in real time, and set up the Telegram bot webhook to point at the tunnel URL.

## Step-by-Step Walkthrough

### Step 1: Define the Multi-Tunnel Configuration

Instead of running three separate ngrok commands, define all tunnels in a single config file. This way they start together and each gets a stable domain.

```yaml
# ngrok.yml — multi-tunnel config for the checkout project
# Three tunnels: API (webhooks), bot, frontend (client preview)

version: "3"
agent:
  authtoken: your-ngrok-authtoken

tunnels:
  api:
    # Backend API — receives Stripe webhooks
    addr: 8080
    proto: http
    domain: checkout-api.ngrok-free.app
    inspect: true  # Enable request inspector for debugging payloads

  bot:
    # Telegram bot webhook receiver
    addr: 8443
    proto: http
    domain: shop-bot.ngrok-free.app
    inspect: true

  frontend:
    # Client preview — protected with basic auth
    addr: 3000
    proto: http
    domain: checkout-preview.ngrok-free.app
    basic_auth:
      - "client:ReviewFeb2026"  # Simple auth so only the client can access
    inspect: false  # No need to inspect frontend requests
```

Start all three tunnels:

```bash
ngrok start --all --config=ngrok.yml
```

Now `localhost:8080` is reachable at `checkout-api.ngrok-free.app`, the bot at `shop-bot.ngrok-free.app`, and the frontend at `checkout-preview.ngrok-free.app` (password-protected).

### Step 2: Wire Up Stripe Webhooks

With the API tunnel running, configure Stripe to send events to the ngrok URL. The key detail: verify webhook signatures so your endpoint rejects forged requests even though it's publicly accessible.

```javascript
// server.js — Stripe webhook handler
// Uses raw body for signature verification (express.json() would break it)

import express from 'express';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

// Stripe needs the raw body to verify signatures
app.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      // Verify the webhook came from Stripe, not someone poking the ngrok URL
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET  // whsec_... from Stripe dashboard
      );
    } catch (err) {
      console.error(`Signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle specific events
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        console.log(`Payment received: ${session.amount_total / 100} ${session.currency}`);
        await notifyTelegram(session);  // Step 3
        break;

      case 'payment_intent.payment_failed':
        console.log(`Payment failed: ${event.data.object.last_payment_error?.message}`);
        break;
    }

    res.json({ received: true });
  }
);

app.listen(8080, () => console.log('API server on :8080'));
```

Register the webhook in Stripe (CLI or dashboard):

```bash
# Tell Stripe to send checkout events to the ngrok tunnel
stripe listen --forward-to https://checkout-api.ngrok-free.app/webhooks/stripe
# Or set it in Stripe Dashboard → Developers → Webhooks → Add endpoint
```

Now open the ngrok inspector at `http://127.0.0.1:4040` — every Stripe event appears with full headers and JSON body. Click "Replay" to re-send any event without making another test purchase.

### Step 3: Connect the Telegram Order Notification Bot

When a payment succeeds, notify the shop owner via Telegram. The bot's webhook also runs through ngrok so Telegram can reach the local server.

```javascript
// bot.js — Telegram bot that receives commands and sends order notifications
// Webhook mode (not polling) so it works through the ngrok tunnel

import TelegramBot from 'node-telegram-bot-api';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;  // Shop owner's Telegram ID

// Set webhook to the ngrok tunnel URL
// Run once after starting ngrok
await bot.setWebHook('https://shop-bot.ngrok-free.app/bot');

// Express route to receive Telegram updates
app.post('/bot', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Called from the Stripe webhook handler (Step 2)
export async function notifyTelegram(session) {
  const amount = (session.amount_total / 100).toFixed(2);
  const currency = session.currency.toUpperCase();
  const email = session.customer_details?.email || 'unknown';

  const message = [
    `🛒 *New Order!*`,
    ``,
    `💰 Amount: ${amount} ${currency}`,
    `📧 Customer: ${email}`,
    `📦 Status: Paid`,
    ``,
    `Order ID: \`${session.id}\``,
  ].join('\n');

  await bot.sendMessage(OWNER_CHAT_ID, message, { parse_mode: 'Markdown' });
}
```

The owner immediately gets a Telegram message when someone pays. During development, Dani can test the full flow — click "Pay" on the frontend, Stripe sends a webhook through ngrok, the server processes it, and the Telegram notification arrives. All running locally.

### Step 4: Share the Frontend with the Client

The frontend tunnel has basic auth, so Dani sends the client one message:

```
Preview URL: https://checkout-preview.ngrok-free.app
Username: client
Password: ReviewFeb2026
```

The client opens it on their phone or laptop and sees exactly what Dani sees locally — hot-reloading and all. When Dani saves a file, the client refreshes and sees the change instantly. No staging deploy, no CI pipeline, no waiting.

### Step 5: Debug with the Request Inspector

The ngrok inspector at `http://127.0.0.1:4040` becomes the debugging hub:

- **Stripe webhook failing?** Check the inspector — see the exact payload, headers, and response code. Click "Replay" to resend without making another test payment.
- **Telegram bot not responding?** Switch to the bot tunnel in the inspector — see if Telegram is actually sending updates and what your server responded.
- **Unexpected 500 error?** The inspector shows the response body your server returned, which often has the stack trace.

The inspector captures request timing too — if a webhook handler takes 8 seconds, you'll see it immediately and know to add async processing before the 30-second timeout kills the request.

## The Outcome

Dani runs one command (`ngrok start --all`) and has three public URLs: one for Stripe webhooks with signature verification, one for the Telegram bot, and one for client previews with password protection. The development cycle drops from 10-minute deploy loops to instant local iteration. The client reviews work in real time. Stripe webhooks arrive locally and can be replayed for debugging. The Telegram bot works exactly as it will in production.

When the checkout flow is ready, Dani deploys to production and swaps the ngrok URLs for real domains. The code doesn't change — only the environment variables for webhook URLs. What took a week of deploy-test-fix cycles took two days of focused local development.
