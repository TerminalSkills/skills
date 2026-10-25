---
name: aws-sns
description: |
  Use Amazon SNS for pub/sub messaging and notifications. Create topics and
  manage subscriptions across protocols (SQS, Lambda, HTTP, email, SMS). Configure
  message filtering, mobile push notifications, and fan-out architectures.
license: Apache-2.0
compatibility: 'AWS CLI v2 or v1, boto3, an AWS account with SNS permissions'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags: "aws, sns, pub-sub, notifications, messaging"
---

# AWS SNS

## Overview

Amazon Simple Notification Service (SNS) is a fully managed pub/sub messaging service. Publishers send messages to topics, and subscribers receive them via SQS, Lambda, HTTP/S, email, SMS, or mobile push. It's the glue for fan-out architectures.

## Instructions

### Core concepts

- **Topic** — a logical channel for publishing messages
- **Subscription** — an endpoint subscribed to a topic (SQS, Lambda, HTTP, email, SMS)
- **Message filtering** — JSON policy to route only matching messages to a subscriber
- **Fan-out** — one message published, delivered to all subscribers simultaneously
- **FIFO Topic** — ordered, deduplicated delivery (pairs with FIFO SQS queues)

### Topics

```bash
# Create a standard topic
aws sns create-topic --name order-events
```

```bash
# Create a FIFO topic
aws sns create-topic \
  --name order-events.fifo \
  --attributes FifoTopic=true,ContentBasedDeduplication=true
```

```bash
# List topics
aws sns list-topics --query 'Topics[].TopicArn' --output table
```

### Subscriptions

```bash
# Subscribe an SQS queue to a topic
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:111122223333:order-events \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:111122223333:order-processing
```

```bash
# Subscribe a Lambda function
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:111122223333:order-events \
  --protocol lambda \
  --notification-endpoint arn:aws:lambda:us-east-1:111122223333:function:process-order
```

A Lambda subscription also needs a resource policy that lets SNS invoke the function:

```bash
aws lambda add-permission --function-name process-order \
  --statement-id sns-order-events --action lambda:InvokeFunction \
  --principal sns.amazonaws.com \
  --source-arn arn:aws:sns:us-east-1:111122223333:order-events
```

```bash
# Subscribe an HTTP endpoint
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:111122223333:order-events \
  --protocol https \
  --notification-endpoint https://api.myapp.com/webhooks/orders
```

```bash
# Subscribe email (requires confirmation)
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:111122223333:order-events \
  --protocol email \
  --notification-endpoint alerts@myapp.com
```

HTTP/S and email subscriptions stay `PendingConfirmation` until the endpoint confirms (the endpoint receives a `SubscriptionConfirmation` message with a `SubscribeURL`/token; call `aws sns confirm-subscription`).

```bash
# Deliver the original body to SQS/HTTP without the SNS JSON envelope, and park failures in a DLQ
aws sns set-subscription-attributes \
  --subscription-arn arn:aws:sns:us-east-1:111122223333:order-events:abc-123 \
  --attribute-name RawMessageDelivery --attribute-value true
aws sns set-subscription-attributes \
  --subscription-arn arn:aws:sns:us-east-1:111122223333:order-events:abc-123 \
  --attribute-name RedrivePolicy \
  --attribute-value '{"deadLetterTargetArn":"arn:aws:sqs:us-east-1:111122223333:order-events-dlq"}'
```

```bash
# List subscriptions for a topic
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:111122223333:order-events
```

### Publishing Messages

```bash
# Publish a message to a topic
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:111122223333:order-events \
  --message '{"orderId":"12345","status":"completed","amount":99.99}' \
  --message-attributes '{
    "event_type": {"DataType":"String","StringValue":"order.completed"},
    "priority": {"DataType":"String","StringValue":"high"}
  }'
```

```bash
# Publish to FIFO topic
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:111122223333:order-events.fifo \
  --message '{"orderId":"12345","status":"completed"}' \
  --message-group-id "customer-789" \
  --message-deduplication-id "order-12345-completed"
```

```bash
# Publish with different payloads per protocol
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:111122223333:alerts \
  --message-structure json \
  --message '{
    "default": "Order 12345 completed",
    "email": "Your order #12345 has been completed. Thank you!",
    "sqs": "{\"orderId\":\"12345\",\"status\":\"completed\"}"
  }'
```

### Message Filtering

```bash
# Set filter policy — subscriber only gets "order.completed" events
aws sns set-subscription-attributes \
  --subscription-arn arn:aws:sns:us-east-1:111122223333:order-events:abc-123 \
  --attribute-name FilterPolicy \
  --attribute-value '{
    "event_type": ["order.completed"],
    "priority": ["high", "critical"]
  }'
```

```bash
# Filter on message body (not just attributes)
aws sns set-subscription-attributes \
  --subscription-arn arn:aws:sns:us-east-1:111122223333:order-events:abc-123 \
  --attribute-name FilterPolicyScope \
  --attribute-value MessageBody

aws sns set-subscription-attributes \
  --subscription-arn arn:aws:sns:us-east-1:111122223333:order-events:abc-123 \
  --attribute-name FilterPolicy \
  --attribute-value '{"status": ["completed"], "amount": [{"numeric": [">=", 100]}]}'
```

### Fan-Out Pattern (SNS → SQS)

```python
# Fan-out setup: one SNS topic publishing to multiple SQS queues
import boto3
import json

sns = boto3.client('sns', region_name='us-east-1')
sqs = boto3.client('sqs', region_name='us-east-1')

# Create topic
topic = sns.create_topic(Name='order-events')
topic_arn = topic['TopicArn']

# Create queues for different consumers
queues = ['order-fulfillment', 'order-analytics', 'order-notifications']
for queue_name in queues:
    queue = sqs.create_queue(QueueName=queue_name)
    queue_url = queue['QueueUrl']
    attrs = sqs.get_queue_attributes(QueueUrl=queue_url, AttributeNames=['QueueArn'])
    queue_arn = attrs['Attributes']['QueueArn']

    # Allow SNS to send to SQS
    policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "sns.amazonaws.com"},
            "Action": "sqs:SendMessage",
            "Resource": queue_arn,
            "Condition": {"ArnEquals": {"aws:SourceArn": topic_arn}}
        }]
    }
    sqs.set_queue_attributes(QueueUrl=queue_url, Attributes={"Policy": json.dumps(policy)})

    # Subscribe
    sns.subscribe(TopicArn=topic_arn, Protocol='sqs', Endpoint=queue_arn)
```

### Mobile Push

Firebase Cloud Messaging is configured with the platform name `GCM` in the CLI. SNS uses the FCM HTTP v1 API with a service-account key; the old "server key" (legacy FCM API) no longer works because Google shut that API down. In the Firebase console create a service account key (JSON file), then pass the JSON as one escaped string:

```bash
SERVICE_JSON=$(jq @json < firebase-adminsdk.json)
aws sns create-platform-application \
  --name shop-android \
  --platform GCM \
  --attributes PlatformCredential="$SERVICE_JSON"
```

```bash
# Register a device token (FCM registration token from the app)
aws sns create-platform-endpoint \
  --platform-application-arn arn:aws:sns:us-east-1:111122223333:app/GCM/shop-android \
  --token "$FCM_REGISTRATION_TOKEN"
```

```bash
# Send a notification to one device; the payload is the FCM v1 message under "fcmV1Message"
aws sns publish \
  --target-arn arn:aws:sns:us-east-1:111122223333:endpoint/GCM/shop-android/6f1d3c2a-8b4e-4f7a-9c10-2d5e7a9b0c11 \
  --message-structure json \
  --message '{"GCM":"{\"fcmV1Message\":{\"message\":{\"notification\":{\"title\":\"Order shipped\",\"body\":\"Your order is on the way\"}}}}"}'
```

The `GCM` value is a JSON string, so its inner quotes are escaped. APNs uses the `APNS` platform with a token (`.p8`) or certificate credential and an `APNS` key in the message; check the SNS developer guide for the payload.

## Examples

Order pipeline: "publish order events once and let fulfillment and analytics each get their own queue." Create `order-events`, run the fan-out script above to subscribe `order-fulfillment` and `order-analytics`, give each subscription a `FilterPolicy` (for example only `event_type: ["order.completed"]` for analytics), then publish with the `event_type` message attribute. Each queue should receive only the events its filter accepts; confirm with `aws sqs receive-message --queue-url ... --wait-time-seconds 5`.

On-call alerts: "email me when the payment topic gets a critical message." Subscribe your address to `payment-alerts` with a `FilterPolicy` of `{"priority": ["critical"]}`, click the confirmation link in the email, then publish with `priority=critical`; messages without that attribute are not delivered.

## Guidelines

- Use message filtering to avoid unnecessary processing at subscribers
- Pair SNS with SQS for reliable fan-out: SNS retries failed deliveries per the delivery policy and then drops the message, while a queue keeps it until a consumer reads it
- Use FIFO topics + FIFO queues when message ordering matters
- Set delivery retry policies for HTTP/S endpoints
- Enable CloudWatch logging on SNS topics for debugging
- Use message attributes for routing, keep the body for data
- Grant least-privilege access with topic policies
- Set `RedrivePolicy` on subscriptions so undeliverable messages land in a dead-letter queue
- New accounts start in the SMS sandbox: SMS goes only to verified destination numbers until you request production access
