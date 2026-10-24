---
title: "Build an Embeddable Live Chat Widget"
description: "Replace Intercom with your own embeddable JS chat widget — real-time WebSocket messaging, visitor identification, multi-agent inbox, and offline email fallback."
skills: [prisma, resend]
difficulty: intermediate
time_estimate: "7 hours"
tags: [chat, support, websocket, intercom, customer-support, saas, widget, realtime]
---

# Build an Embeddable Live Chat Widget

## The Problem

You run a B2B SaaS and want chat inside your product, the conversations in your own database, and the logged-in customer's plan visible to the agent. The two things that go wrong are trust (anyone can claim to be any customer unless your server vouches for them) and availability (a message sent at 3 a.m. must not vanish).

## The Solution

A `<script>` that opens an iframe from your support domain, a WebSocket server that relays and stores messages with [Prisma](/skills/prisma), and an email fallback through [Resend](/skills/resend) when no agent is online. Your backend signs each logged-in user's id so the chat server can trust who is talking.

## Step-by-Step Walkthrough

### Step 1: Schema

Prisma 7 needs `provider = "prisma-client"` with an `output` in the generator, the database URL in `prisma.config.ts`, and a driver adapter (`@prisma/adapter-pg`) when you create the client.

```prisma
model Visitor {
  id            String         @id @default(cuid())
  userId        String?        @unique // your product's user id, when logged in
  email         String?
  name          String?
  metadata      Json?          // plan, account, custom attributes
  conversations Conversation[]
}

model Conversation {
  id         String             @id @default(cuid())
  visitorId  String
  visitor    Visitor            @relation(fields: [visitorId], references: [id])
  status     String             @default("OPEN") // OPEN | ASSIGNED | RESOLVED
  assignedTo String?            // agent id from your agent login
  page       String?            // URL where the chat started
  messages   Message[]
  updatedAt  DateTime           @updatedAt
}

model Message {
  id             String        @id @default(cuid())
  conversationId String
  conversation   Conversation  @relation(fields: [conversationId], references: [id])
  sender         String        // VISITOR | AGENT
  content        String
  createdAt      DateTime      @default(now())
}
```

### Step 2: Sign identities on your server

Anything the browser sends can be forged, so the customer's own backend computes an HMAC of the user's id, email, name and plan with a secret shared only with the chat server, and puts it in the page. The chat server issues short-lived tokens the same way.

```typescript
// lib/tokens.ts
import { createHmac, timingSafeEqual } from 'node:crypto'

const sign = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('hex')

export const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

// Your product's backend: render this next to the user's fields. It covers all of them,
// so a customer cannot edit the plan or email in the page and have it accepted.
type Identity = { id: string; email?: string; name?: string; plan?: string }
export const userHash = (u: Identity) =>
  sign(JSON.stringify([u.id, u.email ?? '', u.name ?? '', u.plan ?? '']), process.env.IDENTITY_SECRET!)

// Chat server: "visitor:<id>" or "agent:<id>", valid for 12 hours
export function issueToken(subject: string) {
  const exp = Date.now() + 12 * 3600_000
  return `${subject}|${exp}|${sign(`${subject}|${exp}`, process.env.TOKEN_SECRET!)}`
}

export function verifyToken(token: string): string | null {
  const [subject, exp, mac] = token.split('|')
  if (!subject || !exp || !mac || Number(exp) < Date.now()) return null
  return safeEqual(mac, sign(`${subject}|${exp}`, process.env.TOKEN_SECRET!)) ? subject : null
}
```

Make both secrets with `openssl rand -hex 32`.

### Step 3: The embeddable script

The script only draws the button and the iframe. The user's details travel in the URL fragment, which the browser never sends to a server, and the iframe page (served from your support domain) does the identify call itself, so no cross-origin requests are needed.

```javascript
// public/widget.js
(function () {
  const WIDGET_URL = 'https://support.example.com'

  window.SupportChat = {
    init(config) {
      this.config = config
      const box = (this.box = document.createElement('div'))
      box.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;font-family:sans-serif'
      const button = document.createElement('button')
      button.textContent = 'Chat'
      button.style.cssText = 'width:56px;height:56px;border-radius:50%;background:#6366f1;color:#fff;border:0;cursor:pointer'
      button.onclick = () => this.toggle()
      box.appendChild(button)
      document.body.appendChild(box)
    },
    toggle() {
      if (this.frame) {
        this.frame.style.display = this.frame.style.display === 'none' ? 'block' : 'none'
        return
      }
      const frame = document.createElement('iframe')
      frame.src = `${WIDGET_URL}/chat#` + new URLSearchParams({
        page: location.href,
        ...(this.config.user || {}), // id, email, name, plan, userHash
      })
      frame.style.cssText = 'width:380px;max-width:90vw;height:500px;border:0;border-radius:12px;display:block;margin-bottom:8px;box-shadow:0 8px 30px rgba(0,0,0,.2)'
      this.box.insertBefore(frame, this.box.firstChild)
      this.frame = frame
    },
  }
})()
```

```html
<script src="https://support.example.com/widget.js"></script>
<script>
  SupportChat.init({ user: {
    id: '{{ current_user.id }}', email: '{{ current_user.email }}',
    name: '{{ current_user.name }}', plan: '{{ current_user.plan }}',
    userHash: '{{ identity_hash(current_user) }}', // HMAC from Step 2 over the fields above, server-side
  } })
</script>
```

### Step 4: Identify the visitor and start a conversation

The `/chat` page posts the fragment values here. A request without a valid `userHash` becomes an anonymous visitor, so a forged id gives no access to a customer's data.

```typescript
// app/api/visitors/identify/route.ts
import { prisma } from '@/lib/prisma'
import { userHash, safeEqual, issueToken } from '@/lib/tokens'

export async function POST(req: Request) {
  const { id, email, name, plan, userHash: hash, page } = await req.json()
  const verified = typeof id === 'string' && typeof hash === 'string' && safeEqual(hash, userHash({ id, email, name, plan }))

  const visitor = verified
    ? await prisma.visitor.upsert({
        where: { userId: id },
        update: { email, name, metadata: { plan } },
        create: { userId: id, email, name, metadata: { plan } },
      })
    : await prisma.visitor.create({ data: {} })

  const conversation =
    (await prisma.conversation.findFirst({ where: { visitorId: visitor.id, status: { not: 'RESOLVED' } } })) ??
    (await prisma.conversation.create({ data: { visitorId: visitor.id, page } }))

  return Response.json({ conversationId: conversation.id, token: issueToken(`visitor:${visitor.id}`) })
}
```

Rate-limit this route by IP: every anonymous call creates a row.

### Step 5: WebSocket relay

Bind to loopback with a TLS reverse proxy (`wss://`) in front. Check the `Origin` header browsers send on the handshake, and take the token as the first message, not in the URL.

```typescript
// server/websocket.ts
import { WebSocketServer, WebSocket } from 'ws'
import { prisma } from '../lib/prisma'
import { verifyToken } from '../lib/tokens'
import { queueOfflineMessage } from '../lib/offline-chat'

const wss = new WebSocketServer({ host: '127.0.0.1', port: 8787, maxPayload: 16 * 1024 })
const agents = new Set<WebSocket>()
const visitors = new Map<string, Set<WebSocket>>() // conversationId -> sockets
const ALLOWED_ORIGINS = ['https://support.example.com', 'https://agents.example.com']

const send = (ws: WebSocket, p: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(p))

wss.on('connection', (ws, req) => {
  if (!ALLOWED_ORIGINS.includes(req.headers.origin ?? '')) return ws.close(1008)
  let subject: string | null = null
  let conversationId: string | null = null

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString())

      if (msg.type === 'auth') {
        subject = verifyToken(String(msg.token))
        if (!subject) return ws.close(1008)
        if (subject.startsWith('agent:')) agents.add(ws)
        else {
          const conv = await prisma.conversation.findUnique({ where: { id: String(msg.conversationId) } })
          if (!conv || `visitor:${conv.visitorId}` !== subject) return ws.close(1008)
          conversationId = conv.id
          visitors.set(conv.id, (visitors.get(conv.id) ?? new Set()).add(ws))
        }
        return send(ws, { type: 'ready' })
      }

      if (!subject || msg.type !== 'message' || typeof msg.content !== 'string') return
      const isAgent = subject.startsWith('agent:')
      const convId = isAgent ? String(msg.conversationId) : conversationId
      if (!convId || !msg.content.trim() || msg.content.length > 4000) return

      const message = await prisma.message.create({
        data: { conversationId: convId, sender: isAgent ? 'AGENT' : 'VISITOR', content: msg.content },
      })
      await prisma.conversation.update({ where: { id: convId }, data: { updatedAt: new Date() } })

      const out = { type: 'message', message }
      if (isAgent) visitors.get(convId)?.forEach(v => send(v, out))
      else {
        agents.forEach(a => send(a, out))
        if (agents.size === 0) await queueOfflineMessage(convId, msg.content)
      }
    } catch (err) {
      console.error('ws message failed', err)
    }
  })

  ws.on('close', () => {
    agents.delete(ws)
    if (conversationId) visitors.get(conversationId)?.delete(ws)
  })
})
```

An agent token comes from your own agent login (`issueToken('agent:' + agent.id)`). The in-memory maps work for one server process; with several instances, relay through Redis pub/sub or similar.

### Step 6: Offline email fallback

Escape everything a visitor typed before it goes into HTML, and check `error`: Resend's `send` returns `{ data, error }` and does not throw on API errors.

```typescript
// lib/offline-chat.ts
import { Resend } from 'resend'
import { prisma } from './prisma'

const resend = new Resend(process.env.RESEND_API_KEY)
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

export async function queueOfflineMessage(conversationId: string, content: string) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { visitor: true } })
  if (!conv) return
  const who = conv.visitor.name ?? conv.visitor.email ?? 'Visitor'

  const { error } = await resend.emails.send({
    from: 'Chat <chat@example.com>', // a domain verified in Resend
    to: 'support@example.com',
    subject: `New chat message from ${who}`.replace(/[\r\n]/g, ' '),
    html: `<p><strong>From:</strong> ${esc(who)} (${esc(conv.visitor.email ?? 'no email')})</p>
           <p><strong>Page:</strong> ${esc(conv.page ?? '')}</p>
           <p>${esc(content)}</p>
           <p><a href="https://support.example.com/inbox/${conv.id}">Reply in inbox</a></p>`,
  })
  if (error) console.error('support email failed', error.message)
}
```

### Step 7: Agent inbox API

The route needs the agent's session (`getAgent()` is your own auth). Whitelist the status filter and cap the page size. Assigning is an `update` of `assignedTo` and `status: 'ASSIGNED'` by the signed-in agent's id.

```typescript
// app/api/inbox/route.ts
const STATUSES = ['OPEN', 'ASSIGNED', 'RESOLVED'] as const

export async function GET(req: Request) {
  if (!(await getAgent())) return new Response('Unauthorized', { status: 401 })
  const status = STATUSES.find(s => s === new URL(req.url).searchParams.get('status')) ?? 'OPEN'
  return Response.json(await prisma.conversation.findMany({
    where: { status },
    include: { visitor: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  }))
}
```

## Real-World Example

A five-person support team at an invented B2B SaaS embeds the widget in its dashboard. Logged-in customers arrive with their plan attached, so agents see it without asking. Out of hours, messages reach the shared support mailbox. The first thing the team tests is the trust boundary: opening the page with a different `id` and no valid `userHash` must produce an anonymous visitor with no customer data. Typing indicators, a bot for common questions, and a CSAT survey on resolve are natural next steps.

## Related Skills

- [prisma](/skills/prisma): schema, queries and the Prisma 7 client setup
- [resend](/skills/resend): the offline email to your support mailbox
