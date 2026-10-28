---
name: scalar
description: >-
  Scalar renders an OpenAPI document as interactive API documentation with a built-in request client, and ships a CLI to validate, lint, bundle, mock and preview specs. Use when asked to "add API docs to my Express/Fastify/Hono app", "replace Swagger UI", "preview my openapi.yaml", "lint an OpenAPI file", "mock an API from a spec", or "serve a reference page from a spec".
license: Apache-2.0
compatibility: "Node.js 20+, npm; an OpenAPI 3.x document"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "openapi, api-documentation, express, fastify, hono"
  repository: https://github.com/scalar/scalar
---
# Scalar — Interactive API reference and OpenAPI CLI

## Overview
Scalar turns an OpenAPI (or AsyncAPI) description into a browsable reference page where readers can also send requests. The page can be mounted as a route in a Node web framework, loaded from a CDN in a plain HTML file, or previewed locally with the Scalar CLI. The same CLI validates, lints, bundles and mocks the spec, so one tool covers writing, checking and showing the contract.

Verified against `@scalar/express-api-reference` 0.10.33, `@scalar/fastify-api-reference` 1.76.2, `@scalar/hono-api-reference` 0.12.16 and `@scalar/cli` 2.13.2.

## Instructions

### Preview a spec with the CLI (fastest path)
```bash
npm install --save-dev @scalar/cli
npx scalar document validate openapi.yaml --no-input
npx scalar document serve openapi.yaml --port 5050 --no-input
```
`serve` starts a local server and prints the address; add `--watch` to reload when the file changes, and `--config reference.json` to pass reference options (theme, layout) as a JSON file. Always pass `--no-input` in scripts so the CLI never prompts or opens a browser.

Other `scalar document` subcommands that work offline on local files:

| Command | Purpose |
|---|---|
| `validate [file\|url]` | Check the spec is a valid OpenAPI/AsyncAPI description |
| `lint [file\|url]` | Run Spectral rules; exits with errors and warnings listed |
| `bundle [file\|url] -o out.yaml` | Inline external `$ref`s into one file (`--treeShake` drops unused components) |
| `join <files...>` | Merge several descriptions of the same format |
| `format`, `split`, `markdown`, `convert` | Reformat, split into referenced files, generate Markdown, convert a Postman collection |
| `mock [file\|url] --port 4010` | Run a mock server from the spec (`--watch` supported) |

`auth`, `registry`, `project`, `team`, `share` and `sdk` talk to the Scalar cloud service and need an account; skip them unless the user has one and asks.

### Mount the reference in Express
```bash
npm install express @scalar/express-api-reference
```
```javascript
import express from 'express'
import { apiReference } from '@scalar/express-api-reference'

const app = express()

app.get('/openapi.json', (_req, res) => res.sendFile('openapi.json', { root: process.cwd() }))
app.use('/reference', apiReference({ url: '/openapi.json', theme: 'default' }))

app.listen(4000, '127.0.0.1', () => console.log('Docs at http://127.0.0.1:4000/reference'))
```
The handler answers with a small HTML page that loads the reference script from the jsDelivr CDN, so the browser (not the server) needs internet access. In a test run, `GET /reference` returned 200 with that page, and the configuration object was embedded as JSON.

### Mount the reference in Fastify
```bash
npm install fastify @scalar/fastify-api-reference
```
```javascript
import Fastify from 'fastify'
import fastifyApiReference from '@scalar/fastify-api-reference'
import { readFileSync } from 'node:fs'

const app = Fastify()
const spec = JSON.parse(readFileSync('./openapi.json', 'utf8'))

await app.register(fastifyApiReference, {
  routePrefix: '/reference',
  configuration: { content: spec },
})

await app.listen({ port: 4000, host: '127.0.0.1' })
```
The plugin also serves the spec itself at `/reference/openapi.json` (and `/reference/openapi.yaml`). Requesting `/reference` redirects (301) to the trailing-slash route, which is normal.

### Mount the reference in Hono
```bash
npm install hono @hono/node-server @scalar/hono-api-reference
```
```javascript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { Scalar } from '@scalar/hono-api-reference'

const app = new Hono()

app.get('/openapi.json', (c) => c.json(buildSpec()))
app.get('/reference', Scalar({ url: '/openapi.json' }))

serve({ fetch: app.fetch, port: 4000, hostname: '127.0.0.1' })
```
Here `buildSpec()` stands for whatever returns your spec object (for example `app.getOpenAPI31Document(...)` with `@hono/zod-openapi`). `Scalar.serve({ document })` is an alternative that also exposes the document at `/openapi.json` under its mount point.

### Plain HTML page (no server framework)
The generated page in the Express test used this exact shape, which works as a static file:
```html
<!doctype html>
<html>
  <head>
    <title>Bookshop API reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
      import { createApiReference } from 'https://cdn.jsdelivr.net/npm/@scalar/api-reference/esm.js'
      createApiReference('#app', { url: './openapi.yaml' })
    </script>
  </body>
</html>
```
Serve the folder over HTTP (for example `npx http-server -a 127.0.0.1 -p 5051`); opening the file with `file://` blocks the spec fetch.

### Common configuration keys
Pass these in the same object as `url`/`content`: `theme`, `layout` (`modern` or `classic`), `darkMode`, `forceDarkModeState`, `hideDarkModeToggle`, `hideDownloadButton`, `hiddenClients`, `defaultHttpClient`, `authentication` (pre-selected auth scheme) and `proxyUrl` (route requests through a proxy when the API lacks CORS headers). Look up the exact value shapes in the type definitions of `@scalar/types` after installing, rather than guessing.

## Examples

### Example 1: Add docs to an existing Express service
**Request:** "Our orders service has `openapi.yaml` in the repo. Serve interactive docs at `/docs`."

```bash
npm install express @scalar/express-api-reference
npx scalar document bundle openapi.yaml -o public/openapi.json --no-input
npx scalar document validate public/openapi.json --no-input
```
```javascript
import express from 'express'
import { apiReference } from '@scalar/express-api-reference'

const app = express()
app.use('/openapi.json', express.static('public/openapi.json'))
app.use('/docs', apiReference({ url: '/openapi.json' }))
app.listen(4000, '127.0.0.1')
```
Result: bundling resolves external `$ref`s into one JSON file, validation prints "API description validated", and `http://127.0.0.1:4000/docs` shows the operations with a "Test Request" panel.

### Example 2: Lint a spec and preview it before a pull request
**Request:** "Check `openapi.yaml` for problems and show me how it renders."

```bash
npx scalar document lint openapi.yaml --no-input
npx scalar document serve openapi.yaml --port 5050 --watch --no-input
```
Result: lint prints each Spectral finding with its rule name (for example `oas3-missing-example` as a warning) and a summary of error and warning counts; the server prints `API Reference server listening on http://localhost:5050`. Fix the findings, save, and the preview reloads.

### Example 3: Mock the API for a frontend developer
**Request:** "The frontend team needs to call the bookshop API before it is built."

```bash
npx scalar document mock openapi.yaml --port 4010 --no-input
curl -s http://127.0.0.1:4010/books
```
Result: the mock server answers `GET /books` with data shaped from the response schema in the spec.

## Guidelines
- The reference page is only as good as the spec: run `validate` and `lint` first, and keep examples in schemas so the request client shows realistic payloads.
- Serve the spec from the same origin as the page when possible. If you point `url` at another origin, either the API must send CORS headers or you set `proxyUrl`. Never send production credentials through a third-party proxy.
- The embedded page loads its script from a public CDN; for air-gapped environments pin the `@scalar/api-reference` version and self-host it rather than relying on the default.
- Never put API keys in the `url`, `content` or `authentication` values committed to the repo; read them from environment variables.
- Do not expose internal-only endpoints in the public spec; filter them out before serving.
- Bind test servers to `127.0.0.1` and stop them when finished.
- Cloud commands (`registry`, `project`, `share`) publish specs to Scalar's service; do not run them without the owner's explicit approval.
- Not the right tool for generating the spec from code; use a framework generator (such as the OpenAPI plugins of NestJS, FastAPI or `@orpc/openapi`) and feed its output to Scalar.
