---
name: kaggle-finetune
description: >-
  End-to-end workflow for fine-tuning LLMs using Kaggle datasets. Use when
  downloading datasets from Kaggle for model training, preparing conversation/customer
  service data for chatbot fine-tuning, or building domain-specific AI assistants.
  Covers dataset discovery, download, preprocessing into chat format, and integration
  with PEFT/LoRA training.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["fine-tuning", "kaggle", "llm", "peft", "lora", "chatbot", "machine-learning"]
  use-cases:
    - "Fine-tune a customer service chatbot using Kaggle conversation datasets"
    - "Build domain-specific AI assistants from public datasets"
    - "Prepare Kaggle data for LLM training with proper chat formatting"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Kaggle Fine-Tuning Workflow

## Overview

Complete pipeline for downloading Kaggle datasets and fine-tuning LLMs. Handles dataset discovery, download via Kaggle CLI, preprocessing into HuggingFace chat format, and training with PEFT/LoRA for memory-efficient fine-tuning.

## Prerequisites

```bash
pip install kaggle peft transformers accelerate bitsandbytes datasets trl
```

Set Kaggle API token:
```bash
export KAGGLE_API_TOKEN=KGAT_xxxxx
```

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

### Step 3: Fine-tune with LoRA

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
        learning_rate=2e-4, fp16=True, max_seq_length=512,
    ),
    train_dataset=dataset,
    peft_config=lora_config,
    tokenizer=tokenizer,
)
trainer.train()
trainer.save_model("./model-lora")
```

### Step 4: Test and deploy

```python
from peft import PeftModel

model = AutoModelForCausalLM.from_pretrained(model_name, device_map="auto")
model = PeftModel.from_pretrained(model, "./model-lora")

messages = [{"role": "user", "content": "How can I reset my password?"}]
text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer(text, return_tensors="pt").to(model.device)
outputs = model.generate(**inputs, max_new_tokens=100)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Out of memory | Reduce batch size to 1, increase gradient accumulation |
| Poor results | Increase epochs (3-5), check data quality, raise LoRA r to 32-64 |
| Slow training | Enable fp16/bf16, reduce max_seq_length |

## See Also

- `peft-fine-tuning` — Detailed PEFT/LoRA configuration options
