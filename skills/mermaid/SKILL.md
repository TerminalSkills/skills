---
name: mermaid
description: >-
  Mermaid turns short text definitions into diagrams (flowcharts, sequence, ER, class, state, Gantt, C4 and
  architecture diagrams) that render in Markdown on GitHub, GitLab and docs sites. Use when a user asks to
  "draw a flowchart", "make a sequence diagram", "generate an ER diagram from my schema", "embed a diagram in
  the README", or "export a diagram to SVG or PNG".
license: Apache-2.0
compatibility: "Browsers for the JS library; Node.js 22.13+ and a headless Chromium (downloaded by the CLI) for mmdc"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/mermaid-js/mermaid
  tags: ["diagrams", "markdown", "flowchart", "sequence-diagram", "docs-as-code"]
---
# Mermaid — Diagrams as Code in Markdown

## Overview

Mermaid (npm `mermaid`, 12.x in October 2026) renders diagrams from text. Write a fenced block tagged `mermaid` in any Markdown file and GitHub, GitLab and most documentation tools draw it; the text diffs and reviews like code. Newer diagram types may not render on a host that runs an older Mermaid, so check the target before using them.

## Instructions

Pick the diagram type by the question it answers: flowchart for decisions, sequence for who-calls-whom over time, ER for data models, state for lifecycles, Gantt for schedules. Write the definition, then validate it (see Rendering) before committing. The blocks below are all valid on Mermaid 12.

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

### Architecture diagrams (C4, experimental)

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
    User interviews       :done,    d1, 2026-09-07, 2w
    Assumption testing     :done,    d2, after d1, 1w
    PRD writing           :done,    d3, after d2, 1w

    section Development
    Backend API           :active,  dev1, 2026-10-12, 3w
    Frontend UI           :active,  dev2, 2026-10-19, 3w
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

### Other types worth knowing

`classDiagram`, `pie`, `gitGraph`, `timeline`, `mindmap`, `journey`, `quadrantChart`, `xychart-beta`, `sankey-beta`, `kanban`, `block-beta`, `packet-beta`, `requirementDiagram`, `treemap-beta`, `radar-beta` and `architecture-beta` all parse in Mermaid 12. Example of an architecture diagram:

```mermaid
architecture-beta
    group cloud(cloud)[Production]
    service api(server)[API] in cloud
    service db(database)[Postgres] in cloud
    service bucket(disk)[Uploads] in cloud
    api:R --> L:db
    api:B --> T:bucket
```

### Theme and configuration

Directives such as `%%{init: {...}}%%` are deprecated. Put configuration in YAML frontmatter at the top of the block:

```mermaid
---
config:
  theme: dark
  flowchart:
    curve: basis
---
flowchart LR
    Client[Browser] --> Edge[CDN] --> Origin[App server]
```

### Rendering and validating

```bash
npm install -g @mermaid-js/mermaid-cli     # provides mmdc; downloads a headless Chromium
mmdc -i architecture.mmd -o architecture.svg
mmdc -i architecture.mmd -o architecture.png -t dark -b transparent
mmdc -i README.template.md -o README.md    # replaces mermaid blocks with rendered images
```

`mmdc` renders in a headless browser, so a diagram that does not parse will not produce an image; run it on changed files in CI to catch syntax errors.

### In a web page

```html
<pre class="mermaid">
flowchart LR
    A[Request] --> B[Handler]
</pre>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true });
</script>
```

Pin a major version in the URL. In a bundled app, `npm install mermaid`, call `mermaid.initialize({ startOnLoad: false })` and then `await mermaid.run()`. Keep the default `securityLevel: 'strict'` unless you fully trust the diagram source.

## Examples

### Example 1: "Document our checkout API call flow in the README"

Write the sequence diagram above (adapting participants) in a `mermaid` fence in `README.md`, then preview the file on GitHub or render the diagram with `mmdc`. The result is a rendered diagram with the `alt`/`else` branches shown as labelled boxes.

### Example 2: "Generate an ER diagram from my Postgres tables"

Read the schema (`\d+ orders` in psql or the migration files), then emit one `erDiagram` entity per table with its columns and `PK`/`FK`/`UK` markers, and one relationship line per foreign key, such as `USERS ||--o{ ORDERS : places`. The cardinality markers are `||` exactly one, `|o` or `o|` zero or one, `o{` or `}o` zero or many, `|{` or `}|` one or many (the crow's foot points at the "many" side).

## Guidelines

- A node id or label that is the lowercase word `end` breaks flowcharts; write `End` or quote the label.
- Wrap labels containing parentheses, braces, quotes or `#` in double quotes: `B["Pay (card)"]`. Unquoted `B[Pay (card)]` is a parse error.
- Keep a diagram to what fits on one screen; split large systems into several diagrams.
- C4 diagrams are marked experimental upstream; their syntax may change between releases.
- Mermaid lays out automatically; if you need exact positioning, use a drawing tool instead.
- Do not paste untrusted user text into a diagram that renders with `securityLevel: 'loose'`.
