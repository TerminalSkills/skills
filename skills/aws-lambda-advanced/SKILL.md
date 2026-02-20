---
name: "aws-lambda-advanced"
description: "Advanced AWS Lambda techniques including layers, custom runtimes, cold start optimization, and production monitoring"
license: "Apache-2.0"
metadata:
  author: "terminal-skills"
  version: "1.0.0"
  category: "serverless"
  tags: ["aws", "lambda", "serverless", "layers", "optimization", "monitoring"]
---

# AWS Lambda Advanced

Master advanced AWS Lambda techniques including Lambda layers, custom runtimes, cold start optimization, and production-ready monitoring.

## Overview

Advanced AWS Lambda capabilities include:

- **Lambda Layers** for sharing code and dependencies across functions
- **Custom Runtimes** using the Runtime API
- **Cold Start Optimization** techniques for sub-second response times
- **Advanced Monitoring** with X-Ray, CloudWatch, and custom metrics
- **Performance Tuning** memory, timeout, and concurrency optimization

## Instructions

### Step 1: Lambda Layers

```bash
# Create layer directory
mkdir -p lambda-layers/python-utils/python

# Add utilities
echo "def common_function(): return 'Hello from layer'" > lambda-layers/python-utils/python/utils.py

# Package layer
cd lambda-layers/python-utils
zip -r utils-layer.zip python/

# Deploy layer
aws lambda publish-layer-version \
    --layer-name python-utils \
    --zip-file fileb://utils-layer.zip \
    --compatible-runtimes python3.9
```

### Step 2: Optimized Function

```python
# optimized_handler.py
import json
import boto3
from utils import common_function  # From layer

# Global variables for connection reuse
dynamodb = None

def initialize_connections():
    global dynamodb
    if dynamodb is None:
        dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    initialize_connections()
    
    # Fast health check path
    if event.get('path') == '/health':
        return {
            'statusCode': 200,
            'body': json.dumps({'status': 'healthy'})
        }
    
    # Use layer function
    result = common_function()
    
    return {
        'statusCode': 200,
        'body': json.dumps({'result': result})
    }

# Pre-warm during import
initialize_connections()
```

### Step 3: Custom Runtime

```bash
#!/bin/bash
# bootstrap
set -euo pipefail

while true; do
    # Get next invocation
    RESPONSE=$(curl -sS -X GET "${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/next")
    REQUEST_ID=$(echo "$RESPONSE" | grep -i lambda-runtime-aws-request-id | cut -d' ' -f2)
    EVENT=$(echo "$RESPONSE" | tail -1)
    
    # Process event
    RESULT=$(echo "$EVENT" | ./handler.sh)
    
    # Send response
    curl -X POST "${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/$REQUEST_ID/response" \
        -d "$RESULT"
done
```

## Guidelines

- **Use Lambda Layers** to share common code and reduce deployment package size
- **Optimize memory allocation** - more memory often means better performance
- **Implement connection pooling** - reuse database connections across invocations
- **Monitor cold starts** - use provisioned concurrency for latency-critical functions