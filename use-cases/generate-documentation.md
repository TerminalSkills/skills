---
title: "Automate Documentation Generation and Slash Onboarding Time"
slug: generate-documentation
description: "Generate comprehensive README files, API documentation, and developer guides by analyzing codebases to accelerate team onboarding."
skills: [markdown-writer, code-documenter, github]
category: development
tags: [documentation, readme, api-docs, onboarding, automation]
---

# Automate Documentation Generation and Slash Onboarding Time

## The Problem

Marcus, engineering lead at a 28-person fintech startup, watches new developers struggle for weeks to understand their codebase. 43 microservices, 12 different API patterns, zero comprehensive documentation. The README files are either empty or hopelessly outdated. New hires spend their first 3 weeks asking the same questions: "How do I run this locally?" "What does this endpoint expect?" "Who owns the auth service?"

The onboarding crisis is expensive. Average time to first meaningful contribution: 18 days. Senior engineers spend 4.5 hours weekly answering documentation questions instead of building features. Recent estimates: $47,000 in lost productivity per new hire. With 8 planned hires this year, poor documentation will cost $376,000 in delayed productivity.

Code knowledge lives entirely in developers' heads. When Sarah (auth service owner) took vacation, the team spent 6 hours debugging an OAuth integration because no one understood the configuration flow. Critical deployment procedures exist only as Slack threads. API consumers guess at request formats, causing 23% more support tickets. The technical debt is crushing team velocity.

## The Solution

Combine **markdown-writer** for structured documentation, **code-documenter** for API analysis, and **github** for repository integration. The approach: analyze codebase structure, extract API definitions, interview existing docs, and generate comprehensive, maintainable documentation.

```bash
npx terminal-skills install markdown-writer code-documenter github
```

## Step-by-Step Walkthrough

### 1. Codebase analysis and documentation audit

```
Analyze our entire codebase across 43 services. Generate a comprehensive README for each service and a master architecture guide.
```

```
CODEBASE ANALYSIS COMPLETE:

Service Discovery (43 repositories):
  Authentication Service → Node.js/Express, 23 endpoints, OAuth2/JWT
  Payment Processing → Python/FastAPI, 31 endpoints, Stripe integration  
  User Management → Go/Gin, 18 endpoints, PostgreSQL + Redis
  Notification Engine → Node.js, 12 endpoints, WebSocket + Email
  ... (39 more services catalogued)

Documentation Gaps Identified:
  📝 Empty READMEs: 31 services (72%)
  📝 Outdated setup instructions: 8 services (references old dependencies)
  📝 Missing API documentation: 41 services (95%)
  📝 No deployment guides: 43 services (100%)
  📝 Zero architecture overviews: Master documentation missing

PRIORITY QUEUE: Start with auth service (most dependencies), payment (regulatory), user management (core)
```

### 2. Intelligent API documentation extraction

```
Extract all API endpoints, analyze request/response schemas, and generate OpenAPI documentation with examples.
```

```
API DOCUMENTATION GENERATED:

Authentication Service (23 endpoints):
  POST /auth/login
    Request: { email: string, password: string, mfa_code?: string }
    Response: { token: string, refresh: string, expires: number }
    Curl: curl -X POST /auth/login -d '{"email":"user@example.com","password":"pass123"}'
    
  GET /auth/profile
    Headers: Authorization: Bearer {token}
    Response: { id: string, email: string, roles: string[], created: date }
    
  ... (21 more endpoints documented)

Payment Processing Service (31 endpoints):
  POST /payments/charge → Stripe integration, idempotency handling
  GET /payments/history → Paginated, supports filtering by user/date
  POST /payments/refund → Admin-only, requires approval workflow
  
Validation Results:
  ✓ 100% of endpoints extracted correctly
  ✓ Schema validation: 94% of types inferred accurately
  ✓ Example generation: Valid curl commands for all endpoints
  ✓ Error codes documented: 4xx/5xx responses with descriptions
```

### 3. Comprehensive README generation

```
Create detailed README files for each service including setup, configuration, testing, and deployment instructions.
```

```
README GENERATION RESULTS:

Authentication Service README.md (Generated):
# Authentication Service

High-performance JWT-based authentication with MFA support.

## Quick Start
```bash
npm install
cp .env.example .env  # Configure your secrets
docker-compose up postgres redis
npm run dev  # Starts on port 3001
```

## Configuration
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| JWT_SECRET | ✓ | - | Token signing secret |
| MFA_ISSUER | - | CompanyAuth | TOTP issuer name |
| REDIS_URL | ✓ | redis://localhost:6379 | Session store |

## API Documentation
- `POST /auth/login` - User authentication
- `GET /auth/profile` - Get user details
- [Full API Reference](./API.md)

## Testing
```bash
npm test              # Unit tests
npm run test:integration  # Integration tests with DB
npm run test:load     # Load testing (100 req/s)
```

## Deployment
Deployed via GitHub Actions on merge to main. See [deployment guide](./DEPLOY.md).

TEMPLATE APPLIED TO ALL 43 SERVICES: Consistent structure, auto-updated dependencies, working examples
```

### 4. Master architecture documentation

```
Create a system-wide architecture guide showing service relationships, data flows, and integration patterns.
```

```
ARCHITECTURE GUIDE GENERATED:

System Overview Created:
  📊 Service Dependency Graph → Visual map of 43 services + relationships
  📊 Data Flow Diagrams → Request routing through auth → user → payment pipeline  
  📊 Infrastructure Layout → Docker services, databases, message queues
  📊 API Gateway Configuration → Rate limiting, authentication, routing rules

Key Documentation Sections:
  1. Service Directory → Quick reference: what each service does, who owns it
  2. Getting Started Guide → Clone, configure, run entire stack in 10 minutes
  3. Development Workflow → Branch strategy, testing requirements, deployment
  4. Troubleshooting Guide → Common issues + solutions from 180 resolved tickets
  5. Security Guidelines → Auth patterns, API security, data handling requirements

Integration Patterns Documented:
  ✓ Service-to-service auth: JWT propagation, service accounts
  ✓ Database patterns: Event sourcing, CQRS, shared vs service-owned
  ✓ Error handling: Circuit breakers, retry logic, graceful degradation
  ✓ Monitoring: Logging standards, metrics, alerting configuration
```

### 5. Automated documentation maintenance

```
Set up GitHub Actions to automatically update documentation when code changes, and validate examples still work.
```

```
DOCUMENTATION CI/CD PIPELINE:

GitHub Actions Workflows Created:
  📋 docs-update.yml → Regenerate API docs on code push
  📋 example-validation.yml → Test all curl examples in docs  
  📋 readme-sync.yml → Update service lists in master architecture
  📋 broken-link-checker.yml → Verify all internal documentation links

Automation Features:
  ✓ API changes → Auto-update OpenAPI specs + README examples
  ✓ New dependencies → Update installation instructions
  ✓ Service additions → Add to architecture overview automatically
  ✓ Dead link detection → Weekly scan, create GitHub issues for fixes

Documentation Health Dashboard:
  📊 Coverage: 100% services documented (up from 28%)
  📊 Freshness: All docs updated within 7 days of code changes
  📊 Quality: 97% of examples tested and working
  📊 Usage: 156 page views/week (devs actually using docs!)
```

## Real-World Example

The CTO of a 40-person SaaS company inherited a nightmare: 67 microservices, documentation scattered across wikis, Notion, and random README files. New engineers took 4 weeks to make their first contribution. Senior developers spent 30% of their time answering "How does X work?" questions.

Thursday: code-documenter analyzed the entire codebase, discovering 847 API endpoints across all services. Many undocumented features, some services with zero external documentation. Generated comprehensive API docs with working examples for every endpoint.

Friday: markdown-writer created consistent README files for all services. Installation instructions that actually worked, configuration tables, testing commands, deployment guides. Architecture overview showing how everything connected.

Monday: New hire Elena started. Using the new documentation, she had the entire development environment running in 47 minutes (previous record: 3 days). By day 3, she'd shipped her first feature. Time to first contribution: 72% reduction.

Results after 2 months: Onboarding time dropped from 4 weeks to 5 days. Senior developer "documentation support" hours dropped 85%. Support ticket volume related to integration confusion decreased 67%. The team estimated they reclaimed 2.3 full-time equivalent hours weekly for actual development work.

## Related Skills

- [markdown-writer](../skills/markdown-writer/) — Generate structured documentation in Markdown format
- [code-documenter](../skills/code-documenter/) — Analyze codebases and extract API documentation automatically
- [github](../skills/github/) — Automate documentation updates and integrate with GitHub workflows