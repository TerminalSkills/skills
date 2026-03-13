---
name: kafka-js
description: >-
  You are an expert in KafkaJS, the pure JavaScript Apache Kafka client for
  Node.js. You help developers build event-driven architectures with
  producers, consumers, consumer groups, exactly-once semantics, SASL
  authentication, and admin operations — processing millions of events per
  second for real-time analytics, event sourcing, log aggregation, and
  microservices communication.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - kafka
    - streaming
    - event-driven
    - messaging
    - node
    - microservices
---

# KafkaJS — Apache Kafka Client for Node.js

You are an expert in KafkaJS, the pure JavaScript Apache Kafka client for Node.js. You help developers build event-driven architectures with producers, consumers, consumer groups, exactly-once semantics, SASL authentication, and admin operations — processing millions of events per second for real-time analytics, event sourcing, log aggregation, and microservices communication.

## Core Capabilities

### Producer

```typescript
import { Kafka, Partitioners, CompressionTypes } from "kafkajs";

const kafka = new Kafka({
  clientId: "my-app",
  brokers: ["kafka1:9092", "kafka2:9092", "kafka3:9092"],
  ssl: true,
  sasl: { mechanism: "plain", username: process.env.KAFKA_USER!, password: process.env.KAFKA_PASS! },
  retry: { initialRetryTime: 300, retries: 10 },
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
  idempotent: true,                       // Exactly-once delivery
  transactionalId: "order-service",
});

await producer.connect();

// Send single message
await producer.send({
  topic: "orders",
  messages: [
    {
      key: order.userId,                  // Same user → same partition → ordered
      value: JSON.stringify({ type: "order.created", data: order }),
      headers: { "correlation-id": requestId, "source": "order-service" },
    },
  ],
  compression: CompressionTypes.GZIP,
});

// Transactional send (atomic multi-topic)
const transaction = await producer.transaction();
try {
  await transaction.send({ topic: "orders", messages: [{ key: order.id, value: JSON.stringify(order) }] });
  await transaction.send({ topic: "notifications", messages: [{ key: order.userId, value: JSON.stringify(notification) }] });
  await transaction.commit();
} catch (err) {
  await transaction.abort();
}
```

### Consumer

```typescript
const consumer = kafka.consumer({
  groupId: "order-processor",
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxBytesPerPartition: 1048576,          // 1MB per partition fetch
});

await consumer.connect();
await consumer.subscribe({ topics: ["orders", "payments"], fromBeginning: false });

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    const event = JSON.parse(message.value!.toString());

    switch (topic) {
      case "orders":
        await processOrder(event);
        break;
      case "payments":
        await processPayment(event);
        break;
    }
  },
});

// Batch processing for throughput
await consumer.run({
  eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
    for (const message of batch.messages) {
      await processMessage(message);
      resolveOffset(message.offset);
      await heartbeat();                  // Prevent session timeout on long batches
    }
  },
});

// Graceful shutdown
const shutdown = async () => {
  await consumer.disconnect();
  await producer.disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
```

## Installation

```bash
npm install kafkajs
```

## Best Practices

1. **Idempotent producer** — Enable `idempotent: true` for exactly-once delivery; prevents duplicate messages on retries
2. **Key-based partitioning** — Use message keys (userId, orderId) to ensure related events go to the same partition (ordered)
3. **Consumer groups** — Add more consumers to a group for horizontal scaling; Kafka auto-rebalances partitions
4. **Manual offset commits** — Commit offsets after processing, not before; prevents data loss on consumer crashes
5. **Heartbeat in batches** — Call `heartbeat()` during long batch processing to prevent session timeout
6. **Dead-letter topics** — Send failed messages to a DLT (`topic.DLT`) after retries; don't block the consumer
7. **Schema validation** — Use Avro/Protobuf with Schema Registry for strong typing across producers/consumers
8. **Compression** — Use GZIP or LZ4 compression; reduces network bandwidth 60-80% for JSON payloads
