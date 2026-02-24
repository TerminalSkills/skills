---
name: aws-cloudfront
description: |
  Configure Amazon CloudFront for global content delivery. Set up distributions
  with S3 and ALB origins, define cache behaviors and TTLs, invalidate cached
  content, and use Lambda@Edge for request/response manipulation at the edge.
license: Apache-2.0
compatibility:
  - aws-cli
  - boto3
  - terraform
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - aws
    - cloudfront
    - cdn
    - caching
    - lambda-edge
---

# AWS CloudFront

Amazon CloudFront is a global CDN that delivers content from 400+ edge locations. It caches static and dynamic content, terminates SSL, and integrates with S3, ALB, and API Gateway as origins.

## Core Concepts

- **Distribution** — a CloudFront deployment with origins and behaviors
- **Origin** — the source of content (S3, ALB, custom HTTP server)
- **Cache Behavior** — rules for how requests are handled per URL pattern
- **Origin Access Control (OAC)** — restricts S3 access to CloudFront only
- **Lambda@Edge** — run code at edge locations on request/response
- **Invalidation** — remove cached content before TTL expires

## Creating a Distribution

```json
// dist-config.json — CloudFront distribution for S3 static site + ALB API
{
  "CallerReference": "my-app-2024",
  "Comment": "My App CDN",
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-static",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true,
    "AllowedMethods": ["GET", "HEAD"],
    "CachedMethods": ["GET", "HEAD"]
  },
  "Origins": {
    "Quantity": 2,
    "Items": [
      {
        "Id": "s3-static",
        "DomainName": "my-app-assets.s3.us-east-1.amazonaws.com",
        "OriginAccessControlId": "EABCDEF123456",
        "S3OriginConfig": {"OriginAccessIdentity": ""}
      },
      {
        "Id": "alb-api",
        "DomainName": "app-alb-123456.us-east-1.elb.amazonaws.com",
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
      "AllowedMethods": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
      "CachedMethods": ["GET", "HEAD"]
    }]
  },
  "DefaultRootObject": "index.html",
  "Enabled": true,
  "PriceClass": "PriceClass_100",
  "ViewerCertificate": {
    "ACMCertificateArn": "arn:aws:acm:us-east-1:123456789:certificate/abc-123",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "Aliases": {"Quantity": 1, "Items": ["app.example.com"]}
}
```

```bash
# Create distribution
aws cloudfront create-distribution --distribution-config file://dist-config.json
```

## Origin Access Control

```bash
# Create OAC to restrict S3 access to CloudFront
aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name": "my-app-oac",
    "OriginAccessControlOriginType": "s3",
    "SigningBehavior": "always",
    "SigningProtocol": "sigv4"
  }'
```

```json
// S3 bucket policy allowing only CloudFront
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFront",
    "Effect": "Allow",
    "Principal": {"Service": "cloudfront.amazonaws.com"},
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-app-assets/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::123456789:distribution/E1234567890"
      }
    }
  }]
}
```

## Cache Invalidation

```bash
# Invalidate specific paths
aws cloudfront create-invalidation \
  --distribution-id E1234567890 \
  --paths '/index.html' '/static/app.js' '/api/config'
```

```bash
# Invalidate everything (use sparingly — costs per path)
aws cloudfront create-invalidation \
  --distribution-id E1234567890 \
  --paths '/*'
```

```bash
# Check invalidation status
aws cloudfront list-invalidations --distribution-id E1234567890
```

## Lambda@Edge

```python
# lambda-edge/viewer-request.py — add security headers and redirect
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

## Custom Error Pages

```bash
# Configure custom error responses (SPA fallback)
aws cloudfront update-distribution \
  --id E1234567890 \
  --if-match ETAG123 \
  --distribution-config '...' # Include CustomErrorResponses:
```

```json
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

## Monitoring

```bash
# Get distribution details
aws cloudfront get-distribution --id E1234567890 \
  --query 'Distribution.[DomainName,Status,DistributionConfig.Enabled]'
```

```bash
# Enable real-time logs
aws cloudfront create-realtime-log-config \
  --name app-realtime-logs \
  --sampling-rate 100 \
  --fields "timestamp" "c-ip" "sc-status" "cs-uri-stem" "time-taken" \
  --end-points '[{"StreamType":"Kinesis","KinesisStreamConfig":{"RoleARN":"arn:aws:iam::123456789:role/cf-realtime-logs","StreamARN":"arn:aws:kinesis:us-east-1:123456789:stream/cf-logs"}}]'
```

## Best Practices

- Use Origin Access Control (not legacy OAI) for S3 origins
- Enable compression for text-based assets (HTML, CSS, JS, JSON)
- Use managed cache policies instead of custom forwarding settings
- Invalidate sparingly — use versioned filenames (app.v2.js) instead
- Set appropriate TTLs: long for static assets, short for dynamic content
- Use Lambda@Edge for SPA routing, A/B testing, and auth at the edge
- Enable HTTPS everywhere with ACM certificates (must be in us-east-1)
