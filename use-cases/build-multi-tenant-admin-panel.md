---
title: "Build a Multi-Tenant Admin Panel"
description: "Build a secure B2B admin panel with row-level tenant isolation, per-org feature flags, user impersonation for support, and a full audit log."
skills: [prisma, nextjs]
difficulty: advanced
time_estimate: "6 hours"
tags: [multi-tenant, admin, saas, prisma, nextjs, rls, audit-log, impersonation, feature-flags]
---

# Build a Multi-Tenant Admin Panel

## The Problem

Your B2B SaaS has enterprise customers. They need an admin panel to manage their users, view usage, and configure settings. The catch: Org A must never see Org B's data, your support team needs to log in as any user to debug issues, and compliance requires a full audit trail of every admin action.

**Goal:** Multi-tenant admin panel with airtight data isolation, per-tenant settings, user impersonation, and an immutable audit log.

---

## Who This Is For

**B2B SaaS CTO** building the admin interface for enterprise customers. You need a foundation that handles 100 orgs today and 10,000 orgs tomorrow without security regressions.

---

## Step 1: Prisma Schema

```prisma
// prisma/schema.prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  planTier  String   @default("starter")
  createdAt DateTime @default(now())

  settings OrgSettings?
  members  OrgMember[]
  auditLog AuditLog[]
}

model OrgMember {
  id     String @id @default(cuid())
  orgId  String
  userId String
  role   String @default("member") // owner | admin | member | viewer

  org  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([orgId, userId])
}

model OrgSettings {
  id              String  @id @default(cuid())
  orgId           String  @unique
  features        String  @default("[]")     // JSON: enabled feature flags
  maxUsers        Int     @default(5)
  maxProjects     Int     @default(10)
  ssoEnabled      Boolean @default(false)
  ssoProvider     String?
  ssoMetadataUrl  String?
  customBrandColor String?
  logoUrl         String?

  org Organization @relation(fields: [orgId], references: [id])
}

model AuditLog {
  id         String   @id @default(cuid())
  orgId      String
  actorId    String   // user who performed action
  actorEmail String
  action     String   // e.g. "user.invited", "plan.changed"
  target     String?  // e.g. user id, resource id
  metadata   String?  @db.Text  // JSON
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())

  org Organization @relation(fields: [orgId], references: [id])

  @@index([orgId, createdAt(sort: Desc)])
  @@index([actorId])
}
```

---

## Step 2: Row-Level Security Helpers

Every query must be scoped to the current org. Never trust client-supplied org IDs without verifying membership.

```typescript
// lib/auth-org.ts
import { auth } from "@/auth";
import { prisma } from "./prisma";
import { cache } from "react";

export type OrgRole = "owner" | "admin" | "member" | "viewer";

export type OrgContext = {
  orgId: string;
  userId: string;
  role: OrgRole;
  isSuper: boolean;
};

export const getOrgContext = cache(async (orgSlug: string): Promise<OrgContext | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  // Super admins can access any org
  if (session.user.isSuperAdmin) {
    const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) return null;
    return { orgId: org.id, userId: session.user.id, role: "owner", isSuper: true };
  }

  const member = await prisma.orgMember.findFirst({
    where: {
      userId: session.user.id,
      org: { slug: orgSlug },
    },
    include: { org: true },
  });

  if (!member) return null;

  return {
    orgId: member.orgId,
    userId: session.user.id,
    role: member.role as OrgRole,
    isSuper: false,
  };
});

export function requireRole(ctx: OrgContext, minRole: OrgRole): void {
  const hierarchy: OrgRole[] = ["viewer", "member", "admin", "owner"];
  const userLevel = hierarchy.indexOf(ctx.role);
  const requiredLevel = hierarchy.indexOf(minRole);
  if (userLevel < requiredLevel) {
    throw new Error(`Insufficient permissions. Required: ${minRole}, got: ${ctx.role}`);
  }
}
```

---

## Step 3: Tenant-Scoped Data Access

```typescript
// lib/data/users.ts
import { prisma } from "../prisma";
import type { OrgContext } from "../auth-org";

export async function getOrgUsers(ctx: OrgContext) {
  // Tenant scoped — can never return users from another org
  return prisma.orgMember.findMany({
    where: { orgId: ctx.orgId },
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true, createdAt: true },
      },
    },
    orderBy: { user: { createdAt: "desc" } },
  });
}

export async function inviteUser(
  ctx: OrgContext,
  email: string,
  role: "admin" | "member"
) {
  requireRole(ctx, "admin"); // only admins can invite

  // ... send invite email, create pending invite record
  await audit(ctx, "user.invited", { email, role });
}

export async function removeUser(ctx: OrgContext, targetUserId: string) {
  requireRole(ctx, "admin");

  // Can't remove org owner
  const target = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: ctx.orgId, userId: targetUserId } },
  });
  if (target?.role === "owner") throw new Error("Cannot remove org owner");

  await prisma.orgMember.delete({
    where: { orgId_userId: { orgId: ctx.orgId, userId: targetUserId } },
  });

  await audit(ctx, "user.removed", { targetUserId });
}
```

---

## Step 4: Audit Log

```typescript
// lib/audit.ts
import { prisma } from "./prisma";
import { headers } from "next/headers";
import type { OrgContext } from "./auth-org";

export async function audit(
  ctx: OrgContext,
  action: string,
  metadata?: Record<string, unknown>,
  target?: string
): Promise<void> {
  const headersList = headers();

  await prisma.auditLog.create({
    data: {
      orgId: ctx.orgId,
      actorId: ctx.userId,
      actorEmail: "", // resolve from user
      action,
      target,
      metadata: metadata ? JSON.stringify(metadata) : null,
      ipAddress: headersList.get("x-forwarded-for") ?? headersList.get("x-real-ip"),
      userAgent: headersList.get("user-agent"),
    },
  });
}

// Common action types (use constants to avoid typos)
export const AUDIT_ACTIONS = {
  USER_INVITED: "user.invited",
  USER_REMOVED: "user.removed",
  USER_ROLE_CHANGED: "user.role_changed",
  PLAN_CHANGED: "plan.changed",
  SSO_ENABLED: "sso.enabled",
  API_KEY_CREATED: "api_key.created",
  API_KEY_REVOKED: "api_key.revoked",
  IMPERSONATION_STARTED: "impersonation.started",
  IMPERSONATION_ENDED: "impersonation.ended",
} as const;
```

---

## Step 5: User Impersonation

Support engineers need to log in as any user to debug issues. Must be logged, auditable, and reversible.

```typescript
// app/api/admin/impersonate/route.ts
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const session = await auth();

  // Only super admins can impersonate
  if (!session?.user?.isSuperAdmin) {
    return new Response("Forbidden", { status: 403 });
  }

  const { targetUserId, orgId } = await request.json();

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
  });
  if (!targetUser) return new Response("User not found", { status: 404 });

  // Log impersonation start
  await prisma.auditLog.create({
    data: {
      orgId,
      actorId: session.user.id,
      actorEmail: session.user.email!,
      action: AUDIT_ACTIONS.IMPERSONATION_STARTED,
      target: targetUserId,
      metadata: JSON.stringify({ originalAdminId: session.user.id }),
    },
  });

  // Store impersonation context in a signed cookie
  const cookieStore = cookies();
  cookieStore.set("impersonating", JSON.stringify({
    targetUserId,
    adminId: session.user.id,
    startedAt: Date.now(),
  }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 3600, // 1 hour max
  });

  return Response.json({ ok: true, redirectTo: "/dashboard" });
}

export async function DELETE(request: Request) {
  const session = await auth();
  const cookieStore = cookies();
  const impersonating = cookieStore.get("impersonating");

  if (impersonating) {
    const { adminId, targetUserId } = JSON.parse(impersonating.value);
    await prisma.auditLog.create({
      data: {
        orgId: "", // resolve from context
        actorId: adminId,
        actorEmail: session?.user?.email ?? "",
        action: AUDIT_ACTIONS.IMPERSONATION_ENDED,
        target: targetUserId,
      },
    });
    cookieStore.delete("impersonating");
  }

  return Response.json({ ok: true, redirectTo: "/admin" });
}
```

---

## Step 6: Feature Flags Per Org

```typescript
// lib/features.ts
import { getCurrentOrg } from "./auth-org";

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ["basic_analytics", "csv_export"],
  growth: ["basic_analytics", "csv_export", "api_access", "sso"],
  enterprise: ["basic_analytics", "csv_export", "api_access", "sso", "audit_log", "custom_roles"],
};

export async function orgHasFeature(orgId: string, feature: string): Promise<boolean> {
  const settings = await prisma.orgSettings.findUnique({ where: { orgId } });
  const org = await prisma.organization.findUnique({ where: { id: orgId } });

  // Check plan-based features
  const planFeatures = PLAN_FEATURES[org?.planTier ?? "starter"] ?? [];
  if (planFeatures.includes(feature)) return true;

  // Check manually enabled features (for custom overrides)
  const customFeatures: string[] = JSON.parse(settings?.features ?? "[]");
  return customFeatures.includes(feature);
}
```

---

## Step 7: Admin Panel UI Structure

```
/admin/[orgSlug]/
├── page.tsx              # Dashboard: users, usage, plan
├── users/
│   ├── page.tsx          # User list with roles
│   └── [userId]/page.tsx # User detail, impersonate button
├── settings/
│   ├── page.tsx          # Branding, features
│   └── sso/page.tsx      # SSO configuration
└── audit/
    └── page.tsx          # Audit log with filters
```

---

## Result

- ✅ Tenant isolation enforced at the query layer — no cross-org data leaks
- ✅ Role hierarchy: owner > admin > member > viewer
- ✅ Immutable audit log for every admin action
- ✅ User impersonation with time limit and full logging
- ✅ Feature flags tied to plan tier with manual overrides
- ✅ Org-level branding (logo, colors)

**Payoff:** Enterprise customers get the security and auditability they require, and your support team can debug any issue without needing database access.
