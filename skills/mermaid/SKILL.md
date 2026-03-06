---
name: mermaid
category: Data Visualization
tags: [diagrams, markdown, flowchart, sequence-diagram, docs-as-code, architecture]
version: 1.0.0
author: terminal-skills
---

# Mermaid — Diagrams as Code in Markdown

You are an expert in Mermaid, the JavaScript-based diagramming library that renders diagrams from text definitions embedded in Markdown. You help developers create flowcharts, sequence diagrams, class diagrams, ERDs, Gantt charts, and architecture diagrams that live alongside code and documentation — versioned in Git, rendered in GitHub, GitLab, Notion, and VitePress.

## Core Capabilities

### Flowcharts

```mermaid
flowchart TD
    A[User Request] --> B{Authenticated?}
    B -->|Yes| C{Rate Limited?}
    B -->|No| D[Return 401]
    C -->|Under Limit| E[Process Request]
    C -->|Over Limit| F[Return 429]
    E --> G{Success?}
    G -->|Yes| H[Return 200]
    G -->|No| I[Return 500]
    I --> J[Log Error]
    J --> K[Alert On-Call]
```

### Sequence Diagrams

```mermaid
sequenceDiagram
    actor User
    participant App as Frontend
    participant API as API Gateway
    participant Auth as Auth Service
    participant DB as Database

    User->>App: Click "Login"
    App->>API: POST /auth/login {email, password}
    API->>Auth: Validate credentials
    Auth->>DB: SELECT user WHERE email = ?
    DB-->>Auth: User record
    Auth->>Auth: Verify password hash
    alt Valid credentials
        Auth-->>API: JWT token + refresh token
        API-->>App: 200 {token, user}
        App->>App: Store token in httpOnly cookie
        App-->>User: Redirect to dashboard
    else Invalid credentials
        Auth-->>API: Authentication failed
        API-->>App: 401 Unauthorized
        App-->>User: Show error message
    end
```

### Entity Relationship Diagrams

```mermaid
erDiagram
    USERS ||--o{ ORDERS : places
    USERS ||--o{ REVIEWS : writes
    USERS {
        uuid id PK
        string email UK
        string name
        string plan
        timestamp created_at
    }
    ORDERS ||--|{ ORDER_ITEMS : contains
    ORDERS {
        uuid id PK
        uuid user_id FK
        decimal amount
        string status
        timestamp created_at
    }
    PRODUCTS ||--o{ ORDER_ITEMS : "included in"
    PRODUCTS ||--o{ REVIEWS : "reviewed by"
    PRODUCTS {
        uuid id PK
        string name
        decimal price
        integer stock
    }
    ORDER_ITEMS {
        uuid order_id FK
        uuid product_id FK
        integer quantity
        decimal price
    }
```

### Architecture Diagrams (C4)

```mermaid
C4Context
    title System Context — E-Commerce Platform

    Person(customer, "Customer", "Browses and purchases products")
    Person(admin, "Admin", "Manages products and orders")

    System(webapp, "Web Application", "Next.js frontend")
    System(api, "API Gateway", "Node.js REST API")
    System(payments, "Payment Service", "Stripe integration")

    System_Ext(stripe, "Stripe", "Payment processing")
    System_Ext(email, "SendGrid", "Email delivery")
    System_Ext(cdn, "CloudFront", "Static asset delivery")

    Rel(customer, webapp, "Browses products")
    Rel(admin, webapp, "Manages store")
    Rel(webapp, api, "API calls", "HTTPS/JSON")
    Rel(api, payments, "Process payments")
    Rel(payments, stripe, "Charge cards", "HTTPS")
    Rel(api, email, "Send emails", "HTTPS")
    Rel(webapp, cdn, "Load assets")
```

### Gantt Charts

```mermaid
gantt
    title Product Launch Timeline
    dateFormat YYYY-MM-DD
    axisFormat %b %d

    section Discovery
    User interviews       :done,    d1, 2026-01-06, 2w
    Assumption testing     :done,    d2, after d1, 1w
    PRD writing           :done,    d3, after d2, 1w

    section Development
    Backend API           :active,  dev1, 2026-02-03, 3w
    Frontend UI           :active,  dev2, 2026-02-10, 3w
    Integration testing   :         dev3, after dev1, 1w

    section Launch
    Beta rollout          :         l1, after dev3, 2w
    GA launch             :milestone, l2, after l1, 0d
    Post-launch monitoring:         l3, after l2, 2w
```

### State Diagrams

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review: Submit for review
    Review --> Approved: Approve
    Review --> Draft: Request changes
    Approved --> Published: Publish
    Published --> Archived: Archive
    Draft --> Deleted: Delete
    Archived --> Published: Restore

    state Review {
        [*] --> PeerReview
        PeerReview --> ManagerReview: Peer approved
        PeerReview --> [*]: Peer rejected
        ManagerReview --> [*]
    }
```

## Installation

```bash
npm install mermaid                    # JavaScript library
# Or use CDN: <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>

# GitHub, GitLab, Notion render Mermaid natively in Markdown
# Just use ```mermaid code blocks
```

## Best Practices

1. **Diagrams as code** — Keep Mermaid diagrams in Markdown files alongside code; they version, diff, and review in PRs
2. **GitHub native rendering** — GitHub renders Mermaid in README and docs automatically; no extra tooling needed
3. **Sequence diagrams for APIs** — Use sequence diagrams to document API flows; clearer than prose for multi-service interactions
4. **ERDs from actual schema** — Generate Mermaid ERDs from your database schema; keep them in sync with migrations
5. **Keep it simple** — Mermaid diagrams should fit on one screen; split complex systems into multiple diagrams
6. **Theme for presentations** — Use `%%{init: {'theme': 'dark'}}%%` for dark-mode diagrams in presentations
7. **C4 for architecture** — Use C4 context/container/component diagrams for system architecture documentation
8. **Gantt for planning** — Use Gantt charts in project READMEs to communicate timelines; auto-renders in GitHub
