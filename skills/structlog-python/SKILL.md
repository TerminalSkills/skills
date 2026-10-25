---
name: structlog-python
description: >-
  Add structured logging to Python with structlog: key-value events rendered as JSON in production or colored console lines in development, request-scoped context through contextvars, and standard-library integration so third-party library logs share the same format. Use when a user asks to implement structured logging, add request IDs or context to Python logs, configure log processors, or replace print and logging format strings in a FastAPI or Flask service.
license: Apache-2.0
compatibility: "Python 3.10+, structlog 26.x (tested on 26.1.0)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/hynek/structlog
  tags: "structlog, logging, python, structured, observability"
---

# structlog

## Overview

structlog adds structured, context-rich logging to Python. Instead of format strings, you pass key-value pairs that render as JSON (production) or colored console lines (development). Bound loggers and `contextvars` carry context such as a request ID across function calls, and the standard-library integration routes logs from other libraries through the same pipeline. Install with `pip install structlog`; release 26.1 needs Python 3.10 or newer (3.8 and 3.9 support was removed).

## Instructions

### Step 1: Configuration

Call this once at startup. Logs from structlog and from plain `logging` loggers (database drivers, SDKs) end up in the same renderer: `foreign_pre_chain` runs the shared processors on standard-library records, and `remove_processors_meta` strips structlog's internal keys before rendering.

```python
# logging_config.py: structlog setup
import logging
import sys

import structlog


def setup_logging(environment: str = "development", level: int = logging.INFO) -> None:
    """'development' prints colored console lines, anything else prints JSON."""
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
    ]

    if environment == "development":
        renderer = structlog.dev.ConsoleRenderer()
    else:
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.format_exc_info,   # exceptions as a string field in JSON
            renderer,
        ],
    ))

    root = logging.getLogger()
    root.handlers.clear()          # safe to call twice, no duplicated lines
    root.addHandler(handler)
    root.setLevel(level)
```

### Step 2: Usage

```python
# services/orders.py: structured logging in business logic
import structlog

log = structlog.get_logger(__name__)


async def process_order(order_id: str, user_id: str):
    # bind() returns a new logger carrying this context
    order_log = log.bind(order_id=order_id, user_id=user_id)
    order_log.info("order_processing_started")

    items = await fetch_order_items(order_id)
    order_log.info("items_fetched", item_count=len(items), total=sum(i.price for i in items))

    try:
        payment = await charge_payment(order_id)
        order_log.info("payment_charged", payment_id=payment.id, amount=payment.amount)
    except PaymentError as exc:
        order_log.exception("payment_failed", error_code=exc.code)   # includes the traceback
        raise

    order_log.info("order_completed", status="success")
```

### Step 3: Request context (FastAPI)

`bind_contextvars` stores values per request task; `merge_contextvars` in Step 1 adds them to every event, including those from standard-library loggers.

```python
# main.py: add request context to all logs
from uuid import uuid4

import structlog
from fastapi import FastAPI, Request

from logging_config import setup_logging

setup_logging("production")
log = structlog.get_logger(__name__)
app = FastAPI()


@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid4()))

    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        method=request.method,
        path=request.url.path,
    )

    log.info("request_started")
    response = await call_next(request)
    log.info("request_completed", status_code=response.status_code)
    response.headers["x-request-id"] = request_id
    return response
```

## Examples

### Example 1: "Make our logs JSON with a request ID"

After Steps 1 and 3, a route handler for `GET /orders/{order_id}` that calls `log.info("order_fetched", order_id=order_id, item_count=3)` and a request with header `x-request-id: req-77` print one JSON object per line (plus a `request_started` line first, omitted here):

```console
{"order_id": "A-1001", "item_count": 3, "event": "order_fetched", "request_id": "req-77", "path": "/orders/A-1001", "method": "GET", "logger": "services.orders", "level": "info", "timestamp": "2026-10-24T19:18:26.776495Z"}
{"status_code": 200, "event": "request_completed", "request_id": "req-77", "path": "/orders/A-1001", "method": "GET", "logger": "main", "level": "info", "timestamp": "2026-10-24T19:18:26.776820Z"}
```

### Example 2: "A library logs with the standard logging module and has no request ID"

With `foreign_pre_chain` in place, a plain `logging.getLogger("billing.sdk").warning("legacy library message")` inside the same request is rendered by the same pipeline and carries the context:

```console
{"event": "legacy library message", "request_id": "req-77", "path": "/orders/A-1001", "method": "GET", "logger": "billing.sdk", "level": "warning", "timestamp": "2026-10-24T19:18:26.776565Z"}
```

Run `setup_logging("development")` locally to get the same events as colored console lines with tracebacks.

## Guidelines

- Log events, not sentences: `log.info("order_processed", order_id=order_id)` rather than `log.info(f"Processed order {order_id}")`. Event names stay searchable.
- Use `contextvars` (not `bind`) for request-scoped context so every log in the request includes it, and call `clear_contextvars()` at the start of each request.
- `cache_logger_on_first_use=True` speeds up logging but means `structlog.configure` must run before the first log call.
- Use `log.exception(...)` inside `except` blocks to attach the traceback; in JSON mode `format_exc_info` turns it into a string field.
- Never log secrets, tokens or full request bodies; add a small processor that drops or masks such keys if needed.
