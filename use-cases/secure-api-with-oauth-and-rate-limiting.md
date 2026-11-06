---
title: Secure an API with OAuth 2.0, Rate Limiting, and Security Scanning
slug: secure-api-with-oauth-and-rate-limiting
description: Harden a production API with OAuth 2.0 access tokens validated against the provider's JWKS, tiered Redis rate limiting, secrets from HashiCorp Vault, and OWASP ZAP scans in CI — a complete security posture for a SaaS API.
skills:
  - oauth2-oidc
  - rate-limiter
  - hashicorp-vault
  - owasp-zap
category: development
tags:
  - api-security
  - oauth
  - rate-limiting
  - secrets
  - owasp
---

# Secure an API with OAuth 2.0, Rate Limiting, and Security Scanning

Diego runs a fintech API that handles 2 million requests per day. A security audit flagged four issues: static API keys in environment variables (no rotation), no rate limiting (one customer's automation script caused a 10-minute outage), basic auth on some endpoints (passwords in headers), and no automated security testing. He needs production-grade security before the company's SOC 2 audit in 8 weeks.

## Step 1: Replace API keys with OAuth 2.0 access tokens

Static API keys do not expire, cannot be scoped, and leak into logs, Git history and chat. Short-lived access tokens limit the blast radius. The split of roles matters:

- Your API is the **resource server**. It never sees passwords or client secrets, only bearer tokens, which it validates.
- Customers' backend jobs get tokens with the **client credentials** grant. Browser and mobile apps use **Authorization Code with PKCE** (`S256`) through the identity provider. Do not use the implicit or password grants (RFC 9700).

A machine client fetches a token like this (the token URL comes from the provider's `/.well-known/openid-configuration`):

```bash
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=client_credentials -d scope="transactions:read" "$TOKEN_URL"
```

The API validates every request: signature against the provider's JWKS (cached, refetched on an unknown `kid`), pinned algorithm, `exp`, `iss`, `aud`, and scope.

```typescript
// src/middleware/auth.ts
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from "jose";
import type { NextFunction, Request, Response } from "express";

const JWKS = createRemoteJWKSet(new URL(process.env.JWKS_URI!));

export type Tier = "free" | "pro" | "enterprise";
export type AuthedRequest = Request & { user: JWTPayload & { scope?: string; org_id?: string; tier?: Tier } };

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return res.status(401).json({ error: "unauthorized" });

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.OIDC_ISSUER_URL!,
      audience: process.env.OAUTH_AUDIENCE!,   // tokens minted for another API are rejected
      algorithms: ["RS256"],                   // pin to what your provider signs with
      clockTolerance: 5,
    });
    (req as AuthedRequest).user = payload;
    next();
  } catch (err) {
    const expired = err instanceof errors.JWTExpired;
    res.status(401).json({ error: expired ? "token_expired" : "invalid_token" });
  }
}

// Some providers put scopes in `scp` as an array.
export function requireScope(...required: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const granted = ((req as AuthedRequest).user.scope ?? "").split(" ");
    if (!required.every((s) => granted.includes(s))) {
      return res.status(403).json({ error: "insufficient_scope", required });
    }
    next();
  };
}
```

`org_id` and `tier` are custom claims you configure in the provider. Never accept an ID token as an API credential.

## Step 2: Tiered, atomic rate limiting with Redis

The `rate-limiter` skill's guidance applies: layered limits (per IP before authentication, per organization after), a sliding-window counter, standard headers on every response, Redis server time, and no fail-open when Redis is down. The check and the update run in one Lua script, so concurrent API instances cannot race; a rejected request is not counted.

```typescript
// src/middleware/rate-limiter.ts
import { Redis } from "ioredis";
import type { NextFunction, Request, Response } from "express";
import type { AuthedRequest, Tier } from "./auth.js";

const redis = new Redis(process.env.REDIS_URL!);

// KEYS[1]=key ARGV: windowMs, max, cost, nonce. Returns {allowed, used, resetMs}
redis.defineCommand("slidingWindow", {
  numberOfKeys: 1,
  lua: `
    local t = redis.call('TIME')
    local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
    local window, max, cost = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
    redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
    local used = redis.call('ZCARD', KEYS[1])
    local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
    local reset = window
    if oldest[2] then reset = tonumber(oldest[2]) + window - now end
    if used + cost > max then return {0, used, reset} end
    for i = 1, cost do redis.call('ZADD', KEYS[1], now, ARGV[4] .. ':' .. i) end
    redis.call('PEXPIRE', KEYS[1], window)
    return {1, used + cost, reset}`,
});
declare module "ioredis" {
  interface RedisCommander<Context> {
    slidingWindow(key: string, windowMs: number, max: number, cost: number, nonce: string): Promise<[number, number, number]>;
  }
}

const WINDOW_MS = 60_000;
const TIER_LIMIT: Record<Tier, number> = { free: 100, pro: 1_000, enterprise: 10_000 };
const COST: Record<string, number> = {
  "POST /api/reports/generate": 20,
  "POST /api/transactions/export": 10,
  "POST /api/transactions": 2,
};

// Redis down: per-process fallback, never "unlimited".
const local = new Map<string, { n: number; until: number }>();
function localCheck(key: string, max: number, cost: number): [number, number, number] {
  const now = Date.now();
  const e = local.get(key);
  const cur = e && e.until > now ? e : { n: 0, until: now + WINDOW_MS };
  if (cur.n + cost > max) return [0, cur.n, cur.until - now];
  cur.n += cost;
  local.set(key, cur);
  return [1, cur.n, cur.until - now];
}

export function rateLimit(layer: "ip" | "org") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Partial<AuthedRequest>).user;
    const tier: Tier = user?.tier ?? "free";
    // `req.ip` is only the client address if Express `trust proxy` matches your proxy setup.
    const id = layer === "ip" ? `ip:${req.ip}` : `org:${user?.org_id ?? user?.sub}`;
    const max = layer === "ip" ? 300 : TIER_LIMIT[tier];
    const cost = layer === "org" ? COST[`${req.method} ${req.path}`] ?? 1 : 1;
    const key = `rl:${id}`;

    let result: [number, number, number];
    try {
      result = await redis.slidingWindow(key, WINDOW_MS, max, cost, `${Date.now()}-${Math.random()}`);
    } catch (err) {
      console.error("rate limiter: Redis unavailable, using local counter", err);
      result = localCheck(key, max, cost);
    }
    const [allowed, used, resetMs] = result;

    res.set({
      "X-RateLimit-Limit": String(max),
      "X-RateLimit-Remaining": String(Math.max(0, max - used)),
      "X-RateLimit-Reset": String(Math.ceil((Date.now() + resetMs) / 1000)),
    });
    if (!allowed) {
      const retryAfter = Math.max(1, Math.ceil(resetMs / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "rate_limit_exceeded", retryAfter, tier });
    }
    next();
  };
}
```

Wire it as `app.use(rateLimit("ip"), requireAuth, rateLimit("org"))`. `X-RateLimit-*` is a common convention, not a standard; the IETF `RateLimit` header fields are still a draft, so pick one scheme and document it. Test with concurrent requests, not only sequential ones.

## Step 3: Pull secrets from Vault instead of environment variables

The service holds only an AppRole `role_id` (shipped with the deployment) and `secret_id` (injected by CI or the orchestrator, short TTL). Everything else comes from Vault. Set up the policy and role once (CLI as in the `hashicorp-vault` skill):

```bash
cat > fintech-api.hcl <<'EOF'
path "secret/data/fintech-api/*"          { capabilities = ["read"] }
path "database/creds/fintech-api-role"    { capabilities = ["read"] }
EOF
vault policy write fintech-api fintech-api.hcl
vault auth enable approle
vault write auth/approle/role/fintech-api token_policies=fintech-api \
  token_ttl=1h token_max_ttl=4h secret_id_ttl=24h
vault write database/roles/fintech-api-role db_name=fintech default_ttl=1h max_ttl=24h \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";"
```

The `database/config/fintech` connection must exist first (see the skill). The service talks to Vault's HTTP API over TLS:

```typescript
// src/config/vault.ts
const VAULT_ADDR = process.env.VAULT_ADDR!; // must be https:// outside local experiments

async function vault<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${VAULT_ADDR}/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...(token && { "X-Vault-Token": token }), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Vault ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadSecrets() {
  const login = await vault<{ auth: { client_token: string } }>("auth/approle/login", undefined, {
    role_id: process.env.VAULT_ROLE_ID,
    secret_id: process.env.VAULT_SECRET_ID,
  });
  const token = login.auth.client_token;

  const kv = await vault<{ data: { data: Record<string, string> } }>("secret/data/fintech-api/config", token);
  const db = await vault<{ lease_duration: number; data: { username: string; password: string } }>(
    "database/creds/fintech-api-role", token);

  return {
    app: kv.data.data,                         // e.g. oauth client secret, encryption key
    database: { ...db.data, leaseSeconds: db.lease_duration },
  };
}

// Fetch new database credentials at two thirds of the lease, then rebuild the connection pool.
export function refreshBeforeExpiry(current: { database: { leaseSeconds: number } },
                                    onRefresh: (s: Awaited<ReturnType<typeof loadSecrets>>) => void) {
  setTimeout(async () => {
    const next = await loadSecrets();
    onRefresh(next);
    refreshBeforeExpiry(next, onRefresh);
  }, (current.database.leaseSeconds * 2 / 3) * 1000);
}
```

Each read of `database/creds/...` creates a new database user, so a leaked credential works for at most one hour. Enable at least two audit devices (`vault audit enable file file_path=/var/log/vault/audit.log`) before production traffic; the audit log is the access trail an auditor asks for.

## Step 4: Scan automatically with OWASP ZAP

A passive baseline scan on every pull request, and a full active scan against **staging** on a schedule. Active scans submit forms and can create records, so never point them at production.

```yaml
# .github/workflows/security.yml
name: Security Scan
on:
  pull_request:
    branches: [main]
  schedule:
    - cron: "0 3 * * 1"   # full scan, Mondays 03:00 UTC
permissions:
  contents: read
  issues: write           # ZAP actions file their findings as a GitHub issue

jobs:
  baseline:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start the app
        run: |
          docker compose -f compose.test.yml up -d
          curl --retry 30 --retry-delay 2 --retry-connrefused -fsS http://localhost:3000/healthz
      - uses: zaproxy/action-baseline@v0.15.0
        with:
          target: http://localhost:3000
          rules_file_name: .zap/baseline-rules.tsv
          cmd_options: -a -j     # alpha passive rules, Ajax spider
          fail_action: false     # report only; turn on once the noise is triaged

  full:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: zaproxy/action-full-scan@v0.13.0
        with:
          target: ${{ vars.STAGING_URL }}
          rules_file_name: .zap/full-scan-rules.tsv
          cmd_options: -a -j
          fail_action: true      # fail the job on alerts not ignored in the rules file
```

The actions run ZAP in Docker with host networking, so `localhost` reaches the app on the runner, and they upload the HTML/JSON/Markdown reports as the `zap_scan` artifact. ZAP reports every alert as a WARN until you set a rule to `IGNORE` or `FAIL` in the rules file (generate one with `zap-baseline.py -g gen.conf`, then edit it). An unauthenticated scan only sees what is reachable without a token; to cover the API behind OAuth, use `zaproxy/action-api-scan` with your OpenAPI file and an Authorization header, or an Automation Framework plan with an authentication block.

## Results

Diego finished the hardening in 5 weeks, ahead of the SOC 2 audit:

- **No static secrets in environment variables.** The service holds only its AppRole credentials; database passwords are generated per instance and expire after an hour.
- **API keys retired.** Access tokens expire in 15 minutes, so a stolen one is useful for minutes, not indefinitely.
- **Rate limiting contained the next runaway script.** A customer's loop hit the pro limit and got `429` with `Retry-After` instead of exhausting the database.
- **ZAP findings reached the backlog.** The first full scan of staging produced a list of XSS, missing-header and cookie-flag alerts; the high and medium ones were fixed within a week, and the baseline scan keeps new ones out of pull requests.

## Related Skills

- **oauth2-oidc**: access-token validation, grant types and PKCE rules for Step 1
- **rate-limiter**: layered limits, headers and fallback behavior for Step 2
- **hashicorp-vault**: AppRole, policies and dynamic database credentials for Step 3
- **owasp-zap**: baseline and full scans and the GitHub Actions in Step 4
