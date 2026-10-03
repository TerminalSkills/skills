---
name: kaggle-finetune
description: >-
  End-to-end workflow for fine-tuning LLMs using Kaggle datasets. Use when
  downloading datasets from Kaggle for model training, preparing
  conversation/customer service data for chatbot fine-tuning, or building
  domain-specific AI assistants. Covers dataset discovery, download,
  preprocessing into chat format, and integration with PEFT/LoRA training.
license: Apache-2.0
compatibility: "Python 3.11+; NVIDIA GPU with CUDA for 4-bit LoRA training; Kaggle account and API token"
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/Kaggle/kaggle-api
  category: data-ai
  tags:
    - fine-tuning
    - kaggle
    - llm
    - peft
    - lora
  use-cases:
    - Fine-tune a customer service chatbot using Kaggle conversation datasets
    - Build domain-specific AI assistants from public datasets
    - Prepare Kaggle data for LLM training with proper chat formatting
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# Kaggle Fine-Tuning Workflow

## Overview

Complete pipeline for downloading Kaggle datasets and fine-tuning LLMs. Handles dataset discovery, download via Kaggle CLI, preprocessing into HuggingFace chat format, and training with PEFT/LoRA for memory-efficient fine-tuning.

## Prerequisites

```bash
python -m venv .venv && source .venv/bin/activate
pip install kaggle peft transformers accelerate bitsandbytes datasets trl pandas
```

The Kaggle CLI needs Python 3.11+ (current release 2.x). Authenticate with one of: `kaggle auth login` (browser OAuth), the `KAGGLE_API_TOKEN` environment variable (token from kaggle.com/settings/api), a token file at `~/.kaggle/access_token`, or the legacy `~/.kaggle/kaggle.json`:
```bash
export KAGGLE_API_TOKEN="$(cat ~/.secrets/kaggle_token)"   # keep the token out of shell history and git
```
Training needs an NVIDIA GPU (4-bit loading via `bitsandbytes` is a CUDA path). Without one, use a Kaggle notebook with a GPU accelerator, or a small model in full precision.

## Instructions

### Step 1: Search and download datasets

```bash
# Search for relevant datasets
kaggle datasets list -s "customer service conversation" --sort-by votes

# Download specific dataset
kaggle datasets download -d bitext/bitext-gen-ai-chatbot-customer-support-dataset -p ./data --unzip
```

**Recommended datasets for chatbots:**

| Dataset | Use Case |
|---------|----------|
| `bitext/bitext-gen-ai-chatbot-customer-support-dataset` | Customer support |
| `kreeshrajani/3k-conversations-dataset-for-chatbot` | General chat |
| `oleksiymaliovanyy/call-center-transcripts-dataset` | Call center |
| `narendrageek/mental-health-faq-for-chatbot` | FAQ format |

### Step 2: Preprocess into chat format

Convert data to HuggingFace messages format:

```python
import pandas as pd
import json

def convert_to_chat_format(input_path, output_path, user_col, assistant_col, system_prompt=None):
    df = pd.read_csv(input_path)
    records = []
    
    for _, row in df.iterrows():
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": str(row[user_col])})
        messages.append({"role": "assistant", "content": str(row[assistant_col])})
        records.append({"messages": messages})
    
    with open(output_path, 'w') as f:
        for record in records:
            f.write(json.dumps(record) + '\n')
    
    return len(records)

# Example usage
convert_to_chat_format(
    "data/customer_support.csv", "data/train.jsonl",
    user_col="instruction", assistant_col="response",
    system_prompt="You are a helpful customer service assistant."
)
```

Check each dataset's license on its Kaggle page before training or redistributing a model built from it.

### Step 3: Fine-tune with LoRA

Written for TRL 1.x (`trl` 1.14 at the time of checking): `SFTConfig` uses `max_length` (not `max_seq_length`), the trainer takes `processing_class` (not `tokenizer`), and conversational `messages` data gets the chat template applied automatically.

```python
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, TaskType
from trl import SFTTrainer, SFTConfig
import torch

# Model selection by VRAM: 8GB→1.5B, 16GB→7B(4-bit), 24GB→8B
model_name = "Qwen/Qwen2.5-3B-Instruct"

# 4-bit quantization for memory efficiency
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
)

model = AutoModelForCausalLM.from_pretrained(
    model_name, quantization_config=bnb_config, device_map="auto"
)
tokenizer = AutoTokenizer.from_pretrained(model_name)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM, r=16, lora_alpha=32, lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
)

dataset = load_dataset("json", data_files="data/train.jsonl", split="train")

trainer = SFTTrainer(
    model=model,
    args=SFTConfig(
        output_dir="./model-finetune", num_train_epochs=3,
        per_device_train_batch_size=2, gradient_accumulation_steps=8,
        learning_rate=2e-4, bf16=True, max_length=512,
        assistant_only_loss=False,  # True needs a chat template with generation markers
    ),
    train_dataset=dataset,
    peft_config=lora_config,
    processing_class=tokenizer,
)
trainer.train()
trainer.save_model("./model-lora")
```

### Step 4: Test and deploy

```python
from peft import PeftModel

model = AutoModelForCausalLM.from_pretrained(model_name, device_map="auto", torch_dtype=torch.bfloat16)
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = PeftModel.from_pretrained(model, "./model-lora")

messages = [{"role": "user", "content": "How can I reset my password?"}]
text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer(text, return_tensors="pt").to(model.device)
outputs = model.generate(**inputs, max_new_tokens=100)
print(tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True))
# optional: model = model.merge_and_unload() to ship a single standalone model
```

## Examples

### Example 1: Fine-tune a customer service chatbot from a Kaggle dataset
**User prompt:** "Download the Bitext customer support dataset from Kaggle and fine-tune Qwen2.5-3B-Instruct on it using LoRA. I have a 16GB GPU."

The agent will:
1. Verify the Kaggle CLI is installed and authenticated (`kaggle datasets list -s bitext` succeeds).
2. Run `kaggle datasets download -d bitext/bitext-gen-ai-chatbot-customer-support-dataset -p ./data --unzip` to fetch the dataset.
3. Inspect the CSV columns to identify the user input and assistant response fields.
4. Write and execute a preprocessing script that converts the CSV into JSONL chat format with a system prompt like "You are a helpful customer service assistant."
5. Configure a LoRA fine-tune with `r=16`, 4-bit quantization, batch size 2 with gradient accumulation of 8, and train for 3 epochs.
6. Save the LoRA adapter to `./model-lora/` and run a test inference with a sample prompt like "How do I reset my password?"

### Example 2: Build a medical FAQ chatbot from Kaggle mental health data
**User prompt:** "Find a mental health FAQ dataset on Kaggle and prepare it for fine-tuning. I only have a CPU, so pick a small model."

The agent warns that 4-bit `bitsandbytes` loading is CUDA-oriented, so on CPU it uses a very small model in full precision (or recommends a free Kaggle GPU notebook). Steps:

The agent will:
1. Search Kaggle with `kaggle datasets list -s "mental health FAQ" --sort-by votes` and select an appropriate dataset.
2. Download and unzip the dataset to `./data/`.
3. Convert the FAQ pairs into JSONL chat format with a system prompt suited to mental health support.
4. Select Qwen2.5-0.5B-Instruct, drop the `BitsAndBytesConfig`, and train with batch size 1, gradient accumulation 16, `max_length=256`, `use_cpu=True`.
5. Start training and monitor loss, noting it will take hours on CPU and that a small sample (e.g. 500 rows) is enough to validate the pipeline.

## Guidelines

- Authenticate the Kaggle CLI before downloading (`kaggle auth login`, `KAGGLE_API_TOKEN`, or `~/.kaggle/access_token`); never paste the token into scripts or commit it. Competition data also needs the rules accepted on the website first.
- Choose your base model based on available VRAM: 1.5B parameters for 8GB, 3B-7B (4-bit) for 16GB, and 8B for 24GB.
- If you encounter out-of-memory errors during training, reduce `per_device_train_batch_size` to 1 and increase `gradient_accumulation_steps` to compensate before reducing model size.
- Inspect the raw CSV data before preprocessing to verify column names and data quality; missing values or mismatched columns will silently produce poor training data.
- Start with 3 training epochs and LoRA rank `r=16`; increase epochs to 5 and rank to 32-64 only if evaluation shows the model is underfitting.
- Use `bf16=True` on Ampere or newer GPUs (the TRL default when `fp16` is unset); use `fp16=True` on older cards such as the T4 and set `bnb_4bit_compute_dtype=torch.float16` to match.
- TRL's `SFTConfig` turns on gradient checkpointing by default, which saves memory at some speed cost.
- Hold out a validation split (`dataset.train_test_split(0.05)`) and read sample generations; loss alone does not show a good chatbot.
