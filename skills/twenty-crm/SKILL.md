---
name: twenty-crm
description: >-
  Build custom CRM workflows with Twenty — open-source CRM alternative to
  Salesforce. Use when someone asks to "set up a CRM", "Twenty CRM",
  "open-source Salesforce alternative", "customer relationship management",
  "self-hosted CRM", or "CRM with API access". Covers contacts, companies,
  pipelines, custom objects, automations, and API integration.
license: Apache-2.0
compatibility: "Self-hosted (Docker) or cloud. REST + GraphQL API. TypeScript."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: ["crm", "twenty", "sales", "customer", "open-source"]
  repository: https://github.com/twentyhq/twenty
---

# Twenty CRM

## Overview

Twenty is an open-source CRM shaped by the community — a modern alternative to Salesforce and HubSpot. It stores contacts, companies, and deals with customizable pipelines. The difference: it's fully open-source, self-hostable, has a powerful GraphQL/REST API, and supports custom objects (define your own data types). Built with React, Node.js, and PostgreSQL.

## When to Use

- Need a CRM without per-seat Salesforce pricing
- Want self-hosted CRM for data sovereignty
- Building custom CRM integrations via API
- Need custom objects beyond standard contacts/deals
- Small-to-medium sales team (1-50 users)

## Instructions

### Setup (self-hosted, Docker Compose)

```bash
# Download the compose file and the example env
base=https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docker
curl -fsSL $base/docker-compose.yml -o docker-compose.yml
curl -fsSL $base/.env.example -o .env

# Edit .env: uncomment and set these three
#   ENCRYPTION_KEY         -> generate with: openssl rand -base64 32
#   PG_DATABASE_PASSWORD   -> a strong password (no special characters)
#   SERVER_URL             -> http://localhost:3000 locally, your domain in prod
docker compose up -d

# First run creates the schema; open http://localhost:3000 and create the first account
```

### GraphQL API

The core GraphQL endpoint is `/graphql` (no `/api` prefix). `emails`, `phones`,
and `domainName` are composite fields — write them as nested objects, not
scalars.

```typescript
// crm-client.ts — Interact with Twenty CRM via GraphQL
const TWENTY_URL = "http://localhost:3000/graphql";
const API_KEY = process.env.TWENTY_API_KEY;

async function graphql(query: string, variables?: Record<string, any>, url = TWENTY_URL) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

// Create a company
const company = await graphql(`
  mutation CreateCompany($input: CompanyCreateInput!) {
    createCompany(data: $input) {
      id
      name
      domainName { primaryLinkUrl }
    }
  }
`, {
  input: {
    name: "Riverside Labs",
    domainName: { primaryLinkUrl: "https://riverside.io" },
  },
});

// Create a contact (person) — emails/phones are composite
const person = await graphql(`
  mutation CreatePerson($input: PersonCreateInput!) {
    createPerson(data: $input) {
      id
      name { firstName lastName }
      emails { primaryEmail }
    }
  }
`, {
  input: {
    name: { firstName: "Kai", lastName: "Chen" },
    emails: { primaryEmail: "kai@riverside.io" },
    phones: { primaryPhoneNumber: "4155550142", primaryPhoneCallingCode: "+1" },
    companyId: company.data.createCompany.id,
    jobTitle: "CTO",
  },
});

// Query deals pipeline (stages are workspace-defined; the defaults are
// NEW, SCREENING, MEETING, PROPOSAL, CUSTOMER)
const deals = await graphql(`
  query GetDeals {
    opportunities(filter: { stage: { in: [SCREENING, PROPOSAL] } }) {
      edges {
        node {
          id
          name
          amount { amountMicros currencyCode }
          stage
          closeDate
          company { name }
          pointOfContact { name { firstName lastName } }
        }
      }
    }
  }
`);
```

### REST API

The core REST endpoint is `/rest` (no `/api` prefix). Filters use
`?filter=field[comparator]:value`; comparators include `eq`, `neq`, `in`,
`gt`/`gte`/`lt`/`lte`, `like`, `ilike`, `is`, `startsWith`, `endsWith`. Combine
with `and(...)`, `or(...)`, `not(...)`. Other params: `order_by`, `limit`,
`depth` (0 or 1), and the cursors `starting_after` / `ending_before`.

```typescript
// rest-example.ts — REST API for simpler operations
const base = "http://localhost:3000/rest";
const headers = { Authorization: `Bearer ${API_KEY}` };

// List companies, newest first
const companies = await fetch(
  `${base}/companies?order_by=createdAt[DescNullsLast]&limit=20`,
  { headers }
).then(r => r.json());

// Search people by email domain (composite field, % is URL-encoded as %25)
const contacts = await fetch(
  `${base}/people?filter=emails.primaryEmail[ilike]:%25@riverside.io`,
  { headers }
).then(r => r.json());
```

### Custom Objects

Custom objects and fields are defined through the **Metadata API** at a
separate `/metadata` endpoint, or in Settings → Data model. The input is
wrapped in `object:` / `field:`, and SELECT option values must be UPPER_CASE.

```typescript
// custom-objects.ts — Define your own data types via the Metadata API
const graphqlMetadata = (query: string) =>
  graphql(query, undefined, "http://localhost:3000/metadata");

// Create a custom "Support Ticket" object
const customObject = await graphqlMetadata(`
  mutation CreateCustomObject {
    createOneObject(input: { object: {
      nameSingular: "supportTicket"
      namePlural: "supportTickets"
      labelSingular: "Support Ticket"
      labelPlural: "Support Tickets"
      icon: "IconHeadset"
    } }) {
      id
    }
  }
`);

// Add a SELECT field to the object (objectMetadataId ties it to the object)
await graphqlMetadata(`
  mutation AddField {
    createOneField(input: { field: {
      objectMetadataId: "${customObject.data.createOneObject.id}"
      name: "priority"
      label: "Priority"
      type: SELECT
      options: [
        { value: "LOW", label: "Low", color: "green", position: 0 },
        { value: "MEDIUM", label: "Medium", color: "yellow", position: 1 },
        { value: "HIGH", label: "High", color: "red", position: 2 }
      ]
    } }) { id }
  }
`);
```

## Examples

### Example 1: Set up CRM for a sales team

**User prompt:** "Set up a CRM for our 10-person sales team. We need contacts, companies, deal pipeline, and activity tracking."

The agent will deploy Twenty via Docker, configure the sales pipeline stages, import existing contacts, and set up team access.

### Example 2: Integrate CRM with existing tools

**User prompt:** "Sync our CRM contacts with our app's user database and send Slack notifications on deal stage changes."

The agent will use Twenty's GraphQL API to sync contacts, set up webhooks for deal events, and forward notifications to Slack.

## Guidelines

- **No `/api` prefix** — core API is `/rest` and `/graphql`; metadata is `/metadata`
- **GraphQL for complex queries** — relations, filters, nested data
- **REST for simple CRUD** — list, create, update operations
- **Composite fields** — `emails`, `phones`, `domainName`, and `amount` are objects, not scalars; write and read their sub-fields (`primaryEmail`, `primaryLinkUrl`, `amountMicros`)
- **Custom objects** — use the Metadata API at `/metadata`; don't force data into contacts/companies if it doesn't fit
- **Self-host for data sovereignty** — your data stays on your servers
- **API keys** — Settings → APIs & Webhooks → Create key; the token is shown once
- **Pipeline stages are customizable** — match your actual sales process
- **Webhooks for real-time sync** — trigger actions on record changes
- **Import via CSV** — bulk import from existing CRM/spreadsheets
- **PostgreSQL underneath** — can run custom queries if needed
- **Actively developed** — open-source, with frequent releases
