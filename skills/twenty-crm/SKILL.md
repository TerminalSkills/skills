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
  version: "1.0.0"
  category: business
  tags: ["crm", "twenty", "sales", "customer", "open-source"]
---

# Twenty CRM

## Overview

Twenty is an open-source CRM shaped by the community — a modern alternative to Salesforce and HubSpot. It stores contacts, companies, and deals with customizable pipelines. The difference: it's fully open-source, self-hostable, has a powerful GraphQL/REST API, and supports custom objects (define your own data types). Built with React, Node.js, and PostgreSQL.

## When to Use

- Need a CRM without Salesforce pricing ($75-300/user/month)
- Want self-hosted CRM for data sovereignty
- Building custom CRM integrations via API
- Need custom objects beyond standard contacts/deals
- Small-to-medium sales team (1-50 users)

## Instructions

### Setup

```bash
# Docker Compose (recommended)
curl -fsSL https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docker/docker-compose.yml -o docker-compose.yml
docker compose up -d

# Access at http://localhost:3000
```

### GraphQL API

```typescript
// crm-client.ts — Interact with Twenty CRM via GraphQL
const TWENTY_URL = "http://localhost:3000/api/graphql";
const API_KEY = process.env.TWENTY_API_KEY;

async function graphql(query: string, variables?: Record<string, any>) {
  const res = await fetch(TWENTY_URL, {
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
      domainName
    }
  }
`, {
  input: {
    name: "Acme Corp",
    domainName: "acme.com",
    employees: 50,
    idealCustomerProfile: true,
  },
});

// Create a contact (person)
const person = await graphql(`
  mutation CreatePerson($input: PersonCreateInput!) {
    createPerson(data: $input) {
      id
      name { firstName lastName }
      email
    }
  }
`, {
  input: {
    name: { firstName: "Kai", lastName: "Chen" },
    email: "kai@acme.com",
    phone: "+1234567890",
    companyId: company.data.createCompany.id,
    jobTitle: "CTO",
  },
});

// Query deals pipeline
const deals = await graphql(`
  query GetDeals {
    opportunities(filter: { stage: { eq: NEGOTIATION } }) {
      edges {
        node {
          id
          name
          amount
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

```typescript
// rest-example.ts — REST API for simpler operations
// List all companies
const companies = await fetch("http://localhost:3000/api/rest/companies", {
  headers: { Authorization: `Bearer ${API_KEY}` },
}).then(r => r.json());

// Search contacts
const contacts = await fetch(
  "http://localhost:3000/api/rest/people?filter[email][contains]=acme.com",
  { headers: { Authorization: `Bearer ${API_KEY}` } }
).then(r => r.json());
```

### Custom Objects

```typescript
// custom-objects.ts — Define your own data types
// Create a custom "Support Ticket" object via API
const customObject = await graphql(`
  mutation CreateCustomObject {
    createOneObject(input: {
      nameSingular: "supportTicket"
      namePlural: "supportTickets"
      labelSingular: "Support Ticket"
      labelPlural: "Support Tickets"
      icon: "IconHeadset"
    }) {
      id
    }
  }
`);

// Add fields to the custom object
await graphql(`
  mutation AddField {
    createOneField(input: {
      objectId: "${customObject.data.createOneObject.id}"
      name: "priority"
      label: "Priority"
      type: SELECT
      options: [
        { value: "low", label: "Low", color: "green" },
        { value: "medium", label: "Medium", color: "yellow" },
        { value: "high", label: "High", color: "red" }
      ]
    }) { id }
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

- **GraphQL for complex queries** — relations, filters, nested data
- **REST for simple CRUD** — list, create, update operations
- **Custom objects** — don't force data into contacts/companies if it doesn't fit
- **Self-host for data sovereignty** — your data stays on your servers
- **API keys for integrations** — generate in Settings > API
- **Pipeline stages are customizable** — match your actual sales process
- **Webhooks for real-time sync** — trigger actions on record changes
- **Import via CSV** — bulk import from existing CRM/spreadsheets
- **PostgreSQL underneath** — can run custom queries if needed
- **Active community** — 25K+ GitHub stars, weekly releases
