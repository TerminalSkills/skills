---
name: peft-fine-tuning
description: >-
  Parameter-efficient fine-tuning for LLMs using LoRA, QLoRA, and 25+ methods.
  Use when a user asks to fine-tune a language model, train a custom LLM,
  adapt a model to their data, use LoRA or QLoRA, fine-tune Llama or Mistral,
  or train a model on consumer GPUs. Covers PEFT methods for 7B-70B parameter
  models.
license: Apache-2.0
compatibility: "Python 3.10+, NVIDIA GPU with CUDA for training; peft 0.21, trl 1.x, transformers 5.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/huggingface/peft
  tags: "fine-tuning, lora, qlora, peft, llm"
  use-cases: "Fine-tune 7B-70B models on consumer GPUs with LoRA/QLoRA, Adapt foundation models to domain-specific tasks, Train custom instruction-following models with minimal compute"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# PEFT Fine-Tuning

## Overview

Fine-tune large language models efficiently using Parameter-Efficient Fine-Tuning (PEFT) methods. Train 7B to 70B parameter models on consumer GPUs (16-48 GB VRAM) using LoRA, QLoRA, and 25+ adapter methods from the Hugging Face PEFT library. Avoid the cost and hardware requirements of full fine-tuning while achieving comparable results. Written for transformers 5.x, TRL 1.x and PEFT 0.21: several arguments older tutorials use (`torch_dtype`, `warmup_ratio`, `max_seq_length` on the trainer) were renamed or moved.

## Instructions

When a user asks to fine-tune a model, determine the approach:

### Task A: Set up the environment

```bash
pip install torch transformers datasets peft accelerate trl
pip install bitsandbytes   # only for QLoRA; needs an NVIDIA GPU (also AMD/Intel builds exist)
hf auth login            # gated models such as Llama need accepted license + token
```

Verify GPU availability:
```python
import torch
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"GPU: {torch.cuda.get_device_name(0)}")
print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
```

Flash Attention is optional: the default `sdpa` attention is fast enough on recent PyTorch, and `flash-attn` needs a long compile.

### Task B: Fine-tune with LoRA (16+ GB VRAM)

TRL's `SFTTrainer` accepts a model name and a `peft_config`, so you do not wrap the model yourself:

```python
import torch
from datasets import load_dataset
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

model_name = "meta-llama/Llama-3.1-8B"   # gated: accept the license on Hugging Face first

# 1. Dataset in prompt-completion form (loss is computed on the completion only)
raw = load_dataset("json", data_files="support_tickets.jsonl", split="train")
dataset = raw.map(
    lambda ex: {
        "prompt": [{"role": "user", "content": ex["question"]}],
        "completion": [{"role": "assistant", "content": ex["answer"]}],
    },
    remove_columns=raw.column_names,
).train_test_split(test_size=0.05)

# 2. LoRA configuration
lora_config = LoraConfig(
    r=16,                        # rank (8-64; higher = more capacity)
    lora_alpha=32,               # scaling factor (start at 2x rank)
    target_modules="all-linear", # every linear layer except the output head
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)

# 3. Training arguments
args = SFTConfig(
    output_dir="./lora-output",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    bf16=True,                   # Ampere or newer; use fp16=True on older GPUs
    logging_steps=10,
    eval_strategy="epoch",
    save_strategy="epoch",
    warmup_steps=0.03,           # a float below 1 is a ratio (warmup_ratio was removed)
    lr_scheduler_type="cosine",
    max_length=2048,             # was max_seq_length
    gradient_checkpointing=True,
    model_init_kwargs={"dtype": torch.bfloat16},   # was torch_dtype
)

trainer = SFTTrainer(
    model=model_name,
    args=args,
    train_dataset=dataset["train"],
    eval_dataset=dataset["test"],
    peft_config=lora_config,
)
trainer.model.print_trainable_parameters()   # about 0.5-1% of the weights
trainer.train()
trainer.save_model("./lora-adapter")          # saves only the adapter (tens of MB)
```

SFTTrainer also accepts plain `{"text": ...}` rows and conversational `{"messages": [...]}` rows. Add `assistant_only_loss=True` to `SFTConfig` to train only on assistant turns of a conversational dataset. Pass `packing=True` to pack short examples together for speed.

### Task C: Fine-tune with QLoRA (8+ GB VRAM)

QLoRA loads the frozen base model in 4-bit and trains LoRA adapters on top. Reuse Task B and add a quantization config through `model_init_kwargs`:

```python
from transformers import BitsAndBytesConfig

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

args = SFTConfig(
    output_dir="./qlora-output",
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,
    learning_rate=2e-4,
    bf16=True,
    gradient_checkpointing=True,
    model_init_kwargs={"quantization_config": bnb_config, "dtype": torch.bfloat16, "device_map": "auto"},
)
# SFTTrainer(model=..., args=args, peft_config=lora_config, ...) exactly as in Task B
```

If you build the model yourself instead, call `peft.prepare_model_for_kbit_training(model)` before `get_peft_model`. Rough VRAM for weights plus training state at a short context: a 7-8B model fits in about 6-10 GB, 13B in about 12-16 GB, 70B in about 40-48 GB. Longer sequences and larger batches need more.

### Task D: Merge and export the fine-tuned model

Merge into a model loaded in 16-bit, not the 4-bit one:

```python
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

base_model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B", dtype=torch.bfloat16, device_map="auto"
)
model = PeftModel.from_pretrained(base_model, "./lora-adapter")
merged_model = model.merge_and_unload()
merged_model.save_pretrained("./merged-model")
AutoTokenizer.from_pretrained("meta-llama/Llama-3.1-8B").save_pretrained("./merged-model")
```

Convert to GGUF for Ollama or llama.cpp with the script in a llama.cpp checkout (the old `llama_cpp.convert` module does not exist):

```bash
python convert_hf_to_gguf.py ./merged-model --outfile model-q8_0.gguf --outtype q8_0
```

`convert_lora_to_gguf.py` converts the adapter alone if you prefer to keep it separate.

### Task E: Prepare a custom dataset

```python
from datasets import Dataset, load_dataset

tickets = [
    {"question": "Where can I download my March invoice?", "answer": "Open Billing > Invoices and choose March 2026."},
    {"question": "How do I reset two-factor authentication?", "answer": "Use the recovery codes, or ask an admin to reset 2FA for you."},
]
dataset = Dataset.from_list(tickets).train_test_split(test_size=0.1)

# Or load from a JSONL file with one object per line
dataset = load_dataset("json", data_files="training_data.jsonl", split="train")
```

Convert to `prompt`/`completion` (or `messages`) columns as in Task B. The tokenizer needs a chat template for conversational data; base models without one need `SFTConfig(chat_template_path=...)`.

## Examples

### Example 1: Fine-tune Llama 3.1 8B for customer support

**User request:** "Fine-tune Llama 8B on our support ticket data, I have a 12 GB GPU"

Use Task C (QLoRA) with `support_tickets.jsonl` mapped to prompt/completion. Settings: 3 epochs, `learning_rate=2e-4`, `r=16`, `max_length=1024`. Watch `eval_loss` after each epoch and keep the best checkpoint. Result: an adapter of tens of MB in `./lora-adapter`, loadable with `PeftModel.from_pretrained`. Training time depends on dataset size and GPU: measure on 200 steps before committing to a full run.

### Example 2: Domain-adapt a model for medical text

**User request:** "Adapt Mistral 7B to understand medical terminology"

Run continued pre-training with LoRA on a plain-text medical corpus (`{"text": ...}` rows, `r=32`), then instruction-tune on medical QA pairs with the Task B setup. Evaluate on held-out questions and compare with the base model before trusting answers; a fine-tune does not make clinical output reliable.

### Example 3: Fine-tune a 70B model with QLoRA on 2x A100 80 GB

**User request:** "Fine-tune Llama 70B on our internal documents"

Use QLoRA with `device_map="auto"` to shard the 4-bit weights across both GPUs. Set `per_device_train_batch_size=1`, `gradient_accumulation_steps=16`, `gradient_checkpointing=True`. Run one short job first to measure tokens per second and extrapolate the total time.

## Guidelines

- Start with QLoRA if VRAM is limited; published results show quality close to 16-bit LoRA, with slower steps from dequantization.
- Use rank `r=16` as a default. Increase to `r=32-64` for complex domain adaptation; decrease to `r=8` for simple style tuning.
- Start with `lora_alpha = 2 * r`; use `target_modules="all-linear"` unless you have a reason to limit it.
- LoRA tolerates a higher learning rate than full fine-tuning (1e-4 to 2e-4); lower it if loss spikes.
- Monitor training loss: it should decrease steadily. Evaluate on a held-out split every epoch to catch overfitting.
- On CPU-only machines TRL 1.x training failed in a test (its fused loss kernel is GPU-only); use a CUDA GPU or a hosted notebook.
- Pin library versions in a lockfile: transformers, TRL and PEFT change argument names between majors.
- Clean, well-formatted training data matters more than quantity. 1,000 high-quality examples often beat 10,000 noisy ones.
- Check the base model license before redistributing a merged model; adapters alone are usually easier to share.
