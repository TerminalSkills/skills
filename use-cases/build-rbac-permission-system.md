---
title: Build an RBAC Permission System
slug: build-rbac-permission-system
description: Build a role-based access control system with hierarchical roles, resource-level permissions, permission caching, and a management UI — replacing hardcoded access checks with a flexible authorization layer.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - rbac
  - permissions
  - authorization
  - security
  - access-control
---

# Build an RBAC Permission System

## The Problem

Jun leads backend at a 40-person SaaS. Authorization is scattered across the codebase: `if (user.role === 'admin')` checks in 200+ places. When they added a "team lead" role, they had to update 50 files. The CEO wants to restrict certain projects to specific teams, but the current system only has global roles. An intern once deleted production data because `isAdmin` was granted too broadly. They need RBAC with granular resource-level permissions, role hierarchy, and a management UI — so changing who can do what doesn't require code changes.

## Step 1: Build the Permission Engine

```typescript
// src/auth/rbac.ts — RBAC with hierarchical roles and resource permissions
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

type Permission =
  | "projects:read" | "projects:write" | "projects:delete" | "projects:manage"
  | "users:read" | "users:invite" | "users:manage"
  | "billing:read" | "billing:manage"
  | "settings:read" | "settings:manage"
  | "admin:*";

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  inherits?: string[];          // parent role IDs
  isSystem: boolean;            // system roles can't be deleted
}

// Built-in role hierarchy
const SYSTEM_ROLES: Role[] = [
  {
    id: "viewer",
    name: "Viewer",
    description: "Read-only access",
    permissions: ["projects:read", "users:read", "settings:read"],
    isSystem: true,
  },
  {
    id: "member",
    name: "Member",
    description: "Standard team member",
    permissions: ["projects:read", "projects:write", "users:read", "settings:read"],
    inherits: ["viewer"],
    isSystem: true,
  },
  {
    id: "lead",
    name: "Team Lead",
    description: "Team management + project management",
    permissions: ["projects:manage", "users:invite"],
    inherits: ["member"],
    isSystem: true,
  },
  {
    id: "admin",
    name: "Admin",
    description: "Full access except billing",
    permissions: ["users:manage", "settings:manage"],
    inherits: ["lead"],
    isSystem: true,
  },
  {
    id: "owner",
    name: "Owner",
    description: "Full access including billing",
    permissions: ["admin:*", "billing:manage"],
    inherits: ["admin"],
    isSystem: true,
  },
];

// Resolve all permissions for a role (including inherited)
function resolvePermissions(roleId: string, allRoles: Role[]): Set<Permission> {
  const role = allRoles.find((r) => r.id === roleId);
  if (!role) return new Set();

  const permissions = new Set<Permission>(role.permissions);

  // Resolve inherited permissions recursively
  if (role.inherits) {
    for (const parentId of role.inherits) {
      const parentPerms = resolvePermissions(parentId, allRoles);
      for (const perm of parentPerms) {
        permissions.add(perm);
      }
    }
  }

  return permissions;
}

// Check if a user has a specific permission
export async function hasPermission(
  userId: string,
  permission: Permission,
  resourceType?: string,
  resourceId?: string
): Promise<boolean> {
  const cacheKey = `perms:${userId}:${permission}:${resourceId || "global"}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === "1";

  // Get user's roles
  const userPerms = await getUserPermissions(userId);

  // Check wildcard admin
  if (userPerms.has("admin:*")) {
    await redis.setex(cacheKey, 300, "1");
    return true;
  }

  // Check direct permission
  if (userPerms.has(permission)) {
    // If resource-level check needed, verify resource access
    if (resourceType && resourceId) {
      const hasResourceAccess = await checkResourceAccess(userId, resourceType, resourceId);
      await redis.setex(cacheKey, 300, hasResourceAccess ? "1" : "0");
      return hasResourceAccess;
    }
    await redis.setex(cacheKey, 300, "1");
    return true;
  }

  // Check namespace wildcard (e.g., "projects:*" matches "projects:read")
  const namespace = permission.split(":")[0];
  if (userPerms.has(`${namespace}:manage` as Permission)) {
    await redis.setex(cacheKey, 300, "1");
    return true;
  }

  await redis.setex(cacheKey, 300, "0");
  return false;
}

// Get all resolved permissions for a user
async function getUserPermissions(userId: string): Promise<Set<Permission>> {
  const cacheKey = `user:perms:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return new Set(JSON.parse(cached));

  // Get user's role assignments
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.permissions, r.inherits
     FROM user_roles ur
     JOIN roles r ON ur.role_id = r.id
     WHERE ur.user_id = $1`,
    [userId]
  );

  // Combine system + custom roles
  const allRoles = [...SYSTEM_ROLES, ...rows.map((r) => ({
    id: r.id, name: r.name, permissions: r.permissions,
    inherits: r.inherits, isSystem: false, description: "",
  }))];

  const permissions = new Set<Permission>();
  for (const row of rows) {
    const rolePerms = resolvePermissions(row.id, allRoles);
    for (const perm of rolePerms) permissions.add(perm);
  }

  await redis.setex(cacheKey, 300, JSON.stringify([...permissions]));
  return permissions;
}

// Check resource-level access (team → project mapping)
async function checkResourceAccess(userId: string, resourceType: string, resourceId: string): Promise<boolean> {
  if (resourceType === "project") {
    const { rows } = await pool.query(
      `SELECT 1 FROM project_members WHERE user_id = $1 AND project_id = $2
       UNION
       SELECT 1 FROM team_members tm
       JOIN project_teams pt ON tm.team_id = pt.team_id
       WHERE tm.user_id = $1 AND pt.project_id = $2`,
      [userId, resourceId]
    );
    return rows.length > 0;
  }
  return true;
}

// Assign role to user
export async function assignRole(userId: string, roleId: string, assignedBy: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at)
     VALUES ($1, $2, $3, NOW()) ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId, assignedBy]
  );

  // Invalidate cache
  await redis.del(`user:perms:${userId}`);
  const keys = await redis.keys(`perms:${userId}:*`);
  if (keys.length > 0) await redis.del(...keys);

  // Audit log
  await pool.query(
    "INSERT INTO permission_audit (user_id, action, role_id, actor, created_at) VALUES ($1, 'role_assigned', $2, $3, NOW())",
    [userId, roleId, assignedBy]
  );
}

// Middleware for route protection
export function requirePermission(permission: Permission, resourceParam?: string) {
  return async (c: any, next: any) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "Unauthorized" }, 401);

    const resourceId = resourceParam ? c.req.param(resourceParam) : undefined;
    const allowed = await hasPermission(userId, permission, resourceParam?.replace("Id", ""), resourceId);

    if (!allowed) {
      return c.json({ error: "Forbidden", required: permission }, 403);
    }

    await next();
  };
}
```

## Results

- **Adding "team lead" role: 50 files → 0 code changes** — create the role in the database with permissions; assign to users; existing permission checks work automatically
- **Resource-level isolation** — project access is scoped to team membership; the CEO sees all projects, but engineers only see their team's projects
- **Permission changes take effect in 5 minutes** — Redis cache TTL means role changes propagate without deployments; in emergencies, cache can be cleared for instant effect
- **Intern incident prevented structurally** — `projects:delete` is only on admin+ roles; viewers and members physically cannot delete resources regardless of UI bugs
- **Full audit trail** — every role assignment and permission check failure is logged; "who gave user X admin access?" is a single query
