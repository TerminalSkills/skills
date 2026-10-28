---
title: "Fix API Documentation Drift with AI"
slug: fix-api-documentation-drift
description: "Detect and fix discrepancies between your API code and its OpenAPI documentation before they break client integrations."
skills: [api-doc-generator, api-tester, code-reviewer, scalar]
category: development
tags: [api, documentation, openapi, drift-detection, developer-experience]
---

# Fix API Documentation Drift with AI

## The Problem

API documentation goes stale the moment a developer merges a route change without updating the spec. A backend engineer adds a required field to an endpoint, another renames a query parameter, and within weeks the OpenAPI spec is a liability rather than a contract. Client teams build against wrong schemas, mobile releases ship with broken API calls, and the on-call engineer spends Friday night debugging a 422 error caused by an undocumented field rename three sprints ago.

The worst part: documentation drift is invisible until it breaks something. Nobody wakes up and thinks "I should diff our route files against the OpenAPI YAML today." The spec says `owner` is a string, but three weeks ago someone expanded it to an object with `id`, `name`, and `email`. The mobile app ships next Tuesday with `JSON.parse(owner)` and crashes for every user. The only reason you find out is because an enterprise client's integration test catches it at 2 AM and files a P1 ticket.

Manual spec maintenance doesn't scale either. With 86 endpoints across 14 controller files, auditing the full API takes a senior engineer 4-6 hours -- and the spec is already drifting again by the time the PR merges.

## The Solution

Point the agent at your codebase and existing OpenAPI spec. It scans route definitions, extracts current schemas from type annotations, diffs them against the published spec, and produces an updated OpenAPI document plus a human-readable changelog. Then it validates every updated endpoint by hitting staging with test requests -- catching cases where even the new spec doesn't match reality.

## Step-by-Step Walkthrough

### Step 1: Scan the Codebase for Documentation Drift

```text
Compare our OpenAPI spec at docs/openapi.yaml against the actual route handlers in src/routes/ and src/controllers/. List every discrepancy — missing endpoints, removed endpoints, and schema changes.
```

The drift report lands in seconds -- 5 discrepancies across 34 endpoints. Each one maps back to a specific file and line number, so you can see exactly when the drift happened:

**Added in code but missing from docs:**
- `POST /api/v2/teams/:teamId/invites` -- `src/controllers/teams.ts:87`
- `GET /api/v2/billing/usage-summary` -- `src/controllers/billing.ts:203`

These endpoints work fine, but no client knows they exist. The team built the invite feature two sprints ago and never told anyone. The billing summary endpoint was added for an internal dashboard -- but three enterprise clients have been asking for exactly this data through support tickets.

**Removed from code but still in docs (stale):**
- `DELETE /api/v2/users/:id/sessions` -- removed in commit `e4a12bf` (Jan 14)

Any client calling this endpoint gets a 404. The docs still show it as available with a full request/response example. A client building a session management feature right now would discover the hard way that the endpoint vanished.

**Schema changes (the dangerous ones):**
- `POST /api/v2/users` -- new required field `workspaceId` (string, added Feb 3)
- `GET /api/v2/projects/:id` -- response field `owner` changed from `string` to `object {id, name, email}`

That `workspaceId` field is the most dangerous discrepancy. Any client sending a `POST /api/v2/users` request without it gets a 422 -- and the docs still say the request should work. Someone added a required field without updating the spec or notifying anyone. This is exactly the kind of change that breaks mobile releases after they've already been submitted to the App Store.

### Step 2: Generate the Updated OpenAPI Spec

```text
Generate an updated openapi.yaml that fixes all 5 discrepancies. Keep the existing descriptions and examples where they're still accurate. Add realistic examples for new fields.
```

A clean OpenAPI 3.0.3 document comes back with properly referenced schemas, updated paths, and example values derived from the type definitions in the codebase. Existing descriptions and examples are preserved where they're still accurate -- only the drifted parts change.

The new endpoints get full documentation. Here's what the generated spec looks like for the invite endpoint:

```yaml
/api/v2/teams/{teamId}/invites:
  post:
    summary: Invite a user to a team
    parameters:
      - name: teamId
        in: path
        required: true
        schema: { type: string, format: uuid }
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [email, role]
            properties:
              email: { type: string, format: email, example: "jane@techcorp.com" }
              role: { type: string, enum: [member, admin], default: member }
          example:
            email: "jane@techcorp.com"
            role: "member"
    responses:
      '201':
        description: Invite created
      '409':
        description: User already a member of this team
```

The `workspaceId` field on the users endpoint gets a description explaining its purpose and a realistic example value. The expanded `owner` object gets its three sub-fields documented with types and nullability.

The spec uses `$ref` references for shared schemas instead of inlining them, so when `User` or `Project` types change in the future, the update only needs to happen in one place. This is the difference between an auto-generated spec and a maintainable one.

### Step 3: Validate Endpoints Against the New Spec

```text
Hit each of the 5 changed endpoints on our staging server at https://staging-api.internal:3000 and verify the responses match the updated spec. Use the test auth token from .env.staging.
```

Four of five endpoints match perfectly. The fifth reveals something a manual spec update would have missed:

| Endpoint | Status | Result |
|---|---|---|
| `POST /api/v2/teams/:teamId/invites` | 201 | Schema matches |
| `GET /api/v2/billing/usage-summary` | 200 | Schema matches |
| `POST /api/v2/users` | 200 | `workspaceId` required field confirmed |
| `GET /api/v2/projects/:id` | 200 | **`owner.email` is null but spec says required** |

That last one is a catch within a catch. The `owner` field did change from string to object -- that part was correct. But the `email` sub-field can be null for users who signed up via SSO without providing an email. A developer manually updating the spec would have written `email: string` (required) based on the TypeScript type, because the type definition says `string`. The actual database allows null for SSO users -- a gap between the type system and the data layer that only live validation would catch.

The fix: mark `owner.email` as nullable in the spec. Two characters of YAML that prevent a runtime crash for every client that tries to read an SSO user's email.

### Step 4: Review the Diff for Breaking Changes

```text
Review the diff between the old and new openapi.yaml. Flag any breaking changes that need a version bump or client notification.
```

The breaking change analysis separates what's safe from what needs a migration plan:

**1 BREAKING change:** `POST /api/v2/users` now requires `workspaceId`. Clients sending requests without this field get a 422. Three options exist: bump to v3 with a migration guide, make the field optional with a default workspace, or add a request interceptor that injects a default `workspaceId` for clients on the v2 contract. The agent recommends option 2 (optional with default) as the least disruptive path.

**1 SEMI-BREAKING change:** `GET /api/v2/projects/:id` expanded `owner` from a string to an object. It's technically additive (the response gained fields), but any client parsing `owner` as a plain string -- `const ownerName = response.owner` -- will now get `[object Object]` instead of a name. Needs a changelog entry and a heads-up to the frontend team before the next release.

**2 SAFE changes:** New endpoints (`POST invites`, `GET usage-summary`) are purely additive. Existing clients are completely unaffected and can start using them whenever they want.

**1 DEPRECATION:** `DELETE /api/v2/users/:id/sessions` should be marked deprecated in the previous spec version before being removed from the next version, giving clients a migration window.

## Real-World Example

A backend engineer at a 40-person B2B SaaS company inherited an API serving 12 client integrations. The OpenAPI spec hadn't been updated in 3 months despite 47 commits touching route files. Two enterprise clients had already filed support tickets about undocumented field changes breaking their integrations -- one was threatening to switch providers if the API kept "silently changing."

The agent scanned 86 endpoints across 14 controller files against the existing spec and found 11 discrepancies: 3 new endpoints, 1 removed endpoint, and 7 schema changes. The updated spec was generated in 30 seconds -- work that would take 4-6 hours of manual file-by-file comparison. Endpoint validation caught 2 cases where the code behavior didn't match even the corrected spec, revealing actual bugs: one endpoint returned a 200 instead of 201 on creation, and another omitted pagination metadata from the response despite including it in the type definition.

The breaking change review identified 2 changes requiring client notification, which the engineer sent before the next release. Both enterprise clients responded positively -- one replied "thank you for the heads up, this is exactly the kind of communication we've been asking for."

The result: an accurate spec, two bugs caught, and client trust restored -- in under 20 minutes instead of a full day.

The lasting fix was structural: the engineer added a CI check that runs the drift scan on every PR touching route or controller files. If a developer changes an endpoint without updating the spec, the PR fails with a clear message listing the discrepancies. Three months later, the spec has zero drift -- not because developers suddenly became disciplined about documentation, but because the machine catches it before the PR can merge.

## Related Skills

- [scalar](/skills/scalar) — lint and preview the corrected OpenAPI spec (`scalar document lint`, `scalar document serve`) before merging
