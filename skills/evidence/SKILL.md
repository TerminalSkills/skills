---
name: evidence
description: >-
  Evidence is a BI framework that builds interactive data reports and dashboards
  from SQL and Markdown, developed as code in Git. Use when creating or editing
  Evidence reports, writing SQL blocks and charts in Markdown, connecting a warehouse,
  running the Evidence CLI, self-hosting a project, or migrating an older
  Evidence project (npm, Svelte-style components) to the current version.
license: Apache-2.0
compatibility: 'Evidence CLI 0.11 on macOS, Linux (x64/arm64) or Windows x64; an Evidence Studio account or a Snowflake/BigQuery connection.yaml'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/evidence-dev/evidence
  tags: "bi, dashboards, sql, markdown, reporting"
---

# Evidence — Code-Driven BI Reports

## Overview

Evidence turns Markdown files with SQL code fences and chart tags into published reports. **It has changed completely since early 2026.** The older open-source framework (`npx degit evidence-dev/template`, `npm run dev`, Svelte tags such as `<LineChart data={orders} />`, `sources/` folders, DuckDB in the browser, `npm run build`) is now called *legacy*: the `template` repository's npm scripts print deprecation messages, and the last `@evidence-dev/evidence` release (40.1.8) is from February 2026. Current Evidence uses the **Evidence CLI** (a standalone binary, version 0.11.1 today), **Markdoc** component syntax, server-side SQL, and live queries with no build step. Do not write legacy syntax for new work. Docs: https://docs.evidence.dev.

## Instructions

### Install the CLI (verify the checksum)

The official one-liner pipes a script into a shell. Prefer downloading the binary and checking it against the checksum Evidence publishes next to it (Linux x64 shown; use `darwin-arm64`, `darwin-x64`, `linux-arm64` or `windows-x64` as needed):

```bash
mkdir -p ~/.local/bin && cd ~/.local/bin || exit 1
curl -fsSL -o version.json https://gaamozau3jchzs3r.public.blob.vercel-storage.com/cli/version.json
URL=$(python3 -c "import json;print(json.load(open('version.json'))['binaries']['linux-x64'])")
SUM=$(python3 -c "import json;print(json.load(open('version.json'))['checksums']['linux-x64'])")
curl -fsSL -o evidence "$URL" && echo "$SUM  evidence" | sha256sum -c - && chmod +x evidence
./evidence version      # 0.11.1
```

On macOS use `shasum -a 256 -c -` instead of `sha256sum -c -`. `evidence upgrade` updates later. Set `EVIDENCE_TELEMETRY_DISABLED=1` to turn off anonymous usage telemetry.

### Create a project and the loop

```bash
evidence init shop-reports       # writes pages/, evidence.config.yaml, theme.yaml, access.yaml, AGENTS.md
cd shop-reports
evidence login                   # opens a browser; uses your Studio organization's data connection
evidence tables                  # list tables, including the demo.* sample data
evidence describe demo.daily_orders
evidence dev                     # local preview, default port 3000 (--port to change)
evidence validate                # checks Markdown and component syntax; run it before every commit
```

Pages are Markdown files under `pages/`. There is no `npm install` or build step; queries run when the page loads. The generated `AGENTS.md`/`CLAUDE.md` tell coding agents the same rules, and `evidence docs list`, `evidence docs component <name>` and `evidence docs search <query>` print current component syntax as JSON, so check them instead of guessing attributes.

### Writing a report

SQL code fences are named queries (ClickHouse dialect on the Evidence warehouse, or your warehouse's own dialect on a direct connector). Components are Markdoc tags: `{% name attribute="value" /%}`, and string attributes are quoted. Charts and tables can query a table by themselves (aggregations go inside `y="sum(total_sales)"`), or render a named query.

````markdown
---
title: Sales Overview
---

# Sales Overview

{% dropdown id="category_filter" data="demo.daily_orders" value_column="category" title="Category" /%}

{% big_value data="demo.daily_orders" value="sum(total_sales)" fmt="usd1m" filters=["category_filter"] /%}

{% line_chart
    data="demo.daily_orders"
    x="date"
    y="sum(total_sales)"
    date_grain="month"
    filters=["category_filter"]
/%}

```sql top_categories
select category, sum(total_sales) as revenue
from demo.daily_orders
group by category
order by revenue desc
limit 5
```

{% bar_chart data="top_categories" x="category" y="sum(revenue)" /%}

{% table data="top_categories" /%}
````

Key points (verified with `evidence validate` on CLI 0.11.1):

- A `dropdown` with an `id` filters any component that lists that id in `filters=[...]`; there is no `${inputs.x}` interpolation.
- Reference another query inside SQL with `{{query_name}}`; it is substituted as a subquery.
- Other component families: `area_chart`, `scatter_chart`, `heatmap`, `pie_chart`, `combo_chart`, `funnel_chart`, `map`, `tabs`, `row`/`stack` for layout, `repeat` and `if` for logic, `date_range={ range="last 12 months" }` on data components. Unknown attributes fail validation (`Invalid attribute: 'yy'`).
- Reusable SQL can live in `queries/*.sql` files, but `{{ }}` variables are not resolved inside them; put input-driven SQL in a page SQL block.
- Models, metrics, partials and custom components are described under Core Concepts in the docs.

### Connect your own warehouse

With a Studio account, `evidence login` is enough and no `connection.yaml` is needed. Without an account (self-hosting, offline, or different credentials) scaffold one: `evidence init shop-reports --warehouse bigquery` (or `snowflake`), which gitignores `connection.yaml` but not the key file it points to, so add the key file to `.gitignore` yourself.

```yaml
# connection.yaml (BigQuery); the keyfile is a credential, never commit it
type: bigquery
project: northwind-analytics
keyfile: ./evidence-bq-reader.json
datasets:
  - sales
```

If `connection.yaml` exists, the CLI always uses it, even when logged in. Use a read-only warehouse role.

### Publish or self-host

- **Evidence Studio**: `evidence launch` connects the Git repo and Studio project; afterwards each `git push` deploys. It needs `evidence login` and a GitHub repo; confirm before running it.
- **Self-host**: the official Docker image runs `evidence serve` and requires a direct connector:

```docker
FROM evidencedev/serve:latest
COPY --chown=evidence:evidence . /project
```

Replace secrets in `connection.yaml` with `${VAR}` references (for BigQuery use `keyfile_json` instead of a key file path) and set them as environment variables; the image needs `connection.yaml`, so once it holds only `${VAR}` references, commit it (the docs' step 3). Also set `EVIDENCE_BASIC_USER` and `EVIDENCE_BASIC_PASSWORD` (HTTP Basic auth) or the server has no login. Self-hosting lacks Studio's SSO, page permissions and agent features.

### Migrating a legacy project

`evidence migrate --dry-run` previews, `evidence migrate` converts component syntax, inputs and connections in place, then `evidence validate` and `evidence dev`. Not migrated: templated `[param].md` pages (use one page with a dropdown), `sources/` SQL (sync a table or view instead), Svelte files and custom Svelte components, box plots, Venn diagrams, `y2` axes (use `combo_chart` with `axis="y2"`). Expect manual work.

## Examples

### Example 1: "Add a weekly orders page to our Evidence project"

The agent runs `evidence tables`, `evidence describe demo.daily_orders`, creates `pages/orders.md` with a `week`-grain `line_chart` (`date_grain="week"`) and a `table`, runs `evidence validate`, and confirms the output is `{"valid":true,...,"errorCount":0}` before running `evidence dev` to look at it.

### Example 2: "Our dashboard repo uses `npm run dev` and `<LineChart>` tags"

That is a legacy project. The agent installs the CLI with the checksum steps above, runs `evidence migrate --dry-run`, reviews the warnings (templated pages and `sources/` SQL need redesign), runs `evidence migrate`, and fixes each `evidence validate` error using `evidence docs component <name>`.

## Guidelines

- Never generate `<LineChart ... />` Svelte tags, `${inputs.x}` or `npm run sources` for current Evidence; models trained earlier will do this by default.
- Query results come from a live warehouse connection, so keep queries cheap and use a read-only role.
- `evidence validate` runs in syntax-only mode without a connection; SQL errors only appear once a connection exists.
- Never commit a `connection.yaml` that holds real secrets, or key files, and never expose a self-hosted server without Basic auth or an authenticating reverse proxy.
- For tiny static reports with no warehouse, a plain Markdown or notebook workflow is lighter than Evidence.
