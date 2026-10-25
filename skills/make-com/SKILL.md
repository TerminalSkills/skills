---
name: make-com
description: >-
  Make.com (formerly Integromat) is a visual automation platform that connects apps into scenarios of modules, routers, iterators and aggregators, without code. Use when the user wants to build or debug a Make scenario, map data between modules, call an API with the HTTP module, trigger a scenario from a webhook, or handle errors with Skip, Retry, Resume, Commit and Rollback error handlers.
license: Apache-2.0
compatibility: 'Browser-based; needs a Make account. Docs checked October 2026.'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: automation
  tags: "no-code, workflow, automation, integration, ipaas"
---

# Make.com — Visual Workflow Automation Platform

## Overview

Make runs scenarios: a trigger followed by modules that read or write data in apps. Each module outputs bundles (one record each) that later modules map into their fields. There is nothing to install; scenarios are built in the browser at make.com. Billing is in credits (a credit replaced the older "operation"; for ordinary app modules 1 operation is 1 credit, AI modules can cost more). Current prices are on make.com/en/pricing, so check them there instead of trusting a number in a skill.

Help center: https://help.make.com. Make API reference: https://developers.make.com.

## Instructions

### Building blocks

- **Trigger**: starts the scenario, either on a schedule (polling) or instantly through a webhook.
- **Module**: one action in one app (search rows, create a record, send a message).
- **Router**: splits the flow into routes; give each route a filter and set one fallback route for everything else.
- **Iterator**: turns an array into separate bundles (for example each attachment of an email).
- **Aggregator**: merges many bundles back into one (array, text, table).
- **Filter**: sits between two modules and lets only matching bundles continue.

### Mapping and functions

Values from earlier modules are inserted as `{{moduleNumber.field}}`; function arguments are separated by semicolons.

```text
{{1.email}}                                  email from module 1
{{2.data.amount}}                            nested field from module 2
{{formatDate(1.date; "YYYY-MM-DD")}}         format a date
{{if(1.status = "active"; "Yes"; "No")}}     conditional value
{{ifempty(1.phone; "n/a")}}                  fallback when empty
{{substring(1.name; 0; 50)}}                 characters from position 0 up to 50
{{length(1.items)}}                          number of items in an array
{{join(map(1.items; name); ", ")}}           join one key of an array
{{addDays(now; 7)}}                          date one week from now
```

Function groups: text (`replace`, `lower`, `upper`, `trim`, `split`, `md5`, `sha256`, `stripHTML`), math (`round`, `ceil`, `floor`, `min`, `max`, `average`, `formatNumber`), date (`formatDate`, `parseDate`, `addDays`, `addMonths`, `setHour`), array (`map`, `sort`, `slice`, `merge`, `distinct`, `contains`, `join`, `length`), general (`get`, `switch`, `ifempty`). There is no `parseJSON` function: use the **JSON > Parse JSON** module, or set "Parse response" in the HTTP module.

### Custom APIs: HTTP > Make a request

For apps without a Make integration, use the HTTP app (version 4). Choose an authentication type (API key, Basic Auth or OAuth 2.0) and store the secret in a keychain or connection in the **Credentials** field, rather than typing it in a header. Only HTTPS URLs work and self-signed certificates are rejected.

```text
Module:        HTTP > Make a request
Authentication: API key (keychain "Orders API key")
URL:           https://api.fulfillment.acme-shop.io/v2/orders
Method:        POST
Body content type: application/JSON
Request content:
  {
    "customer_email": "{{1.email}}",
    "total": {{1.total}}
  }
Parse response: Yes   (response becomes mappable fields for the next modules)
```

### Error handling

Right-click a module and add an error handler route. The handlers are:

- **Skip**: drop the failed bundle, continue with the next one; the run is marked successful.
- **Retry**: store the failed bundle as an incomplete execution and retry it automatically (set attempts and interval) or manually. Requires "Store incomplete executions" in scenario settings.
- **Resume**: replace the failed module's output with substitute data you define, and continue.
- **Commit**: stop the run and keep changes already made in transaction-capable (ACID) modules such as Data store or MySQL.
- **Rollback**: stop the run and revert those transaction-capable modules. Actions in apps without transactions (sending an email) cannot be undone.

Make also retries on its own with exponential backoff when a module returns `ConnectionError` or `ModuleTimeoutError`. Failed runs that were stored appear under **Incomplete executions**, where you can fix the data and rerun.

Scenario settings include **Process data in order**: it makes runs (webhooks too) finish one by one and pauses new runs until incomplete executions are resolved.

### Sharing and automation

Export a scenario as a **blueprint** (JSON) to share or import it into another account. **Data stores** hold state between runs (for example IDs already processed). The Make API (`Authorization: Token $MAKE_API_TOKEN`, token scopes set when you create it) can manage scenarios programmatically; see developers.make.com.

## Examples

### Example 1: Invoice approval pipeline

**User request:** "When an email with an invoice PDF arrives, save it to Drive and ask finance to approve anything over $1,000."

```text
Email app (Gmail or similar) > watch for new emails (filter: has attachment)
  -> Filter: subject contains "invoice"
  -> Iterator: array = the email's attachments
  -> Cloud storage app > upload the file
  -> an AI module extracts the invoice amount (returns 1850.00)
  -> Router
       Route 1, filter {{4.amount}} > 1000  -> Chat app > post a message to #finance
       Route 2 (fallback)                   -> Accounting app > create a bill
```

Module names differ per app; pick the matching module in each app's module list.
The Iterator makes one bundle per attachment, so the upload and AI modules run once per PDF.

### Example 2: Webhook that survives a flaky downstream API

**User request:** "Our shop sends orders to a Make webhook. If the CRM is down, don't lose the order."

```text
Webhooks > Custom webhook (copy the URL into the shop's webhook settings)
  -> HTTP > Make a request (POST to the CRM)
       error handler: Retry (3 attempts, every 15 minutes)
  -> Chat app > post a message
```

Turn on **Store incomplete executions** in scenario settings, then enable **Process data in order** if orders must reach the CRM in sequence. A failed order waits in Incomplete executions instead of being lost; when the CRM is back, Make retries it.

## Guidelines

- Pick the error handler by consequence: Skip when losing one record is acceptable, Retry for temporary outages, Rollback/Commit only around transaction-capable modules.
- Put filters as early as possible; every module that runs after a bad bundle costs credits.
- Do not paste API keys into module fields or headers; use keychains and connections.
- Treat webhook URLs as secrets, and validate what arrives (a filter on a required field).
- Use an Iterator only when a module returns an array you need item by item, and an Aggregator when a later module needs the items back together.
- Test with "Run once" and inspect each module's output bubble before activating the schedule.
- Make is not the right tool for heavy data transformation or very large file processing; call an API or a function for that.
