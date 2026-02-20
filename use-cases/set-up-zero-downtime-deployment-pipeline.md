---
title: Set Up a Zero-Downtime Deployment Pipeline
slug: set-up-zero-downtime-deployment-pipeline
description: >-
  Build a CI/CD pipeline that deploys to production with zero downtime using
  GitHub Actions, Docker multi-stage builds, Terraform for infrastructure,
  and blue-green deployments with automated rollback.
skills:
  - github-actions-advanced
  - docker-multi-stage
  - terraform-modules
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

Kai's team deploys their SaaS app by SSH-ing into the server, pulling the latest code, and restarting. Deploys take 10-30 seconds of downtime, happen at 2 AM to minimize impact, and sometimes fail halfway — leaving the app in a broken state until someone wakes up to fix it. After a deployment causes a 45-minute outage (bad migration + no rollback plan), Kai builds a proper pipeline: automated builds, zero-downtime deployments, and one-click rollback.

## Step 1: Docker Multi-Stage Build

The first step is containerizing the app. A multi-stage Dockerfile keeps the production image small and reproducible — same image runs locally, in staging, and in production.

```dockerfile
# Dockerfile — Optimized production image
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments for environment-specific config
ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=$SENTRY_RELEASE

RUN pnpm build
# Prune dev dependencies after build
RUN pnpm prune --prod

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 app

# Copy only production artifacts
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./
COPY --from=builder --chown=app:app /app/prisma ./prisma

# Health check for load balancer
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

USER app
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

The image builds from 1.2GB (development) down to 180MB (production). It includes a health check that the load balancer uses to verify the container is ready before routing traffic to it.

## Step 2: GitHub Actions Pipeline

```yaml
# .github/workflows/deploy.yml — Full CI/CD pipeline
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false              # never cancel an in-progress deploy

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: test }
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm typecheck
      - run: pnpm test
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
      - run: pnpm e2e
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test

  build:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
      version: ${{ steps.version.outputs.version }}

    steps:
      - uses: actions/checkout@v4

      - id: version
        run: echo "version=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT

      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=raw,value=latest

      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            SENTRY_RELEASE=${{ steps.version.outputs.version }}

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to staging
        run: |
          # Update ECS service with new image
          aws ecs update-service \
            --cluster staging \
            --service app \
            --force-new-deployment \
            --task-definition $(aws ecs register-task-definition \
              --cli-input-json "$(cat task-def.json | jq --arg IMG "$IMAGE" '.containerDefinitions[0].image = $IMG')" \
              --query 'taskDefinition.taskDefinitionArn' --output text)
        env:
          IMAGE: ${{ needs.build.outputs.image-tag }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: Wait for deployment
        run: |
          aws ecs wait services-stable --cluster staging --services app
          echo "Staging deployment complete"

      - name: Smoke test
        run: |
          for i in {1..10}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://staging.myapp.com/health)
            if [ "$STATUS" = "200" ]; then echo "Health check passed"; exit 0; fi
            sleep 5
          done
          echo "Health check failed" && exit 1

  deploy-production:
    needs: [build, deploy-staging]
    runs-on: ubuntu-latest
    environment: production              # requires manual approval in GitHub
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to production (blue-green)
        run: |
          # Register new task definition
          NEW_TASK=$(aws ecs register-task-definition \
            --cli-input-json "$(cat task-def.json | jq --arg IMG "$IMAGE" '.containerDefinitions[0].image = $IMG')" \
            --query 'taskDefinition.taskDefinitionArn' --output text)

          # Update service — ECS performs rolling update
          aws ecs update-service \
            --cluster production \
            --service app \
            --task-definition $NEW_TASK \
            --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100"

          # maximumPercent=200: spin up new tasks BEFORE stopping old ones
          # minimumHealthyPercent=100: never go below current count
        env:
          IMAGE: ${{ needs.build.outputs.image-tag }}

      - name: Wait for stable
        run: aws ecs wait services-stable --cluster production --services app --timeout 600

      - name: Create Sentry release
        run: |
          npx @sentry/cli releases new ${{ needs.build.outputs.version }}
          npx @sentry/cli releases set-commits ${{ needs.build.outputs.version }} --auto
          npx @sentry/cli releases finalize ${{ needs.build.outputs.version }}
          npx @sentry/cli releases deploys ${{ needs.build.outputs.version }} new -e production
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
```

The key to zero downtime is `maximumPercent=200,minimumHealthyPercent=100`: ECS launches new containers alongside existing ones, waits for health checks to pass, then drains connections from old containers before stopping them.

## Step 3: Automated Rollback

```yaml
      - name: Post-deploy verification
        id: verify
        continue-on-error: true
        run: |
          sleep 30  # let traffic flow to new version
          ERROR_RATE=$(curl -s "https://sentry.io/api/0/projects/myorg/app/stats/" \
            -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" | jq '.[-1][1]')

          if [ "$ERROR_RATE" -gt 50 ]; then
            echo "Error rate spike detected: $ERROR_RATE errors"
            echo "rollback=true" >> $GITHUB_OUTPUT
          fi

      - name: Rollback if needed
        if: steps.verify.outputs.rollback == 'true'
        run: |
          PREVIOUS_TASK=$(aws ecs describe-services \
            --cluster production --services app \
            --query 'services[0].deployments[1].taskDefinition' --output text)

          aws ecs update-service \
            --cluster production --service app \
            --task-definition $PREVIOUS_TASK

          echo "::error::Rolled back to previous version due to error spike"
          exit 1
```

## Results

After the migration, deployments happen on every merge to main — during business hours, not at 2 AM. Average deploy time: 4 minutes (build) + 3 minutes (rolling update) = 7 minutes from merge to production. Zero downtime across 200+ deployments in the first quarter. The one time a bad deploy shipped (database query causing 500s), the automated rollback triggered within 90 seconds — total impact was 47 requests that got errors, compared to the old 45-minute outages. The team's deploy frequency increased from 2/week to 8/day, and deploy anxiety dropped to zero.
