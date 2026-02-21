---
title: "Build a Multi-Protocol API Layer with REST, GraphQL, and gRPC"
slug: build-multi-protocol-api-layer
description: "Design an API that serves REST for public clients, GraphQL for frontends, and gRPC for internal microservices from a single shared service layer."
skills:
  - grpc
  - rest-api
  - graphql
category: development
tags:
  - api-design
  - grpc
  - graphql
  - rest
  - microservices
---

# Build a Multi-Protocol API Layer with REST, GraphQL, and gRPC

## The Problem

Your platform has three types of consumers with conflicting needs. The mobile app wants a flexible GraphQL endpoint to fetch exactly the data each screen needs without over-fetching. Third-party partners demand a stable versioned REST API with OpenAPI documentation. Internal microservices need low-latency, type-safe communication with streaming support for real-time order updates. Building and maintaining three completely separate API implementations triples the surface area for bugs and drift.

## The Solution

Use the **rest-api** skill to design the public REST endpoints with proper versioning, the **graphql** skill to build the flexible query layer for frontends, and the **grpc** skill to set up internal service-to-service communication with Protocol Buffers. All three protocols share a single service layer so business logic is written once.

## Step-by-Step Walkthrough

### 1. Design the shared service layer

Define the core business logic independent of any transport protocol.

> Create a service layer for our order management system with methods for createOrder, getOrder, listOrders, and updateOrderStatus. Each method should accept plain TypeScript types and return plain objects. No HTTP, no GraphQL, no Protobuf -- just business logic and database calls.

This layer becomes the single source of truth that all three protocols delegate to.

### 2. Build the REST API for external partners

Partners need stable, versioned endpoints with comprehensive documentation.

> Wrap the order service in a REST API with versioned routes under /api/v1/. Include pagination with cursor-based navigation, proper HTTP status codes, and rate limiting at 100 requests per minute per API key. Generate an OpenAPI 3.1 spec from the route definitions.

### 3. Add the GraphQL layer for frontends

The mobile app fetches orders, customer details, and shipping status in a single query instead of three REST calls.

> Create a GraphQL schema for orders that includes nested resolvers for customer and shipment data. Add DataLoader to batch database queries and prevent N+1 problems. The mobile app needs to subscribe to order status changes in real time using GraphQL subscriptions.

### 4. Set up gRPC for internal services

The inventory and payment services communicate with the order service thousands of times per second.

> Define Protocol Buffer messages and service definitions for the order service. Set up bidirectional streaming for real-time order status updates between the order service and the shipping tracker. Include deadline propagation and retry policies for transient failures.

## Real-World Example

An e-commerce company serving 50,000 daily orders had a REST-only API. The mobile team complained about 6 sequential requests to render the order detail screen, adding 800ms of latency. Internal services were parsing JSON at 2,000 requests per second and hitting CPU limits. The team introduced GraphQL for the mobile app, cutting order detail load to a single request, and gRPC for internal communication, handling 15,000 requests per second on the same hardware. The shared service layer meant every bug fix applied to all three protocols simultaneously.
