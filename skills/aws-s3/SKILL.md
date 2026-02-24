---
name: aws-s3
description: |
  Master Amazon S3 for scalable object storage. Create and configure buckets,
  upload and manage objects, generate presigned URLs for secure temporary access,
  set up lifecycle policies for cost optimization, and enable versioning for
  data protection and compliance.
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
    - s3
    - object-storage
    - cloud
---

# AWS S3

Amazon Simple Storage Service (S3) provides virtually unlimited object storage with 99.999999999% durability. It's the backbone of AWS storage, used for static assets, backups, data lakes, and application data.

## Core Concepts

- **Bucket** — globally unique container for objects, scoped to a region
- **Object** — a file plus metadata, identified by key (path)
- **Storage class** — Standard, IA, Glacier, Deep Archive for cost tiers
- **ACL / Bucket Policy** — access control mechanisms
- **Versioning** — keep multiple variants of an object

## Bucket Operations

```bash
# Create a bucket in a specific region
aws s3 mb s3://my-app-assets-prod --region us-east-1
```

```bash
# List all buckets
aws s3 ls
```

```bash
# Enable versioning on a bucket
aws s3api put-bucket-versioning \
  --bucket my-app-assets-prod \
  --versioning-configuration Status=Enabled
```

```bash
# Set bucket policy for public read (static website)
cat > /tmp/bucket-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicRead",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-app-assets-prod/*"
  }]
}
EOF
aws s3api put-bucket-policy \
  --bucket my-app-assets-prod \
  --policy file:///tmp/bucket-policy.json
```

## Object Operations

```bash
# Upload a file
aws s3 cp ./build/app.zip s3://my-app-assets-prod/releases/v1.2.0/app.zip
```

```bash
# Sync a directory to S3
aws s3 sync ./dist s3://my-app-assets-prod/static/ \
  --delete \
  --cache-control "max-age=86400"
```

```bash
# Copy between buckets
aws s3 cp s3://source-bucket/data.csv s3://dest-bucket/data.csv
```

```bash
# List objects with prefix
aws s3 ls s3://my-app-assets-prod/releases/ --recursive --human-readable
```

```bash
# Remove objects
aws s3 rm s3://my-app-assets-prod/old-file.txt
```

## Presigned URLs

```bash
# Generate a presigned URL for download (expires in 1 hour)
aws s3 presign s3://my-app-assets-prod/reports/q4.pdf --expires-in 3600
```

```python
# Generate presigned upload URL with boto3
import boto3

s3 = boto3.client('s3')

# Presigned URL for PUT upload
url = s3.generate_presigned_url(
    'put_object',
    Params={
        'Bucket': 'my-app-assets-prod',
        'Key': 'uploads/user-avatar.jpg',
        'ContentType': 'image/jpeg'
    },
    ExpiresIn=900  # 15 minutes
)
print(url)
```

```python
# Presigned POST for browser-based uploads
import boto3

s3 = boto3.client('s3')
response = s3.generate_presigned_post(
    Bucket='my-app-assets-prod',
    Key='uploads/${filename}',
    Fields={'Content-Type': 'image/jpeg'},
    Conditions=[
        ['content-length-range', 1, 10485760],  # 1B to 10MB
        {'Content-Type': 'image/jpeg'}
    ],
    ExpiresIn=900
)
```

## Lifecycle Policies

```json
// lifecycle-config.json — transition objects to cheaper storage over time
{
  "Rules": [
    {
      "ID": "ArchiveOldLogs",
      "Status": "Enabled",
      "Filter": { "Prefix": "logs/" },
      "Transitions": [
        { "Days": 30, "StorageClass": "STANDARD_IA" },
        { "Days": 90, "StorageClass": "GLACIER" }
      ],
      "Expiration": { "Days": 365 }
    },
    {
      "ID": "CleanupIncompleteUploads",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

```bash
# Apply lifecycle configuration
aws s3api put-bucket-lifecycle-configuration \
  --bucket my-app-assets-prod \
  --lifecycle-configuration file://lifecycle-config.json
```

## Versioning and Recovery

```bash
# List object versions
aws s3api list-object-versions \
  --bucket my-app-assets-prod \
  --prefix config/settings.json
```

```bash
# Restore a previous version by copying it
aws s3api copy-object \
  --bucket my-app-assets-prod \
  --key config/settings.json \
  --copy-source "my-app-assets-prod/config/settings.json?versionId=abc123"
```

```bash
# Delete a specific version permanently
aws s3api delete-object \
  --bucket my-app-assets-prod \
  --key config/settings.json \
  --version-id abc123
```

## Server-Side Encryption

```bash
# Enable default encryption on bucket
aws s3api put-bucket-encryption \
  --bucket my-app-assets-prod \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms"}}]
  }'
```

## CORS Configuration

```json
// cors-config.json — allow browser uploads from your domain
{
  "CORSRules": [{
    "AllowedOrigins": ["https://myapp.com"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }]
}
```

```bash
# Apply CORS
aws s3api put-bucket-cors \
  --bucket my-app-assets-prod \
  --cors-configuration file://cors-config.json
```

## Event Notifications

```bash
# Configure S3 to trigger Lambda on object upload
aws s3api put-bucket-notification-configuration \
  --bucket my-app-assets-prod \
  --notification-configuration '{
    "LambdaFunctionConfigurations": [{
      "LambdaFunctionArn": "arn:aws:lambda:us-east-1:123456789:function:process-upload",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {"Key": {"FilterRules": [{"Name": "prefix", "Value": "uploads/"}]}}
    }]
  }'
```

## Best Practices

- Enable versioning on critical buckets before going to production
- Use lifecycle policies to automatically transition infrequent data to cheaper tiers
- Block public access by default; use presigned URLs for temporary sharing
- Enable server-side encryption (SSE-S3 or SSE-KMS) for compliance
- Use S3 Transfer Acceleration for global upload performance
- Set up S3 Access Logging or CloudTrail for audit trails
- Use multipart upload for files >100MB
