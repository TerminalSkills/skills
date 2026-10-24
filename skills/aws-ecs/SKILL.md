---
name: aws-ecs
description: |
  Amazon ECS is AWS's managed container orchestrator that runs Docker containers on Fargate or EC2. Use this skill to create clusters, write task definitions, deploy services behind an Application Load Balancer, roll back failed deployments, autoscale, push images to ECR, run one-off tasks and open a shell with ECS Exec. Use when someone says "deploy a container to ECS", "set up Fargate", "ECS service won't stabilize" or "run a migration task".
license: Apache-2.0
compatibility: 'AWS CLI v2, Docker, an AWS account with ECS, ECR and IAM permissions'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - aws
    - ecs
    - containers
    - fargate
    - docker
---

# AWS ECS

## Overview

Amazon Elastic Container Service (ECS) runs containers as tasks. A task definition describes the containers (image, CPU, memory, ports, secrets, logging); a service keeps a desired number of tasks running, replaces failed ones, registers them with a load balancer and performs rolling deployments. Fargate removes server management; the EC2 launch type gives you control of the hosts. Images live in ECR (Elastic Container Registry).

The commands use AWS CLI v2 with credentials already configured. Replace the account ID `123456789012`, subnets and security groups with your own.

## Instructions

### 1. Create a cluster with capacity providers
Listing providers on a cluster only makes them available; add a default strategy so services without their own strategy use it. Keep a base of on-demand tasks and put the rest on Spot.

```bash
aws ecs create-cluster --cluster-name app-prod \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1,base=2 capacityProvider=FARGATE_SPOT,weight=3
```

### 2. Push an image to ECR

```bash
aws ecr create-repository --repository-name web-app --image-scanning-configuration scanOnPush=true
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
docker build -t web-app:1.4.2 .
docker tag web-app:1.4.2 123456789012.dkr.ecr.us-east-1.amazonaws.com/web-app:1.4.2
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/web-app:1.4.2
```

### 3. Task definition
Two IAM roles: the execution role lets ECS pull the image, write logs and read the secrets listed in `secrets`; the task role is what your application code uses. The JSON file must be pure JSON (no comments). Create the log group `/ecs/web-app` first, or add `"awslogs-create-group": "true"` to the options and permission to create it.

```json
{
  "family": "web-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "runtimePlatform": {"cpuArchitecture": "ARM64", "operatingSystemFamily": "LINUX"},
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789012:role/webAppTaskRole",
  "containerDefinitions": [
    {
      "name": "web",
      "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/web-app:1.4.2",
      "essential": true,
      "portMappings": [{"containerPort": 8080, "protocol": "tcp"}],
      "environment": [{"name": "NODE_ENV", "value": "production"}],
      "secrets": [
        {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/web-app/database-url-a1B2c3"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/web-app",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "web"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
        "interval": 30, "timeout": 5, "retries": 3, "startPeriod": 30
      }
    }
  ]
}
```

```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

Set `cpuArchitecture` to match the image (`ARM64` for an image built on Apple silicon or Graviton, `X86_64` otherwise); a mismatch fails with `exec format error`. The `curl` health check only works if the image contains `curl`.

### 4. Service behind a load balancer

```bash
aws ecs create-service \
  --cluster app-prod --service-name web-app \
  --task-definition web-app --desired-count 3 --launch-type FARGATE \
  --network-configuration '{"awsvpcConfiguration":{"subnets":["subnet-0a1b2c3d4e5f6a7b8","subnet-0f9e8d7c6b5a4f3e2"],"securityGroups":["sg-0123456789abcdef0"],"assignPublicIp":"DISABLED"}}' \
  --load-balancers '[{"targetGroupArn":"arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/web-tg/0123456789abcdef","containerName":"web","containerPort":8080}]' \
  --health-check-grace-period-seconds 60 \
  --enable-execute-command \
  --deployment-configuration '{"maximumPercent":200,"minimumHealthyPercent":100,"deploymentCircuitBreaker":{"enable":true,"rollback":true}}'
```

Passing the family name (`web-app`) uses the latest ACTIVE revision; add `:2` to pin one. Use `--capacity-provider-strategy` instead of `--launch-type` to opt in to Spot. The target group must be of type `ip` for `awsvpc` tasks. With `assignPublicIp DISABLED` the subnets need a NAT gateway or VPC endpoints (ECR api and dkr, S3, logs, secretsmanager) to pull images.

Deploy a new revision, change the count, and wait for the rollout:

```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json   # prints revision, e.g. 2
aws ecs update-service --cluster app-prod --service web-app --task-definition web-app:2
aws ecs wait services-stable --cluster app-prod --services web-app
aws ecs update-service --cluster app-prod --service web-app --desired-count 5
```

`--force-new-deployment` redeploys the same task definition (needed when you reuse a mutable tag such as `latest`, which is one reason to use immutable version tags).

### 5. Autoscaling (Application Auto Scaling)

```bash
aws application-autoscaling register-scalable-target --service-namespace ecs \
  --resource-id service/app-prod/web-app --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 --max-capacity 20

aws application-autoscaling put-scaling-policy --service-namespace ecs \
  --resource-id service/app-prod/web-app --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-target-70 --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "PredefinedMetricSpecification": {"PredefinedMetricType": "ECSServiceAverageCPUUtilization"},
    "TargetValue": 70.0, "ScaleInCooldown": 300, "ScaleOutCooldown": 60}'
```

### 6. One-off tasks, shell and logs

```bash
aws ecs run-task --cluster app-prod --task-definition db-migrate --launch-type FARGATE \
  --network-configuration '{"awsvpcConfiguration":{"subnets":["subnet-0a1b2c3d4e5f6a7b8"],"securityGroups":["sg-0123456789abcdef0"],"assignPublicIp":"DISABLED"}}' \
  --overrides '{"containerOverrides":[{"name":"migrate","command":["npm","run","migrate"]}]}'

aws ecs list-tasks --cluster app-prod --service-name web-app --desired-status RUNNING
aws ecs execute-command --cluster app-prod --task 0123456789abcdef0123456789abcdef \
  --container web --interactive --command "/bin/sh"
aws logs tail /ecs/web-app --follow --since 1h
```

`execute-command` needs the service created with `--enable-execute-command` (existing tasks must be replaced), the Session Manager plugin installed locally, and `ssmmessages:*` permissions on the task role.

## Examples

### Example 1: "Deploy version 1.4.3 of our API with zero downtime and auto-rollback"
Push `web-app:1.4.3` to ECR, change the image tag in `task-definition.json`, register it, run `update-service` with the new revision and `aws ecs wait services-stable`. With the circuit breaker enabled, ECS rolls back to the last good revision if the new tasks keep failing health checks. `wait services-stable` also succeeds after a rollback, so do not trust its exit code: check `aws ecs describe-services --cluster app-prod --services web-app --query 'services[0].deployments[].[status,rolloutState]'` and look for `COMPLETED` on the new revision (a rolled-back one shows `FAILED`).

### Example 2: "Tasks keep stopping, why?"
Run `aws ecs describe-tasks --cluster app-prod --tasks 0123456789abcdef0123456789abcdef --query 'tasks[].[stoppedReason,containers[].reason]'` on a stopped task (list them with `list-tasks --desired-status STOPPED`). Typical reasons: `CannotPullContainerError` (no route to ECR, missing execution-role permission), `ResourceInitializationError` (secret or log group not reachable), `Essential container exited` (check `aws logs tail`), or target group health checks failing.

## Guidelines

- Prefer Fargate unless you need GPUs, privileged containers or host-level control.
- Use immutable, versioned image tags and a new task definition revision per deploy; never rely on `latest`.
- Put credentials in Secrets Manager or SSM Parameter Store and reference them via `secrets`, not `environment`.
- Fargate Spot saves up to about 70% but tasks can be interrupted with a two-minute warning: use it for stateless or retryable work, with an on-demand `base`.
- Set `--health-check-grace-period-seconds` for slow-starting apps, or the load balancer will kill them during boot.
- Keep tasks in private subnets; expose them only through the load balancer.
