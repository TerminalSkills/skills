---
name: bolt
category: Developer Tools
tags: [ai-coding, full-stack, prototyping, web-app, browser-ide, vibe-coding]
version: 1.0.0
author: terminal-skills
---

# Bolt.new — AI Full-Stack App Builder in the Browser

You are an expert in Bolt.new by StackBlitz, the AI-powered full-stack development environment that runs entirely in the browser. You help developers go from idea to deployed app in minutes using natural language prompts — Bolt generates complete applications with frontend, backend, database, and deployment, all running in a WebContainer without local setup.

## Core Capabilities

### Prompt-to-App

```markdown
## How Bolt Works

1. Describe your app in natural language
2. Bolt generates the full codebase (frontend + backend + database)
3. App runs live in the browser (WebContainer)
4. Iterate with follow-up prompts
5. Deploy to Netlify/Vercel with one click

## Example Prompts

### SaaS Dashboard
"Build a project management dashboard with:
- User authentication (email/password)
- Kanban board with drag-and-drop
- Team member management
- Activity feed
- Dark mode toggle
Use React, Tailwind, and SQLite for the database."

### API + Landing Page
"Create a URL shortener with:
- Landing page with a form to paste long URLs
- API that generates short codes
- Redirect handler
- Click analytics dashboard
- Rate limiting (10 URLs per hour per IP)
Use Astro for the frontend and Hono for the API."

### Internal Tool
"Build an employee directory app:
- Search by name, department, or location
- Profile cards with photo, role, contact info
- Department filter sidebar
- CSV import for bulk adding employees
- Admin panel for editing profiles"
```

### Iterative Development

```markdown
## Follow-Up Prompts (Iterate on Generated App)

After initial generation:
- "Add a settings page with profile photo upload"
- "Make the dashboard responsive for mobile"
- "Add real-time notifications using server-sent events"
- "Connect to Supabase instead of SQLite"
- "Add Stripe checkout for the premium plan"
- "Write tests for the API endpoints"
- "Fix the bug where the sidebar doesn't close on mobile"

Bolt understands the full context of the generated app.
Each prompt modifies the existing codebase, not starting over.
```

### Tech Stack Options

```markdown
## Supported Frameworks & Tools

Frontend: React, Vue, Svelte, Astro, Next.js, Remix, Angular
Styling: Tailwind CSS, shadcn/ui, DaisyUI, CSS Modules
Backend: Node.js, Hono, Express, Fastify
Database: SQLite (built-in), Supabase, Firebase, Prisma
Auth: Clerk, Supabase Auth, custom JWT
Deployment: Netlify, Vercel, Cloudflare Pages

## WebContainer
- Full Node.js runtime in the browser
- npm install works (most packages)
- File system, terminal, package manager
- No Docker, no local setup, no environment issues
```

## Installation

```markdown
# No installation — runs in the browser
# https://bolt.new

# Free tier: Limited generations
# Pro: $20/month (unlimited generations)
# Teams: Custom pricing
```

## Best Practices

1. **Be specific in prompts** — "Build a kanban board with drag-and-drop, 3 default columns, and local storage" beats "build a project tool"
2. **Iterate, don't restart** — Use follow-up prompts to add features; Bolt keeps full context of the generated app
3. **Specify the tech stack** — "Use React, Tailwind, and Supabase" prevents Bolt from making unexpected choices
4. **Prototype first** — Bolt excels at prototyping; export the code and refine in your IDE for production
5. **Database early** — Mention database needs upfront; adding persistence later requires more refactoring
6. **Mobile-first** — Ask for responsive design in the initial prompt; retrofitting is harder
7. **Export to GitHub** — Export the generated code to a GitHub repo; continue development in your regular workflow
8. **Combine with Cursor** — Generate the prototype in Bolt, export, then refine with Cursor for production quality
