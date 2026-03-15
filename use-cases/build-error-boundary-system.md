---
title: Build an Error Boundary System
slug: build-error-boundary-system
description: Build a comprehensive error boundary system with global error catching, structured error types, retry strategies, user-friendly error pages, error reporting, and graceful fallbacks for production applications.
skills:
  - typescript
  - redis
  - hono
  - zod
category: development
tags:
  - error-handling
  - resilience
  - production
  - monitoring
  - error-boundary
---

# Build an Error Boundary System

## The Problem

Jake leads backend at a 20-person SaaS. Errors are handled inconsistently: some endpoints return `{error: 'Something went wrong'}`, others return stack traces, and some crash with 500 and no body. Users see `undefined` in the UI when an API field is missing. Sentry gets 500 duplicate errors because the same bug fires on every request. There's no difference between "database is down" (retry later) and "invalid input" (don't retry). They need a structured error system: typed errors, consistent API responses, automatic retry classification, user-friendly messages, error deduplication, and graceful fallbacks.

## Step 1: Build the Error Boundary Engine

```typescript
// src/errors/boundary.ts — Structured error handling with retry classification and reporting
import { Redis } from "ioredis";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

// Structured error types
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isRetryable: boolean;
  public readonly isOperational: boolean;  // true = expected, false = bug
  public readonly context: Record<string, any>;
  public readonly fingerprint: string;

  constructor(params: {
    message: string;
    code: string;
    statusCode?: number;
    isRetryable?: boolean;
    isOperational?: boolean;
    context?: Record<string, any>;
    cause?: Error;
  }) {
    super(params.message);
    this.name = "AppError";
    this.code = params.code;
    this.statusCode = params.statusCode || 500;
    this.isRetryable = params.isRetryable ?? false;
    this.isOperational = params.isOperational ?? true;
    this.context = params.context || {};
    this.cause = params.cause;
    this.fingerprint = createHash("sha256")
      .update(`${this.code}:${this.message}:${this.stack?.split("\n")[1] || ""}`)
      .digest("hex").slice(0, 16);
  }
}

// Pre-defined error factories
export const Errors = {
  notFound: (resource: string, id?: string) =>
    new AppError({ message: `${resource}${id ? ` '${id}'` : ''} not found`, code: "NOT_FOUND", statusCode: 404, isOperational: true }),

  validation: (details: Record<string, string>) =>
    new AppError({ message: "Validation failed", code: "VALIDATION_ERROR", statusCode: 400, isOperational: true, context: { details } }),

  unauthorized: (reason?: string) =>
    new AppError({ message: reason || "Authentication required", code: "UNAUTHORIZED", statusCode: 401, isOperational: true }),

  forbidden: (action?: string) =>
    new AppError({ message: `Permission denied${action ? `: ${action}` : ''}`, code: "FORBIDDEN", statusCode: 403, isOperational: true }),

  conflict: (message: string) =>
    new AppError({ message, code: "CONFLICT", statusCode: 409, isOperational: true }),

  rateLimit: (retryAfter: number) =>
    new AppError({ message: "Too many requests", code: "RATE_LIMITED", statusCode: 429, isRetryable: true, isOperational: true, context: { retryAfter } }),

  serviceUnavailable: (service: string) =>
    new AppError({ message: `${service} is temporarily unavailable`, code: "SERVICE_UNAVAILABLE", statusCode: 503, isRetryable: true, isOperational: true }),

  database: (operation: string, cause?: Error) =>
    new AppError({ message: `Database error during ${operation}`, code: "DATABASE_ERROR", statusCode: 500, isRetryable: true, isOperational: false, cause }),

  external: (service: string, statusCode: number, cause?: Error) =>
    new AppError({ message: `${service} returned ${statusCode}`, code: "EXTERNAL_ERROR", statusCode: 502, isRetryable: statusCode >= 500, context: { service, upstreamStatus: statusCode }, cause }),

  internal: (message: string, cause?: Error) =>
    new AppError({ message, code: "INTERNAL_ERROR", statusCode: 500, isRetryable: false, isOperational: false, cause }),
};

// Error boundary middleware for Hono
export function errorBoundary() {
  return async (c: any, next: any) => {
    try {
      await next();
    } catch (error: any) {
      const appError = normalizeError(error);

      // Report to error tracking (deduplicated)
      await reportError(appError, {
        method: c.req.method,
        path: c.req.path,
        userId: c.get("userId"),
      });

      // Build response
      const response: any = {
        error: {
          code: appError.code,
          message: appError.isOperational ? appError.message : "An unexpected error occurred",
          retryable: appError.isRetryable,
        },
      };

      if (appError.code === "VALIDATION_ERROR" && appError.context.details) {
        response.error.details = appError.context.details;
      }

      if (appError.isRetryable && appError.context.retryAfter) {
        c.header("Retry-After", String(appError.context.retryAfter));
      }

      // Never expose stack traces in production
      if (process.env.NODE_ENV === "development") {
        response.error.stack = appError.stack;
      }

      return c.json(response, appError.statusCode);
    }
  };
}

// Normalize any error into AppError
function normalizeError(error: any): AppError {
  if (error instanceof AppError) return error;

  // PostgreSQL errors
  if (error.code === "23505") return Errors.conflict("Resource already exists");
  if (error.code === "23503") return Errors.validation({ reference: "Referenced resource not found" });
  if (error.code === "ECONNREFUSED") return Errors.database("connection", error);

  // Zod validation errors
  if (error.name === "ZodError") {
    const details: Record<string, string> = {};
    for (const issue of error.issues) {
      details[issue.path.join(".")] = issue.message;
    }
    return Errors.validation(details);
  }

  // Fetch errors (external service calls)
  if (error.name === "AbortError") return Errors.serviceUnavailable("External service (timeout)");

  // Unknown errors
  return Errors.internal(error.message || "Unknown error", error);
}

// Deduplicated error reporting
async function reportError(error: AppError, context: Record<string, any>): Promise<void> {
  const dedupeKey = `error:seen:${error.fingerprint}`;
  const recentCount = await redis.incr(dedupeKey);
  await redis.expire(dedupeKey, 3600);  // 1 hour dedup window

  if (recentCount === 1) {
    // First occurrence — send full report
    await redis.rpush("error:reports", JSON.stringify({
      fingerprint: error.fingerprint,
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      stack: error.stack,
      context: { ...error.context, ...context },
      timestamp: new Date().toISOString(),
    }));
  } else if (recentCount === 10 || recentCount === 100) {
    // Milestone alerts for repeat errors
    await redis.rpush("error:reports", JSON.stringify({
      fingerprint: error.fingerprint,
      message: `Error ${error.code} occurred ${recentCount} times in the last hour`,
      escalation: true,
      timestamp: new Date().toISOString(),
    }));
  }
}

// Retry wrapper with exponential backoff
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; baseDelayMs?: number; onRetry?: (error: Error, attempt: number) => void }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelayMs ?? 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const appError = error instanceof AppError ? error : normalizeError(error);

      if (!appError.isRetryable || attempt === maxRetries) throw appError;

      options?.onRetry?.(appError, attempt + 1);
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
    }
  }

  throw Errors.internal("Retry exhausted");  // should never reach here
}

// Graceful fallback wrapper
export async function withFallback<T>(
  fn: () => Promise<T>,
  fallback: T | (() => Promise<T>),
  options?: { reportError?: boolean }
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (options?.reportError !== false) {
      const appError = normalizeError(error);
      await reportError(appError, { fallbackUsed: true });
    }
    return typeof fallback === "function" ? await (fallback as () => Promise<T>)() : fallback;
  }
}
```

## Results

- **Consistent API responses** — every error returns `{error: {code, message, retryable}}`; frontend renders user-friendly messages; no more `undefined` or stack traces
- **Retry classification** — 503 and database errors tagged as retryable; clients implement automatic retry; 400 validation errors not retried; saves server resources
- **Error deduplication** — same bug fires 500 times; Sentry gets 1 report + "occurred 100 times" alert; engineers see one issue, not 500 copies
- **Graceful fallbacks** — recommendation service down → return cached popular items instead of error page; users never know a service failed
- **Zero stack trace leaks** — production responses hide internal details; development mode shows full stack; security audit passed
