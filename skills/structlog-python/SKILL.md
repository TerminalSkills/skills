---
name: structlog-python
description: >-
  Add structured logging to Python with structlog. Use when a user asks to
  implement structured logging, add context to Python logs, configure log
  processing pipelines, or replace standard logging with typed output.
license: Apache-2.0
compatibility: 'Python 3.8+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: observability
  tags:
    - structlog
    - logging
    - python
    - structured
    - observability
---

# structlog

## Overview

structlog adds structured, context-rich logging to Python. Instead of format strings, you pass key-value pairs that render as JSON (production) or colorized human-readable output (development). Bound loggers carry context across function calls.

## Instructions

### Step 1: Configuration

```python
# logging_config.py — structlog setup
import structlog
import logging
import sys

def setup_logging(environment: str = "development"):
    """Configure structlog for the application.

    Args:
        environment: 'development' for pretty output, 'production' for JSON
    """
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if environment == "production":
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(structlog.stdlib.ProcessorFormatter(
        processors=[*shared_processors, renderer],
    ))

    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)
```

### Step 2: Usage

```python
# services/orders.py — Structured logging in business logic
import structlog

log = structlog.get_logger()

async def process_order(order_id: str, user_id: str):
    # Bind context that carries through the entire function
    log_ctx = log.bind(order_id=order_id, user_id=user_id)

    log_ctx.info("Processing order")

    items = await fetch_order_items(order_id)
    log_ctx.info("Items fetched", item_count=len(items), total=sum(i.price for i in items))

    try:
        payment = await charge_payment(order_id)
        log_ctx.info("Payment charged", payment_id=payment.id, amount=payment.amount)
    except PaymentError as e:
        log_ctx.error("Payment failed", error=str(e), error_code=e.code)
        raise

    log_ctx.info("Order completed", status="success")
```

### Step 3: Request Context

```python
# middleware.py — Add request context to all logs
import structlog
from uuid import uuid4

async def logging_middleware(request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid4()))

    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        user_id=getattr(request.state, "user_id", None),
    )

    log = structlog.get_logger()
    log.info("Request started")

    response = await call_next(request)

    log.info("Request completed", status_code=response.status_code)
    response.headers["x-request-id"] = request_id
    return response
```

## Guidelines

- Use `contextvars` for request-scoped context — all logs in the request include requestId, userId.
- JSON output in production, pretty console in development — same code, different renderer.
- Bind context early (`log.bind(...)`) and it carries through all subsequent log calls.
- structlog wraps stdlib logging — it works with existing libraries that use `logging`.
- Log events, not strings: `log.info("order_processed", order_id=id)` not `log.info(f"Processed order {id}")`.
