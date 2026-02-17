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
  version: "1.0.0"
  category: automation
  tags: ["whatsapp", "bot", "messaging", "business"]
---

# WhatsApp Bot Builder

## Overview

Builds WhatsApp bots using the official Cloud API (hosted by Meta). Covers account setup, webhook configuration, sending and receiving messages, template messages for outbound campaigns, interactive components (buttons, lists, flows), media handling, and production deployment. Does NOT use unofficial libraries — only the official WhatsApp Business Platform.

## Instructions

### 1. Account Setup

1. Create a Meta Business account at https://business.facebook.com
2. Go to https://developers.facebook.com → Create App → Business type
3. Add "WhatsApp" product to the app
4. In WhatsApp > Getting Started:
   - Note the **Phone Number ID** and **WhatsApp Business Account ID**
   - Generate a temporary access token (valid 24h) or create a System User token (permanent)
5. Add a test phone number or verify your business number

**Required credentials:**
```env
WHATSAPP_TOKEN=EAAxxxxxxx          # Permanent System User token
WHATSAPP_PHONE_ID=123456789        # Phone Number ID
WHATSAPP_BUSINESS_ID=987654321     # Business Account ID  
WHATSAPP_VERIFY_TOKEN=my_secret    # Webhook verification token (you choose this)
```

### 2. Webhook Setup

WhatsApp sends incoming messages via webhooks:

```javascript
const express = require('express');
const app = express();
app.use(express.json());

// Webhook verification (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Incoming messages (POST)
app.post('/webhook', (req, res) => {
  const entry = req.body.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];
  
  if (message) {
    handleMessage(message, change.value.metadata.phone_number_id);
  }
  
  res.sendStatus(200); // Always respond 200 quickly
});
```

Register webhook URL in Meta Developer Console → WhatsApp → Configuration.
Subscribe to: `messages`, `message_status`, `message_template_status_update`.

### 3. Sending Messages

**Text message:**
```javascript
async function sendText(to, text) {
  await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,           // Phone number with country code: '14155552671'
      type: 'text',
      text: { body: text }
    })
  });
}
```

**Interactive buttons (max 3):**
```javascript
{
  messaging_product: 'whatsapp',
  to: to,
  type: 'interactive',
  interactive: {
    type: 'button',
    body: { text: 'How can I help you?' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'support', title: '🛠 Support' } },
        { type: 'reply', reply: { id: 'sales', title: '💰 Sales' } },
        { type: 'reply', reply: { id: 'info', title: 'ℹ️ Info' } }
      ]
    }
  }
}
```

**Interactive list (up to 10 items per section, 10 sections):**
```javascript
{
  type: 'interactive',
  interactive: {
    type: 'list',
    body: { text: 'Choose a product category:' },
    action: {
      button: 'View Categories',
      sections: [{
        title: 'Electronics',
        rows: [
          { id: 'phones', title: 'Phones', description: 'Latest smartphones' },
          { id: 'laptops', title: 'Laptops', description: 'Work and gaming' }
        ]
      }]
    }
  }
}
```

### 4. Template Messages

Template messages are required for initiating conversations (outbound). They must be pre-approved by Meta.

**Creating templates:**
- Go to WhatsApp Manager → Message Templates
- Categories: Marketing, Utility, Authentication
- Templates support variables: `{{1}}`, `{{2}}`, etc.
- Approval takes minutes to hours

**Sending a template:**
```javascript
{
  messaging_product: 'whatsapp',
  to: to,
  type: 'template',
  template: {
    name: 'order_confirmation',
    language: { code: 'en_US' },
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'ORD-12345' },
        { type: 'text', text: '$49.99' }
      ]
    }]
  }
}
```

### 5. Media Handling

**Send image:**
```javascript
{
  messaging_product: 'whatsapp',
  to: to,
  type: 'image',
  image: {
    link: 'https://example.com/photo.jpg',  // Public URL
    caption: 'Your order receipt'
  }
}
```

**Receive media:** Extract `messages[0].image.id`, then:
```javascript
// Get media URL
const media = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
  headers: { 'Authorization': `Bearer ${TOKEN}` }
}).then(r => r.json());

// Download the file
const file = await fetch(media.url, {
  headers: { 'Authorization': `Bearer ${TOKEN}` }
});
```

Supported: images (5MB), video (16MB), audio (16MB), documents (100MB), stickers.

### 6. Conversation Pricing

WhatsApp charges per 24-hour conversation window:
- **Service conversations** (user-initiated): Free first 1,000/month, then ~$0.005-0.08 depending on country
- **Marketing/Utility conversations** (business-initiated): ~$0.01-0.15 per conversation
- **Authentication**: ~$0.005-0.09

The 24h window opens when you first reply or send a template. All messages within that window are one conversation.

### 7. Rate Limits

- **New business accounts**: 250 business-initiated conversations/24h
- **Verified accounts**: 1,000/24h, scaling to 10K, 100K, unlimited based on quality
- **API calls**: 80 messages/sec for Cloud API
- **Template submissions**: 100/hour for creation

### 8. Deployment

- **Must have HTTPS** — WhatsApp requires TLS for webhooks
- Use ngrok for local development
- Production: any Node.js host with SSL (Railway, Render, VPS with Caddy/nginx)
- Implement message deduplication (WhatsApp may retry webhook deliveries)

## Examples

### Example 1: Customer Support Bot

**Input:** "Build a WhatsApp bot for our e-commerce store. Customers can check order status, request returns, and talk to a human agent."

**Output:** A Node.js webhook server with:
- Welcome message with 3 reply buttons (Order Status / Return / Talk to Agent)
- Order status flow: asks for order number, queries database, returns status with tracking link
- Return flow: multi-step conversation collecting order number, reason, photo of item
- Agent handoff: notifies support team in a shared WhatsApp group, bridges messages
- Auto-reply outside business hours with template message

### Example 2: Appointment Booking Bot

**Input:** "Create a WhatsApp bot for a dental clinic. Patients book appointments, get reminders, and can reschedule."

**Output:** A Node.js app with:
- Interactive list showing available time slots by date
- Booking confirmation with template message (approved by Meta)
- 24h reminder template sent via cron job
- Reschedule flow with new slot selection
- Integration with Google Calendar API for availability

## Guidelines

- Always respond HTTP 200 to webhooks within 5 seconds (process async)
- Use template messages for initiating conversations — free-form messages only work in the 24h reply window
- Implement idempotency — WhatsApp retries webhook deliveries on timeout
- Store `wa_id` (WhatsApp ID) not phone number for user identification
- Handle message status updates (`sent`, `delivered`, `read`, `failed`) for tracking
- Keep button titles under 20 characters, list row titles under 24 characters
- Test thoroughly with the test phone number before going to production
- Meta can reject template messages — keep them professional and compliant
- Implement conversation state with Redis or database (not in-memory)
- For high volume: use a message queue between webhook receiver and processor
- Never expose your permanent token — use environment variables
- WhatsApp Flows (form-based UI) is available for more complex interactions
