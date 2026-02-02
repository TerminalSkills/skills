---
name: peft-fine-tuning
description: >-
  Parameter-efficient fine-tuning for LLMs using LoRA, QLoRA, and 25+ methods.
  Use when a user asks to fine-tune a language model, train a custom LLM,
  adapt a model to their data, use LoRA or QLoRA, fine-tune Llama or Mistral,
  or train a model on consumer GPUs. Covers PEFT methods for 7B-70B parameter
  models.
license: Apache-2.0
metadata:
  author: orchestra-research
  version: "1.0.0"
  category: data-ai
  tags: ["fine-tuning", "lora", "qlora", "peft", "llm"]
  use-cases:
    - "Fine-tune 7B-70B models on consumer GPUs with LoRA/QLoRA"
    - "Adapt foundation models to domain-specific tasks"
    - "Train custom instruction-following models with minimal compute"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# PEFT Fine-Tuning

## Overview

Fine-tune large language models efficiently using Parameter-Efficient Fine-Tuning (PEFT) methods. Train 7B to 70B parameter models on consumer GPUs (16-48 GB VRAM) using LoRA, QLoRA, and 25+ adapter methods from the Hugging Face PEFT library. Avoid the cost and hardware requirements of full fine-tuning while achieving comparable results.

## Instructions

When a user asks to fine-tune a model, determine the approach:

### Task A: Set up the environment

```bash
pip install torch transformers datasets peft accelerate bitsandbytes trl
# For Flash Attention 2 (recommended for speed)
pip install flash-attn --no-build-isolation
```

Verify GPU availability:
```python
import torch
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"GPU: {torch.cuda.get_device_name(0)}")
print(f"VRAM: {torch.cuda.get_device_properties(0).total_mem / 1e9:.1f} GB")
```

### Task B: Fine-tune with LoRA (16+ GB VRAM)

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from peft import LoraConfig, get_peft_model, TaskType
from datasets import load_dataset
from trl import SFTTrainer

# 1. Load base model
model_name = "meta-llama/Llama-3.1-8B"
tokenizer = AutoTokenizer.from_pretrained(model_name)
tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,
    device_map="auto",
    attn_implementation="flash_attention_2",
)

# 2. Configure LoRA
lora_config = LoraConfig(
    r=16,                          # Rank (8-64; higher = more capacity)
    lora_alpha=32,                 # Scaling factor (usually 2x rank)
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type=TaskType.CAUSAL_LM,
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# Output: trainable params: 13.6M || all params: 8.03B || 0.17%

# 3. Load and format dataset
dataset = load_dataset("your-dataset")

def format_prompt(example):
    return f"### Instruction:\n{example['instruction']}\n\n### Response:\n{example['output']}"

# 4. Train
training_args = TrainingArguments(
    output_dir="./lora-output",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    fp16=True,
    logging_steps=10,
    save_strategy="epoch",
    warmup_ratio=0.03,
    lr_scheduler_type="cosine",
)

trainer = SFTTrainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
    formatting_func=format_prompt,
    max_seq_length=2048,
)

trainer.train()
trainer.save_model("./lora-adapter")
```

### Task C: Fine-tune with QLoRA (8+ GB VRAM)

QLoRA quantizes the base model to 4-bit, dramatically reducing memory:

```python
from transformers import BitsAndBytesConfig

# 4-bit quantization config
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B",
    quantization_config=bnb_config,
    device_map="auto",
    attn_implementation="flash_attention_2",
)

# Apply LoRA on top of quantized model
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type=TaskType.CAUSAL_LM,
)

model = get_peft_model(model, lora_config)
# Now fine-tune with the same SFTTrainer setup from Task B
```

VRAM requirements with QLoRA:
- 7B model: ~6 GB
- 13B model: ~10 GB
- 70B model: ~36 GB

### Task D: Merge and export the fine-tuned model

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

# Load base model + adapter
base_model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B",
    torch_dtype=torch.float16,
    device_map="auto",
)
model = PeftModel.from_pretrained(base_model, "./lora-adapter")

# Merge adapter weights into base model
merged_model = model.merge_and_unload()
merged_model.save_pretrained("./merged-model")
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3.1-8B")
tokenizer.save_pretrained("./merged-model")

# Convert to GGUF for Ollama/llama.cpp
# pip install llama-cpp-python
# python -m llama_cpp.convert ./merged-model --outfile model.gguf
```

### Task E: Prepare a custom dataset

```python
from datasets import Dataset
import json

# Format: instruction-response pairs
data = [
    {"instruction": "Summarize this contract clause.", "input": "...", "output": "..."},
    {"instruction": "Extract the key dates.", "input": "...", "output": "..."},
]

# Create Hugging Face dataset
dataset = Dataset.from_list(data)
dataset = dataset.train_test_split(test_size=0.1)

# Or load from JSONL file
dataset = load_dataset("json", data_files="training_data.jsonl")
```

## Examples

### Example 1: Fine-tune Llama 3.1 8B for customer support

**User request:** "Fine-tune Llama 8B on our support ticket data"

```python
# Format support tickets as instruction pairs
def format_support(example):
    return (
        f"### Customer Query:\n{example['question']}\n\n"
        f"### Support Response:\n{example['answer']}"
    )

# Use QLoRA for 8GB VRAM GPUs
# Train for 3 epochs with lr=2e-4, rank=16
# Result: ~2 hours on RTX 4090, adapter size ~30 MB
```

### Example 2: Domain-adapt a model for medical text

**User request:** "Adapt Mistral 7B to understand medical terminology"

Use continued pre-training with LoRA on a medical corpus, then instruction-tune on medical QA pairs. Set `r=32` for higher capacity on specialized domains.

### Example 3: Fine-tune a 70B model with QLoRA on 2x A100

**User request:** "Fine-tune Llama 70B on our internal documents"

Use QLoRA with `device_map="auto"` to shard across GPUs. Set `per_device_train_batch_size=1` with `gradient_accumulation_steps=16`. Expect ~24 hours for 3 epochs on 10K samples.

## Guidelines

- Start with QLoRA if VRAM is limited; it matches LoRA quality in most benchmarks.
- Use rank `r=16` as a default. Increase to `r=32-64` for complex domain adaptation; decrease to `r=8` for simple style tuning.
- Always set `lora_alpha = 2 * r` as a starting point.
- Target all linear layers (`q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj`) for best results.
- Use a cosine learning rate scheduler with 3% warmup for stable training.
- Monitor training loss: it should decrease steadily. If it plateaus early, increase rank or learning rate.
- Evaluate on a held-out test set after each epoch to detect overfitting.
- Save checkpoints every epoch; adapter files are small (~30-100 MB).
- Clean, well-formatted training data matters more than quantity. 1,000 high-quality examples often beat 10,000 noisy ones.
