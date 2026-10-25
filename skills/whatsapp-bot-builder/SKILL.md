---
name: whatsapp-bot-builder
description: >-
  Builds WhatsApp bots and integrations using the WhatsApp Business API
  (Cloud API). Use when the user wants to create a WhatsApp bot, send
  template messages, handle incoming messages, build interactive lists
  and buttons, process media, or automate customer communication via
  WhatsApp. Trigger words: whatsapp bot, whatsapp business api, whatsapp
  integration, whatsapp cloud api, whatsapp template, whatsapp webhook,
  whatsapp automation, whatsapp chatbot, meta business, whatsapp flows.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.9+. Requires a Meta Business account and WhatsApp Business API access."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  tags: "whatsapp, bot, messaging, business"
---

# WhatsApp Bot Builder

## Overview

Builds WhatsApp bots using the official Cloud API (hosted by Meta). Covers account setup, webhook configuration, sending and receiving messages, template messages for outbound campaigns, interactive components (buttons, lists), media handling, pricing and messaging limits, and production deployment. Does NOT use unofficial libraries — only the official WhatsApp Business Platform.

The examples use Graph API `v24.0`, the newest version in the Cloud API changelog as of this update. Pin the version in one constant so it is easy to bump.

## Instructions

### 1. Account Setup

1. Create a Meta Business account at https://business.facebook.com
2. Go to https://developers.facebook.com → Create App → Business type
3. Add the "WhatsApp" product to the app
4. In WhatsApp > API Setup:
   - Note the **Phone Number ID** and **WhatsApp Business Account ID**
   - Use the temporary token shown there only for testing; for production create a **System User** token in Business Settings
5. Add a test recipient number, or register and verify your business number

**Required credentials:**
```env
WHATSAPP_TOKEN=EAAxxxxxxx          # System User access token (production)
WHATSAPP_PHONE_ID=123456789        # Phone Number ID
WHATSAPP_BUSINESS_ID=987654321     # WhatsApp Business Account ID
WHATSAPP_VERIFY_TOKEN=my_secret    # Webhook verification token (you choose this)
WHATSAPP_APP_SECRET=abc123         # App secret, used to verify X-Hub-Signature-256
```

### 2. Webhook Setup

WhatsApp posts incoming messages and delivery statuses to your HTTPS endpoint:

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

// Keep the raw body: the signature is computed over the exact bytes Meta sent
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Verification handshake (GET)
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

// Incoming messages and statuses (POST)
app.post('/webhook', (req, res) => {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
    .update(req.rawBody).digest('hex');
  const given = req.get('X-Hub-Signature-256') || '';
  if (given.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return res.sendStatus(401);
  }

  // Acknowledge first, then process; any non-200 makes Meta retry
  res.sendStatus(200);
  for (const change of req.body.entry?.[0]?.changes ?? []) {
    const value = change.value;
    for (const message of value.messages ?? []) {
      handleMessage(message, value.metadata.phone_number_id).catch(console.error);
    }
    for (const status of value.statuses ?? []) {
      handleStatus(status).catch(console.error);
    }
  }
});
```

Register the callback URL and verify token in the app dashboard under WhatsApp → Configuration. Subscribe to the `messages` field: delivery and read receipts arrive in the same field as a `statuses` array, not as separate subscriptions.

Webhook behavior to design for:
- A POST that does not get HTTP 200 is retried immediately and then with decreasing frequency for up to 7 days; after that it is dropped.
- Deduplicate on the message `id` and status `id`, because retries can redeliver a payload.
- A batch can contain up to 1000 updates; handle every entry in it.

### 3. Sending Messages

Every send goes to `POST https://graph.facebook.com/v24.0/{PHONE_ID}/messages`:

**Text message** (only inside the 24-hour customer service window):
```javascript
const GRAPH = 'https://graph.facebook.com/v24.0';

async function sendMessage(payload) {
  const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed ${res.status}: ${await res.text()}`);
  return res.json();
}

await sendMessage({ to: '14155552671', type: 'text', text: { body: 'Your order shipped.' } });
```

**Interactive reply buttons (max 3; button title max 20 characters; body max 1024 characters):**
```javascript
await sendMessage({
  to: '14155552671',
  type: 'interactive',
  interactive: {
    type: 'button',
    body: { text: 'How can I help you?' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'support', title: 'Support' } },
        { type: 'reply', reply: { id: 'sales', title: 'Sales' } },
        { type: 'reply', reply: { id: 'info', title: 'Store info' } },
      ],
    },
  },
});
```

**Interactive list (max 10 rows in total across all sections; button text max 20 characters; section title and row title max 24 characters; row description max 72 characters):**
```javascript
await sendMessage({
  to: '14155552671',
  type: 'interactive',
  interactive: {
    type: 'list',
    body: { text: 'Choose a product category:' },
    action: {
      button: 'View categories',
      sections: [{
        title: 'Electronics',
        rows: [
          { id: 'phones', title: 'Phones', description: 'Latest smartphones' },
          { id: 'laptops', title: 'Laptops', description: 'Work and gaming' },
        ],
      }],
    },
  },
});
```

When a user taps a button or list row, the webhook delivers a message with `type: 'interactive'` and the chosen `id` in `interactive.button_reply.id` or `interactive.list_reply.id`.

### 4. Template Messages

Templates are required to start a conversation, and to message a user after the 24-hour customer service window closes. They must be approved by Meta.

**Creating templates:**
- WhatsApp Manager → Message Templates
- Categories: Marketing, Utility, Authentication
- Variables use `{{1}}`, `{{2}}`, and so on; approval usually takes minutes to hours

**Sending a template:**
```javascript
await sendMessage({
  to: '14155552671',
  type: 'template',
  template: {
    name: 'order_confirmation',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'ORD-12345' },
        { type: 'text', text: '$49.99' },
      ],
    }],
  },
});
```

### 5. Media Handling

**Send an image** (JPEG or PNG, max 5 MB):
```javascript
await sendMessage({
  to: '14155552671',
  type: 'image',
  image: { link: 'https://cdn.example-store.com/receipts/ORD-12345.png', caption: 'Your order receipt' },
});
```

**Receive media:** take `messages[0].image.id` (or `document.id`, `audio.id`, `video.id`), then:
```javascript
const auth = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };

// 1. Exchange the media ID for a short-lived URL
const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth }).then(r => r.json());

// 2. Download immediately; the URL expires after 5 minutes
const file = await fetch(meta.url, { headers: auth });
if (!file.ok) throw new Error(`media download failed ${file.status}`);
const bytes = Buffer.from(await file.arrayBuffer());
```

If the download returns 404, request the media ID again for a fresh URL. The media ID returned by the upload endpoint expires after 30 days, and the ID delivered in a webhook after 7 days, so download received media when the webhook arrives.

Size and format limits:
- Image: 5 MB, JPEG or PNG only
- Video: 16 MB, MP4 (H.264 video, AAC audio) or 3GP
- Audio: 16 MB, AAC, AMR, MP3, M4A, or OGG (Opus codec, mono)
- Document: 100 MB, PDF, Office formats, or TXT
- Sticker: WebP only; static max 100 KB, animated max 500 KB

### 6. Pricing

WhatsApp has charged per **message** instead of per conversation since 1 July 2025. A message is billed when a template is delivered. The rate depends on the template category and the recipient's country calling code.

- **Marketing templates:** billed at the marketing rate; only allowed outside a customer service window
- **Utility templates:** billed outside an open customer service window, free inside one
- **Authentication templates:** billed at authentication rates; lower at higher volume tiers
- **User-initiated messages and non-template replies inside the 24-hour window:** free
- **Click-to-WhatsApp ad or Page button entry (Android and iOS app):** messages sent within 72 hours of the user's reply are free, including templates

Rates change by country and date. Check the current rate card in the pricing page before quoting costs to a client; do not hard-code prices in the bot.

### 7. Limits

- **Throughput:** 80 messages per second per business phone number by default; more with a capacity upgrade
- **Per recipient:** one business-initiated message per 6 seconds to the same user
- **New business portfolio:** 250 unique business-initiated recipients per rolling 24 hours
- **Scaling:** the limit rises when the portfolio sends high-quality messages to many unique recipients outside service windows. Read the current limit from the `whatsapp_business_manager_messaging_limit` field; `messaging_limit_tier` is deprecated
- **Quality:** a low quality rating reduces the limit; monitor it in WhatsApp Manager

Sending a burst to one user still counts against the per-recipient allowance, so queue outbound campaigns.

### 8. Deployment

- **HTTPS is required** for the webhook; use ngrok or a similar tunnel for local development
- Production: any Node.js host with TLS (Render, Railway, or a VPS behind Caddy or nginx)
- Store `wa_id` for user identity and deduplicate on message and status IDs
- Put a queue between the webhook and the bot logic for high volume

## Examples

### Example 1: Customer Support Bot

**Input:** "Build a WhatsApp bot for our e-commerce store. Customers can check order status, request returns, and talk to a human agent."

**Output:** A Node.js webhook server with:
- Welcome message with 3 reply buttons (Order Status / Return / Talk to Agent), each title within 20 characters
- Order status flow: asks for the order number, queries the database, returns the status and tracking link
- Return flow: multi-step conversation collecting order number, reason, and a photo (downloaded through the two-step media API)
- Agent handoff: notifies the support team in an internal channel and bridges messages
- Template message for out-of-hours replies once the 24-hour window has closed

### Example 2: Appointment Booking Bot

**Input:** "Create a WhatsApp bot for a dental clinic. Patients book appointments, get reminders, and can reschedule."

**Output:** A Node.js app with:
- Interactive list of available slots (up to 10 rows total, so the bot pages through days)
- Booking confirmation sent as an approved Utility template
- 24-hour reminder template sent from a cron job, with `wa_id`-based deduplication
- Reschedule flow that reuses the list message with the new slots
- Availability pulled from the clinic's scheduling API

## Guidelines

- Acknowledge webhooks with HTTP 200 before doing slow work; Meta retries any other response for up to 7 days
- Verify the `X-Hub-Signature-256` header on every POST with your app secret
- Deduplicate deliveries on message and status IDs
- Use template messages to start a conversation and after the 24-hour window closes; free-form messages work only inside it
- Keep button titles to 20 characters and list row or section titles to 24 characters; these are hard API limits
- Store `wa_id`, not the raw phone number, as the user key, and keep conversation state in Redis or a database rather than process memory
- Meta can reject templates; write them as neutral, compliant utility messages
- WhatsApp Flows (form-based screens) cover multi-field input better than long chains of buttons
- Never expose the System User token; load it from the environment
