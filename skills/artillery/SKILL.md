---
name: artillery
description: When the user wants to perform load testing or performance testing using Artillery with YAML-based scenario definitions. Also use when the user mentions "artillery," "YAML load test," "WebSocket testing," "Socket.io load test," "scenario-based load testing," or "artillery run." For JavaScript-based load testing, see k6.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - load-testing
    - performance
    - websocket
    - yaml
---

# Artillery

## Overview

You are an expert in Artillery, the modern load testing toolkit. You help users define test scenarios in YAML, configure phases for ramping traffic, test HTTP APIs and WebSocket/Socket.io services, write custom JavaScript functions for complex flows, and generate HTML reports. You understand Artillery's plugin ecosystem and CI integration.

## Instructions

### Initial Assessment

Before creating a test scenario:

1. **Protocol** — HTTP, WebSocket, Socket.io, or gRPC?
2. **Flow** — Single endpoint or multi-step user journey?
3. **Load profile** — Constant rate, ramp-up, or phased?
4. **Success criteria** — Acceptable latency, error rate?

### Basic HTTP Load Test

```yaml
# load-test.yml — Artillery scenario testing an HTTP API.
# Ramps from 5 to 50 requests per second over 3 phases.
config:
  target: "https://api.example.com"
  phases:
    - duration: 60
      arrivalRate: 5
      name: "Warm up"
    - duration: 120
      arrivalRate: 25
      name: "Ramp up"
    - duration: 60
      arrivalRate: 50
      name: "Peak load"
  defaults:
    headers:
      Content-Type: "application/json"

scenarios:
  - name: "Browse and purchase"
    flow:
      - get:
          url: "/products"
          capture:
            - json: "$.products[0].id"
              as: "productId"
      - think: 2
      - get:
          url: "/products/{{ productId }}"
      - think: 1
      - post:
          url: "/cart"
          json:
            productId: "{{ productId }}"
            quantity: 1
```

### WebSocket Testing

```yaml
# websocket-test.yml — Artillery scenario testing a WebSocket server.
# Connects, sends messages, and validates responses.
config:
  target: "wss://ws.example.com"
  phases:
    - duration: 60
      arrivalRate: 10
  engines:
    ws: {}

scenarios:
  - engine: "ws"
    flow:
      - send:
          payload: '{"type": "subscribe", "channel": "updates"}'
      - think: 1
      - send:
          payload: '{"type": "message", "text": "hello"}'
      - think: 5
```

### Socket.io Testing

```yaml
# socketio-test.yml — Artillery scenario for Socket.io real-time apps.
# Simulates users joining rooms and exchanging messages.
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 20
  engines:
    socketio:
      transports: ["websocket"]

scenarios:
  - engine: "socketio"
    flow:
      - emit:
          channel: "join"
          data:
            room: "general"
            username: "user_{{ $randomNumber(1, 1000) }}"
      - think: 2
      - emit:
          channel: "message"
          data:
            text: "Hello from Artillery"
      - think: 3
```

### Custom JavaScript Functions

```yaml
# custom-flow.yml — Artillery scenario with custom JS processing.
# Uses beforeRequest and afterResponse hooks for dynamic data.
config:
  target: "https://api.example.com"
  phases:
    - duration: 120
      arrivalRate: 10
  processor: "./helpers.js"

scenarios:
  - flow:
      - function: "generateUser"
      - post:
          url: "/users"
          json:
            name: "{{ name }}"
            email: "{{ email }}"
          beforeRequest: "addAuthToken"
          afterResponse: "logResponse"
```

```javascript
// helpers.js — Custom Artillery processor functions.
// Generates dynamic data and handles auth tokens.
module.exports = {
  generateUser(context, events, done) {
    context.vars.name = `user_${Date.now()}`;
    context.vars.email = `user_${Date.now()}@test.com`;
    return done();
  },
  addAuthToken(req, context, events, done) {
    req.headers = req.headers || {};
    req.headers['Authorization'] = `Bearer ${context.vars.token || 'test-token'}`;
    return done();
  },
  logResponse(req, res, context, events, done) {
    if (res.statusCode !== 200) {
      console.log(`Error: ${res.statusCode} on ${req.url}`);
    }
    return done();
  },
};
```

### Running Artillery

```bash
# run-artillery.sh — Common Artillery commands.
# Install, run tests, and generate reports.

# Install
npm install -g artillery

# Run a test
artillery run load-test.yml

# Generate HTML report
artillery run --output results.json load-test.yml
artillery report results.json --output report.html

# Quick test (no YAML needed)
artillery quick --count 100 --num 10 https://api.example.com/health
```

### CI Integration

```yaml
# .github/workflows/artillery.yml — Run Artillery in GitHub Actions.
# Posts HTML report as an artifact.
name: Load Test
on:
  push:
    branches: [main]
jobs:
  artillery:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g artillery
      - run: artillery run --output results.json tests/load-test.yml
      - run: artillery report results.json --output report.html
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: artillery-report
          path: report.html
```
