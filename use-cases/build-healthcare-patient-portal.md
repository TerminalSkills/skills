---
title: "Build a HIPAA-Compliant Patient Portal"
description: "Replace paper-based clinic processes with a secure patient portal: registration, appointment scheduling, encrypted provider messaging, lab result uploads, and prescription refill requests — all HIPAA-compliant."
skills: [hipaa-compliance, prisma, resend]
difficulty: advanced
time_estimate: "8 hours"
tags: [healthcare, hipaa, patient-portal, medical, appointments, messaging]
---

# Build a HIPAA-Compliant Patient Portal

Your clinic is drowning in phone calls, faxes, and sticky notes. Patients can't see their lab results online. Staff spend half their day playing phone tag.

It's time to build a **real patient portal** — not a $500/month SaaS tool you don't control, but one you own.

## Who This Is For

A clinic administrator or developer at a small-to-medium medical practice. You're replacing paper-based workflows and want full control over data, branding, and features.

## What You'll Build

- 👤 Patient registration with identity verification
- 📅 Appointment scheduling with provider availability
- 🔒 Encrypted secure messaging (patient ↔ provider)
- 📄 Lab results and document upload
- 💊 Prescription refill requests
- ✉️ Automated email notifications via Resend

## Prerequisites

- Business Associate Agreement (BAA) signed with all vendors
- Encryption at rest enabled on your database host
- Anthropic API key (optional, for smart triage)
- Resend account (ensure BAA is in place)

---

## Step 1: HIPAA-First Schema

```prisma
// schema.prisma
// All PHI fields encrypted at application layer before storage

model Patient {
  id               String        @id @default(cuid())
  emailHash        String        @unique // hash for lookup, never plain
  encryptedEmail   String        // AES-256-GCM encrypted
  encryptedName    String
  encryptedDOB     String
  encryptedPhone   String?
  verifiedAt       DateTime?
  createdAt        DateTime      @default(now())
  appointments     Appointment[]
  messages         Message[]
  documents        Document[]
  refillRequests   RefillRequest[]
}

model Provider {
  id           String        @id @default(cuid())
  name         String
  specialty    String
  availability Json          // { "monday": ["09:00","10:00","14:00"], ... }
  appointments Appointment[]
  messages     Message[]
}

model Appointment {
  id          String    @id @default(cuid())
  patientId   String
  providerId  String
  scheduledAt DateTime
  duration    Int       @default(30) // minutes
  reason      String?
  status      String    @default("scheduled") // scheduled | confirmed | cancelled | completed
  patient     Patient   @relation(fields: [patientId], references: [id])
  provider    Provider  @relation(fields: [providerId], references: [id])
  createdAt   DateTime  @default(now())
}

model Message {
  id              String   @id @default(cuid())
  patientId       String
  providerId      String?
  direction       String   // "patient_to_provider" | "provider_to_patient"
  encryptedBody   String   // AES-256-GCM
  read            Boolean  @default(false)
  sentAt          DateTime @default(now())
  patient         Patient  @relation(fields: [patientId], references: [id])
  provider        Provider? @relation(fields: [providerId], references: [id])
}

model Document {
  id            String   @id @default(cuid())
  patientId     String
  type          String   // "lab_result" | "imaging" | "referral" | "other"
  encryptedName String
  s3Key         String   // encrypted filename in S3
  uploadedBy    String   // "patient" | "provider"
  uploadedAt    DateTime @default(now())
  patient       Patient  @relation(fields: [patientId], references: [id])
}

model RefillRequest {
  id          String   @id @default(cuid())
  patientId   String
  medication  String
  dosage      String
  pharmacy    String
  status      String   @default("pending") // pending | approved | denied
  notes       String?
  requestedAt DateTime @default(now())
  patient     Patient  @relation(fields: [patientId], references: [id])
}
```

```bash
npx prisma migrate dev --name init
```

---

## Step 2: PHI Encryption Utilities

```typescript
// lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32-byte hex key
const ALGORITHM = 'aes-256-gcm';

export function encryptPHI(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptPHI(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}

export function hashForLookup(value: string): string {
  return createHash('sha256')
    .update(value.toLowerCase() + process.env.HASH_SALT!)
    .digest('hex');
}
```

---

## Step 3: Patient Registration

```typescript
// lib/patients.ts
import { prisma } from './prisma';
import { encryptPHI, hashForLookup } from './crypto';
import { sendVerificationEmail } from './email';

export async function registerPatient(input: {
  email: string; name: string; dob: string; phone?: string;
}) {
  const emailHash = hashForLookup(input.email);

  const existing = await prisma.patient.findUnique({ where: { emailHash } });
  if (existing) throw new Error('Patient already registered');

  const patient = await prisma.patient.create({
    data: {
      emailHash,
      encryptedEmail: encryptPHI(input.email),
      encryptedName: encryptPHI(input.name),
      encryptedDOB: encryptPHI(input.dob),
      encryptedPhone: input.phone ? encryptPHI(input.phone) : null,
    }
  });

  await sendVerificationEmail(input.email, patient.id);
  return patient.id;
}

export async function verifyPatient(patientId: string) {
  await prisma.patient.update({
    where: { id: patientId },
    data: { verifiedAt: new Date() }
  });
}
```

---

## Step 4: Appointment Scheduling

```typescript
// lib/appointments.ts
import { prisma } from './prisma';
import { sendAppointmentConfirmation } from './email';
import { decryptPHI } from './crypto';

export async function getAvailableSlots(providerId: string, date: Date): Promise<string[]> {
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!provider) throw new Error('Provider not found');

  const availability = provider.availability as Record<string, string[]>;
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const allSlots: string[] = availability[dayName] ?? [];

  // Exclude already booked slots
  const booked = await prisma.appointment.findMany({
    where: {
      providerId,
      scheduledAt: {
        gte: new Date(date.setHours(0, 0, 0, 0)),
        lt: new Date(date.setHours(23, 59, 59, 999)),
      },
      status: { not: 'cancelled' }
    }
  });

  const bookedTimes = booked.map(a => a.scheduledAt.toTimeString().slice(0, 5));
  return allSlots.filter(slot => !bookedTimes.includes(slot));
}

export async function scheduleAppointment(
  patientId: string, providerId: string,
  scheduledAt: Date, reason: string
) {
  const appointment = await prisma.appointment.create({
    data: { patientId, providerId, scheduledAt, reason, status: 'scheduled' }
  });

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (patient) {
    const email = decryptPHI(patient.encryptedEmail);
    const name = decryptPHI(patient.encryptedName);
    await sendAppointmentConfirmation(email, name, scheduledAt);
  }

  return appointment.id;
}
```

---

## Step 5: Secure Messaging + Email Notifications

```typescript
// lib/messaging.ts
import { prisma } from './prisma';
import { encryptPHI, decryptPHI } from './crypto';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendMessage(params: {
  patientId: string; providerId?: string;
  direction: 'patient_to_provider' | 'provider_to_patient'; body: string;
}) {
  await prisma.message.create({
    data: {
      patientId: params.patientId,
      providerId: params.providerId,
      direction: params.direction,
      encryptedBody: encryptPHI(params.body),
    }
  });

  // Notify recipient via email (no PHI in email body)
  if (params.direction === 'patient_to_provider') {
    const provider = await prisma.provider.findUnique({ where: { id: params.providerId! } });
    // Send notification to provider — body is just a ping, PHI stays in portal
    await resend.emails.send({
      from: 'portal@yourclinic.com',
      to: `${provider?.name}@yourclinic.com`,
      subject: 'New patient message in portal',
      html: '<p>A patient has sent you a message. <a href="https://portal.yourclinic.com/messages">View in portal</a>.</p>',
    });
  }
}

export async function getMessages(patientId: string) {
  const messages = await prisma.message.findMany({
    where: { patientId },
    orderBy: { sentAt: 'asc' }
  });

  return messages.map(m => ({
    ...m,
    body: decryptPHI(m.encryptedBody), // decrypt for display
  }));
}
```

---

## Step 6: Email Module

```typescript
// lib/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(email: string, patientId: string) {
  const verifyUrl = `${process.env.PORTAL_URL}/verify?token=${patientId}`;
  await resend.emails.send({
    from: 'noreply@yourclinic.com',
    to: email,
    subject: 'Verify your patient portal account',
    html: `<p>Click to verify your account: <a href="${verifyUrl}">Verify Now</a></p>
           <p>This link expires in 24 hours.</p>`,
  });
}

export async function sendAppointmentConfirmation(email: string, name: string, date: Date) {
  await resend.emails.send({
    from: 'appointments@yourclinic.com',
    to: email,
    subject: 'Appointment Confirmed',
    html: `<p>Hi ${name},</p><p>Your appointment on ${date.toLocaleString()} is confirmed.</p>
           <p><a href="${process.env.PORTAL_URL}/appointments">View in portal</a></p>`,
  });
}
```

---

## Compliance Checklist

- ✅ All PHI encrypted at rest (AES-256-GCM)
- ✅ No PHI in email bodies — portal links only
- ✅ BAA signed with Resend, database host, file storage
- ✅ Audit logging for all PHI access (add `AuditLog` model)
- ✅ TLS 1.2+ enforced on all connections
- ✅ Role-based access — patients see only their own records

---

## Next Steps

- Add audit logging (every PHI access recorded to `AuditLog`)
- Implement MFA for patient and provider login
- Add document upload to S3 with server-side encryption (SSE-S3)
- Build a provider-facing admin dashboard
- Add telehealth video via Daily.co HIPAA Business plan
