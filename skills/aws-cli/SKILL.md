---
name: aws-cli
description: >-
  The AWS Command Line Interface (v2) manages Amazon Web Services from the terminal. Use when the user needs to run S3, EC2, Lambda, CloudWatch, IAM or other AWS commands, sign in with SSO or short-term credentials, write AWS automation scripts, or debug an `aws` command and its output.
license: Apache-2.0
compatibility: 'linux, macos, windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/aws/aws-cli
  tags:
    - aws
    - cli
    - cloud
    - s3
    - lambda
---

# AWS CLI

## Overview

The AWS CLI v2 gives command-line access to AWS services for management, scripting and automation (latest release checked: 2.37.9). The command shape is `aws <service> <operation> [options]`; `aws s3` and `aws s3api` are two different layers (high-level transfers versus raw API calls). Always run `aws <service> <operation> help` when unsure: it is the source of truth for flags.

## Instructions

### Step 1: Install

```bash
# Linux x86_64 (use awscli-exe-linux-aarch64.zip on ARM)
curl -fsSLO https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip
curl -fsSLo awscliv2.sig https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip.sig
# Import the AWS CLI Team public key from the install page of the AWS CLI User Guide, then:
gpg --verify awscliv2.sig awscli-exe-linux-x86_64.zip   # fingerprint FB5D B77F D5C1 18B8 0511 ADA8 A631 0ACC 4672 475C
unzip -q awscli-exe-linux-x86_64.zip
sudo ./aws/install            # or: ./aws/install -i ~/.local/aws-cli -b ~/.local/bin

brew install awscli           # macOS (Homebrew formula is community-maintained)
sudo snap install aws-cli --classic   # Linux, auto-updating

aws --version                 # expect aws-cli/2.x
aws update                    # self-update for installs made with the official installers
```

AWS also publishes an install script, but do not pipe it into a shell without reading it first; the verified zip above is the safer route. Version 1 (`pip install awscli`) is a different product with different defaults.

### Step 2: Authenticate (prefer short-term credentials)

```bash
aws login                     # browser sign-in with console credentials, stores short-term credentials
aws configure sso             # IAM Identity Center: asks for start URL, region, account and role
aws sso login --profile prod-admin
aws sts get-caller-identity --profile prod-admin   # confirm who you are
export AWS_PROFILE=prod-admin AWS_REGION=eu-west-1
```

AWS recommends these over long-lived IAM user keys from `aws configure`. In CI use an IAM role (OIDC) or environment variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`; never put keys in scripts or commit `~/.aws/credentials`. Precedence: command-line options, then environment variables, then assume-role/SSO/credentials file, then container or EC2 instance profile.

### Step 3: S3

```bash
aws s3 mb s3://acme-reports-prod --region eu-west-1
aws s3 ls s3://acme-reports-prod/2026/
aws s3 cp invoice-2026-09.pdf s3://acme-reports-prod/2026/09/
aws s3 sync ./build s3://acme-reports-prod/site/ --delete --dryrun   # preview, then rerun without --dryrun
aws s3 presign s3://acme-reports-prod/2026/09/invoice-2026-09.pdf --expires-in 3600
aws s3 sync s3://acme-reports-prod s3://acme-reports-backup --exclude "*" --include "*.json"
aws s3api put-bucket-versioning --bucket acme-reports-prod \
  --versioning-configuration Status=Enabled
```

Filters are applied in order, so `--exclude "*"` first and `--include` after. `aws s3 rm --recursive` and `sync --delete` are destructive: always run with `--dryrun` first.

### Step 4: EC2

```bash
# Latest Amazon Linux 2023 AMI from the public SSM parameter (no hard-coded AMI IDs)
AMI=$(aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query 'Parameter.Value' --output text)

aws ec2 run-instances --image-id "$AMI" --instance-type t3.medium \
  --key-name deploy-key --subnet-id subnet-0a1b2c3d4e5f60718 \
  --security-group-ids sg-0123456789abcdef0 --count 1 \
  --metadata-options HttpTokens=required \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web-01}]'

aws ec2 describe-instances --filters "Name=tag:Environment,Values=production" \
  --query 'Reservations[].Instances[].{ID:InstanceId,Type:InstanceType,State:State.Name,IP:PublicIpAddress}' \
  --output table
aws ec2 wait instance-running --instance-ids i-0abc123def4567890
aws ec2 stop-instances --instance-ids i-0abc123def4567890
```

`HttpTokens=required` enforces IMDSv2. Only open `0.0.0.0/0` in a security group for ports that are meant to be public.

### Step 5: Lambda

```bash
aws lambda create-function --function-name invoice-parser \
  --runtime python3.13 --handler app.handler \
  --role arn:aws:iam::123456789012:role/invoice-parser-role \
  --zip-file fileb://function.zip

aws lambda wait function-active-v2 --function-name invoice-parser
aws lambda invoke --function-name invoice-parser \
  --cli-binary-format raw-in-base64-out \
  --payload '{"invoiceId": "INV-2041"}' response.json
aws lambda update-function-code --function-name invoice-parser --zip-file fileb://function.zip
aws logs tail /aws/lambda/invoice-parser --follow --since 15m
```

In CLI v2 `--payload` must be Base64 unless you pass `--cli-binary-format raw-in-base64-out` (or set `cli_binary_format` in the config). Current runtime IDs include `python3.13`, `python3.14`, `nodejs22.x`, `nodejs24.x`; `python3.9`, `nodejs18.x` and `nodejs20.x` are deprecated, so check the Lambda runtimes page before choosing.

### Step 6: CloudWatch and logs

```bash
aws cloudwatch get-metric-statistics --namespace AWS/EC2 --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-0abc123def4567890 \
  --start-time 2026-09-01T00:00:00Z --end-time 2026-09-02T00:00:00Z \
  --period 3600 --statistics Average

aws cloudwatch put-metric-alarm --alarm-name web-01-high-cpu \
  --metric-name CPUUtilization --namespace AWS/EC2 --statistic Average \
  --dimensions Name=InstanceId,Value=i-0abc123def4567890 \
  --period 300 --threshold 80 --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 --alarm-actions arn:aws:sns:eu-west-1:123456789012:ops-alerts

QID=$(aws logs start-query --log-group-name /aws/lambda/invoice-parser \
  --start-time $(date -d '1 hour ago' +%s) --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 50' \
  --query queryId --output text)
aws logs get-query-results --query-id "$QID"
```

`start-query` is asynchronous: poll `get-query-results` until `status` is `Complete`.

### Step 7: IAM and cost

```bash
aws iam create-role --role-name app-role --assume-role-policy-document file://trust-policy.json
aws iam attach-role-policy --role-name app-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
aws iam list-attached-role-policies --role-name app-role
aws sts get-caller-identity

aws ce get-cost-and-usage --time-period Start=2026-09-01,End=2026-10-01 \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE
```

Prefer roles over IAM users with access keys. Each Cost Explorer API request is billed (about one cent).

### Step 8: Scripting patterns

```bash
aws ec2 describe-instances --query 'Reservations[].Instances[].InstanceId' --output text
aws s3api list-objects-v2 --bucket acme-reports-prod --prefix 2026/ --query 'Contents[].Key'  # auto-paginates
aws ssm start-session --target i-0abc123def4567890    # needs the Session Manager plugin installed
aws configure list-profiles
aws ec2 describe-instances --debug 2>&1 | head -50    # inspect requests when a call fails
export AWS_PAGER=""                                    # disable the pager in scripts
```

`--query` is JMESPath applied client-side; `--filters` is server-side. Output formats: `json`, `yaml`, `text`, `table`.

## Examples

### Example 1: "Which of our prod instances are running, and what are their IPs?"

```bash
aws ec2 describe-instances --profile prod-admin --region eu-west-1 \
  --filters "Name=tag:Environment,Values=production" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].[Tags[?Key==`Name`]|[0].Value,InstanceId,PrivateIpAddress]' \
  --output table
```

Result: a table with one row per running instance, such as `web-01 | i-0abc123def4567890 | 10.0.1.14`.

### Example 2: "Publish the build folder to the site bucket, safely"

```bash
aws s3 sync ./build s3://acme-reports-prod/site/ --delete --dryrun
aws s3 sync ./build s3://acme-reports-prod/site/ --delete
```

Result: the dry run prints `(dryrun) upload: ...` and `(dryrun) delete: ...` lines for review; the second command performs them.

## Guidelines

- Check `aws sts get-caller-identity` before any destructive command; wrong profile or region is the most common accident.
- Set the region explicitly (`--region` or `AWS_REGION`); many resources are regional and "not found" often means wrong region.
- Use short-term credentials (SSO or `aws login`); never paste access keys into chat, scripts or repositories.
- Quote JMESPath and tag specifications; backticks and brackets are shell-special.
- Use `--dryrun` (S3) or `--dry-run` (EC2) before destructive or costly operations.
- For repeatable infrastructure use CloudFormation, CDK or Terraform instead of long CLI scripts.
