---
name: aws-sqs
description: |
  Work with Amazon SQS for reliable message queuing. Create standard and FIFO
  queues, configure dead-letter queues for failed messages, send and receive
  messages in batches, and build decoupled event-driven architectures.
license: Apache-2.0
compatibility:
  - aws-cli
  - boto3
  - sdk
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - aws
    - sqs
    - messaging
    - queues
    - event-driven
---

# AWS SQS

Amazon Simple Queue Service (SQS) is a fully managed message queuing service for decoupling microservices. It offers two queue types: Standard (best-effort ordering, at-least-once delivery) and FIFO (exactly-once, ordered).

## Core Concepts

- **Standard Queue** — unlimited throughput, at-least-once delivery, best-effort ordering
- **FIFO Queue** — exactly-once processing, strict ordering, 3000 msg/s with batching
- **Visibility Timeout** — period a message is hidden after being received
- **Dead-Letter Queue (DLQ)** — destination for messages that fail processing
- **Message Group ID** — FIFO ordering key for parallel processing within a queue
- **Long Polling** — reduces empty responses and API costs

## Creating Queues

```bash
# Create a standard queue
aws sqs create-queue \
  --queue-name order-processing \
  --attributes '{
    "VisibilityTimeout": "60",
    "MessageRetentionPeriod": "1209600",
    "ReceiveMessageWaitTimeSeconds": "20"
  }'
```

```bash
# Create a FIFO queue (name must end in .fifo)
aws sqs create-queue \
  --queue-name order-processing.fifo \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "true",
    "VisibilityTimeout": "60"
  }'
```

## Dead-Letter Queues

```bash
# Create the DLQ first
aws sqs create-queue --queue-name order-processing-dlq

# Get DLQ ARN
DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/order-processing-dlq \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

# Configure main queue to use DLQ after 3 failed attempts
aws sqs set-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/order-processing \
  --attributes '{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"'$DLQ_ARN'\",\"maxReceiveCount\":\"3\"}"
  }'
```

```bash
# Redrive messages from DLQ back to source queue
aws sqs start-message-move-task \
  --source-arn "$DLQ_ARN" \
  --destination-arn "arn:aws:sqs:us-east-1:123456789:order-processing"
```

## Sending Messages

```bash
# Send a single message
aws sqs send-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/order-processing \
  --message-body '{"orderId":"12345","action":"process"}' \
  --message-attributes '{
    "OrderType": {"DataType":"String","StringValue":"premium"}
  }'
```

```bash
# Send to FIFO queue with group ID
aws sqs send-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/order-processing.fifo \
  --message-body '{"orderId":"12345","action":"process"}' \
  --message-group-id "customer-789" \
  --message-deduplication-id "order-12345-v1"
```

## Batch Operations

```bash
# Send up to 10 messages in a batch
aws sqs send-message-batch \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/order-processing \
  --entries '[
    {"Id":"1","MessageBody":"{\"orderId\":\"001\"}"},
    {"Id":"2","MessageBody":"{\"orderId\":\"002\"}"},
    {"Id":"3","MessageBody":"{\"orderId\":\"003\"}"}
  ]'
```

```python
# Batch consumer with boto3
import boto3
import json

sqs = boto3.client('sqs')
QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/order-processing'

def poll_and_process():
    while True:
        response = sqs.receive_message(
            QueueUrl=QUEUE_URL,
            MaxNumberOfMessages=10,  # batch up to 10
            WaitTimeSeconds=20,       # long polling
            MessageAttributeNames=['All']
        )
        messages = response.get('Messages', [])
        if not messages:
            continue

        entries_to_delete = []
        for msg in messages:
            try:
                body = json.loads(msg['Body'])
                process_order(body)
                entries_to_delete.append({
                    'Id': msg['MessageId'],
                    'ReceiptHandle': msg['ReceiptHandle']
                })
            except Exception as e:
                print(f"Failed: {e}")
                # Message returns to queue after visibility timeout

        if entries_to_delete:
            sqs.delete_message_batch(
                QueueUrl=QUEUE_URL,
                Entries=entries_to_delete
            )
```

## Receiving and Deleting

```bash
# Receive messages with long polling
aws sqs receive-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/order-processing \
  --max-number-of-messages 5 \
  --wait-time-seconds 20 \
  --message-attribute-names All
```

```bash
# Delete a processed message
aws sqs delete-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/order-processing \
  --receipt-handle "AQEBzL..."
```

```bash
# Change visibility timeout for a message needing more processing time
aws sqs change-message-visibility \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/order-processing \
  --receipt-handle "AQEBzL..." \
  --visibility-timeout 120
```

## Monitoring

```bash
# Check queue depth
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/order-processing \
  --attribute-names ApproximateNumberOfMessages,ApproximateNumberOfMessagesNotVisible,ApproximateNumberOfMessagesDelayed
```

```bash
# Purge all messages (use with caution)
aws sqs purge-queue \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/order-processing
```

## Best Practices

- Always enable long polling (WaitTimeSeconds=20) to reduce costs
- Set up dead-letter queues on every queue to catch poison messages
- Use FIFO queues only when ordering matters — standard queues have much higher throughput
- Process and delete messages in batches for efficiency
- Set visibility timeout to 6x your average processing time
- Use message group IDs in FIFO queues for parallel ordered processing
- Monitor `ApproximateNumberOfMessages` and alert on queue depth spikes
- Implement idempotent consumers — messages may be delivered more than once
