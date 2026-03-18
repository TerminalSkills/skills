---
name: aws-bedrock
description: >-
  AWS Bedrock — fully managed foundation models on AWS infrastructure. Use when
  deploying AI in AWS-native environments, needing enterprise compliance (SOC2, HIPAA),
  running Claude, Llama, Titan, or Mistral on AWS, leveraging Knowledge Bases for RAG,
  or applying Guardrails for content safety.
license: Apache-2.0
compatibility: "Python 3.9+ with boto3 SDK and AWS credentials configured"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["aws-bedrock", "aws", "claude", "llama", "enterprise-ai"]
  use-cases:
    - "Run Claude 3.5 Sonnet on AWS infrastructure with SOC2/HIPAA compliance"
    - "Build a RAG system using Bedrock Knowledge Bases and S3"
    - "Apply content safety guardrails to LLM outputs in regulated industries"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# AWS Bedrock

## Overview

Amazon Bedrock is a fully managed service that provides access to foundation models from multiple providers (Anthropic, Meta, Amazon, Mistral, Cohere) through a unified AWS API. It integrates natively with AWS IAM, VPC, CloudWatch, and S3, making it ideal for enterprise workloads requiring compliance, security controls, and AWS-native data pipelines.

## Setup

```bash
pip install boto3
```

```bash
# Configure AWS credentials
aws configure
# Or set environment variables:
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=us-east-1
```

Enable model access in the AWS Console: **Bedrock → Model Access → Enable models**

## Available Models

| Model ID | Provider | Best For |
|---|---|---|
| `anthropic.claude-3-5-sonnet-20241022-v2:0` | Anthropic | Best overall quality |
| `anthropic.claude-3-5-haiku-20241022-v1:0` | Anthropic | Fast, cost-efficient |
| `anthropic.claude-3-opus-20240229-v1:0` | Anthropic | Most capable reasoning |
| `meta.llama3-70b-instruct-v1:0` | Meta | Open-weight, Llama 3 70B |
| `meta.llama3-8b-instruct-v1:0` | Meta | Fast, smaller Llama |
| `amazon.titan-text-express-v1` | Amazon | AWS-native text generation |
| `mistral.mistral-large-2402-v1:0` | Mistral | Code + reasoning |
| `cohere.command-r-plus-v1:0` | Cohere | RAG, tool use |

## Instructions

### Converse API (Recommended)

The Converse API is the unified chat interface for all Bedrock models:

```python
import boto3

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

response = bedrock.converse(
    modelId="anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages=[
        {"role": "user", "content": [{"text": "Explain AWS Lambda in simple terms."}]}
    ],
    system=[{"text": "You are a helpful AWS solutions architect."}],
    inferenceConfig={
        "maxTokens": 1024,
        "temperature": 0.7,
    },
)

print(response["output"]["message"]["content"][0]["text"])
print(f"Input tokens: {response['usage']['inputTokens']}")
print(f"Output tokens: {response['usage']['outputTokens']}")
```

### Streaming with Converse

```python
import boto3

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

response = bedrock.converse_stream(
    modelId="anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages=[{"role": "user", "content": [{"text": "Write a Python quicksort implementation."}]}],
)

for event in response["stream"]:
    if "contentBlockDelta" in event:
        delta = event["contentBlockDelta"]["delta"]
        if "text" in delta:
            print(delta["text"], end="", flush=True)
print()
```

### InvokeModel API (Raw)

For models not yet supported by Converse, or for direct access:

```python
import boto3
import json

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

# Claude via InvokeModel
body = {
    "anthropic_version": "bedrock-2023-05-31",
    "max_tokens": 1024,
    "messages": [
        {"role": "user", "content": "What is the capital of France?"}
    ],
}

response = bedrock.invoke_model(
    modelId="anthropic.claude-3-5-sonnet-20241022-v2:0",
    body=json.dumps(body),
    contentType="application/json",
    accept="application/json",
)

result = json.loads(response["body"].read())
print(result["content"][0]["text"])
```

### Multi-Modal — Image Analysis

```python
import boto3
import base64
import json

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

# Read image
with open("diagram.png", "rb") as f:
    image_b64 = base64.b64encode(f.read()).decode()

response = bedrock.converse(
    modelId="anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "image": {
                        "format": "png",
                        "source": {"bytes": base64.b64decode(image_b64)},
                    }
                },
                {"text": "Describe this architecture diagram and identify potential issues."},
            ],
        }
    ],
)

print(response["output"]["message"]["content"][0]["text"])
```

### Tool Use (Function Calling)

```python
import boto3
import json

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

tools = [
    {
        "toolSpec": {
            "name": "query_database",
            "description": "Execute a SQL query against the production database",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "sql": {"type": "string", "description": "SQL query to execute"},
                        "database": {"type": "string", "description": "Database name"},
                    },
                    "required": ["sql"],
                }
            },
        }
    }
]

messages = [{"role": "user", "content": [{"text": "How many active users do we have?"}]}]

response = bedrock.converse(
    modelId="anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages=messages,
    toolConfig={"tools": tools},
)

# Handle tool use
if response["stopReason"] == "tool_use":
    tool_use = next(b for b in response["output"]["message"]["content"] if "toolUse" in b)
    print(f"Tool: {tool_use['toolUse']['name']}")
    print(f"Input: {tool_use['toolUse']['input']}")

    # Return tool result
    messages.append(response["output"]["message"])
    messages.append({
        "role": "user",
        "content": [
            {
                "toolResult": {
                    "toolUseId": tool_use["toolUse"]["toolUseId"],
                    "content": [{"json": {"count": 12483, "active_last_30d": 8921}}],
                }
            }
        ],
    })

    final = bedrock.converse(
        modelId="anthropic.claude-3-5-sonnet-20241022-v2:0",
        messages=messages,
        toolConfig={"tools": tools},
    )
    print(final["output"]["message"]["content"][0]["text"])
```

### Knowledge Bases for RAG

```python
import boto3

# Knowledge Base RAG — Bedrock manages embedding and retrieval
bedrock_agent = boto3.client("bedrock-agent-runtime", region_name="us-east-1")

# Retrieve relevant documents
retrieve_response = bedrock_agent.retrieve(
    knowledgeBaseId="KB123456789",
    retrievalQuery={"text": "What is our refund policy?"},
    retrievalConfiguration={
        "vectorSearchConfiguration": {"numberOfResults": 5}
    },
)

# Extract text from results
contexts = [r["content"]["text"] for r in retrieve_response["retrievalResults"]]

# Generate answer grounded in retrieved docs
retrieve_and_generate = bedrock_agent.retrieve_and_generate(
    input={"text": "What is our refund policy?"},
    retrieveAndGenerateConfiguration={
        "type": "KNOWLEDGE_BASE",
        "knowledgeBaseConfiguration": {
            "knowledgeBaseId": "KB123456789",
            "modelArn": "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0",
        },
    },
)

print(retrieve_and_generate["output"]["text"])
```

### Guardrails for Content Safety

```python
import boto3

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

# Apply a guardrail to filter content
response = bedrock.converse(
    modelId="anthropic.claude-3-5-sonnet-20241022-v2:0",
    messages=[{"role": "user", "content": [{"text": "User's message here"}]}],
    guardrailConfig={
        "guardrailIdentifier": "my-guardrail-id",
        "guardrailVersion": "DRAFT",  # or "1", "2", etc.
        "trace": "enabled",
    },
)

# Check if content was blocked
if response.get("trace", {}).get("guardrail", {}).get("inputAssessment"):
    print("Guardrail assessment:", response["trace"]["guardrail"])
```

### IAM Policy for Bedrock

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:Converse",
        "bedrock:ConverseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0"
      ]
    }
  ]
}
```

## Guidelines

- Use the **Converse API** for new integrations — it's model-agnostic and handles message formatting.
- Enable models in the AWS Console before first use — they are not enabled by default.
- Bedrock processes data in the selected AWS region — choose for data residency compliance.
- Knowledge Bases handle chunking, embedding, and retrieval automatically with OpenSearch Serverless.
- Guardrails can block harmful content, PII, and off-topic queries before they reach the model.
- Use `converse_stream` for user-facing features to reduce perceived latency.
- Cross-region inference profiles let you automatically fall back to other regions if capacity is unavailable.
- Monitor costs with AWS Cost Explorer; tag Bedrock calls with application-specific tags.
