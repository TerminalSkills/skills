---
name: kafka
category: devops
version: 1.0.0
description: >-
  Build event-driven systems with Apache Kafka — producers, consumers, consumer
  groups, topics, partitions, schemas, and exactly-once semantics. Use when tasks
  involve real-time event streaming, microservice communication, log aggregation,
  change data capture, or building event sourcing pipelines.
author: terminal-skills
tags: [kafka, streaming, event-driven, messaging, microservices, pub-sub]
---

# Apache Kafka

Build real-time event streaming pipelines and event-driven microservice architectures.

## Setup

### Docker (quickstart)

```yaml
# docker-compose.yml — Kafka with KRaft (no ZooKeeper)
services:
  kafka:
    image: apache/kafka:3.7.0
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_LOG_DIRS: /tmp/kraft-logs
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"  # Explicit topic creation is safer
    volumes:
      - kafka-data:/tmp/kraft-logs

volumes:
  kafka-data:
```

```bash
docker compose up -d
```

### Topic Management

```bash
# Create a topic with 6 partitions and replication factor 1 (dev) or 3 (prod)
docker exec kafka kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic orders --partitions 6 --replication-factor 1

# List topics
docker exec kafka kafka-topics.sh --bootstrap-server localhost:9092 --list

# Describe topic (partitions, replicas, ISR)
docker exec kafka kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --topic orders
```

## Producer

### Node.js (kafkajs)

```typescript
// producer.ts — Kafka producer with batching and error handling

import { Kafka, Partitioners } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: ['localhost:9092'],
  retry: { retries: 5 },  // Auto-retry on transient failures
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
  allowAutoTopicCreation: false,
});

await producer.connect();

/** Send a single event to a topic.
 *
 * @param topic - Target topic name.
 * @param key - Partition key (events with same key go to same partition = ordering).
 * @param value - Event payload (serialized to JSON).
 */
async function sendEvent(topic: string, key: string, value: object) {
  await producer.send({
    topic,
    messages: [{
      key,
      value: JSON.stringify(value),
      headers: {
        'event-type': value.constructor.name,
        'produced-at': new Date().toISOString(),
      },
    }],
  });
}

/** Send a batch of events efficiently.
 *  Kafka batches these into fewer network calls automatically.
 */
async function sendBatch(topic: string, events: Array<{ key: string; value: object }>) {
  await producer.send({
    topic,
    messages: events.map(e => ({
      key: e.key,
      value: JSON.stringify(e.value),
    })),
  });
}

// Example: order events partitioned by customer ID
await sendEvent('orders', 'customer-123', {
  type: 'order.created',
  orderId: 'ord-789',
  customerId: 'customer-123',
  items: [{ sku: 'WIDGET-A', quantity: 3, price: 29.99 }],
  total: 89.97,
  timestamp: new Date().toISOString(),
});
```

### Python (confluent-kafka)

```python
"""producer.py — High-performance Kafka producer in Python."""
import json
from confluent_kafka import Producer

conf = {
    'bootstrap.servers': 'localhost:9092',
    'client.id': 'analytics-service',
    'linger.ms': 10,       # Batch messages for 10ms before sending (throughput vs latency)
    'batch.size': 65536,   # 64KB batch size
    'acks': 'all',         # Wait for all replicas to acknowledge (durability)
}

producer = Producer(conf)

def send_event(topic: str, key: str, value: dict):
    """Send an event with delivery confirmation callback.

    Args:
        topic: Target topic.
        key: Partition key for ordering.
        value: Event payload dict.
    """
    def on_delivery(err, msg):
        if err:
            print(f"Delivery failed: {err}")
        else:
            print(f"Delivered to {msg.topic()}[{msg.partition()}] @ offset {msg.offset()}")

    producer.produce(
        topic=topic,
        key=key.encode('utf-8'),
        value=json.dumps(value).encode('utf-8'),
        callback=on_delivery,
    )
    producer.poll(0)  # Trigger delivery callbacks

# Flush remaining messages on shutdown
producer.flush(timeout=10)
```

## Consumer

### Consumer Groups

Multiple consumers in a group split topic partitions among themselves. Adding consumers scales throughput; Kafka rebalances automatically:

```typescript
// consumer.ts — Consumer group with graceful shutdown and error handling

import { Kafka, EachMessagePayload } from 'kafkajs';

const kafka = new Kafka({ clientId: 'order-processor', brokers: ['localhost:9092'] });

const consumer = kafka.consumer({
  groupId: 'order-processing-group',  // All instances with same groupId share partitions
  sessionTimeout: 30000,               // 30s — detect dead consumers
  heartbeatInterval: 3000,             // 3s heartbeat
});

await consumer.connect();
await consumer.subscribe({ topics: ['orders'], fromBeginning: false });

await consumer.run({
  eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
    const event = JSON.parse(message.value!.toString());
    const key = message.key?.toString();

    console.log(`[${topic}:${partition}] key=${key} type=${event.type}`);

    switch (event.type) {
      case 'order.created':
        await processNewOrder(event);
        break;
      case 'order.paid':
        await fulfillOrder(event);
        break;
      case 'order.cancelled':
        await handleCancellation(event);
        break;
      default:
        console.warn(`Unknown event type: ${event.type}`);
    }
    // Offset auto-commits after successful processing
  },
});

// Graceful shutdown — finish processing current message, then disconnect
process.on('SIGTERM', async () => {
  await consumer.disconnect();
  process.exit(0);
});
```

### Batch Consumer (high throughput)

```typescript
// batch-consumer.ts — Process messages in batches for higher throughput

await consumer.run({
  eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
    const events = batch.messages.map(m => ({
      offset: m.offset,
      value: JSON.parse(m.value!.toString()),
    }));

    // Process batch (e.g., bulk database insert)
    await bulkInsert(events.map(e => e.value));

    // Mark all as processed
    resolveOffset(batch.messages[batch.messages.length - 1].offset);

    // Keep the consumer alive during long batch processing
    await heartbeat();
  },
});
```

## Exactly-Once Semantics

For critical data where duplicates are unacceptable (payments, inventory):

```typescript
// transactional-producer.ts — Exactly-once with idempotent producer + transactions

const producer = kafka.producer({
  idempotent: true,        // Prevents duplicate messages from retries
  transactionalId: 'order-transaction-producer',
  maxInFlightRequests: 1,  // Required for idempotent producer
});

await producer.connect();

/** Process an order and produce events atomically.
 *  Either all events are published or none are.
 */
async function processOrderAtomically(order: Order) {
  const transaction = await producer.transaction();
  try {
    // Multiple events as part of one atomic transaction
    await transaction.send({
      topic: 'orders',
      messages: [{ key: order.customerId, value: JSON.stringify({ type: 'order.confirmed', ...order }) }],
    });
    await transaction.send({
      topic: 'inventory',
      messages: [{ key: order.sku, value: JSON.stringify({ type: 'stock.reserved', sku: order.sku, qty: order.qty }) }],
    });
    await transaction.send({
      topic: 'notifications',
      messages: [{ key: order.customerId, value: JSON.stringify({ type: 'email.order-confirmation', orderId: order.id }) }],
    });

    await transaction.commit();
  } catch (err) {
    await transaction.abort();
    throw err;
  }
}
```

## Schema Registry

Enforce event schemas to prevent producers from breaking consumers:

```typescript
// schema-registry.ts — Avro schema validation with Confluent Schema Registry

import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';

const registry = new SchemaRegistry({ host: 'http://localhost:8081' });

// Register a schema (usually done once at deploy time)
const schema = {
  type: 'record',
  name: 'OrderCreated',
  fields: [
    { name: 'orderId', type: 'string' },
    { name: 'customerId', type: 'string' },
    { name: 'total', type: 'double' },
    { name: 'timestamp', type: 'string' },
  ],
};

const { id: schemaId } = await registry.register({
  type: 'AVRO',
  schema: JSON.stringify(schema),
}, { subject: 'orders-value' });

// Produce with schema validation
const encodedValue = await registry.encode(schemaId, {
  orderId: 'ord-789',
  customerId: 'cust-123',
  total: 89.97,
  timestamp: new Date().toISOString(),
});

await producer.send({
  topic: 'orders',
  messages: [{ key: 'cust-123', value: encodedValue }],
});

// Consume with automatic deserialization
const decoded = await registry.decode(message.value!);
```

## Production Configuration

```properties
# server.properties — production Kafka broker settings

# Replication — minimum 3 for durability
default.replication.factor=3
min.insync.replicas=2

# Retention — 7 days default, override per topic
log.retention.hours=168
log.retention.bytes=-1

# Performance
num.io.threads=8
num.network.threads=3
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400

# Compaction for changelog topics (keep latest value per key)
# Set per-topic: kafka-configs.sh --alter --topic user-profiles --add-config cleanup.policy=compact
```

## Monitoring

```bash
# Consumer group lag — most critical metric
docker exec kafka kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group order-processing-group --describe

# Topic offsets
docker exec kafka kafka-get-offsets.sh --bootstrap-server localhost:9092 \
  --topic orders
```

## Guidelines

- **Partition key matters** — events with the same key always go to the same partition, guaranteeing ordering. Use entity IDs (customer ID, order ID) as keys.
- **Don't create too many partitions** — 6-12 per topic is typical. More partitions = more consumer parallelism but higher overhead. You can increase partitions later but never decrease.
- **Consumer group = scaling unit** — adding consumers to a group distributes partitions. More consumers than partitions means some sit idle.
- **Offset management** — auto-commit is convenient but can lose messages on crash. For critical data, manually commit after processing.
- **Retention vs compaction** — time-based retention (default) for event logs, compaction for state/changelog topics (keeps latest value per key).
- **Idempotent consumers** — even with exactly-once producers, design consumers to handle duplicates (rebalances can cause re-processing).
- **Schema evolution** — use Schema Registry and backward-compatible changes (add optional fields, don't remove or rename fields).
- **Don't use Kafka as a database** — it's an append-only log. Use it for events, not queries.
