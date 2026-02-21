---
title: "Configure Infrastructure Rate Limiting Across Proxy, Gateway, and CDN"
slug: configure-infrastructure-rate-limiting-across-layers
description: "Set up layered rate limiting at Nginx, API gateway, and CDN levels to protect APIs from abuse without touching application code."
skills:
  - infra-rate-limiting
  - rate-limiter
  - load-balancer
category: devops
tags:
  - rate-limiting
  - nginx
  - api-gateway
  - cdn
  - infrastructure
---

# Configure Infrastructure Rate Limiting Across Proxy, Gateway, and CDN

## The Problem

Your API is getting hammered by scrapers and misbehaving clients. The application-level rate limiter catches some abuse, but by the time requests hit your app server they've already consumed CPU, memory, and database connections. You need rate limiting at the infrastructure layer — Nginx, API gateway, CDN — so bad traffic gets dropped before it reaches your application. Configuring rate limits across three layers without accidentally blocking legitimate users is error-prone and hard to test.

## The Solution

Use **infra-rate-limiting** to configure Nginx rate zones, API gateway throttling policies, and CDN-level rules, **rate-limiter** for application-layer per-user limits that complement the infrastructure rules, and **load-balancer** to distribute surviving traffic across healthy backends. Together these create a defense-in-depth setup where each layer catches what the one above missed.

## Step-by-Step Walkthrough

### 1. Audit current traffic patterns

> Analyze our Nginx access logs from the last 7 days. Show me the top 50 IPs by request count, requests per second peaks, and which endpoints get the most traffic. Identify any IPs that look like scrapers or bots.

The agent parses logs and identifies that 12 IPs account for 40% of all traffic, most hitting the search endpoint at 200+ requests per second.

### 2. Configure Nginx rate zones

> Set up Nginx rate limiting with three zones: a global zone of 100 req/s per IP, a strict zone of 10 req/s for /api/search, and a burst allowance of 20 for authenticated users. Use the leaky bucket algorithm.

The agent generates the `limit_req_zone` directives and location blocks with proper burst and nodelay settings, plus a whitelist for monitoring IPs.

### 3. Add API gateway throttling

> Configure our Kong API gateway with tiered throttling: free tier gets 60 requests per minute, pro tier gets 600, and enterprise gets 6000. Add a global rate limit of 10,000 req/min across all consumers.

The agent creates Kong rate-limiting plugin configurations per consumer group with proper Redis-backed counters for distributed counting across gateway instances.

### 4. Set up CDN-level rules

> Add Cloudflare rate limiting rules: block any IP sending more than 500 requests per 10 seconds to our API subdomain. Add a challenge page for IPs exceeding 200 requests per 10 seconds. Whitelist our CI/CD IP ranges.

The agent configures Cloudflare WAF custom rules and rate limiting rules via the API, with proper action escalation from challenge to block.

### 5. Test the layered setup

> Run a load test against staging that simulates normal users at 50 req/s, aggressive scrapers at 500 req/s, and a burst scenario of 1000 req/s for 10 seconds. Verify each layer triggers at the right threshold and legitimate traffic passes through.

The agent runs graduated load tests and reports which layer caught each type of abuse, confirming no false positives on normal traffic patterns.

## Real-World Example

A fintech startup's public API was being scraped by competitors, causing response times to spike to 3 seconds during business hours. They used the infra-rate-limiting skill to add Nginx rate zones (dropping 80% of scraper traffic before it hit the app), Kong throttling per API key tier, and Cloudflare rules for volumetric attacks. After deploying the three-layer setup, p99 latency dropped from 3.1 seconds to 180ms and their monthly bandwidth bill decreased by 35%. The application-level rate limiter now only handles per-user fairness logic, not abuse prevention.
