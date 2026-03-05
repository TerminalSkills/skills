---
name: xano
description: Expert guidance for Xano, the no-code/low-code backend platform for building APIs, databases, and authentication without writing server code. Helps developers and non-technical builders create production-ready REST APIs with visual function stacks, manage data models, and integrate with frontend frameworks.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
  - no-code-backend
  - api-builder
  - database
  - auth
  - serverless
---

# Xano — No-Code Backend Builder


## Overview

You are an expert in Xano, the no-code/low-code backend platform for building APIs, databases, and authentication without writing server code. You help developers and non-technical builders create production-ready REST APIs with visual function stacks, manage data models, and integrate with frontend frameworks.

## Instructions

### Database Schema

```markdown
## Data Modeling in Xano
Create tables visually in the Xano dashboard:

### Users Table
| Field        | Type      | Properties                    |
|-------------|-----------|-------------------------------|
| id          | integer   | Primary key, auto-increment   |
| email       | text      | Unique, indexed               |
| name        | text      | Required                      |
| password    | password  | Hashed automatically          |
| plan        | enum      | free, pro, enterprise         |
| avatar_url  | text      | Nullable                      |
| metadata    | json      | Flexible key-value data       |
| created_at  | timestamp | Auto-set on create            |

### Posts Table
| Field        | Type       | Properties                   |
|-------------|------------|------------------------------|
| id          | integer    | Primary key                  |
| user_id     | integer    | Foreign key → Users          |
| title       | text       | Required, max 200 chars      |
| content     | text       | Required                     |
| published   | boolean    | Default: false               |
| tags        | list[text] | Array of strings             |
| created_at  | timestamp  | Auto-set on create           |

Xano auto-generates CRUD endpoints for each table.
```

### API Endpoints (Function Stacks)

```markdown
## Visual API Builder
Xano uses "Function Stacks" — visual, step-by-step API logic:

### POST /api/posts — Create a Post
1. **Precondition**: Verify authentication (JWT token valid)
2. **Input**: title (text, required), content (text, required), tags (list)
3. **Create Variable**: `user_id` from auth token
4. **Conditional**: Check user plan
   - If plan == "free" AND post_count >= 5 → Return error "Free plan limited to 5 posts"
5. **Database Query**: Add record to `posts` table
   - title: input.title
   - content: input.content
   - tags: input.tags
   - user_id: user_id
   - published: false
6. **Return**: { id, title, created_at }

### GET /api/posts — List Published Posts
1. **Input**: page (int, default 1), per_page (int, default 20)
2. **Database Query**: Query `posts` table
   - Filter: published = true
   - Sort: created_at DESC
   - Pagination: page, per_page
   - Join: users (for author info)
3. **Return**: { items: [...], total, page, pages }
```

### Authentication

```typescript
// Xano provides built-in auth endpoints:

// Sign up: POST /auth/signup
const signUp = async (email: string, password: string, name: string) => {
  const response = await fetch("https://your-instance.xano.io/api:auth/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  const { authToken } = await response.json();
  return authToken;   // JWT token
};

// Login: POST /auth/login
const login = async (email: string, password: string) => {
  const response = await fetch("https://your-instance.xano.io/api:auth/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const { authToken } = await response.json();
  return authToken;
};

// Authenticated request
const getPosts = async (token: string) => {
  const response = await fetch("https://your-instance.xano.io/api:main/posts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
};

// Get current user: GET /auth/me
const getMe = async (token: string) => {
  const response = await fetch("https://your-instance.xano.io/api:auth/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
};
```

### External API Integration

```markdown
## Calling External APIs from Function Stacks

### Example: Process payment via Stripe
1. **External API Request**: POST https://api.stripe.com/v1/charges
   - Headers: Authorization: Bearer sk_live_xxx
   - Body:
     - amount: input.amount * 100
     - currency: "usd"
     - source: input.payment_token
2. **Conditional**: Check response status
   - If status != 200 → Return error with Stripe message
3. **Database Query**: Update order status to "paid"
4. **External API Request**: POST to webhook (notify fulfillment)
5. **Return**: { success: true, charge_id }

### Example: Send email via Resend
1. **External API Request**: POST https://api.resend.com/emails
   - Headers: Authorization: Bearer re_xxx
   - Body:
     - from: "app@myapp.com"
     - to: user.email
     - subject: "Order Confirmed"
     - html: template with order details
```

### Webhooks and Scheduled Tasks

```markdown
## Webhooks (incoming)
Xano can receive webhooks from external services:
- Stripe payment events → Update order status
- GitHub push events → Trigger build
- Custom webhooks → Process any incoming data

## Scheduled Tasks (Cron)
Run function stacks on a schedule:
- Every hour: Sync data from external API
- Daily at midnight: Generate reports
- Weekly: Send digest emails
```


## Examples

### Example 1

**User request:** "Help me set up Xano"

The agent follows the instructions above to configure Xano with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Xano configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Start with the data model** — Design your tables and relationships first; Xano generates CRUD endpoints automatically
2. **Use function stacks for logic** — Keep business logic in Xano's visual builder; don't put it in the frontend
3. **Authentication built-in** — Use Xano's auth system (JWT-based); don't build your own
4. **Pagination on all list endpoints** — Always add page/per_page inputs; unbounded queries kill performance
5. **Validate inputs** — Add input validation (required, type, min/max) on every endpoint
6. **Use addons for complex queries** — Xano supports raw SQL for complex aggregations and joins beyond the visual builder
7. **API groups for organization** — Group related endpoints (auth, posts, payments) into separate API groups
8. **Rate limiting** — Enable rate limiting on public endpoints to prevent abuse
