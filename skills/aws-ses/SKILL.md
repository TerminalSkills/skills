---
name: aws-ses
description: |
  Send transactional and marketing emails with Amazon SES. Verify domains and
  identities, create reusable email templates, configure receipt rules for
  incoming mail, and handle bounces and complaints with SNS notifications.
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
    - ses
    - email
    - notifications
---

# AWS SES

Amazon Simple Email Service (SES) is a cost-effective email platform for sending transactional, marketing, and notification emails. It also receives incoming email and integrates with S3, SNS, and Lambda for processing.

## Core Concepts

- **Verified Identity** — domain or email address authorized to send
- **Configuration Set** — tracking settings for opens, clicks, bounces
- **Template** — reusable email template with variable substitution
- **Receipt Rule** — rules for processing incoming emails
- **Suppression List** — addresses that bounced or complained
- **Sending Quota** — rate limits based on account reputation

## Domain Verification

```bash
# Verify a domain (creates DKIM records)
aws sesv2 create-email-identity --email-identity example.com
```

```bash
# Get DKIM tokens to add as DNS CNAME records
aws sesv2 get-email-identity --email-identity example.com \
  --query 'DkimAttributes.Tokens'
```

```bash
# Verify a single email address (for testing)
aws sesv2 create-email-identity --email-identity test@example.com
```

```bash
# List verified identities
aws sesv2 list-email-identities --query 'EmailIdentities[].IdentityName'
```

## Sending Email

```bash
# Send a simple email
aws sesv2 send-email \
  --from-email-address "noreply@example.com" \
  --destination '{"ToAddresses":["user@example.com"]}' \
  --content '{
    "Simple": {
      "Subject": {"Data": "Order Confirmation #12345"},
      "Body": {
        "Html": {"Data": "<h1>Thank you!</h1><p>Your order has been confirmed.</p>"},
        "Text": {"Data": "Thank you! Your order has been confirmed."}
      }
    }
  }' \
  --configuration-set-name prod-tracking
```

```python
# Send email with boto3
import boto3

ses = boto3.client('sesv2')

ses.send_email(
    FromEmailAddress='noreply@example.com',
    Destination={
        'ToAddresses': ['user@example.com'],
        'BccAddresses': ['archive@example.com']
    },
    Content={
        'Simple': {
            'Subject': {'Data': 'Your Invoice'},
            'Body': {
                'Html': {'Data': '<h1>Invoice #INV-001</h1><p>Amount: $99.99</p>'},
                'Text': {'Data': 'Invoice #INV-001\nAmount: $99.99'}
            }
        }
    },
    ConfigurationSetName='prod-tracking'
)
```

## Email Templates

```bash
# Create a template
aws sesv2 create-email-template \
  --template-name order-confirmation \
  --template-content '{
    "Subject": "Order Confirmation #{{orderNumber}}",
    "Html": "<h1>Hi {{customerName}},</h1><p>Your order #{{orderNumber}} for {{itemName}} has been confirmed.</p><p>Total: ${{total}}</p>",
    "Text": "Hi {{customerName}},\nYour order #{{orderNumber}} for {{itemName}} has been confirmed.\nTotal: ${{total}}"
  }'
```

```bash
# Send using a template
aws sesv2 send-email \
  --from-email-address "orders@example.com" \
  --destination '{"ToAddresses":["user@example.com"]}' \
  --content '{
    "Template": {
      "TemplateName": "order-confirmation",
      "TemplateData": "{\"orderNumber\":\"12345\",\"customerName\":\"Alice\",\"itemName\":\"Widget Pro\",\"total\":\"99.99\"}"
    }
  }'
```

```python
# Bulk templated sending with boto3
import boto3

ses = boto3.client('sesv2')

ses.send_bulk_email(
    FromEmailAddress='marketing@example.com',
    DefaultContent={
        'Template': {
            'TemplateName': 'weekly-newsletter',
            'TemplateData': '{"week":"Jan 15"}'
        }
    },
    BulkEmailEntries=[
        {
            'Destination': {'ToAddresses': ['alice@example.com']},
            'ReplacementEmailContent': {
                'ReplacementTemplate': {
                    'ReplacementTemplateData': '{"name":"Alice","recommendations":"Widget A, Widget B"}'
                }
            }
        },
        {
            'Destination': {'ToAddresses': ['bob@example.com']},
            'ReplacementEmailContent': {
                'ReplacementTemplate': {
                    'ReplacementTemplateData': '{"name":"Bob","recommendations":"Gadget X, Gadget Y"}'
                }
            }
        }
    ],
    ConfigurationSetName='marketing-tracking'
)
```

## Bounce and Complaint Handling

```bash
# Create a configuration set with event destinations
aws sesv2 create-configuration-set --configuration-set-name prod-tracking

# Add SNS destination for bounces and complaints
aws sesv2 create-configuration-set-event-destination \
  --configuration-set-name prod-tracking \
  --event-destination-name bounce-handler \
  --event-destination '{
    "Enabled": true,
    "MatchingEventTypes": ["BOUNCE", "COMPLAINT"],
    "SnsDestination": {
      "TopicArn": "arn:aws:sns:us-east-1:123456789:ses-bounces"
    }
  }'
```

```python
# Lambda handler for bounce/complaint SNS notifications
import json

def handler(event, context):
    for record in event['Records']:
        message = json.loads(record['Sns']['Message'])
        notification_type = message['notificationType']

        if notification_type == 'Bounce':
            bounce = message['bounce']
            for recipient in bounce['bouncedRecipients']:
                email = recipient['emailAddress']
                bounce_type = bounce['bounceType']  # Permanent or Transient
                if bounce_type == 'Permanent':
                    suppress_email(email)

        elif notification_type == 'Complaint':
            complaint = message['complaint']
            for recipient in complaint['complainedRecipients']:
                unsubscribe_email(recipient['emailAddress'])
```

## Receiving Email

```bash
# Create a receipt rule set
aws ses create-receipt-rule-set --rule-set-name inbound-rules
aws ses set-active-receipt-rule-set --rule-set-name inbound-rules
```

```bash
# Create rule to store incoming email in S3 and trigger Lambda
aws ses create-receipt-rule \
  --rule-set-name inbound-rules \
  --rule '{
    "Name": "process-support-emails",
    "Enabled": true,
    "Recipients": ["support@example.com"],
    "Actions": [
      {"S3Action": {"BucketName": "incoming-email", "ObjectKeyPrefix": "support/"}},
      {"LambdaAction": {"FunctionArn": "arn:aws:lambda:us-east-1:123456789:function:process-support-email"}}
    ]
  }'
```

## Monitoring

```bash
# Check sending quota and statistics
aws sesv2 get-account --query '{SendQuota:SendQuota,SendingEnabled:SendingEnabled}'
```

```bash
# Get sending statistics
aws ses get-send-statistics --query 'SendDataPoints[-5:]'
```

## Best Practices

- Always verify domains with DKIM for better deliverability
- Set up bounce and complaint handling before sending at scale
- Use configuration sets to track delivery metrics
- Send from a subdomain (mail.example.com) to protect main domain reputation
- Include unsubscribe headers in marketing emails (required by law)
- Warm up new accounts gradually — start with small volumes
- Use the suppression list API to respect bounces and complaints
- Test with the SES mailbox simulator before going to production
