---
name: aws-ses
description: |
  Amazon SES (Simple Email Service) sends and receives email through AWS: transactional and
  marketing mail, templates, bounce and complaint tracking, and inbound mail processing.
  Use when a user asks to send email with SES, verify a domain or set up DKIM, move an SES
  account out of the sandbox, create or bulk-send email templates, add an attachment or
  unsubscribe header, handle bounces and complaints with SNS, manage the suppression list,
  or store incoming mail in S3 with receipt rules. Covers the SES v2 API (aws sesv2, boto3
  sesv2).
license: Apache-2.0
compatibility: 'AWS CLI v2 (or v1 with the sesv2 commands), boto3; AWS credentials with SES permissions in the Region you send from'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags:
    - aws
    - ses
    - email
    - notifications
---

# AWS SES

## Overview

Amazon Simple Email Service (SES) is a pay-per-message email platform for transactional, marketing, and notification mail. It also receives incoming email and hands it to S3, SNS, or Lambda. Use the v2 API (`aws sesv2`, `boto3.client('sesv2')`) for everything except receipt rules and `get-send-statistics`, which exist only in the v1 API (`aws ses`). Identities, templates, quotas and the sandbox status are all per Region.

- **Verified identity** — domain or email address authorized to send
- **Configuration set** — named group of settings and event destinations applied per message
- **Template** — stored subject and body with `{{variable}}` placeholders
- **Suppression list** — account-level list of addresses that hard-bounced or complained
- **Sandbox** — the state of every new account: verified recipients only, 200 messages per 24 hours, 1 per second

## Instructions

### Verify a domain

```bash
# Create the identity; Easy DKIM (2048-bit) is the default and doubles as domain verification
aws sesv2 create-email-identity --email-identity mail.brightcart.io

# Three tokens plus the hosted zone to build the CNAME records from
aws sesv2 get-email-identity --email-identity mail.brightcart.io \
  --query 'DkimAttributes.{Tokens:Tokens,Zone:SigningHostedZone,Status:Status}'
```

For each token publish `TOKEN._domainkey.mail.brightcart.io CNAME TOKEN.SIGNING_HOSTED_ZONE`. The hosted zone differs per Region, so read it from the response instead of hard-coding `dkim.amazonses.com`. Verification completes when SES sees all three records (DNS changes can take up to 72 hours).

```bash
# A single address instead of a domain: SES emails a confirmation link valid for 24 hours
aws sesv2 create-email-identity --email-identity orders@brightcart.io

# Custom MAIL FROM (aligns SPF for DMARC). Then publish on bounce.mail.brightcart.io:
#   MX  10 feedback-smtp.us-east-1.amazonses.com      TXT  "v=spf1 include:amazonses.com ~all"
aws sesv2 put-email-identity-mail-from-attributes --email-identity mail.brightcart.io \
  --mail-from-domain bounce.mail.brightcart.io --behavior-on-mx-failure USE_DEFAULT_VALUE

aws sesv2 list-email-identities --query 'EmailIdentities[].[IdentityName,VerificationStatus]'
```

### Sandbox, quota and statistics

```bash
aws sesv2 get-account --query '{Production:ProductionAccessEnabled,Quota:SendQuota,Sending:SendingEnabled}'
aws ses get-send-statistics --query 'SendDataPoints[-5:]'   # sends, bounces, complaints per 15-minute interval

aws sesv2 put-account-details --production-access-enabled --mail-type TRANSACTIONAL \
  --website-url https://brightcart.io --contact-language EN \
  --use-case-description "Order confirmations and password resets for registered customers" \
  --additional-contact-email-addresses ops@brightcart.io
```

AWS Support gives a first response within 24 hours. Until access is granted you can only send to verified identities and the mailbox simulator. Sandbox status is per Region.

### Send email

```bash
aws sesv2 send-email \
  --from-email-address "BrightCart <orders@mail.brightcart.io>" \
  --destination '{"ToAddresses":["dana.whitfield@oakridgeclinic.org"]}' \
  --content '{
    "Simple": {
      "Subject": {"Data": "Order confirmation #48213"},
      "Body": {
        "Html": {"Data": "<h1>Thank you!</h1><p>Your order has been confirmed.</p>"},
        "Text": {"Data": "Thank you! Your order has been confirmed."}
      }
    }
  }' \
  --configuration-set-name prod-tracking
```

`--configuration-set-name` must name an existing configuration set: create `prod-tracking` first (see Bounce and complaint handling) or omit the flag. `Content` takes exactly one of `Simple`, `Template` or `Raw` (a full MIME message). `Simple` and `Template` also accept `Headers` and `Attachments`, so attachments no longer require building raw MIME (see Example 1).

### Email templates

```bash
aws sesv2 create-email-template \
  --template-name order-confirmation \
  --template-content '{
    "Subject": "Order confirmation #{{orderNumber}}",
    "Html": "<h1>Hi {{customerName}},</h1><p>Your order #{{orderNumber}} for {{itemName}} is confirmed.</p><p>Total: ${{total}}</p>",
    "Text": "Hi {{customerName}},\nYour order #{{orderNumber}} for {{itemName}} is confirmed.\nTotal: ${{total}}"
  }'

# Render locally-supplied data against the stored template before sending
aws sesv2 test-render-email-template --template-name order-confirmation \
  --template-data '{"orderNumber":"48213","customerName":"Dana","itemName":"Trail Pack 30L","total":"89.00"}'

aws sesv2 send-email \
  --from-email-address "orders@mail.brightcart.io" \
  --destination '{"ToAddresses":["dana.whitfield@oakridgeclinic.org"]}' \
  --content '{"Template": {"TemplateName": "order-confirmation",
    "TemplateData": "{\"orderNumber\":\"48213\",\"customerName\":\"Dana\",\"itemName\":\"Trail Pack 30L\",\"total\":\"89.00\"}"}}'
```

```python
# Bulk send: one personalized message per entry, at most 50 entries per call. Assumes a
# `weekly-newsletter` template with {{name}} and {{picks}} and a `marketing-tracking` configuration set.
import json
import boto3

ses = boto3.client('sesv2', region_name='us-east-1')
subscribers = [
    {'email': 'alice.moreno@oakridgeclinic.org', 'name': 'Alice', 'picks': 'Trail Pack 30L, Merino Socks'},
    {'email': 'omar.haddad@fernwoodlabs.net', 'name': 'Omar', 'picks': 'Summit Tent 2P, Camp Stove'},
]

response = ses.send_bulk_email(
    FromEmailAddress='news@mail.brightcart.io',
    DefaultContent={'Template': {'TemplateName': 'weekly-newsletter',
                                 'TemplateData': json.dumps({'name': 'there', 'picks': ''})}},
    BulkEmailEntries=[
        {'Destination': {'ToAddresses': [s['email']]},
         'ReplacementEmailContent': {'ReplacementTemplate': {
             'ReplacementTemplateData': json.dumps({'name': s['name'], 'picks': s['picks']})}}}
        for s in subscribers
    ],
    ConfigurationSetName='marketing-tracking',
)
for sub, result in zip(subscribers, response['BulkEmailEntryResults']):
    print(sub['email'], result['Status'], result.get('MessageId') or result.get('Error'))
```

The call succeeds even when individual entries fail; check each `Status` (`SUCCESS`, `MESSAGE_REJECTED`, `ACCOUNT_THROTTLED`, ...). A message whose template data is missing a variable is accepted and then dropped, visible only as a `RENDERING_FAILURE` event.

### Bounce and complaint handling

```bash
aws sesv2 create-configuration-set --configuration-set-name prod-tracking

aws sesv2 create-configuration-set-event-destination \
  --configuration-set-name prod-tracking \
  --event-destination-name bounce-handler \
  --event-destination '{
    "Enabled": true,
    "MatchingEventTypes": ["BOUNCE", "COMPLAINT", "RENDERING_FAILURE"],
    "SnsDestination": {"TopicArn": "arn:aws:sns:us-east-1:111122223333:ses-events"}
  }'
```

```python
# Lambda subscribed to the SNS topic
import json

def handler(event, context):
    for record in event['Records']:
        message = json.loads(record['Sns']['Message'])
        # Event publishing uses "eventType"; identity feedback notifications use "notificationType"
        kind = message.get('eventType') or message.get('notificationType')

        if kind == 'Bounce' and message['bounce']['bounceType'] == 'Permanent':
            for recipient in message['bounce']['bouncedRecipients']:
                mark_undeliverable(recipient['emailAddress'])      # your own data store
        elif kind == 'Complaint':
            for recipient in message['complaint']['complainedRecipients']:
                unsubscribe(recipient['emailAddress'])
```

SES also keeps an account-level suppression list and silently skips addresses on it:

```bash
aws sesv2 put-account-suppression-attributes --suppressed-reasons BOUNCE COMPLAINT
aws sesv2 list-suppressed-destinations --reasons BOUNCE
aws sesv2 get-suppressed-destination --email-address dana.whitfield@oakridgeclinic.org
aws sesv2 put-suppressed-destination --email-address old.account@fernwoodlabs.net --reason BOUNCE
```

### Receiving email

Verify the receiving domain itself as an identity (`aws sesv2 create-email-identity --email-identity brightcart.io`; the `mail.` subdomain does not cover it), publish an MX record for it (`10 inbound-smtp.us-east-1.amazonaws.com`; only some Regions have an inbound endpoint), then create receipt rules with the v1 API:

```bash
aws ses create-receipt-rule-set --rule-set-name inbound-rules
aws ses set-active-receipt-rule-set --rule-set-name inbound-rules

aws ses create-receipt-rule \
  --rule-set-name inbound-rules \
  --rule '{
    "Name": "process-support-emails",
    "Enabled": true,
    "Recipients": ["support@brightcart.io"],
    "Actions": [
      {"S3Action": {"BucketName": "brightcart-inbound-mail", "ObjectKeyPrefix": "support/"}},
      {"LambdaAction": {"FunctionArn": "arn:aws:lambda:us-east-1:111122223333:function:process-support-email"}}
    ]
  }'
```

The bucket policy must allow `ses.amazonaws.com` to `s3:PutObject`, and the function needs a resource policy that lets SES invoke it; otherwise `create-receipt-rule` fails.

## Examples

### Example 1: Order confirmation with a PDF invoice

**User request:** "Send the order confirmation from our Python backend with the invoice PDF attached, and make sure a throttled send is retried."

```python
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

ses = boto3.client('sesv2', region_name='us-east-1',
                   config=Config(retries={'mode': 'adaptive', 'max_attempts': 5}))

with open('invoices/INV-48213.pdf', 'rb') as f:
    invoice = f.read()

try:
    response = ses.send_email(
        FromEmailAddress='BrightCart <orders@mail.brightcart.io>',
        Destination={'ToAddresses': ['dana.whitfield@oakridgeclinic.org']},
        ReplyToAddresses=['support@brightcart.io'],
        Content={'Simple': {
            'Subject': {'Data': 'Your BrightCart order #48213'},
            'Body': {'Html': {'Data': '<p>Thanks, Dana. Your invoice is attached.</p>'},
                     'Text': {'Data': 'Thanks, Dana. Your invoice is attached.'}},
            'Attachments': [{'FileName': 'INV-48213.pdf', 'RawContent': invoice,
                             'ContentType': 'application/pdf'}],
        }},
        ConfigurationSetName='prod-tracking',
        EmailTags=[{'Name': 'type', 'Value': 'order-confirmation'}],
    )
    print(response['MessageId'])
except ClientError as err:
    # MessageRejected, MailFromDomainNotVerifiedException, AccountSuspendedException, ...
    print(err.response['Error']['Code'], err.response['Error']['Message'])
    raise
```

Result: the script prints the SES message ID, for example `0100019a2c4e7f31-5d0c8b7e-3f41-4a55-9d2e-7c1b6a40e9d2-000000`. `TooManyRequestsException` is retried by the SDK; in the sandbox an unverified recipient raises `MessageRejected` with "Email address is not verified".

### Example 2: Test bounce handling without hurting reputation

**User request:** "Before we go live, prove that a hard bounce reaches our SNS topic."

```bash
aws sesv2 send-email \
  --from-email-address orders@mail.brightcart.io \
  --destination '{"ToAddresses":["bounce@simulator.amazonses.com"]}' \
  --content '{"Simple":{"Subject":{"Data":"Bounce test"},"Body":{"Text":{"Data":"Simulated hard bounce"}}}}' \
  --configuration-set-name prod-tracking
```

Within seconds the SNS topic receives a record like this (trimmed):

```json
{
  "eventType": "Bounce",
  "bounce": {
    "bounceType": "Permanent",
    "bounceSubType": "General",
    "bouncedRecipients": [
      {"emailAddress": "bounce@simulator.amazonses.com", "action": "failed", "status": "5.1.1",
       "diagnosticCode": "smtp; 550 5.1.1 user unknown"}
    ]
  },
  "mail": {"source": "orders@mail.brightcart.io", "tags": {"ses:configuration-set": ["prod-tracking"]}}
}
```

Other simulator addresses: `success@`, `complaint@`, `ooto@` and `suppressionlist@simulator.amazonses.com`. Simulator mail works in the sandbox and does not count toward the daily quota or the bounce and complaint rates, but it is billed.

## Guidelines

- Send from a subdomain (`mail.brightcart.io`) with DKIM, a custom MAIL FROM and a DMARC record, so marketing problems do not damage the main domain.
- Set up bounce and complaint handling before sending at volume. AWS puts an account under review at a 5% bounce rate or a 0.1% complaint rate and may pause sending at 10% or 0.5%.
- Remove permanently bounced addresses from your own lists as well; the suppression list only stops SES from retrying them.
- Bulk and marketing mail must carry one-click unsubscribe (`List-Unsubscribe` and `List-Unsubscribe-Post` headers), required by Gmail and Yahoo. Either pass them in `Headers`, or use an SES contact list with `ListManagementOptions` and the `{{amazonSESUnsubscribeUrl}}` placeholder.
- `TemplateData` is a JSON **string**, not an object; build it with `json.dumps` rather than by hand.
- Grant the sending role only `ses:SendEmail` (and `ses:SendBulkEmail` if needed), restricted to the ARNs of the identity, configuration set and templates it uses; do not hand application servers `ses:*`.
- Never put AWS keys in code. Use an instance or task role, or a named profile through `AWS_PROFILE`.
- Open tracking is unreliable (mail clients prefetch images; events carry `isBotEvent`). Use delivery, bounce and complaint events for decisions.
- Not a mailbox: SES receiving hands messages to S3, SNS or Lambda and offers no IMAP or POP3. For hosted mailboxes use a mail provider.
