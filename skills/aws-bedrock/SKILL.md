---
name: aws-bedrock
description: >-
  AWS Bedrock — fully managed foundation models on AWS infrastructure. Use when
  deploying AI in AWS-native environments, needing enterprise compliance (SOC2, HIPAA),
  running Claude or Llama on AWS, leveraging Knowledge Bases for RAG,
  or applying Guardrails for content safety.
license: Apache-2.0
compatibility: "Python 3.10+ with boto3 SDK and AWS credentials configured"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "aws-bedrock, aws, claude, llama, enterprise-ai"
  use-cases: "Run Claude on AWS infrastructure with SOC2/HIPAA compliance, Build a RAG system using Bedrock Knowledge Bases and S3, Apply content safety guardrails to LLM outputs in regulated industries"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# AWS Bedrock

## Overview

Amazon Bedrock is a fully managed service that provides access to foundation models from multiple providers (Anthropic, Amazon, Meta, Mistral and others) through a unified AWS API. It integrates natively with AWS IAM, VPC, CloudWatch, and S3, making it ideal for enterprise workloads requiring compliance, security controls, and AWS-native data pipelines.

## Setup

```bash
pip install boto3
# Configure credentials (SSO or an IAM role is preferable to long-lived keys)
aws configure sso
export AWS_DEFAULT_REGION=us-east-1
```

Access to most serverless models is on by default once your IAM role has the AWS Marketplace permissions (`aws-marketplace:Subscribe`, `Unsubscribe`, `ViewSubscriptions`) and the account has a valid payment method. Anthropic models on the `bedrock-runtime` endpoint also need the one-time first-use form (it does not apply to the `bedrock-mantle` endpoint). The first call can fail with `AccessDeniedException` for up to about 15 minutes while the subscription finishes. Some models need extra account-level access from AWS Sales.

## Available Models

Model IDs, Regions and lifecycle state change often. List what your account and Region can call, and read the `modelLifecycle` field before you pin an ID:

```python
import boto3

bedrock = boto3.client("bedrock", region_name="us-east-1")  # control plane, not bedrock-runtime
for m in bedrock.list_foundation_models(byProvider="anthropic")["modelSummaries"]:
    print(m["modelId"], m["modelLifecycle"]["status"])
```

| Model ID | Notes |
|---|---|
| `anthropic.claude-fable-5-1`, `anthropic.claude-opus-5-5`, `anthropic.claude-sonnet-5-5`, `anthropic.claude-haiku-5-5` | Current Claude line. No ARN version suffix. Call through `InvokeModel` or the Messages endpoint below. |
| `anthropic.claude-haiku-4-5-20251001-v1:0` | Older Claude. Needs an inference profile (`global.`, `us.`, `eu.` prefix); the bare ID fails with an HTTP 400 about on-demand throughput. |
| `meta.llama3-3-70b-instruct-v1:0` | Llama; already Legacy (EOL March 30, 2027). |

Claude 3, 3.5 and 3.7 models, Claude Sonnet 4.5 and Opus 4.1 are Legacy with end-of-life dates between November 2026 and April 2027; Cohere Command R+ and Llama 3.1 405B are already past EOL. A Legacy model stops accepting new customers, and existing ones can lose access after 15 days of inactivity. Check the Bedrock model lifecycle page before using any ID from an older tutorial.

## Instructions

### Converse API (Recommended)

The Converse API is the unified chat interface for all Bedrock models:

```python
import boto3

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

response = bedrock.converse(
    modelId="global.anthropic.claude-haiku-4-5-20251001-v1:0",
    messages=[{"role": "user", "content": [{"text": "Explain AWS Lambda in simple terms."}]}],
    system=[{"text": "You are an AWS solutions architect for a fintech team."}],
    inferenceConfig={"maxTokens": 1024, "temperature": 0.7},
)

print(response["output"]["message"]["content"][0]["text"])
print(response["usage"])  # token counts
```

### Streaming with Converse

```python
import boto3

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

response = bedrock.converse_stream(
    modelId="global.anthropic.claude-haiku-4-5-20251001-v1:0",
    messages=[{"role": "user", "content": [{"text": "Write a Python quicksort implementation."}]}],
)

for event in response["stream"]:
    if "contentBlockDelta" in event:
        delta = event["contentBlockDelta"]["delta"]
        if "text" in delta:
            print(delta["text"], end="", flush=True)
print()
```

### Claude Sonnet/Opus 5.x through InvokeModel or the Messages endpoint

The current Claude models are documented for `InvokeModel` on `bedrock-runtime` and for a native Messages API on the `bedrock-mantle` endpoint. Use `anthropic.claude-sonnet-5-5` as the model ID. Do not assume the Converse examples here accept them; check the model's page in Bedrock first.

```bash
pip install -U "anthropic[bedrock]"
```

```python
from anthropic import AnthropicBedrockMantle

client = AnthropicBedrockMantle(aws_region="us-east-1")  # SigV4 via the standard AWS credential chain
message = client.messages.create(
    model="anthropic.claude-sonnet-5-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Summarize the CAP theorem in three sentences."}],
)
print(next(b.text for b in message.content if b.type == "text"))
```

That endpoint has no Files API, server-side tools (web search, code execution), MCP connector or Message Batches.

### InvokeModel API (Raw)

Direct access with the model-specific body. Claude's body uses `anthropic_version`:

```python
import boto3
import json

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

body = {
    "anthropic_version": "bedrock-2023-05-31",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "What is the capital of France?"}],
}

response = bedrock.invoke_model(
    modelId="global.anthropic.claude-haiku-4-5-20251001-v1:0",
    body=json.dumps(body),
    contentType="application/json",
)

result = json.loads(response["body"].read())
print(result["content"][0]["text"])
```

### Image input

In Converse, an image is a content block with raw bytes (no base64): `{"image": {"format": "png", "source": {"bytes": open("diagram.png", "rb").read()}}}`, placed next to a `{"text": ...}` block in the same user message.

## Examples

### Tool Use (Function Calling)

```python
import boto3

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
    modelId="global.anthropic.claude-haiku-4-5-20251001-v1:0",
    messages=messages,
    toolConfig={"tools": tools},
)

# Handle tool use
if response["stopReason"] == "tool_use":
    tool_use = next(b for b in response["output"]["message"]["content"] if "toolUse" in b)
    # tool_use["toolUse"]["name"] / ["input"] say what to run; return the result
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
        modelId="global.anthropic.claude-haiku-4-5-20251001-v1:0",
        messages=messages,
        toolConfig={"tools": tools},
    )
    print(final["output"]["message"]["content"][0]["text"])
```

### Knowledge Bases for RAG

```python
import boto3

# Knowledge Base RAG — Bedrock manages embedding and retrieval
account_id = boto3.client("sts").get_caller_identity()["Account"]
bedrock_agent = boto3.client("bedrock-agent-runtime", region_name="us-east-1")

retrieve_response = bedrock_agent.retrieve(
    knowledgeBaseId="KB123456789",
    retrievalQuery={"text": "What is our refund policy?"},
    retrievalConfiguration={
        "vectorSearchConfiguration": {"numberOfResults": 5}
    },
)

contexts = [r["content"]["text"] for r in retrieve_response["retrievalResults"]]

retrieve_and_generate = bedrock_agent.retrieve_and_generate(
    input={"text": "What is our refund policy?"},
    retrieveAndGenerateConfiguration={
        "type": "KNOWLEDGE_BASE",
        "knowledgeBaseConfiguration": {
            "knowledgeBaseId": "KB123456789",
            "modelArn": f"arn:aws:bedrock:us-east-1:{account_id}:inference-profile/global.anthropic.claude-haiku-4-5-20251001-v1:0",
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
    modelId="global.anthropic.claude-haiku-4-5-20251001-v1:0",
    messages=[{"role": "user", "content": [{"text": "My card number is 4111 1111 1111 1111, can you store it?"}]}],
    guardrailConfig={
        "guardrailIdentifier": "gr7k2m9x4p1q",
        "guardrailVersion": "DRAFT",  # or "1", "2", etc.
        "trace": "enabled",
    },
)

# stopReason tells you whether the guardrail stepped in
if response["stopReason"] == "guardrail_intervened":
    print("Blocked:", response["output"]["message"]["content"][0]["text"])
    print("Why:", response["trace"]["guardrail"]["inputAssessment"])
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
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1:111122223333:inference-profile/global.anthropic.claude-haiku-4-5-20251001-v1:0",
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0"
      ]
    }
  ]
}
```

## Guidelines

- Use the **Converse API** for new integrations with models that support it. `Converse` needs the `bedrock:InvokeModel` permission and `ConverseStream` needs `bedrock:InvokeModelWithResponseStream`; there are no separate `bedrock:Converse*` actions.
- Newer models are served through inference profiles. Pass the profile ID (`global.`, `us.`, `eu.`); the policy must allow the profile ARN and the foundation-model ARN in every destination Region, and an SCP that blocks one destination Region fails the request. Regional endpoints cost 10 percent more than global ones for Claude.
- Bedrock processes data in the selected AWS region — choose for data residency compliance.
- Knowledge Bases handle chunking, embedding, and retrieval automatically with OpenSearch Serverless.
- Guardrails can block harmful content, PII, and off-topic queries before they reach the model.
- Use `converse_stream` for user-facing features to reduce perceived latency.
