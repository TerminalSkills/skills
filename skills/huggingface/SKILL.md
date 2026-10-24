---
name: huggingface
description: |
  Hugging Face is the hub and Python libraries (transformers, datasets, peft, huggingface_hub) for downloading,
  running, fine-tuning and publishing machine-learning models. Use when the user asks to "load a model from
  Hugging Face", "run a transformers pipeline", "fine-tune BERT", "LoRA fine-tune an LLM", "push a model or
  dataset to the Hub", "download a model with hf", or "call the Inference API".
license: Apache-2.0
compatibility: 'Python 3.10+, transformers 5.x, huggingface_hub 1.x/2.x, PyTorch; Linux/macOS/Windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/huggingface/transformers
  tags:
    - nlp
    - transformers
    - deep-learning
    - model-hub
    - fine-tuning
---

# Hugging Face

## Overview

The Hugging Face Hub hosts models, datasets and Spaces. You work with it through `transformers` (models, tokenizers, `pipeline`, `Trainer`), `datasets`, `peft` (LoRA) and `huggingface_hub` (login, download/upload, `InferenceClient`). This skill targets transformers 5.x (Python 3.10+), where several v4 idioms were removed: `load_in_4bit`/`load_in_8bit` kwargs, the `question-answering`, `summarization` and `translation` pipelines (use a chat model with the `text-generation` pipeline instead), and `Trainer(tokenizer=...)` (now `processing_class=`). `torch_dtype=` still works but is deprecated in favour of `dtype=`.

## Instructions

### Install and authenticate

```bash
pip install torch transformers datasets accelerate peft huggingface_hub
hf auth login            # paste a token from https://huggingface.co/settings/tokens
hf auth whoami           # confirm which account is active
```

In CI or containers set `HF_TOKEN` in the environment instead of logging in. The old `huggingface-cli` command is gone from current `huggingface_hub`; use `hf`. Never print or commit the token. Gated models (Llama, Gemma, ...) need you to accept the licence on the model page first.

```bash
hf download Qwen/Qwen3-0.6B --local-dir ./models/qwen3-0.6b     # fetch a repo to disk
hf upload my-username/churn-classifier ./out .                   # push a folder to a model repo
```

### Pipelines (fastest path to inference)

```python
from transformers import pipeline

clf = pipeline("sentiment-analysis", model="distilbert/distilbert-base-uncased-finetuned-sst-2-english")
print(clf("The checkout flow is much faster now."))   # [{'label': 'POSITIVE', 'score': 0.99...}]

ner = pipeline("ner", aggregation_strategy="simple")  # replaces the old grouped_entities=True
print(ner("Hugging Face is based in New York City."))

# Instruction-tuned LLM: pass chat messages, read the last message of the reply
gen = pipeline("text-generation", model="Qwen/Qwen3-4B-Instruct-2507", dtype="auto", device_map="auto")
out = gen([{"role": "user", "content": "Explain transformers in one sentence."}], max_new_tokens=60)
print(out[0]["generated_text"][-1]["content"])
```

### Load a model and tokenizer yourself

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig

name = "Qwen/Qwen3-4B-Instruct-2507"
tokenizer = AutoTokenizer.from_pretrained(name)
model = AutoModelForCausalLM.from_pretrained(
    name,
    dtype=torch.bfloat16,                      # or "auto" to use the checkpoint's dtype
    device_map="auto",                         # needs accelerate; spreads layers over GPUs/CPU
    # 4-bit needs a CUDA GPU and bitsandbytes:
    # quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16),
)

messages = [{"role": "user", "content": "What is machine learning?"}]
inputs = tokenizer.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt", return_dict=True).to(model.device)
out = model.generate(**inputs, max_new_tokens=100, do_sample=True, temperature=0.7)
print(tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True))
```

### Tokenizers

```python
from transformers import AutoTokenizer

tok = AutoTokenizer.from_pretrained("google-bert/bert-base-uncased")
enc = tok("Hugging Face makes NLP easy!", return_tensors="pt", truncation=True, max_length=512)
print(tok.convert_ids_to_tokens(enc["input_ids"][0]), enc["input_ids"].shape[1])

batch = tok(["First sentence.", "Second, longer sentence here."], padding=True, truncation=True, return_tensors="pt")
```

### Fine-tune with Trainer

```python
import numpy as np
from datasets import load_dataset
from transformers import (AutoTokenizer, AutoModelForSequenceClassification,
                          DataCollatorWithPadding, Trainer, TrainingArguments)

name = "distilbert/distilbert-base-uncased"
tokenizer = AutoTokenizer.from_pretrained(name)
model = AutoModelForSequenceClassification.from_pretrained(name, num_labels=2)

ds = load_dataset("stanfordnlp/imdb")
ds = ds.map(lambda b: tokenizer(b["text"], truncation=True, max_length=256), batched=True)

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    return {"accuracy": float((np.argmax(logits, axis=-1) == labels).mean())}

args = TrainingArguments(
    output_dir="./results", num_train_epochs=3, learning_rate=2e-5, weight_decay=0.01,
    per_device_train_batch_size=16, per_device_eval_batch_size=64,
    eval_strategy="epoch", save_strategy="epoch", logging_steps=100,
    bf16=True,            # use fp16=True on GPUs without bfloat16; drop both on CPU
    report_to="none",
)
trainer = Trainer(
    model=model, args=args,
    train_dataset=ds["train"].shuffle(seed=42).select(range(5000)),
    eval_dataset=ds["test"].shuffle(seed=42).select(range(1000)),
    processing_class=tokenizer,                     # also gives dynamic padding via the default collator
    data_collator=DataCollatorWithPadding(tokenizer),
    compute_metrics=compute_metrics,
)
trainer.train()
print(trainer.evaluate())
```

### LoRA with PEFT

```python
import torch
from transformers import AutoModelForCausalLM
from peft import LoraConfig, get_peft_model, TaskType

model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen3-4B-Instruct-2507", dtype=torch.bfloat16, device_map="auto")
config = LoraConfig(task_type=TaskType.CAUSAL_LM, r=16, lora_alpha=32, lora_dropout=0.05,
                    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"])
model = get_peft_model(model, config)
model.print_trainable_parameters()      # a small fraction (well under 1%) of all parameters
```

Train the wrapped model with `Trainer` (or TRL's `SFTTrainer`), then `model.save_pretrained("./adapter")` saves only the adapter weights.

### Datasets

```python
from datasets import Dataset, load_dataset, load_from_disk

squad = load_dataset("rajpurkar/squad", split="train[:1000]")     # use the full "owner/name" id
stream = load_dataset("stanfordnlp/imdb", split="train", streaming=True)   # no full download

ds = Dataset.from_dict({"text": ["Refund arrived in two days", "App crashes on login"], "label": [1, 0]})
ds.save_to_disk("./support-tickets")
ds = load_from_disk("./support-tickets")
ds.push_to_hub("my-username/support-tickets", private=True)      # needs hf auth login / HF_TOKEN
```

Dataset loading scripts (`trust_remote_code`) are no longer supported; datasets must be stored as Parquet/CSV/JSON files.

### Publish a model

```python
repo = "my-username/imdb-distilbert"
trainer.model.push_to_hub(repo, private=True)
tokenizer.push_to_hub(repo, private=True)

from huggingface_hub import ModelCard
card = ModelCard("---\nlicense: apache-2.0\nlanguage: en\ndatasets:\n- stanfordnlp/imdb\n---\n# imdb-distilbert\n\nDistilBERT fine-tuned for sentiment on 5k IMDB reviews.\n")
card.push_to_hub(repo)
```

### Hosted inference (Inference Providers)

The old serverless "Inference API" is now Inference Providers: one client routes the call to a provider. Prefer chat completion for LLMs; availability depends on the model and provider, and usage is billed to your account.

```python
import os
from huggingface_hub import InferenceClient

client = InferenceClient(provider="auto", token=os.environ["HF_TOKEN"])
reply = client.chat_completion(
    model="Qwen/Qwen3-4B-Instruct-2507",
    messages=[{"role": "user", "content": "Write a one-line commit message for a typo fix."}],
    max_tokens=60,
)
print(reply.choices[0].message.content)

vectors = client.feature_extraction("Hello world", model="sentence-transformers/all-MiniLM-L6-v2")
```

## Examples

### Example 1: Classify support tickets locally

**User request:** "Tag these 2,000 support tickets as positive or negative without sending them to an API."

The agent installs `torch transformers`, builds `pipeline("sentiment-analysis", model="distilbert/distilbert-base-uncased-finetuned-sst-2-english", device_map="auto")`, passes the ticket texts as a list with `batch_size=32, truncation=True`, and writes the `label` and `score` of each result to a CSV. The first run downloads about 270 MB of weights into `~/.cache/huggingface`; later runs work offline.

### Example 2: Fine-tune and publish a small classifier

**User request:** "Fine-tune DistilBERT on IMDB and push it to my account as a private model."

The agent runs `hf auth login`, executes the Trainer script above (3 epochs on a 5,000-review subset), checks that `trainer.evaluate()` reports an accuracy near 0.9, then calls `push_to_hub("my-username/imdb-distilbert", private=True)` for the model and the tokenizer and writes a model card. The result is a private repo containing `model.safetensors`, `config.json` and the tokenizer files.

## Guidelines

- Pin versions in production (`transformers==5.20.*`); v4 code that uses `load_in_4bit=`, `Trainer(tokenizer=)`, `grouped_entities=` or the removed pipelines breaks or warns on v5.
- Read the model card before use: licence, gating, chat template, and required `transformers` version. Do not set `trust_remote_code=True` unless you have read the repository code, since it runs that code on your machine.
- Prefer `safetensors` weights; never load pickle-based `.bin`/`.pt` files from untrusted repos.
- Keep tokens in `HF_TOKEN` or the `hf auth login` store; use fine-grained, read-only tokens for downloads and write tokens only for pushing.
- Large models need the right hardware: a 4B model in bf16 needs roughly 8 GB of GPU memory, a 7B model about 15 GB; quantization (bitsandbytes) requires CUDA.
- Set `HF_HOME` to a disk with space; the cache can grow to tens of gigabytes.
- For production serving use Inference Endpoints, TGI or vLLM rather than a `pipeline` in a request handler.
