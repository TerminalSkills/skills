---
title: "Build a Digital Downloads Store"
description: "Sell ebooks, templates, presets, and courses with Stripe checkout, secure signed S3 download links, license key generation, and a built-in affiliate program."
skills: [stripe-billing, s3-storage, resend]
difficulty: intermediate
time_estimate: "10 hours"
tags: [ecommerce, digital-products, stripe, s3, affiliate, creators]
---

# Build a Digital Downloads Store

## The Problem

You're selling Figma templates and Notion dashboards across Gumroad, Lemon Squeezy, and Payhip, and each platform keeps a share of every sale. You want a store you own, where the only fees are Stripe's processing fees (check the current rate for your country on stripe.com/pricing; in the US it is 2.9% + 30 cents per card payment at the time of writing).

## Who This Is For

**Persona:** A design creator with 3,000 Twitter followers. You sell Figma UI kits ($49), Notion life OS templates ($29), and a Lightroom preset pack ($19). You want a clean storefront, instant delivery, license keys for your software products, and an affiliate program so your fans can earn a cut.

## What You'll Build

- Product catalog with rich descriptions and preview images
- Stripe Checkout for one-time purchases
- Secure download links (a private S3 bucket, short-lived presigned URLs, a download count limit)
- License key generation for software products
- Automated delivery email via Resend
- Affiliate program with 30% commission tracking

## Architecture

```text
Next.js Storefront
├── /products          Catalog page
├── /products/[slug]   Product detail + buy button
└── /dashboard         Creator admin (orders, affiliates)
Stripe Checkout -> Webhook -> Fulfill Order
    |
    v
License key + order record -> Resend delivery email
    |
    v
/api/download/[token] -> count check -> 5-minute presigned S3 URL
```

Install: `npm i stripe resend @prisma/client @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`. Keep the S3 bucket private (Block Public Access on); files are only reachable through presigned URLs. Subscriptions use a different flow (`mode: 'subscription'`, renewals, cancellations); see the **stripe-billing** skill. This store sells one-time products only.

## Step 1: Product and Order Schema

```prisma
// schema.prisma (Postgres: String[] needs a database with scalar lists)
model Product {
  id           String   @id @default(cuid())
  name         String
  slug         String   @unique
  description  String
  price        Int      // cents
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
  stripeSessionId String   @unique   // makes fulfillment idempotent
  status          String   // paid | refunded
  amountPaid      Int      // cents, from Stripe, not from the catalog
  downloadCount   Int      @default(0)
  downloadToken   String   @unique @default(cuid())
  licenseKey      String?
  affiliateLinkId String?
  affiliateLink   AffiliateLink? @relation(fields: [affiliateLinkId], references: [id])
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
  earnings  Int     @default(0)  // cents owed or paid out
  orders    Order[]
}
```

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
  // The affiliate code must belong to this product
  const affiliateLinkId = affiliate?.productId === product.id ? affiliate.id : ''
  const session = await stripe.checkout.sessions.create({
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: product.name, images: product.previewImages },
        unit_amount: product.price
      },
      quantity: 1
    }],
    mode: 'payment',
    success_url: `${process.env.NEXT_PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/products/${product.slug}`,
    metadata: { productId: product.id, affiliateLinkId }
  })
  return Response.json({ url: session.url })
}
```

Payment methods come from your Stripe dashboard settings, so there is no `payment_method_types` list to maintain. Stripe lets Checkout sessions run 24 hours by default.

## Step 3: Webhook, Fulfill the Order Once

Stripe can deliver the same event twice, so the handler must be safe to repeat. `stripeSessionId` is unique, and the affiliate commission is written in the same transaction as the order, so a retry cannot pay a commission twice.

```typescript
// app/api/webhooks/stripe/route.ts
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { generateLicenseKey } from '@/lib/license'
import { sendDeliveryEmail } from '@/lib/email'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) return new Response('Missing signature', { status: 400 })
  const body = await req.text() // raw body, the signature covers the exact bytes
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status !== 'paid') return new Response('OK') // delayed methods: fulfilled on async_payment_succeeded
    const { productId, affiliateLinkId } = session.metadata ?? {}
    const email = session.customer_details?.email
    if (!productId || !email) return new Response('Bad metadata', { status: 400 })
    const existing = await prisma.order.findUnique({ where: { stripeSessionId: session.id } })
    if (existing) return new Response('OK') // already fulfilled
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    const affiliate = affiliateLinkId
      ? await prisma.affiliateLink.findUnique({ where: { id: affiliateLinkId } })
      : null
    // No commission when the buyer is the affiliate
    const commission = affiliate && affiliate.affiliateEmail.toLowerCase() !== email.toLowerCase()
      ? Math.floor((session.amount_total ?? 0) * affiliate.commission / 100)
      : 0
    const [order] = await prisma.$transaction([
      prisma.order.create({
        data: {
          productId, customerEmail: email, stripeSessionId: session.id, status: 'paid',
          amountPaid: session.amount_total ?? 0,
          licenseKey: product.requiresLicenseKey ? generateLicenseKey() : null,
          affiliateLinkId: commission > 0 ? affiliate!.id : null, paidAt: new Date()
        }
      }),
      ...(commission > 0
        ? [prisma.affiliateLink.update({
            where: { id: affiliate!.id },
            data: { earnings: { increment: commission } }
          })]
        : [])
    ])
    try { await sendDeliveryEmail({ order, product }) } catch (e) { console.error('delivery email failed', order.id, e) } // still return 200
  }
  if (event.type === 'charge.refunded') {
    // Find the order via stripe.checkout.sessions.list({ payment_intent }), set status 'refunded'.
  }
  return new Response('OK')
}
```

If the email fails, the order still exists and the webhook still answers 200 (Stripe's retry would find the order and skip it), so log the failure and re-send from your dashboard: the order row, not the email, is the source of truth. Reverse the affiliate commission when you handle `charge.refunded`.

## Step 4: Secure Download Links

The email contains a link to your own endpoint, not to S3. The endpoint checks the order and the download count, then redirects to a presigned URL that lives for five minutes. The count is incremented with one conditional `updateMany`, so two simultaneous requests cannot both take the last download.

```typescript
// app/api/download/[token]/route.ts
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { prisma } from '@/lib/prisma'
const s3 = new S3Client({ region: process.env.AWS_REGION! })
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> } // params is a Promise in Next.js 15+
) {
  const { token } = await params
  const order = await prisma.order.findUnique({
    where: { downloadToken: token },
    include: { product: true }
  })
  if (!order || order.status !== 'paid') {
    return new Response('Invalid download link', { status: 403 })
  }
  const limit = order.product.downloadLimit
  const claimed = await prisma.order.updateMany({
    where: {
      id: order.id,
      status: 'paid',
      ...(limit ? { downloadCount: { lt: limit } } : {})
    },
    data: { downloadCount: { increment: 1 } }
  })
  if (claimed.count === 0) return new Response('Download limit exceeded', { status: 403 })
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: order.product.s3Key,
      ResponseContentDisposition: `attachment; filename="${order.product.slug}${order.product.s3Key.slice(order.product.s3Key.lastIndexOf('.'))}"`
    }),
    { expiresIn: 300 } // seconds
  )
  return Response.redirect(url, 302)
}
```

The link in the email does not expire by time; it is capped by the download limit. If you want a time limit too, add an `expiresAt` column to `Order` and check it here. The **s3-storage** skill covers bucket policies and presigned URL options in more depth (including R2 and MinIO, which accept the same code with a different `endpoint`).

## Step 5: Delivery Email with Resend

The Resend SDK does not throw on API errors, it returns `{ data, error }`, so check `error`. A verified sending domain is required for `from`. The product name is escaped before it goes into HTML, and the idempotency key stops a webhook retry from sending the email twice.

```typescript
// lib/email.ts
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY!)
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export async function sendDeliveryEmail({ order, product }: {
  order: { id: string; customerEmail: string; downloadToken: string; licenseKey: string | null }
  product: { name: string; downloadLimit: number | null }
}) {
  const downloadUrl = `${process.env.NEXT_PUBLIC_URL}/api/download/${order.downloadToken}`
  const { error } = await resend.emails.send(
    {
      from: 'Yourbrand <downloads@mail.yourbrand.com>',
      to: order.customerEmail,
      subject: `Your download: ${product.name}`,
      html: `
        <h2>Thanks for your purchase!</h2>
        <p>Your <strong>${esc(product.name)}</strong> is ready.</p>
        <p><a href="${downloadUrl}" style="background:#000;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">Download now</a></p>
        ${order.licenseKey ? `<p>License key: <code>${order.licenseKey}</code></p>` : ''}
        <p><small>Download limit: ${product.downloadLimit ?? 'unlimited'}.</small></p>
      `
    },
    { idempotencyKey: `delivery/${order.id}` }
  )
  if (error) throw new Error(`Resend: ${error.message}`)
}
```

## License Key Generator

```typescript
// lib/license.ts
import { randomBytes } from 'crypto'
export function generateLicenseKey(): string {
  return Array.from({ length: 4 }, () => randomBytes(4).toString('hex').toUpperCase()).join('-') // 9F3A61C2-0B7D4E85-C41A92FE-7D305B68
}
```

Store the key on the order, and have your software validate it against your database (or an endpoint that reads it). The key is random, so it carries no information and cannot be derived from other keys.

## Fees Compared
Marketplaces take a percentage; your own store pays Stripe's fee only. With the US card rate of 2.9% + $0.30, a $49 sale leaves about $47.28 (49 - 1.42 - 0.30) before taxes, and a 30% affiliate commission is computed on the amount the customer actually paid. Check each platform's current fee page for the other side of the comparison, because those fees change.

## Next Steps

1. Add product bundles and discount codes
2. Build a creator dashboard with revenue charts and a customer portal for re-downloads
3. Add an `expiresAt` time limit to download links; handle `charge.refunded` fully

## Related Skills
- **stripe-billing**: Checkout sessions, signature-verified webhooks and idempotent fulfillment.
- **s3-storage**: private bucket setup and presigned download URLs.
- **resend**: sending the delivery email and handling the `{ data, error }` result.
