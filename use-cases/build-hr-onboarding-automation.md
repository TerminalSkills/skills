---
title: Automate Employee Onboarding
slug: build-hr-onboarding-automation
description: Automate the entire employee onboarding process — task checklists, document collection, IT account provisioning, and 30/60/90-day check-in emails — so HR can onboard 5 people a week without manual work.
skills:
  - resend
  - prisma
category: hr
tags:
  - hr
  - onboarding
  - automation
  - email
  - documents
  - productivity
---

# Automate Employee Onboarding

Priya is an HR manager at a 120-person company growing fast. She's onboarding 5 new hires every week. Each one requires: sending the offer letter, collecting I-9 and direct deposit forms, creating accounts in Google Workspace, Slack, and GitHub, emailing IT about laptop setup, scheduling a 30/60/90-day check-in, and making sure nothing falls through the cracks. She does all of this manually, from a checklist in Notion. Last month, a new engineer started without GitHub access for 3 days. Priya wants a system that runs the process automatically.

## Step 1 — Schema: Hires, Tasks, Documents

```typescript
// prisma/schema.prisma — Employee onboarding data model.

model Employee {
  id          String     @id @default(cuid())
  name        String
  email       String     @unique
  personalEmail String?  // For pre-start communications
  role        String
  department  String
  managerId   String?
  startDate   DateTime
  status      OnboardingStatus @default(NOT_STARTED)

  tasks       OnboardingTask[]
  documents   Document[]

  createdAt   DateTime   @default(now())
}

model OnboardingTask {
  id          String     @id @default(cuid())
  title       String
  description String?
  category    TaskCategory
  dueDate     DateTime?
  completedAt DateTime?
  ownerId     String     // HR, IT, Manager, or Employee
  ownerRole   String     // "hr" | "it" | "manager" | "employee"
  required    Boolean    @default(true)

  employeeId  String
  employee    Employee   @relation(fields: [employeeId], references: [id])

  createdAt   DateTime   @default(now())
}

model Document {
  id           String       @id @default(cuid())
  type         DocumentType
  status       DocStatus    @default(PENDING)
  fileUrl      String?
  signedAt     DateTime?
  employeeId   String
  employee     Employee     @relation(fields: [employeeId], references: [id])
  createdAt    DateTime     @default(now())
}

enum OnboardingStatus { NOT_STARTED IN_PROGRESS COMPLETED }
enum TaskCategory     { PAPERWORK IT_SETUP ORIENTATION TRAINING CHECKIN }
enum DocumentType     { OFFER_LETTER I9 DIRECT_DEPOSIT NDA HANDBOOK }
enum DocStatus        { PENDING SUBMITTED SIGNED REJECTED }
```

## Step 2 — Trigger Full Onboarding on New Hire Creation

When HR adds a new employee, the system automatically creates all tasks, sends welcome emails, and queues check-in emails.

```typescript
// src/lib/onboarding.ts — Kick off the full onboarding workflow.
// Called once when HR creates a new employee record.

import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail, scheduleCheckIns } from "@/lib/emails";
import { provisionAccounts } from "@/lib/provisioning";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_TASKS = [
  // Paperwork (employee owns)
  { title: "Complete I-9 form", category: "PAPERWORK", ownerRole: "employee", daysBeforeStart: -2 },
  { title: "Submit direct deposit information", category: "PAPERWORK", ownerRole: "employee", daysBeforeStart: -2 },
  { title: "Sign NDA and handbook", category: "PAPERWORK", ownerRole: "employee", daysBeforeStart: -1 },

  // IT setup (IT team owns)
  { title: "Set up laptop and ship to employee", category: "IT_SETUP", ownerRole: "it", daysBeforeStart: -5 },
  { title: "Create Google Workspace account", category: "IT_SETUP", ownerRole: "it", daysBeforeStart: -3 },
  { title: "Add to Slack workspace", category: "IT_SETUP", ownerRole: "it", daysBeforeStart: -3 },
  { title: "Create GitHub account and add to org", category: "IT_SETUP", ownerRole: "it", daysBeforeStart: -3 },

  // Orientation (HR owns)
  { title: "Send welcome email with first-day instructions", category: "ORIENTATION", ownerRole: "hr", daysBeforeStart: -1 },
  { title: "Schedule first-day introduction meeting", category: "ORIENTATION", ownerRole: "hr", daysBeforeStart: 0 },

  // Check-ins (manager owns)
  { title: "30-day check-in", category: "CHECKIN", ownerRole: "manager", daysAfterStart: 30 },
  { title: "60-day check-in", category: "CHECKIN", ownerRole: "manager", daysAfterStart: 60 },
  { title: "90-day check-in and performance review", category: "CHECKIN", ownerRole: "manager", daysAfterStart: 90 },
];

export async function startOnboarding(employeeId: string) {
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: employeeId },
  });

  const startMs = employee.startDate.getTime();

  // Create all tasks with computed due dates
  await prisma.onboardingTask.createMany({
    data: DEFAULT_TASKS.map((t) => {
      const days = (t as any).daysBeforeStart ?? -(t as any).daysAfterStart * -1;
      const daysOffset = (t as any).daysAfterStart ?? -(t as any).daysBeforeStart;
      const dueDate = new Date(
        (t as any).daysAfterStart !== undefined
          ? startMs + (t as any).daysAfterStart * 86400000
          : startMs + (t as any).daysBeforeStart * 86400000
      );
      return {
        title: t.title,
        category: t.category as any,
        ownerRole: t.ownerRole,
        ownerId: t.ownerRole === "employee" ? employee.id : "system",
        dueDate,
        employeeId,
      };
    }),
  });

  // Create document requests
  await prisma.document.createMany({
    data: [
      { type: "OFFER_LETTER", employeeId, status: "SIGNED" },  // Already signed at hire
      { type: "I9", employeeId },
      { type: "DIRECT_DEPOSIT", employeeId },
      { type: "NDA", employeeId },
    ],
  });

  // Send welcome email to personal email (work email not active yet)
  await sendWelcomeEmail(employee);

  // Provision accounts automatically
  await provisionAccounts(employee);

  // Schedule 30/60/90 check-in reminder emails
  await scheduleCheckIns(employee);

  await prisma.employee.update({
    where: { id: employeeId },
    data: { status: "IN_PROGRESS" },
  });
}
```

## Step 3 — IT Provisioning via API

When onboarding starts, automatically create the employee's accounts in Google Workspace, Slack, and GitHub.

```typescript
// src/lib/provisioning.ts — Create accounts in Google Workspace, Slack, GitHub.
// Runs automatically during onboarding kickoff.

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
}

export async function provisionAccounts(employee: Employee) {
  await Promise.allSettled([
    createGoogleWorkspaceAccount(employee),
    createSlackAccount(employee),
    addToGitHubOrg(employee),
  ]);
}

async function createGoogleWorkspaceAccount(employee: Employee) {
  const [firstName, ...rest] = employee.name.split(" ");
  const lastName = rest.join(" ");

  await fetch("https://admin.googleapis.com/admin/directory/v1/users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GOOGLE_ADMIN_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      primaryEmail: employee.email,
      name: { givenName: firstName, familyName: lastName },
      password: generateTempPassword(),
      changePasswordAtNextLogin: true,
      orgUnitPath: `/departments/${employee.department}`,
    }),
  });
}

async function createSlackAccount(employee: Employee) {
  // Slack doesn't allow creating accounts directly — send invite instead
  await fetch("https://slack.com/api/users.admin.invite", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLACK_ADMIN_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: employee.email,
      real_name: employee.name,
      resend: true,
    }),
  });
}

async function addToGitHubOrg(employee: Employee) {
  const username = employee.email.split("@")[0]; // Assume GitHub username matches email prefix
  await fetch(
    `https://api.github.com/orgs/${process.env.GITHUB_ORG}/invitations`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${process.env.GITHUB_ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: employee.email, role: "direct_member" }),
    }
  );
}

function generateTempPassword() {
  return Math.random().toString(36).slice(-10) + "A1!";
}
```

## Step 4 — 30/60/90 Check-In Emails with Resend

Automated check-in emails sent to the new hire and their manager on day 30, 60, and 90 with reflection prompts.

```typescript
// src/lib/emails.ts — Welcome and check-in email sequences.

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface Employee {
  name: string;
  email: string;
  personalEmail?: string;
  role: string;
  startDate: Date;
  managerId?: string;
}

export async function sendWelcomeEmail(employee: Employee) {
  const startDateStr = employee.startDate.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  await resend.emails.send({
    from: "HR <hr@yourcompany.com>",
    to: employee.personalEmail || employee.email,
    subject: `Welcome to the team, ${employee.name.split(" ")[0]}! 🎉`,
    html: `
      <h2>We're excited to have you start on ${startDateStr}!</h2>
      <p>Here's what you need to do before your first day:</p>
      <ol>
        <li>Complete your I-9 form (link below)</li>
        <li>Submit direct deposit details</li>
        <li>Sign the NDA and employee handbook</li>
      </ol>
      <p>Your laptop will be shipped 3 days before your start date. Your accounts will be ready on day one.</p>
      <p>See you ${startDateStr}!</p>
      <p>— The HR Team</p>
    `,
  });
}

export async function scheduleCheckIns(employee: Employee) {
  const checkIns = [
    { day: 30, subject: "30-Day Check-In" },
    { day: 60, subject: "60-Day Check-In" },
    { day: 90, subject: "90-Day Review" },
  ];

  // In production, use a job queue (BullMQ, Inngest, etc.) for scheduling.
  // Here we use Resend's scheduled send (available in Resend).
  for (const { day, subject } of checkIns) {
    const sendAt = new Date(employee.startDate.getTime() + day * 86400000);

    await resend.emails.send({
      from: "HR <hr@yourcompany.com>",
      to: employee.email,
      subject: `${subject} — How's it going, ${employee.name.split(" ")[0]}?`,
      scheduledAt: sendAt.toISOString(),
      html: `
        <h2>${subject}</h2>
        <p>You've been with us for ${day} days! We'd love to hear how things are going.</p>
        <h3>A few reflection questions:</h3>
        <ul>
          <li>What's going well so far?</li>
          <li>What's been challenging or unclear?</li>
          <li>Do you have the tools and access you need?</li>
          <li>Is there anything HR or your manager can do better?</li>
        </ul>
        <p>Reply to this email or <a href="${process.env.NEXT_PUBLIC_APP_URL}/checkin/${employee.id}/${day}">fill out a quick form</a>.</p>
      `,
    });
  }
}
```

## Results

Priya automated onboarding for 87 employees over 4 months:

- **Manual work per hire: 3 hours → 20 minutes** — Priya fills in the new hire form, the system does the rest.
- **Zero missed IT setup** — GitHub/Slack/Google accounts are provisioned automatically. The 3-day wait for GitHub access was the trigger for building this.
- **30/60/90 emails: 100% sent on time** — previously 40% were sent late or forgotten.
- **Document completion rate: 95% within 48 hours** — automated reminders keep new hires moving through the checklist.
- **HR dashboard**: Priya sees every active onboarding with a red/yellow/green status based on task completion. Outstanding items are one glance away.
- **Build time: ~14 hours** — schema, task engine, provisioning integrations, email sequences, HR dashboard.
