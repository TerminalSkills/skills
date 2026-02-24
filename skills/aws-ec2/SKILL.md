---
name: aws-ec2
description: |
  Launch and manage Amazon EC2 instances for scalable compute. Configure AMIs,
  security groups, key pairs, and EBS volumes. Set up auto-scaling groups for
  high availability and cost optimization across availability zones.
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
    - ec2
    - compute
    - auto-scaling
---

# AWS EC2

Amazon Elastic Compute Cloud (EC2) provides resizable virtual servers in the cloud. It's the foundational compute service for running applications, from simple web servers to complex distributed systems.

## Core Concepts

- **Instance** — a virtual server with CPU, memory, storage, and networking
- **AMI** — Amazon Machine Image, a template for launching instances
- **Instance type** — hardware configuration (t3.micro, m5.xlarge, etc.)
- **Security group** — virtual firewall controlling inbound/outbound traffic
- **Key pair** — SSH authentication for Linux instances
- **EBS** — Elastic Block Store, persistent block storage volumes

## Launching Instances

```bash
# Launch a basic EC2 instance
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.micro \
  --key-name my-key-pair \
  --security-group-ids sg-0123456789abcdef0 \
  --subnet-id subnet-0123456789abcdef0 \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web-server-1}]' \
  --count 1
```

```bash
# Launch with user data script for bootstrapping
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.small \
  --key-name my-key-pair \
  --security-group-ids sg-0123456789abcdef0 \
  --user-data file://setup.sh \
  --iam-instance-profile Name=ec2-app-role \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=app-server},{Key=Env,Value=prod}]'
```

```bash
# setup.sh — bootstrap script for EC2 instance
#!/bin/bash
yum update -y
yum install -y docker
systemctl start docker
systemctl enable docker
docker pull myapp:latest
docker run -d -p 80:8080 myapp:latest
```

## Instance Management

```bash
# List running instances with key details
aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,PublicIpAddress,Tags[?Key==`Name`].Value|[0]]' \
  --output table
```

```bash
# Stop, start, terminate instances
aws ec2 stop-instances --instance-ids i-0123456789abcdef0
aws ec2 start-instances --instance-ids i-0123456789abcdef0
aws ec2 terminate-instances --instance-ids i-0123456789abcdef0
```

```bash
# Resize an instance (must be stopped first)
aws ec2 stop-instances --instance-ids i-0123456789abcdef0
aws ec2 modify-instance-attribute \
  --instance-id i-0123456789abcdef0 \
  --instance-type '{"Value": "t3.large"}'
aws ec2 start-instances --instance-ids i-0123456789abcdef0
```

## Security Groups

```bash
# Create a security group for a web server
aws ec2 create-security-group \
  --group-name web-sg \
  --description "Allow HTTP, HTTPS, SSH" \
  --vpc-id vpc-0123456789abcdef0
```

```bash
# Add inbound rules
aws ec2 authorize-security-group-ingress \
  --group-id sg-0123456789abcdef0 \
  --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]' \
    'IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=203.0.113.0/24,Description=Office}]'
```

## AMIs

```bash
# Create an AMI from a running instance
aws ec2 create-image \
  --instance-id i-0123456789abcdef0 \
  --name "app-server-v1.2.0-$(date +%Y%m%d)" \
  --description "App server with latest patches" \
  --no-reboot
```

```bash
# List your AMIs
aws ec2 describe-images --owners self \
  --query 'Images[*].[ImageId,Name,CreationDate]' --output table
```

```bash
# Deregister old AMI and delete snapshot
aws ec2 deregister-image --image-id ami-0123456789abcdef0
aws ec2 delete-snapshot --snapshot-id snap-0123456789abcdef0
```

## EBS Volumes

```bash
# Create and attach an EBS volume
aws ec2 create-volume \
  --size 100 \
  --volume-type gp3 \
  --availability-zone us-east-1a \
  --iops 3000 \
  --throughput 125 \
  --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=data-vol}]'
```

```bash
# Attach volume to instance
aws ec2 attach-volume \
  --volume-id vol-0123456789abcdef0 \
  --instance-id i-0123456789abcdef0 \
  --device /dev/xvdf
```

```bash
# Create a snapshot for backup
aws ec2 create-snapshot \
  --volume-id vol-0123456789abcdef0 \
  --description "Daily backup $(date +%Y-%m-%d)" \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Name,Value=daily-backup}]'
```

## Auto Scaling

```bash
# Create a launch template
aws ec2 create-launch-template \
  --launch-template-name app-server-template \
  --launch-template-data '{
    "ImageId": "ami-0c55b159cbfafe1f0",
    "InstanceType": "t3.medium",
    "SecurityGroupIds": ["sg-0123456789abcdef0"],
    "KeyName": "my-key-pair",
    "IamInstanceProfile": {"Name": "ec2-app-role"},
    "UserData": "'$(base64 -w0 setup.sh)'"
  }'
```

```bash
# Create an auto-scaling group
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name app-asg \
  --launch-template LaunchTemplateName=app-server-template,Version='$Latest' \
  --min-size 2 \
  --max-size 10 \
  --desired-capacity 2 \
  --vpc-zone-identifier "subnet-aaa,subnet-bbb" \
  --target-group-arns "arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/app-tg/abc123" \
  --health-check-type ELB \
  --health-check-grace-period 300
```

```bash
# Create scaling policy based on CPU
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name app-asg \
  --policy-name cpu-scale-out \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {"PredefinedMetricType": "ASGAverageCPUUtilization"},
    "TargetValue": 70.0,
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'
```

## Spot Instances

```bash
# Request spot instances for cost savings (up to 90% off)
aws ec2 request-spot-instances \
  --instance-count 3 \
  --type "one-time" \
  --launch-specification '{
    "ImageId": "ami-0c55b159cbfafe1f0",
    "InstanceType": "c5.xlarge",
    "SecurityGroupIds": ["sg-0123456789abcdef0"],
    "SubnetId": "subnet-0123456789abcdef0"
  }'
```

## Best Practices

- Use launch templates over launch configurations for versioning
- Place instances in private subnets; use a bastion host or SSM for access
- Enable detailed monitoring for production workloads
- Use auto-scaling with target tracking for hands-off scaling
- Tag everything for cost allocation and resource management
- Use spot instances for fault-tolerant, flexible workloads
- Rotate AMIs regularly with latest security patches
