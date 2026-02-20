---
name: uvicorn
description: >-
  Deploy Python ASGI apps with Uvicorn. Use when a user asks to run FastAPI
  in production, configure an ASGI server, set up Gunicorn with Uvicorn
  workers, or optimize Python web server performance.
license: Apache-2.0
compatibility: 'Python 3.8+, FastAPI, Starlette, Django ASGI'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - uvicorn
    - asgi
    - fastapi
    - production
    - server
---

# Uvicorn

## Overview

Uvicorn is a lightning-fast ASGI server for Python. It's the recommended way to run FastAPI, Starlette, and Django ASGI in production. For multi-core utilization, pair it with Gunicorn as a process manager.

## Instructions

### Step 1: Development

```bash
pip install uvicorn[standard]

# Run with auto-reload
uvicorn app.main:app --reload --port 8000
```

### Step 2: Production with Gunicorn

```bash
pip install gunicorn

# Gunicorn manages multiple Uvicorn worker processes
gunicorn app.main:app \
  --workers 4 \                    # CPU cores × 2 + 1
  --worker-class uvicorn.workers.UvicornWorker \
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
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Non-root user
RUN adduser --system --uid 1001 app
USER app

# Production command
CMD ["gunicorn", "app.main:app", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
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
        proxy_headers=True,        # trust X-Forwarded-* from reverse proxy
        forwarded_allow_ips="*",
    )
```

## Guidelines

- Development: `uvicorn --reload` (single process, auto-reload on file changes).
- Production: `gunicorn` with `UvicornWorker` class (multi-process, no reload).
- Workers formula: `(2 × CPU cores) + 1` — e.g., 4 cores → 9 workers.
- Always use behind a reverse proxy (nginx, Caddy) for TLS termination and static files.
- Set `proxy_headers=True` when behind a load balancer to get real client IPs.
