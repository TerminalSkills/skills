---
name: mermaid
category: Data Visualization
tags: [diagrams, markdown, flowchart, sequence-diagram, docs-as-code, architecture]
version: 1.0.0
author: terminal-skills
---

# Mermaid — Diagrams as Code in Markdown

You are an expert in Mermaid, the JavaScript diagramming library that renders diagrams from text in Markdown. You help developers create flowcharts, sequence diagrams, ERDs, C4 architecture diagrams, Gantt charts, and state machines — versioned in Git, rendered natively in GitHub, GitLab, Notion, and VitePress.

## Core Capabilities

### Flowcharts

```mermaid
flowchart TD
    A[User Request] --> B{Authenticated?}
    B -->|Yes| C{Rate Limited?}
    B -->|No| D[401 Unauthorized]
    C -->|Under| E[Process Request]
    C -->|Over| F[429 Too Many Requests]
    E --> G{Success?}
    G -->|Yes| H[200 OK]
    G -->|No| I[500 Error] --> J[Log & Alert]
```

### Sequence Diagrams

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant API as API Gateway
    participant Auth as Auth Service
    participant DB as Database

    User->>FE: Click Login
    FE->>API: POST /auth/login
    API->>Auth: Validate credentials
    Auth->>DB: SELECT user
    DB-->>Auth: User record
    alt Valid
        Auth-->>API: JWT token
        API-->>FE: 200 {token}
        FE-->>User: Dashboard
    else Invalid
        Auth-->>API: Failed
        API-->>FE: 401
        FE-->>User: Error message
    end
```

### Entity Relationship Diagrams

```mermaid
erDiagram
    USERS ||--o{ ORDERS : places
    USERS { uuid id PK; string email UK; string plan }
    ORDERS ||--|{ ORDER_ITEMS : contains
    ORDERS { uuid id PK; uuid user_id FK; decimal amount; string status }
    PRODUCTS ||--o{ ORDER_ITEMS : "in"
    PRODUCTS { uuid id PK; string name; decimal price }
```

### C4 Architecture

```mermaid
C4Context
    Person(user, "Customer")
    System(app, "Web App", "Next.js")
    System(api, "API", "Node.js")
    System_Ext(stripe, "Stripe")
    Rel(user, app, "Uses")
    Rel(app, api, "HTTPS")
    Rel(api, stripe, "Payments")
```

### Gantt & State Diagrams

```mermaid
gantt
    title Sprint 12
    dateFormat YYYY-MM-DD
    section Backend
    API endpoints    :done, b1, 2026-03-01, 5d
    Database migration :active, b2, after b1, 3d
    section Frontend
    UI components    :f1, 2026-03-03, 5d
    Integration      :f2, after f1, 3d
    section Launch
    QA               :l1, after b2, 3d
    Deploy           :milestone, after l1, 0d
```

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review: Submit
    Review --> Approved: Approve
    Review --> Draft: Request changes
    Approved --> Published: Publish
    Published --> Archived: Archive
```

## Installation

```bash
npm install mermaid
# GitHub/GitLab render ```mermaid blocks natively — no setup needed
```

## Best Practices

1. **Diagrams as code** — Keep Mermaid in Markdown files; they version, diff, and review in PRs
2. **GitHub native** — GitHub renders Mermaid in README and docs automatically
3. **Sequence for APIs** — Document multi-service flows with sequence diagrams; clearer than prose
4. **ERDs from schema** — Generate Mermaid ERDs from database schema; keep in sync with migrations
5. **One screen per diagram** — Split complex systems into multiple focused diagrams
6. **C4 for architecture** — Use C4 context/container diagrams for system-level documentation
7. **Gantt in READMEs** — Show project timelines directly in GitHub; auto-rendered
8. **Theme support** — `%%{init: {'theme': 'dark'}}%%` for dark-mode presentations
