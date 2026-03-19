---
title: "Build an Embeddable Live Chat Widget"
description: "Replace Intercom with your own embeddable JS chat widget — real-time WebSocket messaging, visitor identification, multi-agent inbox, and offline email fallback."
skills: [prisma, resend]
difficulty: intermediate
time_estimate: "7 hours"
tags: [chat, support, websocket, intercom, customer-support, saas, widget, realtime]
---

# Build an Embeddable Live Chat Widget

Intercom charges $100/seat/month. For a 5-person support team that's $6,000/year — before add-ons. Building your own chat widget takes a weekend and gives you full control: no per-seat pricing, no data leaving your servers, and a UX tailored exactly to your product.

## The Persona

You're the CTO of a B2B SaaS with 500 customers. You're paying $500/month for Intercom for 5 support agents. You want to cut that cost, own your customer data, and build features Intercom doesn't have — like deep integration with your product's context.

## What You'll Build

- **Embeddable JS widget** — injected via `<script>` tag, loads in any page
- **Real-time chat** — WebSocket connection, instant message delivery
- **Visitor identification** — identify logged-in users automatically
- **Agent inbox** — multi-agent support, conversation assignment
- **Offline mode** — queue messages, send email fallback when no agents available

## Schema

```prisma
// schema.prisma
model Conversation {
  id          String             @id @default(cuid())
  visitorId   String
  status      ConversationStatus @default(OPEN)
  assignedTo  String?            // agent userId
  page        String?            // URL where chat was started
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  visitor     Visitor            @relation(fields: [visitorId], references: [id])
  messages    Message[]
  agent       User?              @relation(fields: [assignedTo], references: [id])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  sender         MessageSender
  content        String
  createdAt      DateTime     @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id])
}

model Visitor {
  id            String         @id @default(cuid())
  email         String?
  name          String?
  userId        String?        // your product's userId if logged in
  metadata      Json?          // plan, account, custom attributes
  createdAt     DateTime       @default(now())

  conversations Conversation[]
}

enum ConversationStatus { OPEN ASSIGNED RESOLVED }
enum MessageSender { VISITOR AGENT BOT }
```

## Step 1: The Embeddable Widget Script

```javascript
// public/widget.js — this is what customers embed
(function() {
  const WIDGET_URL = 'https://support.example.com'

  window.SupportChat = {
    init: function(config) {
      this.config = config

      // Create iframe container
      const container = document.createElement('div')
      container.id = 'support-chat-container'
      container.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        z-index: 9999; font-family: sans-serif;
      `

      // Chat toggle button
      const button = document.createElement('button')
      button.id = 'support-chat-btn'
      button.innerHTML = '💬'
      button.style.cssText = `
        width: 56px; height: 56px; border-radius: 50%;
        background: #6366f1; color: white; border: none;
        font-size: 24px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      `
      button.onclick = () => this.toggle()

      container.appendChild(button)
      document.body.appendChild(container)

      // Identify visitor if user info provided
      if (config.user) this.identify(config.user)
    },

    toggle: function() {
      const existing = document.getElementById('support-chat-frame')
      if (existing) {
        existing.style.display = existing.style.display === 'none' ? 'block' : 'none'
        return
      }
      this.openChat()
    },

    openChat: function() {
      const frame = document.createElement('iframe')
      frame.id = 'support-chat-frame'
      frame.src = `${WIDGET_URL}/chat?` + new URLSearchParams({
        visitorId: this.visitorId || '',
        page: window.location.href,
        ...(this.config.user || {}),
      })
      frame.style.cssText = `
        width: 380px; height: 500px; border: none;
        border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.2);
        display: block; margin-bottom: 8px;
      `
      document.getElementById('support-chat-container').insertBefore(
        frame, document.getElementById('support-chat-btn')
      )
    },
  }
})()
```

**Customer embeds it like this:**
```html
<script src="https://support.example.com/widget.js"></script>
<script>
  SupportChat.init({
    user: {
      id: '{{ current_user.id }}',
      email: '{{ current_user.email }}',
      name: '{{ current_user.name }}',
      plan: '{{ current_user.plan }}'
    }
  })
</script>
```

## Step 2: WebSocket Server

```typescript
// server/websocket.ts (using ws library or native Bun/Node WebSocket)
import { WebSocketServer } from 'ws'
import { prisma } from '../lib/prisma'

const wss = new WebSocketServer({ port: 8080 })
const connections = new Map<string, WebSocket>() // conversationId → agent WS

wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, 'http://localhost')
  const conversationId = url.searchParams.get('conversationId')
  const role = url.searchParams.get('role') // 'visitor' | 'agent'

  if (conversationId) connections.set(`${role}:${conversationId}`, ws as any)

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString())

    if (msg.type === 'message') {
      // Save to DB
      const message = await prisma.message.create({
        data: {
          conversationId: msg.conversationId,
          sender: role === 'agent' ? 'AGENT' : 'VISITOR',
          content: msg.content,
        },
      })

      // Relay to the other party
      const targetRole = role === 'agent' ? 'visitor' : 'agent'
      const targetWs = connections.get(`${targetRole}:${msg.conversationId}`)
      if (targetWs) {
        targetWs.send(JSON.stringify({ type: 'message', message }))
      } else if (role === 'visitor') {
        // No agent online — queue for email fallback
        await queueOfflineMessage(msg.conversationId, msg.content)
      }
    }
  })

  ws.on('close', () => {
    connections.forEach((_, key) => {
      if (key.endsWith(`:${conversationId}`)) connections.delete(key)
    })
  })
})
```

## Step 3: Offline Email Fallback

```typescript
// lib/offline-chat.ts
import { Resend } from 'resend'
import { prisma } from './prisma'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function queueOfflineMessage(conversationId: string, content: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { visitor: true },
  })

  if (!conversation) return

  // Update conversation to awaiting reply
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'OPEN' },
  })

  // Email to support team
  await resend.emails.send({
    from: 'chat@example.com',
    to: 'support@example.com',
    subject: `New chat message from ${conversation.visitor.name ?? conversation.visitor.email ?? 'Visitor'}`,
    html: `
      <p><strong>From:</strong> ${conversation.visitor.name ?? 'Unknown'} 
      (${conversation.visitor.email ?? 'no email'})</p>
      <p><strong>Page:</strong> ${conversation.page}</p>
      <p><strong>Message:</strong> ${content}</p>
      <p><a href="https://support.example.com/inbox/${conversationId}">Reply in inbox →</a></p>
    `,
  })

  // Auto-reply to visitor if they have email
  if (conversation.visitor.email) {
    await resend.emails.send({
      from: 'support@example.com',
      to: conversation.visitor.email,
      subject: 'We got your message',
      html: `<p>Hi ${conversation.visitor.name ?? 'there'},</p>
             <p>Thanks for reaching out! Our team is offline right now but we'll reply within a few hours.</p>
             <p>Your message: "${content}"</p>`,
    })
  }
}
```

## Step 4: Agent Inbox API

```typescript
// app/api/inbox/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'OPEN'
  const assignedTo = searchParams.get('assignedTo')

  const conversations = await prisma.conversation.findMany({
    where: {
      status: status as any,
      ...(assignedTo ? { assignedTo } : {}),
    },
    include: {
      visitor: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return Response.json(conversations)
}

// app/api/inbox/[id]/assign/route.ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { agentId } = await req.json()

  const conversation = await prisma.conversation.update({
    where: { id: params.id },
    data: {
      assignedTo: agentId,
      status: 'ASSIGNED',
    },
  })

  return Response.json(conversation)
}
```

## Step 5: Visitor Identification

```typescript
// app/api/visitors/identify/route.ts
export async function POST(req: Request) {
  const { id, email, name, metadata } = await req.json()

  const visitor = await prisma.visitor.upsert({
    where: { userId: id },
    update: { email, name, metadata },
    create: { userId: id, email, name, metadata },
  })

  return Response.json({ visitorId: visitor.id })
}
```

## Deployment

```bash
# Start WebSocket server
node server/websocket.js &

# Serve widget.js as static file
# Widget URL: https://support.example.com/widget.js
```

## What's Next

- Add typing indicators via WebSocket events
- Build a bot for common questions before routing to humans (saves 30% of tickets)
- Add conversation history for returning visitors
- Integrate with your product data to show account context to agents
- Add CSAT survey after conversation is resolved
