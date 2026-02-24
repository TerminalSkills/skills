---
name: aws-sns
description: |
  Use Amazon SNS for pub/sub messaging and notifications. Create topics and
  manage subscriptions across protocols (SQS, Lambda, HTTP, email, SMS). Configure
  message filtering, mobile push notifications, and fan-out architectures.
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
    - sns
    - pub-sub
    - notifications
    - messaging
---

# AWS SNS

Amazon Simple Notification Service (SNS) is a fully managed pub/sub messaging service. Publishers send messages to topics, and subscribers receive them via SQS, Lambda, HTTP/S, email, SMS, or mobile push. It's the glue for fan-out architectures.

## Core Concepts

- **Topic** — a logical channel for publishing messages
- **Subscription** — an endpoint subscribed to a topic (SQS, Lambda, HTTP, email, SMS)
- **Message filtering** — JSON policy to route only matching messages to a subscriber
- **Fan-out** — one message published, delivered to all subscribers simultaneously
- **FIFO Topic** — ordered, deduplicated delivery (pairs with FIFO SQS queues)

## Topics

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

## Subscriptions

```bash
# Subscribe an SQS queue to a topic
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789:order-events \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:123456789:order-processing
```

```bash
# Subscribe a Lambda function
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789:order-events \
  --protocol lambda \
  --notification-endpoint arn:aws:lambda:us-east-1:123456789:function:process-order
```

```bash
# Subscribe an HTTP endpoint
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789:order-events \
  --protocol https \
  --notification-endpoint https://api.myapp.com/webhooks/orders
```

```bash
# Subscribe email (requires confirmation)
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789:order-events \
  --protocol email \
  --notification-endpoint alerts@myapp.com
```

```bash
# List subscriptions for a topic
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:123456789:order-events
```

## Publishing Messages

```bash
# Publish a message to a topic
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:123456789:order-events \
  --message '{"orderId":"12345","status":"completed","amount":99.99}' \
  --message-attributes '{
    "event_type": {"DataType":"String","StringValue":"order.completed"},
    "priority": {"DataType":"String","StringValue":"high"}
  }'
```

```bash
# Publish to FIFO topic
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:123456789:order-events.fifo \
  --message '{"orderId":"12345","status":"completed"}' \
  --message-group-id "customer-789" \
  --message-deduplication-id "order-12345-completed"
```

```bash
# Publish with different payloads per protocol
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:123456789:alerts \
  --message-structure json \
  --message '{
    "default": "Order 12345 completed",
    "email": "Your order #12345 has been completed. Thank you!",
    "sqs": "{\"orderId\":\"12345\",\"status\":\"completed\"}"
  }'
```

## Message Filtering

```bash
# Set filter policy — subscriber only gets "order.completed" events
aws sns set-subscription-attributes \
  --subscription-arn arn:aws:sns:us-east-1:123456789:order-events:abc-123 \
  --attribute-name FilterPolicy \
  --attribute-value '{
    "event_type": ["order.completed"],
    "priority": ["high", "critical"]
  }'
```

```bash
# Filter on message body (not just attributes)
aws sns set-subscription-attributes \
  --subscription-arn arn:aws:sns:us-east-1:123456789:order-events:abc-123 \
  --attribute-name FilterPolicyScope \
  --attribute-value MessageBody

aws sns set-subscription-attributes \
  --subscription-arn arn:aws:sns:us-east-1:123456789:order-events:abc-123 \
  --attribute-name FilterPolicy \
  --attribute-value '{"status": ["completed"], "amount": [{"numeric": [">=", 100]}]}'
```

## Fan-Out Pattern (SNS → SQS)

```python
# Fan-out setup: one SNS topic publishing to multiple SQS queues
import boto3
import json

sns = boto3.client('sns')
sqs = boto3.client('sqs')

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

## Mobile Push

```bash
# Create platform application for FCM (Android)
aws sns create-platform-application \
  --name my-app-android \
  --platform GCM \
  --attributes PlatformCredential="YOUR_FCM_SERVER_KEY"
```

```bash
# Register a device token
aws sns create-platform-endpoint \
  --platform-application-arn arn:aws:sns:us-east-1:123456789:app/GCM/my-app-android \
  --token "device-token-from-fcm"
```

```bash
# Send push notification to a device
aws sns publish \
  --target-arn arn:aws:sns:us-east-1:123456789:endpoint/GCM/my-app-android/abc123 \
  --message '{"GCM":"{\"notification\":{\"title\":\"Order Shipped\",\"body\":\"Your order is on the way\"}}"}' \
  --message-structure json
```

## Best Practices

- Use message filtering to avoid unnecessary processing at subscribers
- Pair SNS with SQS for reliable fan-out (SNS alone doesn't retry on failure)
- Use FIFO topics + FIFO queues when message ordering matters
- Set delivery retry policies for HTTP/S endpoints
- Enable CloudWatch logging on SNS topics for debugging
- Use message attributes for routing, keep the body for data
- Grant least-privilege access with topic policies
