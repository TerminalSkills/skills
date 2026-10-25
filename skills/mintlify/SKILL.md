---
name: mintlify
description: >-
  Mintlify is a hosted documentation platform that turns MDX files and a docs.json config in a Git repository into a developer docs site with built-in search, an API playground generated from OpenAPI, and an AI assistant. Use this skill to create a documentation site, set up the mint CLI, write MDX pages with components, generate API reference pages from an OpenAPI spec, preview locally, validate and deploy; also to migrate an old mint.json project.
license: Apache-2.0
compatibility: 'Node.js 20.17+ for the mint CLI; a Mintlify account and a GitHub repository for deployment'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: content
  tags: "documentation, mintlify, docs, api-reference, mdx"
---

# Mintlify

## Overview

Mintlify builds a documentation site from a Git repository of `.mdx` pages plus one configuration file, `docs.json`. The CLI is the npm package `mint` (the old `mintlify` package is legacy: do not install it). Pushing to the connected branch deploys the site to `https://<subdomain>.mintlify.site`, and a custom domain can be added. Search, the AI assistant, analytics and the API playground are part of the hosted platform; the local preview shows the pages, and search needs `mint login`.

The configuration file used to be `mint.json`. Current projects use `docs.json`. If you find a `mint.json`, convert it to `docs.json` by hand against the `docs.json` schema (`"$schema": "https://mintlify.com/docs.json"` gives editor validation, and `mint validate` reports mistakes) instead of extending it.

## Instructions

### 1. Install the CLI and scaffold a project

```bash
node --version                      # needs v20.17.0 or newer
npm i -g mint
mint new acme-docs --name "Acme Billing" --theme mint     # non-interactive; scaffolds into acme-docs/
cd acme-docs
mint dev                            # preview on http://localhost:3000; add --port 3459 to change it
```

`mint dev` serves on localhost only unless you pass `--host`. Never use `mint new --force` in a folder with files you want to keep. Other commands: `mint validate` (strict build check, fails on warnings), `mint broken-links`, `mint a11y`, `mint format`, `mint update`, `mint status`.

### 2. Configure `docs.json`

This configuration was validated with `mint validate` (CLI 4.2.x). Pages are listed by path without extension.

```json
{
  "$schema": "https://mintlify.com/docs.json",
  "theme": "mint",
  "name": "Acme Billing",
  "colors": { "primary": "#0D9373", "light": "#07C983", "dark": "#0D9373" },
  "favicon": "/favicon.svg",
  "logo": { "light": "/logo/light.svg", "dark": "/logo/dark.svg" },
  "navigation": {
    "tabs": [
      {
        "tab": "Guides",
        "groups": [
          { "group": "Getting started", "pages": ["index", "quickstart"] },
          { "group": "Guides", "pages": ["guides/webhooks"] }
        ]
      },
      {
        "tab": "API reference",
        "groups": [
          { "group": "Overview", "pages": ["api-reference/introduction"] },
          { "group": "Invoices", "openapi": "api-reference/openapi.json" }
        ]
      }
    ]
  },
  "navbar": {
    "links": [{ "label": "Status", "href": "https://status.acme-billing.io" }],
    "primary": { "type": "button", "label": "Dashboard", "href": "https://app.acme-billing.io" }
  },
  "footer": { "socials": { "github": "https://github.com/mintlify" } }
}
```

`logo.href` and the `href` of `navbar` links and buttons accept absolute URLs or paths that start with `/`; an outdated CLI rejects relative paths with `Must be a valid url`, so run `mint update`.

### 3. Write pages in MDX

Each page starts with `title` and `description` frontmatter. Built-in components include `<Note>`, `<Warning>`, `<Tip>`, `<Steps>`/`<Step>`, `<CodeGroup>`, `<Card>`, `<ParamField>` and `<ResponseExample>`.

````mdx
---
title: "Webhooks"
description: "Receive invoice events"
---

<Steps>
  <Step title="Add an endpoint">Register `https://shop.acme-billing.io/hooks` in the dashboard.</Step>
  <Step title="Verify the signature">Reject requests whose signature does not match.</Step>
</Steps>

<CodeGroup>
```bash npm
npm install @acme-billing/sdk
```
```bash pnpm
pnpm add @acme-billing/sdk
```
</CodeGroup>

<Card title="API reference" icon="code" href="/api-reference/introduction">Explore endpoints</Card>
````

### 4. API reference

Preferred: put an OpenAPI 3 file in the repo and reference it from navigation with `"openapi": "api-reference/openapi.json"` (every endpoint becomes a page with a playground), or list endpoints (`"GET /v1/invoices"`) under `pages` to choose some. Check the spec with `mint validate`. The playground uses the spec's `servers` and `security`.

For a small API, write endpoint pages by hand. Configure the server and auth once, then give each page an `api` frontmatter field (a relative path needs the `server` value):

```json
{ "api": { "mdx": { "server": "https://api.acme-billing.io/", "auth": { "method": "bearer" } } } }
```

```mdx
---
title: "Create invoice"
api: "POST /v1/invoices"
---

<ParamField body="customer_id" type="string" required>Customer to bill</ParamField>
<ParamField body="amount" type="integer" required>Amount in cents</ParamField>
```

### 5. Deploy

`mint login` (existing account) or `mint signup`, connect the GitHub repository in the browser, then push to the production branch. `mint status` shows the subdomain. Run `mint validate` and `mint broken-links` before every push (they work offline).

## Examples

### Example 1: Document a REST API from its OpenAPI spec

Request: "Generate documentation for our billing API from openapi.yaml."

Run `mint new billing-docs --name "Acme Billing" --theme mint`, copy the spec to `billing-docs/api-reference/openapi.yaml`, add a group with `"openapi": "api-reference/openapi.yaml"` to the navigation, run `mint validate`, then `mint dev --port 3459`. Result: validation prints `success build validation passed` and the preview has one page per endpoint with a request playground.

### Example 2: Product docs with a quickstart and guides

Request: "Set up docs for our SaaS: quickstart, two guides and an API reference tab."

Scaffold with `mint new`, write `quickstart.mdx` and `guides/*.mdx` using `<Steps>` and `<CodeGroup>`, define two `tabs` in `docs.json` as in step 2, and run `mint broken-links`. Result: `success no broken links found`, with Guides and API reference tabs in the top navigation.

## Guidelines

- Treat `docs.json` as the source of truth for navigation: a page that exists as a file but is missing from `navigation` is not shown.
- `mint validate` runs in strict mode; fix warnings rather than ignoring them.
- Do not publish real API keys in examples; use environment variable names such as `ACME_BILLING_API_KEY`.
- Hand-written endpoint pages drift from the real API; prefer OpenAPI generation for anything larger than a few endpoints.
- Do not run `mint dev` on a port another project uses; pick one with `--port`.
- Mintlify is a hosted service. If you need a fully self-hosted site, use a static generator such as Docusaurus (`mint export` produces an offline zip for air-gapped viewing).
