---
name: redis
description: >-
  Redis is an in-memory data store used as a cache, session store, message
  broker and counter service. Use when adding a cache layer, storing sessions,
  rate limiting an API, running pub/sub or Streams with consumer groups,
  taking a distributed lock, building a leaderboard, or configuring Redis for
  production (persistence, maxmemory, eviction).
license: Apache-2.0
compatibility: "Redis 7+ or Valkey; redis-py 8 (Python 3.10+) or ioredis 6 / node-redis 6 for Node.js"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/redis/redis
  tags: ["redis", "caching", "database", "pub-sub", "queues"]
---

# Redis

## Overview

Redis keeps data structures (strings, hashes, sets, sorted sets, streams) in memory and answers commands over TCP on port 6379. Typical uses: a cache in front of a database, expiring sessions, counters and rate limits, queues and event streams, locks, and leaderboards. Licensing: Redis 7.2 and earlier are BSD; Redis 8 is released under RSALv2, SSPLv1 or AGPLv3 at your option. Valkey is a BSD-licensed fork with the same protocol; every command below works on both.

## Instructions

### Run it locally

Publish the port on loopback only, require a password, and pass the password through the environment so it does not sit in the process list or shell history:

```bash
export REDIS_PASSWORD="$(openssl rand -hex 16)"
docker run -d --name redis-dev -p 127.0.0.1:6379:6379 -e REDIS_PASSWORD \
  -v redis-data:/data redis:8-alpine \
  sh -c 'exec redis-server --appendonly yes --requirepass "$REDIS_PASSWORD"'
docker exec redis-dev sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping'
```

The last command prints `PONG`. Never publish Redis on `0.0.0.0` or the public internet; Redis has no TLS or access control worth trusting without configuration.

### Connect

```python
import os
import redis

# One client per process: it owns a connection pool (default is unlimited, so cap it).
r = redis.Redis(host="127.0.0.1", port=6379, password=os.environ["REDIS_PASSWORD"],
                decode_responses=True, max_connections=20)
r.ping()  # True
```

```javascript
import Redis from 'ioredis';
const redis = new Redis({
  host: '127.0.0.1', port: 6379, password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});
```

The official client for Node.js is `redis` (node-redis): `createClient({ url })`, then `await client.connect()`; commands take options such as `client.set(k, v, { expiration: { type: 'EX', value: 60 } })` (the flat `{ EX: 60 }` form is deprecated).

### Cache-aside

Read the cache first, fall back to the database, store with a TTL, and delete the key on writes:

```python
import json

def get_user(user_id: int) -> dict:
    key = f"user:{user_id}"
    cached = r.get(key)
    if cached:
        return json.loads(cached)
    user = db.fetch_user(user_id)          # your data layer
    r.set(key, json.dumps(user), ex=3600)  # SET ... EX replaces the older SETEX
    return user

def update_user(user_id: int, fields: dict):
    db.update_user(user_id, fields)
    r.delete(f"user:{user_id}")            # next read repopulates
```

Write-through (write the database, then `r.set(key, ..., ex=7200)`) keeps the cache warm but the two writes are not atomic; if the cache write fails the entry stays stale until the TTL ends, so always set a TTL.

### Sessions

`GETEX` reads and refreshes the TTL in one command (sliding expiry); a per-user set allows "log out everywhere":

```python
import json, secrets, time

SESSION_TTL = 86400

def create_session(user_id: int, metadata: dict | None = None) -> str:
    token = secrets.token_urlsafe(32)
    data = {"user_id": user_id, "created_at": time.time(), **(metadata or {})}
    pipe = r.pipeline()
    pipe.set(f"session:{token}", json.dumps(data), ex=SESSION_TTL)
    pipe.sadd(f"user_sessions:{user_id}", token)
    pipe.expire(f"user_sessions:{user_id}", SESSION_TTL)
    pipe.execute()
    return token

def get_session(token: str) -> dict | None:
    data = r.getex(f"session:{token}", ex=SESSION_TTL)
    return json.loads(data) if data else None

def destroy_all_sessions(user_id: int):
    tokens = r.smembers(f"user_sessions:{user_id}")
    if tokens:
        r.delete(*[f"session:{t}" for t in tokens])
    r.delete(f"user_sessions:{user_id}")
```

### Sliding-window rate limit

The member must be unique per request, or two requests in the same instant collapse into one entry. Rejected requests are also counted, which is usually what you want against abuse:

```python
import time, uuid

def is_rate_limited(key: str, limit: int, window_seconds: int) -> bool:
    now = time.time()
    rk = f"ratelimit:{key}"
    pipe = r.pipeline()  # runs as MULTI/EXEC
    pipe.zremrangebyscore(rk, 0, now - window_seconds)
    pipe.zadd(rk, {f"{now}:{uuid.uuid4().hex[:8]}": now})
    pipe.zcard(rk)
    pipe.expire(rk, window_seconds)
    return pipe.execute()[2] > limit
```

For a cheaper fixed window use `INCR` plus `EXPIRE ... NX` on a per-window key.

### Pub/sub

Pub/sub is fire-and-forget: a subscriber that is offline misses the message. `run_in_thread` handles the listener loop; call `thread.stop()` to shut down (it closes the subscription itself):

```python
pubsub = r.pubsub(ignore_subscribe_messages=True)
pubsub.psubscribe(**{"notifications:*": lambda m: print(m["channel"], json.loads(m["data"]))})
thread = pubsub.run_in_thread(sleep_time=0.05, daemon=True)
r.publish("notifications:user:123", json.dumps({"type": "invoice_paid"}))
```

### Streams with consumer groups

Use Streams when messages must survive restarts and be acknowledged:

```python
try:
    r.xgroup_create("orders", "billing", id="$", mkstream=True)
except redis.ResponseError as e:
    if "BUSYGROUP" not in str(e):
        raise

r.xadd("orders", {"order_id": "A-1001", "total": "49.99"}, maxlen=10000, approximate=True)

for _stream, entries in r.xreadgroup("billing", "worker-1", {"orders": ">"}, count=10, block=5000) or []:
    for entry_id, fields in entries:
        handle(fields)
        r.xack("orders", "billing", entry_id)

# Take over entries a crashed worker never acknowledged
r.xautoclaim("orders", "billing", "worker-2", min_idle_time=60_000, start_id="0-0", count=10)
```

### Lock on one Redis instance

`SET key token NX EX` acquires; a Lua script releases only if you still own it. This protects against a crashed holder but is not Redlock: it is unsafe across failover and for long critical sections, so use a fencing token on the protected resource when correctness matters:

```python
import secrets

release = r.register_script("""
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
""")

def acquire_lock(name: str, timeout: int = 10) -> str | None:
    token = secrets.token_urlsafe(16)
    return token if r.set(f"lock:{name}", token, nx=True, ex=timeout) else None

def release_lock(name: str, token: str) -> bool:
    return release(keys=[f"lock:{name}"], args=[token]) == 1
```

### Leaderboard

```python
r.zadd("leaderboard:weekly", {"ana": 1200, "bo": 900, "cy": 1500})
r.zrange("leaderboard:weekly", 0, 2, desc=True, withscores=True)  # top 3: cy, ana, bo
r.zrevrank("leaderboard:weekly", "ana")                           # 1 (zero-based)
```

`ZRANGE ... REV` (`desc=True`) replaces the deprecated `ZREVRANGE`.

### Production settings

Set `maxmemory` always. Choose the policy by role: `allkeys-lru` for a pure cache; `noeviction` (or `volatile-lru` with TTLs on everything evictable) when Redis holds sessions, streams or locks that must not disappear. Use `appendonly yes` with `appendfsync everysec` when the data matters. Put Redis on a private network, require `requirepass` or ACL users (`ACL SETUSER`), and disable dangerous commands for app users through ACLs rather than renaming them.

## Examples

### Example 1: Cache a slow product lookup

**User request:** "Our /products/:id endpoint hits Postgres every time. Add Redis caching and make sure edits show up."

Apply the cache-aside code with key `product:{id}` and a 10-minute TTL, and call `r.delete(f"product:{id}")` inside the update handler after the database commit. Check with `redis-cli -a "$REDIS_PASSWORD" --no-auth-warning TTL product:981`, which prints a number below 600 after the first read and `-2` after an update.

### Example 2: Throttle an API key

**User request:** "Limit each API key to 100 requests per minute."

Call `is_rate_limited(f"key:{api_key_id}", 100, 60)` at the start of the request; on `True` return HTTP 429 with a `Retry-After: 60` header. Tested with limit 3: the calls return `[False, False, False, True, True]`.

## Guidelines

- Give every cache key a TTL (`SET ... EX`); keys without one grow until `maxmemory` is reached.
- Use `SCAN` (`r.scan_iter("ratelimit:*", count=100)`) instead of `KEYS`, which blocks the server on large datasets.
- Pipeline batches of commands to save round trips; use Lua scripts or `MULTI` for read-modify-write steps.
- Redis runs commands on one thread: one slow script, a huge `SMEMBERS` or `DEL` of a big key blocks everyone. Use `UNLINK` for large keys.
- Keep values small; store large blobs elsewhere and cache the reference.
- Name keys with colons (`user:123:profile`) so tools and ACL patterns can group them.
- Watch `INFO memory`, `evicted_keys` and `connected_clients`; alert before memory reaches `maxmemory`.
- Do not use Redis as the only copy of data you cannot rebuild unless persistence and backups are configured and tested.
