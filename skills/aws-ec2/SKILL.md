---
name: aws-ec2
description: |
  Amazon EC2 provides resizable virtual servers on AWS. Use this skill to launch and manage EC2 instances with the AWS CLI: pick a current AMI, set up security groups, enforce IMDSv2, attach EBS volumes, build launch templates and Auto Scaling groups, and run Spot instances. Use when someone says "launch an EC2 instance", "resize my instance", "create an AMI", "set up an auto scaling group" or "use spot instances".
license: Apache-2.0
compatibility: 'AWS CLI v2, an AWS account with EC2 and Auto Scaling permissions'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - aws
    - ec2
    - compute
    - auto-scaling
---

# AWS EC2

## Overview

Amazon Elastic Compute Cloud (EC2) rents virtual servers by the second. This skill covers the everyday AWS CLI v2 workflow: launch, bootstrap, resize, snapshot, scale out and run Spot capacity. Commands assume credentials are already configured (`AWS_PROFILE` or an SSO session) and a default region is set.

Core objects: an instance (virtual server of a given instance type), an AMI (the image it boots from), a security group (stateful firewall), a key pair or SSM Session Manager for access, EBS volumes (persistent block storage), and a launch template (a versioned launch recipe used by Auto Scaling).

## Instructions

### 1. Pick a current AMI
Do not copy AMI IDs from tutorials: they are region-specific and go stale. Resolve the latest Amazon Linux 2023 image from the public SSM parameter, either directly in `--image-id` or ahead of time:

```bash
aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value --output text
```

### 2. Launch
`--image-id resolve:ssm:<parameter>` makes `run-instances` look the AMI up at launch time. Require IMDSv2 with `--metadata-options` so a server-side request forgery bug cannot read instance credentials with a plain GET.

```bash
aws ec2 run-instances \
  --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --instance-type t3.small \
  --key-name deploy-key \
  --security-group-ids sg-0123456789abcdef0 \
  --subnet-id subnet-0123456789abcdef0 \
  --iam-instance-profile Name=ec2-app-role \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --user-data file://setup.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=app-server},{Key=Env,Value=prod}]'
```

A bootstrap script (the shebang must be the first line). Amazon Linux 2023 uses `dnf`, not the old `yum` workflow of Amazon Linux 2:

```bash
#!/bin/bash
dnf update -y
dnf install -y docker
systemctl enable --now docker
docker run -d --restart unless-stopped -p 80:80 nginx:1.27
```

### 3. Inspect and manage

```bash
aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,PublicIpAddress,Tags[?Key==`Name`].Value|[0]]' \
  --output table

aws ec2 stop-instances --instance-ids i-0123456789abcdef0
aws ec2 start-instances --instance-ids i-0123456789abcdef0
aws ec2 terminate-instances --instance-ids i-0123456789abcdef0   # irreversible
```

Resize an EBS-backed instance: stop it, change the type, start it. The public IPv4 changes unless you use an Elastic IP.

```bash
aws ec2 stop-instances --instance-ids i-0123456789abcdef0
aws ec2 wait instance-stopped --instance-ids i-0123456789abcdef0
aws ec2 modify-instance-attribute --instance-id i-0123456789abcdef0 --instance-type '{"Value": "t3.large"}'
aws ec2 start-instances --instance-ids i-0123456789abcdef0
```

### 4. Security groups
Keep SSH closed to the world; allow it from a known CIDR only, or use SSM Session Manager and open no port at all.

```bash
aws ec2 create-security-group --group-name web-sg \
  --description "HTTP, HTTPS, office SSH" --vpc-id vpc-0123456789abcdef0

aws ec2 authorize-security-group-ingress --group-id sg-0123456789abcdef0 \
  --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]' \
    'IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=203.0.113.0/24,Description=Office}]'
```

### 5. AMIs, EBS volumes and snapshots

```bash
aws ec2 create-image --instance-id i-0123456789abcdef0 \
  --name "app-server-v1.2.0-$(date +%Y%m%d)" --description "App server with latest patches" --no-reboot
aws ec2 describe-images --owners self --query 'Images[*].[ImageId,Name,CreationDate]' --output table

aws ec2 create-volume --size 100 --volume-type gp3 --iops 3000 --throughput 125 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=data-vol}]'
aws ec2 attach-volume --volume-id vol-0123456789abcdef0 --instance-id i-0123456789abcdef0 --device /dev/sdf
aws ec2 create-snapshot --volume-id vol-0123456789abcdef0 --description "Daily backup $(date +%F)"
```

`--no-reboot` skips the reboot but the filesystem may be captured inconsistent; omit it for databases. To retire an AMI, `aws ec2 deregister-image --image-id ami-...` and then delete its snapshots separately with `delete-snapshot`. The volume and instance must be in the same Availability Zone.

### 6. Launch template and Auto Scaling group
Launch configurations are legacy and cannot be created in new accounts; use launch templates.

```bash
aws ec2 create-launch-template --launch-template-name app-server-template \
  --launch-template-data "{
    \"ImageId\": \"resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64\",
    \"InstanceType\": \"t3.medium\",
    \"SecurityGroupIds\": [\"sg-0123456789abcdef0\"],
    \"IamInstanceProfile\": {\"Name\": \"ec2-app-role\"},
    \"MetadataOptions\": {\"HttpTokens\": \"required\"},
    \"UserData\": \"$(base64 -w0 setup.sh)\"
  }"

aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name app-asg \
  --launch-template 'LaunchTemplateName=app-server-template,Version=$Latest' \
  --min-size 2 --max-size 10 --desired-capacity 2 \
  --vpc-zone-identifier "subnet-0a1b2c3d4e5f6a7b8,subnet-0f9e8d7c6b5a4f3e2" \
  --target-group-arns arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/app-tg/0123456789abcdef \
  --health-check-type ELB --health-check-grace-period 300

aws autoscaling put-scaling-policy \
  --auto-scaling-group-name app-asg --policy-name cpu-target-70 \
  --policy-type TargetTrackingScaling --estimated-instance-warmup 120 \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {"PredefinedMetricType": "ASGAverageCPUUtilization"},
    "TargetValue": 70.0
  }'
```

Target tracking has no scale-in or scale-out cooldown fields; tune `--estimated-instance-warmup` instead (the CLI rejects `ScaleInCooldown` here).

### 7. Spot instances
Ask for Spot through `run-instances`; `request-spot-instances` is the legacy API.

```bash
aws ec2 run-instances \
  --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --instance-type c5.xlarge --count 3 \
  --subnet-id subnet-0123456789abcdef0 --security-group-ids sg-0123456789abcdef0 \
  --instance-market-options 'MarketType=spot,SpotOptions={SpotInstanceType=one-time}'
```

For fleets, set a `MixedInstancesPolicy` on the Auto Scaling group with several instance types so one pool running dry does not stop you.

## Examples

### Example 1: "Launch a small web server I can reach over SSM only"
Create a role with `AmazonSSMManagedInstanceCore`, wrap it in instance profile `ec2-app-role`, and run the step 2 command without `--key-name` and with a security group that has only port 80 inbound (the bootstrap script serves nginx there). Then connect with `aws ssm start-session --target i-0123456789abcdef0` (needs the Session Manager plugin). The result is an instance in `running` state with no SSH port exposed.

### Example 2: "My app needs to scale between 2 and 10 servers on CPU"
Bake the app into an AMI or user data, create the launch template and Auto Scaling group from step 6, then watch it with `aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names app-asg --query 'AutoScalingGroups[0].Instances[].[InstanceId,HealthStatus]' --output table`. Two instances come up in different subnets; a CPU spike past 70% adds more.

## Guidelines

- Always require IMDSv2 (`HttpTokens=required`) on new instances and templates.
- Resolve AMIs via SSM parameters; never hard-code an AMI ID across regions.
- Prefer private subnets plus SSM Session Manager over public SSH. Never open port 22 to `0.0.0.0/0`.
- Tag everything (`Name`, `Env`, owner) for cost allocation; stopped instances still bill for their EBS volumes and Elastic IPs.
- `terminate-instances` and `delete-snapshot` cannot be undone; check IDs with `describe-*` first.
- Spot capacity can be reclaimed with two minutes' notice: use it only for fault-tolerant work.
- T-family instances are burstable; sustained CPU above baseline throttles or costs extra credits.
