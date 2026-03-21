---
title: "Build a Status Page with Real-Time Incident Communication"
description: "Replace Statuspage.io with your own status page — service health tracking, incident management, subscriber notifications, and 90-day uptime history."
skills: [resend, prisma]
difficulty: intermediate
time_estimate: "6 hours"
tags: [statuspage, incidents, uptime, monitoring, email, saas, reliability, devops]
---

# Build a Status Page with Real-Time Incident Communication

Statuspage.io charges $299/month. You're paying for a simple HTML page and email notifications. Building your own gives you tighter product integration (auto-detect incidents from your monitoring), custom branding, and no per-subscriber limits.

## The Persona

You're the CTO of a SaaS handling payments. When things break, customers need to know immediately. You're tired of manually updating Statuspage while also fighting the incident. You want automated status detection, one-click incident updates, and subscriber notifications — all integrated with your existing alerting stack.

## What You'll Build

- **Service status tracking** — operational, degraded, partial outage, major outage
- **Incident management** — create, update, resolve incidents with timeline
- **Subscriber notifications** — email alerts on status changes
- **90-day uptime** — historical uptime percentage per service
- **Public status page** — embeddable widget + standalone page

## Schema

```prisma
// schema.prisma
model Service {
  id          String        @id @default(cuid())
  name        String
  slug        String        @unique
  description String?
  status      ServiceStatus @default(OPERATIONAL)
  updatedAt   DateTime      @updatedAt

  incidents   IncidentService[]
  uptimeChecks UptimeCheck[]
}

model Incident {
  id          String          @id @default(cuid())
  title       String
  severity    IncidentSeverity
  status      IncidentStatus  @default(INVESTIGATING)
  resolvedAt  DateTime?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  updates     IncidentUpdate[]
  services    IncidentService[]
}

model IncidentUpdate {
  id          String   @id @default(cuid())
  incidentId  String
  message     String
  status      IncidentStatus
  createdAt   DateTime @default(now())

  incident    Incident @relation(fields: [incidentId], references: [id])
}

model IncidentService {
  incidentId  String
  serviceId   String

  incident    Incident @relation(fields: [incidentId], references: [id])
  service     Service  @relation(fields: [serviceId], references: [id])

  @@id([incidentId, serviceId])
}

model StatusSubscriber {
  id        String   @id @default(cuid())
  email     String   @unique
  token     String   @unique @default(cuid()) // for unsubscribe
  services  String[] // empty = all services
  createdAt DateTime @default(now())
}

model UptimeCheck {
  id          String   @id @default(cuid())
  serviceId   String
  checkedAt   DateTime @default(now())
  isUp        Boolean
  responseMs  Int?

  service     Service  @relation(fields: [serviceId], references: [id])

  @@index([serviceId, checkedAt])
}

enum ServiceStatus   { OPERATIONAL DEGRADED PARTIAL_OUTAGE MAJOR_OUTAGE }
enum IncidentStatus  { INVESTIGATING IDENTIFIED MONITORING RESOLVED }
enum IncidentSeverity { MINOR MAJOR CRITICAL }
```

## Step 1: Service Status Updates

```typescript
// app/api/admin/incidents/route.ts
export async function POST(req: Request) {
  const { title, severity, serviceIds, initialMessage } = await req.json()

  const incident = await prisma.$transaction(async (tx) => {
    const incident = await tx.incident.create({
      data: { title, severity, status: 'INVESTIGATING' },
    })

    // Link affected services
    await tx.incidentService.createMany({
      data: serviceIds.map((serviceId: string) => ({ incidentId: incident.id, serviceId })),
    })

    // Initial update
    await tx.incidentUpdate.create({
      data: {
        incidentId: incident.id,
        message: initialMessage,
        status: 'INVESTIGATING',
      },
    })

    // Update service statuses
    const statusMap: Record<string, any> = {
      MINOR:    'DEGRADED',
      MAJOR:    'PARTIAL_OUTAGE',
      CRITICAL: 'MAJOR_OUTAGE',
    }

    await tx.service.updateMany({
      where: { id: { in: serviceIds } },
      data: { status: statusMap[severity] },
    })

    return incident
  })

  // Notify subscribers
  await notifySubscribers(incident.id, 'incident_created')

  return Response.json(incident)
}

// Post an update to an ongoing incident
// app/api/admin/incidents/[id]/updates/route.ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { message, status } = await req.json()

  const update = await prisma.incidentUpdate.create({
    data: { incidentId: params.id, message, status },
  })

  await prisma.incident.update({
    where: { id: params.id },
    data: {
      status,
      resolvedAt: status === 'RESOLVED' ? new Date() : undefined,
    },
  })

  // Restore services to operational if resolved
  if (status === 'RESOLVED') {
    const affected = await prisma.incidentService.findMany({
      where: { incidentId: params.id },
      select: { serviceId: true },
    })
    await prisma.service.updateMany({
      where: { id: { in: affected.map(a => a.serviceId) } },
      data: { status: 'OPERATIONAL' },
    })
  }

  await notifySubscribers(params.id, status === 'RESOLVED' ? 'incident_resolved' : 'incident_updated')

  return Response.json(update)
}
```

## Step 2: Subscriber Notifications

```typescript
// lib/notifications.ts
import { Resend } from 'resend'
import { prisma } from './prisma'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function notifySubscribers(
  incidentId: string,
  eventType: 'incident_created' | 'incident_updated' | 'incident_resolved'
) {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      updates: { orderBy: { createdAt: 'desc' }, take: 1 },
      services: { include: { service: true } },
    },
  })
  if (!incident) return

  const affectedServiceIds = incident.services.map(s => s.serviceId)
  const latestUpdate = incident.updates[0]

  const subscribers = await prisma.statusSubscriber.findMany({
    where: {
      OR: [
        { services: { isEmpty: true } },
        { services: { hasSome: affectedServiceIds } },
      ],
    },
  })

  const subjectMap = {
    incident_created: `🔴 Incident: ${incident.title}`,
    incident_updated: `🟡 Update: ${incident.title}`,
    incident_resolved: `🟢 Resolved: ${incident.title}`,
  }

  const statusColors = {
    INVESTIGATING: '#ef4444',
    IDENTIFIED:    '#f97316',
    MONITORING:    '#eab308',
    RESOLVED:      '#22c55e',
  }

  const emails = subscribers.map(sub => ({
    from: 'status@example.com',
    to: sub.email,
    subject: subjectMap[eventType],
    html: `
      <div style="max-width:600px; font-family:sans-serif;">
        <h2>${incident.title}</h2>
        <p>
          <span style="background:${statusColors[incident.status]}; color:white; padding:2px 8px; border-radius:4px; font-size:12px;">
            ${incident.status}
          </span>
          <span style="margin-left:8px; color:#666; font-size:12px;">${incident.severity} severity</span>
        </p>
        <p><strong>Affected services:</strong> ${incident.services.map(s => s.service.name).join(', ')}</p>
        ${latestUpdate ? `<p><strong>Latest update:</strong> ${latestUpdate.message}</p>` : ''}
        <p>
          <a href="https://status.example.com">View status page →</a>
          &nbsp;&nbsp;
          <a href="https://status.example.com/unsubscribe?token=${sub.token}" style="color:#999; font-size:12px;">Unsubscribe</a>
        </p>
      </div>
    `,
  }))

  // Batch send in chunks of 100
  for (let i = 0; i < emails.length; i += 100) {
    await resend.batch.send(emails.slice(i, i + 100))
  }
}
```

## Step 3: 90-Day Uptime Calculation

```typescript
// lib/uptime.ts
import { subDays, startOfDay, eachDayOfInterval } from 'date-fns'
import { prisma } from './prisma'

export async function getUptimeHistory(serviceId: string, days = 90) {
  const from = subDays(new Date(), days)
  const checks = await prisma.uptimeCheck.findMany({
    where: { serviceId, checkedAt: { gte: from } },
    orderBy: { checkedAt: 'asc' },
  })

  // Group by day, calculate daily uptime %
  const dailyStats = eachDayOfInterval({ start: from, end: new Date() }).map(day => {
    const dayStart = startOfDay(day)
    const dayEnd = new Date(dayStart.getTime() + 86400000)
    const dayChecks = checks.filter(c => c.checkedAt >= dayStart && c.checkedAt < dayEnd)

    if (dayChecks.length === 0) return { date: day, uptime: null, status: 'no_data' }

    const upCount = dayChecks.filter(c => c.isUp).length
    const uptime = (upCount / dayChecks.length) * 100

    return {
      date: day,
      uptime,
      status: uptime === 100 ? 'operational' : uptime >= 95 ? 'degraded' : 'outage',
    }
  })

  const overallUptime = checks.length > 0
    ? (checks.filter(c => c.isUp).length / checks.length) * 100
    : 100

  return { dailyStats, overallUptime: overallUptime.toFixed(3) }
}

// Uptime monitor worker — run every minute
export async function checkServices() {
  const services = await prisma.service.findMany()

  for (const service of services) {
    const start = Date.now()
    try {
      const res = await fetch(`https://example.com/health/${service.slug}`, {
        signal: AbortSignal.timeout(5000),
      })
      await prisma.uptimeCheck.create({
        data: {
          serviceId: service.id,
          isUp: res.ok,
          responseMs: Date.now() - start,
        },
      })
    } catch {
      await prisma.uptimeCheck.create({
        data: { serviceId: service.id, isUp: false },
      })
    }
  }
}
```

## Step 4: Public Status Page API

```typescript
// app/api/status/route.ts — powers your status page frontend
export async function GET() {
  const [services, activeIncidents] = await Promise.all([
    prisma.service.findMany({ orderBy: { name: 'asc' } }),
    prisma.incident.findMany({
      where: { status: { not: 'RESOLVED' } },
      include: {
        updates: { orderBy: { createdAt: 'desc' } },
        services: { include: { service: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const overallStatus = services.some(s => s.status === 'MAJOR_OUTAGE')
    ? 'MAJOR_OUTAGE'
    : services.some(s => s.status === 'PARTIAL_OUTAGE')
    ? 'PARTIAL_OUTAGE'
    : services.some(s => s.status === 'DEGRADED')
    ? 'DEGRADED'
    : 'OPERATIONAL'

  return Response.json({ services, activeIncidents, overallStatus })
}
```

## Step 5: Subscribe Endpoint

```typescript
// app/api/subscribe/route.ts
export async function POST(req: Request) {
  const { email, services } = await req.json()

  await prisma.statusSubscriber.upsert({
    where: { email },
    update: { services: services ?? [] },
    create: { email, services: services ?? [] },
  })

  // Confirmation email
  await resend.emails.send({
    from: 'status@example.com',
    to: email,
    subject: 'You\'re subscribed to status updates',
    html: `<p>You'll receive email notifications when service status changes.</p>
           <p><a href="https://status.example.com">View status page</a></p>`,
  })

  return Response.json({ success: true })
}
```

## Deploy & Schedule

```bash
# Uptime monitor — every minute
* * * * * npx ts-node workers/check-services.ts

# Serve status page at status.example.com
# Can be a static Next.js page that polls /api/status every 30s
```

## What's Next

- Add webhook notifications alongside email (Slack, PagerDuty)
- Build an embeddable status badge: `<img src="https://status.example.com/badge.svg">`
- Auto-create incidents from PagerDuty/OpsGenie alerts via webhook
- Add SMS notifications for critical incidents using Twilio
