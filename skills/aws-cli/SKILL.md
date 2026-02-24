---
name: aws-cli
description: >-
  AWS Command Line Interface for managing Amazon Web Services. Use when the user
  needs to interact with S3, EC2, Lambda, CloudWatch, IAM, and other AWS services
  directly from the terminal for operations, scripting, and automation.
license: Apache-2.0
compatibility:
  - linux
  - macos
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - aws
    - cli
    - cloud
    - s3
    - ec2
    - lambda
---

# AWS CLI

The AWS CLI provides direct terminal access to all AWS services for management, scripting, and automation.

## Installation and Configuration

```bash
# Install AWS CLI v2 on Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# Configure credentials
aws configure
# AWS Access Key ID: AKIA...
# AWS Secret Access Key: ...
# Default region name: us-east-1
# Default output format: json

# Use named profiles
aws configure --profile production
aws s3 ls --profile production

# Set profile via environment variable
export AWS_PROFILE=production
```

## S3 Operations

```bash
# S3 bucket and object management
aws s3 mb s3://my-bucket-name --region us-east-1
aws s3 ls s3://my-bucket/
aws s3 cp file.txt s3://my-bucket/path/
aws s3 sync ./local-dir s3://my-bucket/remote-dir/ --delete
aws s3 rm s3://my-bucket/path/ --recursive

# Presigned URLs for temporary access
aws s3 presign s3://my-bucket/file.pdf --expires-in 3600

# Copy between buckets with filters
aws s3 sync s3://source-bucket s3://dest-bucket \
  --exclude "*.tmp" --include "*.json"

# Enable versioning
aws s3api put-bucket-versioning --bucket my-bucket \
  --versioning-configuration Status=Enabled
```

## EC2 Management

```bash
# Launch an instance
aws ec2 run-instances \
  --image-id ami-0abcdef1234567890 \
  --instance-type t3.medium \
  --key-name my-key \
  --subnet-id subnet-abc123 \
  --security-group-ids sg-abc123 \
  --count 1 \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web-server}]'

# List instances with filters
aws ec2 describe-instances \
  --filters "Name=tag:Environment,Values=production" \
  --query 'Reservations[].Instances[].{ID:InstanceId,Type:InstanceType,State:State.Name,IP:PublicIpAddress}' \
  --output table

# Stop, start, terminate
aws ec2 stop-instances --instance-ids i-1234567890abcdef0
aws ec2 start-instances --instance-ids i-1234567890abcdef0
aws ec2 terminate-instances --instance-ids i-1234567890abcdef0

# Security groups
aws ec2 authorize-security-group-ingress \
  --group-id sg-abc123 \
  --protocol tcp --port 443 --cidr 0.0.0.0/0
```

## Lambda Functions

```bash
# Create a Lambda function
aws lambda create-function \
  --function-name my-function \
  --runtime python3.12 \
  --handler lambda_function.handler \
  --role arn:aws:iam::123456789012:role/lambda-role \
  --zip-file fileb://function.zip

# Invoke function
aws lambda invoke --function-name my-function \
  --payload '{"key": "value"}' output.json

# Update function code
aws lambda update-function-code \
  --function-name my-function \
  --zip-file fileb://function.zip

# List functions and view logs
aws lambda list-functions --query 'Functions[].{Name:FunctionName,Runtime:Runtime}'
aws logs tail /aws/lambda/my-function --follow
```

## CloudWatch

```bash
# View metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-1234567890abcdef0 \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 --statistics Average

# Create alarm
aws cloudwatch put-metric-alarm \
  --alarm-name high-cpu \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:alerts

# Query logs with Insights
aws logs start-query \
  --log-group-name /aws/lambda/my-function \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 50'
```

## IAM Management

```bash
# Create user and access keys
aws iam create-user --user-name deploy-bot
aws iam create-access-key --user-name deploy-bot

# Attach policies
aws iam attach-user-policy --user-name deploy-bot \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# Create role
aws iam create-role --role-name app-role \
  --assume-role-policy-document file://trust-policy.json

# List and inspect
aws iam list-users --query 'Users[].{Name:UserName,Created:CreateDate}'
aws iam list-attached-user-policies --user-name deploy-bot
aws sts get-caller-identity
```

## Useful Patterns

```bash
# Wait for resource state changes
aws ec2 wait instance-running --instance-ids i-1234567890abcdef0

# Output as text for scripting
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id ami-abc123 --instance-type t3.micro \
  --query 'Instances[0].InstanceId' --output text)

# Paginate through all results
aws s3api list-objects-v2 --bucket my-bucket --max-items 1000

# SSM Session Manager (no SSH keys needed)
aws ssm start-session --target i-1234567890abcdef0

# Cost Explorer
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-02-01 \
  --granularity MONTHLY --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```
