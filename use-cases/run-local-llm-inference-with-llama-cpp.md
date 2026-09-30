---
title: Run Local LLM Inference with llama.cpp
slug: run-local-llm-inference-with-llama-cpp
description: Classify sensitive support tickets on your own GPU through a local OpenAI-compatible endpoint, for teams that cannot send customer data to a cloud API.
skills:
  - llama-cpp
  - openai-sdk
category: data-ai
tags:
  - llama-cpp
  - local-llm
  - gguf
  - openai-compatible
  - data-privacy
---

## The Problem

Priya Raman is the only backend engineer at Ledgerline, a 14-person bookkeeping startup. The support inbox holds 41,600 tickets from the last two years, and the product team wants each one labelled by product area and urgency so they can see what breaks most often. The tickets contain bank account fragments, invoices and customer names, and Ledgerline's data processing agreement forbids sending them to a third-party model provider.

Priya already has a labelling script written against the OpenAI Python SDK from an earlier prototype on synthetic data. What she lacks is a model that runs inside the office, speaks the same API, and always returns JSON the script can parse. There is one machine available: an Ubuntu workstation with an RTX 4070 (12 GB of VRAM).

## The Solution

Use the **llama-cpp** skill to install llama.cpp, download a quantized Qwen 2.5 7B model, and serve it on localhost behind an API key. Use the **openai-sdk** skill to point the existing script at the local endpoint and add a JSON schema, so every answer is valid and has exactly the expected fields. Nothing leaves the workstation.

## Step-by-Step Walkthrough

### 1. Install llama.cpp and confirm the GPU is visible

```text
Install llama.cpp on this workstation and check that it can use the RTX 4070.
```

The agent installs from Homebrew and lists the devices llama.cpp can offload to:

```bash
brew install llama.cpp
llama version
llama cli --list-devices
```

If `llama` is not on the PATH after the package install, the agent uses `llama-cli` and `llama-server` with the same flags.

### 2. Download a model that fits in 12 GB

```text
Download Qwen 2.5 7B Instruct in a quantization that leaves room for an 8k context on 12 GB of VRAM.
```

The `Q4_K_M` file is about 4.7 GB, which leaves headroom for the context cache:

```bash
llama download -hf bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M
llama cli --cache-list
```

The command prints the path of the cached file when the download finishes.

### 3. Serve the model on localhost with an API key

```text
Start an OpenAI-compatible server on port 8080, localhost only, with an API key and metrics. Use all GPU layers and 4 parallel slots.
```

```bash
export LLAMA_API_KEY="$(openssl rand -hex 24)"

llama serve -hf bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M \
  --alias qwen2.5-7b-instruct \
  -c 32768 -ngl all -np 4 \
  --host 127.0.0.1 --port 8080 --metrics &

until curl -sf http://127.0.0.1:8080/health > /dev/null; do sleep 2; done
curl -s http://127.0.0.1:8080/v1/models -H "Authorization: Bearer $LLAMA_API_KEY"
```

The four slots share the 32,768-token context, so each ticket has about 8k tokens to work with. The health check returns HTTP 503 until the weights are loaded, which is why the agent waits before sending the first request.

### 4. Point the labelling script at the local endpoint

```text
Change classify_tickets.py to use the local server and force the output into our label schema. Read tickets-2024-2026.jsonl and write labels.jsonl.
```

The agent changes the client construction and adds a schema. The rest of the script stays as it was:

```python
import json
import os
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8080/v1", api_key=os.environ["LLAMA_API_KEY"])

SCHEMA = {
    "type": "object",
    "properties": {
        "area": {"type": "string", "enum": ["invoicing", "bank-sync", "payroll", "login", "other"]},
        "urgency": {"type": "string", "enum": ["low", "medium", "high"]},
        "summary": {"type": "string", "maxLength": 160},
    },
    "required": ["area", "urgency", "summary"],
}

with open("tickets-2024-2026.jsonl") as src, open("labels.jsonl", "w") as out:
    for line in src:
        ticket = json.loads(line)
        reply = client.chat.completions.create(
            model="qwen2.5-7b-instruct",
            temperature=0,
            max_tokens=200,
            messages=[
                {"role": "system", "content": "Label the support ticket. Use only the ticket text."},
                {"role": "user", "content": ticket["body"]},
            ],
            response_format={"type": "json_schema", "schema": SCHEMA},
        )
        label = json.loads(reply.choices[0].message.content)
        out.write(json.dumps({"id": ticket["id"], **label}) + "\n")
```

A first run on 50 tickets produces lines such as:

```json
{"id": "T-20931", "area": "bank-sync", "urgency": "high", "summary": "Bank feed for the business account stopped importing after the customer renewed consent."}
```

### 5. Measure throughput before the full run

```text
How fast is this? Estimate how long all 41,600 tickets will take.
```

The agent reads the Prometheus gauges that `--metrics` exposes:

```bash
curl -s http://127.0.0.1:8080/metrics -H "Authorization: Bearer $LLAMA_API_KEY" \
  | grep -E "llamacpp:(prompt_tokens_seconds|predicted_tokens_seconds|requests_processing)"
```

With a single request at a time the script handled about 35 tickets per minute. The agent rewrites the loop to send four requests concurrently, matching `-np 4`, and the rate rises to about 110 tickets per minute.

## Real-World Example

Priya starts the full run on a Thursday at 17:40 and leaves the workstation on overnight. At roughly 110 tickets per minute, all 41,600 tickets are labelled in a little over six hours. She spot-checks 200 random labels the next morning: 187 match her own judgement, and 11 of the 13 disagreements are tickets that mention two product areas at once. She adds a `secondary_area` field to the schema and reruns only those tickets.

The product team gets a spreadsheet showing that bank-sync problems make up 38% of high-urgency tickets, which moves the consent-renewal fix to the top of the next sprint. The cost was one evening of electricity and no new vendor contract. Because the endpoint speaks the OpenAI API, the same script can be pointed at a hosted model later for non-sensitive data by changing two constructor arguments.

## Related Skills

- [llama-cpp](/skills/llama-cpp) — installs llama.cpp, downloads the GGUF model, and serves it as a local OpenAI-compatible endpoint with an API key and metrics
- [openai-sdk](/skills/openai-sdk) — provides the Python client the labelling script uses, pointed at the local server through `base_url`
