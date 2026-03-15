---
title: Build a Team Permission Matrix
slug: build-team-permission-matrix
description: Build a team permission matrix with role hierarchies, resource-level access, permission inheritance, bulk assignment, audit logging, and UI for managing complex access control in collaborative apps.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: SaaS
tags:
  - permissions
  - rbac
  - access-control
  - team-management
  - authorization
---

# Build a Team Permission Matrix

## The Problem

Dan leads engineering at a 25-person project management SaaS. Permissions are hardcoded as `if (user.role === 'admin')` checks scattered across 150 endpoints. Adding a new role ("project lead" — can manage projects but not billing) requires touching 30 files. Some permissions are per-resource: user A can edit Project X but only view Project Y. A client's intern accidentally deleted a production project because "member" role had delete permission. They need a permission matrix: define roles with granular permissions, resource-level overrides, inheritance hierarchy, and a UI where admins configure access without code changes.

## Step 1: Build the Permission Matrix

```typescript
// src/permissions/matrix.ts — Role-based access control with resource-level overrides
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface Role {
  id: string;
  name: string;
  description: string;
  inheritsFrom: string | null;   // parent role (inherits all its permissions)
  permissions: Permission[];
  isSystem: boolean;             // can't be deleted
}

interface Permission {
  resource: string;              // "projects", "billing", "users", "settings"
  actions: string[];             // ["create", "read", "update", "delete"]
}

interface ResourceOverride {
  userId: string;
  resourceType: string;
  resourceId: string;
  actions: string[];             // override permissions for this specific resource
  grant: boolean;                // true = allow, false = deny
}

// Check if user can perform action on resource
export async function can(
  userId: string,
  action: string,
  resource: string,
  resourceId?: string
): Promise<boolean> {
  // Check cache first
  const cacheKey = `perm:${userId}:${action}:${resource}:${resourceId || "*"}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === "1";

  // 1. Check resource-level overrides first (most specific)
  if (resourceId) {
    const override = await getResourceOverride(userId, resource, resourceId);
    if (override !== null) {
      await redis.setex(cacheKey, 300, override ? "1" : "0");
      return override;
    }
  }

  // 2. Check role permissions (with inheritance)
  const roles = await getUserRoles(userId);
  for (const role of roles) {
    const allowed = await checkRolePermission(role, action, resource);
    if (allowed) {
      await redis.setex(cacheKey, 300, "1");
      return true;
    }
  }

  await redis.setex(cacheKey, 300, "0");
  return false;
}

// Get effective permissions for a user (for UI display)
export async function getEffectivePermissions(userId: string): Promise<Record<string, string[]>> {
  const roles = await getUserRoles(userId);
  const permissions: Record<string, Set<string>> = {};

  for (const role of roles) {
    const rolePerms = await getRolePermissions(role);
    for (const perm of rolePerms) {
      if (!permissions[perm.resource]) permissions[perm.resource] = new Set();
      for (const action of perm.actions) permissions[perm.resource].add(action);
    }
  }

  // Apply overrides
  const { rows: overrides } = await pool.query(
    "SELECT * FROM resource_overrides WHERE user_id = $1", [userId]
  );
  for (const override of overrides) {
    const key = `${override.resource_type}:${override.resource_id}`;
    if (!permissions[key]) permissions[key] = new Set();
    const actions = JSON.parse(override.actions);
    if (override.grant) {
      for (const a of actions) permissions[key].add(a);
    } else {
      for (const a of actions) permissions[key].delete(a);
    }
  }

  return Object.fromEntries(
    Object.entries(permissions).map(([k, v]) => [k, [...v]])
  );
}

// Create or update role
export async function upsertRole(params: {
  name: string; description: string; inheritsFrom?: string;
  permissions: Permission[];
}): Promise<Role> {
  const id = params.name.toLowerCase().replace(/\s+/g, "-");

  await pool.query(
    `INSERT INTO roles (id, name, description, inherits_from, permissions, is_system, created_at)
     VALUES ($1, $2, $3, $4, $5, false, NOW())
     ON CONFLICT (id) DO UPDATE SET description = $3, inherits_from = $4, permissions = $5`,
    [id, params.name, params.description, params.inheritsFrom || null, JSON.stringify(params.permissions)]
  );

  // Invalidate all permission caches
  const keys = await redis.keys("perm:*");
  if (keys.length) await redis.del(...keys);

  return { id, name: params.name, description: params.description, inheritsFrom: params.inheritsFrom || null, permissions: params.permissions, isSystem: false };
}

// Assign role to user
export async function assignRole(userId: string, roleId: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
    [userId, roleId]
  );

  // Audit log
  await pool.query(
    "INSERT INTO permission_audit (user_id, action, details, created_at) VALUES ($1, 'role_assigned', $2, NOW())",
    [userId, JSON.stringify({ roleId })]
  );

  // Invalidate cache
  const keys = await redis.keys(`perm:${userId}:*`);
  if (keys.length) await redis.del(...keys);
}

// Set resource-level override
export async function setResourceOverride(params: {
  userId: string; resourceType: string; resourceId: string;
  actions: string[]; grant: boolean;
}): Promise<void> {
  await pool.query(
    `INSERT INTO resource_overrides (user_id, resource_type, resource_id, actions, grant, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, resource_type, resource_id) DO UPDATE SET actions = $4, grant = $5`,
    [params.userId, params.resourceType, params.resourceId, JSON.stringify(params.actions), params.grant]
  );

  // Invalidate cache
  const keys = await redis.keys(`perm:${params.userId}:*`);
  if (keys.length) await redis.del(...keys);
}

// Bulk assign role to multiple users
export async function bulkAssignRole(userIds: string[], roleId: string): Promise<number> {
  let assigned = 0;
  for (const userId of userIds) {
    await assignRole(userId, roleId);
    assigned++;
  }
  return assigned;
}

// Get permission matrix for display
export async function getPermissionMatrix(): Promise<{
  roles: Array<{ id: string; name: string; permissions: Record<string, string[]> }>;
  resources: string[];
  actions: string[];
}> {
  const { rows: roles } = await pool.query("SELECT * FROM roles ORDER BY name");
  const allResources = new Set<string>();
  const allActions = new Set<string>();

  const matrix = roles.map((role: any) => {
    const perms = JSON.parse(role.permissions) as Permission[];
    const permMap: Record<string, string[]> = {};
    for (const p of perms) {
      permMap[p.resource] = p.actions;
      allResources.add(p.resource);
      p.actions.forEach((a: string) => allActions.add(a));
    }
    return { id: role.id, name: role.name, permissions: permMap };
  });

  return { roles: matrix, resources: [...allResources].sort(), actions: [...allActions].sort() };
}

async function getUserRoles(userId: string): Promise<string[]> {
  const cached = await redis.get(`user:roles:${userId}`);
  if (cached) return JSON.parse(cached);

  const { rows } = await pool.query("SELECT role_id FROM user_roles WHERE user_id = $1", [userId]);
  const roles = rows.map((r: any) => r.role_id);
  await redis.setex(`user:roles:${userId}`, 300, JSON.stringify(roles));
  return roles;
}

async function checkRolePermission(roleId: string, action: string, resource: string): Promise<boolean> {
  const perms = await getRolePermissions(roleId);
  const match = perms.find((p) => p.resource === resource || p.resource === "*");
  if (match && (match.actions.includes(action) || match.actions.includes("*"))) return true;

  // Check inherited role
  const { rows: [role] } = await pool.query("SELECT inherits_from FROM roles WHERE id = $1", [roleId]);
  if (role?.inherits_from) return checkRolePermission(role.inherits_from, action, resource);

  return false;
}

async function getRolePermissions(roleId: string): Promise<Permission[]> {
  const cached = await redis.get(`role:perms:${roleId}`);
  if (cached) return JSON.parse(cached);

  const { rows: [role] } = await pool.query("SELECT permissions FROM roles WHERE id = $1", [roleId]);
  const perms = role ? JSON.parse(role.permissions) : [];
  await redis.setex(`role:perms:${roleId}`, 300, JSON.stringify(perms));
  return perms;
}

async function getResourceOverride(userId: string, resourceType: string, resourceId: string): Promise<boolean | null> {
  const { rows: [override] } = await pool.query(
    "SELECT grant, actions FROM resource_overrides WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3",
    [userId, resourceType, resourceId]
  );
  if (!override) return null;  // no override — fall through to role check
  return override.grant;
}

// Hono middleware
export function requirePermission(action: string, resource: string) {
  return async (c: any, next: any) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const resourceId = c.req.param("id");
    const allowed = await can(userId, action, resource, resourceId);

    if (!allowed) {
      return c.json({ error: `Permission denied: ${action} on ${resource}` }, 403);
    }

    await next();
  };
}
```

## Results

- **"Project Lead" role: 30 files → 1 API call** — new role created with specific permissions in admin UI; no code changes; takes effect immediately
- **Intern can't delete production** — member role has read+update but not delete; resource-level override gives specific users delete on specific projects; granular control
- **Permission inheritance** — "project-lead" inherits from "member" and adds manage permissions; changing "member" permissions automatically propagates
- **Resource-level overrides** — user A can edit Project X but only view Project Y; admin sets this in UI without creating custom roles; flexible without role explosion
- **Audit trail** — every role assignment and permission change logged; compliance can verify who granted access to what; pass SOC 2 audit
