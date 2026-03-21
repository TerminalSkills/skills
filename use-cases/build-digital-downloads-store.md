---
title: "Build a Digital Downloads Store"
description: "Sell ebooks, templates, presets, and courses with Stripe checkout, secure signed S3 download links, license key generation, and a built-in affiliate program."
skills: [stripe, s3-storage, resend]
difficulty: intermediate
time_estimate: "10 hours"
tags: [ecommerce, digital-products, stripe, s3, affiliate, creators]
---

# Build a Digital Downloads Store

## The Problem

You're selling Figma templates and Notion dashboards across Gumroad, Lemon Squeezy, and Payhip — each taking 5-10% of every sale. You want a store you own, where 100% of the revenue is yours after Stripe's 2.9%.

## Who This Is For

**Persona:** A design creator with 3,000 Twitter followers. You sell Figma UI kits ($49), Notion life OS templates ($29), and a Lightroom preset pack ($19). You want a clean storefront, instant delivery, license keys for your software products, and an affiliate program so your fans can earn a cut.

## What You'll Build

- Product catalog with rich descriptions and preview images
- Stripe Checkout for one-time purchases and subscriptions
- Secure download links (signed S3 URLs with expiry + download count limits)
- License key generation for software products
- Automated delivery email via Resend
- Affiliate program with 30% commission tracking

---

## Architecture

```
Next.js Storefront
├── /products          — Catalog page
├── /products/[slug]   — Product detail + buy button
└── /dashboard         — Creator admin (orders, affiliates)

Stripe Checkout → Webhook → Fulfill Order
    ↓
Generate signed S3 URL + license key
    ↓
Resend: delivery email with download link
```

---

## Step 1: Product and Order Schema

```prisma
// schema.prisma
model Product {
  id           String   @id @default(cuid())
  name         String
  slug         String   @unique
  description  String
  price        Int      // cents
  type         String   // one_time | subscription
  s3Key        String   // path to file in S3 bucket
  previewImages String[] // URLs
  requiresLicenseKey Boolean @default(false)
  downloadLimit Int?     // null = unlimited
  orders       Order[]
  affiliateLinks AffiliateLink[]
}

model Order {
  id              String   @id @default(cuid())
  productId       String
  product         Product  @relation(fields: [productId], references: [id])
  customerEmail   String
  stripeSessionId String   @unique
  status          String   // pending | paid | refunded
  downloadCount   Int      @default(0)
  downloadToken   String   @unique @default(cuid())
  licenseKey      String?
  affiliateLinkId String?
  paidAt          DateTime?
  createdAt       DateTime @default(now())
}

model AffiliateLink {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id])
  affiliateEmail String
  code      String  @unique
  commission Int    @default(30) // percent
  earnings  Int     @default(0)  // cents paid out
  orders    Order[]  // via affiliateLinkId
}
```

---

## Step 2: Stripe Checkout with Affiliate Tracking

```typescript
// app/api/checkout/route.ts
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: Request) {
  const { productId, affiliateCode } = await req.json()

  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
  const affiliate = affiliateCode
    ? await prisma.affiliateLink.findUnique({ where: { code: affiliateCode } })
    : null

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: product.name, images: product.previewImages },
        unit_amount: product.price
      },
      quantity: 1
    }],
    mode: 'payment',
    success_url: `${process.env.NEXT_PUBLIC_URL}/success?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/products/${product.slug}`,
    metadata: {
      productId: product.id,
      affiliateLinkId: affiliate?.id ?? ''
    }
  })

  return Response.json({ url: session.url })
}
```

---

## Step 3: Webhook — Fulfill Order

```typescript
// app/api/webhooks/stripe/route.ts
import { generateLicenseKey } from '@/lib/license'
import { sendDeliveryEmail } from '@/lib/email'

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!
  const body = await req.text()
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { productId, affiliateLinkId } = session.metadata!

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } })

    const licenseKey = product.requiresLicenseKey ? generateLicenseKey() : null

    const order = await prisma.order.create({
      data: {
        productId,
        customerEmail: session.customer_details!.email!,
        stripeSessionId: session.id,
        status: 'paid',
        licenseKey,
        affiliateLinkId: affiliateLinkId || null,
        paidAt: new Date()
      }
    })

    // Track affiliate commission
    if (affiliateLinkId) {
      const commission = Math.floor(product.price * 0.3)
      await prisma.affiliateLink.update({
        where: { id: affiliateLinkId },
        data: { earnings: { increment: commission } }
      })
    }

    // Send delivery email
    await sendDeliveryEmail({ order, product })
  }

  return new Response('OK')
}
```

---

## Step 4: Secure Signed S3 Download Links

```typescript
// lib/downloads.ts
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3 = new S3Client({ region: process.env.AWS_REGION! })

export async function generateDownloadUrl(s3Key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: s3Key
  })
  // URL expires in 1 hour
  return getSignedUrl(s3, command, { expiresIn: 3600 })
}

// app/api/download/[token]/route.ts
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const order = await prisma.order.findUnique({
    where: { downloadToken: params.token },
    include: { product: true }
  })

  if (!order || order.status !== 'paid') {
    return new Response('Invalid download link', { status: 403 })
  }

  if (order.product.downloadLimit && order.downloadCount >= order.product.downloadLimit) {
    return new Response('Download limit exceeded', { status: 403 })
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { downloadCount: { increment: 1 } }
  })

  const url = await generateDownloadUrl(order.product.s3Key)
  return Response.redirect(url)
}
```

---

## Step 5: Delivery Email with Resend

```typescript
// lib/email.ts
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendDeliveryEmail({ order, product }: { order: any, product: any }) {
  const downloadUrl = `${process.env.NEXT_PUBLIC_URL}/api/download/${order.downloadToken}`

  await resend.emails.send({
    from: 'downloads@yourbrand.com',
    to: order.customerEmail,
    subject: `Your download: ${product.name}`,
    html: `
      <h2>Thanks for your purchase! 🎉</h2>
      <p>Your <strong>${product.name}</strong> is ready.</p>
      <a href="${downloadUrl}" style="background:#000;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">
        Download Now
      </a>
      ${order.licenseKey ? `<p>License Key: <code>${order.licenseKey}</code></p>` : ''}
      <p><small>This link expires in 24 hours. Download limit: ${product.downloadLimit ?? 'unlimited'} times.</small></p>
    `
  })
}
```

---

## License Key Generator

```typescript
// lib/license.ts
import { randomBytes } from 'crypto'

export function generateLicenseKey(): string {
  const segments = Array.from({ length: 4 }, () =>
    randomBytes(4).toString('hex').toUpperCase()
  )
  return segments.join('-') // e.g. A1B2C3D4-E5F6A7B8-C9D0E1F2-G3H4I5J6
}
```

---

## Revenue Stack

| Item | Gumroad | Your Store |
|------|---------|------------|
| 10 sales × $49 | $441 (10% fee) | $466 (2.9% Stripe only) |
| 100 sales × $49 | $4,410 | $4,658 |
| Affiliate 30% cut | Manual | Automatic |

---

## Next Steps

1. Add product bundles and discount codes
2. Build a creator dashboard with revenue charts
3. Implement a customer portal for re-downloads
4. Add PayPal as an alternative payment method
5. Build a review/testimonial system
