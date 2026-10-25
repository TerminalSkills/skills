---
name: spec-driven-dev
description: >-
  Write specifications before code — the agent creates detailed technical specs,
  validates them, then implements. Use when someone asks to "write a spec first",
  "plan before coding", "create a technical design document", "spec-driven
  development", "Kiro-style development", "validate my idea before building",
  "write an RFC", or "create an architecture doc before implementation".
  Covers requirement extraction, technical spec templates, validation checklists,
  implementation plans, and spec-to-code workflows.
license: Apache-2.0
compatibility: "Any AI coding agent. No dependencies."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "spec, planning, rfc, architecture, design-doc"
---

# Spec-Driven Development

## Overview

Most AI coding failures happen because the agent starts coding before understanding the problem. Spec-driven development reverses the flow: first write a detailed specification that describes what to build, why, and how — then validate the spec — then implement. The spec becomes both the contract and the test oracle.

## When to Use

- Starting a new feature and want to think before coding
- Building something complex where wrong assumptions are expensive
- Working in a team where others need to review the design before implementation
- The agent keeps building the wrong thing because requirements are ambiguous
- Creating RFCs or architecture decision records (ADRs) for the team

## Instructions

### The Spec-First Workflow

```
User Request → Extract Requirements → Write Spec → Validate Spec → Implement → Verify Against Spec
                                          ↑                |
                                          └── Revise ──────┘
```

### Step 1: Requirement Extraction

Before writing anything, turn the request into testable requirements. If the answers are not in the request, ask the user; do not guess silently.

```markdown
## Requirements

### REQ-001: Invite a teammate by email (must)
- Acceptance: an owner can submit an email; an invitation row is created with status `pending` and a 7-day expiry.
- Acceptance: inviting an address that is already a member returns 409 with `already_member`.
- Out of scope: bulk CSV invites.

### REQ-002: Expired invitations are rejected (must)
- Acceptance: accepting an invitation after `expires_at` returns 410 and creates no membership.

## Assumptions
- Email delivery goes through the existing transactional provider.

## Open questions
- Can admins, or only owners, send invitations?
```

Rules: every requirement gets an id, a MoSCoW priority (must, should, could, won't), and acceptance criteria that a test can assert. "Fast" is not a requirement; "p95 below 300 ms for 1,000 members" is. "Secure" is not one either; "invite tokens are single-use and expire after 7 days" is.

### Step 2: Write the Technical Spec

Save it in the repository (for example `docs/specs/<feature>.md`) so it is reviewed like code.

```markdown
# Technical Spec Template

## 1. Overview
One paragraph: what we're building and why.

## 2. Goals & Non-Goals
### Goals
- [Specific, measurable outcome]
- [Specific, measurable outcome]

### Non-Goals
- [Explicitly excluded scope]
- [Things we're NOT building]

## 3. Background
Why now? What's the current state? What's the problem?

## 4. Technical Design

### 4.1 Architecture
High-level architecture: components, data flow, integrations.

### 4.2 Data Model
Database schema, API types, key data structures.

### 4.3 API Design
Endpoints, request/response types, error handling.

### 4.4 Key Algorithms
Non-obvious logic. Decision trees. State machines.

## 5. Alternatives Considered
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Option A | ... | ... | Chosen because... |
| Option B | ... | ... | Rejected because... |

## 6. Implementation Plan
### Phase 1: [Name] (Week 1)
- [ ] Task 1
- [ ] Task 2

### Phase 2: [Name] (Week 2)
- [ ] Task 3
- [ ] Task 4

## 7. Testing Strategy
- Unit tests for [what]
- Integration tests for [what]
- E2E tests for [what]
- Performance benchmarks for [what]

## 8. Rollout Plan
- Feature flag: [name]
- Rollout: 5% → 25% → 100%
- Rollback trigger: [metric] drops below [threshold]

## 9. Open Questions
- [ ] Question 1
- [ ] Question 2

## 10. References
- [Related RFC or design doc]
- [External documentation]
```

### Step 3: Validate the spec

Read the spec as a reviewer before any code exists. Check that: every requirement has a testable criterion; failure modes (invalid input, timeouts, partial failure) are described; authorization and data exposure are addressed; there is a rollback or migration path; open questions are empty or explicitly deferred. A small linter catches the mechanical part (missing sections, vague words); save it as `validate-spec.ts` and run it on Node 22.7 or later (the file uses `export` and top-level `await`, which need 22.7+ syntax detection; 22.18+ and 24 need no flag):

```typescript
interface Finding {
  category: "completeness" | "quality" | "reliability" | "security" | "operations";
  status: "fail" | "warn";
  message: string;
}

const REQUIRED_HEADINGS = ["Overview", "Goals", "Non-Goals", "Technical Design", "Testing Strategy", "Rollout Plan"];
const VAGUE_TERMS = ["fast", "secure", "scalable", "user-friendly", "robust", "efficient"];

export function validateSpec(spec: string): Finding[] {
  const findings: Finding[] = [];
  const headings = [...spec.matchAll(/^#{1,4}\s+(?:\d+(?:\.\d+)*\.?\s+)?(.+?)\s*$/gm)].map((m) => m[1].toLowerCase());

  for (const name of REQUIRED_HEADINGS) {
    if (!headings.some((h) => h.includes(name.toLowerCase()))) {
      findings.push({ category: "completeness", status: "fail", message: `Missing section "${name}"` });
    }
  }
  for (const term of VAGUE_TERMS) {
    const hits = spec.match(new RegExp(`\\b${term}\\b`, "gi"));
    if (hits) findings.push({ category: "quality", status: "warn", message: `"${term}" appears ${hits.length}x; replace with a measurable criterion` });
  }
  const has = (re: RegExp) => re.test(spec);
  if (!has(/\b(error|failure|timeout)s?\b/i)) findings.push({ category: "reliability", status: "fail", message: "No error or failure handling described" });
  if (!has(/\b(authentication|authorization|security|permission)s?\b/i)) findings.push({ category: "security", status: "warn", message: "No authentication, authorization or security notes" });
  if (!has(/\b(rollback|migration)\b/i)) findings.push({ category: "operations", status: "warn", message: "No rollback or migration plan" });
  return findings;
}

if (process.argv[2]) {
  const fs = await import("node:fs");
  const out = validateSpec(fs.readFileSync(process.argv[2], "utf8"));
  for (const f of out) console.log(`${f.status.toUpperCase()} [${f.category}] ${f.message}`);
  process.exit(out.some((f) => f.status === "fail") ? 1 : 0);
}
```

```console
$ node --experimental-strip-types validate-spec.ts docs/specs/team-invitations.md
FAIL [completeness] Missing section "Rollout Plan"
WARN [quality] "secure" appears 2x; replace with a measurable criterion
```

The linter is only a floor. A spec can pass it and still be wrong, so the human review of the design is the real gate.

### Step 4: Implement against the spec

Work section by section, in dependency order: data model, API, business logic, UI. Turn each acceptance criterion into a test first or alongside, then make it pass. Keep an implementation checklist in the spec itself:

```markdown
## 6. Implementation Plan
- [x] IMPL-001 Migration: `invitations` table with unique (team_id, email) (spec 4.2)
- [ ] IMPL-002 POST /teams/:id/invitations returning 201, 409, 422 (spec 4.3, REQ-001)
- [ ] IMPL-003 Accept endpoint with expiry check (spec 4.3, REQ-002)
```

When implementation forces a design change, update the spec in the same commit and say why. At the end, walk the acceptance criteria one by one and record which test proves each.

### Tools that implement this workflow

You do not need a tool, but two exist:

- **Kiro** (AWS agentic IDE and CLI) generates `.kiro/specs/<name>/requirements.md`, `design.md` and `tasks.md` for a feature, and `bugfix.md` for bug specs, then executes the tasks.
- **GitHub Spec Kit** installs with `uv tool install specify-cli` (Python 3.11+ and `uv` required), then `specify init my-project --integration copilot`. In the agent chat it provides the commands `/speckit-constitution`, `/speckit-specify`, `/speckit-plan`, `/speckit-tasks` and `/speckit-implement`. Command names depend on the agent integration; check its README before relying on them.

## Examples

### Example 1: Plan a feature before building it

**User prompt:** "I want to add team invitations to our SaaS app. Write a spec first, don't just start coding."

The agent will:
- Extract requirements: invite by email, accept/reject flow, role assignment, expiry
- Write a full spec with data model (invitations table), API endpoints, email flow, edge cases
- Validate: security (rate limiting invites), error handling (invalid email, expired invite)
- Get user approval on the spec before writing any code

### Example 2: Create an RFC for a system redesign

**User prompt:** "We need to move from REST to tRPC. Write an RFC that the team can review."

The agent will:
- Document current state (REST endpoints, clients, pain points)
- Propose tRPC migration with alternatives considered (GraphQL, gRPC)
- Write migration plan: parallel running period, endpoint-by-endpoint migration, rollback strategy
- Include performance benchmarks and type-safety benefits with concrete examples

## Guidelines

- **Spec before code for anything non-trivial** — skip the full template for a one-line fix; a short spec is still a spec
- **Testable acceptance criteria** — "works correctly" is useless; "returns 404 for deleted users" is testable
- **Non-goals are as important as goals** — explicitly exclude scope to prevent creep
- **Open questions block implementation** — resolve them before writing code
- **Alternatives section builds trust** — show you considered other approaches
- **Implementation plan = commit plan** — each phase should be a mergeable PR
- **Keep specs alive** — update the spec when implementation diverges; it's the source of truth
- **Review specs like code** — PRs for specs catch design issues before they become code issues
- **Time-box spec writing** — 30-60 minutes max for features; don't over-engineer the document
- **Spec format is flexible** — RFCs, ADRs, Notion docs, markdown files — pick what your team reviews
