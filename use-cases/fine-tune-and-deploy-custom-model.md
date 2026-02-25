---
title: Fine-Tune and Deploy a Custom LLM
slug: fine-tune-and-deploy-custom-model
description: |
  Fine-tune an open-source LLM on company-specific data using Hugging Face Transformers,
  track experiments with Weights & Biases, and deploy the model for production inference with vLLM.
skills:
  - huggingface
  - wandb
  - vllm
category: data-ai
tags:
  - fine-tuning
  - llm
  - deployment
  - experiment-tracking
  - lora
---

# Fine-Tune and Deploy a Custom LLM

Raj is an ML engineer at a legal tech company. Their lawyers need an LLM that understands legal terminology and can draft contract clauses — something general-purpose models handle poorly. He'll fine-tune Llama 3.1 8B on their proprietary legal corpus, track everything in W&B, and deploy the model with vLLM for the internal team.

## Step 1: Prepare the Training Data

Raj starts by formatting the company's legal Q&A pairs and contract examples into the chat format Llama expects.

```python
# prepare_data.py — Convert legal documents into training format
import json
from datasets import Dataset

raw_examples = [
    {
        "instruction": "Draft a non-compete clause for a senior engineer in California.",
        "response": "Given California's strong public policy against non-compete agreements (Business and Professions Code § 16600), a traditional non-compete clause would likely be unenforceable. Instead, consider a narrowly tailored non-solicitation provision..."
    },
    {
        "instruction": "What is the statute of limitations for breach of contract in New York?",
        "response": "Under New York CPLR § 213(2), the statute of limitations for breach of contract is six years from the date of the breach..."
    },
]

def format_for_chat(example):
    return {
        "messages": [
            {"role": "system", "content": "You are an expert legal assistant specializing in contract law."},
            {"role": "user", "content": example["instruction"]},
            {"role": "assistant", "content": example["response"]},
        ]
    }

formatted = [format_for_chat(ex) for ex in raw_examples]

# Save as JSONL
with open("legal_train.jsonl", "w") as f:
    for item in formatted:
        f.write(json.dumps(item) + "\n")

# Load as Hugging Face Dataset
dataset = Dataset.from_list(formatted)
split = dataset.train_test_split(test_size=0.1, seed=42)
split.save_to_disk("./legal_dataset")
print(f"Train: {len(split['train'])}, Eval: {len(split['test'])}")
```

## Step 2: Fine-Tune with LoRA and Track with W&B

Raj uses LoRA for parameter-efficient fine-tuning — training only 0.06% of the model's parameters while getting excellent results. Every metric flows to W&B automatically.

```python
# finetune.py — LoRA fine-tuning of Llama 3.1 with W&B experiment tracking
import os
os.environ["WANDB_PROJECT"] = "legal-llm"

import torch
from transformers import (
    AutoModelForCausalLM, AutoTokenizer,
    TrainingArguments, Trainer,
)
from peft import LoraConfig, get_peft_model, TaskType
from datasets import load_from_disk
import wandb

wandb.init(
    project="legal-llm",
    name="llama-3.1-8b-legal-lora-v1",
    tags=["lora", "legal", "llama-3.1"],
)

model_name = "meta-llama/Llama-3.1-8B-Instruct"
tokenizer = AutoTokenizer.from_pretrained(model_name)
tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.bfloat16,
    device_map="auto",
    load_in_4bit=True,
)

# Configure LoRA
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# Load and tokenize dataset
dataset = load_from_disk("./legal_dataset")

def tokenize(example):
    text = tokenizer.apply_chat_template(example["messages"], tokenize=False)
    tokens = tokenizer(text, truncation=True, max_length=2048, padding="max_length")
    tokens["labels"] = tokens["input_ids"].copy()
    return tokens

tokenized = dataset.map(tokenize, remove_columns=["messages"])

# Training arguments
training_args = TrainingArguments(
    output_dir="./legal-llm-checkpoints",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    warmup_ratio=0.05,
    weight_decay=0.01,
    bf16=True,
    logging_steps=10,
    eval_strategy="steps",
    eval_steps=50,
    save_strategy="steps",
    save_steps=100,
    report_to="wandb",
    run_name="llama-legal-lora-v1",
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized["train"],
    eval_dataset=tokenized["test"],
)

trainer.train()

# Save the LoRA adapter
trainer.model.save_pretrained("./legal-llm-lora")
tokenizer.save_pretrained("./legal-llm-lora")

# Log the model as a W&B artifact
artifact = wandb.Artifact("legal-llm-lora", type="model")
artifact.add_dir("./legal-llm-lora")
wandb.log_artifact(artifact)
wandb.finish()
```

## Step 3: Evaluate and Compare in W&B

Before deploying, Raj compares his fine-tuned model against the base model on a legal benchmark.

```python
# evaluate.py — Compare base vs fine-tuned model on legal tasks
import wandb
from transformers import pipeline

wandb.init(project="legal-llm", name="evaluation", job_type="eval")

test_questions = [
    "What constitutes a material breach of contract?",
    "Explain the parol evidence rule.",
    "What are liquidated damages?",
]

# Evaluate base model
base_pipe = pipeline("text-generation", model="meta-llama/Llama-3.1-8B-Instruct", device_map="auto")

# Evaluate fine-tuned model
ft_pipe = pipeline("text-generation", model="./legal-llm-lora", device_map="auto")

table = wandb.Table(columns=["question", "base_answer", "finetuned_answer"])

for q in test_questions:
    base_out = base_pipe(q, max_new_tokens=200)[0]["generated_text"]
    ft_out = ft_pipe(q, max_new_tokens=200)[0]["generated_text"]
    table.add_data(q, base_out, ft_out)

wandb.log({"eval_comparison": table})
wandb.finish()
```

## Step 4: Merge LoRA and Deploy with vLLM

Happy with the results, Raj merges the LoRA adapter into the base model and deploys it with vLLM for high-throughput serving.

```python
# merge_and_export.py — Merge LoRA weights into the base model for deployment
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import torch

base_model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B-Instruct",
    torch_dtype=torch.bfloat16,
    device_map="auto",
)
model = PeftModel.from_pretrained(base_model, "./legal-llm-lora")

# Merge LoRA weights into base model
merged = model.merge_and_unload()
merged.save_pretrained("./legal-llm-merged")

tokenizer = AutoTokenizer.from_pretrained("./legal-llm-lora")
tokenizer.save_pretrained("./legal-llm-merged")
print("Merged model saved to ./legal-llm-merged")
```

```bash
# deploy.sh — Serve the merged model with vLLM
python -m vllm.entrypoints.openai.api_server \
    --model ./legal-llm-merged \
    --host 0.0.0.0 \
    --port 8000 \
    --max-model-len 4096 \
    --dtype bfloat16 \
    --gpu-memory-utilization 0.9
```

```python
# test_deployment.py — Test the deployed model using the OpenAI SDK
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="unused")

response = client.chat.completions.create(
    model="./legal-llm-merged",
    messages=[
        {"role": "system", "content": "You are an expert legal assistant."},
        {"role": "user", "content": "Draft an indemnification clause for a software vendor agreement."},
    ],
    max_tokens=500,
    temperature=0.3,
)

print(response.choices[0].message.content)
```

## What Raj Achieved

After two weeks of iteration tracked entirely in W&B:
- **3 LoRA experiments** compared side by side — different learning rates, ranks, and target modules
- **Legal accuracy improved 40%** over the base Llama model on their internal benchmark
- **vLLM serves 150 req/s** on a single A100, handling the entire legal team's workload
- **Model artifacts versioned** in W&B — easy to roll back if quality degrades
- **Total training cost**: ~$15 in GPU time (4-bit LoRA is remarkably efficient)
