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
  version: 1.1.0
  category: data-ai
  repository: https://github.com/apache/kafka
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

The official `apache/kafka` image runs a single-node KRaft broker (no ZooKeeper) with defaults that already advertise `localhost:9092`. The old `bitnami/kafka` image is no longer maintained under that name, so do not use it.

```yaml
# docker-compose.yml: one broker for local development
services:
  kafka:
    image: apache/kafka:4.4.0
    ports:
      - "127.0.0.1:9092:9092"
```

```console
$ docker compose up -d
$ docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
    --create --topic orders --partitions 3
Created topic orders.
```

Do not publish port 9092 on all interfaces: this setup has no authentication. For several brokers or a real network, set `KAFKA_ADVERTISED_LISTENERS` to an address clients can reach.

### Step 2: Node.js Producer

`kafkajs` has had no release since 2023 (2.2.4). It still connected to Kafka 4.4 in a test, but for new code use `@confluentinc/kafka-javascript` (`npm i @confluentinc/kafka-javascript`), whose `KafkaJS` namespace keeps the same API shape and is maintained.

```typescript
// producer.ts — Send events to Kafka
import { KafkaJS } from '@confluentinc/kafka-javascript'

const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers: ['localhost:9092'] } })
const producer = kafka.producer({ kafkaJS: { acks: -1 } })  // wait for all in-sync replicas

await producer.connect()

// Send single event
await producer.send({
  topic: 'orders',
  messages: [
    {
      key: 'order-123',                    // partition key (same key, same partition, in order)
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
import { KafkaJS } from '@confluentinc/kafka-javascript'

const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers: ['localhost:9092'] } })
const consumer = kafka.consumer({ kafkaJS: { groupId: 'order-service', fromBeginning: false } })

await consumer.connect()
await consumer.subscribe({ topics: ['orders'] })

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    const order = JSON.parse(message.value!.toString())
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
import json

from confluent_kafka import Consumer

conf = {
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'analytics-service',
    'auto.offset.reset': 'earliest',
}

consumer = Consumer(conf)
consumer.subscribe(['orders'])

try:
    while True:
        msg = consumer.poll(1.0)
        if msg is None:
            continue
        if msg.error():
            print(f"Error: {msg.error()}")
            continue

        order = json.loads(msg.value().decode('utf-8'))
        print(f"Processing: {order['orderId']}")
finally:
    consumer.close()  # leave the group cleanly so partitions rebalance at once
```

## Examples

### Example 1: Start a broker and publish the first order event
**User prompt:** "Spin up Kafka locally and send an order event to an `orders` topic."

The agent saves the compose file from Step 1, runs `docker compose up -d`, creates the topic with `kafka-topics.sh`, then runs the producer from Step 2. Result: `Created topic orders.`, and the message appears on one of the 3 partitions with key `order-123`.

### Example 2: Two services reading the same stream
**User prompt:** "The analytics service needs every order too, without disturbing the order service."

Give each service its own `groupId` (`order-service`, `analytics-service`). Each group receives every message; inside one group the partitions are split between instances. Check lag with `kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group analytics-service`; a growing LAG column means that group is falling behind.

## Guidelines

- Use partition keys to ensure related events go to the same partition (ordering guarantee).
- Consumer groups enable parallel processing — each partition is consumed by one consumer in the group.
- Make consumers idempotent — Kafka guarantees at-least-once delivery by default.
- For managed Kafka: Confluent Cloud, AWS MSK, or Redpanda (Kafka-compatible, simpler).
- Kafka 4.x runs on KRaft only; ZooKeeper support was removed in 4.0.
- `auto.offset.reset` / `fromBeginning` matter only when a group has no committed offset; a new group reads from the start only with `earliest` / `fromBeginning: true` (otherwise it begins at the newest message), an old group resumes from its committed offset. Step 3 uses `fromBeginning: false`; Step 4 uses `earliest`.
