---
name: aws-ecs
description: |
  Run containerized applications with Amazon ECS. Define tasks and services,
  deploy on Fargate for serverless containers or EC2 for full control. Configure
  load balancing, auto-scaling, and service discovery for production workloads.
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
    - ecs
    - containers
    - fargate
    - docker
---

# AWS ECS

Amazon Elastic Container Service (ECS) is a fully managed container orchestration service. Run Docker containers on Fargate (serverless) or self-managed EC2 instances with deep AWS integration.

## Core Concepts

- **Cluster** — logical grouping of tasks and services
- **Task Definition** — blueprint for containers (image, CPU, memory, ports, env vars)
- **Task** — a running instance of a task definition
- **Service** — maintains desired count of tasks, integrates with ALB
- **Fargate** — serverless compute for containers, no EC2 management
- **ECR** — Elastic Container Registry for storing Docker images

## Cluster Setup

```bash
# Create a Fargate cluster
aws ecs create-cluster --cluster-name app-prod --capacity-providers FARGATE FARGATE_SPOT
```

## Task Definitions

```json
// task-definition.json — web application task
{
  "family": "web-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::123456789:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "web",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/web-app:latest",
      "portMappings": [{"containerPort": 8080, "protocol": "tcp"}],
      "environment": [
        {"name": "NODE_ENV", "value": "production"}
      ],
      "secrets": [
        {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:db-url"}
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
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

```bash
# Register task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

## Services

```bash
# Create a service with ALB and Fargate
aws ecs create-service \
  --cluster app-prod \
  --service-name web-app \
  --task-definition web-app:1 \
  --desired-count 3 \
  --launch-type FARGATE \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["subnet-aaa", "subnet-bbb"],
      "securityGroups": ["sg-0123456789abcdef0"],
      "assignPublicIp": "DISABLED"
    }
  }' \
  --load-balancers '[{
    "targetGroupArn": "arn:aws:elasticloadbalancing:us-east-1:123456789:targetgroup/web-tg/abc123",
    "containerName": "web",
    "containerPort": 8080
  }]' \
  --deployment-configuration '{
    "maximumPercent": 200,
    "minimumHealthyPercent": 100,
    "deploymentCircuitBreaker": {"enable": true, "rollback": true}
  }'
```

```bash
# Update service (deploy new image)
aws ecs update-service \
  --cluster app-prod \
  --service web-app \
  --task-definition web-app:2 \
  --force-new-deployment
```

```bash
# Scale service
aws ecs update-service \
  --cluster app-prod \
  --service web-app \
  --desired-count 5
```

## Auto Scaling

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/app-prod/web-app \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 20
```

```bash
# Target tracking on CPU
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/app-prod/web-app \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "PredefinedMetricSpecification": {"PredefinedMetricType": "ECSServiceAverageCPUUtilization"},
    "TargetValue": 70.0,
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'
```

## ECR (Container Registry)

```bash
# Create repository
aws ecr create-repository --repository-name web-app --image-scanning-configuration scanOnPush=true
```

```bash
# Login, build, push
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker build -t web-app .
docker tag web-app:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/web-app:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/web-app:latest
```

## Running One-Off Tasks

```bash
# Run a migration task
aws ecs run-task \
  --cluster app-prod \
  --task-definition db-migrate:1 \
  --launch-type FARGATE \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["subnet-aaa"],
      "securityGroups": ["sg-0123456789abcdef0"],
      "assignPublicIp": "DISABLED"
    }
  }' \
  --overrides '{
    "containerOverrides": [{"name": "migrate", "command": ["npm", "run", "migrate"]}]
  }'
```

## Monitoring

```bash
# List running tasks
aws ecs list-tasks --cluster app-prod --service-name web-app --desired-status RUNNING
```

```bash
# View task logs
aws logs tail /ecs/web-app --follow --since 1h
```

## Best Practices

- Use Fargate for most workloads to eliminate instance management
- Store secrets in Secrets Manager or Parameter Store, not environment variables
- Enable deployment circuit breaker to auto-rollback failed deployments
- Use awslogs driver for centralized logging in CloudWatch
- Set health checks in both the task definition and target group
- Use Fargate Spot for non-critical background workers (up to 70% savings)
- Pin image tags in production; avoid `latest` for reproducibility
