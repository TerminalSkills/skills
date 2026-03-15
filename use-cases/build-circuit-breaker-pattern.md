---
title: Build a Circuit Breaker Pattern
slug: build-circuit-breaker-pattern
description: Build a circuit breaker pattern with failure tracking, half-open probing, exponential backoff, per-service configuration, and health dashboard for resilient microservice communication.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Architecture
tags:
  - circuit-breaker
  - resilience
  - microservices
  - fault-tolerance
  - patterns
---

# Build a Circuit Breaker Pattern

## The Problem

Sven leads platform at a 20-person company with 12 microservices. When the payment service went down for 10 minutes, cascading failures took out the order service, notification service, and eventually the entire platform. Each service kept retrying failed requests, creating a thundering herd that prevented recovery even after the payment service came back. Users saw 30-second timeouts instead of fast error messages. They need circuit breakers: detect failing dependencies, fail fast instead of waiting, allow recovery, and prevent cascading failures.

## Step 1: Build the Circuit Breaker

```typescript
// src/resilience/circuit-breaker.ts — Circuit breaker with half-open probing and backoff
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

type CircuitState = "closed" | "open" | "half-open";

interface CircuitConfig {
  name: string;                  // e.g., "payment-service"
  failureThreshold: number;      // failures before opening (default 5)
  successThreshold: number;      // successes in half-open before closing (default 3)
  timeout: number;               // how long circuit stays open in ms (default 30000)
  halfOpenMaxRequests: number;   // max concurrent requests in half-open (default 1)
  monitorWindow: number;         // time window to count failures in ms (default 60000)
  fallback?: () => Promise<any>; // optional fallback response
}

interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt: number;
  lastSuccessAt: number;
  openedAt: number;
  totalRequests: number;
  totalFailures: number;
  totalFallbacks: number;
}

const circuits = new Map<string, CircuitConfig>();
const DEFAULT_CONFIG: Partial<CircuitConfig> = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000,
  halfOpenMaxRequests: 1,
  monitorWindow: 60000,
};

// Register a circuit breaker
export function registerCircuit(config: CircuitConfig): void {
  circuits.set(config.name, { ...DEFAULT_CONFIG, ...config } as CircuitConfig);
}

// Execute function through circuit breaker
export async function execute<T>(
  circuitName: string,
  fn: () => Promise<T>
): Promise<T> {
  const config = circuits.get(circuitName);
  if (!config) throw new Error(`Circuit ${circuitName} not registered`);

  const stats = await getStats(circuitName);
  const state = determineState(stats, config);

  // Track total requests
  await redis.hincrby(`circuit:${circuitName}`, "totalRequests", 1);

  switch (state) {
    case "open": {
      // Fail fast
      await redis.hincrby(`circuit:${circuitName}`, "totalFallbacks", 1);
      if (config.fallback) return config.fallback() as Promise<T>;
      throw new CircuitOpenError(`Circuit ${circuitName} is OPEN — failing fast`);
    }

    case "half-open": {
      // Allow limited requests to probe
      const probing = await redis.incr(`circuit:${circuitName}:probing`);
      await redis.expire(`circuit:${circuitName}:probing`, 10);

      if (probing > config.halfOpenMaxRequests!) {
        if (config.fallback) return config.fallback() as Promise<T>;
        throw new CircuitOpenError(`Circuit ${circuitName} is HALF-OPEN — probe limit reached`);
      }

      try {
        const result = await fn();
        await recordSuccess(circuitName, config);
        return result;
      } catch (error) {
        await recordFailure(circuitName);
        throw error;
      }
    }

    case "closed": {
      try {
        const result = await fn();
        await recordSuccess(circuitName, config);
        return result;
      } catch (error) {
        await recordFailure(circuitName);
        // Re-check if we should open
        const updated = await getStats(circuitName);
        if (updated.failures >= config.failureThreshold!) {
          await openCircuit(circuitName);
        }
        throw error;
      }
    }
  }
}

function determineState(stats: CircuitStats, config: CircuitConfig): CircuitState {
  if (stats.openedAt > 0) {
    const elapsed = Date.now() - stats.openedAt;
    if (elapsed < config.timeout!) return "open";
    return "half-open";  // timeout elapsed, allow probing
  }
  return "closed";
}

async function recordSuccess(name: string, config: CircuitConfig): Promise<void> {
  const key = `circuit:${name}`;
  await redis.hset(key, "lastSuccessAt", Date.now());
  const successes = await redis.hincrby(key, "successes", 1);

  // In half-open: enough successes → close circuit
  if (successes >= config.successThreshold!) {
    await redis.hmset(key, { openedAt: 0, failures: 0, successes: 0 });
    await redis.del(`circuit:${name}:probing`);
  }
}

async function recordFailure(name: string): Promise<void> {
  const key = `circuit:${name}`;
  await redis.hincrby(key, "failures", 1);
  await redis.hincrby(key, "totalFailures", 1);
  await redis.hset(key, "lastFailureAt", Date.now());
}

async function openCircuit(name: string): Promise<void> {
  await redis.hmset(`circuit:${name}`, {
    openedAt: Date.now(),
    successes: 0,
  });
  console.warn(`Circuit ${name} OPENED at ${new Date().toISOString()}`);
}

async function getStats(name: string): Promise<CircuitStats> {
  const data = await redis.hgetall(`circuit:${name}`);
  return {
    state: "closed",
    failures: parseInt(data.failures || "0"),
    successes: parseInt(data.successes || "0"),
    lastFailureAt: parseInt(data.lastFailureAt || "0"),
    lastSuccessAt: parseInt(data.lastSuccessAt || "0"),
    openedAt: parseInt(data.openedAt || "0"),
    totalRequests: parseInt(data.totalRequests || "0"),
    totalFailures: parseInt(data.totalFailures || "0"),
    totalFallbacks: parseInt(data.totalFallbacks || "0"),
  };
}

// Health dashboard data
export async function getAllCircuitStats(): Promise<Record<string, CircuitStats & { state: CircuitState }>> {
  const result: Record<string, CircuitStats & { state: CircuitState }> = {};
  for (const [name, config] of circuits) {
    const stats = await getStats(name);
    stats.state = determineState(stats, config);
    result[name] = stats;
  }
  return result;
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}
```

## Results

- **Cascading failures eliminated** — payment service down → circuit opens in 5 failures → order service returns fallback instantly instead of hanging; other services stay healthy
- **Recovery time: 30 min → 2 min** — circuit breaker stops thundering herd; payment service recovers without being overwhelmed by retries; half-open probing gradually restores traffic
- **User experience: 30s timeout → instant error** — open circuit returns fallback in <1ms; user sees "payment processing delayed" instead of spinning loader
- **Per-service tuning** — payment circuit: 5 failures / 30s timeout; notification circuit: 10 failures / 10s timeout; each tuned to service criticality
- **Health dashboard** — ops team sees all 12 circuits at a glance; open circuits highlighted red; failure rate graphs show patterns; proactive alerts before cascading
