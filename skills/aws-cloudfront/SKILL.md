---
name: aws-cloudfront
description: |
  Configure Amazon CloudFront for global content delivery. Set up distributions
  with S3 and ALB origins, define cache behaviors and TTLs, invalidate cached
  content, and use Lambda@Edge for request/response manipulation at the edge.
license: Apache-2.0
compatibility: 'AWS CLI v2, boto3'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - aws
    - cloudfront
    - cdn
    - caching
    - lambda-edge
---

# AWS CloudFront

## Overview

Amazon CloudFront is a global CDN that delivers content from 400+ edge locations. It caches static and dynamic content, terminates SSL, and integrates with S3, ALB, and API Gateway as origins.

### Core Concepts

- **Distribution** — a CloudFront deployment with origins and behaviors
- **Origin** — the source of content (S3, ALB, custom HTTP server)
- **Cache Behavior** — rules for how requests are handled per URL pattern
- **Origin Access Control (OAC)** — restricts S3 access to CloudFront only
- **Lambda@Edge** — run code at edge locations on request/response
- **Invalidation** — remove cached content before TTL expires

## Instructions

### Creating a Distribution

```jsonc
// dist-config.json — CloudFront distribution for S3 static site + ALB API
{
  "CallerReference": "northwind-shop-2026-10",
  "Comment": "Northwind Shop CDN",
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-static",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "ResponseHeadersPolicyId": "67f7725c-6f97-4210-82d7-5512b31e9d03",
    "Compress": true,
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}
    }
  },
  "Origins": {
    "Quantity": 2,
    "Items": [
      {
        "Id": "s3-static",
        "DomainName": "northwind-assets.s3.us-east-1.amazonaws.com",
        "OriginAccessControlId": "E2QWRUHAPOMQZL",
        "S3OriginConfig": {"OriginAccessIdentity": ""}
      },
      {
        "Id": "alb-api",
        "DomainName": "api.northwind-shop.io",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "https-only"
        }
      }
    ]
  },
  "CacheBehaviors": {
    "Quantity": 1,
    "Items": [{
      "PathPattern": "/api/*",
      "TargetOriginId": "alb-api",
      "ViewerProtocolPolicy": "https-only",
      "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
      "OriginRequestPolicyId": "216adef6-5c7f-47e4-b989-5492eafa07d3",
      "AllowedMethods": {
        "Quantity": 7,
        "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
        "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}
      }
    }]
  },
  "DefaultRootObject": "index.html",
  "Enabled": true,
  "PriceClass": "PriceClass_100",
  "ViewerCertificate": {
    "ACMCertificateArn": "arn:aws:acm:us-east-1:123456789012:certificate/5f3c1a7e-2b4d-4c8e-9a10-6d2e7f0b9c11",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2025"
  },
  "Aliases": {"Quantity": 1, "Items": ["www.northwind-shop.io"]}
}
```

```bash
aws cloudfront create-distribution --distribution-config file://dist-config.json
```

Notes: the managed policy IDs above are Managed-CachingOptimized (`658327ea-...`), Managed-CachingDisabled (`4135ea2d-...`), Managed-AllViewer (`216adef6-...`) and Managed-SecurityHeadersPolicy (`67f7725c-...`). The `AllowedMethods` block nests `CachedMethods` and each list needs a `Quantity`; a plain JSON array is rejected. For an ALB origin with `https-only`, the origin domain must match a certificate on the load balancer, so use your own DNS name for it rather than the `*.elb.amazonaws.com` name. Allowed `MinimumProtocolVersion` values include `TLSv1.2_2021`, `TLSv1.2_2025` and `TLSv1.3_2025`. CloudFront also offers flat-rate pricing plans (CDN, WAF and DDoS protection for a fixed monthly price); pay-as-you-go distributions still work as described here.

### Origin Access Control

```bash
# Create OAC to restrict S3 access to CloudFront
aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name": "northwind-assets-oac",
    "OriginAccessControlOriginType": "s3",
    "SigningBehavior": "always",
    "SigningProtocol": "sigv4"
  }'
# the response contains the Id to put in OriginAccessControlId
```

```jsonc
// S3 bucket policy allowing only CloudFront
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFront",
    "Effect": "Allow",
    "Principal": {"Service": "cloudfront.amazonaws.com"},
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::northwind-assets/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::123456789012:distribution/E1ABCDEF234567"
      }
    }
  }]
}
```

### Cache Invalidation

```bash
# Invalidate specific paths
aws cloudfront create-invalidation \
  --distribution-id E1ABCDEF234567 \
  --paths '/index.html' '/static/app.js' '/api/config'
```

```bash
# Invalidate everything (a wildcard counts as one path; the first 1,000 paths a month are free, then billed per path)
aws cloudfront create-invalidation \
  --distribution-id E1ABCDEF234567 \
  --paths '/*'
```

```bash
# Check invalidation status
aws cloudfront list-invalidations --distribution-id E1ABCDEF234567
```

### Lambda@Edge

```python
# lambda-edge/viewer-request.py — SPA routing
def handler(event, context):
    request = event['Records'][0]['cf']['request']
    uri = request['uri']

    # SPA routing: serve index.html for non-file paths
    if '.' not in uri.split('/')[-1]:
        request['uri'] = '/index.html'

    return request
```

```python
# lambda-edge/origin-response.py — add security headers
def handler(event, context):
    response = event['Records'][0]['cf']['response']
    headers = response['headers']

    headers['strict-transport-security'] = [{
        'key': 'Strict-Transport-Security',
        'value': 'max-age=63072000; includeSubDomains; preload'
    }]
    headers['x-content-type-options'] = [{
        'key': 'X-Content-Type-Options',
        'value': 'nosniff'
    }]
    headers['x-frame-options'] = [{
        'key': 'X-Frame-Options',
        'value': 'DENY'
    }]

    return response
```

Lambda@Edge functions must be created in us-east-1, published as a numbered version (not `$LATEST`), and associated with the behavior through `LambdaFunctionAssociations` (event types `viewer-request`, `origin-request`, `origin-response`, `viewer-response`). The execution role must trust both `lambda.amazonaws.com` and `edgelambda.amazonaws.com`. For simple jobs such as SPA routing or header rewrites, a CloudFront Function (`aws cloudfront create-function`, JavaScript, viewer events only) is cheaper and faster, and security headers need no code at all: attach the managed `SecurityHeadersPolicy` (`ResponseHeadersPolicyId`) as in the config above.

### Custom Error Pages

Update an existing distribution by fetching its config and ETag, editing, and sending both back:

```bash
aws cloudfront get-distribution-config --id E1ABCDEF234567 > current.json
# keep the live DistributionConfig (it carries the real CallerReference and every origin),
# add the CustomErrorResponses block below to it, then send it back with the ETag:
jq .DistributionConfig current.json > updated-config.json
aws cloudfront update-distribution --id E1ABCDEF234567 \
  --if-match "$(jq -r .ETag current.json)" --distribution-config file://updated-config.json
```

```jsonc
// Custom error responses for SPA routing
{
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      {"ErrorCode": 403, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 10},
      {"ErrorCode": 404, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 10}
    ]
  }
}
```

### Monitoring

```bash
# Get distribution details
aws cloudfront get-distribution --id E1ABCDEF234567 \
  --query 'Distribution.[DomainName,Status,DistributionConfig.Enabled]'
```

```bash
# Enable real-time logs
aws cloudfront create-realtime-log-config \
  --name app-realtime-logs \
  --sampling-rate 100 \
  --fields "timestamp" "c-ip" "sc-status" "cs-uri-stem" "time-taken" \
  --end-points '[{"StreamType":"Kinesis","KinesisStreamConfig":{"RoleARN":"arn:aws:iam::123456789012:role/cf-realtime-logs","StreamARN":"arn:aws:kinesis:us-east-1:123456789012:stream/cf-logs"}}]'
```

## Examples

### Example 1: Put a private S3 site behind CloudFront
**User request:** "Serve the northwind-assets bucket through CloudFront on www.northwind-shop.io, and keep the bucket private."

Create an OAC with `aws cloudfront create-origin-access-control`, put its `Id` in `OriginAccessControlId` of the S3 origin, create the distribution from `dist-config.json`, then add the bucket policy that allows `cloudfront.amazonaws.com` for that distribution's ARN. The result is a `d111111abcdef8.cloudfront.net` domain that serves objects while direct S3 URLs return 403; point a Route 53 alias record at it for the custom name.

### Example 2: Ship a new build of a single-page app
**User request:** "I deployed a new app.js and index.html but visitors still see the old version."

Upload hashed asset names (`app.4f9c2.js`) and invalidate only the entry points:

```bash
aws cloudfront create-invalidation --distribution-id E1ABCDEF234567 --paths '/index.html'
aws cloudfront list-invalidations --distribution-id E1ABCDEF234567 --query 'InvalidationList.Items[0].[Id,Status]'
```

The status moves from `InProgress` to `Completed` within a few minutes.

## Guidelines

- Use Origin Access Control (not legacy OAI) for S3 origins
- Enable compression for text-based assets (HTML, CSS, JS, JSON)
- Use managed cache policies instead of custom forwarding settings
- Invalidate sparingly — use versioned filenames (app.v2.js) instead
- Set appropriate TTLs: long for static assets, short for dynamic content
- Use Lambda@Edge for SPA routing, A/B testing, and auth at the edge
- Enable HTTPS everywhere with ACM certificates (must be in us-east-1)
- Keep the S3 bucket private (Block Public Access on) and reach it only through OAC; use a response headers policy before reaching for Lambda@Edge
