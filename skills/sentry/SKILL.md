---
name: sentry
description: >-
  Assists with monitoring application errors, performance, and user experience using Sentry.
  Use when integrating Sentry SDKs, configuring alerting, analyzing stack traces, uploading
  source maps, or tracking release health in production. Trigger words: sentry, error
  monitoring, error tracking, performance monitoring, source maps, session replay.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["sentry", "error-monitoring", "performance", "observability", "debugging"]
---

# Sentry

## Overview

Sentry is an error monitoring and performance platform that captures unhandled exceptions, tracks request performance with Web Vitals, records session replays, and alerts on regressions. It supports JavaScript, Python, Go, and mobile platforms with auto-instrumentation, source-mapped stack traces, and release health tracking.

## Instructions

- When integrating the SDK, call `Sentry.init()` with `dsn`, `environment`, `release`, and `tracesSampleRate`, choosing the framework-specific SDK (`@sentry/nextjs`, `@sentry/sveltekit`, `sentry-sdk` for Python) for automatic instrumentation.
- When configuring error tracking, set up `Sentry.setUser()` after login for user correlation, add custom tags with `Sentry.setTag()` for filtering, and configure `ignoreErrors` for known harmless errors from browser extensions and third-party scripts.
- When uploading source maps, use `@sentry/vite-plugin` or `@sentry/webpack-plugin` in the CI build step to map minified stack traces back to original source code, associating them with the release version.
- When monitoring performance, set `tracesSampleRate` to 0.1-0.2 in production, add custom spans with `Sentry.startSpan()` for business-critical operations, and monitor Web Vitals (LCP, CLS, INP) for real user experience.
- When setting up alerts, configure rules for error rate spikes rather than individual errors, integrate with Slack or PagerDuty, and filter by environment and error level.
- When using session replay, set `replaysOnErrorSampleRate: 1.0` for all error sessions and `replaysSessionSampleRate: 0.1` for general sampling, with privacy masking for sensitive data.

## Examples

### Example 1: Set up Sentry for a Next.js production app

**User request:** "Add Sentry error monitoring and performance tracking to my Next.js app"

**Actions:**
1. Install `@sentry/nextjs` and run the setup wizard to configure `sentry.client.config.ts` and `sentry.server.config.ts`
2. Configure `Sentry.init()` with environment, release, and `tracesSampleRate: 0.2`
3. Add source map upload to the CI build pipeline with `@sentry/nextjs` webpack integration
4. Set up Slack alerts for error rate spikes in the production environment

**Output:** A Next.js app with automatic error capture, source-mapped stack traces, performance monitoring, and Slack alerting.

### Example 2: Track release health and identify regressions

**User request:** "Set up release tracking to identify which deployment introduced a bug"

**Actions:**
1. Configure `release` in `Sentry.init()` using the git commit SHA or semantic version
2. Integrate with GitHub to link releases to commits for suspect commit detection
3. Set up deploy tracking to mark when releases go to staging and production
4. Configure regression alerts that notify when a previously resolved issue reappears

**Output:** Release health monitoring with crash-free session tracking, suspect commits, and regression alerts.

## Guidelines

- Set `tracesSampleRate` to 0.1-0.2 in production since 100% sampling is expensive and unnecessary.
- Upload source maps in CI since unreadable minified stack traces are not useful for debugging.
- Set `environment` and `release` on every `Sentry.init()` call to filter errors by staging versus production.
- Use `Sentry.setUser()` after login to correlate errors with specific users for support.
- Configure alert rules for error rate spikes rather than individual errors to reduce noise.
- Set `ignoreErrors` for known harmless errors from browser extensions, network timeouts, and third-party scripts.
