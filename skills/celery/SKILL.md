---
name: celery
description: >-
  Run background tasks in Python with Celery. Use when a user asks to process
  tasks asynchronously, schedule periodic jobs, run background workers, build
  task queues in Python, or offload heavy processing from web requests.
license: Apache-2.0
compatibility: 'Python 3.8+, Django, Flask, FastAPI'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - celery
    - python
    - tasks
    - queue
    - background
---

# Celery

## Overview

Celery is the standard Python library for distributed task processing. Offload slow operations (email sending, report generation, image processing) from web requests to background workers. Supports task retries, scheduling, rate limiting, and chaining.

## Instructions

### Step 1: Setup

```bash
pip install celery[redis]
```

```python
# celery_app.py — Celery application configuration
from celery import Celery

app = Celery(
    'myapp',
    broker='redis://localhost:6379/0',       # message broker
    backend='redis://localhost:6379/1',       # result storage
)

app.conf.update(
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='UTC',
    task_acks_late=True,                     # ack after processing (safer)
    worker_prefetch_multiplier=1,            # one task at a time per worker
)
```

### Step 2: Define Tasks

```python
# tasks.py — Background task definitions
from celery_app import app
from celery import shared_task
import time

@app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_welcome_email(self, user_id: int):
    """Send welcome email to new user.

    Args:
        user_id: Database ID of the newly registered user
    """
    try:
        user = get_user(user_id)
        send_email(
            to=user.email,
            subject='Welcome!',
            body=render_template('welcome.html', user=user),
        )
    except EmailServiceError as exc:
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@app.task(rate_limit='10/m')    # max 10 per minute
def process_image(image_path: str, output_path: str):
    """Resize and optimize uploaded image."""
    img = Image.open(image_path)
    img.thumbnail((1200, 1200))
    img.save(output_path, optimize=True, quality=85)
    return output_path


@app.task
def generate_report(org_id: int, start_date: str, end_date: str):
    """Generate analytics report (may take several minutes)."""
    data = fetch_analytics(org_id, start_date, end_date)
    pdf_path = render_pdf_report(data)
    notify_user(org_id, pdf_path)
    return pdf_path
```

### Step 3: Call Tasks

```python
# In your web handler (Django view, FastAPI endpoint, etc.)
from tasks import send_welcome_email, generate_report
from celery import chain, group

# Fire and forget
send_welcome_email.delay(user.id)

# Get result later
result = generate_report.delay(org.id, '2025-01-01', '2025-01-31')
print(result.status)      # PENDING → STARTED → SUCCESS
print(result.get())        # blocks until done

# Chain: task1 result feeds into task2
chain(extract_data.s(url), transform_data.s(), load_data.s())()

# Group: run tasks in parallel
group(process_image.s(path) for path in image_paths)()
```

### Step 4: Run Workers

```bash
celery -A celery_app worker --loglevel=info --concurrency=4
celery -A celery_app beat --loglevel=info    # for periodic tasks
```

## Guidelines

- Always use `task_acks_late=True` for reliability — tasks survive worker crashes.
- Use `bind=True` and `self.retry()` for automatic retry with backoff.
- Redis is the simplest broker; RabbitMQ is more robust for production.
- Monitor with Flower: `celery -A celery_app flower` (web dashboard on port 5555).
