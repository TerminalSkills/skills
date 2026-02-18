---
title: "Design a Microservices API Layer with REST and gRPC"
slug: design-microservices-api-layer
description: "Build an API gateway with REST for external clients and gRPC for internal service-to-service communication, reducing latency and unifying authentication."
skills: [rest-api, grpc, docker-helper]
category: development
tags: [rest, grpc, microservices, api-gateway, protobuf, performance]
---

# Design a Microservices API Layer with REST and gRPC

## The Problem

Sami is the platform engineer at a 30-person fintech startup. They started as a monolith, and after splitting into 6 microservices last year, the architecture works — but communication between services is a mess.

All inter-service calls go through REST over HTTP/1.1. The payment service calls the user service to verify accounts, which calls the compliance service for KYC checks, which calls the document service for ID verification. A single payment request triggers a chain of 4 REST calls. Each call serializes to JSON, crosses the network, deserializes, processes, serializes the response, and sends it back. Total overhead per hop: 12-18ms just in serialization and HTTP connection setup.

The p95 latency for the payment flow is 840ms. Compliance requires it under 500ms. The JSON payloads between services average 4.2KB when the actual data needed is under 800 bytes — field names, null values, and nested objects that the receiving service ignores.

Authentication is duplicated: each service validates JWTs independently, making 6 Redis lookups per payment flow. Error handling is inconsistent — the user service returns `{ "error": "not found" }`, the compliance service returns `{ "code": 404, "msg": "Not found" }`, and the document service returns `{ "status": "error", "reason": "missing" }`. Every service has its own client library for every other service, totaling 30 hand-maintained HTTP clients.

External clients (web app, mobile) need REST — they can't speak gRPC. But internal services have no such constraint. The team wastes 8 hours per week debugging serialization mismatches, maintaining client libraries, and dealing with undocumented endpoint changes.

## The Solution

Keep REST for external-facing APIs (mobile, web, third-party integrations) and switch internal service-to-service communication to gRPC with Protocol Buffers. An API gateway translates between the two.

### Prompt for Your AI Agent

> I need to build an API layer for our microservices with REST externally and gRPC internally. Here's the setup:
>
> **Current architecture (6 services):**
> - api-gateway (Express.js) — public REST API for web/mobile
> - user-service (Node.js) — accounts, profiles, authentication
> - payment-service (Node.js) — transactions, billing, invoices
> - compliance-service (Python) — KYC, AML checks, risk scoring
> - document-service (Go) — file storage, ID verification, OCR
> - notification-service (Python) — email, SMS, push notifications
>
> **Requirements:**
> 1. External API stays REST (JSON over HTTPS) — web and mobile clients depend on it
> 2. Internal communication switches to gRPC (protobuf over HTTP/2)
> 3. Shared .proto files define the contract between all services
> 4. API gateway translates: REST request → gRPC call(s) → REST response
> 5. Single auth at the gateway — internal calls use trusted metadata, no JWT re-validation
> 6. Streaming for real-time: payment status updates (server streaming), document upload (client streaming)
> 7. Standard error handling across all services using gRPC status codes
> 8. Health checks and service discovery for Kubernetes readiness/liveness probes
>
> **Proto structure:**
> - proto/user/v1/user.proto — User messages and UserService
> - proto/payment/v1/payment.proto — Payment messages and PaymentService
> - proto/compliance/v1/compliance.proto — KYC messages and ComplianceService
> - proto/document/v1/document.proto — Document messages and DocumentService
> - proto/notification/v1/notification.proto — Notification messages and NotificationService
> - proto/common/v1/common.proto — shared types (Money, Address, PaginationRequest, etc.)
>
> **API Gateway pattern:**
> - POST /api/v1/payments → calls PaymentService.CreatePayment via gRPC
>   - PaymentService internally calls UserService.GetUser + ComplianceService.CheckKYC via gRPC
> - GET /api/v1/payments/:id/status → opens SSE stream, backed by PaymentService.WatchPayment (server streaming)
> - POST /api/v1/documents/upload → receives multipart, converts to DocumentService.UploadDocument (client streaming)
>
> Build the proto definitions for the payment flow (user → payment → compliance → document), the API gateway REST-to-gRPC translation layer, and the gRPC server for the payment service with interceptors for logging and auth propagation.

### What Your Agent Will Do

1. **Read the `rest-api` and `grpc` skills** for patterns on both sides
2. **Design shared proto files** — common types, service definitions with proper versioning
3. **Build the payment flow protos** — CreatePayment triggers GetUser + CheckKYC + VerifyDocument internally
4. **Implement the API gateway** — Express REST routes that call gRPC backends, translate errors, merge responses
5. **Set up auth propagation** — gateway validates JWT once, passes user context as gRPC metadata
6. **Implement gRPC interceptors** — logging, auth metadata extraction, deadline propagation
7. **Build the payment service** — gRPC server with internal calls to user/compliance services
8. **Add streaming endpoints** — payment status watch (server streaming), document upload (client streaming)
9. **Configure health checks** — standard gRPC health protocol for Kubernetes probes
10. **Set up Docker Compose** — all services with shared proto volume, code generation on build

### Expected Outcome

- **Payment flow latency**: p95 = 320ms (down from 840ms) — protobuf serialization + HTTP/2 multiplexing
- **Payload sizes**: Internal messages average 780 bytes (down from 4.2KB JSON)
- **Auth overhead**: 1 JWT validation per request (down from 6 Redis lookups)
- **Error consistency**: All services use gRPC status codes, gateway maps to proper HTTP codes
- **Client maintenance**: Zero hand-written HTTP clients — generated from .proto files
- **Type safety**: Proto changes caught at compile time across all 4 languages (Node, Python, Go)
- **Streaming**: Real-time payment status via SSE (backed by gRPC server streaming), chunked document upload
- **Weekly debugging time**: 2 hours (down from 8) — contracts enforce compatibility
