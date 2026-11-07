---
name: axios
description: >-
  Axios is a promise-based HTTP client for Node.js and browsers that sends requests, parses JSON, and rejects on error status codes. Use it when asked to "call a REST API from Node", "add a base URL and auth header to every request", "retry on 503", "cancel a request", "set a timeout", "handle axios errors", or "upgrade axios because of a security advisory". Covers instances, interceptors, AbortController cancellation, timeouts, error handling, the fetch adapter, size limits, and which versions to avoid.
license: Apache-2.0
compatibility: "Node.js (current LTS) or a modern browser; axios 1.20 or newer"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "axios, http-client, rest-api, nodejs, javascript"
  repository: https://github.com/axios/axios
---

# Axios — promise-based HTTP client

## Overview

Axios (npm package `axios`, current major 1.x) wraps HTTP requests behind one API that works in Node.js and in browsers. It serializes request bodies, parses JSON responses into `response.data`, and rejects the promise for non-2xx statuses. Its main features are configured instances, request and response interceptors, cancellation with `AbortSignal`, per-request timeouts, and pluggable adapters (`http`, `xhr`, `fetch`). The package is ESM with a CommonJS build.

## Instructions

### Installation and version safety

```bash
npm install axios
npm view axios version        # confirm what latest is
npm ls axios                  # find every copy in the tree
```

Axios has had many security advisories, most of them in proxy handling, prototype-pollution gadgets and body-size limits. Fixes for all those listed in the GitHub advisory database at the time of writing are in 1.20.0, so use 1.20.0 or newer (1.21.0 was latest when this skill was written). On the 0.x line the last release is 0.34.0.

Versions 1.14.1 and 0.30.4 were published with malicious code: a hidden dependency, `plain-crypto-js`, that installs a remote access trojan (OSV MAL-2026-2307, GitHub advisory GHSA-fw8c-xr5c-95f9). npm has since removed both versions, but a lockfile or cache may still hold them. If `npm ls axios` shows either, treat the machine as compromised, rotate its secrets from another machine and reinstall from a clean lockfile. Pin an exact version in production and review lockfile changes for axios.

### Basic requests

```js
import axios from 'axios'

const { data, status } = await axios.get('https://api.github.com/repos/axios/axios', {
  params: { per_page: 5 },                 // becomes ?per_page=5
  headers: { Accept: 'application/vnd.github+json' },
})

const created = await axios.post('https://api.example-shop.dev/orders', {
  sku: 'KB-104',
  qty: 2,
})                                          // objects are sent as JSON
```

Method helpers: `get`, `delete`, `head`, `options` take `(url, config)`; `post`, `put`, `patch` take `(url, data, config)`. `axios.request(config)` takes everything in one object. `response` has `data`, `status`, `statusText`, `headers`, `config`, `request`.

### Instances

Create one instance per upstream API and put shared settings on it.

```js
export const billing = axios.create({
  baseURL: 'https://billing.internal.corp.example/v2',
  timeout: 5000,                            // ms, whole request
  headers: { 'X-Client': 'invoice-worker' },
  maxContentLength: 10 * 1024 * 1024,       // bytes; default is unlimited
  maxBodyLength: 10 * 1024 * 1024,
})
```

Set `maxContentLength` and `maxBodyLength` when the other side is not fully trusted: both default to unlimited, so a hostile server can return a small compressed body that expands to gigabytes.

### Interceptors

```js
billing.interceptors.request.use(config => {
  config.headers.set('Authorization', `Bearer ${process.env.BILLING_API_TOKEN}`)
  return config
})

// retry 503 responses up to 3 times
billing.interceptors.response.use(undefined, async error => {
  const config = error.config
  if (error.response?.status === 503 && (config.retryCount = (config.retryCount ?? 0) + 1) <= 3) {
    await new Promise(resolve => setTimeout(resolve, 200 * config.retryCount))
    return billing(config)
  }
  throw error
})
```

Use `config.headers.set(...)` inside interceptors. Always rethrow (or return a rejected promise) when you do not handle the error. For anything beyond simple retries, add a retry library rather than growing the interceptor.

### Errors

Axios throws `AxiosError` for network failures, timeouts, cancellation and non-2xx responses (control the last with `validateStatus`).

```js
import axios, { isAxiosError } from 'axios'

try {
  await billing.get('/invoices/INV-1042')
} catch (error) {
  if (isAxiosError(error)) {
    if (error.response) {
      // server answered with a non-2xx status
      console.error(error.response.status, error.response.data)
    } else if (error.code === 'ECONNABORTED') {
      console.error('timed out')
    } else if (axios.isCancel(error)) {
      console.error('cancelled')
    } else {
      console.error('no response', error.code)   // e.g. ECONNREFUSED, ENOTFOUND
    }
  } else {
    throw error
  }
}
```

`error.code` is `ERR_BAD_REQUEST` for 4xx, `ERR_BAD_RESPONSE` for 5xx, `ECONNABORTED` for a timeout and `ERR_CANCELED` for a cancelled request. To treat 404 as a normal result, pass `validateStatus: status => status < 500`.

### Timeouts and cancellation

```js
// per-request timeout
await billing.get('/reports/monthly', { timeout: 30_000 })

// cancel with AbortController
const controller = new AbortController()
const pending = billing.get('/reports/monthly', { signal: controller.signal })
controller.abort()                          // pending rejects with ERR_CANCELED

// cancel after a deadline
await billing.get('/reports/monthly', { signal: AbortSignal.timeout(10_000) })
```

`timeout` is in milliseconds, and 0 means none. The older `CancelToken` API is deprecated; use `signal`.

### Concurrent requests

```js
const [customers, invoices] = await Promise.all([
  billing.get('/customers'),
  billing.get('/invoices'),
])
const results = await Promise.allSettled([billing.get('/a'), billing.get('/b')])
```

`axios.all` and `axios.spread` are deprecated; use `Promise.all`.

### Adapters and the fetch adapter

```js
const res = await axios.get('https://api.github.com/zen', { adapter: 'fetch' })
```

`adapter` takes `'http'` (Node default), `'xhr'` (browser default), `'fetch'`, or an array tried in order. Use `'fetch'` in runtimes without Node's `http` module (edge workers, Deno, Bun) or when you want a streaming response (`responseType: 'stream'`).

### Form data and files

```js
const form = new FormData()
form.append('invoice', new Blob([pdfBytes], { type: 'application/pdf' }), 'INV-1042.pdf')
await billing.post('/uploads', form)        // content type and boundary are set for you
```

## Examples

### 1. A typed client for a paginated API with auth and retry

Request: "Read every page of orders from the shop API, with the token from the environment and a retry on 503."

```js
import axios from 'axios'

const shop = axios.create({
  baseURL: 'https://api.example-shop.dev/v1',
  timeout: 8000,
  headers: { Authorization: `Bearer ${process.env.SHOP_API_TOKEN}` },
})

async function* allOrders() {
  for (let page = 1; ; page++) {
    const { data } = await shop.get('/orders', { params: { page, per_page: 100 } })
    yield* data.items
    if (data.items.length < 100) return
  }
}

let count = 0
for await (const order of allOrders()) count++
console.log(`${count} orders`)
```

Result: prints a line like `2318 orders`. Create the token in the shop's developer settings and export it as `SHOP_API_TOKEN`; the domain above is a placeholder for your own API.

### 2. Fail fast on a slow dependency

Request: "The health check must give up after 2 seconds and report why."

```js
import axios, { isAxiosError } from 'axios'

async function check(url) {
  try {
    const { status } = await axios.get(url, { timeout: 2000 })
    return { url, ok: true, status }
  } catch (error) {
    if (!isAxiosError(error)) throw error
    return { url, ok: false, reason: error.response ? `HTTP ${error.response.status}` : error.code }
  }
}

console.log(await Promise.all([check('https://api.github.com/zen'), check('http://127.0.0.1:9')]))
```

Result: `[ { url: 'https://api.github.com/zen', ok: true, status: 200 }, { url: 'http://127.0.0.1:9', ok: false, reason: 'ECONNREFUSED' } ]`.

### 3. Audit and upgrade axios

Request: "Is our service on a vulnerable axios?"

```bash
npm ls axios
npm audit --omit=dev
npm install axios@latest
npm ls axios
```

Result: every copy in the tree, including transitive ones, shows 1.20.0 or newer. If a dependency pins an old copy, update that dependency or add an `overrides` entry in `package.json`.

## Guidelines

- Use 1.20.0 or newer and pin it; never use 1.14.1 or 0.30.4.
- Set `timeout` on every instance. The default is no timeout.
- Set `maxContentLength` and `maxBodyLength` for calls to untrusted servers.
- Never pass user-controlled objects straight into a request config or `axios.create`; build the config from known fields. Many past advisories relied on inherited or polluted properties.
- Do not forward credentials across redirects or to user-supplied URLs. Validate hosts of user-supplied URLs before requesting them, since axios will happily call internal addresses.
- Put secrets in environment variables, not in code, and avoid logging `error.config` (it contains headers, including `Authorization`).
- Native `fetch` is enough for simple one-off calls in modern runtimes; axios earns its place with instances, interceptors, upload progress and consistent error objects.
