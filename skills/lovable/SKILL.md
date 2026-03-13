---
name: lovable
description: >-
   You are an expert in Lovable (formerly GPT Engineer), the AI app builder
  that generates production-ready full-stack applications from natural
  language descriptions. You help developers and non-technical founders create
  React + Supabase applications with authentication, database, file storage,
  and deployment — going from idea to production URL in under an hour.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Developer Tools
  tags:
    - ai-coding
    - full-stack
    - prototyping
    - supabase
    - vibe-coding
    - no-code
---

# Lovable — AI Full-Stack App Generator with Supabase Backend

You are an expert in Lovable (formerly GPT Engineer), the AI app builder that generates production-ready full-stack applications from natural language descriptions. You help developers and non-technical founders create React + Supabase applications with authentication, database, file storage, and deployment — going from idea to production URL in under an hour.

## Core Capabilities

### App Generation

```markdown
## Prompt → Full App

Lovable generates:
- React frontend with Tailwind CSS and shadcn/ui
- Supabase backend (PostgreSQL, Auth, Storage, Realtime)
- Database schema with Row Level Security policies
- Authentication flows (email, Google, GitHub)
- Full CRUD operations
- Responsive design
- Deployment to Lovable hosting or Netlify

## Example: SaaS Waitlist + Dashboard

Prompt:
"Build a SaaS waitlist app where:
- Landing page with email signup form and social proof counter
- Admin dashboard to view signups, export CSV, and send invite emails
- Supabase auth for admin login
- Track referrals: each signup gets a unique referral link
- Leaderboard showing top referrers
- Dark mode support"

Lovable generates:
├── src/
│   ├── pages/Landing.tsx          # Waitlist signup with counter
│   ├── pages/Dashboard.tsx        # Admin view of signups
│   ├── pages/Leaderboard.tsx      # Referral leaderboard
│   ├── components/SignupForm.tsx   # Email + referral tracking
│   ├── components/DataTable.tsx    # Sortable signups table
│   ├── lib/supabase.ts           # Supabase client config
│   └── hooks/useSignups.ts       # Data fetching hooks
├── supabase/
│   └── migrations/
│       └── 001_create_signups.sql # Schema + RLS policies
```

### Supabase Integration

```markdown
## Auto-Generated Database

Lovable creates Supabase resources automatically:
- Tables with proper column types and constraints
- Row Level Security policies (users can only access their own data)
- Foreign key relationships
- Indexes on commonly queried columns
- Realtime subscriptions for live updates
- Storage buckets for file uploads
- Edge functions for server-side logic

## Database Schema Example (auto-generated)

CREATE TABLE signups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  referral_code TEXT NOT NULL UNIQUE DEFAULT nanoid(),
  referred_by UUID REFERENCES signups(id),
  referral_count INTEGER DEFAULT 0,
  invited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE signups ENABLE ROW LEVEL SECURITY;

-- Admin can see all signups
CREATE POLICY "Admin full access" ON signups
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

-- Public can insert (signup)
CREATE POLICY "Public signup" ON signups
  FOR INSERT TO anon
  WITH CHECK (true);
```

### Iterative Editing

```markdown
## Edit via Chat

After generation, edit with natural language:
- "Add a chart showing signups over time"
- "Make the landing page hero section bigger with an animated gradient"
- "Add email validation and show error messages"
- "Connect Resend for sending invite emails"
- "Add a /api/webhook endpoint for Stripe events"

Lovable modifies the existing codebase, preserving your customizations.
```

## Installation

```markdown
# No installation — browser-based
# https://lovable.dev

# Free: 5 generations/day
# Pro: $20/month (unlimited)
# Teams: $25/user/month
```

## Best Practices

1. **Detailed first prompt** — Include all core features in the initial prompt; Lovable builds a cohesive architecture from the start
2. **Supabase for backend** — Lovable is optimized for Supabase; leverages Auth, Database, Storage, and Realtime out of the box
3. **shadcn/ui components** — Lovable uses shadcn/ui; request specific components by name ("use a DataTable with sorting and filtering")
4. **RLS from day one** — Lovable generates Row Level Security policies; review them before going to production
5. **Export and own** — Export to GitHub at any time; the generated code is standard React + Supabase, no vendor lock-in
6. **Iterate in chat** — Use follow-up prompts to refine; "make the hero section more engaging" or "add error states to all forms"
7. **Connect to your Supabase** — Link your own Supabase project for production; Lovable's built-in instance is for prototyping
8. **Combine with Cursor** — Generate the scaffold with Lovable, export, then refine business logic with Cursor or Continue
