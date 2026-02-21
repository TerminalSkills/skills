---
title: "Build an Async Message Processing System with Kafka and RabbitMQ"
slug: build-async-message-processing-system
description: "Design a hybrid messaging architecture using Kafka for high-throughput event streaming and RabbitMQ for task queuing to decouple services and handle traffic spikes."
skills:
  - kafka
  - rabbitmq
category: devops
tags:
  - messaging
  - kafka
  - rabbitmq
  - event-driven
  - async-processing
---

# Build an Async Message Processing System with Kafka and RabbitMQ

## The Problem

An e-commerce platform processes orders synchronously -- the checkout API calls inventory, payments, notifications, and shipping in sequence. A slow payment gateway response blocks the entire chain, and if the notification service is down, the order fails entirely. During flash sales, the checkout endpoint times out because downstream services cannot handle the burst. The team needs to decouple these services so a failure in one does not cascade to others.

## The Solution

Using the **kafka** skill to set up a durable event stream for order events that multiple consumers can read independently, and the **rabbitmq** skill to handle task-based work queues for email notifications, PDF invoice generation, and shipping label creation where exactly-once processing and retry logic matter most.

## Step-by-Step Walkthrough

### 1. Set up Kafka for order event streaming

Create a Kafka cluster and define topics for core business events.

> Set up a 3-broker Kafka cluster for our e-commerce platform. Create topics for order-created, order-paid, order-shipped, and inventory-updated events. Configure retention at 7 days, replication factor 3, and partition count based on our expected throughput of 500 orders/minute at peak. Use Avro schemas with Schema Registry for event validation.

The order-created topic gets 12 partitions to handle peak throughput. Each event is validated against an Avro schema before publishing, so consumers can trust the data shape. The 7-day retention means any new service can replay the full week of events when it first connects.

### 2. Configure RabbitMQ for task queues

Set up work queues for tasks that need reliable delivery and retry logic.

> Configure RabbitMQ with queues for email-notifications, invoice-generation, and shipping-labels. Set up dead letter exchanges for failed messages with a retry policy: 3 attempts with exponential backoff (1s, 5s, 30s), then route to a dead letter queue for manual inspection. Enable publisher confirms and consumer acknowledgments.

RabbitMQ handles tasks where order matters less than reliability. A failed invoice generation retries three times before landing in the dead letter queue. The operations team monitors the dead letter queue depth and investigates any messages that exhaust retries.

### 3. Wire the order flow through both systems

Connect the checkout service to publish events and route tasks.

> When a new order is created, the checkout API publishes an order-created event to Kafka and returns immediately (under 50ms response time). The payment consumer reads from Kafka and processes payment. On success, it publishes order-paid to Kafka and also enqueues tasks to RabbitMQ: send confirmation email, generate PDF invoice, and create shipping label. Show me the flow diagram and the code for the Kafka producer in the checkout service.

The checkout API response time drops from 3-8 seconds (synchronous) to under 50 ms (publish and return). Each downstream concern processes independently. If the email service is down, the invoice still generates and the shipping label still creates.

### 4. Add monitoring and consumer lag alerting

Track message throughput and detect consumers falling behind.

> Set up monitoring for both Kafka and RabbitMQ. Track Kafka consumer lag per consumer group and alert when any group falls more than 10,000 messages behind. Monitor RabbitMQ queue depth and alert when the dead letter queue exceeds 50 messages. Export metrics to Prometheus and create a Grafana dashboard showing throughput, latency, and error rates.

Consumer lag monitoring catches the most common production issue: a slow consumer gradually falling behind during peak hours. The alert fires at 10,000 messages behind, giving the team time to scale up consumers before the lag becomes user-visible.

## Real-World Example

Sofia's e-commerce team handles 200 orders per minute on a normal day and 2,000 during flash sales. After implementing the hybrid Kafka and RabbitMQ architecture, flash sale checkout response times drop from 8 seconds to 45 milliseconds. When the email service goes down for 20 minutes during a sale, orders continue processing normally -- the email queue accumulates 3,400 messages and drains within 4 minutes once the service recovers. The dead letter queue catches 12 messages with malformed shipping addresses that would have previously caused silent order failures.
