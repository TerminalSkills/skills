---
name: aws-sqs
description: >-
  Amazon SQS is AWS's managed message queue for decoupling services. Use when
  creating standard or FIFO queues, adding a dead-letter queue and redriving
  failed messages, sending and receiving messages in batches with the AWS CLI
  or boto3, tuning visibility timeout and long polling, or writing an
  idempotent queue consumer.
license: Apache-2.0
compatibility: "AWS CLI v2 (v1 works for the same commands) or boto3 1.4x; IAM permissions for sqs:* on the queue; Python 3.10+ for the consumer"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["aws", "sqs", "messaging", "queues", "event-driven"]
---

# AWS SQS

## Overview

Amazon Simple Queue Service (SQS) is a managed queue for decoupling producers from consumers. A **standard** queue has nearly unlimited throughput, at-least-once delivery and best-effort ordering. A **FIFO** queue (name ends in `.fifo`) keeps order within a message group and deduplicates for 5 minutes; without high-throughput mode it handles 300 API calls per second per action, or 3,000 messages per second when sending in batches of 10. Both types allow 1 MiB per message, 4 days of retention by default (up to 14), a 30-second default visibility timeout (0 to 12 hours), and 10 messages per batch call. Check current limits in the SQS quotas pages before sizing anything.

## Instructions

1. Set the region once. After step 2 creates the queue, the commands below use `$QUEUE_URL`:

   ```bash
   export AWS_REGION=eu-west-1
   ```

2. Create a standard queue with long polling and a visibility timeout longer than your processing time:

   ```bash
   aws sqs create-queue --queue-name order-processing --attributes '{
     "VisibilityTimeout": "60",
     "MessageRetentionPeriod": "1209600",
     "ReceiveMessageWaitTimeSeconds": "20"
   }'
   QUEUE_URL=$(aws sqs get-queue-url --queue-name order-processing --query QueueUrl --output text)
   ```

3. Create a FIFO queue only when order or dedup matters. The attribute `FifoQueue` is required and the name must end in `.fifo`:

   ```bash
   aws sqs create-queue --queue-name order-processing.fifo --attributes '{
     "FifoQueue": "true",
     "ContentBasedDeduplication": "true",
     "VisibilityTimeout": "60"
   }'
   ```

   Every FIFO send needs `--message-group-id`; without `ContentBasedDeduplication` it also needs `--message-deduplication-id`. Messages in one group are delivered in order and one at a time; different groups run in parallel.

4. Add a dead-letter queue. It must be the same type as the source (FIFO source, FIFO DLQ). Give the DLQ the maximum retention (14 days) so failed messages are not expired before you look at them:

   ```bash
   aws sqs create-queue --queue-name order-processing-dlq --attributes '{"MessageRetentionPeriod":"1209600"}'
   DLQ_URL=$(aws sqs get-queue-url --queue-name order-processing-dlq --query QueueUrl --output text)
   DLQ_ARN=$(aws sqs get-queue-attributes --queue-url "$DLQ_URL" --attribute-names QueueArn --query Attributes.QueueArn --output text)
   aws sqs set-queue-attributes --queue-url "$QUEUE_URL" --attributes '{
     "RedrivePolicy": "{\"deadLetterTargetArn\":\"'"$DLQ_ARN"'\",\"maxReceiveCount\":\"3\"}"
   }'
   ```

5. After fixing the bug that caused failures, move messages back with a message move task. Without `--destination-arn` they return to the queue they came from. Redriven messages count as new for retention:

   ```bash
   aws sqs start-message-move-task --source-arn "$DLQ_ARN"
   aws sqs list-message-move-tasks --source-arn "$DLQ_ARN"
   ```

6. Send messages, one at a time or up to 10 per batch. In a batch each entry needs a unique `Id` (up to 80 characters of letters, digits, `-`, `_`), and a batch can partly fail, so read `Failed` in the response:

   ```bash
   aws sqs send-message --queue-url "$QUEUE_URL" \
     --message-body '{"orderId":"A-1001","action":"process"}' \
     --message-attributes '{"OrderType":{"DataType":"String","StringValue":"premium"}}'

   aws sqs send-message-batch --queue-url "$QUEUE_URL" --entries '[
     {"Id":"1","MessageBody":"{\"orderId\":\"A-1002\"}"},
     {"Id":"2","MessageBody":"{\"orderId\":\"A-1003\"}"}
   ]'
   ```

7. Receive with long polling, process, then delete by receipt handle. A message that is not deleted reappears after the visibility timeout; extend it with `change-message-visibility` for slow work:

   ```bash
   aws sqs receive-message --queue-url "$QUEUE_URL" --max-number-of-messages 10 \
     --wait-time-seconds 20 --message-attribute-names All --attribute-names ApproximateReceiveCount
   aws sqs delete-message --queue-url "$QUEUE_URL" --receipt-handle "$RECEIPT_HANDLE"
   aws sqs change-message-visibility --queue-url "$QUEUE_URL" --receipt-handle "$RECEIPT_HANDLE" --visibility-timeout 120
   ```

8. Watch queue depth and the DLQ:

   ```bash
   aws sqs get-queue-attributes --queue-url "$QUEUE_URL" --attribute-names \
     ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible ApproximateNumberOfMessagesDelayed
   ```

## Examples

### Example 1: Consumer that deletes only what succeeded

**User request:** "Write a Python worker that reads orders from SQS in batches and doesn't lose failed ones."

This worker was run against a local SQS emulator (moto) with boto3 1.43: the good order was processed and deleted, the bad one stayed in the queue with receive count 1.

```python
import json
import os

import boto3

sqs = boto3.client("sqs")
QUEUE_URL = os.environ["ORDERS_QUEUE_URL"]


def process_order(order: dict) -> None:
    if order.get("orderId") == "bad":
        raise ValueError("unknown order")
    print("processed", order["orderId"])


def poll_once() -> int:
    resp = sqs.receive_message(
        QueueUrl=QUEUE_URL,
        MaxNumberOfMessages=10,
        WaitTimeSeconds=20,  # long polling
        MessageAttributeNames=["All"],
        MessageSystemAttributeNames=["ApproximateReceiveCount"],
    )
    done = []
    for msg in resp.get("Messages", []):
        try:
            process_order(json.loads(msg["Body"]))
            done.append({"Id": msg["MessageId"], "ReceiptHandle": msg["ReceiptHandle"]})
        except Exception as exc:  # left undeleted: reappears after the visibility timeout
            print("failed", msg["MessageId"], exc, "receive count", msg["Attributes"]["ApproximateReceiveCount"])
    if done:
        result = sqs.delete_message_batch(QueueUrl=QUEUE_URL, Entries=done)
        for err in result.get("Failed", []):  # the call can succeed while single entries fail
            print("delete failed", err["Id"], err["Message"])
    return len(resp.get("Messages", []))


if __name__ == "__main__":
    while True:
        poll_once()
```

Output for one good and one bad message: `processed A-1001`, then `failed 1b71d3f4-... unknown order receive count 1`. After `maxReceiveCount` (3) failed receives SQS moves the bad message to the DLQ.

### Example 2: Per-customer ordering with a FIFO queue

**User request:** "Orders from the same customer must be processed in order, but different customers in parallel."

```bash
FIFO_URL=$(aws sqs get-queue-url --queue-name order-processing.fifo --query QueueUrl --output text)
aws sqs send-message --queue-url "$FIFO_URL" \
  --message-body '{"orderId":"A-1001","action":"create"}' \
  --message-group-id customer-789 --message-deduplication-id order-A-1001-create
aws sqs send-message --queue-url "$FIFO_URL" \
  --message-body '{"orderId":"A-1001","action":"pay"}' \
  --message-group-id customer-789 --message-deduplication-id order-A-1001-pay
```

Each command returns a `MessageId` and, for FIFO, a `SequenceNumber`. The `pay` message is not delivered until `create` is deleted; messages for other customers are not blocked.

## Guidelines

- Always use long polling (`WaitTimeSeconds` up to 20); short polling returns empty responses and costs more.
- Put a DLQ on every queue and alert when the DLQ is not empty. Standard-queue DLQs keep the original enqueue time, so a short DLQ retention can expire messages immediately.
- Set the visibility timeout above your worst-case processing time, and extend it for slow jobs instead of raising it for everything.
- Delivery can repeat: make consumers idempotent (for example a unique constraint on `orderId`). FIFO dedup only covers a 5-minute window.
- Choose FIFO only when you need ordering; a hot message group serialises processing.
- `purge-queue` deletes every message and can only run once per 60 seconds per queue; never run it against production without confirmation.
- Grant least-privilege IAM (`sqs:SendMessage`, `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes` on the single queue ARN); keep credentials in the environment or a role, never in code.
- For payloads over 1 MiB store the data in S3 and send the key; with Lambda as consumer, enable partial batch responses (`ReportBatchItemFailures`) so one bad message does not retry the whole batch.
