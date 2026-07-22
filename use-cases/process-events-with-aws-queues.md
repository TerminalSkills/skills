---
title: Process Events with AWS Queues
slug: process-events-with-aws-queues
description: Set up an event-driven order processing architecture using SQS queues, SNS fan-out topics, and Lambda consumers for reliable, decoupled microservice communication.
skills:
  - aws-sqs
  - aws-sns
  - aws-lambda
category: devops
tags:
  - event-driven
  - aws
  - queues
  - microservices
  - sns
  - sqs
---

# Process Events with AWS Queues

James is a platform engineer at an e-commerce company. Their monolithic order processing system is cracking under Black Friday traffic — a slow email service blocks payment processing, and a failed inventory check loses orders entirely. He's tasked with rebuilding the order pipeline as an event-driven architecture using SNS for fan-out and SQS for reliable queuing.

## The Architecture

When a customer places an order, it publishes a single event to SNS. SNS fans out to multiple SQS queues, each consumed by a specialized Lambda function. If any consumer fails, the message stays in its queue and retries. If it keeps failing, it moves to a dead-letter queue for investigation.

```
Order API → SNS Topic (order-events)
              ├── SQS: payment-queue     → Lambda: process-payment
              ├── SQS: inventory-queue   → Lambda: update-inventory
              ├── SQS: notification-queue → Lambda: send-notifications
              └── SQS: analytics-queue   → Lambda: record-analytics
```

Each service is independent. A slow email sender doesn't block payment processing. A crash in analytics doesn't lose orders.

## Step 1: Create the SNS Topic

James starts with the central event bus — an SNS topic that receives all order events.

```bash
# Create the order events topic
aws sns create-topic --name order-events --output text --query TopicArn
# Returns: arn:aws:sns:us-east-1:123456789:order-events
```

## Step 2: Create SQS Queues with Dead-Letter Queues

Each consumer gets its own queue and DLQ. If a message fails processing 3 times, it moves to the DLQ.

```bash
# create-queue-with-dlq.sh — reusable script to create a queue pair
#!/bin/bash
QUEUE_NAME=$1
REGION="us-east-1"
ACCOUNT="123456789"

# Create DLQ
aws sqs create-queue --queue-name "${QUEUE_NAME}-dlq" \
  --attributes '{"MessageRetentionPeriod":"1209600"}'

DLQ_ARN="arn:aws:sqs:${REGION}:${ACCOUNT}:${QUEUE_NAME}-dlq"

# Create main queue with DLQ redrive policy
aws sqs create-queue --queue-name "$QUEUE_NAME" \
  --attributes "{
    \"VisibilityTimeout\": \"90\",
    \"ReceiveMessageWaitTimeSeconds\": \"20\",
    \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"
  }"

# Allow SNS to send messages to this queue
QUEUE_ARN="arn:aws:sqs:${REGION}:${ACCOUNT}:${QUEUE_NAME}"
POLICY=$(cat <<EOF
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "sns.amazonaws.com"},
    "Action": "sqs:SendMessage",
    "Resource": "${QUEUE_ARN}",
    "Condition": {"ArnEquals": {"aws:SourceArn": "arn:aws:sns:${REGION}:${ACCOUNT}:order-events"}}
  }]
}
EOF
)
aws sqs set-queue-attributes \
  --queue-url "https://sqs.${REGION}.amazonaws.com/${ACCOUNT}/${QUEUE_NAME}" \
  --attributes "{\"Policy\": $(echo $POLICY | jq -c . | jq -Rs .)}"

echo "Created $QUEUE_NAME + DLQ"
```

```bash
# Create all four queue pairs
./create-queue-with-dlq.sh payment-queue
./create-queue-with-dlq.sh inventory-queue
./create-queue-with-dlq.sh notification-queue
./create-queue-with-dlq.sh analytics-queue
```

## Step 3: Subscribe Queues to SNS with Filtering

James uses message filtering so each queue only receives relevant events.

```bash
# Subscribe payment queue — only order.created and order.refunded events
PAYMENT_SUB=$(aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789:order-events \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:123456789:payment-queue \
  --output text --query SubscriptionArn)

aws sns set-subscription-attributes \
  --subscription-arn "$PAYMENT_SUB" \
  --attribute-name FilterPolicy \
  --attribute-value '{"event_type": ["order.created", "order.refunded"]}'
```

```bash
# Subscribe inventory queue — only order.created and order.cancelled
INVENTORY_SUB=$(aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789:order-events \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:123456789:inventory-queue \
  --output text --query SubscriptionArn)

aws sns set-subscription-attributes \
  --subscription-arn "$INVENTORY_SUB" \
  --attribute-name FilterPolicy \
  --attribute-value '{"event_type": ["order.created", "order.cancelled"]}'
```

```bash
# Subscribe notification queue — all events (no filter)
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789:order-events \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:123456789:notification-queue

# Subscribe analytics queue — all events (no filter)
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789:order-events \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:123456789:analytics-queue
```

## Step 4: Write the Lambda Consumers

Each Lambda function processes messages from its queue. They're idempotent — processing the same message twice produces the same result.

```python
# handlers/process_payment.py — charge the customer for an order
import json
import boto3

sns = boto3.client('sns')

def handler(event, context):
    for record in event['Records']:
        # SQS wraps the SNS message
        sns_message = json.loads(record['body'])
        order = json.loads(sns_message['Message'])

        order_id = order['order_id']
        event_type = order['event_type']
        print(f"Processing payment for {order_id}, event: {event_type}")

        if event_type == 'order.created':
            # Idempotent: check if already charged
            if not already_charged(order_id):
                charge_result = charge_customer(
                    customer_id=order['customer_id'],
                    amount=order['total'],
                    idempotency_key=f"charge-{order_id}"
                )
                save_payment_record(order_id, charge_result)

                # Publish payment success event
                sns.publish(
                    TopicArn='arn:aws:sns:us-east-1:123456789:order-events',
                    Message=json.dumps({
                        'event_type': 'payment.completed',
                        'order_id': order_id,
                        'payment_id': charge_result['id']
                    }),
                    MessageAttributes={
                        'event_type': {'DataType': 'String', 'StringValue': 'payment.completed'}
                    }
                )

        elif event_type == 'order.refunded':
            refund_payment(order_id)
```

```python
# handlers/update_inventory.py — adjust stock levels
import json

def handler(event, context):
    for record in event['Records']:
        sns_message = json.loads(record['body'])
        order = json.loads(sns_message['Message'])

        order_id = order['order_id']
        event_type = order['event_type']

        if event_type == 'order.created':
            for item in order['items']:
                decrement_stock(
                    sku=item['sku'],
                    quantity=item['quantity'],
                    reference=order_id  # idempotency key
                )
                if get_stock_level(item['sku']) < item.get('reorder_threshold', 10):
                    trigger_reorder_alert(item['sku'])

        elif event_type == 'order.cancelled':
            for item in order['items']:
                increment_stock(sku=item['sku'], quantity=item['quantity'], reference=order_id)
```

```python
# handlers/send_notifications.py — notify the customer
import json
import boto3

ses = boto3.client('sesv2')

def handler(event, context):
    for record in event['Records']:
        sns_message = json.loads(record['body'])
        order = json.loads(sns_message['Message'])

        event_type = order['event_type']
        customer_email = order['customer_email']

        template_map = {
            'order.created': 'order-confirmation',
            'payment.completed': 'payment-receipt',
            'order.shipped': 'shipping-notification',
            'order.cancelled': 'cancellation-confirmation'
        }

        template = template_map.get(event_type)
        if template:
            ses.send_email(
                FromEmailAddress='orders@example.com',
                Destination={'ToAddresses': [customer_email]},
                Content={'Template': {
                    'TemplateName': template,
                    'TemplateData': json.dumps(order)
                }}
            )
            print(f"Sent {template} to {customer_email}")
```

## Step 5: Deploy with SAM

```yaml
# template.yaml — SAM template for the event-driven pipeline
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  OrderEventsTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: order-events

  PaymentQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: payment-queue
      VisibilityTimeout: 90
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt PaymentDLQ.Arn
        maxReceiveCount: 3

  PaymentDLQ:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: payment-queue-dlq
      MessageRetentionPeriod: 1209600

  ProcessPaymentFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: handlers/process_payment.handler
      Runtime: python3.12
      Timeout: 60
      Events:
        SQSEvent:
          Type: SQS
          Properties:
            Queue: !GetAtt PaymentQueue.Arn
            BatchSize: 5
      Policies:
        - SNSPublishMessagePolicy:
            TopicName: order-events
```

## Step 6: Publish an Order Event

```python
# publish_order.py — called by the Order API when a customer checks out
import json
import boto3

sns = boto3.client('sns')

def publish_order_event(order):
    sns.publish(
        TopicArn='arn:aws:sns:us-east-1:123456789:order-events',
        Message=json.dumps({
            'event_type': 'order.created',
            'order_id': order['id'],
            'customer_id': order['customer_id'],
            'customer_email': order['email'],
            'items': order['items'],
            'total': order['total'],
            'timestamp': order['created_at']
        }),
        MessageAttributes={
            'event_type': {'DataType': 'String', 'StringValue': 'order.created'}
        }
    )
```

## Step 7: Monitor and Handle Failures

```bash
# Check queue depths across all queues
for q in payment-queue inventory-queue notification-queue analytics-queue; do
  echo "=== $q ==="
  aws sqs get-queue-attributes \
    --queue-url "https://sqs.us-east-1.amazonaws.com/123456789/$q" \
    --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
    --output table
done
```

```bash
# Check DLQ depths for failures
for q in payment-queue-dlq inventory-queue-dlq notification-queue-dlq analytics-queue-dlq; do
  DEPTH=$(aws sqs get-queue-attributes \
    --queue-url "https://sqs.us-east-1.amazonaws.com/123456789/$q" \
    --attribute-names ApproximateNumberOfMessages \
    --query 'Attributes.ApproximateNumberOfMessages' --output text)
  echo "$q: $DEPTH messages"
done
```

```bash
# Redrive failed messages back to the source queue after fixing the bug
aws sqs start-message-move-task \
  --source-arn "arn:aws:sqs:us-east-1:123456789:payment-queue-dlq"
```

## What James Learned

The fan-out pattern with SNS + SQS gives each service complete independence. During Black Friday, the analytics service fell behind by 2 hours processing events — but customers never noticed because payments and shipping were on separate queues running at full speed. The DLQs caught 12 orders with bad data that would have been silently lost in the old monolith. James fixed the bug, redrove the messages, and all 12 orders were processed successfully.

The key lesson: make every consumer idempotent. Messages will be delivered at least once, and during failures and redrives, they may be processed multiple times. An idempotency key per operation makes that safe.
