---
name: uvicorn
description: >-
  Deploy Python ASGI apps with Uvicorn. Use when a user asks to run FastAPI
  in production, configure an ASGI server, set up Gunicorn with Uvicorn
  workers, or optimize Python web server performance.
license: Apache-2.0
compatibility: 'Python 3.10+ (uvicorn 0.54), FastAPI, Starlette, Django ASGI'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/Kludex/uvicorn
  category: development
  tags:
    - uvicorn
    - asgi
    - fastapi
    - production
    - server
---

# Uvicorn

## Overview

Uvicorn is a fast ASGI server for Python. It is the usual way to run FastAPI, Starlette, and Django ASGI apps. For multiple cores you can use Uvicorn's own `--workers` option, or Gunicorn as the process manager with the `uvicorn-worker` package (Uvicorn 0.54, checked October 2026, requires Python 3.10+).

## Instructions

### Step 1: Development

```bash
pip install "uvicorn[standard]"

# Run with auto-reload (single process; --reload and --workers cannot be combined)
uvicorn app.main:app --reload --port 8000
```

### Step 2: Production with multiple workers

Simplest option, Uvicorn's own supervisor:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 --proxy-headers --forwarded-allow-ips 10.0.0.5
```

With Gunicorn (restarts workers that die, graceful reloads on SIGHUP). `uvicorn.workers.UvicornWorker` is deprecated; install the separate `uvicorn-worker` package and use `uvicorn_worker.UvicornWorker`:

```bash
pip install gunicorn uvicorn-worker

gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn_worker.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --graceful-timeout 30 \
  --access-logfile - \
  --error-logfile -
```

### Step 3: Docker Production

```dockerfile
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt   # includes gunicorn and uvicorn-worker

COPY . .

# Non-root user
RUN adduser --system --uid 1001 app
USER app

# Production command
CMD ["gunicorn", "app.main:app", \
     "--workers", "4", \
     "--worker-class", "uvicorn_worker.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120"]
```

### Step 4: Programmatic Configuration

```python
# run.py — Uvicorn with programmatic config
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        workers=4,
        log_level="info",
        access_log=True,
        proxy_headers=True,        # honour X-Forwarded-* (on by default)
        forwarded_allow_ips="10.0.0.5",  # only your proxy; default is 127.0.0.1
    )
```

## Examples

### Example 1: Run a FastAPI service behind nginx

**User request:** "Run my FastAPI app from app/main.py in production on a 4-core box behind nginx."

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 4 --proxy-headers --forwarded-allow-ips 127.0.0.1
curl -s http://127.0.0.1:8000/docs -o /dev/null -w "%{http_code}\n"
```

Expect `200`. Four worker processes appear under one parent in `ps`.

### Example 2: Switch from Gunicorn's old worker class

**User request:** "Gunicorn warns that uvicorn.workers is deprecated, fix it."

```bash
pip install uvicorn-worker
gunicorn app.main:app -k uvicorn_worker.UvicornWorker -w 4 -b 127.0.0.1:8000
```

The deprecation warning is gone and requests are served as before.

## Guidelines

- Development: `uvicorn --reload` (single process, auto-reload on file changes). Never use `--reload` in production.
- Worker count: start at the number of CPU cores (async workers do not need `2 x cores + 1`, which is advice for sync Gunicorn workers); measure, and mind the memory of each copy of your app.
- Run behind a reverse proxy (nginx, Caddy) for TLS and static files.
- Set `--forwarded-allow-ips` to your proxy's address, not `*`: any trusted client can spoof `X-Forwarded-For` and the scheme.
- In containers, run the server as PID 1 with the exec form of `CMD` so SIGTERM reaches it and shutdown is graceful.
- Install `uvicorn[standard]` for uvloop, httptools and websockets; plain `uvicorn` falls back to slower pure-Python parts.
- Do not combine `--workers` with `--reload`.
