---
name: locust
description: When the user wants to perform load testing using Python with Locust's distributed architecture and real-time web UI. Also use when the user mentions "locust," "Python load testing," "distributed load test," "locust web UI," or "locustfile." For JavaScript-based load testing, see k6 or artillery.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - load-testing
    - python
    - distributed
    - performance
---

# Locust

## Overview

You are an expert in Locust, the Python-based load testing framework. You help users write locustfiles that define user behavior as Python code, configure distributed load generation across multiple machines, use the real-time web UI for monitoring, and integrate Locust into CI pipelines in headless mode. You understand Locust's event hooks, task weighting, and custom load shapes.

## Instructions

### Initial Assessment

Before writing a locustfile:

1. **Target** — What service or API are you testing?
2. **User behavior** — What does a typical user session look like?
3. **Scale** — How many concurrent users? Distributed across machines?
4. **Mode** — Interactive (web UI) or headless (CI)?

### Basic Locustfile

```python
# locustfile.py — Basic Locust load test for an e-commerce API.
# Simulates users browsing products and adding items to cart.
from locust import HttpUser, task, between

class WebsiteUser(HttpUser):
    wait_time = between(1, 3)
    host = "https://api.example.com"

    def on_start(self):
        """Called when a simulated user starts. Login once per user."""
        self.client.post("/login", json={
            "username": "testuser",
            "password": "testpass"
        })

    @task(3)
    def browse_products(self):
        self.client.get("/products")

    @task(2)
    def view_product(self):
        self.client.get("/products/1")

    @task(1)
    def add_to_cart(self):
        self.client.post("/cart", json={"product_id": 1, "quantity": 1})
```

### Custom Load Shapes

```python
# load_shape.py — Custom load shape that simulates daily traffic patterns.
# Ramps up in the morning, peaks at noon, drops in the evening.
from locust import HttpUser, task, between, LoadTestShape

class ApiUser(HttpUser):
    wait_time = between(1, 5)

    @task
    def get_data(self):
        self.client.get("/api/data")

class DailyTrafficShape(LoadTestShape):
    stages = [
        {"duration": 60, "users": 20, "spawn_rate": 5},
        {"duration": 120, "users": 100, "spawn_rate": 10},
        {"duration": 180, "users": 200, "spawn_rate": 20},
        {"duration": 120, "users": 100, "spawn_rate": 10},
        {"duration": 60, "users": 0, "spawn_rate": 20},
    ]

    def tick(self):
        run_time = self.get_run_time()
        elapsed = 0
        for stage in self.stages:
            elapsed += stage["duration"]
            if run_time < elapsed:
                return (stage["users"], stage["spawn_rate"])
        return None
```

### Distributed Testing

```bash
# distributed-run.sh — Run Locust in distributed mode across multiple machines.
# One master coordinates, workers generate the actual load.

# Install
pip install locust

# Start master (web UI on port 8089)
locust --master --host https://api.example.com

# Start workers (run on each worker machine)
locust --worker --master-host=192.168.1.100

# Headless distributed run
locust --master --headless -u 1000 -r 50 --run-time 5m \
  --expect-workers 4 --host https://api.example.com
```

### Event Hooks

```python
# events_example.py — Using Locust event hooks for custom reporting.
# Logs failures to a file and sends alerts on high error rates.
from locust import HttpUser, task, between, events
import logging

logger = logging.getLogger("locust_custom")

@events.request.add_listener
def on_request(request_type, name, response_time, response_length, exception, **kwargs):
    if exception:
        logger.error(f"FAILED: {request_type} {name} - {exception}")

@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    stats = environment.runner.stats
    total = stats.total
    if total.fail_ratio > 0.05:
        logger.critical(f"ALERT: Error rate {total.fail_ratio:.1%} exceeds 5% threshold")

class ApiUser(HttpUser):
    wait_time = between(1, 3)

    @task
    def get_endpoint(self):
        self.client.get("/api/health")
```

### Headless CI Mode

```yaml
# .github/workflows/locust.yml — Run Locust headless in GitHub Actions.
# Exports CSV results as pipeline artifacts.
name: Load Test
on:
  push:
    branches: [main]
jobs:
  locust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install locust
      - run: |
          locust --headless -u 50 -r 10 --run-time 2m \
            --host https://api.example.com \
            --csv results \
            -f tests/locustfile.py
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: locust-results
          path: results_*.csv
```
