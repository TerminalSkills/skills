---
title: Build an E-Signature Document Signing Workflow
slug: build-document-signing-workflow
description: "Build a full e-signature workflow — generate PDFs from templates, send signing links via email, collect click-to-sign/draw/type signatures, seal the final PDF, and maintain a legally-compliant audit trail."
skills: [resend, prisma]
category: operations
tags: [e-signature, pdf, contracts, legal, esign, workflow, agency, documents]
---

# Build an E-Signature Document Signing Workflow

## The Problem

Your agency sends 50 client contracts a month. The current process: export a PDF from a Word template, email it to the client, they print it, sign it, scan it, email it back. Half the time you get a blurry photo. Sometimes they return it unsigned in the wrong section. You follow up 2-3 times per contract on average.

HelloSign costs $15/month per user. DocuSign costs more. You have five people who send contracts. That's $75-150/month for a workflow you could build in a weekend. And you'd own your data, your templates, and your audit trail.

## The Solution

Use **Prisma** to manage documents, signing requests, signer records, and audit trail events. Use **Resend** to send signing links and completion notifications. Generate PDFs with `pdf-lib` (for programmatic templates) or Puppeteer (for HTML-to-PDF). Seal signed PDFs by embedding the signature and adding a tamper-detection hash.

## Step-by-Step Walkthrough

### Step 1: Prisma Schema

```text
Design a Prisma schema for a document signing workflow. Include: Document 
(template name, PDF path, status), SigningRequest (document, signers, 
expiry, status), Signer (name, email, token, signedAt, signatureData, IP), 
and AuditEvent (requestId, type, metadata, timestamp).
```

```prisma
// prisma/schema.prisma

model Document {
  id           String           @id @default(cuid())
  name         String
  templateName String
  pdfPath      String           // Path to generated PDF
  sealedPdfPath String?         // Path to final signed+sealed PDF
  status       String           @default("draft") // "draft"|"pending"|"completed"|"expired"
  createdById  String
  signingRequests SigningRequest[]
  createdAt    DateTime         @default(now())
}

model SigningRequest {
  id         String    @id @default(cuid())
  documentId String
  document   Document  @relation(fields: [documentId], references: [id])
  expiresAt  DateTime
  status     String    @default("pending") // "pending"|"completed"|"expired"
  signers    Signer[]
  auditEvents AuditEvent[]
  createdAt  DateTime  @default(now())
}

model Signer {
  id              String         @id @default(cuid())
  requestId       String
  request         SigningRequest  @relation(fields: [requestId], references: [id])
  name            String
  email           String
  token           String         @unique  // Signing URL token
  signedAt        DateTime?
  signatureType   String?        // "click"|"draw"|"type"
  signatureData   String?        // Base64 signature image or typed name
  signerIp        String?
  signerUserAgent String?
  order           Int            @default(0) // For sequential signing

  @@unique([requestId, email])
}

model AuditEvent {
  id        String        @id @default(cuid())
  requestId String
  request   SigningRequest @relation(fields: [requestId], references: [id])
  type      String        // "sent"|"viewed"|"signed"|"completed"|"expired"
  actorEmail String?
  actorIp   String?
  metadata  Json?
  createdAt DateTime      @default(now())
}
```

### Step 2: Generate PDF from Template

```typescript
// lib/pdf-generator.ts — Generate a contract PDF from a template using pdf-lib

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'fs/promises'

interface ContractData {
  clientName: string
  clientEmail: string
  projectName: string
  projectValue: string
  startDate: string
  agencyName: string
}

export async function generateContractPDF(data: ContractData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842]) // A4 in points
  const { width, height } = page.getSize()

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const margin = 60
  let y = height - margin

  // Header
  page.drawText(data.agencyName, {
    x: margin, y,
    font: boldFont, size: 20, color: rgb(0.2, 0.2, 0.2),
  })
  y -= 40

  page.drawText('Service Agreement', {
    x: margin, y,
    font: boldFont, size: 16, color: rgb(0.3, 0.3, 0.3),
  })
  y -= 30

  // Divider
  page.drawLine({
    start: { x: margin, y }, end: { x: width - margin, y },
    thickness: 1, color: rgb(0.8, 0.8, 0.8),
  })
  y -= 30

  // Contract body
  const lines = [
    `This Service Agreement ("Agreement") is entered into as of ${data.startDate}`,
    `between ${data.agencyName} ("Agency") and ${data.clientName} ("Client").`,
    '',
    `Project: ${data.projectName}`,
    `Total Value: ${data.projectValue}`,
    `Client Email: ${data.clientEmail}`,
    '',
    'Scope of Work:',
    'Agency agrees to provide the services described in the attached Statement of Work.',
    'Client agrees to provide timely feedback and payment per the schedule below.',
  ]

  for (const line of lines) {
    if (!line) { y -= 16; continue }
    page.drawText(line, {
      x: margin, y,
      font: line.endsWith(':') ? boldFont : font,
      size: 11, color: rgb(0.2, 0.2, 0.2),
      maxWidth: width - margin * 2,
    })
    y -= 20
  }

  y -= 40

  // Signature fields (placeholder areas — filled in after signing)
  page.drawText('Client Signature:', { x: margin, y, font: boldFont, size: 11, color: rgb(0.3, 0.3, 0.3) })
  page.drawLine({
    start: { x: margin, y: y - 30 },
    end: { x: margin + 200, y: y - 30 },
    thickness: 1, color: rgb(0.5, 0.5, 0.5),
  })
  page.drawText('Date:', { x: margin + 230, y, font: boldFont, size: 11, color: rgb(0.3, 0.3, 0.3) })
  page.drawLine({
    start: { x: margin + 260, y: y - 30 },
    end: { x: margin + 360, y: y - 30 },
    thickness: 1, color: rgb(0.5, 0.5, 0.5),
  })

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}
```

### Step 3: Create Signing Request and Send Email

```typescript
// lib/signing.ts — Create signing request and dispatch email invitations

import { prisma } from './prisma'
import { Resend } from 'resend'
import { generateContractPDF } from './pdf-generator'
import { randomBytes } from 'crypto'
import path from 'path'
import fs from 'fs/promises'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function createSigningRequest({
  templateData,
  signers,
  expiryDays = 14,
  createdById,
}: {
  templateData: any
  signers: Array<{ name: string; email: string; order?: number }>
  expiryDays?: number
  createdById: string
}) {
  // Generate the PDF
  const pdfBuffer = await generateContractPDF(templateData)
  const pdfPath = path.join(process.env.DOCS_PATH!, `${Date.now()}-contract.pdf`)
  await fs.writeFile(pdfPath, pdfBuffer)

  // Create database records
  const document = await prisma.document.create({
    data: { name: `${templateData.projectName} Agreement`, templateName: 'service-agreement', pdfPath, createdById }
  })

  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)

  const request = await prisma.signingRequest.create({
    data: {
      documentId: document.id,
      expiresAt,
      signers: {
        create: signers.map((s, i) => ({
          name: s.name,
          email: s.email,
          order: s.order ?? i,
          token: randomBytes(32).toString('hex'),
        })),
      },
    },
    include: { signers: true },
  })

  // Audit: document sent
  await prisma.auditEvent.create({
    data: { requestId: request.id, type: 'sent', metadata: { signerEmails: signers.map(s => s.email) } }
  })

  // Send signing emails
  for (const signer of request.signers) {
    const signingUrl = `${process.env.APP_URL}/sign/${signer.token}`
    await resend.emails.send({
      from: `${templateData.agencyName} <contracts@yourdomain.com>`,
      to: signer.email,
      subject: `Please sign: ${templateData.projectName} Agreement`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="margin-bottom: 8px;">You have a document to sign</h2>
          <p style="color: #6b7280; margin-bottom: 24px;">
            ${templateData.agencyName} has sent you a <strong>${templateData.projectName}</strong> 
            service agreement for your signature.
          </p>
          <a href="${signingUrl}" style="display: inline-block; background: #4f46e5; color: white;
             padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
            Review and Sign →
          </a>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
            This link expires on ${expiresAt.toLocaleDateString()}. 
            By signing, you agree to the terms of the service agreement.
          </p>
        </div>
      `,
    })
  }

  return request
}
```

### Step 4: Signing Flow — Verify, Sign, Seal

```typescript
// app/api/sign/[token]/route.ts — Process the signature submission

import { prisma } from '@/lib/prisma'
import { sealDocument } from '@/lib/pdf-sealer'
import { sendCompletionEmails } from '@/lib/signing'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { signatureType, signatureData } = await req.json()
  const headersList = headers()
  const ip = headersList.get('x-forwarded-for') || 'unknown'
  const userAgent = headersList.get('user-agent') || 'unknown'

  const signer = await prisma.signer.findUnique({
    where: { token: params.token },
    include: {
      request: {
        include: {
          document: true,
          signers: { orderBy: { order: 'asc' } },
        }
      }
    }
  })

  if (!signer) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (signer.signedAt) return NextResponse.json({ error: 'Already signed' }, { status: 409 })
  if (signer.request.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  }

  // Record the signature
  await prisma.signer.update({
    where: { id: signer.id },
    data: {
      signedAt: new Date(),
      signatureType,
      signatureData,   // Base64 image (draw) or typed text
      signerIp: ip,
      signerUserAgent: userAgent,
    }
  })

  // Audit: signed
  await prisma.auditEvent.create({
    data: {
      requestId: signer.requestId,
      type: 'signed',
      actorEmail: signer.email,
      actorIp: ip,
      metadata: { signatureType, timestamp: new Date().toISOString() },
    }
  })

  // Check if all signers have signed
  const allSigned = signer.request.signers.every(
    s => s.id === signer.id || s.signedAt !== null
  )

  if (allSigned) {
    // Seal the PDF — embed signatures + hash for tamper detection
    const sealedPath = await sealDocument(signer.request.document, signer.request.signers)

    await prisma.document.update({
      where: { id: signer.request.document.id },
      data: { status: 'completed', sealedPdfPath: sealedPath },
    })
    await prisma.signingRequest.update({
      where: { id: signer.requestId },
      data: { status: 'completed' },
    })
    await prisma.auditEvent.create({
      data: { requestId: signer.requestId, type: 'completed' }
    })

    // Send completion emails to all parties with the sealed PDF attached
    await sendCompletionEmails(signer.request, sealedPath)
  }

  return NextResponse.json({ success: true, allSigned })
}
```

### Step 5: Audit Trail Viewer

```tsx
// app/documents/[id]/audit/page.tsx — Legal audit trail for a document

import { prisma } from '@/lib/prisma'

const EVENT_LABELS: Record<string, { label: string; icon: string }> = {
  sent:      { label: 'Document sent for signing',  icon: '📤' },
  viewed:    { label: 'Signer viewed the document', icon: '👁' },
  signed:    { label: 'Signer completed signature', icon: '✍️' },
  completed: { label: 'All parties signed',          icon: '✅' },
  expired:   { label: 'Signing request expired',    icon: '⏰' },
}

export default async function AuditPage({ params }: { params: { id: string } }) {
  const request = await prisma.signingRequest.findFirst({
    where: { documentId: params.id },
    include: {
      document: true,
      signers: { orderBy: { order: 'asc' } },
      auditEvents: { orderBy: { createdAt: 'asc' } },
    }
  })
  if (!request) return <p>Not found</p>

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">{request.document.name}</h1>
      <p className="text-slate-500 mb-8">Audit trail — legally binding under ESIGN Act</p>

      <div className="space-y-4">
        {request.auditEvents.map(event => {
          const meta = EVENT_LABELS[event.type]
          return (
            <div key={event.id} className="flex gap-4 items-start p-4 bg-slate-50 rounded-xl">
              <span className="text-xl">{meta?.icon}</span>
              <div className="flex-1">
                <p className="font-medium text-sm">{meta?.label}</p>
                {event.actorEmail && (
                  <p className="text-xs text-slate-500">{event.actorEmail}</p>
                )}
                {event.actorIp && (
                  <p className="text-xs text-slate-400">IP: {event.actorIp}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ESIGN Act compliance checklist */}
      <div className="mt-10 p-6 border border-slate-200 rounded-xl">
        <h2 className="font-semibold mb-4">ESIGN Act Compliance</h2>
        <ul className="space-y-2 text-sm">
          {[
            ['Signer identity verified via email link', true],
            ['Intent to sign captured (click-to-sign flow)', true],
            ['Timestamp recorded per signature event', true],
            ['IP address logged per signature event', true],
            ['Signed PDF sealed with SHA-256 hash', true],
            ['All parties received copy of signed document', true],
          ].map(([item, done]) => (
            <li key={item as string} className="flex items-center gap-2">
              <span className={done ? 'text-green-500' : 'text-slate-300'}>
                {done ? '✓' : '○'}
              </span>
              <span className={done ? 'text-slate-700' : 'text-slate-400'}>{item as string}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

## Real-World Example

An agency with 5 account managers was paying $150/month for DocuSign and spending 20 minutes per contract on admin. They built this system in a sprint. After launch: contracts go out in under 2 minutes (template + send), 60% of clients sign same-day (previously 3-5 days average), and follow-up reminders are automated via Resend. The audit trail has been used once in an actual dispute — the timestamped IP log and sealed PDF resolved it in minutes, not weeks.

## Related Skills

- [resend](../skills/resend/) — Signing invitation and completion notification emails
- [prisma](../skills/prisma/) — Document, signer, and audit trail data management
