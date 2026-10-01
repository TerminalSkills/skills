---
name: retool
description: >-
  Retool is a platform for building internal tools — admin panels, dashboards and CRUD apps — on top of your own databases and APIs. Use when a user asks to build or edit a Retool app, drive the Retool CLI (retool init, check, push, publish) from a coding agent, write queries and {{ }} bindings in a classic app, automate jobs with Retool Workflows, or self-host Retool with Docker or Helm.
license: Apache-2.0
compatibility: "Retool Cloud or self-hosted Retool 4.x. The Retool CLI needs Node.js 22, git, pnpm and an organization on a paid plan."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["internal-tools", "low-code", "admin-panel", "dashboard", "crud"]
---
# Retool — Build Internal Tools Fast

## Overview

Retool connects to databases and APIs through governed **resources** and puts an internal UI on top of them. It now has two kinds of apps:

- **Apps** (the new app builder, recommended by Retool): React 19 + TypeScript source with shadcn/ui, Tailwind, TanStack Table and Recharts. Data access goes through serverless **functions**. They are written by prompting Retool's agent in the browser, or locally with the **Retool CLI** and a coding agent.
- **Classic apps**: the original drag-and-drop editor — a tree of Retool components, resource queries and `{{ }}` expressions. Still supported, no longer where new development happens.

Both share resources, permissions, **Workflows** (scheduled or webhook-triggered automation) and Source Control. Retool is closed-source; self-hosting requires a license key.

## Instructions

### Build an app with the Retool CLI

```bash
pnpm i -g @tryretool/cli                      # installs the `retool` launcher
retool auth login --host https://northwind.retool.com        # opens a browser (OAuth)
retool auth login --device --host https://northwind.retool.com   # headless: prints a code + URL
retool skill install                          # installs the `retool-ready` skill for Claude Code, Codex, Cursor

retool init --dir ~/apps/refunds-dashboard    # new app + local scaffold; must be OUTSIDE any git repo
cd ~/apps/refunds-dashboard && pnpm install   # required, `retool check` cannot typecheck without it
retool start                                  # watch mode: re-validates on every save; runs until Ctrl-C, so use a second terminal
retool check                                  # one-shot: hooks, validate, typecheck, build (local, no login needed)
retool push -m "Add refunds table" --wait     # validates, pushes, prints a preview URL
retool publish --identifier refunds-dashboard # first publish names the live URL
```

Existing apps: `retool apps` lists names and UUIDs, `retool clone 7c1d2e9a-4b63-4f0e-9d1a-2f6b8c0e5a11` downloads one (apps only, not classic apps), `retool pull` fast-forwards a checkout, `retool checkout` switches branch. In CI, create an access token with the `react_apps:write` scope and export it as `RETOOL_TOKEN` (plus `RETOOL_HOST`) before `retool auth login`.

### App code shape

```
backend/<area>/<entry>.ts        serverless functions, one `export default async` handler per file
backend/resources/               generated resource type declarations (read-only)
frontend/pages/*.tsx             page components
frontend/hooks/backend/<area>.ts generated use<Fn> hooks (read-only, rebuilt by `retool check`)
frontend/lib/shadcn/             shadcn/ui components (read-only, wrap them instead of editing)
frontend/App.tsx                 routes — write this last
```

```ts
// backend/refunds/listRefunds.ts — resource clients are ambient globals, never imported
export default async function listRefunds({ params }: { params: { status: string } }) {
  return retoolDb.query(
    'SELECT id, customer_email, amount_cents, status FROM refunds WHERE status = $1 ORDER BY created_at DESC LIMIT 100',
    [params.status],
  )
}
```

```tsx
// frontend/pages/Refunds.tsx
import { useEffect } from 'react'
import { useListRefunds } from '../hooks/backend/refunds'

export default function Refunds() {
  const { data, loading, error, trigger } = useListRefunds()
  useEffect(() => { trigger({ status: 'pending' }) }, [])
  if (loading) return <div>Loading…</div>
  if (error) return <div>Error: {error}</div>
  return <ul>{data?.map((r) => <li key={r.id}>{r.customer_email} — {r.amount_cents / 100}</li>)}</ul>
}
```

The names of resource globals (`retoolDb` is Retool Database) come from the `.d.ts` files under `backend/resources/`. To look at real data before writing code: `echo "return retoolDb.query('SELECT * FROM refunds LIMIT 5')" | retool resource explore` (read-only unless `--allow-mutative`). The trusted user identity is `req.user` inside a backend function, not anything the frontend sends.

### Connect Data Sources (classic apps)

A resource holds the connection and credentials (PostgreSQL, MySQL, MongoDB, BigQuery, Snowflake, REST, GraphQL, gRPC, Stripe, Slack, S3 and more). Queries run server-side; results are available as `{{ queryName.data }}`.

```sql
-- usersQuery (PostgreSQL resource). {{ }} values become prepared-statement parameters.
SELECT u.id, u.email, u.name, u.plan, u.created_at,
       COUNT(o.id) AS order_count, SUM(o.amount) AS total_spent,
       (ARRAY_AGG(o.stripe_charge_id ORDER BY o.created_at DESC))[1] AS last_charge_id
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.plan = {{ planFilter.value }}
  AND u.email ILIKE {{ '%' + searchInput.value + '%' }}
GROUP BY u.id
ORDER BY total_spent DESC
LIMIT {{ table1.pagination.pageSize }} OFFSET {{ table1.pagination.offset }}
```

```
refundQuery (REST API resource with base URL https://api.stripe.com/v1 — the API key lives in the resource)
POST /refunds
Body: charge={{ table1.selectedRow.last_charge_id }}  amount={{ refundAmount.value * 100 }}  reason={{ reason }}
Run behavior: Manual. Confirmation enabled (requireConfirmation) with the message
  "Refund {{ refundAmount.value }} to {{ table1.selectedRow.email }}?"
```

SQL results are column-oriented objects; wrap them with `formatDataAsArray(usersQuery.data)` when code needs an array of rows. A transformer attached to a query reshapes `query.data` (the untouched response stays in `query.rawData`); transformers are read-only and cannot trigger queries or set component values.

### Components and Bindings (classic apps)

Component properties are set in the Inspector, with `{{ }}` for anything dynamic — for example Hidden: `{{ table1.selectedRow?.plan === 'free' }}`, Disabled: `{{ !emailInput.value.includes('@') || amountInput.value <= 0 }}`. Imperative logic goes into a JavaScript query attached to an event handler:

```javascript
// handleRefund — JavaScript query, run by the "Process refund" button's Click handler
const row = table1.selectedRow;
if (!row) {
  utils.showNotification({ title: "Select a row first", notificationType: "warning" });
  return;
}
refundQuery.trigger({
  additionalScope: { reason: reasonSelect.value },      // readable as {{ reason }} inside refundQuery
  onSuccess: () => {
    utils.showNotification({ title: "Refund processed", body: row.email, notificationType: "success", duration: 4 });
    usersQuery.trigger();                               // refresh the table
  },
  onFailure: (error) => {
    utils.showNotification({ title: "Refund failed", body: String(error), notificationType: "error" });
  },
});
```

`query.trigger()` also returns a promise that resolves to the query's data (`const rows = await usersQuery.trigger()`). It works only in JavaScript queries, not in transformers or `{{ }}`.

### Custom Components

- **Apps**: ask the agent to add a public npm package; it requests approval before installing. Retool only accepts packages at least 5 days old under a permissive license (MIT, Apache-2.0, BSD, ISC and similar); private packages are not supported.
- **Classic apps**: build a custom component library in React. Clone `https://github.com/tryretool/custom-component-collection-template`, then `npm install`, `npx retool-ccl login` (access token with Custom Component Libraries read+write), `npx retool-ccl init`, `npx retool-ccl dev`. Properties are declared with hooks such as `Retool.useStateString({ name: "name" })` and show up in the Inspector.

### Workflows (Backend Automation)

A workflow is a graph of blocks (Resource query, Code in JavaScript or Python, Branch, Loop, Filter, Wait, Response) that starts at `startTrigger`. Any block can read an earlier block's output as `blockName.data`.

```javascript
// Code block "buildReminders" — runs after the resource-query block "expiringTrials"
return expiringTrials.data.map((user) => ({
  to: user.email,
  name: user.name,
  daysLeft: Math.ceil((new Date(user.trial_ends_at) - Date.now()) / 86400000),
}));
// A Loop block over {{ buildReminders.data }} then runs a SendGrid or Retool Email query per item.
```

Triggers are a schedule (interval or cron, with a timezone) or a webhook. Webhook calls must be JSON; the payload is `startTrigger.data`, headers are `startTrigger.headers`:

```bash
curl -X POST "https://api.retool.com/v1/workflows/6f1c0f1e-2a57-4f6b-9a1e-0c7d3b9e8a42/startTrigger" \
  -H "Content-Type: application/json" \
  -H "X-Workflow-Api-Key: $RETOOL_WORKFLOW_API_KEY" \
  -d '{"invoice_id": "in_1Q8fX2", "status": "paid"}'
```

### Self-hosted deployment

```bash
# Docker Compose — for evaluation only; Retool documents Kubernetes for production
git clone https://github.com/tryretool/retool-onpremise.git && cd retool-onpremise
# pin the same stable tag (for example 4.34.5-stable) for every image in Dockerfile, then:
./install.sh                    # generates docker.env including ENCRYPTION_KEY — back that key up
# set LICENSE_KEY, BASE_DOMAIN (and COOKIE_INSECURE=true while there is no TLS) in docker.env
sudo docker compose up -d       # UI at http://localhost:3000/auth/signup

# Kubernetes
helm repo add retool https://charts.retool.com
helm install my-retool retool/retool -f values.yaml     # set config.licenseKey and image.tag
```

## Examples

### Example 1: Build and publish a refunds dashboard from the terminal

User: "Create a Retool app that lists pending refunds from our Retool Database and lets support approve them. Publish it."

```bash
retool auth status                                   # confirm the signed-in host
retool init --dir ~/apps/refunds-dashboard --name "Refunds Dashboard"
cd ~/apps/refunds-dashboard && pnpm install
echo "return retoolDb.query('SELECT * FROM refunds LIMIT 5')" | retool resource explore
# write backend/refunds/listRefunds.ts and approveRefund.ts, then frontend/pages/Refunds.tsx, then App.tsx
retool check
retool push -m "Add pending refunds table with approve action" --wait
retool publish --identifier refunds-dashboard        # blocked: lists approveRefund, the only writing function, as needing approval
retool publish --identifier refunds-dashboard --approve-functions   # after reading approveRefund.ts
```

`retool check` runs four phases (`hooks`, `validate`, `typecheck`, `build`) and exits non-zero when one fails or cannot run (for example before `pnpm install`). `push --wait` ends with the preview URL to hand to the user. `publish` stays blocked until every function that writes data is approved — read each listed function, then approve them all with `--approve-functions`, or one at a time with `--approve-function` and the path copied from the blocked output — and then prints the live URL.

### Example 2: Add a guarded refund action to a classic app

User: "In our classic support app, add a Refund button that refunds the selected customer's latest charge through Stripe, asks for confirmation, and reloads the table."

1. Create `refundQuery` as shown above, with Run behavior set to Manual and the confirmation message enabled.
2. Create the `handleRefund` JavaScript query from the Components section.
3. Add a Button, set Disabled to `{{ !table1.selectedRow || table1.selectedRow.plan === 'free' }}`, and add a Click event handler that runs `handleRefund`.

Clicking the button shows "Refund 49 to dana.ruiz@northwind.io?"; after confirming, a green "Refund processed" notification appears and `usersQuery` re-runs to refresh the table.

## Guidelines

1. **Pick the builder first** — new work goes into apps (React); use classic patterns (`{{ }}`, `utils`, `query.trigger`) only inside an existing classic app. The two do not share code, and `retool clone` cannot fetch a classic app.
2. **Never scaffold inside a repository** — `retool init` refuses to run inside a git repo because `push` and `publish` drive the app's own git history. Use a standalone directory.
3. **`retool check` is the source of truth** — strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, unused locals are errors). Frontend and backend compile separately, so share data through the generated `use<Fn>` hooks, never by importing across them.
4. **Function limits** — 60 s timeout, 10 MB input, 200 MB memory, 100 runs per minute per user. Long jobs belong in a workflow.
5. **Prepared statements stay on** — `{{ }}` in SQL is a bound value, so it cannot stand in for a table or column name. Disabling prepared statements on the resource reopens SQL injection.
6. **Secrets live in resources** — keep API keys in the resource configuration or in secret configuration variables (`{{ environment.variables.STRIPE_KEY }}` in a resource). Secret variables are not readable from apps or queries.
7. **Hiding a button is not access control** — restrict the resource and the app with permission groups (Use / Edit / Own).
8. **Webhook URLs are credentials** — anyone holding the URL and key can start the workflow. Send the key in the `X-Workflow-Api-Key` header, not the query string, and rotate it from the trigger panel.
9. **Two CLIs share the name `retool`** — `@tryretool/cli` is the current one; the older `retool-cli` package (Classic CLI) is deprecated and is removed from cloud on March 1, 2027.
10. **Self-hosting is heavy** — the Docker tutorial asks for a Linux x86 VM with 8 vCPUs and 64 GiB RAM, needs outbound access to Retool's licensing endpoints, and every image must run the same version tag. Losing `ENCRYPTION_KEY` means reconfiguring every resource.
