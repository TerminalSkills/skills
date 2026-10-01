---
name: bruno
description: >-
  Tests and debugs APIs with Bruno, the open-source API client that keeps collections as plain files in a Git repository. Use when a user asks to create API requests, organize collections, write test scripts, use environments and variables, run a collection from the terminal or CI with the bru CLI, or collaborate on API workflows stored in Git.
license: Apache-2.0
compatibility: "Bruno desktop app 4.x (Windows, macOS, Linux). The bru CLI (@usebruno/cli 4.x) needs Node.js 20 or newer."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["api-client", "http", "testing", "git-friendly", "open-source"]
  repository: https://github.com/usebruno/bruno
---
# Bruno — Git-Friendly API Client

## Overview

Bruno is an open-source API client that stores collections as plain text files in a folder, so they live in the Git repository next to the code: versioned, reviewable in pull requests, with no account and no cloud sync (unlike Postman). The desktop app edits the files; the `bru` CLI runs them in a terminal or in CI.

A collection uses one of two file formats, never both:

- **OpenCollection YAML** (`.yml`, root file `opencollection.yml`) — the default for new and imported collections since Bruno 3.1.
- **Bru** (`.bru`, root file `bruno.json`) — the original format, still supported. The desktop app converts a Bru collection with **Migrate to YML** (Bruno 4.1 and later).

## Instructions

### Installation

```bash
npm install -g @usebruno/cli                   # CLI, Node.js 20+
bru --version                                  # 4.2.0
brew install bruno                             # desktop app, macOS
winget install Bruno.Bruno                     # desktop app, Windows
flatpak install flathub com.usebruno.Bruno     # desktop app, Linux
```

Other installers are on https://www.usebruno.com/downloads. The CLI is also published as the Docker image `usebruno/cli` (mount the collection at `/bruno`).

### Collection Structure

```
orders-api/
├── opencollection.yml        # Collection root (Bru format: bruno.json + collection.bru)
├── .env                      # Local secrets, listed in .gitignore
├── environments/             # local.yml, staging.yml
├── auth/
│   ├── folder.yml            # Folder settings (Bru format: folder.bru)
│   └── login.yml
├── users/                    # list-users.yml
└── orders/                   # create-order.yml
```

The root file `opencollection.yml` needs only `opencollection: 1.0.0` and an `info:` block with the collection `name`.

### Request File (YAML)

```yaml
# auth/login.yml
info:
  name: Login
  type: http
  seq: 1
  tags:
    - smoke

http:
  method: POST
  url: "{{baseUrl}}/api/auth/login"
  body:
    type: json
    data: |-
      {
        "email": "{{smokeEmail}}",
        "password": "{{smokePassword}}"
      }
  auth: inherit

runtime:
  scripts:
    - type: after-response
      code: |-
        if (res.status === 200) {
          bru.setVar("authToken", res.body.token);   // runtime variable for later requests
        }
    - type: tests
      code: |-
        test("login returns a token", () => {
          expect(res.status).to.equal(200);
          expect(res.body.token).to.be.a("string");
          expect(res.body.user.email).to.equal(bru.getEnvVar("smokeEmail"));
        });
```

Script types are `before-request`, `after-response` and `tests`. Tests use Chai's `expect`. `{{variable}}` is replaced in the URL, headers and body but not inside scripts: read values there with `bru.getEnvVar()` or `bru.getVar()`.

### Bru File Format

The same request in an older `.bru` collection. Bru has no comment syntax: a `#` line at the top of a file is a parse error and the CLI skips the file.

```bru
meta {
  name: Login
  type: http
  seq: 1
}

post {
  url: {{baseUrl}}/api/auth/login
  body: json
  auth: none
}

body:json {
  {
    "email": "{{smokeEmail}}",
    "password": "{{smokePassword}}"
  }
}

script:post-response {
  if (res.status === 200) {
    bru.setVar("authToken", res.body.token);
  }
}

tests {
  test("login returns a token", () => {
    expect(res.status).to.equal(200);
    expect(res.body.user.email).to.equal(bru.getEnvVar("smokeEmail"));
  });
}
```

### Environments

One file per environment in `environments/`. A value written as `{{process.env.NAME}}` comes from the shell or from a `.env` file at the collection root. A variable marked secret keeps its value outside the file (the desktop app stores it encrypted on the machine), so the CLI must receive it with `--env-var`.

```yaml
# environments/local.yml
name: local
variables:
  - name: baseUrl
    value: http://localhost:3000
  - name: smokeEmail
    value: maria.keller@northwind-logistics.com
  - name: smokePassword
    value: "{{process.env.SMOKE_USER_PASSWORD}}"
  - name: apiSecret
    secret: true
```

In a Bru collection the same file is `environments/local.bru`: a `vars { … }` block with one `baseUrl: http://localhost:3000` pair per line (a block written on a single line is a parse error) and a `vars:secret [ apiSecret ]` list for secret names.

### Scripting

```yaml
# orders/create-order.yml — sign the request before it is sent
info:
  name: Create order
  type: http
  seq: 1

http:
  method: POST
  url: "{{baseUrl}}/api/orders"
  headers:
    - name: X-Timestamp
      value: "{{timestamp}}"
    - name: X-Signature
      value: "{{signature}}"

runtime:
  scripts:
    - type: before-request
      code: |-
        const CryptoJS = require("crypto-js");
        const timestamp = Date.now().toString();
        const signature = CryptoJS.HmacSHA256(timestamp, bru.getEnvVar("apiSecret")).toString();
        bru.setVar("timestamp", timestamp);
        bru.setVar("signature", signature);
```

Scripts run in **Safe Mode** by default (CLI 3.0 and later). Safe Mode offers `require()` for the bundled libraries `chai`, `crypto-js`, `uuid`, `nanoid`, `moment`, `axios`, `jsonwebtoken`, `tv4`, `ajv`, `atob` and `btoa`. Node built-ins such as `crypto` and `fs`, npm packages, `lodash`, `xml2js` and `node-fetch` need Developer Mode: `bru run --sandbox=developer`.

Useful calls: `bru.setVar` / `bru.getVar` (runtime variables), `bru.getEnvVar` / `bru.setEnvVar`, `bru.getProcessEnv("NAME")`, `bru.runner.skipRequest()`, `bru.runner.stopExecution()`, `req.setHeader(name, value)`, `res.status`, `res.body`, `res.getHeader(name)`.

### CLI for CI/CD

```bash
cd orders-api                          # bru run works only at the collection root
bru run --env local                    # whole collection
bru run auth --env local               # one folder (add -r to include subfolders)
bru run auth/login.yml --env local     # one request
bru run --env local --tags=smoke       # only requests tagged "smoke"
# Pass a secret variable from the shell
bru run --env staging --env-var apiSecret="$ORDERS_API_SECRET"
# Stop at the first failure and write reports (the reports/ directory must already exist)
bru run --env staging --bail \
  --reporter-junit reports/results.xml --reporter-html reports/results.html
# Create a collection from an OpenAPI file (add --collection-format bru for .bru files)
bru import openapi --source openapi.yaml --output ./orders-api --collection-name "Orders API"
```

`bru run` exits with a non-zero code when a request gets no response or a test or assertion fails; a 4xx or 5xx response alone does not fail the run. The older `--output results.xml --format junit` pair still works but is deprecated in favour of the `--reporter-*` options.

## Examples

### Example 1: Add an authenticated request and run the collection

User: "Add a request to our Bruno collection that lists users with the token from login, then run everything locally."

```yaml
# users/list-users.yml
info:
  name: List users
  type: http
  seq: 1

http:
  method: GET
  url: "{{baseUrl}}/api/users"
  auth:
    type: bearer
    token: "{{authToken}}"

runtime:
  assertions:
    - expression: res.status
      operator: eq
      value: "200"
    - expression: res.body.data
      operator: isArray
```

```bash
cd orders-api                      # SMOKE_USER_PASSWORD is set in the shell or in .env
bru run auth users --env local
```

Result: the login request stores `authToken` and the next request sends it as a Bearer token. Running `bru run users --env local` alone returns 401, because nothing has set `authToken`.

```
auth/login (200 OK) - 12 ms
Tests
   ✓ login returns a token
users/list-users (200 OK) - 2 ms
Assertions
   ✓ res.status: eq 200
   ✓ res.body.data: isArray
```

### Example 2: Run the collection in GitHub Actions against staging

User: "Run our Bruno tests on every pull request and show the results in CI."

```yaml
# .github/workflows/api-tests.yml
on: pull_request
jobs:
  bruno:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: "24"
      - run: npm install -g @usebruno/cli
      - name: Run collection
        working-directory: orders-api
        env:
          SMOKE_USER_PASSWORD: ${{ secrets.SMOKE_USER_PASSWORD }}
          ORDERS_API_SECRET: ${{ secrets.ORDERS_API_SECRET }}
        run: |
          mkdir -p reports
          bru run --env staging \
            --env-var apiSecret="$ORDERS_API_SECRET" \
            --reporter-junit reports/results.xml
      - uses: actions/upload-artifact@v6
        if: ${{ !cancelled() }}
        with:
          name: bruno-report
          path: orders-api/reports/results.xml
```

Result: the job fails when any test or assertion fails, and `results.xml` holds one `<testsuite>` per request with a `<testcase>` for every test and assertion.

## Guidelines

1. **Git-first workflow** — Store Bruno collections in your repo next to application code; review API changes in PRs
2. **Environment files for config** — Use environments for base URLs; keep credentials out of them with `{{process.env.NAME}}` or secret variables, and add `.env` to `.gitignore`
3. **Secrets in the CLI** — Secret variables are stored by the desktop app, not in the collection, so a CLI run sees them empty unless `--env-var name=value` supplies them
4. **Test assertions** — Write tests in every request; run them in CI to catch API regressions
5. **Script chaining** — Use `bru.setVar()` in after-response scripts to pass data between requests (token → subsequent calls); the request that sets a variable has to run first
6. **Folder organization** — Mirror your API structure (auth/, users/, orders/); a folder can carry its own auth, variables and scripts in `folder.yml` (`folder.bru`)
7. **One format per collection** — Do not mix `.bru` and `.yml` requests; after migrating, change `.bru` paths passed to `bru.runRequest()` to `.yml`
8. **Safe Mode first** — Use `--sandbox=developer` only for collections you trust: Developer Mode scripts can read files and run system commands
9. **CI/CD integration** — Run `bru run --env staging` after deployment to verify the API contract; the exit code fails the pipeline. In CLI 4 the JUnit `classname` is the request's path in the collection, not its URL
10. **Reports can leak** — The JSON report records request and response headers and bodies, including a login password and the returned token; add `--reporter-skip-all-headers --reporter-skip-body` before publishing JSON or HTML reports as CI artifacts
