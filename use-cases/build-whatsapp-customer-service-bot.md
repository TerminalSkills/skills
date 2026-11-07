---
title: "Build a WhatsApp Customer Service Bot That Handles 80% of Inquiries"
slug: build-whatsapp-customer-service-bot
description: "Create a WhatsApp Business API bot that automates order tracking, returns, FAQ responses, and human handoff, reducing repetitive support work."
skills: [whatsapp-bot-builder, coding-agent, template-engine]
category: automation
tags: [whatsapp, customer-service, chatbot, business-api, support-automation]
---

# Build a WhatsApp Customer Service Bot That Handles 80% of Inquiries

## The Problem

An e-commerce company with 5,000 monthly orders gets 200+ WhatsApp messages daily from customers. Three support agents spend their entire day answering the same questions: "Where is my order?" (45%), "How do I return this?" (20%), "Do you have this in stock?" (15%), and "What are your business hours?" (10%). Only 10% of inquiries actually require a human being.

The agents are burning out. Response times average 4 hours because each agent is juggling 70+ conversations. Customers who do not get a quick reply abandon their carts — the company estimates that a sizeable share of lost customers is tied to slow support. And every "where's my order?" message that a human answers is four minutes wasted on a lookup that could be instant.

## The Solution

Using the **whatsapp-bot-builder**, **coding-agent**, and **template-engine** skills, the agent builds a WhatsApp Cloud API bot with interactive menus for order tracking, a multi-step returns flow, keyword-based FAQ matching, human handoff with queue management, and proactive notification templates for order updates. **template-engine** renders the return-label PDF (Jinja2 HTML to PDF) and the plain-text bodies of the notification messages.

## Step-by-Step Walkthrough

### Step 1: Set Up the WhatsApp Cloud API and Welcome Flow

```text
Set up a WhatsApp Business API bot using the Meta Cloud API. When a customer
sends any message, respond with a welcome message and an interactive button
menu:

"Hi! I'm the assistant for [store]. How can I help?"
Buttons: [Track Order] [Returns] [Talk to Agent]

If the 24-hour customer service window is closed (the customer's last
message is older than 24 hours), do not send free-form text; only an approved
template can be sent, and only for a real reason such as an open order. Store conversation
state in Redis with a 24-hour TTL matching the WhatsApp conversation window.
```

The bot scaffolds a Node.js Express server with Meta's webhook handshake (`hub.verify_token`), verification of the `X-Hub-Signature-256` header (HMAC-SHA256 of the raw request body with the app secret, compared in constant time; unsigned requests are rejected), message routing based on conversation state stored in Redis, and interactive button responses. The 24-hour customer service window is the key constraint of the WhatsApp Business Platform: it opens when the customer messages you, and outside it only pre-approved template messages can be sent. The bot tracks the time of the customer's last message and uses a template only when the window is closed. The same webhook receives delivery statuses, and the bot deduplicates on message IDs because Meta retries deliveries.

Conversation state in Redis (bind it to 127.0.0.1 or a private network) uses a 24-hour TTL that is refreshed on every customer message, so it follows the WhatsApp window. When a customer taps "Track Order," the state machine knows they are mid-flow and routes follow-up messages to the order tracking handler instead of showing the welcome menu again.

### Step 2: Build the Order Tracking Flow

```text
When the customer taps "Track Order", start a conversation flow:
1. Ask for order number or email address
2. Look up the order in the database with parameterized queries (by order number, or last order by email only after the customer's WhatsApp number matches the order)
3. Return: order status, items, tracking number with carrier link, estimated delivery
4. If order is "shipped", show a link button: [Track Shipment] (carrier URL)
5. If order is "processing", show: [Notify When Shipped]
6. If no order found, offer to connect with an agent

Handle typos in order numbers — suggest closest matches if the format looks
right but the exact number isn't found.
```

This is the flow that eliminates 45% of the support workload on day one. The bot asks for an order number or email, looks it up, and returns a formatted status message with emoji indicators for each stage:

- **Processing:** ordered, payment confirmed, preparing shipment
- **Shipped:** tracking number with a tappable carrier link
- **Out for Delivery:** estimated arrival time
- **Delivered:** confirmation with a "Rate us" button

Fuzzy matching handles the inevitable typos. If a customer types "ORD-1284" but the real order is "ORD-1248," the bot calculates Levenshtein distance and suggests the closest match: "Did you mean order ORD-1248?" This alone prevents dozens of "order not found" escalations to agents each week.

The "Notify When Shipped" button records the customer's opt-in for a shipping-update template, which the bot sends when the order status changes. No more customers messaging back every few hours to check if anything has changed.

### Step 3: Automate Returns and FAQ

```text
Build the returns flow:
1. Ask for order number
2. Show order items as a numbered list — customer selects which item to return
3. Ask for return reason (interactive list: Wrong size, Defective, Changed mind, Other)
4. If "Defective" — ask for a photo (handle image message type)
5. Generate a return label (PDF) and send as a document
6. Confirm return with estimated refund timeline

Also build an FAQ handler: if the customer types a free-text question,
use keyword matching to detect common questions and respond with the right
answer. If no match, offer the agent handoff button.
```

The returns flow walks customers through the entire process without human intervention. Interactive lists (up to 10 rows) let them pick which item to return and why; reply-button messages allow at most 3 buttons, so the welcome menu stays at three. If they select "Defective," the bot asks for a photo — handling WhatsApp's image message type — and attaches it to the return request for the warehouse team.

The bot generates a return shipping label as a PDF and sends it as a document message. The customer gets the label, the estimated refund timeline, and a confirmation — all without waiting for an agent to process the request.

The FAQ handler matches free-text questions against a table of common topics using keyword and fuzzy string matching:

| Customer Types | Bot Responds With |
|---|---|
| "how long does shipping take" | Shipping times by region + tracking link |
| "do you accept paypal" | Full list of accepted payment methods |
| "what time do you close" | Business hours with timezone |
| "size guide" / "sizing chart" | Link to sizing guide with measurement instructions |

Unmatched questions get escalated with the original message preserved, so the agent sees exactly what the customer asked without having to ask again.

### Step 4: Implement Human Agent Handoff

```text
When a customer needs a human agent:
1. Add them to a queue with their conversation history
2. Notify the support team group: "New customer waiting — [name], topic: [returns],
   wait time: ~3 min"
3. An agent claims the conversation by reacting or clicking
4. Bridge messages: customer messages go to the agent's chat, agent replies go back
   to the customer's WhatsApp
5. When the agent sends /close, end the conversation, ask the customer to rate
   the experience (1-5 stars via buttons), and log the session
```

The 10% of inquiries that actually need a human get a smooth handoff. The customer sees their queue position and estimated wait time: "You're #2 in line, estimated wait: 5 minutes." The support team — on Slack or Telegram, configurable — gets a notification with the customer's name, topic, and conversation history so far.

An agent claims the conversation with a click. From that point, bidirectional message bridging routes customer WhatsApp messages to the agent's interface and agent replies back to the customer. The customer does not know they have been transferred — the conversation feels continuous.

When the agent sends `/close`, the bot asks the customer for a 1-5 star rating via interactive buttons and logs the entire session: conversation transcript, wait time, resolution time, and rating. This data feeds into weekly quality reports.

### Step 5: Set Up Proactive Notifications with Templates

```text
Create approved WhatsApp template messages for:
1. Order confirmation with details
2. Shipping notification with tracking link
3. Delivery confirmation with rating prompt
4. Abandoned cart reminder
5. Back in stock alert

Build a notification service that triggers these based on order status
changes and cart events. Respect opt-in/opt-out preferences. Include
rate limiting to stay within WhatsApp's messaging tier limits.
```

Template messages are pre-approved by Meta and can be sent outside the 24-hour customer service window. Create them in WhatsApp Manager under the Utility, Marketing or Authentication category; order confirmation, shipping and delivery messages are normally Utility, while abandoned-cart and back-in-stock messages are Marketing and are priced and restricted differently. The notification dispatcher maps order events to templates automatically:

- **Order confirmed** triggers the confirmation template with order details
- **Status changed to "shipped"** sends tracking info to customers who opted in
- **Delivered** asks for a rating (and the positive ratings feed into social proof)
- **Cart abandoned for 2+ hours** sends a gentle reminder with a direct link back
- **Wishlisted item back in stock** sends an alert with a purchase link

Opt-in/opt-out management uses a database table. Meta's policy requires opt-in before you message anyone on WhatsApp, with the business name stated clearly (opt-in can be collected on your website, by SMS, by phone or on paper), and you must honor opt-out requests, so the bot records the opt-in source and honors a "STOP" message at once. Rate limiting queues outbound messages: messaging limits apply per business portfolio and count unique recipients messaged outside a customer service window in a moving 24-hour period. A new portfolio starts at 250 and can rise to 2,000 and beyond with quality sending. Pricing is per delivered message: template messages are billed by category and recipient market, and since 1 October 2026 service messages (free-form replies inside the 24-hour window) are free only for the first 1,000 per business phone number each month. At 200+ inbound chats a day the bot's replies exceed that tier, so budget for them and attach a payment method (without one, service messages stop after the free tier). Read the current limit and rates from Meta's pricing page rather than hard-coding them.

## Real-World Example

The store owner deploys the bot on a Monday. Order tracking queries, which were 45% of the inbox, get instant answers from day one.

In this example the returns flow handles most return requests without an agent, FAQ matching catches the common questions, and the agents' daily queue drops from 200+ messages to about 30 -- the genuinely complex issues that benefit from human attention.

After 2 months, in the store's own numbers: average response time falls from 4 hours to under a minute for automated queries and 15 minutes for agent-handled ones, and satisfaction scores rise. The team starts discussing whether they can operate with 2 agents instead of 3 — not to cut costs, but to redeploy the third person to a role where they are not answering "where's my order?" sixty times a day.
