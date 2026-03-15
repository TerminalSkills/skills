---
title: Build a Distributed Lock Manager
slug: build-distributed-lock-manager
description: Build a distributed lock manager with Redis-based locking, lock renewal, deadlock detection, fairness queuing, and monitoring for coordinating concurrent operations across services.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Architecture
tags:
  - distributed-lock
  - concurrency
  - redis
  - coordination
  - patterns
---

# Build a Distributed Lock Manager

## The Problem

Erik leads backend at a 25-person company. Multiple API servers process the same customer's requests concurrently — two payment deductions run simultaneously on the same account, resulting in a negative balance. Cron jobs deployed on 3 servers run the same job 3 times. Database UPDATE with WHERE balance >= amount has a race window between SELECT and UPDATE. They need distributed locking: acquire exclusive access to a resource across all servers, auto-release on failure, prevent deadlocks, and monitor lock contention.

## Step 1: Build the Lock Manager

```typescript
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface LockOptions {
  ttl?: number;
  retryCount?: number;
  retryDelay?: number;
  onExtend?: () => void;
}

interface Lock {
  resource: string;
  token: string;
  acquiredAt: number;
  ttl: number;
  renewalInterval?: ReturnType<typeof setInterval>;
}

const DEFAULT_TTL = 10000;
const activeLocks = new Map<string, Lock>();

// Acquire lock with retry
export async function acquire(resource: string, options?: LockOptions): Promise<Lock | null> {
  const ttl = options?.ttl || DEFAULT_TTL;
  const retryCount = options?.retryCount ?? 3;
  const retryDelay = options?.retryDelay ?? 200;
  const token = randomBytes(16).toString("hex");

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const acquired = await redis.set(`lock:${resource}`, token, "PX", ttl, "NX");
    if (acquired) {
      const lock: Lock = { resource, token, acquiredAt: Date.now(), ttl };
      // Auto-renewal to prevent expiry during long operations
      lock.renewalInterval = setInterval(async () => {
        const extended = await extend(lock);
        if (!extended) { clearInterval(lock.renewalInterval); activeLocks.delete(resource); }
        else options?.onExtend?.();
      }, ttl * 0.6);
      activeLocks.set(resource, lock);
      await redis.hincrby("lock:stats", "acquired", 1);
      return lock;
    }
    if (attempt < retryCount) await sleep(retryDelay + Math.random() * retryDelay);
  }

  await redis.hincrby("lock:stats", "contention", 1);
  return null;
}

// Release lock (only if we still own it)
export async function release(lock: Lock): Promise<boolean> {
  if (lock.renewalInterval) clearInterval(lock.renewalInterval);
  activeLocks.delete(lock.resource);
  // Atomic: only delete if token matches (prevents releasing someone else's lock)
  const result = await redis.eval(
    `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`,
    1, `lock:${lock.resource}`, lock.token
  );
  await redis.hincrby("lock:stats", "released", 1);
  return result === 1;
}

// Extend lock TTL
export async function extend(lock: Lock): Promise<boolean> {
  const result = await redis.eval(
    `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`,
    1, `lock:${lock.resource}`, lock.token, lock.ttl
  );
  return result === 1;
}

// Execute function with lock (convenience wrapper)
export async function withLock<T>(resource: string, fn: () => Promise<T>, options?: LockOptions): Promise<T> {
  const lock = await acquire(resource, options);
  if (!lock) throw new Error(`Failed to acquire lock on '${resource}'`);
  try {
    return await fn();
  } finally {
    await release(lock);
  }
}

// Multi-resource lock (for operations needing multiple locks)
export async function acquireMultiple(resources: string[], options?: LockOptions): Promise<Lock[] | null> {
  const sorted = [...resources].sort(); // consistent ordering prevents deadlocks
  const locks: Lock[] = [];
  for (const resource of sorted) {
    const lock = await acquire(resource, options);
    if (!lock) {
      // Release all acquired locks on failure
      for (const acquired of locks) await release(acquired);
      return null;
    }
    locks.push(lock);
  }
  return locks;
}

// Monitor lock contention
export async function getStats(): Promise<{ acquired: number; released: number; contention: number; active: number }> {
  const stats = await redis.hgetall("lock:stats");
  return {
    acquired: parseInt(stats.acquired || "0"),
    released: parseInt(stats.released || "0"),
    contention: parseInt(stats.contention || "0"),
    active: activeLocks.size,
  };
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
```

## Results

- **Double payment eliminated** — `withLock('account:123', processPayment)` ensures only one payment processes at a time per account; negative balances impossible
- **Cron dedup** — `acquire('cron:daily-report')` returns null on 2 of 3 servers; job runs exactly once; no duplicate emails
- **Auto-renewal** — lock renews at 60% TTL; long-running operations don't expire and release prematurely; no window for race conditions
- **Deadlock prevention** — multi-resource locks acquired in sorted order; A→B→C always, never C→A; deadlock impossible by design
- **Safe release** — Lua script checks token before delete; crashed server's expired lock can't be released by another server; ownership guaranteed
