---
name: kafka
description: >-
  Build event-driven systems with Apache Kafka. Use when a user asks to set up
  message streaming, implement event sourcing, build pub/sub systems, process
  real-time data streams, or connect microservices with async messaging.
license: Apache-2.0
compatibility: 'Any language (Node.js, Python, Java, Go)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - kafka
    - streaming
    - events
    - messaging
    - microservices
---

# Apache Kafka

## Overview

Kafka is a distributed event streaming platform for high-throughput, fault-tolerant messaging. It's the backbone of event-driven architectures — used for real-time data pipelines, event sourcing, log aggregation, and microservice communication.

## Instructions

### Step 1: Local Setup

```yaml
# docker-compose.yml — Kafka with KRaft (no ZooKeeper)
services:
  kafka:
    image: bitnami/kafka:latest
    ports:
      - "9092:9092"
    environment:
      KAFKA_CFG_NODE_ID: 1
      KAFKA_CFG_PROCESS_ROLES: broker,controller
      KAFKA_CFG_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_CFG_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_CFG_CONTROLLER_LISTENER_NAMES: CONTROLLER
```

### Step 2: Node.js Producer

```typescript
// producer.ts — Send events to Kafka
import { Kafka, Partitioners } from 'kafkajs'

const kafka = new Kafka({ brokers: ['localhost:9092'] })
const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner })

await producer.connect()

// Send single event
await producer.send({
  topic: 'orders',
  messages: [
    {
      key: 'order-123',                    // partition key (orders for same user go to same partition)
      value: JSON.stringify({
        orderId: 'order-123',
        userId: 'user-456',
        items: [{ sku: 'WIDGET-1', quantity: 2, price: 29.99 }],
        total: 59.98,
        createdAt: new Date().toISOString(),
      }),
    },
  ],
})

// Batch send
await producer.sendBatch({
  topicMessages: [
    { topic: 'orders', messages: events.map(e => ({ key: e.id, value: JSON.stringify(e) })) },
  ],
})

await producer.disconnect()
```

### Step 3: Consumer

```typescript
// consumer.ts — Process events from Kafka
const consumer = kafka.consumer({ groupId: 'order-service' })

await consumer.connect()
await consumer.subscribe({ topic: 'orders', fromBeginning: false })

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    const order = JSON.parse(message.value.toString())
    console.log(`Processing order ${order.orderId} from partition ${partition}`)

    // Process the order (idempotently — messages can be redelivered)
    await processOrder(order)
  },
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  await consumer.disconnect()
})
```

### Step 4: Python Consumer

```python
# consumer.py — Kafka consumer with confluent-kafka
from confluent_kafka import Consumer

conf = {
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'analytics-service',
    'auto.offset.reset': 'earliest',
}

consumer = Consumer(conf)
consumer.subscribe(['orders'])

while True:
    msg = consumer.poll(1.0)
    if msg is None:
        continue
    if msg.error():
        print(f"Error: {msg.error()}")
        continue

    order = json.loads(msg.value().decode('utf-8'))
    print(f"Processing: {order['orderId']}")
```

## Guidelines

- Use partition keys to ensure related events go to the same partition (ordering guarantee).
- Consumer groups enable parallel processing — each partition is consumed by one consumer in the group.
- Make consumers idempotent — Kafka guarantees at-least-once delivery by default.
- For managed Kafka: Confluent Cloud, AWS MSK, or Redpanda (Kafka-compatible, simpler).
- KRaft mode (no ZooKeeper) is production-ready since Kafka 3.3+.
