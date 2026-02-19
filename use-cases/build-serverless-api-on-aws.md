---
title: Build a Serverless REST API on AWS
slug: build-serverless-api-on-aws
description: Build a production-ready serverless REST API using AWS Lambda, API Gateway, DynamoDB for storage, and Cognito for authentication — with zero servers to manage.
skills:
  - aws-lambda
  - aws-dynamodb
  - aws-cognito
category: cloud-services
tags:
  - serverless
  - aws
  - api
  - authentication
  - dynamodb
---

# Build a Serverless REST API on AWS

Maria is a backend engineer at a growing SaaS startup. Her team needs a REST API for their task management app — something that scales automatically, costs nearly nothing at low traffic, and doesn't require babysitting servers at 3 AM. She chooses the classic AWS serverless stack: API Gateway for routing, Lambda for compute, DynamoDB for storage, and Cognito for auth.

## The Architecture

The setup is straightforward: API Gateway receives HTTP requests, validates JWT tokens from Cognito, routes to Lambda functions, which read/write from DynamoDB. No EC2 instances, no containers, no patching.

```
Client → API Gateway (+ Cognito Authorizer) → Lambda → DynamoDB
```

## Step 1: Design the DynamoDB Table

Maria starts with the data model. Using single-table design, she stores users and tasks in one table with composite keys.

```python
# dynamo_setup.py — create the tasks table with single-table design
import boto3

dynamodb = boto3.client('dynamodb')

dynamodb.create_table(
    TableName='TaskApp',
    KeySchema=[
        {'AttributeName': 'PK', 'KeyType': 'HASH'},
        {'AttributeName': 'SK', 'KeyType': 'RANGE'}
    ],
    AttributeDefinitions=[
        {'AttributeName': 'PK', 'AttributeType': 'S'},
        {'AttributeName': 'SK', 'AttributeType': 'S'},
        {'AttributeName': 'GSI1PK', 'AttributeType': 'S'},
        {'AttributeName': 'GSI1SK', 'AttributeType': 'S'}
    ],
    GlobalSecondaryIndexes=[{
        'IndexName': 'GSI1',
        'KeySchema': [
            {'AttributeName': 'GSI1PK', 'KeyType': 'HASH'},
            {'AttributeName': 'GSI1SK', 'KeyType': 'RANGE'}
        ],
        'Projection': {'ProjectionType': 'ALL'}
    }],
    BillingMode='PAY_PER_REQUEST'
)
```

The access patterns are:
- `PK=USER#<userId>, SK=TASK#<taskId>` — get a specific task
- `PK=USER#<userId>, SK=begins_with("TASK#")` — list all tasks for a user
- `GSI1PK=STATUS#pending, GSI1SK=<date>` — find all pending tasks (for admin dashboard)

## Step 2: Set Up Cognito User Pool

Next, Maria creates the user pool. Users sign up with email, confirm via code, and receive JWTs.

```bash
# Create user pool with email sign-in
aws cognito-idp create-user-pool \
  --pool-name task-app-users \
  --auto-verified-attributes email \
  --username-attributes email \
  --policies '{"PasswordPolicy":{"MinimumLength":10,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":false}}'
```

```bash
# Create app client for the SPA frontend
aws cognito-idp create-user-pool-client \
  --user-pool-id us-east-1_XXXXX \
  --client-name task-app-web \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO \
  --callback-urls '["https://tasks.example.com/callback","http://localhost:3000/callback"]' \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client
```

## Step 3: Write the Lambda Functions

Maria writes the core API handlers. Each function is focused on one operation.

```python
# handlers/create_task.py — create a new task for the authenticated user
import json
import uuid
import boto3
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('TaskApp')

def handler(event, context):
    user_id = event['requestContext']['authorizer']['claims']['sub']
    body = json.loads(event['body'])

    task_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    item = {
        'PK': f'USER#{user_id}',
        'SK': f'TASK#{task_id}',
        'GSI1PK': f'STATUS#{body.get("status", "pending")}',
        'GSI1SK': now,
        'task_id': task_id,
        'title': body['title'],
        'description': body.get('description', ''),
        'status': body.get('status', 'pending'),
        'created_at': now,
        'updated_at': now
    }
    table.put_item(Item=item)

    return {
        'statusCode': 201,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'task_id': task_id, 'title': item['title'], 'status': item['status']})
    }
```

```python
# handlers/list_tasks.py — list all tasks for the authenticated user
import json
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('TaskApp')

def handler(event, context):
    user_id = event['requestContext']['authorizer']['claims']['sub']
    status_filter = event.get('queryStringParameters', {}).get('status')

    kwargs = {
        'KeyConditionExpression': 'PK = :pk AND begins_with(SK, :prefix)',
        'ExpressionAttributeValues': {':pk': f'USER#{user_id}', ':prefix': 'TASK#'}
    }

    if status_filter:
        kwargs['FilterExpression'] = '#s = :status'
        kwargs['ExpressionAttributeNames'] = {'#s': 'status'}
        kwargs['ExpressionAttributeValues'][':status'] = status_filter

    response = table.query(**kwargs)

    tasks = [{
        'task_id': item['task_id'],
        'title': item['title'],
        'status': item['status'],
        'created_at': item['created_at']
    } for item in response['Items']]

    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'tasks': tasks, 'count': len(tasks)})
    }
```

```python
# handlers/update_task.py — update a task's status or details
import json
import boto3
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('TaskApp')

def handler(event, context):
    user_id = event['requestContext']['authorizer']['claims']['sub']
    task_id = event['pathParameters']['taskId']
    body = json.loads(event['body'])

    update_expr = 'SET updated_at = :now'
    expr_values = {':now': datetime.utcnow().isoformat()}
    expr_names = {}

    if 'title' in body:
        update_expr += ', title = :title'
        expr_values[':title'] = body['title']
    if 'status' in body:
        update_expr += ', #s = :status, GSI1PK = :gsi1pk'
        expr_values[':status'] = body['status']
        expr_values[':gsi1pk'] = f'STATUS#{body["status"]}'
        expr_names['#s'] = 'status'

    result = table.update_item(
        Key={'PK': f'USER#{user_id}', 'SK': f'TASK#{task_id}'},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_values,
        ExpressionAttributeNames=expr_names or None,
        ReturnValues='ALL_NEW',
        ConditionExpression='attribute_exists(PK)'  # ensure task exists
    )

    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'task': result['Attributes']}, default=str)
    }
```

## Step 4: Set Up API Gateway with Cognito Authorizer

Maria creates the API and wires up the Cognito authorizer so every request is authenticated.

```bash
# Create the REST API
aws apigateway create-rest-api \
  --name task-api \
  --description "Task Management API" \
  --endpoint-configuration '{"types":["REGIONAL"]}'
```

```bash
# Create Cognito authorizer
aws apigateway create-authorizer \
  --rest-api-id API_ID \
  --name cognito-auth \
  --type COGNITO_USER_POOLS \
  --provider-arns "arn:aws:cognito-idp:us-east-1:123456789:userpool/us-east-1_XXXXX" \
  --identity-source "method.request.header.Authorization"
```

For a faster setup, Maria uses SAM (Serverless Application Model):

```yaml
# template.yaml — SAM template for the entire API
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Task Management Serverless API

Globals:
  Function:
    Runtime: python3.12
    Timeout: 10
    MemorySize: 256
    Environment:
      Variables:
        TABLE_NAME: TaskApp

Resources:
  TaskApi:
    Type: AWS::Serverless::Api
    Properties:
      StageName: prod
      Auth:
        DefaultAuthorizer: CognitoAuthorizer
        Authorizers:
          CognitoAuthorizer:
            UserPoolArn: !GetAtt UserPool.Arn

  CreateTaskFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: handlers/create_task.handler
      Events:
        Api:
          Type: Api
          Properties:
            RestApiId: !Ref TaskApi
            Path: /tasks
            Method: POST
      Policies:
        - DynamoDBCrudPolicy:
            TableName: TaskApp

  ListTasksFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: handlers/list_tasks.handler
      Events:
        Api:
          Type: Api
          Properties:
            RestApiId: !Ref TaskApi
            Path: /tasks
            Method: GET
      Policies:
        - DynamoDBReadPolicy:
            TableName: TaskApp

  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: task-app-users
      AutoVerifiedAttributes: [email]
      UsernameAttributes: [email]
```

```bash
# Deploy with SAM
sam build && sam deploy --guided
```

## Step 5: Test the API

```bash
# Sign up a test user
aws cognito-idp sign-up \
  --client-id YOUR_CLIENT_ID \
  --username test@example.com \
  --password "TestPass123!"

# Get an auth token
TOKEN=$(aws cognito-idp initiate-auth \
  --client-id YOUR_CLIENT_ID \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=test@example.com,PASSWORD="TestPass123!" \
  --query 'AuthenticationResult.IdToken' --output text)

# Create a task
curl -X POST https://API_ID.execute-api.us-east-1.amazonaws.com/prod/tasks \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Ship feature X","status":"pending"}'

# List tasks
curl https://API_ID.execute-api.us-east-1.amazonaws.com/prod/tasks \
  -H "Authorization: $TOKEN"
```

## What Maria Learned

The entire API runs for pennies at low traffic and scales to thousands of requests per second without configuration changes. DynamoDB's on-demand billing means she pays per request. Lambda charges per invocation. Cognito handles auth with no custom code for password hashing, token management, or session handling.

The key insight: design DynamoDB access patterns first, then build the API around them. The single-table design feels unnatural at first but pays off in performance — one query fetches everything needed for a single API call.
