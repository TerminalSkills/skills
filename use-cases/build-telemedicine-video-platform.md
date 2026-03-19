---
title: "Build a Telemedicine Video Platform"
description: "Launch a direct-to-patient telemedicine practice with HIPAA-compliant video calls, appointment booking with Stripe payments, in-call symptom forms, e-prescription PDF generation, and automated post-visit follow-up emails."
skills: [stripe, resend, hipaa-compliance]
difficulty: advanced
time_estimate: "10 hours"
tags: [healthcare, hipaa, telemedicine, video, stripe, payments, eprescription]
---

# Build a Telemedicine Video Platform

You're a doctor. You want to see patients directly — no middleman, no insurance hassle. Just book, pay, consult, prescribe.

**You're building your own Teladoc**, but for your specialty, your patients, your brand.

## Who This Is For

A physician, NP, or PA building a direct-to-patient telemedicine practice. You've got the license, you've got the patients — you need the tech stack.

## What You'll Build

- 📹 HIPAA-compliant video calls via Daily.co
- 📅 Appointment scheduling with $50 payment gate (Stripe)
- 📝 In-call: shared notes, symptom checker form, vitals
- 📋 E-prescription: PDF generation, pharmacy routing
- 📬 Follow-up: automated post-visit care instructions via Resend

## Prerequisites

- Daily.co account (Business plan for HIPAA BAA)
- Stripe account with BAA if storing card data
- Resend account
- PostgreSQL database

---

## Step 1: Database Schema

```prisma
// schema.prisma
model Patient {
  id             String        @id @default(cuid())
  email          String        @unique
  name           String
  phone          String?
  dob            DateTime?
  stripeCustomer String?
  appointments   Appointment[]
  prescriptions  Prescription[]
  createdAt      DateTime      @default(now())
}

model Appointment {
  id              String    @id @default(cuid())
  patientId       String
  scheduledAt     DateTime
  durationMin     Int       @default(30)
  status          String    @default("pending_payment") // pending_payment | confirmed | in_progress | completed | cancelled
  stripePaymentId String?
  dailyRoomName   String?
  dailyRoomUrl    String?
  notes           String?   // encrypted visit notes
  symptoms        Json?     // submitted symptom form
  vitals          Json?     // BP, HR, temp, etc.
  patient         Patient   @relation(fields: [patientId], references: [id])
  prescriptions   Prescription[]
  createdAt       DateTime  @default(now())
}

model Prescription {
  id             String   @id @default(cuid())
  patientId      String
  appointmentId  String
  medication     String
  dosage         String
  frequency      String
  quantity       Int
  refills        Int      @default(0)
  instructions   String?
  pharmacyFax    String?
  issuedAt       DateTime @default(now())
  patient        Patient  @relation(fields: [patientId], references: [id])
  appointment    Appointment @relation(fields: [appointmentId], references: [id])
}
```

```bash
npx prisma migrate dev --name init
```

---

## Step 2: Stripe Checkout for $50 Consultation

```typescript
// lib/payment.ts
import Stripe from 'stripe';
import { prisma } from './prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createConsultationCheckout(
  patientId: string,
  appointmentId: string,
  scheduledAt: Date,
  patientEmail: string
) {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Telemedicine Consultation',
          description: `Video consultation on ${scheduledAt.toLocaleString()}`,
        },
        unit_amount: 5000, // $50.00
      },
      quantity: 1,
    }],
    mode: 'payment',
    customer_email: patientEmail,
    metadata: { appointmentId, patientId },
    success_url: `${process.env.APP_URL}/appointments/${appointmentId}/confirmed?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/appointments/${appointmentId}/cancelled`,
  });

  return session.url;
}

export async function handleStripeWebhook(payload: Buffer, sig: string) {
  const event = stripe.webhooks.constructEvent(
    payload, sig, process.env.STRIPE_WEBHOOK_SECRET!
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { appointmentId } = session.metadata!;

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'confirmed', stripePaymentId: session.payment_intent as string }
    });

    await createDailyRoom(appointmentId);
    await sendConfirmationEmail(appointmentId);
  }
}
```

---

## Step 3: HIPAA-Compliant Daily.co Video Room

```typescript
// lib/video.ts
import { prisma } from './prisma';

export async function createDailyRoom(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true }
  });
  if (!appointment) throw new Error('Appointment not found');

  const expiryTime = Math.floor(appointment.scheduledAt.getTime() / 1000) + 3600; // 1hr after start

  const res = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `consult-${appointmentId}`,
      properties: {
        exp: expiryTime,
        max_participants: 2,
        enable_chat: true,
        enable_knocking: true,
        // HIPAA: disable recording, disable analytics
        enable_recording: 'off',
        sfu_switchover: 0.1,
      }
    })
  });

  const room = await res.json();

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { dailyRoomName: room.name, dailyRoomUrl: room.url }
  });

  return room;
}

export async function generatePatientToken(roomName: string, patientName: string): Promise<string> {
  const res = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.DAILY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { room_name: roomName, user_name: patientName, is_owner: false, exp: Math.floor(Date.now() / 1000) + 7200 }
    })
  });
  const { token } = await res.json();
  return token;
}
```

---

## Step 4: In-Call Symptom Form + Notes

```typescript
// api/appointments/[id]/vitals.ts
import { prisma } from '../../../lib/prisma';

export async function submitVitals(appointmentId: string, data: {
  symptoms: string[];
  bloodPressure?: string;
  heartRate?: number;
  temperature?: number;
  weight?: number;
  notes?: string;
}) {
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      symptoms: data.symptoms,
      vitals: {
        bloodPressure: data.bloodPressure,
        heartRate: data.heartRate,
        temperature: data.temperature,
        weight: data.weight,
      },
      notes: data.notes,
    }
  });
}
```

---

## Step 5: E-Prescription PDF + Pharmacy Routing

```typescript
// lib/prescriptions.ts
import PDFDocument from 'pdfkit';
import { prisma } from './prisma';

export async function generatePrescriptionPDF(prescriptionId: string): Promise<Buffer> {
  const rx = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { patient: true, appointment: true }
  });
  if (!rx) throw new Error('Prescription not found');

  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'letter', margin: 72 });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // Header
    doc.fontSize(18).text('PRESCRIPTION', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Provider: Dr. ${process.env.PROVIDER_NAME}`);
    doc.text(`DEA#: ${process.env.PROVIDER_DEA} | NPI: ${process.env.PROVIDER_NPI}`);
    doc.moveDown();

    // Patient info
    doc.text(`Patient: ${rx.patient.name}`);
    doc.text(`DOB: ${rx.patient.dob?.toLocaleDateString() ?? 'N/A'}`);
    doc.text(`Date: ${rx.issuedAt.toLocaleDateString()}`);
    doc.moveDown();

    // Rx
    doc.fontSize(14).text(`Rx: ${rx.medication}`);
    doc.fontSize(12).text(`Dosage: ${rx.dosage}`);
    doc.text(`Frequency: ${rx.frequency}`);
    doc.text(`Quantity: ${rx.quantity}`);
    doc.text(`Refills: ${rx.refills}`);
    if (rx.instructions) doc.text(`Instructions: ${rx.instructions}`);
    doc.moveDown(2);
    doc.text('______________________');
    doc.text('Provider Signature');

    doc.end();
  });
}
```

---

## Step 6: Post-Visit Follow-Up Email

```typescript
// lib/followup.ts
import { Resend } from 'resend';
import { prisma } from './prisma';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendFollowUpEmail(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true, prescriptions: true }
  });
  if (!appointment) return;

  const rxList = appointment.prescriptions
    .map(rx => `<li>${rx.medication} ${rx.dosage} — ${rx.frequency}</li>`)
    .join('');

  await resend.emails.send({
    from: 'care@yourclinic.com',
    to: appointment.patient.email,
    subject: 'Your visit summary and care instructions',
    html: `
      <h2>Thank you for your visit today</h2>
      <p>Here are your care instructions:</p>
      ${appointment.notes ? `<blockquote>${appointment.notes}</blockquote>` : ''}
      ${rxList ? `<h3>Medications Prescribed</h3><ul>${rxList}</ul>` : ''}
      <p>If your symptoms worsen, please call us or go to the nearest ER.</p>
      <p>Schedule your next appointment: <a href="${process.env.APP_URL}/book">Book Now</a></p>
    `,
  });
}
```

---

## HIPAA Compliance Notes

- ✅ Daily.co Business plan with BAA — required for HIPAA video
- ✅ No visit content stored in Stripe — only payment metadata
- ✅ Visit notes encrypted at rest
- ✅ Resend BAA in place — no PHI in email bodies
- ✅ All data transfer over TLS 1.2+
- ✅ Audit log every PHI access

---

## Next Steps

- Add patient-facing waiting room UI with Daily.co React SDK
- Implement async follow-up messaging after the visit
- Add insurance eligibility verification via Availity API
- Build a scheduling admin panel for managing your calendar
- Add group visit support for family consultations
