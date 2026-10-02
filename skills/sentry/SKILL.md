---
name: sentry
description: >-
  Sentry captures application errors, traces performance, records session replays and tracks release health.
  Use this skill when integrating Sentry SDKs, configuring alerting, analyzing stack traces, uploading
  source maps, or tracking release health in production. Trigger words: sentry, error
  monitoring, error tracking, performance monitoring, source maps, session replay.
license: Apache-2.0
compatibility: "A Sentry account (sentry.io or self-hosted) and a project DSN. Next.js SDK needs Next.js 14+ and Node.js 20.19+."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/getsentry/sentry
  category: development
  tags: ["sentry", "error-monitoring", "performance", "observability", "debugging"]
---

# Sentry

## Overview

Sentry is an error monitoring and performance platform that captures unhandled exceptions, tracks request performance with Web Vitals, records session replays, and alerts on regressions. It supports JavaScript, Python, Go, and mobile platforms with auto-instrumentation, source-mapped stack traces, and release health tracking.

## Instructions

- **Install.** For Next.js run `npx @sentry/wizard@latest -i nextjs`. It creates `instrumentation-client.ts` (browser), `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `app/global-error.tsx`, wraps `next.config.ts` in `withSentryConfig`, and adds `/sentry-example-page` to trigger a test error. The old `sentry.client.config.ts` file is replaced by `instrumentation-client.ts`. Other JavaScript frameworks have their own package (`@sentry/react`, `@sentry/node`, `@sentry/sveltekit`); Python is `pip install sentry-sdk`.
- **Init.** Call `Sentry.init()` with `dsn`, `environment`, `release` and `tracesSampleRate`. Read the DSN from an environment variable such as `NEXT_PUBLIC_SENTRY_DSN`. `sendDefaultPii` is off by default; turn it on only if you accept IP addresses and request headers being sent.
- **Errors.** Call `Sentry.setUser({ id })` after login, `Sentry.setTag()` for filterable values, `Sentry.captureException(err)` for handled errors, and `ignoreErrors` for known noise (browser extensions, `ResizeObserver loop` warnings, third-party scripts).
- **Source maps.** Generate maps in the build and upload them from CI. With Vite use `@sentry/vite-plugin` (placed after the other plugins), `build.sourcemap: "hidden"`, `authToken: process.env.SENTRY_AUTH_TOKEN` and `sourcemaps.filesToDeleteAfterUpload` so the `.map` files are not served publicly. The Next.js wizard sets this up through `withSentryConfig({ org, project })`; the token goes in `SENTRY_AUTH_TOKEN`, never in the repository.
- **Performance.** `tracesSampleRate` of 0.1 in production (1.0 only in development), or a `tracesSampler` function to sample by route. Custom spans use `Sentry.startSpan({ name, op, attributes }, callback)`. Set `tracePropagationTargets` so traces continue into your own APIs. Web Vitals (LCP, CLS, INP) come from the browser tracing integration.
- **Alerts.** Create issue alert rules and metric alerts in Alerts, targeting error-rate spikes or new issues per environment, and send them to Slack or PagerDuty through the integration.
- **Session Replay.** Add `integrations: [Sentry.replayIntegration()]` with `replaysSessionSampleRate: 0.1` and `replaysOnErrorSampleRate: 1.0`. Replay masks all text and blocks media by default; keep that for anything with personal data and unmask only specific elements.
- **Releases.** Set `release` to the git SHA, link commits with `sentry-cli releases set-commits "$VERSION" --auto` (needs a repository integration), and record deploys with `sentry-cli releases --org ORGANIZATION_SLUG deploys VERSION new -e production`.

## Examples

### Example 1: Set up Sentry for a Next.js production app

**User request:** "Add Sentry error monitoring and performance tracking to my Next.js app"

```bash
npx @sentry/wizard@latest -i nextjs
```

Then edit `instrumentation-client.ts`:

```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_GIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

Set `SENTRY_AUTH_TOKEN` as a CI secret so `next build` uploads source maps. **Result:** open `/sentry-example-page`, click the button, and the error appears in Issues with a readable, source-mapped stack trace within a minute.

### Example 2: Python service with release tracking

**User request:** "Set up release tracking to identify which deployment introduced a bug"

```python
import os
import sentry_sdk

sentry_sdk.init(
    dsn=os.environ["SENTRY_DSN"],
    environment=os.environ.get("APP_ENV", "production"),
    release=os.environ["GIT_SHA"],
    traces_sample_rate=0.1,
)
```

```bash
sentry-cli releases set-commits "$GIT_SHA" --auto
sentry-cli releases --org billing-platform deploys "$GIT_SHA" new -e production
```

**Result:** each issue shows the release it first appeared in, suspect commits, and a regression alert fires when a resolved issue returns in a newer release.

## Guidelines

- Keep `tracesSampleRate` at 0.1 or lower in production; 100% sampling costs quota and money.
- Always set `environment` and `release` so staging noise stays out of production views.
- Upload source maps in CI and delete them from the deployed output; public `.map` files expose your source.
- Alert on rates and new issues, not on every event, to avoid alert fatigue.
- Version differences matter: v8 removed `startTransaction` and `Hub` APIs in favor of `startSpan` and scopes; do not copy v7-era snippets.
- Browser ad blockers drop Sentry requests; in Next.js set `tunnelRoute: "/monitoring"` in `withSentryConfig` if you need those events.
- Do not put DSNs or auth tokens in examples committed to public repositories; the auth token especially must stay secret (the DSN is public by design but can be abused for spam).
