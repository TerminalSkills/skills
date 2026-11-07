---
title: Set Up a Zero-Downtime Deployment Pipeline
slug: set-up-zero-downtime-deployment-pipeline
description: >-
  Build a CI/CD pipeline that deploys to production with zero downtime using
  GitHub Actions, Docker multi-stage builds, Terraform-managed ECS services
  with overlapping rolling deployments, and automatic rollback.
skills:
  - github-actions
  - docker-helper
  - terraform-iac
  - sentry
category: devops
tags:
  - deployment
  - zero-downtime
  - ci-cd
  - docker
  - terraform
---

# Set Up a Zero-Downtime Deployment Pipeline

Kai's team deploys their SaaS app by SSH-ing into the server, pulling the latest code, and restarting. Deploys take 10-30 seconds of downtime, happen at 2 AM to minimize impact, and sometimes fail halfway, leaving the app broken until someone wakes up. After a deployment causes a 45-minute outage (bad migration, no rollback plan), Kai builds a proper pipeline: a container image, an ECS service that replaces tasks without dropping traffic, and rollback that does not need a human.

## Step 1: Docker Multi-Stage Build

A multi-stage Dockerfile keeps the production image small and reproducible: the same image runs locally, in staging and in production. Use a Node.js release that is still supported (Node 20 reached end of life in April 2026).

```dockerfile
# Dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 --ingroup app app

COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./
COPY --from=builder --chown=app:app /app/prisma ./prisma

# Container-level check; the load balancer has its own target group check (Step 2)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

USER app
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Release identity is not baked into the image. The pipeline passes the git SHA to Sentry in Step 3 and the app reads `SENTRY_RELEASE` from its task definition environment.

## Step 2: Infrastructure with Terraform

The ECS service is created once with Terraform, and the settings that make a deploy safe live there, not in a shell script. `maximum_percent = 200` starts new tasks before old ones stop, `minimum_healthy_percent = 100` never drops below the desired count, and the service only counts a task healthy after the load balancer's health check passes.

```hcl
# infra/ecs.tf
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

resource "aws_ecs_service" "app" {
  name            = "app"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 3
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 30

  # Roll back automatically if new tasks never become healthy
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # ...and if the 5xx alarm fires while the deployment is in progress
  alarms {
    alarm_names = [aws_cloudwatch_metric_alarm.alb_5xx.alarm_name]
    enable      = true
    rollback    = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = 3000
  }

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.app.id]
  }

  # CI registers new task definition revisions; Terraform must not revert them
  lifecycle {
    ignore_changes = [task_definition]
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "app-alb-5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  dimensions          = { LoadBalancer = aws_lb.app.arn_suffix, TargetGroup = aws_lb_target_group.app.arn_suffix }
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 25
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
}
```

```console
$ cd infra && terraform init && terraform plan -out=tfplan && terraform apply tfplan
```

Terraform owns the service, load balancer, alarm and IAM roles. The pipeline owns only the image and task-definition revision. Keep Terraform state in a remote backend with locking and run `terraform plan` in a separate pull-request workflow.

## Step 3: GitHub Actions Pipeline

Static AWS keys in repository secrets are replaced by GitHub's OIDC token: the deploy job assumes an IAM role limited to `ecs:RegisterTaskDefinition`, `ecs:UpdateService`, `ecs:Describe*` and `iam:PassRole` for the task roles. The `strategy.matrix` with `max-parallel: 1` deploys staging first; production runs only if staging succeeded, and the `production` environment requires manual approval in repository settings.

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false              # never cancel an in-progress deploy

env:
  REGISTRY: ghcr.io

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_PASSWORD: test }
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:test@localhost:5432/test
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm typecheck && pnpm test && pnpm e2e

  build:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image: ${{ steps.ref.outputs.image }}
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v6
        with:
          images: ${{ env.REGISTRY }}/${{ github.repository }}
          tags: type=sha,prefix=
      - id: push
        uses: docker/build-push-action@v7
        with:
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      # Deploy the immutable digest, not a mutable tag
      - id: ref
        run: echo "image=${REGISTRY}/${GITHUB_REPOSITORY,,}@${{ steps.push.outputs.digest }}" >> "$GITHUB_OUTPUT"

  deploy:
    needs: build
    runs-on: ubuntu-latest
    strategy:
      max-parallel: 1
      matrix:
        env: [staging, production]
    environment: ${{ matrix.env }}       # production requires manual approval
    permissions:
      id-token: write                    # OIDC to AWS
      contents: read
    steps:
      - uses: actions/checkout@v7
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: eu-west-1
      - id: render
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-def.json
          container-name: app
          image: ${{ needs.build.outputs.image }}
          environment-variables: SENTRY_RELEASE=${{ github.sha }}
      - uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.render.outputs.task-definition }}
          cluster: ${{ matrix.env }}
          service: app
          wait-for-service-stability: true
          wait-for-minutes: 10
      - name: Smoke test
        run: |
          for i in $(seq 1 10); do
            code=$(curl -s -o /dev/null -w '%{http_code}' "https://${{ vars.APP_HOST }}/health")
            [ "$code" = "200" ] && exit 0
            sleep 5
          done
          echo "::error::health check failed after deploy"; exit 1
      - name: Record Sentry release
        if: matrix.env == 'production'
        run: |
          npx @sentry/cli releases new "$GITHUB_SHA"
          npx @sentry/cli releases set-commits "$GITHUB_SHA" --auto
          npx @sentry/cli releases finalize "$GITHUB_SHA"
          npx @sentry/cli releases deploys "$GITHUB_SHA" new -e production
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ vars.SENTRY_ORG }}
          SENTRY_PROJECT: ${{ vars.SENTRY_PROJECT }}
```

The `task-def.json` file in the repository holds the container definition (ports, log configuration, secrets from SSM or Secrets Manager). A private GHCR image also needs `repositoryCredentials` in the container definition, or push the image to ECR instead.

## Step 4: Rollback

Rollback needs no custom script. If the new tasks fail their health checks, ECS's circuit breaker stops the deployment and returns the service to the last completed one. If tasks start but the target group returns 5xx during the deployment, the CloudWatch alarm from Step 2 triggers the same rollback. `wait-for-service-stability` then fails the job, so a failed deploy is red in GitHub and Sentry never gets a production deploy marker.

Two things the pipeline cannot undo are database migrations and non-backwards-compatible API changes. Run migrations as a separate step before the deploy and make each one backwards compatible with the previous app version (add a column now, drop the old one in a later release). That is the lesson of the 45-minute outage.

Sentry's release health and issue alerts, tied to the `SENTRY_RELEASE` value, show which commit introduced a regression after traffic has been running for a while. That is information for a human or a follow-up revert; the automatic rollback only covers failures in the first minutes of a deployment.

## Results

Deployments now happen on every merge to main during business hours. The example team's pipeline takes about 4 minutes to build and test and about 3 minutes to roll tasks, so a change reaches production in roughly 7 minutes. Their first bad deploy (a query that returned 500s) was rolled back by the alarm in under two minutes with a few dozen failed requests, compared with the 45-minute outage before. The team went from 2 deploys a week to several a day, and the 2 AM deploy window is gone.

## Related Skills

- `github-actions` - workflow syntax, OIDC, concurrency and environments
- `docker-helper` - multi-stage Dockerfiles and image hygiene
- `terraform-iac` - the ECS service, load balancer, alarms and remote state
- `sentry` - releases, deploy markers and release health
