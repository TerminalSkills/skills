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
  version: "1.0.0"
  category: development
  tags: ["spec", "planning", "rfc", "architecture", "design-doc"]
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

Before writing anything, extract structured requirements from the user's request.

```typescript
// requirements.ts — Extract structured requirements from natural language
/**
 * Turns vague requests into concrete, testable requirements.
 * Each requirement gets a priority, acceptance criteria,
 * and explicit out-of-scope markers.
 */

interface Requirement {
  id: string;                      // REQ-001, REQ-002, etc.
  title: string;
  description: string;
  priority: "must" | "should" | "could" | "wont";  // MoSCoW
  acceptanceCriteria: string[];    // Testable conditions
  outOfScope?: string[];           // Explicitly excluded
}

interface RequirementsDoc {
  projectName: string;
  overview: string;
  stakeholders: string[];
  requirements: Requirement[];
  assumptions: string[];
  constraints: string[];
  openQuestions: string[];         // Things that need clarification
}

/**
 * Template for requirement extraction prompt.
 * The agent uses this to interview the user or analyze the request.
 */
const EXTRACTION_PROMPT = `
Analyze the following request and extract structured requirements.

For each requirement:
1. Write a clear, testable acceptance criterion
2. Assign priority (must/should/could/won't)
3. Note anything explicitly out of scope
4. Flag assumptions that need validation
5. List open questions that could change the design

Be specific. "Fast" is not a requirement. "Page loads in <2 seconds on 3G" is.
"Secure" is not a requirement. "All API endpoints require JWT auth with 15-min expiry" is.
`;
```

### Step 2: Write the Technical Spec

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

### Step 3: Spec Validation Checklist

Before implementation, validate the spec against this checklist:

```typescript
// validate-spec.ts — Automated spec validation
/**
 * Checks a technical spec for common issues:
 * - Vague requirements without acceptance criteria
 * - Missing error handling considerations
 * - No rollback/migration plan
 * - Unaddressed security concerns
 */

interface ValidationResult {
  category: string;
  check: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export function validateSpec(spec: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Completeness checks
  const requiredSections = [
    "Overview", "Goals", "Non-Goals", "Technical Design",
    "Testing Strategy", "Rollout Plan",
  ];
  for (const section of requiredSections) {
    results.push({
      category: "completeness",
      check: `Has "${section}" section`,
      status: spec.toLowerCase().includes(section.toLowerCase()) ? "pass" : "fail",
      message: spec.includes(section) ? "Present" : `Missing "${section}" section`,
    });
  }

  // Quality checks
  const vagueTerms = ["fast", "secure", "scalable", "user-friendly", "robust", "efficient"];
  for (const term of vagueTerms) {
    const regex = new RegExp(`\\b${term}\\b`, "gi");
    const matches = spec.match(regex);
    if (matches && matches.length > 0) {
      results.push({
        category: "quality",
        check: `No vague term: "${term}"`,
        status: "warn",
        message: `Found "${term}" ${matches.length} time(s) — replace with measurable criteria`,
      });
    }
  }

  // Error handling check
  if (!spec.toLowerCase().includes("error") && !spec.toLowerCase().includes("failure")) {
    results.push({
      category: "reliability",
      check: "Addresses error handling",
      status: "fail",
      message: "No mention of error handling or failure scenarios",
    });
  }

  // Security check
  if (!spec.toLowerCase().includes("auth") && !spec.toLowerCase().includes("security")) {
    results.push({
      category: "security",
      check: "Addresses security",
      status: "warn",
      message: "No mention of authentication or security considerations",
    });
  }

  // Migration/rollback check
  if (!spec.toLowerCase().includes("rollback") && !spec.toLowerCase().includes("migration")) {
    results.push({
      category: "operations",
      check: "Has rollback plan",
      status: "warn",
      message: "No rollback or migration strategy mentioned",
    });
  }

  return results;
}
```

### Step 4: Spec-to-Code Implementation

Once the spec is validated, implement systematically — one section at a time, verifying against acceptance criteria.

```typescript
// implement.ts — Convert spec sections to implementation tasks
/**
 * Breaks a spec into ordered implementation tasks.
 * Each task maps to a spec section and includes
 * the acceptance criteria as test assertions.
 */

interface ImplementationTask {
  id: string;
  specSection: string;          // Which spec section this implements
  description: string;
  files: string[];              // Files to create or modify
  acceptanceCriteria: string[]; // From the spec — become test assertions
  dependencies: string[];       // Task IDs that must complete first
  estimatedMinutes: number;
}

function specToTasks(spec: string): ImplementationTask[] {
  // Parse spec sections and generate implementation order
  // Data model first, then API, then business logic, then tests
  return [
    {
      id: "IMPL-001",
      specSection: "4.2 Data Model",
      description: "Create database schema and migrations",
      files: ["prisma/schema.prisma", "prisma/migrations/"],
      acceptanceCriteria: [
        "All tables from spec exist with correct columns and types",
        "Foreign keys and indexes match spec",
        "Migration runs cleanly on empty database",
      ],
      dependencies: [],
      estimatedMinutes: 30,
    },
    {
      id: "IMPL-002",
      specSection: "4.3 API Design",
      description: "Implement API endpoints with types",
      files: ["src/routes/", "src/types/"],
      acceptanceCriteria: [
        "All endpoints from spec are implemented",
        "Request/response types match spec exactly",
        "Error responses follow spec format",
      ],
      dependencies: ["IMPL-001"],
      estimatedMinutes: 60,
    },
    // ... more tasks
  ];
}
```

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

- **Spec before code, always** — 30 minutes planning saves 3 hours of wrong implementation
- **Testable acceptance criteria** — "works correctly" is useless; "returns 404 for deleted users" is testable
- **Non-goals are as important as goals** — explicitly exclude scope to prevent creep
- **Open questions block implementation** — resolve them before writing code
- **Alternatives section builds trust** — show you considered other approaches
- **Implementation plan = commit plan** — each phase should be a mergeable PR
- **Keep specs alive** — update the spec when implementation diverges; it's the source of truth
- **Review specs like code** — PRs for specs catch design issues before they become code issues
- **Time-box spec writing** — 30-60 minutes max for features; don't over-engineer the document
- **Spec format is flexible** — RFCs, ADRs, Notion docs, markdown files — pick what your team reviews
