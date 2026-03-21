---
title: "Build a Niche Freelance Marketplace"
description: "Create a two-sided freelance marketplace with talent profiles, project postings, proposal system, Stripe Connect escrow payments, and milestone-based fund release."
skills: [stripe-connect, prisma, resend]
difficulty: advanced
time_estimate: "20 hours"
tags: [marketplace, freelance, stripe-connect, escrow, two-sided, payments]
---

# Build a Niche Freelance Marketplace

## The Problem

Upwork takes 20% from freelancers. Clients pay a 3% fee on top. A niche marketplace — "AI Developers for Hire," "Shopify Experts," "Legal Writers" — could charge a flat 8% and still be 12% cheaper while owning the audience.

## Who This Is For

**Persona:** An entrepreneur who knows a specific freelance niche deeply. Maybe you ran an agency for 5 years. You see a tight community of 500 experts and 2,000 companies that would use a vertical platform built just for them. General platforms feel wrong for your niche.

## What You'll Build

- Freelancer profiles: bio, skills, portfolio, hourly rate, reviews
- Project postings: scope, budget, timeline, required skills
- Proposal system: freelancers apply, client shortlists, selects
- Milestone-based escrow: Stripe Connect holds funds, releases on approval
- Dispute resolution workflow with admin escalation
- Email notifications at every key moment via Resend

---

## Architecture

```
Next.js App
├── /freelancers           — Talent directory
├── /projects              — Active project listings
├── /projects/[id]/apply   — Proposal submission
├── /dashboard/client      — Client: post jobs, manage milestones
└── /dashboard/freelancer  — Freelancer: proposals, earnings

Stripe Connect (Express accounts)
├── Client funds escrow (Stripe holds)
├── Milestone approval → transfer to freelancer
└── Dispute → admin refund or partial release

Prisma + PostgreSQL
Resend — transactional emails
```

---

## Step 1: Core Schema

```prisma
// schema.prisma
model User {
  id       String  @id @default(cuid())
  email    String  @unique
  role     String  // client | freelancer | admin
  profile  FreelancerProfile?
  projects Project[] @relation("ClientProjects")
  proposals Proposal[]
  stripeConnectId String? // for freelancers
}

model FreelancerProfile {
  id         String   @id @default(cuid())
  userId     String   @unique
  user       User     @relation(fields: [userId], references: [id])
  title      String
  bio        String
  hourlyRate Int      // cents
  skills     String[]
  portfolio  Json[]   // { title, url, image }
  reviews    Review[]
  avgRating  Float    @default(0)
}

model Project {
  id          String     @id @default(cuid())
  clientId    String
  client      User       @relation("ClientProjects", fields: [clientId], references: [id])
  title       String
  description String
  budget      Int        // cents
  timeline    String
  skills      String[]
  status      String     // open | in_progress | completed | disputed | cancelled
  proposals   Proposal[]
  milestones  Milestone[]
  createdAt   DateTime   @default(now())
}

model Proposal {
  id          String  @id @default(cuid())
  projectId   String
  project     Project @relation(fields: [projectId], references: [id])
  freelancerId String
  freelancer  User    @relation(fields: [freelancerId], references: [id])
  coverLetter String
  proposedRate Int    // cents
  estimatedDays Int
  status      String  // pending | accepted | rejected
  createdAt   DateTime @default(now())
}

model Milestone {
  id              String    @id @default(cuid())
  projectId       String
  project         Project   @relation(fields: [projectId], references: [id])
  title           String
  amount          Int       // cents
  status          String    // funded | work_submitted | approved | released | disputed
  stripePaymentIntentId String?
  fundedAt        DateTime?
  releasedAt      DateTime?
}
```

---

## Step 2: Freelancer Stripe Connect Onboarding

```typescript
// app/api/connect/onboard/route.ts
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: Request) {
  const session = await auth()
  const user = session.user

  // Create Express connected account
  const account = await stripe.accounts.create({
    type: 'express',
    email: user.email,
    capabilities: { transfers: { requested: true } }
  })

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeConnectId: account.id }
  })

  // Generate onboarding link
  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.NEXT_PUBLIC_URL}/dashboard/freelancer/connect`,
    return_url: `${process.env.NEXT_PUBLIC_URL}/dashboard/freelancer`,
    type: 'account_onboarding'
  })

  return Response.json({ url: link.url })
}
```

---

## Step 3: Fund a Milestone (Escrow)

```typescript
// app/api/milestones/[id]/fund/route.ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const milestone = await prisma.milestone.findUniqueOrThrow({
    where: { id: params.id },
    include: { project: { include: { client: true } } }
  })

  // Platform takes 8% fee
  const platformFee = Math.floor(milestone.amount * 0.08)

  const paymentIntent = await stripe.paymentIntents.create({
    amount: milestone.amount,
    currency: 'usd',
    application_fee_amount: platformFee,
    capture_method: 'manual', // Authorize only, capture on approval
    metadata: { milestoneId: milestone.id }
  })

  await prisma.milestone.update({
    where: { id: milestone.id },
    data: {
      stripePaymentIntentId: paymentIntent.id,
      status: 'funded',
      fundedAt: new Date()
    }
  })

  return Response.json({ clientSecret: paymentIntent.client_secret })
}
```

---

## Step 4: Approve and Release Funds

```typescript
// app/api/milestones/[id]/approve/route.ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const milestone = await prisma.milestone.findUniqueOrThrow({
    where: { id: params.id },
    include: {
      project: {
        include: {
          proposals: { where: { status: 'accepted' }, include: { freelancer: true } }
        }
      }
    }
  })

  const freelancer = milestone.project.proposals[0].freelancer

  // Capture the payment
  await stripe.paymentIntents.capture(milestone.stripePaymentIntentId!)

  // Transfer to freelancer (minus platform fee, already handled by application_fee_amount)
  await stripe.transfers.create({
    amount: Math.floor(milestone.amount * 0.92), // 92% to freelancer
    currency: 'usd',
    destination: freelancer.stripeConnectId!,
    transfer_group: milestone.projectId
  })

  await prisma.milestone.update({
    where: { id: milestone.id },
    data: { status: 'released', releasedAt: new Date() }
  })

  // Notify freelancer
  await resend.emails.send({
    from: 'payments@yourmarketplace.com',
    to: freelancer.email,
    subject: `Payment released: ${milestone.title}`,
    html: `<p>$${milestone.amount / 100} has been released to your account. It will arrive in 2-5 business days.</p>`
  })

  return Response.json({ success: true })
}
```

---

## Step 5: Proposal Notification Emails

```typescript
// lib/notifications.ts
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY!)

export async function notifyNewProposal(project: any, proposal: any, freelancer: any) {
  await resend.emails.send({
    from: 'noreply@yourmarketplace.com',
    to: project.client.email,
    subject: `New proposal on "${project.title}"`,
    html: `
      <h2>You have a new proposal!</h2>
      <p><strong>${freelancer.profile.title}</strong> applied to your project.</p>
      <p>Proposed rate: $${proposal.proposedRate / 100}/hr</p>
      <p>Timeline: ${proposal.estimatedDays} days</p>
      <a href="${process.env.NEXT_PUBLIC_URL}/projects/${project.id}/proposals">
        Review Proposals
      </a>
    `
  })
}
```

---

## Dispute Resolution Flow

```
Client reports issue
    ↓
Milestone status → "disputed"
    ↓
Admin reviews evidence from both parties (72h window)
    ↓
Admin decision:
  - Full release to freelancer
  - Full refund to client
  - Split (e.g. 50/50)
    ↓
Stripe: capture + transfer OR cancel PaymentIntent
```

---

## Platform Economics

| GMV/month | Fee (8%) | Costs | Profit |
|-----------|----------|-------|--------|
| $10,000 | $800 | ~$150 | ~$650 |
| $50,000 | $4,000 | ~$300 | ~$3,700 |
| $200,000 | $16,000 | ~$500 | ~$15,500 |

---

## Next Steps

1. Add video intro uploads for freelancer profiles
2. Build a real-time chat between client and freelancer
3. Add AI-powered project scope estimator
4. Implement a review and rating system post-project
5. Create a "Featured Freelancer" paid promotion slot
