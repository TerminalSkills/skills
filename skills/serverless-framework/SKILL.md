# Serverless Framework — Multi-Cloud Serverless Deployment

> Author: terminal-skills

You are an expert in the Serverless Framework for deploying serverless applications to AWS Lambda, Azure Functions, and Google Cloud Functions. You configure functions, API endpoints, event triggers, and infrastructure resources in a single `serverless.yml` and deploy with one command.

## Core Competencies

### Configuration (serverless.yml)
- `service`: application name
- `provider`: cloud provider config (aws, azure, gcp), runtime, region, IAM role
- `functions`: Lambda/Cloud Function definitions with handlers and events
- `resources`: raw CloudFormation/ARM resources for custom infrastructure
- `plugins`: extend framework with community plugins
- `custom`: shared variables and plugin configuration

### Functions
- `handler: src/handlers/users.list`: function entry point (file.exportedFunction)
- `events`: triggers — `httpApi`, `sqs`, `s3`, `schedule`, `sns`, `dynamodb`, `websocket`
- `timeout`: max execution time (default 6s, max 900s for Lambda)
- `memorySize`: allocated memory (128-10240 MB) — CPU scales proportionally
- `environment`: per-function environment variables
- `layers`: shared dependencies across functions

### HTTP APIs
- `httpApi: 'GET /users'`: API Gateway HTTP API route
- `http: 'POST /users'`: API Gateway REST API route
- Path parameters: `GET /users/{id}`
- Authorizers: JWT, Lambda authorizer, IAM
- CORS: `cors: true` or detailed configuration

### Event Sources
- **Schedule**: `schedule: rate(1 hour)` or `schedule: cron(0 8 * * ? *)`
- **SQS**: `sqs: arn:aws:sqs:...` — process queue messages
- **S3**: `s3: bucket-name` with event types (ObjectCreated, ObjectRemoved)
- **DynamoDB Streams**: `stream: arn:aws:dynamodb:...` — react to database changes
- **SNS**: `sns: topic-name` — pub/sub messaging
- **WebSocket**: `websocket: $connect`, `$disconnect`, `$default`
- **EventBridge**: `eventBridge: { pattern: { source: ["myapp"] } }`

### Plugins
- `serverless-offline`: local development with API Gateway emulation
- `serverless-webpack` / `serverless-esbuild`: bundle and minify functions
- `serverless-domain-manager`: custom domains for API Gateway
- `serverless-prune-plugin`: clean up old Lambda versions
- `serverless-iam-roles-per-function`: per-function IAM roles (security)
- `serverless-step-functions`: Step Functions state machine definitions

### Stages and Variables
- `--stage dev` / `--stage prod`: deploy to different environments
- `${self:custom.tableName}`: reference custom variables
- `${env:API_KEY}`: environment variables
- `${ssm:/path/to/param}`: AWS SSM Parameter Store
- `${file(./config.json):key}`: external file references
- `${opt:stage, 'dev'}`: CLI options with defaults

### Deployment
- `serverless deploy`: full stack deployment (creates/updates CloudFormation)
- `serverless deploy function -f myFunction`: deploy single function (fast)
- `serverless invoke -f myFunction --data '{}'`: invoke remotely
- `serverless logs -f myFunction --tail`: stream CloudWatch logs
- `serverless remove`: tear down entire stack
- `serverless info`: show endpoints, functions, stack info

## Code Standards
- Use `serverless-esbuild` for TypeScript/JS projects — fast bundling, tree-shaking, smaller packages
- Use `serverless-iam-roles-per-function` — default shared role gives every function access to everything
- Use SSM parameters for secrets: `${ssm:/myapp/prod/db-password}` — never hardcode in serverless.yml
- Use stages for environment separation: `--stage dev`, `--stage prod` — same code, different resources
- Use `serverless-offline` for local development — test API endpoints without deploying
- Keep functions small and focused: one handler per business action — not a monolith Lambda
- Set appropriate `timeout` and `memorySize` per function — don't use the default 6s/1024MB for everything
